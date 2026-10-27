package com.aitutor.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

/** Reconstructs one CSV row's worth of content from the published state graph —
 *  "Q" items carry question/answer, "MCQ" items carry choices/correct/explanation.
 *  See TopicContentService#walkSubTopic (port of topicContent.js's walkSubTopic). */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class WalkItem {
    public String type; // "Q" | "MCQ"
    public String question;
    public String answer; // Q only
    public List<ChoiceOption> choices; // MCQ only
    public String correct; // MCQ only
    public String explanation; // MCQ only
}
