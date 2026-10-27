package com.aitutor.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

/** Mirrors the `sub_topic_item_progress` table (see backend/src/repositories/subTopicItemProgressRepository.js). */
@Entity
@Table(name = "sub_topic_item_progress")
public class SubTopicItemProgressEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "module_id", nullable = false)
    private String moduleId;

    @Column(name = "sub_topic_id", nullable = false)
    private String subTopicId;

    @Column(name = "items_seen", nullable = false)
    private Integer itemsSeen;

    @Column(name = "updated_at")
    private OffsetDateTime updatedAt;

    protected SubTopicItemProgressEntity() {
    }

    public SubTopicItemProgressEntity(Long userId, String moduleId, String subTopicId, Integer itemsSeen) {
        this.userId = userId;
        this.moduleId = moduleId;
        this.subTopicId = subTopicId;
        this.itemsSeen = itemsSeen;
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

    public Integer getItemsSeen() {
        return itemsSeen;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }
}
