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

// A line that's *entirely* `![alt text](https://...)` — standard markdown image
// syntax, kept to whole-line-only (not mixed into a sentence) so the URL is
// matched directly off the trimmed line, before any of the prose-cleanup passes
// below (collapseSpacing, repairReplacementChar) get a chance to touch it.
const IMAGE_LINE = /^!\[([^\]]*)\]\((\S+)\)$/;

// A line that's *just* a bare URL ending in a common image extension (optionally
// followed by a CDN-style query string, e.g. Pinterest/imgur resize params) — so
// pasting a plain image link straight into the sheet works with no markdown
// syntax required. `![alt](url)` above still wins when a caption is wanted.
const BARE_IMAGE_LINE = /^(https?:\/\/\S+\.(?:jpg|jpeg|png|gif|webp|bmp|svg))(?:\?\S*)?$/i;

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

// Character ranges (start/end offsets into the raw, unmodified `text`) of every
// image line — used by Typewriter to know when the reveal cursor is sitting
// *inside* an image line's markup, so it can pause instead of exposing the raw,
// half-typed `![alt](https://...` / URL text before it's recognizable as an image.
export function findImageLineRanges(text) {
  if (!text) return [];
  const ranges = [];
  let offset = 0;
  for (const line of String(text).split('\n')) {
    const trimmedLine = line.trim();
    if (IMAGE_LINE.test(trimmedLine) || BARE_IMAGE_LINE.test(trimmedLine)) {
      ranges.push({ start: offset, end: offset + line.length });
    }
    offset += line.length + 1; // +1 for the newline consumed by split()
  }
  return ranges;
}

export function parseRichText(text) {
  if (!text) return [];
  const repaired = repairReplacementChar(stripOuterQuoteWrap(String(text)));
  const lines = repaired.replace(/\r/g, '').split('\n');
  const blocks = [];
  let currentList = null;

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) {
      currentList = null;
      continue;
    }
    const imageMatch = IMAGE_LINE.exec(trimmedLine);
    if (imageMatch) {
      currentList = null;
      blocks.push({ type: 'img', alt: imageMatch[1], src: imageMatch[2] });
      continue;
    }
    const bareImageMatch = BARE_IMAGE_LINE.exec(trimmedLine);
    if (bareImageMatch) {
      currentList = null;
      blocks.push({ type: 'img', alt: '', src: trimmedLine });
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
