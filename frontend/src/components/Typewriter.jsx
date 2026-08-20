import { useEffect, useRef, useState } from 'react';
import RichText from './RichText';

const TICK_MS = 20;
const TARGET_TICKS = 55; // any length of text finishes typing in roughly the same
// wall-clock time — short questions still feel deliberate, long lesson-style
// answers don't take forever.

export default function Typewriter({ text, onDone, plain, firstLineClassName }) {
  const [revealed, setRevealed] = useState(0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

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

  const visible = text ? text.slice(0, revealed) : '';
  return plain ? <>{visible}</> : <RichText text={visible} firstLineClassName={firstLineClassName} />;
}
