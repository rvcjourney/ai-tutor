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
  if (type !== 'Q' && type !== 'MCQ') {
    errors.push(`Type must be "Q" or "MCQ", got "${normalized.type || ''}"`);
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

  if (type === 'Q') {
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

function buildStatesForSubTopic(prefix, moduleId, subTopicId, allRows, { endTarget = 'EXPLAIN_FURTHER' } = {}) {
  const qRows = allRows.filter((r) => r.type === 'Q').sort((a, b) => a.num - b.num);
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
        { id: 'back', label: 'Back to topic menu', next: '__MODULE_ENTRY__' },
        { id: 'menu', label: 'Main Menu', next: 'MAIN_MENU' },
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
      { id: 'back', label: 'Back to topic menu', next: '__MODULE_ENTRY__', navigate: true },
      { id: 'menu', label: 'Main Menu', next: 'MAIN_MENU', navigate: true },
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

function buildTopic(topicName, subTopicsMap) {
  const moduleId = slugifyLower(topicName);
  const moduleIdUpper = slugifyUpper(topicName);
  const menuId = `${moduleIdUpper}_MENU`;

  const allStates = [];
  const menuOptions = [];
  const subTopicsList = [];
  // Two reusable naming conventions (any topic, case-insensitive — not BFSI
  // specials):
  // - A sub-topic literally named "Greeting" isn't a separate screen to tap
  //   through — its answer text gets folded straight into the sub-topic menu's
  //   own message, shown above the tiles. Hidden from the tile list.
  // - A sub-topic named the *same as its topic* (an "overview" section, e.g.
  //   topic "BFSI" having its own "BFSI" sub-topic) stays a normal, visible tile,
  //   but finishing it flows straight into the real tile menu instead of the
  //   generic end-of-lesson screen — so "please pick a sector" text that ends an
  //   overview actually lands the learner on real, tappable sector tiles.
  let introMessage = null;

  for (const [subTopicName, rows] of subTopicsMap) {
    const subTopicId = slugifyLower(subTopicName);
    const prefix = `${moduleIdUpper}_${slugifyUpper(subTopicName)}`;
    const normalizedSubTopic = subTopicName.trim().toLowerCase();
    const isIntro = normalizedSubTopic === 'greeting';
    const isOverview = normalizedSubTopic === topicName.trim().toLowerCase();
    if (isIntro) {
      introMessage = rows
        .map((r) => r.answer)
        .filter(Boolean)
        .join('\n\n');
    }
    const { states, firstStateId } = buildStatesForSubTopic(prefix, moduleId, subTopicId, rows, {
      endTarget: isIntro || isOverview ? menuId : undefined,
    });
    allStates.push(...states);
    // Always listed for admin management, even with zero questions yet — but only
    // reachable from the learner-facing menu once it actually has content. Hidden
    // ones (the intro) are still fully editable in the admin grid; only the
    // learner-facing tile list filters them out.
    subTopicsList.push({ id: subTopicId, label: subTopicName, hidden: isIntro || undefined });
    if (firstStateId) {
      menuOptions.push({ id: subTopicId, label: subTopicName, next: firstStateId });
    }
  }

  const defaultMenuMessage = `Welcome to ${topicName}! Please select a topic you would like to learn about.`;
  allStates.push({
    id: menuId,
    type: 'menu',
    module: moduleId,
    // A custom "Greeting" fully replaces the generic default line — showing only
    // what the sheet actually says, not both stacked together. Topics with no
    // Greeting sub-topic still fall back to the generic line, same as before.
    message: introMessage || defaultMenuMessage,
    options: menuOptions,
  });

  return {
    moduleId,
    moduleFileName: `${moduleId.replace(/_/g, '-')}.json`,
    title: topicName,
    entryState: menuId,
    states: allStates,
    registryEntry: { id: moduleId, title: topicName, available: true, entryState: menuId, subTopics: subTopicsList },
    mainMenuOption: { id: moduleId, label: topicName, next: menuId },
  };
}

function importCsv(csvText) {
  const rows = parseRows(csvText);
  const grouped = groupByTopicAndSubTopic(rows);
  return grouped.map(({ topicName, subTopics }) => buildTopic(topicName, subTopics));
}

module.exports = { importCsv, buildTopic, groupByTopicAndSubTopic, validateRow, parseRows };
