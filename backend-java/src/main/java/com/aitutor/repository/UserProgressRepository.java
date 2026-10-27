package com.aitutor.repository;

import com.aitutor.entity.UserProgressEntity;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserProgressRepository extends JpaRepository<UserProgressEntity, Long> {
    Optional<UserProgressEntity> findByUserId(Long userId);
}
