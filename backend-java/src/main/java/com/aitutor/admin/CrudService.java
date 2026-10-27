package com.aitutor.admin;

import com.aitutor.engine.ConversationCache;
import com.aitutor.exception.AppException;
import com.aitutor.model.CsvRow;
import com.aitutor.model.ModuleEntry;
import com.aitutor.model.SubTopicEntry;
import com.aitutor.model.TopicPlan;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

/**
 * Port of backend/src/admin/crudService.js. Every mutation ends the same way:
 * renumber rows in list order (an admin never types a sequence number by hand —
 * order is just array/list position), group them back into the shape
 * CsvImporter#buildTopic expects, regenerate the topic's states from scratch,
 * and publish. Reuses the exact same validated, rollback-safe write path the CSV
 * importer uses — a CRUD edit is just "the same generator, fed different rows."
 */
@Service
public class CrudService {

    private final CsvImporter csvImporter;
    private final TopicContentService topicContentService;
    private final PublishService publishService;
    private final ConversationCache cache;

    public CrudService(CsvImporter csvImporter, TopicContentService topicContentService,
                        PublishService publishService, ConversationCache cache) {
        this.csvImporter = csvImporter;
        this.topicContentService = topicContentService;
        this.publishService = publishService;
        this.cache = cache;
    }

    private List<CsvRow> numberRows(List<CsvRow> rows) {
        Map<String, Integer> counters = new HashMap<>();
        List<CsvRow> numbered = new ArrayList<>();
        for (CsvRow row : rows) {
            String key = row.subTopic + "::" + row.type;
            int num = counters.merge(key, 1, Integer::sum);
            CsvRow copy = row.copy();
            copy.num = num;
            numbered.add(copy);
        }
        return numbered;
    }

    private TopicPlan regenerateAndPublish(String title, List<CsvRow> rows, List<String> allSubTopicLabels) {
        List<CsvRow> numberedRows = numberRows(rows);

        LinkedHashMap<String, List<CsvRow>> subTopicsMap = new LinkedHashMap<>();
        for (String label : allSubTopicLabels) {
            subTopicsMap.computeIfAbsent(label, k -> new ArrayList<>());
        }
        for (CsvRow row : numberedRows) {
            subTopicsMap.computeIfAbsent(row.subTopic, k -> new ArrayList<>()).add(row);
        }

        TopicPlan topicPlan = csvImporter.buildTopic(title, subTopicsMap);
        publishService.publish(List.of(topicPlan));
        return topicPlan;
    }

    private List<String> labelsOf(ModuleEntry entry) {
        return (entry.subTopics == null ? List.<SubTopicEntry>of() : entry.subTopics).stream().map(st -> st.label).toList();
    }

    private SubTopicEntry findSubTopic(ModuleEntry entry, String subTopicId) {
        return (entry.subTopics == null ? List.<SubTopicEntry>of() : entry.subTopics).stream()
                .filter(st -> subTopicId.equals(st.id)).findFirst()
                .orElseThrow(() -> AppException.notFound("No sub-topic with id \"" + subTopicId + "\""));
    }

    public ModuleEntry createTopic(String title) {
        if (title == null || title.isBlank()) throw AppException.badRequest("title is required");
        String trimmed = title.trim();
        String moduleId = Slugify.lower(trimmed);
        boolean exists = cache.getModulesRegistry().stream().anyMatch(m -> moduleId.equals(m.id));
        if (exists) throw AppException.badRequest("A topic with id \"" + moduleId + "\" already exists");
        TopicPlan topicPlan = csvImporter.buildTopic(trimmed, new LinkedHashMap<>());
        publishService.publish(List.of(topicPlan));
        return topicPlan.registryEntry;
    }

