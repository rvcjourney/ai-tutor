const { getState, getModulesRegistry } = require('./conversationLoader');
const userRepository = require('../repositories/userRepository');
const progressRepository = require('../repositories/progressRepository');
const quizAttemptRepository = require('../repositories/quizAttemptRepository');

const INPUT_TYPE_BY_STATE_TYPE = {
  menu: 'options',
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
 *  state that requires learner input (menu/quiz/input) or a terminal state (exit). */
function resolveChain(startId, moduleIdHint = null) {
  const messages = [];
  let node = resolveNode(startId, moduleIdHint);
  let moduleId = node.module || moduleIdHint || null;

  while (node.type === 'auto') {
    messages.push(node.message);
    node = resolveNode(node.next, moduleId);
    moduleId = node.module || moduleId;
  }
  messages.push(node.message);
  moduleId = node.module || moduleId;

  return { node, message: messages.join('\n\n'), moduleId };
}

function buildResponse(node, message) {
  return {
    state: node.id,
    message,
    options: Array.isArray(node.options) ? node.options.map((o) => ({ id: o.id, label: o.label })) : [],
    inputType: INPUT_TYPE_BY_STATE_TYPE[node.type] || 'none',
  };
}

function isNewCalendarDay(updatedAtSql) {
  const todayUtc = new Date().toISOString().slice(0, 10);
  const updatedDate = updatedAtSql.slice(0, 10);
  return updatedDate !== todayUtc;
}

function persistProgress(userId, node, moduleId) {
  const status = node.type === 'exit' ? 'completed' : 'in_progress';
  progressRepository.upsert(userId, {
    currentState: node.id,
    lastCompletedState: node.type === 'exit' ? node.id : null,
    moduleId,
    status,
  });
}

function startSession(externalUserId, { simulateNextDay = false } = {}) {
  const user = userRepository.findOrCreateByExternalId(externalUserId);
  const progress = progressRepository.get(user.id);

  let entryStateId = 'WELCOME';
  let moduleIdHint = null;
  if (progress) {
    const returningNextDay = simulateNextDay || isNewCalendarDay(progress.updated_at);
    if (progress.status === 'completed' && returningNextDay && getReinforcementQuiz(progress.module_id)) {
      entryStateId = 'ND_WELCOME';
      moduleIdHint = progress.module_id;
    } else if (progress.status === 'in_progress') {
      // Resume exactly where they left off (already an input-awaiting state).
      const node = resolveNode(progress.current_state, progress.module_id);
      return buildResponse(node, node.message);
    }
    // status === 'completed' and (same day, or that module has no reinforcement
    // quiz configured) => re-greet from WELCOME (falls through).
  }

  const { node, message, moduleId } = resolveChain(entryStateId, moduleIdHint);
  persistProgress(user.id, node, moduleId);
  return buildResponse(node, message);
}

function handleMessage(externalUserId, input) {
  const user = userRepository.findOrCreateByExternalId(externalUserId);
  const progress = progressRepository.get(user.id);
  if (!progress) {
    throw Object.assign(new Error('No active session — call /chat/start first.'), { statusCode: 400 });
  }

  const currentNode = resolveNode(progress.current_state, progress.module_id);
  const trimmedInput = typeof input === 'string' ? input.trim() : '';

  if (currentNode.type === 'menu') {
    const option = currentNode.options.find((o) => o.id === trimmedInput);
    if (!option) {
      return buildResponse(currentNode, `Sorry, I didn't understand that.\n\n${currentNode.message}`);
    }
    const { node, message, moduleId } = resolveChain(option.next, progress.module_id);
    persistProgress(user.id, node, moduleId || progress.module_id);
    return buildResponse(node, message);
  }

  if (currentNode.type === 'input') {
    if (!trimmedInput) {
      return buildResponse(currentNode, currentNode.message);
    }
    const { node, message, moduleId } = resolveChain(currentNode.next, progress.module_id);
    persistProgress(user.id, node, moduleId || progress.module_id);
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
      const { node, message, moduleId } = resolveChain(quiz.onCorrect, progress.module_id);
      persistProgress(user.id, node, moduleId || progress.module_id);
      const prefix = quiz.correctMessage ? `${quiz.correctMessage}\n\n` : '';
      return buildResponse(node, prefix + message);
    }

    if (attemptNumber >= quiz.maxAttempts) {
      const { node, message, moduleId } = resolveChain(quiz.onExhausted, progress.module_id);
      persistProgress(user.id, node, moduleId || progress.module_id);
      return buildResponse(node, `${quiz.exhaustedMessage}\n\n${message}`);
    }

    // Incorrect, retries remaining — stay on the quiz state.
    persistProgress(user.id, currentNode, progress.module_id);
    return buildResponse(currentNode, `${quiz.incorrectMessage}\n\n${currentNode.message}`);
  }

  // exit / auto should never be the persisted "current" state, but guard defensively.
  return buildResponse(currentNode, currentNode.message);
}

module.exports = { startSession, handleMessage, resolveNode };
