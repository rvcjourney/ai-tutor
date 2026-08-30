import { useAppState } from '../hooks/useAppState';
import NamePrompt from './NamePrompt';
import ProgressHeader from './ProgressHeader';
import ModuleList from './ModuleList';
import SubTopicList from './SubTopicList';
import QAExplorer from './QAExplorer';
import TurnCard from './TurnCard';
import TypingIndicator from './TypingIndicator';
import UserBubble from './UserBubble';
import NavFooter from './NavFooter';
import Breadcrumb from './Breadcrumb';

const REDUNDANT_OPTION_IDS = new Set(['back', 'menu']);

export default function Dashboard() {
  const {
    displayName,
    submitName,
    turn,
    progress,
    loading,
    typing,
    lastUserMessage,
    error,
    selectOption,
    sendText,
    skipToQuiz,
    retry,
  } = useAppState();

  if (!displayName) {
    return <NamePrompt onSubmit={submitName} />;
  }

  const moduleForTurn = turn?.moduleId ? progress?.modules?.find((m) => m.id === turn.moduleId) : null;
  const isModuleMenu = Boolean(moduleForTurn && moduleForTurn.entryState === turn.state);
  const isQaExplorer = Boolean(turn && !isModuleMenu && turn.screenType === 'fact' && turn.moduleId && turn.subTopicId);
  const isSubTopicCompletion = Boolean(turn?.subTopicOptions?.length > 0);
  const subTopicForTurn = turn?.subTopicId ? moduleForTurn?.subTopics?.find((st) => st.id === turn.subTopicId) : null;
  // Picking a topic or sub-topic is pure navigation — the breadcrumb already shows
  // where you are, so it doesn't also need a sent-bubble ("Gold Loan" bubble
  // followed immediately by a "Gold Loan" breadcrumb was redundant). The explorer
  // also has its own internal bubble pair for whichever question is selected, so the
  // outer "you tapped this sub-topic" bubble would just be a second, stale one above
  // it. Bubbles stay for real interactions: answering a question, an MCQ choice.
  const showUserBubble = Boolean(turn) && turn.state !== 'MAIN_MENU' && !isModuleMenu && !isQaExplorer && !isSubTopicCompletion;

  return (
    <div className="dashboard">
      <ProgressHeader overallPercent={progress?.overallPercent} estimatedMinutesLeft={progress?.estimatedMinutesLeft} loading={loading} />

      <main className="dashboard-body">
        {error && (
          <div className="turn-card error-card">
            <p>{error}</p>
            <button onClick={retry}>Retry</button>
          </div>
        )}

        {!error && <Breadcrumb topic={moduleForTurn?.title} subTopic={subTopicForTurn?.label} />}

        {!error && showUserBubble && <UserBubble text={lastUserMessage} />}

        {!error && typing && <TypingIndicator />}

        {!error && !typing && turn && turn.state === 'MAIN_MENU' && (
          <ModuleList
            key={turn.state}
            message={turn.message}
            options={turn.options}
            modules={progress?.modules}
            onSelect={selectOption}
            disabled={loading}
          />
        )}

        {!error && !typing && turn && turn.state !== 'MAIN_MENU' && isModuleMenu && (
          <SubTopicList
            key={turn.state}
            message={turn.message}
            options={turn.options}
            subTopics={moduleForTurn.subTopics}
            onSelect={selectOption}
            disabled={loading}
          />
        )}

        {!error && !typing && isQaExplorer && (
          <QAExplorer
            key={turn.state}
            moduleId={turn.moduleId}
            subTopicId={turn.subTopicId}
            onContinue={skipToQuiz}
            onSelect={selectOption}
            disabled={loading}
          />
        )}

        {/* The shared "you finished a sub-topic" screen — same layout as the real
            tile menu (it offers the exact same tiles), letting the learner jump
            straight into another sub-topic instead of forcing a "Back to Topic
            Menu" tap first. Takes priority over the generic TurnCard render below. */}
        {!error && !typing && isSubTopicCompletion && (
          <SubTopicList
            key={turn.state}
            message={turn.message}
            options={turn.subTopicOptions}
            subTopics={moduleForTurn?.subTopics}
            onSelect={selectOption}
            disabled={loading}
          />
        )}

        {!error && !typing && turn && turn.state !== 'MAIN_MENU' && !isModuleMenu && !isQaExplorer && !isSubTopicCompletion && (
          <TurnCard
            key={turn.state}
            message={turn.message}
            options={turn.options.filter((o) => !REDUNDANT_OPTION_IDS.has(o.id))}
            inputType={turn.inputType}
            optionsVariant={turn.optionsVariant}
            screenType={turn.screenType}
            feedback={turn.feedback}
            onSelectOption={selectOption}
            onSendText={sendText}
            disabled={loading}
          />
        )}

      </main>

      {/* QAExplorer renders its own combined fixed bar (Previous/Next stacked above
          this same footer) — rendering it again here would duplicate it. Also
          skipped on the Main Menu itself: "Back to Topic Menu"/"Main Menu" are only
          meaningful once you're actually inside a topic, not while already sitting
          at the screen they'd navigate to. */}
      {!error && turn && !isQaExplorer && turn.state !== 'MAIN_MENU' && (
        <div className="fixed-bottom-bar">
          <NavFooter onSelect={selectOption} disabled={loading} />
        </div>
      )}
    </div>
  );
}
