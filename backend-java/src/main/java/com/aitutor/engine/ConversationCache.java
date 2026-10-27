package com.aitutor.engine;

import com.aitutor.entity.ConversationFileEntity;
import com.aitutor.exception.AppException;
import com.aitutor.model.ConversationFileData;
import com.aitutor.model.ModuleEntry;
import com.aitutor.model.Option;
import com.aitutor.model.State;
import com.aitutor.repository.ConversationFileRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

/**
 * Port of backend/src/engine/conversationLoader.js. Keeps the exact same design:
 * a live, in-memory cache (built once at boot, swapped atomically after a
 * publish) is what every read (getState/getModulesRegistry/getAllStates) serves
 * from — the FSM engine never queries the database directly for content, only
 * for per-user progress. {@link #buildCache} is pure and used both for the real
 * boot load and by PublishService to validate a prospective publish before it's
 * committed.
 */
@Component
public class ConversationCache implements ApplicationRunner {

    /** Ids the engine synthesizes at runtime (per-module reinforcement quiz, "back
     *  to topic menu") rather than defining as static states — exempt from
     *  reference validation. */
    public static final Set<String> RESERVED_STATE_IDS = Set.of("ND_WELCOME", "ND_QUIZ", "__MODULE_ENTRY__");

    private final ConversationFileRepository repository;
    private final ObjectMapper objectMapper;

    private final AtomicReference<CacheSnapshot> live = new AtomicReference<>(new CacheSnapshot(Map.of(), List.of()));

    public ConversationCache(ConversationFileRepository repository, ObjectMapper objectMapper) {
        this.repository = repository;
        this.objectMapper = objectMapper;
    }

    public record CacheSnapshot(Map<String, State> statesById, List<ModuleEntry> modulesRegistry) {
    }

    @Override
    public void run(ApplicationArguments args) {
        loadAll();
    }

    /** Full refresh from the database — used at boot. PublishService does NOT call
     *  this after a publish (that would mean a redundant read-after-write); it
     *  builds + validates the candidate itself and calls setCache() directly once
     *  its transaction commits. */
    public void loadAll() {
        List<ConversationFileEntity> rows = repository.findAll();
        List<ConversationFileData> files = rows.isEmpty() ? seedIfEmpty() : toFileData(rows);
        setCache(buildCache(files));
    }

    private List<ConversationFileData> toFileData(List<ConversationFileEntity> rows) {
        List<ConversationFileData> files = new ArrayList<>();
        for (ConversationFileEntity row : rows) {
            files.add(new ConversationFileData(row.getFilename(), row.getContent()));
        }
        return files;
    }

    /** A truly fresh database (first boot against a brand-new Postgres, or a host
     *  with no persistent volume yet) has no conversation_files rows at all — seed
     *  it from the tracked baseline (app chassis: WELCOME/MAIN_MENU/EXPLAIN_FURTHER,
     *  zero topics) so the app boots instead of crashing on an empty cache. Only
     *  runs when the table is genuinely empty, so it can never overwrite real
     *  published content. */
    private List<ConversationFileData> seedIfEmpty() {
        List<ConversationFileData> files = new ArrayList<>();
        for (String filename : List.of("main.json", "modules-registry.json")) {
            JsonNode content = readSeedResource(filename);
            repository.save(new ConversationFileEntity(filename, content));
            files.add(new ConversationFileData(filename, content));
        }
        return files;
    }

    private JsonNode readSeedResource(String filename) {
        try (InputStream in = new ClassPathResource("conversations-seed/" + filename).getInputStream()) {
            return objectMapper.readTree(in);
        } catch (IOException e) {
            throw AppException.serverError("Could not read seed resource " + filename + ": " + e.getMessage());
        }
    }

