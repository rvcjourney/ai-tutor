package com.aitutor.model;

import com.fasterxml.jackson.annotation.JsonInclude;

/** A menu choice / MCQ answer choice. `navigate` flags a choice mixed into an MCQ's
 *  answer options that's really a Back/Main-Menu shortcut — see fsmEngine.js's mcq
 *  handling, which skips grading/attempt-counting for these. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class Option {
    public String id;
    public String label;
    public String next;
    public Boolean navigate;

    public Option() {
    }

    public Option(String id, String label, String next) {
        this.id = id;
        this.label = label;
        this.next = next;
    }

    public boolean isNavigate() {
        return Boolean.TRUE.equals(navigate);
    }
}
