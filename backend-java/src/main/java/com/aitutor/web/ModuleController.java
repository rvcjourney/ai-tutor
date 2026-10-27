package com.aitutor.web;

import com.aitutor.admin.TopicContentService;
import com.aitutor.dto.QaItemDto;
import com.aitutor.engine.ConversationCache;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

/** Port of backend/src/routes/modules.js + controllers/moduleController.js. */
@RestController
public class ModuleController {

    private final ConversationCache cache;
    private final TopicContentService topicContentService;

    public ModuleController(ConversationCache cache, TopicContentService topicContentService) {
        this.cache = cache;
        this.topicContentService = topicContentService;
    }

    @GetMapping("/modules")
    public Map<String, Object> list() {
        return Map.of("modules", cache.getModulesRegistry());
    }

    @GetMapping("/modules/{moduleId}/subtopics/{subTopicId}/qa")
    public Map<String, List<QaItemDto>> getSubTopicQa(@PathVariable String moduleId, @PathVariable String subTopicId) {
        return Map.of("items", topicContentService.getSubTopicQaList(moduleId, subTopicId));
    }
}
