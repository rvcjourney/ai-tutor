import { useEffect, useState } from 'react';
import * as chatApi from '../api/chatApi';

export default function QAExplorer({ moduleId, subTopicId, onContinue, disabled }) {
  const [items, setItems] = useState(null); // null = still loading
  const [loadError, setLoadError] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

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
        <div className="turn-avatar">🎓</div>
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
      <div className="bot-message-card">
        <div className="turn-avatar">🎓</div>
        <div className="bot-bubble">
          <p>{selected.answer}</p>
        </div>
      </div>

      <div className="qa-nav-row">
        <button className="qa-nav-btn" onClick={() => setSelectedIndex((i) => i - 1)} disabled={disabled || isFirst}>
          ‹ Previous
        </button>
        <span className="qa-nav-count">
          {selectedIndex + 1} / {items.length}
        </span>
        <button className="qa-nav-btn" onClick={handleNext} disabled={disabled}>
          {isLast ? 'Continue ▸' : 'Next ›'}
        </button>
      </div>
    </div>
  );
}
