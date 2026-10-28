package com.aitutor.engine;

import com.aitutor.dto.ChatTurnDto;
import com.aitutor.dto.OptionDto;
import com.aitutor.dto.SubTopicOptionDto;
import com.aitutor.entity.QuizAttemptEntity;
import com.aitutor.entity.UserEntity;
import com.aitutor.entity.UserProgressEntity;
import com.aitutor.exception.AppException;
import com.aitutor.model.McqChoices;
import com.aitutor.model.ModuleEntry;
import com.aitutor.model.Option;
import com.aitutor.model.QuizConfig;
import com.aitutor.model.ReinforcementQuiz;
import com.aitutor.model.State;
import com.aitutor.model.SubTopicEntry;
import com.aitutor.repository.QuizAttemptRepository;
import com.aitutor.repository.SubTopicCompletionRepository;
import com.aitutor.repository.SubTopicItemProgressRepository;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Port of backend/src/engine/fsmEngine.js — the whole rule-based conversation
 * engine. No LLM/RAG: every reply is a lookup against the state graph in
 * {@link ConversationCache}. See that class and fsmEngine.js for the design
 * rationale; this class mirrors its function-for-function structure as closely
 * as Java allows.
 */
@Service
public class FsmEngine {

    private static final Map<String, String> INPUT_TYPE_BY_STATE_TYPE = Map.of(
            "menu", "options", "mcq", "options", "mcq-answered", "options", "quiz", "text", "input", "text", "exit", "none");

    private static final Map<String, String> OPTIONS_VARIANT_BY_STATE_TYPE = Map.of(
            "mcq", "mcq", "menu", "menu", "mcq-answered", "mcq-answered");

    /** Suffix trick for the synthetic "answered MCQ" screen — see
     *  {@link #buildAnsweredMcqNode}: never stored, only built at resolve time, so
     *  a resumed session reconstructs it from the persisted current_state string alone. */
    private static final Map<String, String> ANSWERED_MCQ_SUFFIX = Map.of(
            "correct", "__ANSWERED_CORRECT", "exhausted", "__ANSWERED_EXHAUSTED");

    private static final Pattern ITEM_ID = Pattern.compile("_(Q|MCQ)(\\d+)$");

    private final ConversationCache cache;
    private final UserService userService;
    private final UserProgressService progressService;
    private final QuizAttemptRepository quizAttemptRepository;
    private final SubTopicCompletionRepository subTopicCompletionRepository;
    private final SubTopicItemProgressRepository subTopicItemProgressRepository;

    public FsmEngine(ConversationCache cache, UserService userService, UserProgressService progressService,
                      QuizAttemptRepository quizAttemptRepository, SubTopicCompletionRepository subTopicCompletionRepository,
                      SubTopicItemProgressRepository subTopicItemProgressRepository) {
        this.cache = cache;
        this.userService = userService;
        this.progressService = progressService;
        this.quizAttemptRepository = quizAttemptRepository;
        this.subTopicCompletionRepository = subTopicCompletionRepository;
        this.subTopicItemProgressRepository = subTopicItemProgressRepository;
    }

    // ---- small lookups ----

    private ReinforcementQuiz getReinforcementQuiz(String moduleId) {
        if (moduleId == null) return null;
        return cache.getModulesRegistry().stream().filter(m -> moduleId.equals(m.id)).findFirst()
                .map(m -> m.reinforcementQuiz).orElse(null);
    }

    private String getModuleEntryState(String moduleId) {
        if (moduleId == null) return null;
        return cache.getModulesRegistry().stream().filter(m -> moduleId.equals(m.id)).findFirst()
                .map(m -> m.entryState).orElse(null);
    }

