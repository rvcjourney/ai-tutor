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

export default function TurnCard({
  message,
  options,
  inputType,
  optionsVariant,
  screenType,
  feedback,
  onSelectOption,
  onSendText,
  disabled,
}) {
  const feedbackMeta = FEEDBACK_META[feedback];
  const screenMeta = SCREEN_META[screenType];
  const cardClass = feedbackMeta ? feedbackMeta.className : screenMeta ? screenMeta.className : '';

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
      <div className="turn-input">
        {inputType === 'options' && (
          <OptionButtons options={options} onSelect={onSelectOption} disabled={disabled} variant={optionsVariant} />
        )}
        {inputType === 'text' && <ChatInputBar onSend={onSendText} disabled={disabled} />}
        {/* Defensive fallback — no state currently has a terminal/no-input type, but
            if one ever does, this keeps the screen from silently dead-ending. */}
        {inputType === 'none' && !disabled && <p className="chat-ended">Reload the page to start a new session.</p>}
      </div>
    </div>
  );
}
