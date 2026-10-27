package com.aitutor.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

/** The free-text "reinforcement quiz" grading config attached to a `quiz`-type
 *  state (ND_QUIZ) — see fsmEngine.js's buildNdQuizNode / handleMessage's "quiz"
 *  branch (keyword matching, not exact text matching). */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class QuizConfig {
    public List<String> keywords;
    public Integer minMatches;
    public Integer maxAttempts;
    public String onCorrect;
    public String onIncorrect;
    public String onExhausted;
    public String incorrectMessage;
    public String exhaustedMessage;
    public String correctMessage;
}
