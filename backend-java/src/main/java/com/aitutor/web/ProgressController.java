package com.aitutor.web;

import com.aitutor.dto.ProgressSummaryDto;
import com.aitutor.engine.ProgressSummaryService;
import com.aitutor.engine.UserProgressService;
import com.aitutor.engine.UserService;
import com.aitutor.entity.UserEntity;
import com.aitutor.entity.UserProgressEntity;
import com.aitutor.exception.AppException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Port of backend/src/routes/progress.js + controllers/progressController.js. */
@RestController
public class ProgressController {

    private final UserService userService;
    private final UserProgressService progressService;
    private final ProgressSummaryService progressSummaryService;

    public ProgressController(UserService userService, UserProgressService progressService,
                               ProgressSummaryService progressSummaryService) {
        this.userService = userService;
        this.progressService = progressService;
        this.progressSummaryService = progressSummaryService;
    }

    @GetMapping("/progress")
    public Map<String, Object> get(@RequestParam(required = false) String userId) {
        if (userId == null || userId.isBlank()) {
            throw AppException.badRequest("userId query param is required");
        }

        UserEntity user = userService.findOrCreateByExternalId(userId);
        Optional<UserProgressEntity> progress = progressService.get(user.getId());
        ProgressSummaryDto summary = progressSummaryService.getProgressSummary(user.getId());

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("userId", userId);
        response.put("displayName", user.getDisplayName());

        if (progress.isEmpty()) {
            response.put("currentState", null);
            response.put("lastCompletedState", null);
            response.put("moduleId", null);
            response.put("status", "not_started");
        } else {
            UserProgressEntity p = progress.get();
            response.put("currentState", p.getCurrentState());
            response.put("lastCompletedState", p.getLastCompletedState());
            response.put("moduleId", p.getModuleId());
            response.put("subTopicId", p.getSubTopicId());
            response.put("status", p.getStatus());
            response.put("updatedAt", p.getUpdatedAt());
        }

        response.put("overallPercent", summary.overallPercent());
        response.put("estimatedMinutesLeft", summary.estimatedMinutesLeft());
        response.put("modules", summary.modules());
        return response;
    }
}
