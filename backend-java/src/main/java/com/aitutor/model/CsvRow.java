package com.aitutor.model;

/** The flat row shape csvImporter.js/csvExporter.js/crudService.js all share —
 *  one CSV row (Topic, Sub-Topic, Type, #, Question, Choice A-D, Correct,
 *  Answer/Explanation). Mutable + a copy() helper since the admin CRUD paths
 *  build modified copies of existing rows (see crudService.js's `{...r, ...}`
 *  spreads) rather than rebuilding rows from scratch. */
public class CsvRow {
    public String topic;
    public String subTopic;
    public String type; // Q | MCQ | GREETING | OVERVIEW
    public Integer num;
    public String question;
    public String choiceA;
    public String choiceB;
    public String choiceC;
    public String choiceD;
    public String correct;
    public String answer;

    public CsvRow() {
    }

    public CsvRow copy() {
        CsvRow c = new CsvRow();
        c.topic = topic;
        c.subTopic = subTopic;
        c.type = type;
        c.num = num;
        c.question = question;
        c.choiceA = choiceA;
        c.choiceB = choiceB;
        c.choiceC = choiceC;
        c.choiceD = choiceD;
        c.correct = correct;
        c.answer = answer;
        return c;
    }

    public String choice(String letter) {
        return switch (letter) {
            case "A" -> choiceA;
            case "B" -> choiceB;
            case "C" -> choiceC;
            case "D" -> choiceD;
            default -> null;
        };
    }
}
