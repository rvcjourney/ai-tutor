// Closure moment: instructional design treats explicit acknowledgment of
// finishing as a retention aid, distinct from the ambient progress bar quietly
// reading 100%. Shown exactly once, the turn the topic actually transitions to
// fully complete (see Dashboard's justCompletedTopic tracking) — not on every
// later revisit, where it would just be noise.
export default function TopicCompleteBanner({ title }) {
  return (
    <div className="topic-complete-banner">
      <span className="topic-complete-icon" aria-hidden="true">🎉</span>
      <div>
        <p className="topic-complete-title">Topic complete!</p>
        <p className="topic-complete-sub">You've covered every section in {title}.</p>
      </div>
    </div>
  );
}
