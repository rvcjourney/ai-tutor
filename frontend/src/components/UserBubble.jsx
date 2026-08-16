export default function UserBubble({ text }) {
  if (!text) return null;
  return (
    <div className="user-bubble-row">
      <div className="user-bubble">{text}</div>
    </div>
  );
}
