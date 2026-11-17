package com.aitutor.engine;

import com.aitutor.dto.ModuleProgressDto;
import com.aitutor.dto.ProgressSummaryDto;
import com.aitutor.dto.SubTopicProgressDto;
import com.aitutor.entity.SubTopicCompletionEntity;
import com.aitutor.entity.SubTopicItemProgressEntity;
import com.aitutor.model.ModuleEntry;
import com.aitutor.model.Option;
import com.aitutor.model.State;
import com.aitutor.model.SubTopicEntry;
import com.aitutor.repository.SubTopicCompletionRepository;
import com.aitutor.repository.SubTopicItemProgressRepository;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;

/**
 * Port of backend/src/engine/progressSummary.js, since revised to fix three
 * real inconsistencies between the header, topic tiles, and sub-topic tiles
 * that surfaced in testing:
 *
 * 1. The topic tile's percent is now item-weighted (items seen ÷ items total,
 *    across that topic's *visible* sub-topics) instead of whole-sub-topics-
 *    completed-ratio — the old version showed "0%" for a learner 93% through
 *    every sub-topic, since partial progress didn't count until a sub-topic
 *    was entirely finished. The "X/Y topics" *count* text is unchanged — it's
 *    still how many sub-topics are fully done, which is still meaningful on
 *    its own.
 * 2. Hidden Greeting/Overview sub-topics are now excluded from the overall
 *    percent and the time estimate, matching how they're already excluded
 *    from the topic tile's "X/Y topics" count. Previously the header moved
 *    when a learner read an intro screen, even though no tile reflected that —
 *    the header couldn't be derived from what was on screen.
 * 3. Percentages round *down*, not to the nearest whole number — so 199/200
 *    items no longer displays as "100% complete" while one item remains.
 *
 * Time estimate is still content-based: instead of a flat "1 minute per
 * question," it reads the actual remaining text (question + answer / choices
 * + explanation) and estimates from real reading speed, plus a small fixed
 * overhead per item for the tap/decide interaction.
 */
@Service
public class ProgressSummaryService {

    private static final int READING_WORDS_PER_MINUTE = 200;
    private static final int SECONDS_PER_Q_INTERACTION = 5;
    private static final int SECONDS_PER_MCQ_INTERACTION = 15;
    private static final Pattern ITEM_POSITION = Pattern.compile("_(?:Q|MCQ)(\\d+)$");
    private static final Pattern WHITESPACE = Pattern.compile("\\s+");

    private final ConversationCache cache;
    private final SubTopicCompletionRepository completionRepository;
    private final SubTopicItemProgressRepository itemProgressRepository;

    public ProgressSummaryService(ConversationCache cache, SubTopicCompletionRepository completionRepository,
                                   SubTopicItemProgressRepository itemProgressRepository) {
        this.cache = cache;
        this.completionRepository = completionRepository;
        this.itemProgressRepository = itemProgressRepository;
    }

    private int countWords(String text) {
        if (text == null || text.isBlank()) return 0;
        return WHITESPACE.split(text.trim()).length;
    }

    private int itemPositionFromId(String id) {
        var matcher = ITEM_POSITION.matcher(id);
        return matcher.find() ? Integer.parseInt(matcher.group(1)) : 0;
    }

    private record SubTopicStates(List<State> qStates, List<State> mcqStates, int totalItems) {
    }

    private SubTopicStates getSubTopicStates(String moduleId, String subTopicId) {
        List<State> states = cache.getAllStates().stream()
                .filter(s -> moduleId.equals(s.module) && subTopicId.equals(s.subTopic))
                .toList();
        List<State> qStates = states.stream().filter(s -> "fact".equals(s.screenType))
                .sorted((a, b) -> Integer.compare(itemPositionFromId(a.id), itemPositionFromId(b.id))).toList();
        List<State> mcqStates = states.stream().filter(s -> "mcq".equals(s.type))
                .sorted((a, b) -> Integer.compare(itemPositionFromId(a.id), itemPositionFromId(b.id))).toList();
        return new SubTopicStates(qStates, mcqStates, qStates.size() + mcqStates.size());
    }

