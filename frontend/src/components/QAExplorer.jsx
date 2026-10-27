import { useEffect, useState } from 'react';
import * as chatApi from '../api/chatApi';
import Typewriter from './Typewriter';
import NavFooter from './NavFooter';

const THINKING_PAUSE_MS = 350;

export default function QAExplorer({ moduleId, subTopicId, onContinue, onSelect, disabled }) {
  const [items, setItems] = useState(null); // null = still loading
  const [loadError, setLoadError] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  // 'question' -> typing the question out; 'gap' -> brief thinking pause;
  // 'answer' -> typing the answer out; 'done' -> both fully shown, nav enabled.
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
    if (phase !== 'gap') return undefined;
    const timer = setTimeout(() => setPhase('answer'), THINKING_PAUSE_MS);
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
        <div className="user-bubble">
          <Typewriter text={selected.question} plain onDone={() => setPhase((p) => (p === 'question' ? 'gap' : p))} />
        </div>
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

      {(phase === 'answer' || phase === 'done') && (
        <div className="bot-message-card">
          <div className="bot-bubble">
            <Typewriter text={selected.answer} onDone={() => setPhase((p) => (p === 'answer' ? 'done' : p))} />
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
