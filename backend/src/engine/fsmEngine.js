const { getState, getModulesRegistry, getAllStates } = require('./conversationLoader');
const userRepository = require('../repositories/userRepository');
const progressRepository = require('../repositories/progressRepository');
const quizAttemptRepository = require('../repositories/quizAttemptRepository');
const subTopicProgressRepository = require('../repositories/subTopicProgressRepository');
const subTopicItemProgressRepository = require('../repositories/subTopicItemProgressRepository');

const INPUT_TYPE_BY_STATE_TYPE = {
  menu: 'options',
  mcq: 'options',
  quiz: 'text',
  input: 'text',
  exit: 'none',
};

function getReinforcementQuiz(moduleId) {
  if (!moduleId) return null;
  const module = getModulesRegistry().find((m) => m.id === moduleId);
  return module?.reinforcementQuiz || null;
}

function getModuleEntryState(moduleId) {
  if (!moduleId) return null;
  const module = getModulesRegistry().find((m) => m.id === moduleId);
  return module?.entryState || null;
}

function buildGreeting(displayName, clientHour) {
  const hour = Number.isInteger(clientHour) ? clientHour : new Date().getHours();
  const timeOfDay = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';
  const namePart = displayName ? `, ${displayName}` : '';
  // Deliberately just the greeting — MAIN_MENU's own message already asks
  // "what support do you need," so tacking a second question on here just
  // produced a redundant run-on ("...today? Welcome, what support...").
  return `Good ${timeOfDay}${namePart}!`;
}

function buildNdWelcomeNode(moduleId, quiz) {
  return { id: 'ND_WELCOME', type: 'input', module: moduleId, message: quiz.welcomeMessage, next: 'ND_QUIZ' };
}

function buildNdQuizNode(moduleId, quiz) {
  return {
    id: 'ND_QUIZ',
    type: 'quiz',
    module: moduleId,
    message: quiz.question,
    quiz: {
      keywords: quiz.keywords,
      minMatches: quiz.minMatches,
      maxAttempts: quiz.maxAttempts,
      onCorrect: 'MAIN_MENU',
      onIncorrect: 'ND_QUIZ',
      onExhausted: 'MAIN_MENU',
      incorrectMessage: quiz.incorrectMessage,
      exhaustedMessage: quiz.exhaustedMessage,
      correctMessage: quiz.correctMessage,
    },
  };
}

/** Resolves a state id to a node. A few ids are reserved and synthesized at runtime
 *  instead of living in the static conversation JSON:
 *  - "ND_WELCOME"/"ND_QUIZ": per-module next-day reinforcement quiz, built from that
 *    module's `reinforcementQuiz` config, so every module gets one without its own states.
 *  - "__MODULE_ENTRY__": redirects to whichever module the learner is currently in
 *    (its `entryState`), used for a generic "back to topic menu" option. */
function resolveNode(id, moduleId) {
  if (id === 'ND_WELCOME' || id === 'ND_QUIZ') {
    const quiz = getReinforcementQuiz(moduleId);
    if (!quiz) {
      throw Object.assign(new Error(`No reinforcement quiz configured for module "${moduleId}"`), {
        statusCode: 500,
      });
    }
    return id === 'ND_WELCOME' ? buildNdWelcomeNode(moduleId, quiz) : buildNdQuizNode(moduleId, quiz);
  }
  if (id === '__MODULE_ENTRY__') {
    const entryState = getModuleEntryState(moduleId);
    if (!entryState) {
      throw Object.assign(new Error(`No module entry state found for module "${moduleId}"`), { statusCode: 500 });
    }
    return resolveNode(entryState, moduleId);
  }
  return getState(id);
}

/** Follows "auto" states forward, collecting their messages, until landing on a
 *  state that requires learner input (menu/quiz/mcq/input) or a terminal state (exit).
 *  Threads both moduleId and subTopicId forward the same way — each carries over from
 *  the last state that tagged one, so shared states like EXPLAIN_FURTHER (untagged)
 *  still know which module/sub-topic the learner is actually in. */
function resolveChain(startId, moduleIdHint = null, subTopicIdHint = null) {
  const messages = [];
  let node = resolveNode(startId, moduleIdHint);
  let moduleId = node.module || moduleIdHint || null;
  let subTopicId = node.subTopic || subTopicIdHint || null;

  while (node.type === 'auto') {
    messages.push(node.message);
    node = resolveNode(node.next, moduleId);
    moduleId = node.module || moduleId;
    subTopicId = node.subTopic || subTopicId;
  }
  messages.push(node.message);
  moduleId = node.module || moduleId;
  subTopicId = node.subTopic || subTopicId;

  return { node, message: messages.join('\n\n'), moduleId, subTopicId };
}