    /** Seconds of reading + interaction time remaining in one sub-topic, counting
     *  only the items past whatever position the learner has already reached. */
    private double getSubTopicRemainingSeconds(List<State> qStates, List<State> mcqStates, int itemsSeen) {
        double seconds = 0;

        for (int i = 0; i < qStates.size(); i++) {
            int position = i + 1;
            if (position <= itemsSeen) continue;
            seconds += (countWords(qStates.get(i).message) / (double) READING_WORDS_PER_MINUTE) * 60 + SECONDS_PER_Q_INTERACTION;
        }

        for (int i = 0; i < mcqStates.size(); i++) {
            int position = qStates.size() + i + 1;
            if (position <= itemsSeen) continue;
            State s = mcqStates.get(i);
            int choiceWords = (s.options == null ? List.<Option>of() : s.options).stream()
                    .filter(o -> !o.isNavigate())
                    .mapToInt(o -> countWords(o.label))
                    .sum();
            int words = countWords(s.message) + choiceWords + countWords(s.revealMessage);
            seconds += (words / (double) READING_WORDS_PER_MINUTE) * 60 + SECONDS_PER_MCQ_INTERACTION;
        }

        return seconds;
    }

    /** Rounds down, not to the nearest whole number — so e.g. 199/200 items
     *  shows as 99%, not 100%, while one item still remains. */
    private int percentOf(int seen, int total) {
        return total > 0 ? (int) Math.floor((seen * 100.0) / total) : 0;
    }

    public ProgressSummaryDto getProgressSummary(Long userId) {
        List<SubTopicCompletionEntity> completed = completionRepository.findByUserId(userId);
        Set<String> completedSet = new HashSet<>();
        for (SubTopicCompletionEntity c : completed) {
            completedSet.add(c.getModuleId() + ":" + c.getSubTopicId());
        }

        Map<String, Integer> itemProgressMap = new HashMap<>();
        for (SubTopicItemProgressEntity p : itemProgressRepository.findByUserId(userId)) {
            itemProgressMap.put(p.getModuleId() + ":" + p.getSubTopicId(), p.getItemsSeen());
        }

        int totalSubTopics = 0;
        int totalCompleted = 0;
        // Visible sub-topics only, from here down — a hidden Greeting/Overview's
        // items no longer feed the overall percent or the time estimate, so the
        // header stays derivable from what's actually shown as tiles.
        int totalItemsAll = 0;
        int totalItemsSeenAll = 0;
        double totalRemainingSeconds = 0;

        List<ModuleProgressDto> modules = new ArrayList<>();
        for (ModuleEntry m : cache.getModulesRegistry()) {
            List<SubTopicEntry> subTopics = m.subTopics == null ? List.of() : m.subTopics;
            double moduleRemainingSeconds = 0;
            List<SubTopicProgressDto> subTopicDetails = new ArrayList<>();
            int visibleCount = 0;
            int visibleCompleted = 0;
            // Item-weighted, visible-sub-topics-only — this is what the topic
            // tile's own percent is now based on, instead of the completed/total
            // sub-topic ratio (which hid all partial progress as 0%).
            int moduleItemsTotal = 0;
            int moduleItemsSeen = 0;

            for (SubTopicEntry st : subTopics) {
                String key = m.id + ":" + st.id;
                boolean isCompleted = completedSet.contains(key);
                SubTopicStates subStates = getSubTopicStates(m.id, st.id);
                int itemsSeen = isCompleted ? subStates.totalItems()
                        : Math.min(itemProgressMap.getOrDefault(key, 0), subStates.totalItems());
                int percent = percentOf(itemsSeen, subStates.totalItems());
                boolean hidden = st.isHidden();

                if (!hidden) {
                    moduleItemsTotal += subStates.totalItems();
                    moduleItemsSeen += itemsSeen;
                    totalItemsAll += subStates.totalItems();
                    totalItemsSeenAll += itemsSeen;
                    if (!isCompleted) {
                        double remaining = getSubTopicRemainingSeconds(subStates.qStates(), subStates.mcqStates(), itemsSeen);
                        moduleRemainingSeconds += remaining;
                        totalRemainingSeconds += remaining;
                    }
                    visibleCount++;
                    if (isCompleted) visibleCompleted++;
                }

                subTopicDetails.add(new SubTopicProgressDto(st.id, st.label, hidden, isCompleted,
                        itemsSeen, subStates.totalItems(), isCompleted ? 100 : percent));
            }

            totalSubTopics += visibleCount;
            totalCompleted += visibleCompleted;
            int modulePercent = percentOf(moduleItemsSeen, moduleItemsTotal);
            modules.add(new ModuleProgressDto(m.id, m.title, m.entryState, visibleCount, visibleCompleted,
                    modulePercent, (int) Math.ceil(moduleRemainingSeconds / 60), subTopicDetails));
        }

        int overallPercent = percentOf(totalItemsSeenAll, totalItemsAll);
        return new ProgressSummaryDto(overallPercent, (int) Math.ceil(totalRemainingSeconds / 60), modules);
    }
}
