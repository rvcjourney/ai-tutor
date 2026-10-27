package com.aitutor.web;

import com.aitutor.admin.CrudService;
import com.aitutor.admin.CsvExporter;
import com.aitutor.admin.CsvImporter;
import com.aitutor.admin.PublishService;
import com.aitutor.admin.TopicContentService;
import com.aitutor.dto.CsvPayloadRequest;
import com.aitutor.dto.LabelRequest;
import com.aitutor.dto.PreviewResponseDto;
import com.aitutor.dto.PreviewSummaryDto;
import com.aitutor.dto.PublishResultDto;
import com.aitutor.dto.TitleRequest;
import com.aitutor.dto.TopicContentDto;
import com.aitutor.exception.AppException;
import com.aitutor.model.CsvRow;
import com.aitutor.model.ModuleEntry;
import com.aitutor.model.SubTopicEntry;
import com.aitutor.model.TopicPlan;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Port of backend/src/routes/admin.js + controllers/adminController.js. Some
 *  response shapes here look redundantly nested (e.g. delete endpoints returning
 *  {"removed": {"removed": ...}}) — that's not a mistake, it's an exact mirror of
 *  the Node version's actual wire format, which backend/public/admin.js (left
 *  unmodified) was built against. */
@RestController
@RequestMapping("/admin")
public class AdminController {

    private final CsvImporter csvImporter;
    private final CsvExporter csvExporter;
    private final PublishService publishService;
    private final TopicContentService topicContentService;
    private final CrudService crudService;

    public AdminController(CsvImporter csvImporter, CsvExporter csvExporter, PublishService publishService,
                            TopicContentService topicContentService, CrudService crudService) {
        this.csvImporter = csvImporter;
        this.csvExporter = csvExporter;
        this.publishService = publishService;
        this.topicContentService = topicContentService;
        this.crudService = crudService;
    }

    private String requireCsv(CsvPayloadRequest request) {
        if (request == null || request.csv() == null || request.csv().isEmpty()) {
            throw AppException.badRequest("\"csv\" (string) is required in the request body");
        }
        return request.csv();
    }

    @PostMapping("/import")
    public Map<String, List<PublishResultDto>> importContent(@RequestBody CsvPayloadRequest request) {
        String csv = requireCsv(request);
        List<TopicPlan> topicPlans = csvImporter.importCsv(csv);
        List<PublishResultDto> published = publishService.publish(topicPlans);
        return Map.of("published", published);
    }

    /** Parses + validates a CSV exactly like /admin/import does, but never writes
     *  anything — returns the actual parsed rows so the admin can review the real
     *  data in a table before committing, plus a small per-topic summary. */
    @PostMapping("/preview")
    public PreviewResponseDto previewContent(@RequestBody CsvPayloadRequest request) {
        String csv = requireCsv(request);
        List<CsvRow> rows = csvImporter.parseRows(csv);

        Map<String, int[]> counts = new LinkedHashMap<>(); // [questions, mcqs]
        Map<String, java.util.Set<String>> subTopicsByTopic = new LinkedHashMap<>();
        for (CsvRow row : rows) {
            counts.computeIfAbsent(row.topic, k -> new int[2]);
            subTopicsByTopic.computeIfAbsent(row.topic, k -> new java.util.LinkedHashSet<>()).add(row.subTopic);
            if ("MCQ".equals(row.type)) counts.get(row.topic)[1]++;
            else counts.get(row.topic)[0]++;
        }

        List<PreviewSummaryDto> summary = new ArrayList<>();
        for (var entry : counts.entrySet()) {
            String topic = entry.getKey();
            int[] c = entry.getValue();
            summary.add(new PreviewSummaryDto(topic, subTopicsByTopic.get(topic).size(), c[0], c[1]));
        }

        return new PreviewResponseDto(summary, rows);
    }

    @GetMapping("/topics/{moduleId}")
    public TopicContentDto getContent(@PathVariable String moduleId) {
        return topicContentService.getTopicContent(moduleId);
    }

