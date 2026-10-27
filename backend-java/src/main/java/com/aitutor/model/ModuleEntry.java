package com.aitutor.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

/** One topic's row in modules-registry.json's `modules` array — see
 *  csvImporter.js's buildTopic() for how `registryEntry` is produced. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ModuleEntry {
    public String id;
    public String title;
    public Boolean available;
    public String entryState;
    public List<SubTopicEntry> subTopics;
    public ReinforcementQuiz reinforcementQuiz;
}
