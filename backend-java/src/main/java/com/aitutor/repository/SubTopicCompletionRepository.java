package com.aitutor.repository;

import com.aitutor.entity.SubTopicCompletionEntity;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.transaction.annotation.Transactional;

public interface SubTopicCompletionRepository extends JpaRepository<SubTopicCompletionEntity, Long> {

    List<SubTopicCompletionEntity> findByUserId(Long userId);

    boolean existsByUserIdAndModuleIdAndSubTopicId(Long userId, String moduleId, String subTopicId);

    // Mirrors subTopicProgressRepository.js's `INSERT ... ON CONFLICT DO NOTHING` —
    // idempotent, so re-marking an already-completed sub-topic is a silent no-op.
    @Modifying
    @Transactional
    @Query(value = """
        INSERT INTO sub_topic_completions (user_id, module_id, sub_topic_id)
        VALUES (:userId, :moduleId, :subTopicId)
        ON CONFLICT (user_id, module_id, sub_topic_id) DO NOTHING
        """, nativeQuery = true)
    void markComplete(Long userId, String moduleId, String subTopicId);
}