    /** The tappable sub-topic tiles for a module's real menu (Greeting/Overview
     *  excluded) — reused both so the shared EXPLAIN_FURTHER end screen can offer
     *  them directly, and so handleMessage knows which ids that screen accepts. */
    private List<SubTopicOptionDto> getVisibleSubTopicOptions(String moduleId) {
        if (moduleId == null) return List.of();
        ModuleEntry module = cache.getModulesRegistry().stream().filter(m -> moduleId.equals(m.id)).findFirst().orElse(null);
        if (module == null) return List.of();
        State menuState = cache.getState(module.entryState);
        var hiddenIds = (module.subTopics == null ? List.<SubTopicEntry>of() : module.subTopics).stream()
                .filter(SubTopicEntry::isHidden).map(st -> st.id).collect(Collectors.toSet());
        return (menuState.options == null ? List.<Option>of() : menuState.options).stream()
                .filter(o -> !hiddenIds.contains(o.id))
                .map(o -> new SubTopicOptionDto(o.id, o.label, o.next))
                .collect(Collectors.toList());
    }

    /** True once a learner has fully passed every hidden (Greeting/Overview)
     *  sub-topic of a module at least once — used to skip straight to the real
     *  menu on repeat visits instead of replaying the whole intro chain. */
    private boolean hasSeenIntro(Long userId, String moduleId) {
        ModuleEntry module = cache.getModulesRegistry().stream().filter(m -> moduleId.equals(m.id)).findFirst().orElse(null);
        if (module == null) return false;
        List<SubTopicEntry> hidden = (module.subTopics == null ? List.<SubTopicEntry>of() : module.subTopics)
                .stream().filter(SubTopicEntry::isHidden).toList();
        if (hidden.isEmpty()) return true;
        return hidden.stream().allMatch(st -> subTopicCompletionRepository.existsByUserIdAndModuleIdAndSubTopicId(userId, moduleId, st.id));
    }

    private String buildGreeting(String displayName, Integer clientHour) {
        int hour = clientHour != null ? clientHour : LocalTime.now().getHour();
        String timeOfDay = hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
        String namePart = (displayName != null && !displayName.isBlank()) ? ", " + displayName : "";
        return "Good " + timeOfDay + namePart + "!";
    }

    // ---- synthetic states ----

    private State buildNdWelcomeNode(String moduleId, ReinforcementQuiz quiz) {
        State s = new State();
        s.id = "ND_WELCOME";
        s.type = "input";
        s.module = moduleId;
        s.message = quiz.welcomeMessage;
        s.next = "ND_QUIZ";
        return s;
    }

    private State buildNdQuizNode(String moduleId, ReinforcementQuiz quiz) {
        State s = new State();
        s.id = "ND_QUIZ";
        s.type = "quiz";
        s.module = moduleId;
        s.message = quiz.question;
        QuizConfig qc = new QuizConfig();
        qc.keywords = quiz.keywords;
        qc.minMatches = quiz.minMatches;
        qc.maxAttempts = quiz.maxAttempts;
        qc.onCorrect = "MAIN_MENU";
        qc.onIncorrect = "ND_QUIZ";
        qc.onExhausted = "MAIN_MENU";
        qc.incorrectMessage = quiz.incorrectMessage;
        qc.exhaustedMessage = quiz.exhaustedMessage;
        qc.correctMessage = quiz.correctMessage;
        s.quiz = qc;
        return s;
    }

    /** An MCQ that's just been answered correctly, or exhausted its attempts,
     *  lands on this synthetic screen: same question + choices, locked/highlighted,
     *  explanation below, Continue advances to whatever the base MCQ's own `next`
     *  pointed at. `selectedOptionId` is only known at the moment of answering —
     *  null on a resumed session (still shows the correct answer, not the pick). */
    private State buildAnsweredMcqNode(State baseState, String kind, String selectedOptionId) {
        String revealMessage;
        if ("correct".equals(kind)) {
            revealMessage = (baseState.revealMessage != null) ? "Correct! " + baseState.revealMessage : "Correct!";
        } else {
            revealMessage = baseState.revealMessage != null ? baseState.revealMessage : "That was your last attempt.";
        }

        State node = new State();
        node.id = baseState.id + ANSWERED_MCQ_SUFFIX.get(kind);
        node.type = "mcq-answered";
        node.module = baseState.module;
        node.subTopic = baseState.subTopic;
        node.message = baseState.message;

        var choiceOptions = (baseState.options == null ? List.<Option>of() : baseState.options).stream()
                .filter(o -> !o.isNavigate())
                .map(o -> new com.aitutor.model.ChoiceOption(o.id, o.label))
                .collect(Collectors.toList());
        String selected = "correct".equals(kind) ? baseState.correctOptionId : selectedOptionId;
        node.mcqChoices = new McqChoices(choiceOptions, baseState.correctOptionId, selected);

        node.revealMessage = revealMessage;
        Option continueOption = new Option("next", "Continue ▸", baseState.next);
        node.options = List.of(continueOption);
        node.next = baseState.next;
        return node;
    }

