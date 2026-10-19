package com.example.demo.exception;

public class OtpQuotaExceededException extends RuntimeException {
    private final long retryAfterSeconds;

    public OtpQuotaExceededException(String message, long retryAfterSeconds) {
        super(message);
        this.retryAfterSeconds = retryAfterSeconds;
    }

    public long getRetryAfterSeconds() { return retryAfterSeconds; }
}
