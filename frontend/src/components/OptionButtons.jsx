const MCQ_LETTERS = new Set(['A', 'B', 'C', 'D']);

export default function OptionButtons({ options, onSelect, disabled, variant }) {
  if (!options.length) return null;

  if (variant === 'mcq') {
    return (
      <div className="mcq-grid">
        {options.map((option) => {
          const isChoice = MCQ_LETTERS.has(option.id);
          return (
            <button
              key={option.id}
              className={isChoice ? 'mcq-choice' : 'mcq-nav'}
              disabled={disabled}
              onClick={() => onSelect(option)}
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
        <button className="qa-primary-btn" disabled={disabled} onClick={() => onSelect(primary)}>
          {primary.label}
        </button>
        {secondary.length > 0 && (
          <div className="qa-secondary-row">
            {secondary.map((option) => (
              <button key={option.id} className="qa-secondary-btn" disabled={disabled} onClick={() => onSelect(option)}>
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
      {options.map((option) => (
        <button key={option.id} disabled={disabled} onClick={() => onSelect(option)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}
