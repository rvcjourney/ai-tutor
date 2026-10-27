package com.aitutor.engine;

import com.aitutor.entity.UserProgressEntity;
import com.aitutor.repository.UserProgressRepository;
import java.time.OffsetDateTime;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Port of backend/src/repositories/progressRepository.js's upsert() — same
 *  COALESCE semantics: lastCompletedState/moduleId/subTopicId are only
 *  overwritten when a non-null value is supplied, so a turn that doesn't carry
 *  a new module/sub-topic (e.g. a quiz retry) never clobbers what's already
 *  stored there. */
@Service
public class UserProgressService {

    private final UserProgressRepository repository;

    public UserProgressService(UserProgressRepository repository) {
        this.repository = repository;
    }

    public Optional<UserProgressEntity> get(Long userId) {
        return repository.findByUserId(userId);
    }

    @Transactional
    public UserProgressEntity upsert(Long userId, String currentState, String lastCompletedState,
                                      String moduleId, String subTopicId, String status) {
        Optional<UserProgressEntity> existing = repository.findByUserId(userId);
        if (existing.isPresent()) {
            UserProgressEntity p = existing.get();
            p.setCurrentState(currentState);
            if (lastCompletedState != null) p.setLastCompletedState(lastCompletedState);
            if (moduleId != null) p.setModuleId(moduleId);
            if (subTopicId != null) p.setSubTopicId(subTopicId);
            p.setStatus(status);
            p.setUpdatedAt(OffsetDateTime.now());
            return repository.save(p);
        }
        return repository.save(new UserProgressEntity(userId, currentState, lastCompletedState, moduleId, subTopicId, status));
    }
}
