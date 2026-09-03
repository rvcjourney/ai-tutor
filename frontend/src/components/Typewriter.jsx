import { useEffect, useMemo, useRef, useState } from 'react';
import RichText from './RichText';
import { findImageLineRanges } from '../utils/richText';

const TICK_MS = 20;
const TARGET_TICKS = 55; // any length of text finishes typing in roughly the same
// wall-clock time — short questions still feel deliberate, long lesson-style
// answers don't take forever.

export default function Typewriter({ text, onDone, plain, firstLineClassName }) {
  const [revealed, setRevealed] = useState(0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // Only relevant in rich (non-plain) mode — a question's `plain` reveal is a
  // title, never an image line.
  const imageRanges = useMemo(() => (plain ? [] : findImageLineRanges(text)), [text, plain]);

  useEffect(() => {
    setRevealed(0);
  }, [text]);

  useEffect(() => {
    if (!text) return undefined;
    if (revealed >= text.length) {
      onDoneRef.current?.();
      return undefined;
    }
    const chunk = Math.max(1, Math.ceil(text.length / TARGET_TICKS));
    const timer = setTimeout(() => setRevealed((r) => Math.min(text.length, r + chunk)), TICK_MS);
    return () => clearTimeout(timer);
  }, [text, revealed]);

  if (plain) {
    return <>{text ? text.slice(0, revealed) : ''}</>;
  }

  // The reveal cursor lands mid-character inside an image line on most ticks —
  // `![alt](https://exa` or a half-typed bare URL isn't recognizable as an image
  // yet, so it would otherwise flash by as raw text before "snapping" into a
  // picture. Clamp the cursor back to just before that line while it's pending,
  // and show a loading placeholder in its place instead — once the reveal budget
  // has actually passed the whole line, it renders as the real image.
  const pendingRange = imageRanges.find((r) => revealed > r.start && revealed < r.end);
  const effectiveRevealed = pendingRange ? pendingRange.start : revealed;
  const visible = text ? text.slice(0, effectiveRevealed) : '';

  return (
    <>
      <RichText text={visible} firstLineClassName={firstLineClassName} />
      {pendingRange && (
        <div className="typing-dots image-loading-dots">
          <span className="typing-dot" />
          <span className="typing-dot" />
          <span className="typing-dot" />
        </div>
      )}
    </>
  );
}