const OPTIONS_VARIANT_BY_STATE_TYPE = { mcq: 'mcq', menu: 'menu' };

function buildResponse(node, message, feedback = null) {
  // Fact screens are technically "menu" states (a single Next choice plus Back/Menu),
  // but they get their own "qa" variant so the UI can give the primary action real
  // visual weight instead of three equal-looking pill buttons.
  const optionsVariant = node.screenType === 'fact' ? 'qa' : OPTIONS_VARIANT_BY_STATE_TYPE[node.type] || null;

  return {
    state: node.id,
    message,
    options: Array.isArray(node.options) ? node.options.map((o) => ({ id: o.id, label: o.label })) : [],
    inputType: INPUT_TYPE_BY_STATE_TYPE[node.type] || 'none',
    optionsVariant,
    // Set only on a topic's own sub-topic-selection menu (the state csvImporter.js
    // tags with `module` — every other shared/untagged state leaves this null) — lets
    // the UI recognize "this is a module's menu" and render sub-topic progress tiles.
    moduleId: node.module || null,
    // Set on any state within a sub-topic (fact/MCQ states) — lets the UI fetch that
    // sub-topic's full Q&A list for the two-pane explorer.
    subTopicId: node.subTopic || null,
    // 'question' | 'answer' | null — which half of a Q&A pair this is, so the UI can
    // style/animate the reveal distinctly (icon, accent, "flip" transition).
    screenType: node.screenType || null,
    // 'correct' | 'incorrect' | null — lets the UI show a real correct/wrong signal
    // instead of the client having to guess by pattern-matching the message text.
    feedback,
  };
}

function isNewCalendarDay(updatedAtSql) {
  const todayUtc = new Date().toISOString().slice(0, 10);
  const updatedDate = updatedAtSql.slice(0, 10);
  return updatedDate !== todayUtc;
}

// Content state ids are always "{prefix}_Q{n}" or "{prefix}_MCQ{n}" (see
// csvImporter.js's buildStatesForSubTopic) — Qs numbered first, then MCQs — so a
// 1-based "how far into this sub-topic" position can be read straight off the id
// without needing to walk the state graph.
function computeItemPosition(node) {
  if (!node.subTopic) return null;
  const match = /_(Q|MCQ)(\d+)$/.exec(node.id);
  if (!match) return null;
  const [, kind, numStr] = match;
  const num = parseInt(numStr, 10);
  if (kind === 'Q') return num;
  const qCount = getAllStates().filter((s) => s.module === node.module && s.subTopic === node.subTopic && s.screenType === 'fact').length;
  return qCount + num;
}

/** Persists where the learner landed, and — the actual completion trigger — if they
 *  landed on EXPLAIN_FURTHER (the shared end-of-lesson state every sub-topic chains
 *  into) with a known module+sub-topic, records that sub-topic as done. Centralizing
 *  this here means every call site gets completion-tracking for free. Also records
 *  the furthest Q/MCQ item reached, so a sub-topic still in progress can show a real
 *  "6 of 15 covered" figure instead of just done/not-done. */
function persistProgress(userId, node, moduleId, subTopicId) {
  const status = node.type === 'exit' ? 'completed' : 'in_progress';
  progressRepository.upsert(userId, {
    currentState: node.id,
    lastCompletedState: node.type === 'exit' ? node.id : null,
    moduleId,
    subTopicId,
    status,
  });
  if (node.id === 'EXPLAIN_FURTHER' && moduleId && subTopicId) {
    subTopicProgressRepository.markComplete(userId, moduleId, subTopicId);
  } else if (moduleId && subTopicId) {
    const itemsSeen = computeItemPosition(node);
    if (itemsSeen !== null) {
      subTopicItemProgressRepository.recordProgress(userId, moduleId, subTopicId, itemsSeen);
    }
  }
}

/** A learner's saved position (current_state/module_id) can go stale if an admin
 *  deletes or renames the topic they were in — the state they were pointing at
 *  simply doesn't exist anymore. Rather than let that surface as a raw "unknown
 *  state" error with no way out (the old behavior — "Retry" just failed the same
 *  way every time), land them back on the main menu, which always exists. */
function recoverToMainMenu(userId) {
  const { node, message, moduleId, subTopicId } = resolveChain('MAIN_MENU', null, null);
  persistProgress(userId, node, moduleId, subTopicId);
  return buildResponse(node, message);
}

