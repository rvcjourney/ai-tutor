import BotMessage from './BotMessage';
import { formatMinutesLeft } from '../utils/time';

export default function ModuleList({ message, options, modules, onSelect, disabled }) {
  const modulesById = new Map((modules || []).map((m) => [m.id, m]));

  return (
    <div className="module-list-screen">
      <BotMessage message={message} />
      <div className="module-list">
        {options.map((option) => {
          const stats = modulesById.get(option.id);
          const percent = stats?.percent ?? 0;
          const timeLabel = stats ? formatMinutesLeft(stats.estimatedMinutesLeft) : null;
          return (
            <button
              key={option.id}
              className="module-tile"
              disabled={disabled}
              onClick={() => onSelect(option)}
            >
              <span className="module-title">{option.label}</span>
              {stats && (
                <>
                  <div className="module-progress-track">
                    <div className="module-progress-fill" style={{ width: `${percent}%` }} />
                  </div>
                  <span className="module-progress-label">
                    {stats.completedSubTopics}/{stats.totalSubTopics} topics · {percent}%{timeLabel ? ` · ${timeLabel}` : ''}
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
