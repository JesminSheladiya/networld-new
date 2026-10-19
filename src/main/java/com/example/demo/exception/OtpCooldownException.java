package com.example.demo.exception;

public class OtpCooldownException extends RuntimeException {
    private final long retryAfterSeconds;

    public OtpCooldownException(String message, long retryAfterSeconds) {
        super(message);
        this.retryAfterSeconds = retryAfterSeconds;
    }

    public long getRetryAfterSeconds() { return retryAfterSeconds; }
}
