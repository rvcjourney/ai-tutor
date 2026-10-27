package com.aitutor.exception;

/**
 * Carries an HTTP status alongside the message, the same way the Node backend
 * attached {@code statusCode} to a thrown Error (see e.g. publishService.js,
 * topicContent.js). {@link ApiExceptionHandler} reads {@link #getStatusCode()}
 * the same way errorHandler.js reads {@code err.statusCode}, defaulting to 500.
 */
public class AppException extends RuntimeException {

    private final int statusCode;

    public AppException(String message, int statusCode) {
        super(message);
        this.statusCode = statusCode;
    }

    public static AppException badRequest(String message) {
        return new AppException(message, 400);
    }

    public static AppException notFound(String message) {
        return new AppException(message, 404);
    }

    public static AppException serverError(String message) {
        return new AppException(message, 500);
    }

    public int getStatusCode() {
        return statusCode;
    }
}
