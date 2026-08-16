import OptionButtons from './OptionButtons';
import ChatInputBar from './ChatInputBar';

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
      {feedbackMeta ? (
        <div className={`feedback-badge ${feedbackMeta.className}`}>
          <span className="feedback-icon">{feedbackMeta.icon}</span>
          {feedbackMeta.label}
        </div>
      ) : (
        <div className={`turn-avatar ${screenMeta ? 'turn-avatar-tinted' : ''}`}>{screenMeta ? screenMeta.icon : '🎓'}</div>
      )}
      <div className="turn-message">
        {message.split('\n').map((line, i) => (
          <p key={i} className={screenType === 'fact' && i === 0 ? 'fact-question' : undefined}>
            {line}
          </p>
        ))}
      </div>
      <div className="turn-input">
        {inputType === 'options' && (
          <OptionButtons options={options} onSelect={onSelectOption} disabled={disabled} variant={optionsVariant} />
        )}
        {inputType === 'text' && <ChatInputBar onSend={onSendText} disabled={disabled} />}
        {inputType === 'none' && !disabled && <p className="chat-ended">✓ Conversation ended — reload to start again.</p>}
      </div>
    </div>
  );
}
