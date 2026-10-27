package com.aitutor.admin;

import com.aitutor.model.CsvRow;
import java.util.List;
import java.util.function.Function;
import org.springframework.stereotype.Component;

/** Port of backend/src/admin/csvExporter.js — serializes rows back into a CSV an
 *  admin can download, edit in a spreadsheet, and re-upload through the existing
 *  Preview/Publish path, round-tripping through the exact column names
 *  CsvImporter#parseRows already recognizes. */
@Component
public class CsvExporter {

    private record Column(String header, Function<CsvRow, String> getter) {
    }

    private static final List<Column> COLUMNS = List.of(
            new Column("Topic", r -> r.topic),
            new Column("Sub-Topic", r -> r.subTopic),
            new Column("Type", r -> r.type),
            new Column("#", r -> r.num != null ? String.valueOf(r.num) : ""),
            new Column("Question", r -> r.question),
            new Column("Choice A", r -> r.choiceA),
            new Column("Choice B", r -> r.choiceB),
            new Column("Choice C", r -> r.choiceC),
            new Column("Choice D", r -> r.choiceD),
            new Column("Correct", r -> r.correct),
            new Column("Answer/Explanation", r -> r.answer));

    private String csvField(String value) {
        String str = value == null ? "" : value;
        if (str.matches(".*[\",\\n\\r].*")) {
            return "\"" + str.replace("\"", "\"\"") + "\"";
        }
        return str;
    }

    public String rowsToCsv(List<CsvRow> rows) {
        StringBuilder sb = new StringBuilder();
        sb.append(String.join(",", COLUMNS.stream().map(c -> csvField(c.header())).toList())).append("\r\n");
        for (CsvRow row : rows) {
            sb.append(String.join(",", COLUMNS.stream().map(c -> csvField(c.getter().apply(row))).toList())).append("\r\n");
        }
        return sb.toString();
    }
}
