package com.aitutor.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

/** A module's next-day reinforcement quiz config — see fsmEngine.js's
 *  buildNdWelcomeNode/buildNdQuizNode, which synthesize the ND_WELCOME/ND_QUIZ
 *  states from this at resolve time rather than storing them as static states. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ReinforcementQuiz {
    public String welcomeMessage;
    public String question;
    public List<String> keywords;
    public Integer minMatches;
    public Integer maxAttempts;
    public String incorrectMessage;
    public String exhaustedMessage;
    public String correctMessage;
}
