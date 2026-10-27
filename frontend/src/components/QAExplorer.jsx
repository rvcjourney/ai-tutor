import { useEffect, useState } from 'react';
import * as chatApi from '../api/chatApi';
import RichText from './RichText';
import NavFooter from './NavFooter';

// Fixed, text-length-independent pacing — matches TurnCard's instant-render
// style instead of typing every question/answer out character by character.
// This explorer exists specifically so a learner can browse back and forth
// through a sub-topic's full Q&A list freely; a multi-second typewriter reveal
// on every single Previous/Next tap worked against exactly that, without a real
// network round trip underneath to justify the wait. The "thinking" beat is
// kept short and constant instead, for the same live-conversation feel without
// the browsing cost.
const READ_PAUSE_MS = 250;
const THINKING_PAUSE_MS = 350;

export default function QAExplorer({ moduleId, subTopicId, onContinue, onSelect, disabled }) {
  const [items, setItems] = useState(null); // null = still loading
  const [loadError, setLoadError] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  // 'question' -> question shown, brief read beat running; 'gap' -> thinking
  // pause (dots); 'done' -> answer shown, nav enabled.
  const [phase, setPhase] = useState('question');

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setLoadError(null);
    setSelectedIndex(0);
    chatApi
      .getSubTopicQa(moduleId, subTopicId)
      .then((data) => {
        if (!cancelled) setItems(data.items);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message || 'Could not load questions.');
      });
    return () => {
      cancelled = true;
    };
  }, [moduleId, subTopicId]);

  useEffect(() => {
    setPhase('question');
  }, [items, selectedIndex]);

  useEffect(() => {
    if (phase !== 'question') return undefined;
    const timer = setTimeout(() => setPhase('gap'), READ_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'gap') return undefined;
    const timer = setTimeout(() => setPhase('done'), THINKING_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  if (loadError) {
    return (
      <div className="turn-card error-card">
        <p>{loadError}</p>
      </div>
    );
  }

  if (!items) {
    return (
      <div className="turn-card typing-card">
        <div className="typing-dots">
          <span className="typing-dot" />
          <span className="typing-dot" />
          <span className="typing-dot" />
        </div>
      </div>
    );
  }

  const selected = items[selectedIndex];
  const isFirst = selectedIndex === 0;
  const isLast = selectedIndex === items.length - 1;
  const navDisabled = disabled || phase !== 'done';

  // On the last question, "Next" has nothing left to advance to locally — it hands
  // off to the graded quiz instead (same fast-forward the old separate "Continue"
  // button used), so there's still exactly one forward action, not two.
  function handleNext() {
    if (isLast) {
      onContinue();
    } else {
      setSelectedIndex((i) => i + 1);
    }
  }

  return (
    <div className="qa-explorer">
      <div className="user-bubble-row">
        <div className="user-bubble">{selected.question}</div>
      </div>

      {phase === 'gap' && (
        <div className="turn-card typing-card">
          <div className="typing-dots">
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </div>
        </div>
      )}

      {phase === 'done' && (
        <div className="bot-message-card">
          <div className="bot-bubble">
            <RichText text={selected.answer} />
          </div>
        </div>
      )}

      <div className="fixed-bottom-bar">
        <div className="qa-nav-row">
          <button className="qa-nav-btn" onClick={() => setSelectedIndex((i) => i - 1)} disabled={navDisabled || isFirst}>
            ‹ Previous
          </button>
          <span className="qa-nav-count">
            {selectedIndex + 1} / {items.length}
          </span>
          <button className="qa-nav-btn" onClick={handleNext} disabled={navDisabled}>
            {isLast ? 'Continue ▸' : 'Next ›'}
          </button>
        </div>
        <NavFooter onSelect={onSelect} disabled={disabled} />
      </div>
    </div>
  );
}
