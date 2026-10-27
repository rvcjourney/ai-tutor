package com.aitutor.dto;

import java.util.List;

public record TopicContentDto(String moduleId, String title, List<SubTopicContentDto> subTopics) {
}
