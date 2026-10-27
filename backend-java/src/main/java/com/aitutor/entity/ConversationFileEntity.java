package com.aitutor.entity;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * Mirrors the `conversation_files` table — one row per former JSON file
 * (main.json, modules-registry.json, each topic's `<module-id>.json`), storing
 * the exact same shape ({"states": [...]} or {"modules": [...]}) as a JSONB
 * blob. Kept as a raw {@link JsonNode} rather than a typed class here because
 * the two possible shapes are genuinely different — callers (ConversationCache)
 * branch on which key is present, exactly like conversationLoader.js does.
 */
@Entity
@Table(name = "conversation_files")
public class ConversationFileEntity {

    @Id
    @Column(name = "filename")
    private String filename;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "content", columnDefinition = "jsonb", nullable = false)
    private JsonNode content;

    // insertable=false so the column DEFAULT NOW() fires on INSERT; PublishService
    // sets this explicitly on every UPDATE, mirroring the Node version's
    // `ON CONFLICT ... DO UPDATE SET content = ..., updated_at = NOW()`.
    @Column(name = "updated_at", insertable = false)
    private OffsetDateTime updatedAt;

    protected ConversationFileEntity() {
    }

    public ConversationFileEntity(String filename, JsonNode content) {
        this.filename = filename;
        this.content = content;
    }

    public String getFilename() {
        return filename;
    }

    public JsonNode getContent() {
        return content;
    }

    public void setContent(JsonNode content) {
        this.content = content;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(OffsetDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }
}
