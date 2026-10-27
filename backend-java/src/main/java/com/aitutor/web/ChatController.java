package com.aitutor.web;

import com.aitutor.dto.ChatTurnDto;
import com.aitutor.dto.MessageRequest;
import com.aitutor.dto.StartSessionRequest;
import com.aitutor.engine.FsmEngine;
import com.aitutor.exception.AppException;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Port of backend/src/routes/chat.js + controllers/chatController.js. */
@RestController
@RequestMapping("/chat")
public class ChatController {

    private final FsmEngine fsmEngine;

    public ChatController(FsmEngine fsmEngine) {
        this.fsmEngine = fsmEngine;
    }

    @PostMapping("/start")
    public ChatTurnDto start(@RequestBody StartSessionRequest request) {
        if (request.userId() == null || request.userId().isBlank()) {
            throw AppException.badRequest("userId is required");
        }
        String displayName = request.displayName() != null && !request.displayName().isBlank()
                ? request.displayName().trim() : null;
        return fsmEngine.startSession(request.userId(), Boolean.TRUE.equals(request.simulateNextDay()),
                displayName, request.clientHour());
    }

    @PostMapping("/message")
    public ChatTurnDto message(@RequestBody MessageRequest request) {
        if (request.userId() == null || request.userId().isBlank() || request.input() == null) {
            throw AppException.badRequest("userId and input are required");
        }
        return fsmEngine.handleMessage(request.userId(), request.input());
    }
}
