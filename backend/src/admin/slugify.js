/** Normalizes free text (a Topic/Sub-Topic name) into an identifier segment.
 *  "Interest & Repayment" -> "interest_and_repayment" (lower) or "INTEREST_AND_REPAYMENT" (upper). */
function slugifyCore(text) {
  return String(text)
    .trim()
    .replace(/&/g, ' and ')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

function slugifyLower(text) {
  return slugifyCore(text).toLowerCase();
}

function slugifyUpper(text) {
  return slugifyCore(text).toUpperCase();
}

module.exports = { slugifyLower, slugifyUpper };
