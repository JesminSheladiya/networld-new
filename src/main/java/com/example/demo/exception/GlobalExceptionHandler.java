package com.example.demo.exception;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.HashMap;
import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<?> handleValidation(MethodArgumentNotValidException ex) {
        Map<String, String> errors = new HashMap<>();
        ex.getBindingResult().getFieldErrors()
                .forEach(e -> errors.put(e.getField(), e.getDefaultMessage()));

        return ResponseEntity.badRequest()
                .body(Map.of(
                        "message", "Validation failed",
                        "errors", errors
                ));
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<?> handleDataIntegrity(DataIntegrityViolationException ex) {
        String msg = "Duplicate value";

        if (ex.getRootCause() != null) {
            String root = ex.getRootCause().getMessage();
            if (root.contains("uk_contact_user_phone") || root.contains("uk_contact_phone") || root.contains("uk_users_phone")) msg = "Phone already exists";
            if (root.contains("uk_contact_user_email") || root.contains("uk_contact_email") || root.contains("uk_users_email")) msg = "Email already exists";
        }

        return ResponseEntity.badRequest()
                .body(Map.of("message", msg));
    }

    @ExceptionHandler(OptimisticLockingFailureException.class)
    public ResponseEntity<?> handleOptimisticLocking(OptimisticLockingFailureException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("message", "Try again", "exceptionClass", ex.getClass().getName()));
    }

    // Bad credentials / dead sessions — the client wipes local auth on 401.
    @ExceptionHandler(org.springframework.security.authentication.BadCredentialsException.class)
    public ResponseEntity<?> handleBadCredentials(org.springframework.security.authentication.BadCredentialsException ex) {
        String msg = ex.getMessage() != null ? ex.getMessage() : "Unauthorized";
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(Map.of("message", msg, "error", msg));
    }

    // Tiered login lockout — 423 + retryAfterSeconds so the client can
    // show a countdown (handled like 429 on the frontend).
    @ExceptionHandler(AccountLockedException.class)
    public ResponseEntity<?> handleAccountLocked(AccountLockedException ex) {
        return ResponseEntity.status(HttpStatus.LOCKED)
                .header("Retry-After", String.valueOf(ex.getRetryAfterSeconds()))
                .body(Map.of(
                        "message", ex.getMessage() != null ? ex.getMessage() : "Account locked",
                        "error", "Account Locked",
                        "retryAfterSeconds", ex.getRetryAfterSeconds()));
    }

    @ExceptionHandler(OtpQuotaExceededException.class)
    public ResponseEntity<?> handleOtpQuota(OtpQuotaExceededException ex) {
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .header("Retry-After", String.valueOf(ex.getRetryAfterSeconds()))
                .body(Map.of(
                        "message", ex.getMessage(),
                        "error", "OTP daily limit exceeded",
                        "retryAfterSeconds", ex.getRetryAfterSeconds()));
    }

    @ExceptionHandler(OtpCooldownException.class)
    public ResponseEntity<?> handleOtpCooldown(OtpCooldownException ex) {
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .header("Retry-After", String.valueOf(ex.getRetryAfterSeconds()))
                .body(Map.of(
                        "message", ex.getMessage(),
                        "error", "OTP cooldown",
                        "retryAfterSeconds", ex.getRetryAfterSeconds()));
    }

    @ExceptionHandler(RuntimeException.class)
    public ResponseEntity<?> handleRuntime(RuntimeException ex) {
        ex.printStackTrace(); // Print to console logs
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(Map.of(
                    "message", ex.getMessage() != null ? ex.getMessage() : ex.toString(),
                    "exceptionClass", ex.getClass().getName()
                ));
    }
}
