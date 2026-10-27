package com.aitutor.dto;

import java.util.List;

public record ModuleProgressDto(String id, String title, String entryState, int totalSubTopics,
                                 int completedSubTopics, int percent, int estimatedMinutesLeft,
                                 List<SubTopicProgressDto> subTopics) {
}