    /** Resolves a state id to a node. ND_WELCOME/ND_QUIZ and __MODULE_ENTRY__ are
     *  synthesized at runtime instead of living in the static conversation JSON;
     *  the __ANSWERED_CORRECT/__ANSWERED_EXHAUSTED suffixes rebuild the two-phase
     *  MCQ screen from its base state. Exposed (not private) because
     *  QuizController needs it to check "is the learner currently on a quiz
     *  state" before accepting a /quiz/submit. */
    public State resolveNode(String id, String moduleId) {
        if ("ND_WELCOME".equals(id) || "ND_QUIZ".equals(id)) {
            ReinforcementQuiz quiz = getReinforcementQuiz(moduleId);
            if (quiz == null) {
                throw AppException.serverError("No reinforcement quiz configured for module \"" + moduleId + "\"");
            }
            return "ND_WELCOME".equals(id) ? buildNdWelcomeNode(moduleId, quiz) : buildNdQuizNode(moduleId, quiz);
        }
        if ("__MODULE_ENTRY__".equals(id)) {
            String entryState = getModuleEntryState(moduleId);
            if (entryState == null) {
                throw AppException.serverError("No module entry state found for module \"" + moduleId + "\"");
            }
            return resolveNode(entryState, moduleId);
        }
        for (var entry : ANSWERED_MCQ_SUFFIX.entrySet()) {
            String suffix = entry.getValue();
            if (id.endsWith(suffix)) {
                State baseState = cache.getState(id.substring(0, id.length() - suffix.length()));
                return buildAnsweredMcqNode(baseState, entry.getKey(), null);
            }
        }
        return cache.getState(id);
    }

    private record ChainResult(State node, String message, String moduleId, String subTopicId) {
    }

    /** Follows "auto" states forward, collecting their messages, until landing on
     *  a state that requires learner input or a terminal state. Threads
     *  module/subTopic forward the same way — each carries over from the last
     *  state that tagged one, so shared states like EXPLAIN_FURTHER (untagged)
     *  still know which module/sub-topic the learner is actually in. */
    private ChainResult resolveChain(String startId, String moduleIdHint, String subTopicIdHint) {
        List<String> messages = new ArrayList<>();
        State node = resolveNode(startId, moduleIdHint);
        String moduleId = node.module != null ? node.module : moduleIdHint;
        String subTopicId = node.subTopic != null ? node.subTopic : subTopicIdHint;

        while ("auto".equals(node.type)) {
            messages.add(node.message);
            node = resolveNode(node.next, moduleId);
            moduleId = node.module != null ? node.module : moduleId;
            subTopicId = node.subTopic != null ? node.subTopic : subTopicId;
        }
        messages.add(node.message);
        moduleId = node.module != null ? node.module : moduleId;
        subTopicId = node.subTopic != null ? node.subTopic : subTopicId;

        return new ChainResult(node, String.join("\n\n", messages), moduleId, subTopicId);
    }

    private ChatTurnDto buildResponse(State node, String message, String feedback, String moduleIdHint, String subTopicIdHint) {
        String optionsVariant = "fact".equals(node.screenType) ? "qa" : OPTIONS_VARIANT_BY_STATE_TYPE.get(node.type);
        String moduleId = node.module != null ? node.module : moduleIdHint;
        String subTopicId = node.subTopic != null ? node.subTopic : subTopicIdHint;

        List<OptionDto> options = (node.options == null ? List.<Option>of() : node.options).stream()
                .map(o -> new OptionDto(o.id, o.label)).collect(Collectors.toList());

        List<SubTopicOptionDto> subTopicOptions = "EXPLAIN_FURTHER".equals(node.id) ? getVisibleSubTopicOptions(moduleId) : null;

        return new ChatTurnDto(
                node.id, message, options,
                INPUT_TYPE_BY_STATE_TYPE.getOrDefault(node.type, "none"),
                optionsVariant, moduleId, subTopicId, node.screenType, feedback,
                subTopicOptions, node.mcqChoices, node.revealMessage);
    }

