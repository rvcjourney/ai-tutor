package com.aitutor.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

/** Mirrors the `sub_topic_completions` table (see backend/src/repositories/subTopicProgressRepository.js). */
@Entity
@Table(name = "sub_topic_completions")
public class SubTopicCompletionEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "module_id", nullable = false)
    private String moduleId;

    @Column(name = "sub_topic_id", nullable = false)
    private String subTopicId;

    @Column(name = "completed_at", insertable = false, updatable = false)
    private OffsetDateTime completedAt;

    protected SubTopicCompletionEntity() {
    }

    public SubTopicCompletionEntity(Long userId, String moduleId, String subTopicId) {
        this.userId = userId;
        this.moduleId = moduleId;
        this.subTopicId = subTopicId;
    }

    public Long getId() {
        return id;
    }

    public Long getUserId() {
        return userId;
    }

    public String getModuleId() {
        return moduleId;
    }

    public String getSubTopicId() {
        return subTopicId;
    }

    public OffsetDateTime getCompletedAt() {
        return completedAt;
    }
}