    public ModuleEntry renameTopic(String moduleId, String newTitle) {
        if (newTitle == null || newTitle.isBlank()) throw AppException.badRequest("title is required");
        String trimmed = newTitle.trim();
        ModuleEntry entry = topicContentService.getTopicEntry(moduleId);
        String newModuleId = Slugify.lower(trimmed);
        List<String> allLabels = labelsOf(entry);

        if (newModuleId.equals(moduleId)) {
            // Title text changed (casing/punctuation) but the slug didn't — safe to
            // regenerate in place, no old/new identity split to reconcile.
            List<CsvRow> rows = topicContentService.getTopicRows(moduleId);
            TopicPlan topicPlan = regenerateAndPublish(trimmed, rows, allLabels);
            return topicPlan.registryEntry;
        }

        boolean exists = cache.getModulesRegistry().stream().anyMatch(m -> newModuleId.equals(m.id));
        if (exists) throw AppException.badRequest("A topic with id \"" + newModuleId + "\" already exists");

        // The slug changes, so this is "create under the new id, then remove the
        // old one" — deliberately in that order: if creating fails, the old topic
        // is untouched; if removing afterward fails, both exist (recoverable).
        List<CsvRow> rows = topicContentService.getTopicRows(moduleId).stream().map(r -> {
            CsvRow c = r.copy();
            c.topic = trimmed;
            return c;
        }).toList();
        TopicPlan topicPlan = regenerateAndPublish(trimmed, rows, allLabels);
        publishService.removeTopic(moduleId);
        return topicPlan.registryEntry;
    }

    public SubTopicEntry createSubTopic(String moduleId, String label) {
        if (label == null || label.isBlank()) throw AppException.badRequest("label is required");
        String trimmed = label.trim();
        ModuleEntry entry = topicContentService.getTopicEntry(moduleId);
        String subTopicId = Slugify.lower(trimmed);
        boolean exists = (entry.subTopics == null ? List.<SubTopicEntry>of() : entry.subTopics)
                .stream().anyMatch(st -> subTopicId.equals(st.id));
        if (exists) throw AppException.badRequest("A sub-topic with id \"" + subTopicId + "\" already exists in this topic");

        List<CsvRow> rows = topicContentService.getTopicRows(moduleId);
        List<String> allLabels = new ArrayList<>(labelsOf(entry));
        allLabels.add(trimmed);
        regenerateAndPublish(entry.title, rows, allLabels);
        return new SubTopicEntry(subTopicId, trimmed, null);
    }

    public SubTopicEntry renameSubTopic(String moduleId, String subTopicId, String newLabel) {
        if (newLabel == null || newLabel.isBlank()) throw AppException.badRequest("label is required");
        String trimmed = newLabel.trim();
        ModuleEntry entry = topicContentService.getTopicEntry(moduleId);
        SubTopicEntry subTopic = findSubTopic(entry, subTopicId);

        String newSubTopicId = Slugify.lower(trimmed);
        if (!newSubTopicId.equals(subTopicId)) {
            boolean exists = (entry.subTopics == null ? List.<SubTopicEntry>of() : entry.subTopics)
                    .stream().anyMatch(st -> newSubTopicId.equals(st.id));
            if (exists) throw AppException.badRequest("A sub-topic with id \"" + newSubTopicId + "\" already exists in this topic");
        }

        List<CsvRow> rows = topicContentService.getTopicRows(moduleId).stream().map(r -> {
            if (subTopic.label.equals(r.subTopic)) {
                CsvRow c = r.copy();
                c.subTopic = trimmed;
                return c;
            }
            return r;
        }).toList();
        List<String> allLabels = (entry.subTopics == null ? List.<SubTopicEntry>of() : entry.subTopics)
                .stream().map(st -> subTopicId.equals(st.id) ? trimmed : st.label).toList();
        regenerateAndPublish(entry.title, rows, allLabels);
        return new SubTopicEntry(newSubTopicId, trimmed, null);
    }

    public String deleteSubTopic(String moduleId, String subTopicId) {
        ModuleEntry entry = topicContentService.getTopicEntry(moduleId);
        SubTopicEntry subTopic = findSubTopic(entry, subTopicId);
        List<CsvRow> rows = topicContentService.getTopicRows(moduleId).stream()
                .filter(r -> !subTopic.label.equals(r.subTopic)).toList();
        List<String> allLabels = (entry.subTopics == null ? List.<SubTopicEntry>of() : entry.subTopics)
                .stream().filter(st -> !subTopicId.equals(st.id)).map(st -> st.label).toList();
        regenerateAndPublish(entry.title, rows, allLabels);
        return subTopicId;
    }

