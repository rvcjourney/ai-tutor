import { formatMinutesLeft } from '../utils/time';

export default function ProgressHeader({ overallPercent, estimatedMinutesLeft, loading }) {
  const timeLabel = formatMinutesLeft(estimatedMinutesLeft);
  return (
    <header className="app-header">
      <div className="bot-avatar">🎓</div>
      <div className="app-header-text">
        <h1>AI Tutor</h1>
        <div className="overall-progress">
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${overallPercent ?? 0}%` }} />
          </div>
          <span className="progress-percent">
            {overallPercent ?? 0}% complete{timeLabel ? ` · ${timeLabel}` : ''}
          </span>
        </div>
      </div>
      {loading && <div className="header-spinner" aria-label="Loading" />}
    </header>
  );
}
