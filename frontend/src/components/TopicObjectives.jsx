// Instructional-design framing: tell the learner what "done" looks like before
// they start, so they can self-monitor progress against it. Built entirely from
// data already on hand (the topic's own sub-topic list — literally its syllabus)
// rather than needing separately authored "objectives" content. Shown only while
// the topic is untouched (see Dashboard's showObjectives calculation) so it
// doesn't become repeat-visit noise once the learner has actually started.
export default function TopicObjectives({ title, subTopics }) {
  const visible = (subTopics || []).filter((st) => !st.hidden);
  if (!visible.length) return null;

  return (
    <div className="topic-objectives">
      <p className="topic-objectives-title">What you'll cover in {title}</p>
      <ul className="topic-objectives-list">
        {visible.map((st) => (
          <li key={st.id}>{st.label}</li>
        ))}
      </ul>
    </div>
  );
}
