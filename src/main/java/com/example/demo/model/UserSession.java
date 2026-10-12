package com.example.demo.model;

import jakarta.persistence.*;
import java.time.Instant;

// One row per active login (device). Identified by the SHA-256 of the JWT
// (the raw token is never stored). Deleting a row instantly revokes that
// login — the next API call with its token gets a 401.
@Entity
@Table(name = "user_sessions", indexes = {
        @Index(name = "idx_user_sessions_user", columnList = "user_id")
})
public class UserSession {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "token_hash", nullable = false, unique = true, length = 64)
    private String tokenHash;

    @Column(name = "device_info", length = 255)
    private String deviceInfo;

    @Column(name = "device_name", length = 100)
    private String deviceName;

    @Column(name = "ip_address", length = 64)
    private String ipAddress;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "last_active_at", nullable = false)
    private Instant lastActiveAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    public UserSession() {}

    public Long getId() { return id; }

    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }

    public String getTokenHash() { return tokenHash; }
    public void setTokenHash(String tokenHash) { this.tokenHash = tokenHash; }

    public String getDeviceInfo() { return deviceInfo; }
    public void setDeviceInfo(String deviceInfo) { this.deviceInfo = deviceInfo; }

    public String getDeviceName() { return deviceName; }
    public void setDeviceName(String deviceName) { this.deviceName = deviceName; }

    public String getIpAddress() { return ipAddress; }
    public void setIpAddress(String ipAddress) { this.ipAddress = ipAddress; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Instant getLastActiveAt() { return lastActiveAt; }
    public void setLastActiveAt(Instant lastActiveAt) { this.lastActiveAt = lastActiveAt; }

    public Instant getExpiresAt() { return expiresAt; }
    public void setExpiresAt(Instant expiresAt) { this.expiresAt = expiresAt; }
}