function startSession(externalUserId, { simulateNextDay = false, displayName, clientHour } = {}) {
  const user = userRepository.findOrCreateByExternalId(externalUserId);
  if (displayName) {
    userRepository.setDisplayName(user.id, displayName);
  }
  const effectiveName = displayName || user.display_name || null;

  const progress = progressRepository.get(user.id);

  let entryStateId = 'WELCOME';
  let moduleIdHint = null;
  let subTopicIdHint = null;
  if (progress) {
    const returningNextDay = simulateNextDay || isNewCalendarDay(progress.updated_at);
    if (progress.status === 'completed' && returningNextDay && getReinforcementQuiz(progress.module_id)) {
      entryStateId = 'ND_WELCOME';
      moduleIdHint = progress.module_id;
    } else if (progress.status === 'in_progress' && progress.current_state !== 'MAIN_MENU') {
      // Resume exactly where they left off (mid-question/quiz, an input-awaiting
      // state) — no greeting here, they're genuinely mid-conversation, not
      // "starting" a fresh interaction.
      try {
        const node = resolveNode(progress.current_state, progress.module_id);
        return buildResponse(node, node.message);
      } catch {
        return recoverToMainMenu(user.id);
      }
    }
    // Sitting at MAIN_MENU already (idle, not mid-conversation), or completed
    // (same day, or that module has no reinforcement quiz configured) => re-greet
    // from WELCOME (falls through) — every time the app is opened, not just once.
  }

  if (entryStateId === 'WELCOME') {
    // Dynamic "Good Morning {name}" replaces WELCOME's static JSON message — skip
    // straight to MAIN_MENU and prepend the computed greeting instead.
    const greeting = buildGreeting(effectiveName, clientHour);
    const { node, message, moduleId, subTopicId } = resolveChain('MAIN_MENU', moduleIdHint, subTopicIdHint);
    persistProgress(user.id, node, moduleId, subTopicId);
    return buildResponse(node, `${greeting}\n\n${message}`);
  }

  const { node, message, moduleId, subTopicId } = resolveChain(entryStateId, moduleIdHint, subTopicIdHint);
  persistProgress(user.id, node, moduleId, subTopicId);
  return buildResponse(node, message);
}

