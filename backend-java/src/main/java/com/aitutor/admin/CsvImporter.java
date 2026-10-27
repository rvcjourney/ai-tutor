package com.aitutor.admin;

import com.aitutor.exception.AppException;
import com.aitutor.model.CsvRow;
import com.aitutor.model.ModuleEntry;
import com.aitutor.model.Option;
import com.aitutor.model.State;
import com.aitutor.model.SubTopicEntry;
import com.aitutor.model.TopicPlan;
import java.io.IOException;
import java.io.StringReader;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;
import org.springframework.stereotype.Component;

/**
 * Port of backend/src/admin/csvImporter.js — parses + validates an admin CSV
 * upload and turns it into one {@link TopicPlan} per Topic column value. Shared
 * by the bulk CSV path and the single-record CRUD endpoints (CrudService), which
 * feed rows built by hand through the exact same {@link #validateRow} and
 * {@link #buildTopic} so a question added through the admin grid is held to the
 * same rules as one uploaded in bulk.
 */
@Component
public class CsvImporter {

    private static final Map<String, String> HEADER_MAP = Map.ofEntries(
            Map.entry("topic", "topic"), Map.entry("subtopic", "subTopic"), Map.entry("type", "type"),
            Map.entry("#", "num"), Map.entry("num", "num"), Map.entry("number", "num"),
            Map.entry("question", "question"), Map.entry("choicea", "choiceA"), Map.entry("a", "choiceA"),
            Map.entry("choiceb", "choiceB"), Map.entry("b", "choiceB"), Map.entry("choicec", "choiceC"),
            Map.entry("c", "choiceC"), Map.entry("choiced", "choiceD"), Map.entry("d", "choiceD"),
            Map.entry("correct", "correct"), Map.entry("answerexplanation", "answer"), Map.entry("answer", "answer"));

    private static final Set<String> FREE_TEXT_FIELDS = Set.of("question", "answer", "choiceA", "choiceB", "choiceC", "choiceD");
    private static final Set<String> VALID_TYPES = Set.of("Q", "MCQ", "GREETING", "OVERVIEW");

    private String normalizeHeader(String h) {
        return h.toLowerCase().replaceAll("[^a-z0-9#]", "");
    }

    /** A bare "?" immediately followed by a digit is never valid punctuation in a
     *  real question/answer — it only shows up when a "₹" got lost upstream. Safe
     *  to repair: a real "?" is always followed by a space, comma, quote, or end
     *  of field, never directly by a number. */
    private String repairLostRupeeSigns(String text) {
        if (text == null) return null;
        return text.replaceAll("\\?(\\d)", "₹$1");
    }

    /** A stray "â" is never valid English text on its own — it shows up when a
     *  dash's UTF-8 bytes got mangled through a bad encoding round-trip. */
    private String repairLostDashes(String text) {
        if (text == null) return null;
        return text.replace(" â ", " — ").replaceAll("(\\d)â(\\d)", "$1–$2");
    }

    public record RowValidationResult(List<String> errors, CsvRow row) {
    }

    /** Normalizes + validates one row. `requireNum` is off for CRUD, where row
     *  order comes from array position instead of a typed sequence number. */
    public RowValidationResult validateRow(Map<String, String> raw, boolean requireNum) {
        List<String> errors = new ArrayList<>();
        CsvRow row = new CsvRow();
        row.topic = raw.get("topic");
        row.subTopic = raw.get("subTopic");

        if (isBlank(row.topic)) errors.add("missing Topic");
        if (isBlank(row.subTopic)) errors.add("missing Sub-Topic");

        String rawType = raw.get("type");
        String type = rawType != null ? rawType.toUpperCase() : "";
        if (!VALID_TYPES.contains(type)) {
            errors.add("Type must be one of Q/MCQ/GREETING/OVERVIEW, got \"" + (rawType != null ? rawType : "") + "\"");
        }
        row.type = type;

        if (requireNum) {
            Integer num = parseIntOrNull(raw.get("num"));
            if (num == null || num < 1) errors.add("\"#\" must be a positive whole number");
            row.num = num;
        }

        row.question = raw.get("question");
        if (isBlank(row.question)) errors.add("missing Question");

        row.choiceA = raw.get("choiceA");
        row.choiceB = raw.get("choiceB");
        row.choiceC = raw.get("choiceC");
        row.choiceD = raw.get("choiceD");
        row.answer = raw.get("answer");

        if (type.equals("Q") || type.equals("GREETING") || type.equals("OVERVIEW")) {
            if (isBlank(row.answer)) errors.add("missing Answer");
        } else if (type.equals("MCQ")) {
            long filled = List.of("A", "B", "C", "D").stream().filter(l -> !isBlank(row.choice(l))).count();
            if (filled < 2) errors.add("needs at least 2 filled choices");
            String rawCorrect = raw.get("correct");
            String correct = rawCorrect != null ? rawCorrect.toUpperCase() : "";
            row.correct = correct;
            if (!Set.of("A", "B", "C", "D").contains(correct) || isBlank(row.choice(correct))) {
                errors.add("\"Correct\" must be one of A/B/C/D matching a filled choice");
            }
        }

        return new RowValidationResult(errors, row);
    }

