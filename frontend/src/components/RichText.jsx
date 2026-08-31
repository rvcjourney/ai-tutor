import { parseRichText } from '../utils/richText';

// `**word**` bolds a word/phrase — the one inline markup content authors get,
// kept deliberately to this single marker rather than a full markdown parser
// (no existing content uses literal "*", so this is unambiguous to introduce).
function renderInline(text) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  // split() with a capturing group alternates plain/matched text: even indices
  // are the surrounding plain text, odd indices are what was inside **...**.
  return parts.map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part));
}

export default function RichText({ text, firstLineClassName }) {
  const blocks = parseRichText(text);

  return (
    <>
      {blocks.map((block, i) =>
        block.type === 'ul' ? (
          <ul key={i} className="rich-list">
            {block.items.map((item, j) => (
              <li key={j}>{renderInline(item)}</li>
            ))}
          </ul>
        ) : (
          <p key={i} className={i === 0 ? firstLineClassName : undefined}>
            {renderInline(block.text)}
          </p>
        )
      )}
    </>
  );
}
