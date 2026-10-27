package com.aitutor.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

/** Mirrors the `quiz_attempts` table (see backend/src/repositories/quizAttemptRepository.js). */
@Entity
@Table(name = "quiz_attempts")
public class QuizAttemptEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "state_id", nullable = false)
    private String stateId;

    @Column(name = "answer_text", nullable = false)
    private String answerText;

    // Kept as 0/1 INTEGER, same as the Node version (isCorrect ? 1 : 0) — a
    // faithful port, not a "nicer" boolean column type change.
    @Column(name = "is_correct", nullable = false)
    private Integer isCorrect;

    @Column(name = "attempt_number", nullable = false)
    private Integer attemptNumber;

    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    protected QuizAttemptEntity() {
    }

    public QuizAttemptEntity(Long userId, String stateId, String answerText, boolean isCorrect, int attemptNumber) {
        this.userId = userId;
        this.stateId = stateId;
        this.answerText = answerText;
        this.isCorrect = isCorrect ? 1 : 0;
        this.attemptNumber = attemptNumber;
    }

    public Long getId() {
        return id;
    }

    public Long getUserId() {
        return userId;
    }

    public String getStateId() {
        return stateId;
    }

    public String getAnswerText() {
        return answerText;
    }

    public Integer getIsCorrect() {
        return isCorrect;
    }

    public Integer getAttemptNumber() {
        return attemptNumber;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }
}
