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

// A broken/dead link (typo'd URL, an image later taken down) shouldn't leave the
// browser's ugly broken-image icon sitting in the middle of a lesson — just drop
// it from view instead, same as if the row had no image at all.
function handleImageError(event) {
  event.currentTarget.style.display = 'none';
}

export default function RichText({ text, firstLineClassName }) {
  const blocks = parseRichText(text);

  return (
    <>
      {blocks.map((block, i) => {
        if (block.type === 'ul') {
          return (
            <ul key={i} className="rich-list">
              {block.items.map((item, j) => (
                <li key={j}>{renderInline(item)}</li>
              ))}
            </ul>
          );
        }
        if (block.type === 'img') {
          return <img key={i} className="rich-image" src={block.src} alt={block.alt} loading="lazy" onError={handleImageError} />;
        }
        return (
          <p key={i} className={i === 0 ? firstLineClassName : undefined}>
            {renderInline(block.text)}
          </p>
        );
      })}
    </>
  );
}
