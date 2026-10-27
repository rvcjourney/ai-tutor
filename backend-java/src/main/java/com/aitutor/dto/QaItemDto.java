package com.aitutor.dto;

/** The learner-facing Q&A explorer's read: just question+answer, never MCQs —
 *  those stay gated behind the graded FSM flow. See moduleController.js's
 *  getSubTopicQa. */
public record QaItemDto(String question, String answer) {
}
