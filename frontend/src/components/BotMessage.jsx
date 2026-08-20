import RichText from './RichText';

export default function BotMessage({ message }) {
  return (
    <div className="bot-message-card">
      <div className="bot-bubble">
        <RichText text={message} />
      </div>
    </div>
  );
}
