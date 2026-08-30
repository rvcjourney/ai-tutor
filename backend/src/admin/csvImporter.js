const { parse } = require('csv-parse/sync');
const { slugifyLower, slugifyUpper } = require('./slugify');

const HEADER_MAP = {
  id: 'id',
  topic: 'topic',
  subtopic: 'subTopic',
  type: 'type',
  '#': 'num',
  num: 'num',
  number: 'num',
  question: 'question',
  choicea: 'choiceA',
  a: 'choiceA',
  choiceb: 'choiceB',
  b: 'choiceB',
  choicec: 'choiceC',
  c: 'choiceC',
  choiced: 'choiceD',
  d: 'choiceD',
  correct: 'correct',
  answerexplanation: 'answer',
  answer: 'answer',
  notes: 'notes',
};

function normalizeHeader(h) {
  return String(h)
    .toLowerCase()
    .replace(/[^a-z0-9#]/g, '');
}

// A bare "?" immediately followed by a digit is never valid punctuation in a real
// question/answer — it only shows up when a "₹" got lost upstream (e.g. an export step
// that couldn't represent the character). Safe to repair; a real "?" is always followed
// by a space, comma, quote, or end of field, never directly by a number.
function repairLostRupeeSigns(text) {
  if (typeof text !== 'string') return text;
  return text.replace(/\?(\d)/g, '₹$1');
}

// A stray "â" is never valid English text on its own — it only shows up when a
// dash's UTF-8 bytes got mangled through a bad encoding round-trip (its trailing
// bytes dropped after being misread as Windows-1252). Safe to repair because the
// two shapes it appears in are unambiguous: " â " between spaces was a phrase-break
// em dash ("X — Y"), and a bare "â" glued between digits was a numeric-range en
// dash ("5â10" → "5–10").
function repairLostDashes(text) {
  if (typeof text !== 'string') return text;
  return text.replace(/ â /g, ' — ').replace(/(\d)â(\d)/g, '$1–$2');
}

/** Normalizes + validates one row. Shared by the CSV path (parseRows, below) and the
 *  single-row CRUD endpoints (crudService.js), so a question added through the admin
 *  grid is held to exactly the same rules as one added via a CSV upload.
 *  `requireNum` is off for CRUD, where row order comes from array position instead —
 *  the admin never types a sequence number by hand. */
function validateRow(row, { requireNum = true } = {}) {
  const errors = [];
  const normalized = { ...row };

  if (!normalized.topic) errors.push('missing Topic');
  if (!normalized.subTopic) errors.push('missing Sub-Topic');

  const type = (normalized.type || '').toUpperCase();
  const VALID_TYPES = ['Q', 'MCQ', 'GREETING', 'OVERVIEW'];
  if (!VALID_TYPES.includes(type)) {
    errors.push(`Type must be one of ${VALID_TYPES.join('/')}, got "${normalized.type || ''}"`);
  }
  normalized.type = type;

  if (requireNum) {
    const num = parseInt(normalized.num, 10);
    if (!Number.isInteger(num) || num < 1) {
      errors.push('"#" must be a positive whole number');
    }
    normalized.num = num;
  }

  if (!normalized.question) {
    errors.push('missing Question');
  }

  // GREETING/OVERVIEW are structurally identical to Q (a plain read-and-continue
  // card) — the distinct Type value exists purely so buildTopic() can recognize a
  // sub-topic's role from an explicit, fixed-vocabulary column instead of having to
  // guess from its free-text label.
  if (type === 'Q' || type === 'GREETING' || type === 'OVERVIEW') {
    if (!normalized.answer) errors.push('missing Answer');
  } else if (type === 'MCQ') {
    const filledChoices = ['A', 'B', 'C', 'D'].filter((l) => normalized[`choice${l}`]);
    if (filledChoices.length < 2) {
      errors.push('needs at least 2 filled choices');
    }
    const correct = (normalized.correct || '').toUpperCase();
    if (!['A', 'B', 'C', 'D'].includes(correct) || !normalized[`choice${correct}`]) {
      errors.push('"Correct" must be one of A/B/C/D matching a filled choice');
    }
    normalized.correct = correct;
  }

  return { errors, row: normalized };
}

function parseRows(csvText) {
  let records;
  try {
    records = parse(csvText, { columns: true, skip_empty_lines: true, trim: true, relax_column_count: true });
  } catch (err) {
    throw Object.assign(new Error(`Could not parse CSV: ${err.message}`), { statusCode: 400 });
  }

  const errors = [];
  const rows = [];

  records.forEach((raw, i) => {
    const rowNum = i + 2; // header occupies row 1
    const rawRow = {};
    for (const [key, value] of Object.entries(raw)) {
      const mapped = HEADER_MAP[normalizeHeader(key)];
      if (!mapped) continue;
      const trimmed = typeof value === 'string' ? value.trim() : value;
      const isFreeText = ['question', 'answer', 'choiceA', 'choiceB', 'choiceC', 'choiceD'].includes(mapped);
      rawRow[mapped] = isFreeText ? repairLostDashes(repairLostRupeeSigns(trimmed)) : trimmed;
    }

    const { errors: rowErrors, row } = validateRow(rawRow);
    if (rowErrors.length) {
      const label = `${rawRow.topic || '?'} / ${rawRow.subTopic || '?'}`;
      for (const e of rowErrors) errors.push(`Row ${rowNum} (${label}): ${e}`);
      return;
    }

    rows.push(row);
  });

  if (errors.length) {
    throw Object.assign(new Error(`CSV has ${errors.length} problem(s):\n${errors.join('\n')}`), { statusCode: 400 });
  }
  if (rows.length === 0) {
    throw Object.assign(new Error('CSV has no valid data rows'), { statusCode: 400 });
  }

  return rows;
}

function groupByTopicAndSubTopic(rows) {
  const topicOrder = [];
  const topicGroups = new Map();

  for (const row of rows) {
    if (!topicGroups.has(row.topic)) {
      topicGroups.set(row.topic, new Map());
      topicOrder.push(row.topic);
    }
    const subMap = topicGroups.get(row.topic);
    if (!subMap.has(row.subTopic)) subMap.set(row.subTopic, []);
    subMap.get(row.subTopic).push(row);
  }

  return topicOrder.map((topicName) => ({ topicName, subTopics: topicGroups.get(topicName) }));
}

// GREETING/OVERVIEW rows render exactly like Q rows (a plain fact card) — they're
// grouped in with the Q sequence for state-building purposes, and only matter as a
// distinct Type for buildTopic()'s role detection.
function buildStatesForSubTopic(prefix, moduleId, subTopicId, allRows, { endTarget = 'EXPLAIN_FURTHER' } = {}) {
  const qRows = allRows.filter((r) => r.type === 'Q' || r.type === 'GREETING' || r.type === 'OVERVIEW').sort((a, b) => a.num - b.num);
  const mcqRows = allRows.filter((r) => r.type === 'MCQ').sort((a, b) => a.num - b.num);
  const states = [];

  qRows.forEach((row, i) => {
    const id = `${prefix}_Q${row.num}`;
    const next = i < qRows.length - 1 ? `${prefix}_Q${qRows[i + 1].num}` : mcqRows.length ? `${prefix}_MCQ${mcqRows[0].num}` : endTarget;
    // One paced turn per fact: question + its answer shown together (no hide/reveal
    // tap) — the hide/reveal implied a recall check that wasn't actually graded;
    // real recall-testing already happens later via the MCQs, so it just added
    // friction here without adding verification. Still one fact per screen, though,
    // not a wall of text.
    states.push({
      id,
      type: 'menu',
      module: moduleId,
      subTopic: subTopicId,
      screenType: 'fact',
      message: `${row.question}\n${row.answer}`,
      options: [
        { id: 'next', label: 'Next ▸', next },
        { id: 'back', label: 'Topic Menu', next: '__MODULE_ENTRY__' },
        { id: 'menu', label: 'Home', next: 'MAIN_MENU' },
      ],
    });
  });

  mcqRows.forEach((row, i) => {
    const id = `${prefix}_MCQ${row.num}`;
    const next = i < mcqRows.length - 1 ? `${prefix}_MCQ${mcqRows[i + 1].num}` : endTarget;
    const choiceOptions = ['A', 'B', 'C', 'D'].filter((l) => row[`choice${l}`]).map((l) => ({ id: l, label: row[`choice${l}`] }));
    // "navigate" options are mixed into the same array as the graded choices but
    // skip attempt-counting/grading entirely — see fsmEngine's mcq handling.
    const navOptions = [
      { id: 'back', label: 'Topic Menu', next: '__MODULE_ENTRY__', navigate: true },
      { id: 'menu', label: 'Home', next: 'MAIN_MENU', navigate: true },
    ];
    states.push({
      id,
      type: 'mcq',
      module: moduleId,
      subTopic: subTopicId,
      message: row.question,
      options: [...choiceOptions, ...navOptions],
      correctOptionId: row.correct,
      maxAttempts: 3,
      incorrectMessage: 'Not quite — try again.',
      revealMessage: row.answer || `The correct answer is ${row.correct}.`,
      next,
    });
  });

  const firstStateId = qRows.length ? `${prefix}_Q${qRows[0].num}` : mcqRows.length ? `${prefix}_MCQ${mcqRows[0].num}` : null;
  return { states, firstStateId };
}

function computeFirstStateId(prefix, rows) {
  const qRows = rows.filter((r) => r.type === 'Q' || r.type === 'GREETING' || r.type === 'OVERVIEW').sort((a, b) => a.num - b.num);
  const mcqRows = rows.filter((r) => r.type === 'MCQ').sort((a, b) => a.num - b.num);
  if (qRows.length) return `${prefix}_Q${qRows[0].num}`;
  if (mcqRows.length) return `${prefix}_MCQ${mcqRows[0].num}`;
  return null;
}

function buildTopic(topicName, subTopicsMap) {
  const moduleId = slugifyLower(topicName);
  const moduleIdUpper = slugifyUpper(topicName);
  const menuId = `${moduleIdUpper}_MENU`;

  // Two reusable roles (any topic, not BFSI specials), chained together: entering
  // the topic auto-plays the Greeting-role sub-topic (if present), which flows
  // straight into the Overview-role sub-topic (if present), which then flows into
  // the real sector-picking tile menu. Neither is a separately-tappable tile —
  // both are hidden from the tile list, since they're steps in a sequence, not
  // independent choices. A topic with neither behaves exactly as before: straight
  // to the tile menu.
  //
  // A row's explicit Type (GREETING/OVERVIEW) is the source of truth — the
  // Sub-Topic label is then just a free-text display name, not a magic string.
  // The old name-based convention ("Greeting", "More about X") is kept as a
  // fallback purely for content published before Type carried this distinction.
  const groupMeta = new Map();
  for (const [subTopicName, rows] of subTopicsMap) {
    const normalized = subTopicName.trim().toLowerCase();
    const prefix = `${moduleIdUpper}_${slugifyUpper(subTopicName)}`;
    groupMeta.set(subTopicName, {
      prefix,
      isGreeting: rows.some((r) => r.type === 'GREETING') || normalized === 'greeting',
      isOverview: rows.some((r) => r.type === 'OVERVIEW') || normalized.startsWith('more about'),
      firstStateId: computeFirstStateId(prefix, rows),
    });
  }
  const greetingMeta = [...groupMeta.values()].find((m) => m.isGreeting);
  const overviewMeta = [...groupMeta.values()].find((m) => m.isOverview);
  const afterGreetingTarget = overviewMeta?.firstStateId || menuId;
  const topicEntryStateId = greetingMeta?.firstStateId || overviewMeta?.firstStateId || menuId;

  const allStates = [];
  const menuOptions = [];
  const subTopicsList = [];

  for (const [subTopicName, rows] of subTopicsMap) {
    const meta = groupMeta.get(subTopicName);
    const subTopicId = slugifyLower(subTopicName);
    const endTarget = meta.isGreeting ? afterGreetingTarget : meta.isOverview ? menuId : undefined;
    const { states, firstStateId } = buildStatesForSubTopic(meta.prefix, moduleId, subTopicId, rows, { endTarget });
    allStates.push(...states);
    // Always listed for admin management, even with zero questions yet — but only
    // reachable from the learner-facing menu once it actually has content. Hidden
    // ones (Greeting/overview) are still fully editable in the admin grid; only
    // the learner-facing tile list filters them out.
    subTopicsList.push({ id: subTopicId, label: subTopicName, hidden: meta.isGreeting || meta.isOverview || undefined });
    if (firstStateId) {
      menuOptions.push({ id: subTopicId, label: subTopicName, next: firstStateId });
    }
  }

  // A topic with its own Greeting/Overview intro already said hello — repeating
  // "Welcome to X!" on the tile menu right after reads as a second, redundant
  // greeting. Only topics with no intro (nothing else has welcomed the learner yet)
  // get the fuller line.
  const menuMessage =
    greetingMeta || overviewMeta
      ? 'Please select a topic you would like to learn about.'
      : `Welcome to ${topicName}! Please select a topic you would like to learn about.`;

  allStates.push({
    id: menuId,
    type: 'menu',
    module: moduleId,
    message: menuMessage,
    options: menuOptions,
  });

  return {
    moduleId,
    moduleFileName: `${moduleId.replace(/_/g, '-')}.json`,
    title: topicName,
    entryState: menuId,
    states: allStates,
    registryEntry: { id: moduleId, title: topicName, available: true, entryState: menuId, subTopics: subTopicsList },
    mainMenuOption: { id: moduleId, label: topicName, next: topicEntryStateId },
  };
}

function importCsv(csvText) {
  const rows = parseRows(csvText);
  const grouped = groupByTopicAndSubTopic(rows);
  return grouped.map(({ topicName, subTopics }) => buildTopic(topicName, subTopics));
}

module.exports = { importCsv, buildTopic, groupByTopicAndSubTopic, validateRow, parseRows };
