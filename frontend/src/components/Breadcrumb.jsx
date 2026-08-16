export default function Breadcrumb({ topic, subTopic }) {
  if (!topic) return null;
  return (
    <div className="breadcrumb-row">
      <span className="breadcrumb-segment">{topic}</span>
      {subTopic && (
        <>
          <span className="breadcrumb-sep">›</span>
          <span className="breadcrumb-segment breadcrumb-current">{subTopic}</span>
        </>
      )}
    </div>
  );
}
