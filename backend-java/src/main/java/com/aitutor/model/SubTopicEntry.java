package com.aitutor.model;

import com.fasterxml.jackson.annotation.JsonInclude;

/** One row in a topic's `subTopics` list in modules-registry.json — always listed
 *  for admin management, even with zero questions yet; `hidden` (Greeting/Overview)
 *  ones are filtered out of the learner-facing tile menu only. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class SubTopicEntry {
    public String id;
    public String label;
    public Boolean hidden;

    public SubTopicEntry() {
    }

    public SubTopicEntry(String id, String label, Boolean hidden) {
        this.id = id;
        this.label = label;
        this.hidden = hidden;
    }

    public boolean isHidden() {
        return Boolean.TRUE.equals(hidden);
    }
}
