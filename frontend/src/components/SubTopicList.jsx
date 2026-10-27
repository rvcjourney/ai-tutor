import BotMessage from './BotMessage';
import SubTopicTileGrid from './SubTopicTileGrid';
import TopicObjectives from './TopicObjectives';
import TopicCompleteBanner from './TopicCompleteBanner';

// `topicTitle`/`showObjectives`/`justCompleted` are only ever passed from the
// real "pick a sub-topic" menu (Dashboard's isModuleMenu branch) — the shared
// end-of-sub-topic screen (EXPLAIN_FURTHER) reuses this same component for its
// "jump into another sub-topic" tiles but deliberately doesn't pass them, since
// neither framing nor a completion banner makes sense mid-topic.
export default function SubTopicList({ message, options, subTopics, onSelect, disabled, topicTitle, showObjectives, justCompleted }) {
  return (
    <div className="module-list-screen">
      <BotMessage message={message} />
      {justCompleted && <TopicCompleteBanner title={topicTitle} />}
      {!justCompleted && showObjectives && <TopicObjectives title={topicTitle} subTopics={subTopics} />}
      <SubTopicTileGrid options={options} subTopics={subTopics} onSelect={onSelect} disabled={disabled} />
    </div>
  );
}
