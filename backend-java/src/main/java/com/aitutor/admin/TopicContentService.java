package com.aitutor.admin;

import com.aitutor.dto.QaItemDto;
import com.aitutor.dto.SubTopicContentDto;
import com.aitutor.dto.TopicContentDto;
import com.aitutor.engine.ConversationCache;
import com.aitutor.exception.AppException;
import com.aitutor.model.ChoiceOption;
import com.aitutor.model.CsvRow;
import com.aitutor.model.ModuleEntry;
import com.aitutor.model.Option;
import com.aitutor.model.State;
import com.aitutor.model.SubTopicEntry;
import com.aitutor.model.WalkItem;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

/** Port of backend/src/admin/topicContent.js. Reconstructs the original Q&A/MCQ
 *  rows from the published state graph, since the raw CSV isn't kept anywhere
 *  after publish — this is what the admin grid, CSV export, and the learner-facing
 *  Q&A explorer all read from. */
@Service
public class TopicContentService {

    private final ConversationCache cache;

    public TopicContentService(ConversationCache cache) {
        this.cache = cache;
    }

    /** Follows the actual "next" links for one sub-topic (from its first fact/MCQ
     *  state through to EXPLAIN_FURTHER). Stops the moment a state's own subTopic
     *  tag no longer matches where the walk started — Greeting/Overview sub-topics
     *  chain straight into a *different* sub-topic instead of ending at
     *  EXPLAIN_FURTHER, and without this check their content would get silently
     *  absorbed into whichever sub-topic walked in first. */
    private List<WalkItem> walkSubTopic(String startId, Map<String, State> statesById, String expectedSubTopic) {
        List<WalkItem> items = new ArrayList<>();
        State current = statesById.get(startId);
        int guard = 0;

        while (current != null && !"EXPLAIN_FURTHER".equals(current.id)
                && expectedSubTopic.equals(current.subTopic) && guard < 500) {
            guard++;
            if ("fact".equals(current.screenType)) {
                String[] parts = current.message.split("\n", 2);
                WalkItem item = new WalkItem();
                item.type = "Q";
                item.question = parts[0];
                item.answer = parts.length > 1 ? parts[1] : "";
                items.add(item);
                Option nextOption = findOption(current, "next");
                current = nextOption != null ? statesById.get(nextOption.next) : null;
            } else if ("mcq".equals(current.type)) {
                List<ChoiceOption> choices = current.options == null ? List.of() : current.options.stream()
                        .filter(o -> !o.isNavigate())
                        .map(o -> new ChoiceOption(o.id, o.label))
                        .collect(Collectors.toList());
                WalkItem item = new WalkItem();
                item.type = "MCQ";
                item.question = current.message;
                item.choices = choices;
                item.correct = current.correctOptionId;
                item.explanation = current.revealMessage;
                items.add(item);
                current = statesById.get(current.next);
            } else {
                break; // unrecognized state shape — stop rather than loop forever
            }
        }

        return items;
    }

    private Option findOption(State state, String id) {
        if (state.options == null) return null;
        return state.options.stream().filter(o -> id.equals(o.id)).findFirst().orElse(null);
    }

    public ModuleEntry getTopicEntry(String moduleId) {
        return cache.getModulesRegistry().stream()
                .filter(m -> moduleId.equals(m.id))
                .findFirst()
                .orElseThrow(() -> AppException.notFound("No topic with id \"" + moduleId + "\""));
    }

    private Map<String, State> statesForModule(String moduleId) {
        return cache.getAllStates().stream()
                .filter(s -> moduleId.equals(s.module))
                .collect(Collectors.toMap(s -> s.id, s -> s, (a, b) -> a));
    }

