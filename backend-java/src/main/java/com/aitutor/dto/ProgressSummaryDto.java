package com.aitutor.dto;

import java.util.List;

public record ProgressSummaryDto(int overallPercent, int estimatedMinutesLeft, List<ModuleProgressDto> modules) {
}
