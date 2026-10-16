package com.example.demo.exception;

// Tiered login lockout (5 fails -> short lock, +3 fails -> hours lock).
// Carries retryAfterSeconds so the client can show a countdown.
public class AccountLockedException extends RuntimeException {

    private final long retryAfterSeconds;

    public AccountLockedException(String message, long retryAfterSeconds) {
        super(message);
        this.retryAfterSeconds = retryAfterSeconds;
    }

    public long getRetryAfterSeconds() { return retryAfterSeconds; }
}