    // The learner base is India — "a new day" needs to mean a new day in IST, not
    // UTC. UTC's midnight boundary falls at 5:30 AM IST, so comparing in UTC made
    // the next-day reinforcement quiz trigger up to 5.5 hours later than a learner
    // would actually perceive "the next day" to be (e.g. reopening the app at
    // 2 AM IST was still "the same day" by UTC's clock).
    private static final ZoneId LEARNER_ZONE = ZoneId.of("Asia/Kolkata");

    private boolean isNewCalendarDay(OffsetDateTime updatedAt) {
        LocalDate today = OffsetDateTime.now(LEARNER_ZONE).toLocalDate();
        LocalDate updatedDate = updatedAt.atZoneSameInstant(LEARNER_ZONE).toLocalDate();
        return !updatedDate.equals(today);
    }

    /** Content state ids are always "{prefix}_Q{n}" or "{prefix}_MCQ{n}" — Qs
     *  numbered first, then MCQs — so a 1-based "how far into this sub-topic"
     *  position can be read straight off the id. */
    private Integer computeItemPosition(State node) {
        if (node.subTopic == null) return null;
        Matcher m = ITEM_ID.matcher(node.id);
        if (!m.find()) return null;
        String kind = m.group(1);
        int num = Integer.parseInt(m.group(2));
        if ("Q".equals(kind)) return num;
        long qCount = cache.getAllStates().stream()
                .filter(s -> node.module.equals(s.module) && node.subTopic.equals(s.subTopic) && "fact".equals(s.screenType))
                .count();
        return (int) qCount + num;
    }

    private record ModuleSubTopicPair(String moduleId, String subTopicId) {
    }

    /** Persists where the learner landed, and — the actual completion trigger —
     *  marks the sub-topic they were just IN as done the moment they leave it.
     *  `previous` is the pre-this-turn {moduleId, subTopicId}, if any. */
    private void persistProgress(Long userId, State node, String moduleId, String subTopicId, ModuleSubTopicPair previous) {
        String status = "exit".equals(node.type) ? "completed" : "in_progress";
        progressService.upsert(userId, node.id, "exit".equals(node.type) ? node.id : null, moduleId, subTopicId, status);

        if (previous != null && previous.moduleId() != null && previous.subTopicId() != null
                && !previous.subTopicId().equals(node.subTopic)) {
            subTopicCompletionRepository.markComplete(userId, previous.moduleId(), previous.subTopicId());
        } else if (node.subTopic != null) {
            Integer itemsSeen = computeItemPosition(node);
            if (itemsSeen != null) {
                subTopicItemProgressRepository.recordProgress(userId, moduleId, subTopicId, itemsSeen);
            }
        }
    }

    /** A learner's saved position can go stale if an admin deletes/renames the
     *  topic they were in. Rather than surface a raw "unknown state" error with no
     *  way out, land them back on the main menu, which always exists. */
    private ChatTurnDto recoverToMainMenu(Long userId) {
        ChainResult r = resolveChain("MAIN_MENU", null, null);
        persistProgress(userId, r.node(), r.moduleId(), r.subTopicId(), null);
        return buildResponse(r.node(), r.message(), null, r.moduleId(), r.subTopicId());
    }

