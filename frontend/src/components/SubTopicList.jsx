import BotMessage from './BotMessage';

export default function SubTopicList({ message, options, subTopics, onSelect, disabled }) {
  const subTopicsById = new Map((subTopics || []).map((st) => [st.id, st]));

  return (
    <div className="module-list-screen">
      <BotMessage message={message} />
      <div className="module-list">
        {options.map((option) => {
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
