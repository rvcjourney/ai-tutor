const { getState, getModulesRegistry, getAllStates } = require('./conversationLoader');
const userRepository = require('../repositories/userRepository');
const progressRepository = require('../repositories/progressRepository');
const quizAttemptRepository = require('../repositories/quizAttemptRepository');
const subTopicProgressRepository = require('../repositories/subTopicProgressRepository');
const subTopicItemProgressRepository = require('../repositories/subTopicItemProgressRepository');

const INPUT_TYPE_BY_STATE_TYPE = {
  menu: 'options',
  mcq: 'options',
  'mcq-answered': 'options',
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

/** The tappable sub-topic tiles for a module's real menu (Greeting/Overview
 *  excluded, same "hidden" filter the tile-list UI already applies) — reused both
 *  to let the shared EXPLAIN_FURTHER end screen offer them directly, and to know
 *  which ids that screen should accept as valid taps. */
function getVisibleSubTopicOptions(moduleId) {
  if (!moduleId) return [];
  const module = getModulesRegistry().find((m) => m.id === moduleId);
  if (!module) return [];
  const menuState = getState(module.entryState);
  const hiddenIds = new Set((module.subTopics || []).filter((st) => st.hidden).map((st) => st.id));
  return (menuState.options || [])
    .filter((o) => !hiddenIds.has(o.id))
    .map((o) => ({ id: o.id, label: o.label, next: o.next }));
}

/** True once a learner has fully passed through every hidden (Greeting/Overview)
 *  sub-topic of a module at least once — used to skip straight to the module's real
 *  menu on repeat visits instead of replaying the whole intro chain every time. A
 *  module with no hidden sub-topics has nothing to skip, so it's trivially "seen." */
function hasSeenIntro(userId, moduleId) {
  const module = getModulesRegistry().find((m) => m.id === moduleId);
  if (!module) return false;
  const hiddenSubTopics = (module.subTopics || []).filter((st) => st.hidden);
  if (!hiddenSubTopics.length) return true;
  return hiddenSubTopics.every((st) => subTopicProgressRepository.isComplete(userId, moduleId, st.id));
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

// An MCQ that's just been answered correctly, or exhausted its attempts, doesn't
// immediately jump to the next question — that used to combine "Correct! ..." with
// the next question's content on the same screen, which read as confusing (one
// screen, two questions). Instead it lands on this synthetic "answered" screen:
// the SAME question and choices stay visible (locked, correct/picked-wrong
// highlighted) with the explanation below and a Continue action — and only
// advances to the state the MCQ's own `next` pointed at once the learner taps
// it. Suffix-based (like "__MODULE_ENTRY__") so it round-trips through
// persistence/resume without needing its own DB column — `selectedOptionId` is
// only known at the moment of answering, so it's `null` on a resumed session
// (still shows which one was correct, just not which one was picked).
const ANSWERED_MCQ_SUFFIX = { correct: '__ANSWERED_CORRECT', exhausted: '__ANSWERED_EXHAUSTED' };

function buildAnsweredMcqNode(baseState, kind, selectedOptionId = null) {
  const revealMessage =
    kind === 'correct'
      ? baseState.revealMessage
        ? `Correct! ${baseState.revealMessage}`
        : 'Correct!'
      : baseState.revealMessage || 'That was your last attempt.';
  return {
    id: `${baseState.id}${ANSWERED_MCQ_SUFFIX[kind]}`,
    type: 'mcq-answered',
    module: baseState.module,
    subTopic: baseState.subTopic,
    message: baseState.message,
    mcqChoices: {
      options: (baseState.options || []).filter((o) => !o.navigate).map((o) => ({ id: o.id, label: o.label })),
      correctOptionId: baseState.correctOptionId,
      selectedOptionId: kind === 'correct' ? baseState.correctOptionId : selectedOptionId,
    },
    revealMessage,
    options: [{ id: 'next', label: 'Continue ▸', next: baseState.next }],
    next: baseState.next,
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
  for (const [kind, suffix] of Object.entries(ANSWERED_MCQ_SUFFIX)) {
    if (id.endsWith(suffix)) {
      const baseState = getState(id.slice(0, -suffix.length));
      return buildAnsweredMcqNode(baseState, kind);
    }
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

const OPTIONS_VARIANT_BY_STATE_TYPE = { mcq: 'mcq', menu: 'menu', 'mcq-answered': 'mcq-answered' };

function buildResponse(node, message, feedback = null, moduleIdHint = null, subTopicIdHint = null) {
  // Fact screens are technically "menu" states (a single Next choice plus Back/Menu),
  // but they get their own "qa" variant so the UI can give the primary action real
  // visual weight instead of three equal-looking pill buttons.
  const optionsVariant = node.screenType === 'fact' ? 'qa' : OPTIONS_VARIANT_BY_STATE_TYPE[node.type] || null;
  // Shared/untagged states (EXPLAIN_FURTHER, MAIN_MENU) carry no module/subTopic of
  // their own — resolveChain already threads forward which module/sub-topic the
  // learner is actually in as it walks "auto" states, so callers pass that resolved
  // value through here rather than it silently getting dropped back to null.
  const moduleId = node.module || moduleIdHint || null;
  const subTopicId = node.subTopic || subTopicIdHint || null;

  return {
    state: node.id,
    message,
    options: Array.isArray(node.options) ? node.options.map((o) => ({ id: o.id, label: o.label })) : [],
    inputType: INPUT_TYPE_BY_STATE_TYPE[node.type] || 'none',
    optionsVariant,
    // Set only on a topic's own sub-topic-selection menu (the state csvImporter.js
    // tags with `module` — every other shared/untagged state leaves this null) — lets
    // the UI recognize "this is a module's menu" and render sub-topic progress tiles.
    moduleId,
    // Set on any state within a sub-topic (fact/MCQ states) — lets the UI fetch that
    // sub-topic's full Q&A list for the two-pane explorer.
    subTopicId,
    // 'question' | 'answer' | null — which half of a Q&A pair this is, so the UI can
    // style/animate the reveal distinctly (icon, accent, "flip" transition).
    screenType: node.screenType || null,
    // 'correct' | 'incorrect' | null — lets the UI show a real correct/wrong signal
    // instead of the client having to guess by pattern-matching the message text.
    feedback,
    // Only populated on the shared end-of-sub-topic screen — lets the learner jump
    // straight into another sub-topic from there instead of being forced through
    // "Back to Topic Menu" first.
    subTopicOptions: node.id === 'EXPLAIN_FURTHER' ? getVisibleSubTopicOptions(moduleId) : null,
    // Only populated on the "answered MCQ" screen — the original question's choices,
    // plus which one was correct and (when known — not on a resumed session) which
    // one the learner picked, so the UI can keep showing the same choice grid
    // (locked, highlighted) instead of swapping to a bare feedback card.
    mcqChoices: node.mcqChoices || null,
    // The "Correct! ..." / reveal explanation for an answered MCQ — kept separate
    // from `message` (which stays the original question text) so the UI can lay
    // out question, choices, and explanation as distinct pieces of the same card.
    revealMessage: node.revealMessage || null,
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

/** Persists where the learner landed, and — the actual completion trigger — marks the
 *  sub-topic they were just IN as done the moment they leave it (the resolved node's
 *  own `subTopic` tag no longer matches where they were). That covers finishing a
 *  normal sub-topic (-> EXPLAIN_FURTHER) as well as Greeting/Overview silently
 *  chaining into the next sub-topic or the real tile menu — either way, once left,
 *  it won't replay. Centralizing this here means every call site gets both
 *  completion-tracking and "furthest item reached" tracking for free, so a sub-topic
 *  still in progress can show a real "6 of 15 covered" figure instead of just
 *  done/not-done. `previous` is the pre-this-turn {moduleId, subTopicId}, if any. */
function persistProgress(userId, node, moduleId, subTopicId, previous = null) {
  const status = node.type === 'exit' ? 'completed' : 'in_progress';
  progressRepository.upsert(userId, {
    currentState: node.id,
    lastCompletedState: node.type === 'exit' ? node.id : null,
    moduleId,
    subTopicId,
    status,
  });
  if (previous?.moduleId && previous?.subTopicId && node.subTopic !== previous.subTopicId) {
    subTopicProgressRepository.markComplete(userId, previous.moduleId, previous.subTopicId);
  } else if (node.subTopic) {
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
  return buildResponse(node, message, null, moduleId, subTopicId);
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
        return buildResponse(node, node.message, null, progress.module_id, progress.sub_topic_id);
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
    // Starting/resuming a session is never itself "finishing" whatever sub-topic a
    // learner's saved position happens to carry — never a completion signal here.
    persistProgress(user.id, node, moduleId, subTopicId, null);
    return buildResponse(node, `${greeting}\n\n${message}`, null, moduleId, subTopicId);
  }

  const { node, message, moduleId, subTopicId } = resolveChain(entryStateId, moduleIdHint, subTopicIdHint);
  persistProgress(user.id, node, moduleId, subTopicId, null);
  return buildResponse(node, message, null, moduleId, subTopicId);
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
  const previous = { moduleId: progress.module_id, subTopicId: progress.sub_topic_id };
  // A sub-topic only counts as "complete" when it's left via its own content's
  // forward `next` link (finishing a fact/MCQ card) — never via a navigation escape
  // (the global Back/Main Menu shortcuts below, or an MCQ's embedded nav option), and
  // never from a state that isn't itself tagged as being inside a sub-topic (a tile
  // menu, MAIN_MENU). Scoping it to "the state we're leaving is itself sub-topic
  // content" is what keeps a mid-sub-topic bail-out from being misrecorded as done.
  const previousForCompletion = currentNode.subTopic ? previous : null;

  // Global navigation shortcuts — the UI's persistent "Back to Topic Menu"/"Main
  // Menu" controls need to work from literally any screen, including list screens
  // (main menu, sub-topic menu) that have no such option of their own. Checked
  // before the type-specific option matching below, so this always wins over
  // whatever the current state's own options happen to be. Deliberately never
  // trigger sub-topic completion — leaving via these is an escape, not "finished."
  if (trimmedInput === 'menu') {
    // No hints here, deliberately — MAIN_MENU is the one truly context-free
    // "reset" screen. Passing the old module/sub-topic through would leak into
    // the response (MAIN_MENU carries no tag of its own, so resolveChain's hint
    // fallback would substitute the stale ones), making the breadcrumb/UI still
    // think the learner is inside whatever topic they just left.
    const { node, message, moduleId, subTopicId } = resolveChain('MAIN_MENU', null, null);
    persistProgress(user.id, node, moduleId, subTopicId, null);
    return buildResponse(node, message, null, moduleId, subTopicId);
  }
  if (trimmedInput === 'back') {
    const target = progress.module_id ? '__MODULE_ENTRY__' : 'MAIN_MENU';
    const { node, message, moduleId, subTopicId } = resolveChain(target, progress.module_id, progress.sub_topic_id);
    persistProgress(user.id, node, moduleId, subTopicId, null);
    return buildResponse(node, message, null, moduleId, subTopicId);
  }

  if (currentNode.type === 'menu') {
    let option = currentNode.options.find((o) => o.id === trimmedInput);
    // The shared end-of-sub-topic screen only lists back/menu/exit statically —
    // its real options are computed at runtime (see getVisibleSubTopicOptions),
    // matching the same set the frontend was just handed as `subTopicOptions`.
    if (!option && currentNode.id === 'EXPLAIN_FURTHER') {
      option = getVisibleSubTopicOptions(progress.module_id).find((o) => o.id === trimmedInput);
    }
    if (!option) {
      return buildResponse(currentNode, `Sorry, I didn't understand that.\n\n${currentNode.message}`, null, progress.module_id, progress.sub_topic_id);
    }
    // Tapping a topic tile from the Main Menu normally starts its Greeting/Overview
    // intro chain — but only the first time. Once a learner has already been through
    // it, skip straight to the topic's real sub-topic menu instead of replaying it.
    let targetId = option.next;
    if (currentNode.id === 'MAIN_MENU' && hasSeenIntro(user.id, option.id)) {
      targetId = getModuleEntryState(option.id) || targetId;
    }
    const { node, message, moduleId, subTopicId } = resolveChain(targetId, progress.module_id, progress.sub_topic_id);
    persistProgress(user.id, node, moduleId || progress.module_id, subTopicId || progress.sub_topic_id, previousForCompletion);
    return buildResponse(node, message, null, moduleId, subTopicId);
  }

  if (currentNode.type === 'input') {
    if (!trimmedInput) {
      return buildResponse(currentNode, currentNode.message, null, progress.module_id, progress.sub_topic_id);
    }
    const { node, message, moduleId, subTopicId } = resolveChain(currentNode.next, progress.module_id, progress.sub_topic_id);
    persistProgress(user.id, node, moduleId || progress.module_id, subTopicId || progress.sub_topic_id, previousForCompletion);
    return buildResponse(node, message, null, moduleId, subTopicId);
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
      persistProgress(user.id, node, moduleId || progress.module_id, subTopicId || progress.sub_topic_id, previousForCompletion);
      const prefix = quiz.correctMessage ? `${quiz.correctMessage}\n\n` : '';
      return buildResponse(node, prefix + message, 'correct', moduleId, subTopicId);
    }

    if (attemptNumber >= quiz.maxAttempts) {
      const { node, message, moduleId, subTopicId } = resolveChain(quiz.onExhausted, progress.module_id, progress.sub_topic_id);
      persistProgress(user.id, node, moduleId || progress.module_id, subTopicId || progress.sub_topic_id, previousForCompletion);
      return buildResponse(node, `${quiz.exhaustedMessage}\n\n${message}`, 'incorrect', moduleId, subTopicId);
    }

    // Incorrect, retries remaining — stay on the quiz state.
    persistProgress(user.id, currentNode, progress.module_id, progress.sub_topic_id, previousForCompletion);
    return buildResponse(currentNode, `${quiz.incorrectMessage}\n\n${currentNode.message}`, 'incorrect', progress.module_id, progress.sub_topic_id);
  }

  if (currentNode.type === 'mcq') {
    const option = currentNode.options.find((o) => o.id === trimmedInput);
    if (!option) {
      return buildResponse(currentNode, `Sorry, I didn't understand that.\n\n${currentNode.message}`, null, progress.module_id, progress.sub_topic_id);
    }

    // "Back"/"Main Menu" are navigation options mixed into the same options array as
    // the graded answer choices — not an attempt, don't count or grade it, and (like
    // the global shortcuts above) not a completion signal either.
    if (option.navigate) {
      const { node, message, moduleId, subTopicId } = resolveChain(option.next, progress.module_id, progress.sub_topic_id);
      persistProgress(user.id, node, moduleId || progress.module_id, subTopicId || progress.sub_topic_id, null);
      return buildResponse(node, message, null, moduleId, subTopicId);
    }

    // Scoped per-module, same convention as the free-text quiz's attempt key.
    const mcqAttemptKey = `${currentNode.id}:${currentNode.module || 'global'}`;
    const attemptNumber = quizAttemptRepository.countAttempts(user.id, mcqAttemptKey) + 1;
    const isCorrect = option.id === currentNode.correctOptionId;

    quizAttemptRepository.log(user.id, mcqAttemptKey, option.id, isCorrect, attemptNumber);

    // Correct (or attempts exhausted) no longer jumps straight to the next
    // question — it lands on the "answered" screen first (see
    // buildAnsweredMcqNode): same question and choices, locked and highlighted,
    // explanation below — so the learner sees just this question's result before
    // a separate Continue tap reveals what's next, instead of both arriving
    // combined on one screen. Built directly (not via resolveNode's suffix
    // lookup) so the real picked choice is known — resolveNode only sees it as
    // null, on a resumed session.
    if (isCorrect) {
      const node = buildAnsweredMcqNode(currentNode, 'correct', option.id);
      persistProgress(user.id, node, progress.module_id, progress.sub_topic_id, previousForCompletion);
      return buildResponse(node, node.message, 'correct', progress.module_id, progress.sub_topic_id);
    }

    const maxAttempts = currentNode.maxAttempts || 3;
    if (attemptNumber >= maxAttempts) {
      const node = buildAnsweredMcqNode(currentNode, 'exhausted', option.id);
      persistProgress(user.id, node, progress.module_id, progress.sub_topic_id, previousForCompletion);
      return buildResponse(node, node.message, 'incorrect', progress.module_id, progress.sub_topic_id);
    }

    // Incorrect, retries remaining — stay on the mcq state.
    persistProgress(user.id, currentNode, progress.module_id, progress.sub_topic_id, previousForCompletion);
    return buildResponse(currentNode, `${currentNode.incorrectMessage}\n\n${currentNode.message}`, 'incorrect', progress.module_id, progress.sub_topic_id);
  }

  // The Continue tap on an "answered MCQ" screen — advance to whatever the
  // original MCQ's own `next` pointed at (another question, or the sub-topic's
  // completion screen).
  if (currentNode.type === 'mcq-answered') {
    const { node, message, moduleId, subTopicId } = resolveChain(currentNode.next, progress.module_id, progress.sub_topic_id);
    persistProgress(user.id, node, moduleId || progress.module_id, subTopicId || progress.sub_topic_id, previousForCompletion);
    return buildResponse(node, message, null, moduleId, subTopicId);
  }

  // exit / auto should never be the persisted "current" state, but guard defensively.
  return buildResponse(currentNode, currentNode.message, null, progress.module_id, progress.sub_topic_id);
}

module.exports = { startSession, handleMessage, resolveNode };
