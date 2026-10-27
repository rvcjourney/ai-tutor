package com.aitutor.engine;

import com.aitutor.entity.UserEntity;
import com.aitutor.repository.UserRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Port of userRepository.js's findOrCreateByExternalId. Node's version needed an
 * explicit `INSERT ... ON CONFLICT DO NOTHING RETURNING *` + re-SELECT fallback
 * because going async opened a real race (two requests for the same brand-new
 * externalId can both miss the initial SELECT). Spring's connection pool is just
 * as concurrent, so the same race exists here — handled the idiomatic JPA way:
 * attempt the insert in its own transaction, and if the `external_id` UNIQUE
 * constraint rejects it (the other request won), just re-read the row the winner
 * created instead of propagating the failure.
 */
@Service
public class UserService {

    private final UserRepository userRepository;

    public UserService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    public UserEntity findOrCreateByExternalId(String externalId) {
        return userRepository.findByExternalId(externalId)
                .orElseGet(() -> createOrFetchExisting(externalId));
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    protected UserEntity createOrFetchExisting(String externalId) {
        try {
            return userRepository.saveAndFlush(new UserEntity(externalId));
        } catch (DataIntegrityViolationException raceLost) {
            return userRepository.findByExternalId(externalId)
                    .orElseThrow(() -> raceLost);
        }
    }

    @Transactional
    public void setDisplayName(Long userId, String displayName) {
        UserEntity user = userRepository.findById(userId).orElseThrow();
        user.setDisplayName(displayName);
        userRepository.save(user);
    }
}
