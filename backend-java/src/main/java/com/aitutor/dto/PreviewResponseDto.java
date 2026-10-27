package com.aitutor.dto;

import com.aitutor.model.CsvRow;
import java.util.List;

public record PreviewResponseDto(List<PreviewSummaryDto> summary, List<CsvRow> rows) {
}
