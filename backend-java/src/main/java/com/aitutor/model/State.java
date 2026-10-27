package com.aitutor.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

/**
 * One screen in the conversation graph. Deliberately a single "fat" class with
 * nullable fields rather than a type hierarchy, mirroring the loosely-typed plain
 * JS objects csvImporter.js/fsmEngine.js work with — every state type (menu,
 * mcq, mcq-answered, quiz, input, auto, exit) uses a different subset of these
 * fields. See backend/src/admin/csvImporter.js (buildStatesForSubTopic) for how
 * these are produced, and backend/src/engine/fsmEngine.js for how they're read.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class State {
    public String id;
    public String type;
    public String module;
    public String subTopic;
    /** 'question' | 'answer' | null — only set on fact (Q&A) screens. */
    public String screenType;
    public String message;
    public List<Option> options;
    public String next;

    // type == "quiz"
    public QuizConfig quiz;

    // type == "mcq"
    public String correctOptionId;
    public Integer maxAttempts;
    public String incorrectMessage;
    public String revealMessage;

    // type == "mcq-answered" (synthetic, never persisted — see FsmEngine#buildAnsweredMcqNode)
    public McqChoices mcqChoices;

    public State() {
    }

    /** Shallow copy, used by FsmEngine#buildAnsweredMcqNode to derive the synthetic
     *  "answered" screen from its base MCQ state without mutating the cached one. */
    public static State copyOf(State source) {
        State copy = new State();
        copy.id = source.id;
        copy.type = source.type;
        copy.module = source.module;
        copy.subTopic = source.subTopic;
        copy.screenType = source.screenType;
        copy.message = source.message;
        copy.options = source.options;
        copy.next = source.next;
        copy.quiz = source.quiz;
        copy.correctOptionId = source.correctOptionId;
        copy.maxAttempts = source.maxAttempts;
        copy.incorrectMessage = source.incorrectMessage;
        copy.revealMessage = source.revealMessage;
        copy.mcqChoices = source.mcqChoices;
        return copy;
    }
}
