package com.aitutor.repository;

import com.aitutor.entity.ConversationFileEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ConversationFileRepository extends JpaRepository<ConversationFileEntity, String> {
}
