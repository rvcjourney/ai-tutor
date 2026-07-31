export default function MessageBubble({ sender, text }) {
  const isBot = sender === 'bot';
  return (
    <div className={`bubble-row ${sender}`}>
      {isBot && <div className="avatar bot-avatar-sm">🎓</div>}
      <div className={`bubble ${sender}`}>
        {text.split('\n').map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
    </div>
  );
}