function handleMessage(externalUserId, input) {
  const user = userRepository.findOrCreateByExternalId(externalUserId);
  const progress = progressRepository.get(user.id);
  if (!progress) {
    throw Object.assign(new Error('No active session — call /chat/start first.'), { statusCode: 400 });
  }

  let currentNode;
  try {
    currentNode = resolveNode(progress.current_state, progress.module_id);
  } catch {
    // Same stale-reference case as startSession — the topic they were mid-message
    // in got deleted/renamed out from under them. Recover instead of erroring.
    return recoverToMainMenu(user.id);
  }
  const trimmedInput = typeof input === 'string' ? input.trim() : '';

  // Global navigation shortcuts — the UI's persistent "Back to Topic Menu"/"Main
  // Menu" controls need to work from literally any screen, including list screens
  // (main menu, sub-topic menu) that have no such option of their own. Checked
  // before the type-specific option matching below, so this always wins over
  // whatever the current state's own options happen to be.
  if (trimmedInput === 'menu') {
    const { node, message, moduleId, subTopicId } = resolveChain('MAIN_MENU', progress.module_id, progress.sub_topic_id);
    persistProgress(user.id, node, moduleId, subTopicId);
    return buildResponse(node, message);
  }
  if (trimmedInput === 'back') {
    const target = progress.module_id ? '__MODULE_ENTRY__' : 'MAIN_MENU';
    const { node, message, moduleId, subTopicId } = resolveChain(target, progress.module_id, progress.sub_topic_id);
    persistProgress(user.id, node, moduleId, subTopicId);
    return buildResponse(node, message);
  }

  if (currentNode.type === 'menu') {
    const option = currentNode.options.find((o) => o.id === trimmedInput);
    if (!option) {
      return buildResponse(currentNode, `Sorry, I didn't understand that.\n\n${currentNode.message}`);
    }
    const { node, message, moduleId, subTopicId } = resolveChain(option.next, progress.module_id, progress.sub_topic_id);
    persistProgress(user.id, node, moduleId || progress.module_id, subTopicId || progress.sub_topic_id);
    return buildResponse(node, message);
  }

  if (currentNode.type === 'input') {
    if (!trimmedInput) {
      return buildResponse(currentNode, currentNode.message);
    }
    const { node, message, moduleId, subTopicId } = resolveChain(currentNode.next, progress.module_id, progress.sub_topic_id);
    persistProgress(user.id, node, moduleId || progress.module_id, subTopicId || progress.sub_topic_id);
    return buildResponse(node, message);
  }

  if (currentNode.type === 'quiz') {
    const quiz = currentNode.quiz;
    // Scoped per-module so exhausting one module's quiz attempts doesn't affect another's.
    const quizAttemptKey = `${currentNode.id}:${currentNode.module || 'global'}`;
    const attemptNumber = quizAttemptRepository.countAttempts(user.id, quizAttemptKey) + 1;
    const normalized = trimmedInput.toLowerCase();
    const matchCount = quiz.keywords.filter((kw) => normalized.includes(kw)).length;
    const isCorrect = matchCount >= quiz.minMatches;

    quizAttemptRepository.log(user.id, quizAttemptKey, trimmedInput, isCorrect, attemptNumber);

    if (isCorrect) {
      const { node, message, moduleId, subTopicId } = resolveChain(quiz.onCorrect, progress.module_id, progress.sub_topic_id);
      persistProgress(user.id, node, moduleId || progress.module_id, subTopicId || progress.sub_topic_id);
      const prefix = quiz.correctMessage ? `${quiz.correctMessage}\n\n` : '';
      return buildResponse(node, prefix + message, 'correct');
    }

    if (attemptNumber >= quiz.maxAttempts) {
      const { node, message, moduleId, subTopicId } = resolveChain(quiz.onExhausted, progress.module_id, progress.sub_topic_id);
      persistProgress(user.id, node, moduleId || progress.module_id, subTopicId || progress.sub_topic_id);
      return buildResponse(node, `${quiz.exhaustedMessage}\n\n${message}`, 'incorrect');
    }

    // Incorrect, retries remaining — stay on the quiz state.
    persistProgress(user.id, currentNode, progress.module_id, progress.sub_topic_id);
    return buildResponse(currentNode, `${quiz.incorrectMessage}\n\n${currentNode.message}`, 'incorrect');
  }

  if (currentNode.type === 'mcq') {
    const option = currentNode.options.find((o) => o.id === trimmedInput);
    if (!option) {
      return buildResponse(currentNode, `Sorry, I didn't understand that.\n\n${currentNode.message}`);
    }

    // "Back"/"Main Menu" are navigation options mixed into the same options array as
    // the graded answer choices — not an attempt, don't count or grade it.
    if (option.navigate) {
      const { node, message, moduleId, subTopicId } = resolveChain(option.next, progress.module_id, progress.sub_topic_id);
      persistProgress(user.id, node, moduleId || progress.module_id, subTopicId || progress.sub_topic_id);
      return buildResponse(node, message);
    }

    // Scoped per-module, same convention as the free-text quiz's attempt key.
    const mcqAttemptKey = `${currentNode.id}:${currentNode.module || 'global'}`;
    const attemptNumber = quizAttemptRepository.countAttempts(user.id, mcqAttemptKey) + 1;
    const isCorrect = option.id === currentNode.correctOptionId;

    quizAttemptRepository.log(user.id, mcqAttemptKey, option.id, isCorrect, attemptNumber);

    if (isCorrect) {
      const { node, message, moduleId, subTopicId } = resolveChain(currentNode.next, progress.module_id, progress.sub_topic_id);
      persistProgress(user.id, node, moduleId || progress.module_id, subTopicId || progress.sub_topic_id);
      const prefix = currentNode.revealMessage ? `Correct! ${currentNode.revealMessage}\n\n` : 'Correct!\n\n';
      return buildResponse(node, prefix + message, 'correct');
    }

    const maxAttempts = currentNode.maxAttempts || 3;
    if (attemptNumber >= maxAttempts) {
      const { node, message, moduleId, subTopicId } = resolveChain(currentNode.next, progress.module_id, progress.sub_topic_id);
      persistProgress(user.id, node, moduleId || progress.module_id, subTopicId || progress.sub_topic_id);
      return buildResponse(node, `${currentNode.revealMessage}\n\n${message}`, 'incorrect');
    }

    // Incorrect, retries remaining — stay on the mcq state.
    persistProgress(user.id, currentNode, progress.module_id, progress.sub_topic_id);
    return buildResponse(currentNode, `${currentNode.incorrectMessage}\n\n${currentNode.message}`, 'incorrect');
  }

  // exit / auto should never be the persisted "current" state, but guard defensively.
  return buildResponse(currentNode, currentNode.message);
}

module.exports = { startSession, handleMessage, resolveNode };
