// Some Answer/Explanation cells pack a whole mini-lesson into one CSV field —
// paragraphs plus a bullet list, authored in the sheet with a leading tab or an
// emoji bullet (🏦, 💰, ➡️, …) before each item. Excel/CSV round-trips mangle those
// emoji two different ways depending on the pipeline: some produce literal "?"
// characters, others produce the Unicode replacement character "�" (U+FFFD) — the
// generic "this byte couldn't be decoded at all" marker, used indiscriminately for
// lost bullets, dashes, *and* apostrophes ("Let�s", "You�ve"). Both are recovered
// by shape rather than by knowing the original character.

const REPLACEMENT_CHAR = '�';

// A genuine "?" is always glued straight onto the word before it ("Bank?") —
// English never uses a floating " ? " or a repeated "??"/"???" as real
// punctuation, so those shapes are safe to treat as a lost emoji/arrow instead.
function collapseSpacing(text) {
  return text
    .replace(/ \? /g, ' → ')
    .replace(/(^|\s)\?{2,}(?=\s|$)/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

// "�" only ever means "an apostrophe" when it's glued onto a word right where a
// contraction ending would be (Let�s, You�ve, wasn�t) — never at a line start
// (that's a lost bullet, always preceded by a newline/nothing, never a letter).
// Anywhere else it's glued between two words, it was a dash.
function repairReplacementChar(text) {
  return text
    .replace(new RegExp(`(\\w)${REPLACEMENT_CHAR}(s|t|d|ve|re|ll)\\b`, 'gi'), "$1'$2")
    .replace(new RegExp(` ${REPLACEMENT_CHAR} `, 'g'), ' — ')
    .replace(new RegExp(`(\\w)${REPLACEMENT_CHAR}(\\w)`, 'g'), '$1—$2');
}

function isBulletLine(line) {
  const markerRun = new RegExp(`^(?:[${REPLACEMENT_CHAR}?]+\\s*)+\\S`);
  return /^\t/.test(line) || markerRun.test(line.trim());
}

function stripBulletMarker(line) {
  const markerRun = new RegExp(`^(?:[${REPLACEMENT_CHAR}?]+\\s*)+`);
  return collapseSpacing(line.replace(/^\t+/, '').replace(markerRun, ''));
}

// A CSV-escaping quirk from some source sheets wraps an entire cell's content in
// one literal `"..."` pair (from a doubled `""` at the very start/end of a quoted
// field) — not a real quotation, just the whole multi-paragraph blob accidentally
// fenced. Safe to drop only when it wraps the *entire* text, not a genuine quote
// that starts a sentence.
function stripOuterQuoteWrap(text) {
  const trimmed = text.trim();
  if (trimmed.length > 1 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export function parseRichText(text) {
  if (!text) return [];
  const repaired = repairReplacementChar(stripOuterQuoteWrap(String(text)));
  const lines = repaired.replace(/\r/g, '').split('\n');
  const blocks = [];
  let currentList = null;

  for (const line of lines) {
    if (!line.trim()) {
      currentList = null;
      continue;
    }
    if (isBulletLine(line)) {
      const cleaned = stripBulletMarker(line);
      if (!cleaned) continue;
      if (!currentList) {
        currentList = { type: 'ul', items: [] };
        blocks.push(currentList);
      }
      currentList.items.push(cleaned);
    } else {
      currentList = null;
      const cleaned = collapseSpacing(line);
      if (cleaned) blocks.push({ type: 'p', text: cleaned });
    }
  }

  return blocks;
}
