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
 * Port of backend/src/engine/progressSummary.js. Content-based time estimate:
 * instead of a flat "1 minute per question," reads the actual remaining text
 * (question + answer / choices + explanation) and estimates from real reading
 * speed, plus a small fixed overhead per item for the tap/decide interaction.
 * Module-tile progress is counted in whole sub-topics (done vs not); sub-topic
 * progress is finer (items seen / total items) so an in-progress sub-topic
 * shows a real running percentage.
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

            for (SubTopicEntry st : subTopics) {
                String key = m.id + ":" + st.id;
                boolean isCompleted = completedSet.contains(key);
                SubTopicStates subStates = getSubTopicStates(m.id, st.id);
                int itemsSeen = isCompleted ? subStates.totalItems()
                        : Math.min(itemProgressMap.getOrDefault(key, 0), subStates.totalItems());
                int percent = subStates.totalItems() > 0 ? Math.round((itemsSeen * 100f) / subStates.totalItems()) : 0;
                totalItemsAll += subStates.totalItems();
                totalItemsSeenAll += itemsSeen;
                if (!isCompleted) {
                    double remaining = getSubTopicRemainingSeconds(subStates.qStates(), subStates.mcqStates(), itemsSeen);
                    moduleRemainingSeconds += remaining;
                    totalRemainingSeconds += remaining;
                }
                boolean hidden = st.isHidden();
                subTopicDetails.add(new SubTopicProgressDto(st.id, st.label, hidden, isCompleted,
                        itemsSeen, subStates.totalItems(), isCompleted ? 100 : percent));
                if (!hidden) {
                    visibleCount++;
                    if (isCompleted) visibleCompleted++;
                }
            }

            totalSubTopics += visibleCount;
            totalCompleted += visibleCompleted;
            int modulePercent = visibleCount > 0 ? Math.round((visibleCompleted * 100f) / visibleCount) : 0;
            modules.add(new ModuleProgressDto(m.id, m.title, m.entryState, visibleCount, visibleCompleted,
                    modulePercent, (int) Math.ceil(moduleRemainingSeconds / 60), subTopicDetails));
        }

        int overallPercent = totalItemsAll > 0 ? Math.round((totalItemsSeenAll * 100f) / totalItemsAll) : 0;
        return new ProgressSummaryDto(overallPercent, (int) Math.ceil(totalRemainingSeconds / 60), modules);
    }
}
