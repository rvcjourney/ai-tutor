package com.aitutor.dto;

public record StartSessionRequest(String userId, Boolean simulateNextDay, String displayName, Integer clientHour) {
}
