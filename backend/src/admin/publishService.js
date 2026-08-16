const fs = require('fs');
const path = require('path');
const conversationLoader = require('../engine/conversationLoader');

const CONVERSATIONS_DIR = path.join(__dirname, '..', 'conversations');
const MAIN_FILE = path.join(CONVERSATIONS_DIR, 'main.json');
const REGISTRY_FILE = path.join(CONVERSATIONS_DIR, 'modules-registry.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/** Writes each topic's conversation file + upserts it into modules-registry.json and
 *  MAIN_MENU's options, then reloads the live engine (which re-validates from disk).
 *  If anything fails — a bad row that slipped past csvImporter's checks, a duplicate
 *  state id colliding with an unrelated topic, etc. — every touched file is restored
 *  to what it was before this call, so a bad publish can never leave the app broken. */
function publish(topicPlans) {
  const touchedFiles = new Set([MAIN_FILE, REGISTRY_FILE]);
  for (const plan of topicPlans) {
    touchedFiles.add(path.join(CONVERSATIONS_DIR, plan.moduleFileName));
  }

  const backups = new Map();
  for (const filePath of touchedFiles) {
    backups.set(filePath, fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null);
  }

  try {
    for (const plan of topicPlans) {
      writeJson(path.join(CONVERSATIONS_DIR, plan.moduleFileName), { states: plan.states });
    }

    const registry = readJson(REGISTRY_FILE);
    for (const plan of topicPlans) {
      const idx = registry.modules.findIndex((m) => m.id === plan.moduleId);
      if (idx >= 0) {
        registry.modules[idx] = { ...registry.modules[idx], ...plan.registryEntry };
      } else {
        registry.modules.push(plan.registryEntry);
      }
    }
    writeJson(REGISTRY_FILE, registry);

    const main = readJson(MAIN_FILE);
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
    writeJson(MAIN_FILE, main);

    conversationLoader.reload();

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
    for (const [filePath, original] of backups) {
      if (original === null) {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } else {
        fs.writeFileSync(filePath, original, 'utf8');
      }
    }
    try {
      conversationLoader.reload();
    } catch (reloadErr) {
      throw Object.assign(
        new Error(`Publish failed AND rollback failed to reload — this should never happen: ${err.message}; reload error: ${reloadErr.message}`),
        { statusCode: 500 }
      );
    }
    throw Object.assign(err instanceof Error ? err : new Error(String(err)), { statusCode: err.statusCode || 400 });
  }
}

/** Removes a topic entirely: deletes its conversation file, drops its entry from
 *  modules-registry.json, and drops its option from MAIN_MENU. Same backup/rollback
 *  safety as publish() — if the resulting graph fails to reload (shouldn't happen,
 *  but e.g. some other topic secretly depended on a state in this one), everything
 *  is restored and the error is surfaced instead of leaving the app half-broken. */
function removeTopic(moduleId) {
  const registry = readJson(REGISTRY_FILE);
  const entry = registry.modules.find((m) => m.id === moduleId);
  if (!entry) {
    throw Object.assign(new Error(`No topic with id "${moduleId}"`), { statusCode: 404 });
  }

  const moduleFile = path.join(CONVERSATIONS_DIR, `${moduleId.replace(/_/g, '-')}.json`);
  const touchedFiles = new Set([MAIN_FILE, REGISTRY_FILE, moduleFile]);

  const backups = new Map();
  for (const filePath of touchedFiles) {
    backups.set(filePath, fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null);
  }

  try {
    if (fs.existsSync(moduleFile)) fs.unlinkSync(moduleFile);

    registry.modules = registry.modules.filter((m) => m.id !== moduleId);
    writeJson(REGISTRY_FILE, registry);

    const main = readJson(MAIN_FILE);
    const mainMenu = main.states.find((s) => s.id === 'MAIN_MENU');
    if (mainMenu) {
      mainMenu.options = mainMenu.options.filter((o) => o.id !== moduleId);
    }
    writeJson(MAIN_FILE, main);

    conversationLoader.reload();

    return { moduleId, title: entry.title };
  } catch (err) {
    for (const [filePath, original] of backups) {
      if (original === null) {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } else {
        fs.writeFileSync(filePath, original, 'utf8');
      }
    }
    try {
      conversationLoader.reload();
    } catch (reloadErr) {
      throw Object.assign(
        new Error(`Delete failed AND rollback failed to reload — this should never happen: ${err.message}; reload error: ${reloadErr.message}`),
        { statusCode: 500 }
      );
    }
    throw Object.assign(err instanceof Error ? err : new Error(String(err)), { statusCode: err.statusCode || 400 });
  }
}

module.exports = { publish, removeTopic };
