const { getModulesRegistry, getState, getAllStates } = require('../engine/conversationLoader');

/** Follows the actual "next" links for one sub-topic (from its first fact/MCQ state
 *  through to EXPLAIN_FURTHER), reconstructing the original Q&A/MCQ rows from the
 *  published state graph — this is what "view uploaded data" reads from, since the
 *  raw CSV isn't kept anywhere after publish. */
function walkSubTopic(startId, statesById) {
  const items = [];
  let current = statesById.get(startId);
  let guard = 0;

  while (current && current.id !== 'EXPLAIN_FURTHER' && guard < 500) {
    guard += 1;
    if (current.screenType === 'fact') {
      const [question, ...rest] = current.message.split('\n');
      items.push({ type: 'Q', question, answer: rest.join('\n') });
      const nextOption = (current.options || []).find((o) => o.id === 'next');
      current = nextOption ? statesById.get(nextOption.next) : null;
    } else if (current.type === 'mcq') {
      const choices = (current.options || []).filter((o) => !o.navigate).map((o) => ({ id: o.id, label: o.label }));
      items.push({
        type: 'MCQ',
        question: current.message,
        choices,
        correct: current.correctOptionId,
        explanation: current.revealMessage,
      });
      current = statesById.get(current.next);
    } else {
      break; // unrecognized state shape — stop rather than loop forever
    }
  }

  return items;
}

function getTopicEntry(moduleId) {
  const entry = getModulesRegistry().find((m) => m.id === moduleId);
  if (!entry) {
    throw Object.assign(new Error(`No topic with id "${moduleId}"`), { statusCode: 404 });
  }
  return entry;
}

function getTopicContent(moduleId) {
  const entry = getTopicEntry(moduleId);
  const menuState = getState(entry.entryState);
  const statesById = new Map(getAllStates().filter((s) => s.module === moduleId).map((s) => [s.id, s]));
  const menuOptionBySubTopic = new Map((menuState.options || []).map((o) => [o.id, o]));

  // Every registered sub-topic must show up here, even ones with zero questions yet
  // — otherwise a freshly-created empty sub-topic (registered, but with no menu
  // option since there's nothing to link to) becomes invisible in the admin grid
  // the moment it's created, with no way to open it and add questions.
  const subTopics = (entry.subTopics || []).map((st) => {
    const option = menuOptionBySubTopic.get(st.id);
    return {
      id: st.id,
      label: st.label,
      items: option ? walkSubTopic(option.next, statesById) : [],
    };
  });

  return { moduleId, title: entry.title, subTopics };
}

/** Same reconstruction as getTopicContent, but flattened into the row shape
 *  csvImporter.js consumes (topic, subTopic, type, num, question, answer,
 *  choiceA-D, correct) — this is what lets a single CRUD edit reuse the exact same
 *  buildTopic()/publish() pipeline the CSV path already uses. Sub-topics with zero
 *  questions yet (registered but empty) are read from the registry directly, since
 *  they have no menu option — and therefore no rows — to walk yet. */
function getTopicRows(moduleId) {
  const entry = getTopicEntry(moduleId);
  const menuState = getState(entry.entryState);
  const statesById = new Map(getAllStates().filter((s) => s.module === moduleId).map((s) => [s.id, s]));
  const menuOptionBySubTopic = new Map((menuState.options || []).map((o) => [o.id, o]));

  const rows = [];
  for (const subTopic of entry.subTopics || []) {
    const option = menuOptionBySubTopic.get(subTopic.id);
    if (!option) continue; // empty sub-topic — nothing published for it yet

    const items = walkSubTopic(option.next, statesById);
    let qNum = 0;
    let mcqNum = 0;
    for (const item of items) {
      if (item.type === 'Q') {
        qNum += 1;
        rows.push({
          topic: entry.title,
          subTopic: subTopic.label,
          type: 'Q',
          num: qNum,
          question: item.question,
          answer: item.answer,
        });
      } else {
        mcqNum += 1;
        const row = {
          topic: entry.title,
          subTopic: subTopic.label,
          type: 'MCQ',
          num: mcqNum,
          question: item.question,
          correct: item.correct,
          answer: item.explanation,
        };
        for (const choice of item.choices) row[`choice${choice.id}`] = choice.label;
        rows.push(row);
      }
    }
  }
  return rows;
}

/** Learner-facing read: just the Q&A pairs (never MCQs — those stay gated behind the
 *  graded FSM flow) for one sub-topic, in order. Powers the two-pane "browse any
 *  question, see its answer" explorer — the frontend fetches this once and lets the
 *  learner click around freely, with no per-click round trip to the FSM. */
function getSubTopicQaList(moduleId, subTopicId) {
  const entry = getTopicEntry(moduleId);
  const subTopic = (entry.subTopics || []).find((st) => st.id === subTopicId);
  if (!subTopic) {
    throw Object.assign(new Error(`No sub-topic with id "${subTopicId}"`), { statusCode: 404 });
  }

  const menuState = getState(entry.entryState);
  const option = (menuState.options || []).find((o) => o.id === subTopicId);
  if (!option) return []; // registered but empty — nothing published for it yet

  const statesById = new Map(getAllStates().filter((s) => s.module === moduleId).map((s) => [s.id, s]));
  const items = walkSubTopic(option.next, statesById);
  return items.filter((item) => item.type === 'Q').map((item) => ({ question: item.question, answer: item.answer }));
}

module.exports = { getTopicContent, getTopicRows, getTopicEntry, getSubTopicQaList };
