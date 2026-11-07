package com.aitutor.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

/** Mirrors the `user_progress` table (see backend/src/repositories/progressRepository.js). */
@Entity
@Table(name = "user_progress")
public class UserProgressEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false, unique = true)
    private Long userId;

    @Column(name = "current_state", nullable = false)
    private String currentState;

    @Column(name = "last_completed_state")
    private String lastCompletedState;

    @Column(name = "module_id")
    private String moduleId;

    @Column(name = "sub_topic_id")
    private String subTopicId;

    @Column(name = "status", nullable = false)
    private String status;

    // Recomputed and written explicitly on every call (see UserProgressService)
    // rather than relying on the column DEFAULT — the DEFAULT only covers a
    // brand-new row before any real percent has been computed.
    @Column(name = "progress_percent", nullable = false)
    private Integer progressPercent = 0;

    // insertable=false so Postgres's column DEFAULT NOW() fires on INSERT (never
    // sent as NULL by Hibernate); left updatable so UserProgressService can bump it
    // explicitly on every UPDATE, mirroring progressRepository.js's `updated_at = NOW()`.
    @Column(name = "updated_at", insertable = false)
    private OffsetDateTime updatedAt;

    protected UserProgressEntity() {
    }

    public UserProgressEntity(Long userId, String currentState, String lastCompletedState, String moduleId,
                               String subTopicId, String status, Integer progressPercent) {
        this.userId = userId;
        this.currentState = currentState;
        this.lastCompletedState = lastCompletedState;
        this.moduleId = moduleId;
        this.subTopicId = subTopicId;
        this.status = status;
        this.progressPercent = progressPercent;
    }

    public Long getId() {
        return id;
    }

    public Long getUserId() {
        return userId;
    }

    public String getCurrentState() {
        return currentState;
    }

    public void setCurrentState(String currentState) {
        this.currentState = currentState;
    }

    public String getLastCompletedState() {
        return lastCompletedState;
    }

    public void setLastCompletedState(String lastCompletedState) {
        this.lastCompletedState = lastCompletedState;
    }

    public String getModuleId() {
        return moduleId;
    }

    public void setModuleId(String moduleId) {
        this.moduleId = moduleId;
    }

    public String getSubTopicId() {
        return subTopicId;
    }

    public void setSubTopicId(String subTopicId) {
        this.subTopicId = subTopicId;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public Integer getProgressPercent() {
        return progressPercent;
    }

    public void setProgressPercent(Integer progressPercent) {
        this.progressPercent = progressPercent;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(OffsetDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }
}
