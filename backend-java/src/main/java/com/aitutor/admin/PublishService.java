package com.aitutor.admin;

import com.aitutor.dto.PublishResultDto;
import com.aitutor.engine.ConversationCache;
import com.aitutor.entity.ConversationFileEntity;
import com.aitutor.exception.AppException;
import com.aitutor.model.ConversationFileData;
import com.aitutor.model.ModuleEntry;
import com.aitutor.model.Option;
import com.aitutor.model.RegistryFile;
import com.aitutor.model.State;
import com.aitutor.model.StatesFile;
import com.aitutor.model.TopicPlan;
import com.aitutor.repository.ConversationFileRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Port of backend/src/admin/publishService.js. Writes each topic's conversation
 * file + upserts it into modules-registry.json and MAIN_MENU's options, then
 * swaps the live in-memory cache to match. Validates the *entire* resulting file
 * set (not just what changed) before writing anything — a bad row that slipped
 * past CsvImporter's checks, a duplicate state id colliding with an unrelated
 * topic, etc. throws before a single statement runs. The in-memory cache is only
 * swapped in an afterCommit hook, so it can never run ahead of a transaction that
 * ends up rolling back (mirrors the Node version's "COMMIT, then setCache").
 */
@Service
public class PublishService {

    private final ConversationFileRepository repository;
    private final ConversationCache cache;
    private final ObjectMapper objectMapper;

    public PublishService(ConversationFileRepository repository, ConversationCache cache, ObjectMapper objectMapper) {
        this.repository = repository;
        this.cache = cache;
        this.objectMapper = objectMapper;
    }

    private <T> T readTree(JsonNode node, Class<T> type) {
        try {
            return objectMapper.treeToValue(node, type);
        } catch (JsonProcessingException e) {
            throw AppException.serverError("Could not parse conversation file: " + e.getMessage());
        }
    }

    @Transactional
    public List<PublishResultDto> publish(List<TopicPlan> topicPlans) {
        List<ConversationFileEntity> allRows = repository.findAll();
        Map<String, ConversationFileEntity> entityByName = new LinkedHashMap<>();
        Map<String, JsonNode> contentByName = new LinkedHashMap<>();
        for (ConversationFileEntity row : allRows) {
            entityByName.put(row.getFilename(), row);
            contentByName.put(row.getFilename(), row.getContent());
        }

        JsonNode registryNode = contentByName.get("modules-registry.json");
        if (registryNode == null) {
            throw AppException.serverError("modules-registry.json not found — database not seeded correctly");
        }
        RegistryFile registry = readTree(registryNode, RegistryFile.class);
        if (registry.modules == null) registry.modules = new ArrayList<>();

        for (TopicPlan plan : topicPlans) {
            int idx = indexOfModule(registry.modules, plan.moduleId);
            if (idx >= 0) registry.modules.set(idx, plan.registryEntry);
            else registry.modules.add(plan.registryEntry);
        }

        JsonNode mainNode = contentByName.get("main.json");
        if (mainNode == null) {
            throw AppException.serverError("main.json not found — database not seeded correctly");
        }
        StatesFile main = readTree(mainNode, StatesFile.class);
        State mainMenu = main.states.stream().filter(s -> "MAIN_MENU".equals(s.id)).findFirst()
                .orElseThrow(() -> AppException.badRequest("main.json has no MAIN_MENU state — cannot register new topics"));
        if (mainMenu.options == null) mainMenu.options = new ArrayList<>();

        for (TopicPlan plan : topicPlans) {
            int idx = indexOfOption(mainMenu.options, plan.moduleId);
            if (idx >= 0) mainMenu.options.set(idx, plan.mainMenuOption);
            else mainMenu.options.add(plan.mainMenuOption);
        }

        contentByName.put("modules-registry.json", objectMapper.valueToTree(registry));
        contentByName.put("main.json", objectMapper.valueToTree(main));
        for (TopicPlan plan : topicPlans) {
            contentByName.put(plan.moduleFileName, objectMapper.valueToTree(new StatesFile(plan.states)));
        }

        // Validate the full resulting set — including every topic NOT touched by
        // this publish — before writing anything at all.
        List<ConversationFileData> candidateFiles = new ArrayList<>();
        for (var entry : contentByName.entrySet()) {
            candidateFiles.add(new ConversationFileData(entry.getKey(), entry.getValue()));
        }
        ConversationCache.CacheSnapshot candidateCache = cache.buildCache(candidateFiles);

        upsert(entityByName, "modules-registry.json", contentByName.get("modules-registry.json"));
        upsert(entityByName, "main.json", contentByName.get("main.json"));
        for (TopicPlan plan : topicPlans) {
            upsert(entityByName, plan.moduleFileName, contentByName.get(plan.moduleFileName));
        }

        swapCacheAfterCommit(candidateCache);

        List<PublishResultDto> results = new ArrayList<>();
        for (TopicPlan plan : topicPlans) {
            State menuState = plan.states.stream().filter(s -> plan.entryState.equals(s.id)).findFirst().orElse(null);
            int subTopicCount = menuState != null && menuState.options != null ? menuState.options.size() : 0;
            results.add(new PublishResultDto(plan.moduleId, plan.title, subTopicCount, plan.states.size()));
        }
        return results;
    }

    public record RemoveResult(String moduleId, String title) {
    }

    /** Removes a topic entirely: deletes its conversation file, drops its entry
     *  from modules-registry.json, and drops its option from MAIN_MENU. Same
     *  validate-the-whole-set-before-writing-anything safety as publish(). */
    @Transactional
    public RemoveResult removeTopic(String moduleId) {
        List<ConversationFileEntity> allRows = repository.findAll();
        Map<String, ConversationFileEntity> entityByName = new LinkedHashMap<>();
        Map<String, JsonNode> contentByName = new LinkedHashMap<>();
        for (ConversationFileEntity row : allRows) {
            entityByName.put(row.getFilename(), row);
            contentByName.put(row.getFilename(), row.getContent());
        }

        JsonNode registryNode = contentByName.get("modules-registry.json");
        RegistryFile registry = registryNode != null ? readTree(registryNode, RegistryFile.class) : new RegistryFile(new ArrayList<>());
        ModuleEntry entry = registry.modules == null ? null
                : registry.modules.stream().filter(m -> moduleId.equals(m.id)).findFirst().orElse(null);
        if (entry == null) {
            throw AppException.notFound("No topic with id \"" + moduleId + "\"");
        }

        String moduleFileName = moduleId.replace("_", "-") + ".json";
        registry.modules = new ArrayList<>(registry.modules.stream().filter(m -> !moduleId.equals(m.id)).toList());

        JsonNode mainNode = contentByName.get("main.json");
        StatesFile main = mainNode != null ? readTree(mainNode, StatesFile.class) : null;
        if (main != null) {
            State mainMenu = main.states.stream().filter(s -> "MAIN_MENU".equals(s.id)).findFirst().orElse(null);
            if (mainMenu != null && mainMenu.options != null) {
                mainMenu.options = new ArrayList<>(mainMenu.options.stream().filter(o -> !moduleId.equals(o.id)).toList());
            }
        }

        contentByName.put("modules-registry.json", objectMapper.valueToTree(registry));
        if (main != null) contentByName.put("main.json", objectMapper.valueToTree(main));
        contentByName.remove(moduleFileName);

        List<ConversationFileData> candidateFiles = new ArrayList<>();
        for (var e : contentByName.entrySet()) {
            candidateFiles.add(new ConversationFileData(e.getKey(), e.getValue()));
        }
        ConversationCache.CacheSnapshot candidateCache = cache.buildCache(candidateFiles);

        repository.deleteById(moduleFileName);
        upsert(entityByName, "modules-registry.json", contentByName.get("modules-registry.json"));
        if (main != null) upsert(entityByName, "main.json", contentByName.get("main.json"));

        swapCacheAfterCommit(candidateCache);

        return new RemoveResult(moduleId, entry.title);
    }

    private void upsert(Map<String, ConversationFileEntity> entityByName, String filename, JsonNode content) {
        ConversationFileEntity entity = entityByName.get(filename);
        if (entity != null) {
            entity.setContent(content);
            entity.setUpdatedAt(OffsetDateTime.now());
            repository.save(entity);
        } else {
            repository.save(new ConversationFileEntity(filename, content));
        }
    }

    private void swapCacheAfterCommit(ConversationCache.CacheSnapshot candidateCache) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    cache.setCache(candidateCache);
                }
            });
        } else {
            cache.setCache(candidateCache);
        }
    }

    private int indexOfModule(List<ModuleEntry> modules, String moduleId) {
        for (int i = 0; i < modules.size(); i++) {
            if (moduleId.equals(modules.get(i).id)) return i;
        }
        return -1;
    }

    private int indexOfOption(List<Option> options, String id) {
        for (int i = 0; i < options.size(); i++) {
            if (id.equals(options.get(i).id)) return i;
        }
        return -1;
    }
}
