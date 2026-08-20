import { parseRichText } from '../utils/richText';

export default function RichText({ text, firstLineClassName }) {
  const blocks = parseRichText(text);

  return (
    <>
      {blocks.map((block, i) =>
        block.type === 'ul' ? (
          <ul key={i} className="rich-list">
            {block.items.map((item, j) => (
              <li key={j}>{item}</li>
            ))}
          </ul>
        ) : (
          <p key={i} className={i === 0 ? firstLineClassName : undefined}>
            {block.text}
          </p>
        )
      )}
    </>
  );
}
