import BotMessage from './BotMessage';
import SubTopicTileGrid from './SubTopicTileGrid';

export default function SubTopicList({ message, options, subTopics, onSelect, disabled }) {
  return (
    <div className="module-list-screen">
      <BotMessage message={message} />
      <SubTopicTileGrid options={options} subTopics={subTopics} onSelect={onSelect} disabled={disabled} />
    </div>
  );
}
