const COLUMNS = [
  ['Topic', 'topic'],
  ['Sub-Topic', 'subTopic'],
  ['Type', 'type'],
  ['#', 'num'],
  ['Question', 'question'],
  ['Choice A', 'choiceA'],
  ['Choice B', 'choiceB'],
  ['Choice C', 'choiceC'],
  ['Choice D', 'choiceD'],
  ['Correct', 'correct'],
  ['Answer/Explanation', 'answer'],
];

function csvField(value) {
  const str = value == null ? '' : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Serializes rows (the same flat shape getTopicRows()/csvImporter.js use) back into
 *  a CSV an admin can download, edit in a spreadsheet, and re-upload through the
 *  existing Preview/Publish path — round-tripping through the exact column names
 *  parseRows() already recognizes, so nothing new needs to understand this format. */
function rowsToCsv(rows) {
  const lines = [COLUMNS.map(([header]) => csvField(header)).join(',')];
  for (const row of rows) {
    lines.push(COLUMNS.map(([, key]) => csvField(row[key])).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

module.exports = { rowsToCsv };
