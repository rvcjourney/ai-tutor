import { useState } from 'react';
import BotMessage from './BotMessage';
import { formatMinutesLeft } from '../utils/time';

// A long topic list otherwise just keeps growing — paginating keeps the main
// menu to one screenful (no scrolling hunt for Topic #14) as more content gets
// published. Client-side: the full module list already arrives in one
// response, so paging is just slicing what's already there.
const PAGE_SIZE = 6;

export default function ModuleList({ message, options, modules, onSelect, disabled }) {
  const [page, setPage] = useState(0);
  const modulesById = new Map((modules || []).map((m) => [m.id, m]));

  const totalPages = Math.max(1, Math.ceil(options.length / PAGE_SIZE));
  // Clamp rather than reset to 0 via an effect — options.length can only grow
  // (new topics published) or stay the same between renders of this same
  // screen, so a clamp alone keeps a mid-range page valid without ever needing
  // to silently bounce the learner back to page 1.
  const currentPage = Math.min(page, totalPages - 1);
  const pageOptions = options.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="module-list-screen">
      <BotMessage message={message} />
      <div className="module-list">
        {pageOptions.map((option) => {
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
      {totalPages > 1 && (
        <div className="qa-nav-row module-list-pagination">
          <button type="button" className="qa-nav-btn" disabled={disabled || currentPage === 0} onClick={() => setPage((p) => p - 1)}>
            ‹ Previous
          </button>
          <span className="qa-nav-count">
            {currentPage + 1} / {totalPages}
          </span>
          <button
            type="button"
            className="qa-nav-btn"
            disabled={disabled || currentPage >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            Next ›
          </button>
        </div>
      )}
    </div>
  );
}