    private boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    // Deliberately stricter than JS's lenient parseInt ("3abc" -> 3): malformed
    // input here is rare enough that rejecting it outright (-> a clear validation
    // error) beats silently truncating a typo'd row number.
    private Integer parseIntOrNull(String s) {
        if (s == null) return null;
        try {
            return Integer.parseInt(s.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    public List<CsvRow> parseRows(String csvText) {
        List<CSVRecord> records;
        List<String> headers;
        CSVFormat format = CSVFormat.DEFAULT.builder()
                .setHeader().setSkipHeaderRecord(true).setTrim(true).setIgnoreEmptyLines(true)
                .setAllowMissingColumnNames(true).setAllowDuplicateHeaderNames(true).build();
        try (CSVParser parser = CSVParser.parse(new StringReader(csvText), format)) {
            records = parser.getRecords();
            headers = parser.getHeaderNames();
        } catch (IOException | IllegalStateException | IllegalArgumentException e) {
            throw AppException.badRequest("Could not parse CSV: " + e.getMessage());
        }

        // Only the first occurrence of each normalized header wins — mirrors
        // csvImporter.js's object-literal HEADER_MAP, where Object.entries()
        // iteration (and therefore any duplicate column) would overwrite in
        // declaration order, not CSV column order.
        Map<String, String> mappedHeaderByColumn = new LinkedHashMap<>();
        for (String header : headers) {
            String mapped = HEADER_MAP.get(normalizeHeader(header));
            if (mapped != null) {
                mappedHeaderByColumn.putIfAbsent(header, mapped);
            }
        }

        List<String> errors = new ArrayList<>();
        List<CsvRow> rows = new ArrayList<>();

        int i = 0;
        for (CSVRecord record : records) {
            int rowNum = i + 2; // header occupies row 1
            i++;
            Map<String, String> rawRow = new LinkedHashMap<>();
            for (var entry : mappedHeaderByColumn.entrySet()) {
                String header = entry.getKey();
                String mapped = entry.getValue();
                String value = (record.isMapped(header) && record.isSet(header)) ? record.get(header) : null;
                String trimmed = value != null ? value.trim() : null;
                rawRow.put(mapped, FREE_TEXT_FIELDS.contains(mapped) ? repairLostDashes(repairLostRupeeSigns(trimmed)) : trimmed);
            }

            RowValidationResult result = validateRow(rawRow, true);
            if (!result.errors().isEmpty()) {
                String label = (orBlankQuestionMark(rawRow.get("topic"))) + " / " + (orBlankQuestionMark(rawRow.get("subTopic")));
                for (String e : result.errors()) {
                    errors.add("Row " + rowNum + " (" + label + "): " + e);
                }
                continue;
            }
            rows.add(result.row());
        }

        if (!errors.isEmpty()) {
            throw AppException.badRequest("CSV has " + errors.size() + " problem(s):\n" + String.join("\n", errors));
        }
        if (rows.isEmpty()) {
            throw AppException.badRequest("CSV has no valid data rows");
        }
        return rows;
    }

    private String orBlankQuestionMark(String s) {
        return (s == null || s.isBlank()) ? "?" : s;
    }

    public record TopicGroup(String topicName, LinkedHashMap<String, List<CsvRow>> subTopics) {
    }

    public List<TopicGroup> groupByTopicAndSubTopic(List<CsvRow> rows) {
        LinkedHashMap<String, LinkedHashMap<String, List<CsvRow>>> topicGroups = new LinkedHashMap<>();
        for (CsvRow row : rows) {
            topicGroups.computeIfAbsent(row.topic, k -> new LinkedHashMap<>());
            topicGroups.get(row.topic).computeIfAbsent(row.subTopic, k -> new ArrayList<>()).add(row);
        }
        List<TopicGroup> result = new ArrayList<>();
        for (var entry : topicGroups.entrySet()) {
            result.add(new TopicGroup(entry.getKey(), entry.getValue()));
        }
        return result;
    }

    private record StatesResult(List<State> states, String firstStateId) {
    }

    // GREETING/OVERVIEW rows render exactly like Q rows (a plain fact card) —
    // grouped in with the Q sequence for state-building, distinct only for
    // buildTopic()'s role detection.
    private StatesResult buildStatesForSubTopic(String prefix, String moduleId, String subTopicId, List<CsvRow> allRows, String endTarget) {
        String resolvedEndTarget = endTarget != null ? endTarget : "EXPLAIN_FURTHER";
        List<CsvRow> qRows = allRows.stream()
                .filter(r -> r.type.equals("Q") || r.type.equals("GREETING") || r.type.equals("OVERVIEW"))
                .sorted((a, b) -> Integer.compare(a.num, b.num)).toList();
        List<CsvRow> mcqRows = allRows.stream().filter(r -> r.type.equals("MCQ"))
                .sorted((a, b) -> Integer.compare(a.num, b.num)).toList();
        List<State> states = new ArrayList<>();

        for (int i = 0; i < qRows.size(); i++) {
            CsvRow row = qRows.get(i);
            String id = prefix + "_Q" + row.num;
            String next = i < qRows.size() - 1 ? prefix + "_Q" + qRows.get(i + 1).num
                    : !mcqRows.isEmpty() ? prefix + "_MCQ" + mcqRows.get(0).num : resolvedEndTarget;
            State s = new State();
            s.id = id;
            s.type = "menu";
            s.module = moduleId;
            s.subTopic = subTopicId;
            s.screenType = "fact";
            s.message = row.question + "\n" + row.answer;
            s.options = List.of(
                    new Option("next", "Next ▸", next),
                    new Option("back", "Topic Menu", "__MODULE_ENTRY__"),
                    new Option("menu", "Home", "MAIN_MENU"));
            states.add(s);
        }

        for (int i = 0; i < mcqRows.size(); i++) {
            CsvRow row = mcqRows.get(i);
            String id = prefix + "_MCQ" + row.num;
            String next = i < mcqRows.size() - 1 ? prefix + "_MCQ" + mcqRows.get(i + 1).num : resolvedEndTarget;
            List<Option> choiceOptions = List.of("A", "B", "C", "D").stream()
                    .filter(l -> row.choice(l) != null && !row.choice(l).isBlank())
                    .map(l -> new Option(l, row.choice(l), null))
                    .collect(Collectors.toList());
            Option back = new Option("back", "Topic Menu", "__MODULE_ENTRY__");
            back.navigate = true;
            Option home = new Option("menu", "Home", "MAIN_MENU");
            home.navigate = true;

            List<Option> allOptions = new ArrayList<>(choiceOptions);
            allOptions.add(back);
            allOptions.add(home);

            State s = new State();
            s.id = id;
            s.type = "mcq";
            s.module = moduleId;
            s.subTopic = subTopicId;
            s.message = row.question;
            s.options = allOptions;
            s.correctOptionId = row.correct;
            s.maxAttempts = 3;
            s.incorrectMessage = "Not quite — try again.";
            s.revealMessage = (row.answer != null && !row.answer.isBlank()) ? row.answer : "The correct answer is " + row.correct + ".";
            s.next = next;
            states.add(s);
        }

        String firstStateId = !qRows.isEmpty() ? prefix + "_Q" + qRows.get(0).num
                : !mcqRows.isEmpty() ? prefix + "_MCQ" + mcqRows.get(0).num : null;
        return new StatesResult(states, firstStateId);
    }

    private String computeFirstStateId(String prefix, List<CsvRow> rows) {
        List<CsvRow> qRows = rows.stream()
                .filter(r -> r.type.equals("Q") || r.type.equals("GREETING") || r.type.equals("OVERVIEW"))
                .sorted((a, b) -> Integer.compare(a.num, b.num)).toList();
        if (!qRows.isEmpty()) return prefix + "_Q" + qRows.get(0).num;
        List<CsvRow> mcqRows = rows.stream().filter(r -> r.type.equals("MCQ"))
                .sorted((a, b) -> Integer.compare(a.num, b.num)).toList();
        if (!mcqRows.isEmpty()) return prefix + "_MCQ" + mcqRows.get(0).num;
        return null;
    }

    private static class GroupMeta {
        String prefix;
        boolean isGreeting;
        boolean isOverview;
        String firstStateId;
    }

    /** Two reusable roles (any topic, not BFSI-specific), chained together:
     *  entering the topic auto-plays the Greeting-role sub-topic (if present),
     *  which flows into the Overview-role sub-topic (if present), which then
     *  flows into the real sector-picking tile menu. A row's explicit Type
     *  (GREETING/OVERVIEW) is the source of truth; the old name-based convention
     *  ("Greeting", "More about X") is kept as a fallback for content published
     *  before Type carried this distinction. */
    public TopicPlan buildTopic(String topicName, LinkedHashMap<String, List<CsvRow>> subTopicsMap) {
        String moduleId = Slugify.lower(topicName);
        String moduleIdUpper = Slugify.upper(topicName);
        String menuId = moduleIdUpper + "_MENU";

        LinkedHashMap<String, GroupMeta> groupMeta = new LinkedHashMap<>();
        for (var entry : subTopicsMap.entrySet()) {
            String subTopicName = entry.getKey();
            List<CsvRow> rows = entry.getValue();
            String normalized = subTopicName.trim().toLowerCase();
            String prefix = moduleIdUpper + "_" + Slugify.upper(subTopicName);
            GroupMeta meta = new GroupMeta();
            meta.prefix = prefix;
            meta.isGreeting = rows.stream().anyMatch(r -> r.type.equals("GREETING")) || normalized.equals("greeting");
            meta.isOverview = rows.stream().anyMatch(r -> r.type.equals("OVERVIEW")) || normalized.startsWith("more about");
            meta.firstStateId = computeFirstStateId(prefix, rows);
            groupMeta.put(subTopicName, meta);
        }

        GroupMeta greetingMeta = groupMeta.values().stream().filter(m -> m.isGreeting).findFirst().orElse(null);
        GroupMeta overviewMeta = groupMeta.values().stream().filter(m -> m.isOverview).findFirst().orElse(null);
        String afterGreetingTarget = overviewMeta != null ? overviewMeta.firstStateId : menuId;
        String topicEntryStateId = greetingMeta != null ? greetingMeta.firstStateId
                : overviewMeta != null ? overviewMeta.firstStateId : menuId;

        List<State> allStates = new ArrayList<>();
        List<Option> menuOptions = new ArrayList<>();
        List<SubTopicEntry> subTopicsList = new ArrayList<>();

        for (var entry : subTopicsMap.entrySet()) {
            String subTopicName = entry.getKey();
            List<CsvRow> rows = entry.getValue();
            GroupMeta meta = groupMeta.get(subTopicName);
            String subTopicId = Slugify.lower(subTopicName);
            String endTarget = meta.isGreeting ? afterGreetingTarget : meta.isOverview ? menuId : null;
            StatesResult result = buildStatesForSubTopic(meta.prefix, moduleId, subTopicId, rows, endTarget);
            allStates.addAll(result.states());
            boolean hidden = meta.isGreeting || meta.isOverview;
            subTopicsList.add(new SubTopicEntry(subTopicId, subTopicName, hidden ? Boolean.TRUE : null));
            if (result.firstStateId() != null) {
                menuOptions.add(new Option(subTopicId, subTopicName, result.firstStateId()));
            }
        }

        String menuMessage = (greetingMeta != null || overviewMeta != null)
                ? "Please select a topic you would like to learn about."
                : "Welcome to " + topicName + "! Please select a topic you would like to learn about.";

        State menuState = new State();
        menuState.id = menuId;
        menuState.type = "menu";
        menuState.module = moduleId;
        menuState.message = menuMessage;
        menuState.options = menuOptions;
        allStates.add(menuState);

        TopicPlan plan = new TopicPlan();
        plan.moduleId = moduleId;
        plan.moduleFileName = moduleId.replace("_", "-") + ".json";
        plan.title = topicName;
        plan.entryState = menuId;
        plan.states = allStates;

        ModuleEntry registryEntry = new ModuleEntry();
        registryEntry.id = moduleId;
        registryEntry.title = topicName;
        registryEntry.available = true;
        registryEntry.entryState = menuId;
        registryEntry.subTopics = subTopicsList;
        plan.registryEntry = registryEntry;

        plan.mainMenuOption = new Option(moduleId, topicName, topicEntryStateId);

        return plan;
    }

    public List<TopicPlan> importCsv(String csvText) {
        List<CsvRow> rows = parseRows(csvText);
        List<TopicGroup> grouped = groupByTopicAndSubTopic(rows);
        List<TopicPlan> plans = new ArrayList<>();
        for (TopicGroup group : grouped) {
            plans.add(buildTopic(group.topicName(), group.subTopics()));
        }
        return plans;
    }
}