    @Transactional
    public ChatTurnDto startSession(String externalUserId, boolean simulateNextDay, String displayName, Integer clientHour) {
        UserEntity user = userService.findOrCreateByExternalId(externalUserId);
        if (displayName != null && !displayName.isBlank()) {
            userService.setDisplayName(user.getId(), displayName.trim());
        }
        String effectiveName = (displayName != null && !displayName.isBlank()) ? displayName.trim() : user.getDisplayName();

        Optional<UserProgressEntity> progressOpt = progressService.get(user.getId());

        String entryStateId = "WELCOME";
        String moduleIdHint = null;
        String subTopicIdHint = null;

        if (progressOpt.isPresent()) {
            UserProgressEntity progress = progressOpt.get();
            boolean returningNextDay = simulateNextDay || isNewCalendarDay(progress.getUpdatedAt());
            if ("completed".equals(progress.getStatus()) && returningNextDay && getReinforcementQuiz(progress.getModuleId()) != null) {
                entryStateId = "ND_WELCOME";
                moduleIdHint = progress.getModuleId();
            } else if ("in_progress".equals(progress.getStatus()) && !"MAIN_MENU".equals(progress.getCurrentState())) {
                // Resume exactly where they left off — genuinely mid-conversation, no greeting.
                try {
                    State node = resolveNode(progress.getCurrentState(), progress.getModuleId());
                    return buildResponse(node, node.message, null, progress.getModuleId(), progress.getSubTopicId());
                } catch (RuntimeException ex) {
                    return recoverToMainMenu(user.getId());
                }
            }
            // Else: idle at MAIN_MENU, or completed with no reinforcement quiz / same
            // day => falls through to re-greet from WELCOME every time the app opens.
        }

        if ("WELCOME".equals(entryStateId)) {
            String greeting = buildGreeting(effectiveName, clientHour);
            ChainResult r = resolveChain("MAIN_MENU", moduleIdHint, subTopicIdHint);
            persistProgress(user.getId(), r.node(), r.moduleId(), r.subTopicId(), null);
            return buildResponse(r.node(), greeting + "\n\n" + r.message(), null, r.moduleId(), r.subTopicId());
        }

        ChainResult r = resolveChain(entryStateId, moduleIdHint, subTopicIdHint);
        persistProgress(user.getId(), r.node(), r.moduleId(), r.subTopicId(), null);
        return buildResponse(r.node(), r.message(), null, r.moduleId(), r.subTopicId());
    }

    @Transactional
    public ChatTurnDto handleMessage(String externalUserId, String input) {
        UserEntity user = userService.findOrCreateByExternalId(externalUserId);
        UserProgressEntity progress = progressService.get(user.getId())
                .orElseThrow(() -> AppException.badRequest("No active session — call /chat/start first."));

        State currentNode;
        try {
            currentNode = resolveNode(progress.getCurrentState(), progress.getModuleId());
        } catch (RuntimeException ex) {
            return recoverToMainMenu(user.getId());
        }

        String trimmedInput = input != null ? input.trim() : "";
        ModuleSubTopicPair previous = new ModuleSubTopicPair(progress.getModuleId(), progress.getSubTopicId());
        // Only counts as leaving sub-topic content when the state we're leaving is
        // itself tagged as being inside a sub-topic — keeps a mid-sub-topic
        // navigation bail-out from being misrecorded as "finished."
        ModuleSubTopicPair previousForCompletion = currentNode.subTopic != null ? previous : null;

        // Global navigation shortcuts — work from literally any screen, always win
        // over the current state's own options, and never trigger completion.
        if ("menu".equals(trimmedInput)) {
            ChainResult r = resolveChain("MAIN_MENU", null, null);
            persistProgress(user.getId(), r.node(), r.moduleId(), r.subTopicId(), null);
            return buildResponse(r.node(), r.message(), null, r.moduleId(), r.subTopicId());
        }
        if ("back".equals(trimmedInput)) {
            String target = progress.getModuleId() != null ? "__MODULE_ENTRY__" : "MAIN_MENU";
            ChainResult r = resolveChain(target, progress.getModuleId(), progress.getSubTopicId());
            persistProgress(user.getId(), r.node(), r.moduleId(), r.subTopicId(), null);
            return buildResponse(r.node(), r.message(), null, r.moduleId(), r.subTopicId());
        }

        if ("menu".equals(currentNode.type)) {
            return handleMenu(user, progress, currentNode, trimmedInput, previousForCompletion);
        }

        if ("input".equals(currentNode.type)) {
            if (trimmedInput.isEmpty()) {
                return buildResponse(currentNode, currentNode.message, null, progress.getModuleId(), progress.getSubTopicId());
            }
            ChainResult r = resolveChain(currentNode.next, progress.getModuleId(), progress.getSubTopicId());
            persistProgress(user.getId(), r.node(), orElse(r.moduleId(), progress.getModuleId()), orElse(r.subTopicId(), progress.getSubTopicId()), previousForCompletion);
            return buildResponse(r.node(), r.message(), null, r.moduleId(), r.subTopicId());
        }

        if ("quiz".equals(currentNode.type)) {
            return handleQuiz(user, progress, currentNode, trimmedInput, previousForCompletion);
        }

        if ("mcq".equals(currentNode.type)) {
            return handleMcq(user, progress, currentNode, trimmedInput, previousForCompletion);
        }

        // The Continue tap on an "answered MCQ" screen — advance to whatever the
        // original MCQ's own `next` pointed at.
        if ("mcq-answered".equals(currentNode.type)) {
            ChainResult r = resolveChain(currentNode.next, progress.getModuleId(), progress.getSubTopicId());
            persistProgress(user.getId(), r.node(), orElse(r.moduleId(), progress.getModuleId()), orElse(r.subTopicId(), progress.getSubTopicId()), previousForCompletion);
            return buildResponse(r.node(), r.message(), null, r.moduleId(), r.subTopicId());
        }

        // exit / auto should never be the persisted "current" state, but guard defensively.
        return buildResponse(currentNode, currentNode.message, null, progress.getModuleId(), progress.getSubTopicId());
    }

