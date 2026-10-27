package com.aitutor.dto;

public record SubTopicProgressDto(String id, String label, boolean hidden, boolean completed,
                                   int itemsSeen, int totalItems, int percent) {
}
