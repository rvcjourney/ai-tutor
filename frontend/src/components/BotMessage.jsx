export default function BotMessage({ message }) {
  return (
    <div className="bot-message-card">
      <div className="turn-avatar">🎓</div>
      <div className="bot-bubble">
        {message.split('\n').map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
    </div>
  );
}
