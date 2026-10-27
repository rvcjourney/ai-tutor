package com.aitutor.repository;

import com.aitutor.entity.QuizAttemptEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface QuizAttemptRepository extends JpaRepository<QuizAttemptEntity, Long> {
    long countByUserIdAndStateId(Long userId, String stateId);
}
