const fs = require('fs');
const path = require('path');

const CONVERSATIONS_DIR = path.join(__dirname, '..', 'conversations');

// Ids the engine synthesizes at runtime (per-module reinforcement quiz, "back to
// topic menu") rather than defining as static states — exempt from reference validation.
const RESERVED_STATE_IDS = new Set(['ND_WELCOME', 'ND_QUIZ', '__MODULE_ENTRY__']);

const statesById = new Map();
let modulesRegistry = [];

function loadStateGraphFile(filePath, parsed) {
  for (const state of parsed.states) {
    if (!state.id) {
      throw new Error(`State missing "id" in ${filePath}`);
    }
    if (statesById.has(state.id)) {
      throw new Error(`Duplicate state id "${state.id}" found in ${filePath} (already defined elsewhere)`);
    }
    statesById.set(state.id, state);
  }
}

function validateReferences() {
  for (const state of statesById.values()) {
    if (state.next && !RESERVED_STATE_IDS.has(state.next) && !statesById.has(state.next)) {
      throw new Error(`State "${state.id}" has dangling "next" reference: "${state.next}"`);
    }
    if (Array.isArray(state.options)) {
      for (const option of state.options) {
        if (!RESERVED_STATE_IDS.has(option.next) && !statesById.has(option.next)) {
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
        if (!RESERVED_STATE_IDS.has(target) && !statesById.has(target)) {
          throw new Error(`Quiz state "${state.id}" has dangling "quiz.${key}" reference: "${target}"`);
        }
      }
    }
  }
}

function loadAll() {
  statesById.clear();
  modulesRegistry = [];

  const files = fs.readdirSync(CONVERSATIONS_DIR).filter((f) => f.endsWith('.json'));
  for (const file of files) {
    const filePath = path.join(CONVERSATIONS_DIR, file);
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (Array.isArray(parsed.states)) {
      loadStateGraphFile(filePath, parsed);
    } else if (Array.isArray(parsed.modules)) {
      modulesRegistry = parsed.modules;
    } else {
      throw new Error(`Conversation file ${filePath} has neither "states" nor "modules" — unrecognized shape`);
    }
  }

  validateReferences();
}

loadAll();

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

module.exports = { getState, getModulesRegistry, reload: loadAll, RESERVED_STATE_IDS };
