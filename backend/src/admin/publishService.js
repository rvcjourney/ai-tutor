const { pool } = require('../db');
const conversationLoader = require('../engine/conversationLoader');

/** Writes each topic's conversation file + upserts it into modules-registry.json and
 *  MAIN_MENU's options, then swaps the live in-memory cache to match. Validates the
 *  *entire* resulting file set (not just what changed) before writing anything —
 *  a bad row that slipped past csvImporter's checks, a duplicate state id colliding
 *  with an unrelated topic, etc. throws before a single statement runs, and the DB
 *  writes that do happen are wrapped in one transaction so a mid-write failure can
 *  never leave the database half-updated. Either way, a bad publish can never leave
 *  the app broken. */
async function publish(topicPlans) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const allRows = await client.query('SELECT filename, content FROM conversation_files');
    const filesByName = new Map(allRows.rows.map((r) => [r.filename, r.content]));

    const registry = filesByName.get('modules-registry.json');
    if (!registry) {
      throw Object.assign(new Error('modules-registry.json not found — database not seeded correctly'), { statusCode: 500 });
    }
    for (const plan of topicPlans) {
      const idx = registry.modules.findIndex((m) => m.id === plan.moduleId);
      if (idx >= 0) {
        registry.modules[idx] = { ...registry.modules[idx], ...plan.registryEntry };
      } else {
        registry.modules.push(plan.registryEntry);
      }
    }

    const main = filesByName.get('main.json');
    if (!main) {
      throw Object.assign(new Error('main.json not found — database not seeded correctly'), { statusCode: 500 });
    }
    const mainMenu = main.states.find((s) => s.id === 'MAIN_MENU');
    if (!mainMenu) {
      throw new Error('main.json has no MAIN_MENU state — cannot register new topics');
    }
    for (const plan of topicPlans) {
      const idx = mainMenu.options.findIndex((o) => o.id === plan.moduleId);
      if (idx >= 0) {
        mainMenu.options[idx] = plan.mainMenuOption;
      } else {
        mainMenu.options.push(plan.mainMenuOption);
      }
    }

    filesByName.set('modules-registry.json', registry);
    filesByName.set('main.json', main);
    for (const plan of topicPlans) {
      filesByName.set(plan.moduleFileName, { states: plan.states });
    }

    // Validate the full resulting set — including every topic NOT touched by this
    // publish — before writing anything at all.
    const candidateFiles = [...filesByName.entries()].map(([filename, content]) => ({ filename, content }));
    const candidateCache = conversationLoader.buildCache(candidateFiles);

    const toWrite = [
      ['modules-registry.json', registry],
      ['main.json', main],
      ...topicPlans.map((p) => [p.moduleFileName, { states: p.states }]),
    ];
    for (const [filename, content] of toWrite) {
      await client.query(
        `INSERT INTO conversation_files (filename, content) VALUES ($1, $2::jsonb)
         ON CONFLICT (filename) DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()`,
        [filename, content]
      );
    }

    await client.query('COMMIT');
    conversationLoader.setCache(candidateCache);

    return topicPlans.map((p) => {
      const menuState = p.states.find((s) => s.id === p.entryState);
      return {
        moduleId: p.moduleId,
        title: p.title,
        subTopicCount: menuState ? menuState.options.length : 0,
        stateCount: p.states.length,
      };
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw Object.assign(err instanceof Error ? err : new Error(String(err)), { statusCode: err.statusCode || 400 });
  } finally {
    client.release();
  }
}

/** Removes a topic entirely: deletes its conversation file, drops its entry from
 *  modules-registry.json, and drops its option from MAIN_MENU. Same
 *  validate-the-whole-set-before-writing-anything safety as publish() — if the
 *  resulting graph would be invalid (shouldn't happen, but e.g. some other topic
 *  secretly depended on a state in this one), nothing is written and the error is
 *  surfaced instead of leaving the app half-broken. */
async function removeTopic(moduleId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const allRows = await client.query('SELECT filename, content FROM conversation_files');
    const filesByName = new Map(allRows.rows.map((r) => [r.filename, r.content]));

    const registry = filesByName.get('modules-registry.json');
    const entry = registry?.modules.find((m) => m.id === moduleId);
    if (!entry) {
      throw Object.assign(new Error(`No topic with id "${moduleId}"`), { statusCode: 404 });
    }

    const moduleFileName = `${moduleId.replace(/_/g, '-')}.json`;
    registry.modules = registry.modules.filter((m) => m.id !== moduleId);

    const main = filesByName.get('main.json');
    const mainMenu = main?.states.find((s) => s.id === 'MAIN_MENU');
    if (mainMenu) {
      mainMenu.options = mainMenu.options.filter((o) => o.id !== moduleId);
    }

    filesByName.set('modules-registry.json', registry);
    filesByName.set('main.json', main);
    filesByName.delete(moduleFileName);

    const candidateFiles = [...filesByName.entries()].map(([filename, content]) => ({ filename, content }));
    const candidateCache = conversationLoader.buildCache(candidateFiles);

    await client.query('DELETE FROM conversation_files WHERE filename = $1', [moduleFileName]);
    await client.query('UPDATE conversation_files SET content = $2::jsonb, updated_at = NOW() WHERE filename = $1', [
      'modules-registry.json',
      registry,
    ]);
    await client.query('UPDATE conversation_files SET content = $2::jsonb, updated_at = NOW() WHERE filename = $1', [
      'main.json',
      main,
    ]);

    await client.query('COMMIT');
    conversationLoader.setCache(candidateCache);

    return { moduleId, title: entry.title };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw Object.assign(err instanceof Error ? err : new Error(String(err)), { statusCode: err.statusCode || 400 });
  } finally {
    client.release();
  }
}

module.exports = { publish, removeTopic };
