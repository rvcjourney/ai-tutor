package com.aitutor.web;

import com.aitutor.dto.ChatTurnDto;
import com.aitutor.dto.MessageRequest;
import com.aitutor.engine.FsmEngine;
import com.aitutor.engine.UserProgressService;
import com.aitutor.engine.UserService;
import com.aitutor.entity.UserEntity;
import com.aitutor.entity.UserProgressEntity;
import com.aitutor.exception.AppException;
import com.aitutor.model.State;
import java.util.Optional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Port of backend/src/routes/quiz.js + controllers/quizController.js — an alias
 *  for /chat/message that 400s if the learner isn't currently on a quiz state. */
@RestController
@RequestMapping("/quiz")
public class QuizController {

    private final FsmEngine fsmEngine;
    private final UserService userService;
    private final UserProgressService progressService;

    public QuizController(FsmEngine fsmEngine, UserService userService, UserProgressService progressService) {
        this.fsmEngine = fsmEngine;
        this.userService = userService;
        this.progressService = progressService;
    }

    @PostMapping("/submit")
    public ChatTurnDto submit(@RequestBody MessageRequest request) {
        if (request.userId() == null || request.userId().isBlank() || request.input() == null) {
            throw AppException.badRequest("userId and answer are required");
        }

        UserEntity user = userService.findOrCreateByExternalId(request.userId());
        Optional<UserProgressEntity> progress = progressService.get(user.getId());
        boolean onQuiz = progress.isPresent()
                && "quiz".equals(resolveSafely(progress.get()));
        if (!onQuiz) {
            throw AppException.badRequest("Current state is not a quiz");
        }

        return fsmEngine.handleMessage(request.userId(), request.input());
    }

    private String resolveSafely(UserProgressEntity progress) {
        State node = fsmEngine.resolveNode(progress.getCurrentState(), progress.getModuleId());
        return node.type;
    }
}
