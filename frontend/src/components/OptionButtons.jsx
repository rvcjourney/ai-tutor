import { useState } from 'react';

const MCQ_LETTERS = new Set(['A', 'B', 'C', 'D']);

// A tapped option used to disable every button and swap straight to the typing
// indicator on the very next render — fast enough that the tap could read as
// having barely registered, with no confirmation of *which* choice was made.
// Holding the pick in a visibly "selected" state for one short beat before
// actually firing onSelect gives that confirmation without meaningfully
// slowing anything down.
const SELECT_HOLD_MS = 180;

export default function OptionButtons({ options, onSelect, disabled, variant }) {
  const [pendingId, setPendingId] = useState(null);

  if (!options.length) return null;

  function handleSelect(option) {
    if (disabled || pendingId) return;
    setPendingId(option.id);
    setTimeout(() => onSelect(option), SELECT_HOLD_MS);
  }

  if (variant === 'mcq') {
    return (
      <div className="mcq-grid">
        {options.map((option) => {
          const isChoice = MCQ_LETTERS.has(option.id);
          const isPending = pendingId === option.id;
          return (
            <button
              key={option.id}
              className={`${isChoice ? 'mcq-choice' : 'mcq-nav'}${isPending ? ' option-selected' : ''}`}
              disabled={disabled || (pendingId !== null && !isPending)}
              onClick={() => handleSelect(option)}
            >
              {isChoice && <span className="mcq-letter">{option.id}</span>}
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  if (variant === 'qa') {
    const [primary, ...secondary] = options;
    return (
      <div className="qa-actions">
        <button
          className={`qa-primary-btn${pendingId === primary.id ? ' option-selected' : ''}`}
          disabled={disabled || (pendingId !== null && pendingId !== primary.id)}
          onClick={() => handleSelect(primary)}
        >
          {primary.label}
        </button>
        {secondary.length > 0 && (
          <div className="qa-secondary-row">
            {secondary.map((option) => (
              <button
                key={option.id}
                className="qa-secondary-btn"
                disabled={disabled || (pendingId !== null && pendingId !== option.id)}
                onClick={() => handleSelect(option)}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="option-buttons">
      {options.map((option) => {
        const isPending = pendingId === option.id;
        return (
          <button
            key={option.id}
            className={isPending ? 'option-selected' : undefined}
            disabled={disabled || (pendingId !== null && !isPending)}
            onClick={() => handleSelect(option)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
