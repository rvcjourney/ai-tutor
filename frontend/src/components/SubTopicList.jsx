import BotMessage from './BotMessage';

export default function SubTopicList({ message, options, subTopics, onSelect, disabled }) {
  const subTopicsById = new Map((subTopics || []).map((st) => [st.id, st]));
  // An auto-play intro ("Greeting") isn't meant to be picked separately — it
  // already played when the topic was first opened — so it's excluded from the
  // tile list here even though it's still a real, editable sub-topic underneath.
  const visibleOptions = options.filter((option) => !subTopicsById.get(option.id)?.hidden);

  return (
    <div className="module-list-screen">
      <BotMessage message={message} />
      <div className="module-list">
        {visibleOptions.map((option) => {
          const stats = subTopicsById.get(option.id);
          const percent = stats?.percent ?? 0;
          return (
            <button
              key={option.id}
              className="module-tile subtopic-tile"
              disabled={disabled}
              onClick={() => onSelect(option)}
            >
              <div
                className="subtopic-tile-fill"
                style={{ width: `${percent}%`, borderRightWidth: percent > 0 ? '2px' : '0' }}
              />
              <div className="subtopic-tile-content">
                <span className="module-title">{option.label}</span>
                {stats && (
                  <span className="module-progress-label">
                    {stats.itemsSeen}/{stats.totalItems} covered · {percent}%
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