    /** Pure: given the rows a set of conversation files would resolve to, builds and
     *  validates the {statesById, modulesRegistry} shape without touching the live
     *  cache — throws on any dangling reference / duplicate id / malformed file,
     *  same checks as conversationLoader.js's buildCache(). */
    public CacheSnapshot buildCache(List<ConversationFileData> files) {
        Map<String, State> candidateStatesById = new LinkedHashMap<>();
        List<ModuleEntry> candidateModulesRegistry = List.of();

        for (ConversationFileData file : files) {
            JsonNode content = file.content();
            JsonNode statesNode = content.get("states");
            JsonNode modulesNode = content.get("modules");

            if (statesNode != null && statesNode.isArray()) {
                for (JsonNode stateNode : statesNode) {
                    State state = objectMapper.convertValue(stateNode, State.class);
                    if (state.id == null) {
                        throw AppException.badRequest("State missing \"id\" in " + file.filename());
                    }
                    if (candidateStatesById.containsKey(state.id)) {
                        throw AppException.badRequest(
                                "Duplicate state id \"" + state.id + "\" found in " + file.filename() + " (already defined elsewhere)");
                    }
                    candidateStatesById.put(state.id, state);
                }
            } else if (modulesNode != null && modulesNode.isArray()) {
                candidateModulesRegistry = new ArrayList<>();
                for (JsonNode moduleNode : modulesNode) {
                    candidateModulesRegistry.add(objectMapper.convertValue(moduleNode, ModuleEntry.class));
                }
            } else {
                throw AppException.badRequest(
                        "Conversation file " + file.filename() + " has neither \"states\" nor \"modules\" — unrecognized shape");
            }
        }

        validateReferences(candidateStatesById);
        return new CacheSnapshot(candidateStatesById, candidateModulesRegistry);
    }

    private void validateReferences(Map<String, State> candidateStatesById) {
        for (State state : candidateStatesById.values()) {
            if (state.next != null && !RESERVED_STATE_IDS.contains(state.next) && !candidateStatesById.containsKey(state.next)) {
                throw AppException.badRequest("State \"" + state.id + "\" has dangling \"next\" reference: \"" + state.next + "\"");
            }
            if (state.options != null) {
                for (Option option : state.options) {
                    if (option.next == null) continue;
                    if (!RESERVED_STATE_IDS.contains(option.next) && !candidateStatesById.containsKey(option.next)) {
                        throw AppException.badRequest(
                                "State \"" + state.id + "\" option \"" + option.id + "\" has dangling \"next\" reference: \"" + option.next + "\"");
                    }
                }
            }
            if ("quiz".equals(state.type)) {
                if (state.quiz == null) {
                    throw AppException.badRequest("Quiz state \"" + state.id + "\" is missing \"quiz\" config");
                }
                checkQuizTarget(state, "onCorrect", state.quiz.onCorrect, candidateStatesById);
                checkQuizTarget(state, "onIncorrect", state.quiz.onIncorrect, candidateStatesById);
                checkQuizTarget(state, "onExhausted", state.quiz.onExhausted, candidateStatesById);
            }
            if ("mcq".equals(state.type)) {
                if (state.options == null || state.options.isEmpty()) {
                    throw AppException.badRequest("MCQ state \"" + state.id + "\" has no options");
                }
                boolean matches = state.options.stream().anyMatch(o -> o.id != null && o.id.equals(state.correctOptionId));
                if (!matches) {
                    throw AppException.badRequest("MCQ state \"" + state.id + "\" has \"correctOptionId\" (\""
                            + state.correctOptionId + "\") that doesn't match any option id");
                }
            }
        }
    }

    private void checkQuizTarget(State state, String key, String target, Map<String, State> candidateStatesById) {
        if (target == null || RESERVED_STATE_IDS.contains(target) || candidateStatesById.containsKey(target)) return;
        throw AppException.badRequest("Quiz state \"" + state.id + "\" has dangling \"quiz." + key + "\" reference: \"" + target + "\"");
    }

    /** Swaps the live cache to an already-built-and-validated candidate (from
     *  buildCache). Never throws — call it only after you know the candidate is
     *  valid (buildCache already would have thrown otherwise). */
    public void setCache(CacheSnapshot snapshot) {
        live.set(snapshot);
    }

    public State getState(String id) {
        State state = live.get().statesById().get(id);
        if (state == null) {
            throw AppException.serverError("Unknown conversation state: \"" + id + "\"");
        }
        return state;
    }

    public List<ModuleEntry> getModulesRegistry() {
        return live.get().modulesRegistry();
    }

    public List<State> getAllStates() {
        return new ArrayList<>(live.get().statesById().values());
    }
}
