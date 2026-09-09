const fs = require('fs');
const path = require('path');
const { query } = require('../db');

const SEED_DIR = path.join(__dirname, '..', 'conversations-seed');

// Ids the engine synthesizes at runtime (per-module reinforcement quiz, "back to
// topic menu") rather than defining as static states — exempt from reference validation.
const RESERVED_STATE_IDS = new Set(['ND_WELCOME', 'ND_QUIZ', '__MODULE_ENTRY__']);

// The live, in-memory cache every synchronous read (getState/getModulesRegistry/
// getAllStates) serves from — deliberately kept synchronous even though the data
// now lives in Postgres, so the large majority of the FSM engine (resolveNode,
// resolveChain, and everything built on them) never needed to become async just
// because storage moved. Only the things that *populate* this cache — loadAll at
// boot, and publishService after a successful publish — touch the database.
let statesById = new Map();
let modulesRegistry = [];

function validateReferences(candidateStatesById) {
  for (const state of candidateStatesById.values()) {
    if (state.next && !RESERVED_STATE_IDS.has(state.next) && !candidateStatesById.has(state.next)) {
      throw new Error(`State "${state.id}" has dangling "next" reference: "${state.next}"`);
    }
    // "menu" options always carry their own "next"; "mcq" answer-choice options don't
    // (graded against the state's top-level "next"/"correctOptionId" instead), but an
    // "mcq" option flagged "navigate" (e.g. a Back/Main Menu button mixed into the
    // choices) does carry its own "next" and needs the same dangling-reference check.
    if (Array.isArray(state.options)) {
      for (const option of state.options) {
        if (!('next' in option)) continue;
        if (!RESERVED_STATE_IDS.has(option.next) && !candidateStatesById.has(option.next)) {
          throw new Error(`State "${state.id}" option "${option.id}" has dangling "next" reference: "${option.next}"`);
        }
      }
    }
    if (state.type === 'quiz') {
      if (!state.quiz) {
        throw new Error(`Quiz state "${state.id}" is missing "quiz" config`);
      }
      for (const key of ['onCorrect', 'onIncorrect', 'onExhausted']) {
        const target = state.quiz[key];
        if (!RESERVED_STATE_IDS.has(target) && !candidateStatesById.has(target)) {
          throw new Error(`Quiz state "${state.id}" has dangling "quiz.${key}" reference: "${target}"`);
        }
      }
    }
    if (state.type === 'mcq') {
      // state.next is already checked by the generic "next" validation above.
      if (!Array.isArray(state.options) || state.options.length === 0) {
        throw new Error(`MCQ state "${state.id}" has no options`);
      }
      if (!state.options.some((o) => o.id === state.correctOptionId)) {
        throw new Error(`MCQ state "${state.id}" has "correctOptionId" ("${state.correctOptionId}") that doesn't match any option id`);
      }
    }
  }
}

/** Pure: given the rows a set of conversation files would resolve to (each
 *  `{filename, content}`, `content` already-parsed JSON), builds and validates the
 *  {statesById, modulesRegistry} shape without touching the live cache — throws on
 *  any dangling reference / duplicate id / malformed file, same checks as before.
 *  Used both for the real boot load and by publishService to validate a
 *  prospective publish before it's committed to the database. */
function buildCache(files) {
  const candidateStatesById = new Map();
  let candidateModulesRegistry = [];

  for (const { filename, content } of files) {
    if (Array.isArray(content.states)) {
      for (const state of content.states) {
        if (!state.id) {
          throw new Error(`State missing "id" in ${filename}`);
        }
        if (candidateStatesById.has(state.id)) {
          throw new Error(`Duplicate state id "${state.id}" found in ${filename} (already defined elsewhere)`);
        }
        candidateStatesById.set(state.id, state);
      }
    } else if (Array.isArray(content.modules)) {
      candidateModulesRegistry = content.modules;
    } else {
      throw new Error(`Conversation file ${filename} has neither "states" nor "modules" — unrecognized shape`);
    }
  }

  validateReferences(candidateStatesById);
  return { statesById: candidateStatesById, modulesRegistry: candidateModulesRegistry };
}

/** Swaps the live cache to an already-built-and-validated candidate (from
 *  buildCache). Never throws — call it only after you know the candidate is
 *  valid (buildCache already would have thrown otherwise). */
function setCache(cache) {
  statesById = cache.statesById;
  modulesRegistry = cache.modulesRegistry;
}

// A truly fresh database (first boot against a brand-new Postgres, or a host with
// no persistent volume yet) has no conversation_files rows at all — seed it from
// the tracked baseline (app chassis: WELCOME/MAIN_MENU/EXPLAIN_FURTHER, zero
// topics) so the app boots instead of crashing on an empty cache. Only runs when
// the table is genuinely empty, so it can never overwrite real published content.
async function seedIfEmpty() {
  const seedFilenames = fs.readdirSync(SEED_DIR).filter((f) => f.endsWith('.json'));
  const files = [];
  for (const filename of seedFilenames) {
    const content = JSON.parse(fs.readFileSync(path.join(SEED_DIR, filename), 'utf8'));
    await query('INSERT INTO conversation_files (filename, content) VALUES ($1, $2::jsonb) ON CONFLICT (filename) DO NOTHING', [
      filename,
      content,
    ]);
    files.push({ filename, content });
  }
  return files;
}

/** Full refresh from the database — used at boot. publishService does NOT call
 *  this after a publish (that would mean a redundant read-after-write); it
 *  builds + validates the candidate itself and calls setCache() directly once
 *  its transaction commits. */
async function loadAll() {
  const result = await query('SELECT filename, content FROM conversation_files');
  const files = result.rows.length > 0 ? result.rows : await seedIfEmpty();
  setCache(buildCache(files));
}

function getState(id) {
  const state = statesById.get(id);
  if (!state) {
    throw new Error(`Unknown conversation state: "${id}"`);
  }
  return state;
}

function getModulesRegistry() {
  return modulesRegistry;
}

function getAllStates() {
  return Array.from(statesById.values());
}

module.exports = {
  getState,
  getModulesRegistry,
  getAllStates,
  loadAll,
  reload: loadAll,
  buildCache,
  setCache,
  RESERVED_STATE_IDS,
};
