import OptionButtons from './OptionButtons';
import ChatInputBar from './ChatInputBar';
import RichText from './RichText';

const FEEDBACK_META = {
  correct: { className: 'feedback-correct', icon: '✓', label: 'Correct' },
  incorrect: { className: 'feedback-incorrect', icon: '✕', label: 'Not quite' },
};

const SCREEN_META = {
  fact: { icon: '📘', className: 'qa-fact' },
};

// The choice grid for an already-answered MCQ — same A/B/C/D layout as the live
// question, but locked (no onClick) and highlighted: the correct choice always
// green, and — when known; not on a resumed session — the learner's own wrong
// pick also shown red, so it reads as "you picked this, the right one was that"
// rather than just disappearing once answered.
function AnsweredMcqChoices({ mcqChoices }) {
  return (
    <div className="mcq-grid">
      {mcqChoices.options.map((option) => {
        const isCorrect = option.id === mcqChoices.correctOptionId;
        const isWrongPick = !isCorrect && option.id === mcqChoices.selectedOptionId;
        const cls = ['mcq-choice', 'mcq-choice-locked'];
        if (isCorrect) cls.push('mcq-choice-correct');
        if (isWrongPick) cls.push('mcq-choice-incorrect');
        return (
          <div key={option.id} className={cls.join(' ')}>
            <span className="mcq-letter">{option.id}</span>
            <span>{option.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function TurnCard({
  message,
  options,
  inputType,
  optionsVariant,
  screenType,
  feedback,
  mcqChoices,
  revealMessage,
  onSelectOption,
  onSendText,
  disabled,
}) {
  const feedbackMeta = FEEDBACK_META[feedback];
  const screenMeta = SCREEN_META[screenType];
  const cardClass = feedbackMeta ? feedbackMeta.className : screenMeta ? screenMeta.className : '';
  const isAnsweredMcq = optionsVariant === 'mcq-answered' && mcqChoices;

  return (
    <div className={`turn-card ${cardClass}`}>
      {feedbackMeta && (
        <div className={`feedback-badge ${feedbackMeta.className}`}>
          <span className="feedback-icon">{feedbackMeta.icon}</span>
          {feedbackMeta.label}
        </div>
      )}
      <div className="turn-message">
        <RichText text={message} firstLineClassName={screenType === 'fact' ? 'fact-question' : undefined} />
      </div>

      {isAnsweredMcq ? (
        <>
          <AnsweredMcqChoices mcqChoices={mcqChoices} />
          <div className="turn-message mcq-reveal-message">
            <RichText text={revealMessage} />
          </div>
          <div className="mcq-continue-row">
            <button className="mcq-continue-btn" disabled={disabled} onClick={() => onSelectOption(options[0])}>
              {options[0]?.label || 'Continue ▸'}
            </button>
          </div>
        </>
      ) : (
        <div className="turn-input">
          {inputType === 'options' && (
            <OptionButtons options={options} onSelect={onSelectOption} disabled={disabled} variant={optionsVariant} />
          )}
          {inputType === 'text' && <ChatInputBar onSend={onSendText} disabled={disabled} />}
          {/* Defensive fallback — no state currently has a terminal/no-input type, but
              if one ever does, this keeps the screen from silently dead-ending. */}
          {inputType === 'none' && !disabled && <p className="chat-ended">Reload the page to start a new session.</p>}
        </div>
      )}
    </div>
  );
}
