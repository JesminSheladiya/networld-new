package com.example.demo.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

// Central rate-limit knobs (Strict defaults). Override via env / properties:
// APP_RATELIMIT_AUTH-REQUESTS, APP_RATELIMIT_OTP-REQUESTS, APP_RATELIMIT_GLOBAL-REQUESTS
@Configuration
@ConfigurationProperties(prefix = "app.ratelimit")
public class RateLimitProperties {

    /** Master switch — set false to bypass the filter (tests / emergency). */
    private boolean enabled = true;

    /** Sensitive auth endpoints: login, register, forgot-password reset. */
    private int authRequests = 5;
    private long authWindowMinutes = 1;

    /** OTP / destructive endpoints: request-otp, resend-otp, verify-otp, delete-account/request. */
    private int otpRequests = 3;
    private long otpWindowMinutes = 1;

    /** Fallback for every other /api/** call. Per user when authenticated. */
    private int globalRequests = 300;
    private long globalWindowMinutes = 1;

    /** Read-only list/search calls can legitimately issue one request per page. Per user when authenticated. */
    private int readRequests = 1500;
    private long readWindowMinutes = 1;

    /**
     * true = counters Redis me (multi-instance safe).
     * false = in-memory ConcurrentHashMap (single instance).
     * When Redis is unavailable, the service automatically falls back to memory.
     */
    private boolean distributed = false;

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }

    public int getAuthRequests() { return authRequests; }
    public void setAuthRequests(int authRequests) { this.authRequests = authRequests; }

    public long getAuthWindowMinutes() { return authWindowMinutes; }
    public void setAuthWindowMinutes(long authWindowMinutes) { this.authWindowMinutes = authWindowMinutes; }

    public int getOtpRequests() { return otpRequests; }
    public void setOtpRequests(int otpRequests) { this.otpRequests = otpRequests; }

    public long getOtpWindowMinutes() { return otpWindowMinutes; }
    public void setOtpWindowMinutes(long otpWindowMinutes) { this.otpWindowMinutes = otpWindowMinutes; }

    public int getGlobalRequests() { return globalRequests; }
    public void setGlobalRequests(int globalRequests) { this.globalRequests = globalRequests; }

    public long getGlobalWindowMinutes() { return globalWindowMinutes; }
    public void setGlobalWindowMinutes(long globalWindowMinutes) { this.globalWindowMinutes = globalWindowMinutes; }

    public int getReadRequests() { return readRequests; }
    public void setReadRequests(int readRequests) { this.readRequests = readRequests; }

    public long getReadWindowMinutes() { return readWindowMinutes; }
    public void setReadWindowMinutes(long readWindowMinutes) { this.readWindowMinutes = readWindowMinutes; }

    public boolean isDistributed() { return distributed; }
    public void setDistributed(boolean distributed) { this.distributed = distributed; }
}
