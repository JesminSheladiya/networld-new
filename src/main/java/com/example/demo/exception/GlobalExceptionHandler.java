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
            if (root.contains("uk_contact_phone")) msg = "Phone already exists";
            if (root.contains("uk_contact_email")) msg = "Email already exists";
        }

        return ResponseEntity.badRequest()
                .body(Map.of("message", msg));
    }

    @ExceptionHandler(OptimisticLockingFailureException.class)
    public ResponseEntity<?> handleOptimisticLocking(OptimisticLockingFailureException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("message", "Try again", "exceptionClass", ex.getClass().getName()));
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