    private ChatTurnDto handleMenu(UserEntity user, UserProgressEntity progress, State currentNode, String trimmedInput,
                                    ModuleSubTopicPair previousForCompletion) {
        Option matchedOption = findOptionById(currentNode.options, trimmedInput);
        String targetId;
        String matchedOptionId = null;

        if (matchedOption != null) {
            targetId = matchedOption.next;
            matchedOptionId = matchedOption.id;
        } else if ("EXPLAIN_FURTHER".equals(currentNode.id)) {
            SubTopicOptionDto sub = getVisibleSubTopicOptions(progress.getModuleId()).stream()
                    .filter(o -> o.id().equals(trimmedInput)).findFirst().orElse(null);
            if (sub == null) {
                return buildResponse(currentNode, "Sorry, I didn't understand that.\n\n" + currentNode.message, null,
                        progress.getModuleId(), progress.getSubTopicId());
            }
            targetId = sub.next();
        } else {
            return buildResponse(currentNode, "Sorry, I didn't understand that.\n\n" + currentNode.message, null,
                    progress.getModuleId(), progress.getSubTopicId());
        }

        // Tapping a topic tile from the Main Menu normally starts its
        // Greeting/Overview intro chain — but only the first time.
        if ("MAIN_MENU".equals(currentNode.id) && matchedOptionId != null && hasSeenIntro(user.getId(), matchedOptionId)) {
            String entry = getModuleEntryState(matchedOptionId);
            if (entry != null) targetId = entry;
        }

        ChainResult r = resolveChain(targetId, progress.getModuleId(), progress.getSubTopicId());
        persistProgress(user.getId(), r.node(), orElse(r.moduleId(), progress.getModuleId()), orElse(r.subTopicId(), progress.getSubTopicId()), previousForCompletion);
        return buildResponse(r.node(), r.message(), null, r.moduleId(), r.subTopicId());
    }

