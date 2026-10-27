package com.aitutor.repository;

import com.aitutor.entity.SubTopicItemProgressEntity;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.transaction.annotation.Transactional;

public interface SubTopicItemProgressRepository extends JpaRepository<SubTopicItemProgressEntity, Long> {

    List<SubTopicItemProgressEntity> findByUserId(Long userId);

    // Mirrors subTopicItemProgressRepository.js — only ever moves forward:
    // GREATEST(...) means a learner navigating back to an earlier item never
    // regresses the stored "furthest reached" position.
    @Modifying
    @Transactional
    @Query(value = """
        INSERT INTO sub_topic_item_progress (user_id, module_id, sub_topic_id, items_seen)
        VALUES (:userId, :moduleId, :subTopicId, :itemsSeen)
        ON CONFLICT (user_id, module_id, sub_topic_id)
        DO UPDATE SET items_seen = GREATEST(sub_topic_item_progress.items_seen, EXCLUDED.items_seen), updated_at = NOW()
        """, nativeQuery = true)
    void recordProgress(Long userId, String moduleId, String subTopicId, Integer itemsSeen);
}
