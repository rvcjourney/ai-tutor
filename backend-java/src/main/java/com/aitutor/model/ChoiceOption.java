package com.aitutor.model;

import com.fasterxml.jackson.annotation.JsonInclude;

/** A plain {id, label} pair — the stripped-down choice shape shown on the
 *  "answered MCQ" screen (see fsmEngine.js's buildAnsweredMcqNode). */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ChoiceOption {
    public String id;
    public String label;

    public ChoiceOption() {
    }

    public ChoiceOption(String id, String label) {
        this.id = id;
        this.label = label;
    }
}
