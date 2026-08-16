const { getModulesRegistry, getAllStates } = require('./conversationLoader');
const subTopicProgressRepository = require('../repositories/subTopicProgressRepository');
const subTopicItemProgressRepository = require('../repositories/subTopicItemProgressRepository');

// Content-based time estimate: instead of guessing a flat "1 minute per question,"
// this reads the actual remaining text (question + answer / choices + explanation)
// and estimates from real reading speed, plus a small fixed overhead per item for
// the tap/decide-and-answer interaction itself. Moves correctly whether the
// remaining items are three one-line facts or three dense paragraphs.
const READING_WORDS_PER_MINUTE = 200;
const SECONDS_PER_Q_INTERACTION = 5;
const SECONDS_PER_MCQ_INTERACTION = 15;

function countWords(text) {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function itemPositionFromId(id) {
  const match = /_(?:Q|MCQ)(\d+)$/.exec(id);
  return match ? parseInt(match[1], 10) : 0;
}

function getSubTopicStates(moduleId, subTopicId) {
  const states = getAllStates().filter((s) => s.module === moduleId && s.subTopic === subTopicId);
  const qStates = states.filter((s) => s.screenType === 'fact').sort((a, b) => itemPositionFromId(a.id) - itemPositionFromId(b.id));
  const mcqStates = states.filter((s) => s.type === 'mcq').sort((a, b) => itemPositionFromId(a.id) - itemPositionFromId(b.id));
  return { qStates, mcqStates, totalItems: qStates.length + mcqStates.length };
}

/** Seconds of reading + interaction time remaining in one sub-topic, counting only
 *  the items past whatever position the learner has already reached. */
function getSubTopicRemainingSeconds(qStates, mcqStates, itemsSeen) {
  let seconds = 0;

  qStates.forEach((s, i) => {
    const position = i + 1;
    if (position <= itemsSeen) return;
    seconds += (countWords(s.message) / READING_WORDS_PER_MINUTE) * 60 + SECONDS_PER_Q_INTERACTION;
  });

  mcqStates.forEach((s, i) => {
    const position = qStates.length + i + 1;
    if (position <= itemsSeen) return;
    const choiceWords = (s.options || [])
      .filter((o) => !o.navigate)
      .reduce((sum, o) => sum + countWords(o.label), 0);
    const words = countWords(s.message) + choiceWords + countWords(s.revealMessage);
    seconds += (words / READING_WORDS_PER_MINUTE) * 60 + SECONDS_PER_MCQ_INTERACTION;
  });

  return seconds;
}

/** Builds the "% complete" summary for a learner: overall, per module, and per
 *  sub-topic. Module-tile progress is still counted in whole sub-topics (done vs
 *  not) — coarse, but right for a module tile ("3/6 topics"). Sub-topic-level
 *  progress is finer: a real "items seen / total items" fraction from
 *  sub_topic_item_progress, so a sub-topic the learner is partway through shows an
 *  accurate running % instead of just done/not-done. The top-level overallPercent
 *  is item-weighted across every sub-topic in every module (total items seen over
 *  total items that exist) so it moves as soon as the learner makes any progress,
 *  not just when a whole sub-topic gets finished. estimatedMinutesLeft is a
 *  content-based read on the same remaining items, not a flat per-question guess. */
function getProgressSummary(userId) {
  const completed = subTopicProgressRepository.getCompletedForUser(userId);
  const completedSet = new Set(completed.map((c) => `${c.module_id}:${c.sub_topic_id}`));

  const itemProgress = subTopicItemProgressRepository.getProgressForUser(userId);
  const itemProgressMap = new Map(itemProgress.map((p) => [`${p.module_id}:${p.sub_topic_id}`, p.items_seen]));

  let totalSubTopics = 0;
  let totalCompleted = 0;
  let totalItemsAll = 0;
  let totalItemsSeenAll = 0;
  let totalRemainingSeconds = 0;

  const modules = getModulesRegistry().map((m) => {
    const subTopics = Array.isArray(m.subTopics) ? m.subTopics : [];
    let moduleRemainingSeconds = 0;
    const subTopicDetails = subTopics.map((st) => {
      const key = `${m.id}:${st.id}`;
      const isCompleted = completedSet.has(key);
      const { qStates, mcqStates, totalItems } = getSubTopicStates(m.id, st.id);
      const itemsSeen = isCompleted ? totalItems : Math.min(itemProgressMap.get(key) || 0, totalItems);
      const percent = totalItems ? Math.round((itemsSeen / totalItems) * 100) : 0;
      totalItemsAll += totalItems;
      totalItemsSeenAll += itemsSeen;
      if (!isCompleted) {
        const remaining = getSubTopicRemainingSeconds(qStates, mcqStates, itemsSeen);
        moduleRemainingSeconds += remaining;
        totalRemainingSeconds += remaining;
      }
      return {
        id: st.id,
        label: st.label,
        completed: isCompleted,
        itemsSeen,
        totalItems,
        percent: isCompleted ? 100 : percent,
      };
    });
    const completedSubTopics = subTopicDetails.filter((st) => st.completed).length;
    totalSubTopics += subTopics.length;
    totalCompleted += completedSubTopics;
    return {
      id: m.id,
      title: m.title,
      entryState: m.entryState || null,
      totalSubTopics: subTopics.length,
      completedSubTopics,
      percent: subTopics.length ? Math.round((completedSubTopics / subTopics.length) * 100) : 0,
      estimatedMinutesLeft: Math.ceil(moduleRemainingSeconds / 60),
      subTopics: subTopicDetails,
    };
  });

  return {
    overallPercent: totalItemsAll ? Math.round((totalItemsSeenAll / totalItemsAll) * 100) : 0,
    estimatedMinutesLeft: Math.ceil(totalRemainingSeconds / 60),
    modules,
  };
}

module.exports = { getProgressSummary };