    private record QuestionContext(ModuleEntry entry, SubTopicEntry subTopic, List<CsvRow> rows, List<CsvRow> subRows, int index) {
    }

    private Integer parseIntOrNull(String s) {
        if (s == null) return null;
        try {
            return Integer.parseInt(s.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private QuestionContext findQuestion(String moduleId, String subTopicId, String indexParam) {
        ModuleEntry entry = topicContentService.getTopicEntry(moduleId);
        SubTopicEntry subTopic = findSubTopic(entry, subTopicId);
        List<CsvRow> rows = topicContentService.getTopicRows(moduleId);
        List<CsvRow> subRows = rows.stream().filter(r -> subTopic.label.equals(r.subTopic)).toList();
        Integer i = parseIntOrNull(indexParam);
        if (i == null || i < 0 || i >= subRows.size()) {
            throw AppException.notFound("No question at index " + indexParam + " in sub-topic \"" + subTopicId + "\"");
        }
        return new QuestionContext(entry, subTopic, rows, subRows, i);
    }

    private Map<String, String> toStringMap(Map<String, Object> data) {
        Map<String, String> m = new LinkedHashMap<>();
        if (data == null) return m;
        for (var e : data.entrySet()) {
            m.put(e.getKey(), e.getValue() == null ? null : String.valueOf(e.getValue()));
        }
        return m;
    }

    private Map<String, String> rowToMap(CsvRow row) {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("topic", row.topic);
        m.put("subTopic", row.subTopic);
        m.put("type", row.type);
        m.put("num", row.num != null ? String.valueOf(row.num) : null);
        m.put("question", row.question);
        m.put("choiceA", row.choiceA);
        m.put("choiceB", row.choiceB);
        m.put("choiceC", row.choiceC);
        m.put("choiceD", row.choiceD);
        m.put("correct", row.correct);
        m.put("answer", row.answer);
        return m;
    }

    public CsvRow createQuestion(String moduleId, String subTopicId, Map<String, Object> questionData) {
        ModuleEntry entry = topicContentService.getTopicEntry(moduleId);
        SubTopicEntry subTopic = findSubTopic(entry, subTopicId);

        Map<String, String> raw = toStringMap(questionData);
        raw.put("topic", entry.title);
        raw.put("subTopic", subTopic.label);

        var result = csvImporter.validateRow(raw, false);
        if (!result.errors().isEmpty()) throw AppException.badRequest(String.join("; ", result.errors()));

        List<CsvRow> rows = new ArrayList<>(topicContentService.getTopicRows(moduleId));
        rows.add(result.row());
        regenerateAndPublish(entry.title, rows, labelsOf(entry));
        return result.row();
    }

    public CsvRow updateQuestion(String moduleId, String subTopicId, String index, Map<String, Object> questionData) {
        QuestionContext ctx = findQuestion(moduleId, subTopicId, index);
        CsvRow target = ctx.subRows().get(ctx.index());

        Map<String, String> merged = rowToMap(target);
        merged.putAll(toStringMap(questionData));
        merged.put("topic", ctx.entry().title);
        merged.put("subTopic", ctx.subTopic().label);
        merged.put("type", target.type);

        var result = csvImporter.validateRow(merged, false);
        if (!result.errors().isEmpty()) throw AppException.badRequest(String.join("; ", result.errors()));

        List<CsvRow> rows = new ArrayList<>(ctx.rows());
        int targetPos = indexOfReference(rows, target);
        rows.set(targetPos, result.row());
        regenerateAndPublish(ctx.entry().title, rows, labelsOf(ctx.entry()));
        return result.row();
    }

    public boolean deleteQuestion(String moduleId, String subTopicId, String index) {
        QuestionContext ctx = findQuestion(moduleId, subTopicId, index);
        CsvRow target = ctx.subRows().get(ctx.index());
        List<CsvRow> filtered = ctx.rows().stream().filter(r -> r != target).toList();
        regenerateAndPublish(ctx.entry().title, filtered, labelsOf(ctx.entry()));
        return true;
    }

    private int indexOfReference(List<CsvRow> rows, CsvRow target) {
        for (int i = 0; i < rows.size(); i++) {
            if (rows.get(i) == target) return i;
        }
        return -1;
    }
}
