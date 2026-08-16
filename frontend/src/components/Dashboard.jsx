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
  const subTopicForTurn = turn?.subTopicId ? moduleForTurn?.subTopics?.find((st) => st.id === turn.subTopicId) : null;
  // Picking a topic or sub-topic is pure navigation — the breadcrumb already shows
  // where you are, so it doesn't also need a sent-bubble ("Gold Loan" bubble
  // followed immediately by a "Gold Loan" breadcrumb was redundant). The explorer
  // also has its own internal bubble pair for whichever question is selected, so the
  // outer "you tapped this sub-topic" bubble would just be a second, stale one above
  // it. Bubbles stay for real interactions: answering a question, an MCQ choice.
  const showUserBubble = Boolean(turn) && turn.state !== 'MAIN_MENU' && !isModuleMenu && !isQaExplorer;

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
            disabled={loading}
          />
        )}

        {!error && !typing && turn && turn.state !== 'MAIN_MENU' && !isModuleMenu && !isQaExplorer && (
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

        {!error && turn && <NavFooter onSelect={selectOption} disabled={loading} />}
      </main>
    </div>
  );
}