    /** Downloads a topic's current content as the same CSV shape /admin/import
     *  accepts — lets an admin do bulk edits offline, then re-publish through the
     *  normal Preview/Publish flow. Filename is cosmetic only: re-upload matches
     *  by the "Topic" column text inside the file, not the file's name. */
    @GetMapping("/topics/{moduleId}/export")
    public ResponseEntity<String> exportContent(@PathVariable String moduleId) {
        topicContentService.getTopicEntry(moduleId); // 404s if the topic doesn't exist
        List<CsvRow> rows = topicContentService.getTopicRows(moduleId);
        String csv = csvExporter.rowsToCsv(rows);

        // moduleId is always a slugified [a-z0-9_]+ identifier, so — same as the
        // Node version — it's safe to drop straight into the header unescaped.
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.parseMediaType("text/csv; charset=utf-8"));
        headers.set(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + moduleId + ".csv\"");
        return ResponseEntity.ok().headers(headers).body("﻿" + csv);
    }

    // ---- Topics ----

    @PostMapping("/topics")
    public ResponseEntity<Map<String, ModuleEntry>> createTopic(@RequestBody TitleRequest request) {
        ModuleEntry topic = crudService.createTopic(request.title());
        return ResponseEntity.status(201).body(Map.of("topic", topic));
    }

    @PutMapping("/topics/{moduleId}")
    public Map<String, ModuleEntry> renameTopic(@PathVariable String moduleId, @RequestBody TitleRequest request) {
        return Map.of("topic", crudService.renameTopic(moduleId, request.title()));
    }

    @DeleteMapping("/topics/{moduleId}")
    public Map<String, PublishService.RemoveResult> deleteTopic(@PathVariable String moduleId) {
        return Map.of("removed", publishService.removeTopic(moduleId));
    }

    // ---- Sub-topics ----

    @PostMapping("/topics/{moduleId}/subtopics")
    public ResponseEntity<Map<String, SubTopicEntry>> createSubTopic(@PathVariable String moduleId, @RequestBody LabelRequest request) {
        SubTopicEntry subTopic = crudService.createSubTopic(moduleId, request.label());
        return ResponseEntity.status(201).body(Map.of("subTopic", subTopic));
    }

    @PutMapping("/topics/{moduleId}/subtopics/{subTopicId}")
    public Map<String, SubTopicEntry> renameSubTopic(@PathVariable String moduleId, @PathVariable String subTopicId,
                                                       @RequestBody LabelRequest request) {
        return Map.of("subTopic", crudService.renameSubTopic(moduleId, subTopicId, request.label()));
    }

    @DeleteMapping("/topics/{moduleId}/subtopics/{subTopicId}")
    public Map<String, Map<String, String>> deleteSubTopic(@PathVariable String moduleId, @PathVariable String subTopicId) {
        String removedId = crudService.deleteSubTopic(moduleId, subTopicId);
        return Map.of("removed", Map.of("removed", removedId));
    }

    // ---- Questions ----

    @PostMapping("/topics/{moduleId}/subtopics/{subTopicId}/questions")
    public ResponseEntity<Map<String, CsvRow>> createQuestion(@PathVariable String moduleId, @PathVariable String subTopicId,
                                                                @RequestBody Map<String, Object> body) {
        CsvRow question = crudService.createQuestion(moduleId, subTopicId, body);
        return ResponseEntity.status(201).body(Map.of("question", question));
    }

    @PutMapping("/topics/{moduleId}/subtopics/{subTopicId}/questions/{index}")
    public Map<String, CsvRow> updateQuestion(@PathVariable String moduleId, @PathVariable String subTopicId,
                                               @PathVariable String index, @RequestBody Map<String, Object> body) {
        return Map.of("question", crudService.updateQuestion(moduleId, subTopicId, index, body));
    }

    @DeleteMapping("/topics/{moduleId}/subtopics/{subTopicId}/questions/{index}")
    public Map<String, Map<String, Boolean>> deleteQuestion(@PathVariable String moduleId, @PathVariable String subTopicId,
                                                              @PathVariable String index) {
        boolean removed = crudService.deleteQuestion(moduleId, subTopicId, index);
        return Map.of("removed", Map.of("removed", removed));
    }
}
