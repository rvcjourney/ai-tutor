package com.aitutor.dto;

import com.aitutor.model.McqChoices;
import java.util.List;

/** Port of fsmEngine.js's buildResponse() return shape — exact same JSON keys so
 *  the existing React frontend (chatApi.js) needs no changes. Deliberately NOT
 *  @JsonInclude(NON_NULL): the Node version's plain object always carries every
 *  key, explicit `null` and all — e.g. {"screenType": null}, not an omitted key —
 *  so this keeps default Jackson behavior (nulls serialize as JSON null) to match
 *  byte-for-byte. */
public record ChatTurnDto(
        String state,
        String message,
        List<OptionDto> options,
        String inputType,
        String optionsVariant,
        String moduleId,
        String subTopicId,
        String screenType,
        String feedback,
        List<SubTopicOptionDto> subTopicOptions,
        McqChoices mcqChoices,
        String revealMessage
) {
}
