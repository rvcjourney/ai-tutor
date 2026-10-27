package com.aitutor.model;

import java.util.List;

/** The output of CsvImporter#buildTopic — everything PublishService needs to
 *  write one topic: its generated states, its modules-registry.json entry, and
 *  the option that gets added to MAIN_MENU. See csvImporter.js's buildTopic(). */
public class TopicPlan {
    public String moduleId;
    public String moduleFileName;
    public String title;
    public String entryState;
    public List<State> states;
    public ModuleEntry registryEntry;
    public Option mainMenuOption;
}