    public TopicContentDto getTopicContent(String moduleId) {
        ModuleEntry entry = getTopicEntry(moduleId);
        State menuState = cache.getState(entry.entryState);
        Map<String, State> statesById = statesForModule(moduleId);
        Map<String, Option> menuOptionBySubTopic = (menuState.options == null ? List.<Option>of() : menuState.options)
                .stream().collect(Collectors.toMap(o -> o.id, o -> o, (a, b) -> a));

        List<SubTopicContentDto> subTopics = new ArrayList<>();
        for (SubTopicEntry st : entry.subTopics == null ? List.<SubTopicEntry>of() : entry.subTopics) {
            Option option = menuOptionBySubTopic.get(st.id);
            List<WalkItem> items = option != null ? walkSubTopic(option.next, statesById, st.id) : List.of();
            subTopics.add(new SubTopicContentDto(st.id, st.label, items));
        }
        return new TopicContentDto(moduleId, entry.title, subTopics);
    }

    /** Same reconstruction as getTopicContent, but flattened into the row shape
     *  csvImporter.js consumes — this is what lets a single CRUD edit reuse the
     *  exact same buildTopic()/publish() pipeline the CSV path already uses. */
    public List<CsvRow> getTopicRows(String moduleId) {
        ModuleEntry entry = getTopicEntry(moduleId);
        State menuState = cache.getState(entry.entryState);
        Map<String, State> statesById = statesForModule(moduleId);
        Map<String, Option> menuOptionBySubTopic = (menuState.options == null ? List.<Option>of() : menuState.options)
                .stream().collect(Collectors.toMap(o -> o.id, o -> o, (a, b) -> a));

        List<CsvRow> rows = new ArrayList<>();
        for (SubTopicEntry subTopic : entry.subTopics == null ? List.<SubTopicEntry>of() : entry.subTopics) {
            Option option = menuOptionBySubTopic.get(subTopic.id);
            if (option == null) continue; // empty sub-topic — nothing published for it yet

            List<WalkItem> items = walkSubTopic(option.next, statesById, subTopic.id);
            int qNum = 0;
            int mcqNum = 0;
            for (WalkItem item : items) {
                CsvRow row = new CsvRow();
                row.topic = entry.title;
                row.subTopic = subTopic.label;
                if ("Q".equals(item.type)) {
                    qNum++;
                    row.type = "Q";
                    row.num = qNum;
                    row.question = item.question;
                    row.answer = item.answer;
                } else {
                    mcqNum++;
                    row.type = "MCQ";
                    row.num = mcqNum;
                    row.question = item.question;
                    row.correct = item.correct;
                    row.answer = item.explanation;
                    for (ChoiceOption choice : item.choices) {
                        switch (choice.id) {
                            case "A" -> row.choiceA = choice.label;
                            case "B" -> row.choiceB = choice.label;
                            case "C" -> row.choiceC = choice.label;
                            case "D" -> row.choiceD = choice.label;
                            default -> { }
                        }
                    }
                }
                rows.add(row);
            }
        }
        return rows;
    }

    /** Learner-facing read: just the Q&A pairs (never MCQs) for one sub-topic, in
     *  order — powers the two-pane "browse any question, see its answer" explorer. */
    public List<QaItemDto> getSubTopicQaList(String moduleId, String subTopicId) {
        ModuleEntry entry = getTopicEntry(moduleId);
        boolean exists = (entry.subTopics == null ? List.<SubTopicEntry>of() : entry.subTopics)
                .stream().anyMatch(st -> subTopicId.equals(st.id));
        if (!exists) {
            throw AppException.notFound("No sub-topic with id \"" + subTopicId + "\"");
        }

        State menuState = cache.getState(entry.entryState);
        Option option = findOption(menuState, subTopicId);
        if (option == null) return List.of(); // registered but empty — nothing published for it yet

        Map<String, State> statesById = statesForModule(moduleId);
        List<WalkItem> items = walkSubTopic(option.next, statesById, subTopicId);
        return items.stream()
                .filter(i -> "Q".equals(i.type))
                .map(i -> new QaItemDto(i.question, i.answer))
                .collect(Collectors.toList());
    }
}