    private ChatTurnDto handleQuiz(UserEntity user, UserProgressEntity progress, State currentNode, String trimmedInput,
                                    ModuleSubTopicPair previousForCompletion) {
        QuizConfig quiz = currentNode.quiz;
        String quizAttemptKey = currentNode.id + ":" + (currentNode.module != null ? currentNode.module : "global");
        int attemptNumber = (int) quizAttemptRepository.countByUserIdAndStateId(user.getId(), quizAttemptKey) + 1;
        String normalized = trimmedInput.toLowerCase();
        long matchCount = quiz.keywords.stream().filter(normalized::contains).count();
        boolean isCorrect = matchCount >= quiz.minMatches;

        quizAttemptRepository.save(new QuizAttemptEntity(user.getId(), quizAttemptKey, trimmedInput, isCorrect, attemptNumber));

        if (isCorrect) {
            ChainResult r = resolveChain(quiz.onCorrect, progress.getModuleId(), progress.getSubTopicId());
            persistProgress(user.getId(), r.node(), orElse(r.moduleId(), progress.getModuleId()), orElse(r.subTopicId(), progress.getSubTopicId()), previousForCompletion);
            String prefix = quiz.correctMessage != null ? quiz.correctMessage + "\n\n" : "";
            return buildResponse(r.node(), prefix + r.message(), "correct", r.moduleId(), r.subTopicId());
        }

        if (attemptNumber >= quiz.maxAttempts) {
            ChainResult r = resolveChain(quiz.onExhausted, progress.getModuleId(), progress.getSubTopicId());
            persistProgress(user.getId(), r.node(), orElse(r.moduleId(), progress.getModuleId()), orElse(r.subTopicId(), progress.getSubTopicId()), previousForCompletion);
            return buildResponse(r.node(), quiz.exhaustedMessage + "\n\n" + r.message(), "incorrect", r.moduleId(), r.subTopicId());
        }

        persistProgress(user.getId(), currentNode, progress.getModuleId(), progress.getSubTopicId(), previousForCompletion);
        return buildResponse(currentNode, quiz.incorrectMessage + "\n\n" + currentNode.message, "incorrect",
                progress.getModuleId(), progress.getSubTopicId());
    }

    private ChatTurnDto handleMcq(UserEntity user, UserProgressEntity progress, State currentNode, String trimmedInput,
                                   ModuleSubTopicPair previousForCompletion) {
        Option option = findOptionById(currentNode.options, trimmedInput);
        if (option == null) {
            return buildResponse(currentNode, "Sorry, I didn't understand that.\n\n" + currentNode.message, null,
                    progress.getModuleId(), progress.getSubTopicId());
        }

        // "Back"/"Main Menu" mixed into the same options array as the graded
        // choices — not an attempt, not graded, not a completion signal.
        if (option.isNavigate()) {
            ChainResult r = resolveChain(option.next, progress.getModuleId(), progress.getSubTopicId());
            persistProgress(user.getId(), r.node(), orElse(r.moduleId(), progress.getModuleId()), orElse(r.subTopicId(), progress.getSubTopicId()), null);
            return buildResponse(r.node(), r.message(), null, r.moduleId(), r.subTopicId());
        }

        String mcqAttemptKey = currentNode.id + ":" + (currentNode.module != null ? currentNode.module : "global");
        int attemptNumber = (int) quizAttemptRepository.countByUserIdAndStateId(user.getId(), mcqAttemptKey) + 1;
        boolean isCorrect = option.id.equals(currentNode.correctOptionId);

        quizAttemptRepository.save(new QuizAttemptEntity(user.getId(), mcqAttemptKey, option.id, isCorrect, attemptNumber));

        // Correct (or attempts exhausted) lands on the "answered" screen first —
        // same question/choices, locked and highlighted — rather than jumping
        // straight to the next question combined on one screen.
        if (isCorrect) {
            State node = buildAnsweredMcqNode(currentNode, "correct", option.id);
            persistProgress(user.getId(), node, progress.getModuleId(), progress.getSubTopicId(), previousForCompletion);
            return buildResponse(node, node.message, "correct", progress.getModuleId(), progress.getSubTopicId());
        }

        int maxAttempts = currentNode.maxAttempts != null ? currentNode.maxAttempts : 3;
        if (attemptNumber >= maxAttempts) {
            State node = buildAnsweredMcqNode(currentNode, "exhausted", option.id);
            persistProgress(user.getId(), node, progress.getModuleId(), progress.getSubTopicId(), previousForCompletion);
            return buildResponse(node, node.message, "incorrect", progress.getModuleId(), progress.getSubTopicId());
        }

        persistProgress(user.getId(), currentNode, progress.getModuleId(), progress.getSubTopicId(), previousForCompletion);
        return buildResponse(currentNode, currentNode.incorrectMessage + "\n\n" + currentNode.message, "incorrect",
                progress.getModuleId(), progress.getSubTopicId());
    }

    private Option findOptionById(List<Option> options, String id) {
        if (options == null) return null;
        return options.stream().filter(o -> id.equals(o.id)).findFirst().orElse(null);
    }

    private String orElse(String value, String fallback) {
        return value != null ? value : fallback;
    }
}
