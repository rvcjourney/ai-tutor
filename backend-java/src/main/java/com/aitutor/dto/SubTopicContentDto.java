package com.aitutor.dto;

import com.aitutor.model.WalkItem;
import java.util.List;

public record SubTopicContentDto(String id, String label, List<WalkItem> items) {
}
