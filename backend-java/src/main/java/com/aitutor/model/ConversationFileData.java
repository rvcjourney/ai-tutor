package com.aitutor.model;

import com.fasterxml.jackson.databind.JsonNode;

/** A plain (filename, content) pair — decoupled from the JPA entity so
 *  PublishService can build an in-memory candidate file set (including edits not
 *  yet written to the database) and hand it to ConversationCache#buildCache for
 *  validation before anything is persisted. */
public record ConversationFileData(String filename, JsonNode content) {
}
