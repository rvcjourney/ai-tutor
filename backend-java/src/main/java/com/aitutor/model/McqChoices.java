package com.aitutor.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

/** Carried only on the synthetic "answered MCQ" screen — the original question's
 *  choices plus which one was correct and (when known) which one the learner
 *  picked, so the UI can render a locked/highlighted choice grid instead of a
 *  bare feedback card. See fsmEngine.js's buildAnsweredMcqNode. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class McqChoices {
    public List<ChoiceOption> options;
    public String correctOptionId;
    public String selectedOptionId;

    public McqChoices() {
    }

    public McqChoices(List<ChoiceOption> options, String correctOptionId, String selectedOptionId) {
        this.options = options;
        this.correctOptionId = correctOptionId;
        this.selectedOptionId = selectedOptionId;
    }
}
