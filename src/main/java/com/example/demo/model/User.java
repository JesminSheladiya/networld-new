package com.example.demo.model;

import jakarta.persistence.*;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import org.hibernate.annotations.CreationTimestamp;

import java.util.Collection;
import java.util.Collections;

@Entity
@Table(name = "users", uniqueConstraints = {
        @UniqueConstraint(name = "uk_users_email",  columnNames = "email"),
        @UniqueConstraint(name = "uk_users_phone",  columnNames = "phone")
})
public class User implements UserDetails {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String username;

    @Column(nullable = false)
    private String password;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(unique = true)
    private String phone;

    @Column(name = "full_name")
    private String fullName;

    @Column(name = "gender", length = 1)
    private String gender;

    @Column(name = "profile_picture", columnDefinition = "TEXT")
    private String profilePicture;

    @Column(name = "cover_image", columnDefinition = "TEXT")
    private String coverImage;

    @Column(name = "birth_date")
    private java.time.LocalDate birthDate;

    @Column(name = "bio", length = 200)
    private String bio;

    @Column(name = "occupation", length = 60)
    private String occupation;

    // Privacy: granular hides. Nullable for old rows —
    // null counts as false everywhere (see helpers below).
    @Column(name = "hide_cover")
    private Boolean hideCover;

    @Column(name = "hide_connections")
    private Boolean hideConnections;

    @Column(name = "hide_contact_info")
    private Boolean hideContactInfo;

    @Column(nullable = false)
    private String role = "USER";

    // Email OTP verification (Resend). Null-safe for old rows.
    @Column(name = "email_verified", nullable = false)
    private Boolean emailVerified = false;

    @Column(name = "otp_hash", length = 120)
    private String otpHash;

    @Column(name = "otp_expiry")
    private java.time.Instant otpExpiry;

    @Column(name = "otp_attempts", nullable = false)
    private Integer otpAttempts = 0;

    @Column(name = "otp_sent_at")
    private java.time.Instant otpSentAt;

    // Relation display language: 'english' | 'indian'. Null = never chose
    // (legacy rows + fresh registers before the onboarding popup).
    @Column(name = "relation_format", length = 10)
    private String relationFormat;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private java.time.Instant createdAt;

    // Login brute-force protection (tiered lockout). Nullable for old rows —
    // null counts as 0 / not locked everywhere (see AuthService).
    @Column(name = "failed_login_attempts")
    private Integer failedLoginAttempts;

    @Column(name = "lockout_until")
    private java.time.Instant lockoutUntil;

    // Escalation tier: 0 = never long-locked, 1 = served 3h lock, 2 = 24h cycle.
    // Null-safe for old rows (null = 0).
    @Column(name = "lockout_level")
    private Integer lockoutLevel;

    // Used by legacy users whose OTP is stored on the User row.
    @Column(name = "register_otp_quota_count")
    private Integer registerOtpQuotaCount;

    @Column(name = "forgot_otp_quota_count")
    private Integer forgotOtpQuotaCount;

    @Column(name = "delete_otp_quota_count")
    private Integer deleteOtpQuotaCount;

    @Column(name = "register_otp_quota_window_start")
    private java.time.Instant registerOtpQuotaWindowStart;

    @Column(name = "forgot_otp_quota_window_start")
    private java.time.Instant forgotOtpQuotaWindowStart;

    @Column(name = "delete_otp_quota_window_start")
    private java.time.Instant deleteOtpQuotaWindowStart;

    public User() {}

    public Long getId() { return id; }

    @Override
    public String getUsername() { return email; }


    public String getDisplayName() { return username; }
    public void setUsername(String username) { this.username = username; }

    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }

    public String getEmail()    { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getPhone()    { return phone; }
    public void setPhone(String phone) { this.phone = phone; }

    public String getFullName() { return fullName; }
    public void setFullName(String fullName) { this.fullName = fullName; }

    public String getGender() { return gender; }
    public void setGender(String gender) { this.gender = gender; }

    public String getProfilePicture() { return profilePicture; }
    public void setProfilePicture(String profilePicture) { this.profilePicture = profilePicture; }

    public String getCoverImage() { return coverImage; }
    public void setCoverImage(String coverImage) { this.coverImage = coverImage; }

    public java.time.LocalDate getBirthDate() { return birthDate; }
    public void setBirthDate(java.time.LocalDate birthDate) { this.birthDate = birthDate; }

    public String getBio() { return bio; }
    public void setBio(String bio) { this.bio = bio; }

    public String getOccupation() { return occupation; }
    public void setOccupation(String occupation) { this.occupation = occupation; }

    public Boolean getHideCover() { return hideCover; }
    public void setHideCover(Boolean hideCover) { this.hideCover = hideCover; }

    public Boolean getHideConnections() { return hideConnections; }
    public void setHideConnections(Boolean hideConnections) { this.hideConnections = hideConnections; }

    public Boolean getHideContactInfo() { return hideContactInfo; }
    public void setHideContactInfo(Boolean hideContactInfo) { this.hideContactInfo = hideContactInfo; }

    // --- Privacy helpers: avatar/name/username/bio are always public.
    // Hides apply only vs non-connections (connected users + self see all).
    private boolean isSameUser(String email) {
        return email != null && getEmail() != null && getEmail().equalsIgnoreCase(email);
    }

    private boolean privacyActiveFor(String viewerEmail, boolean connected) {
        return !isSameUser(viewerEmail) && !connected;
    }

    public boolean hidesCoverFrom(String viewerEmail, boolean connected) {
        return privacyActiveFor(viewerEmail, connected) && Boolean.TRUE.equals(hideCover);
    }

    public boolean hidesConnectionsFrom(String viewerEmail, boolean connected) {
        return privacyActiveFor(viewerEmail, connected) && Boolean.TRUE.equals(hideConnections);
    }

    public boolean hidesContactInfoFrom(String viewerEmail, boolean connected) {
        return privacyActiveFor(viewerEmail, connected) && Boolean.TRUE.equals(hideContactInfo);
    }

    public String getRole()     { return role; }
    public void setRole(String role) { this.role = role; }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return Collections.singletonList(new SimpleGrantedAuthority("ROLE_" + role));
    }
    @Override public boolean isAccountNonExpired()     { return true; }
    @Override public boolean isAccountNonLocked()      { return true; }
    @Override public boolean isCredentialsNonExpired() { return true; }
    @Override public boolean isEnabled()               { return true; }

    public Boolean getEmailVerified() { return emailVerified; }
    public void setEmailVerified(Boolean emailVerified) { this.emailVerified = emailVerified; }

    public String getOtpHash() { return otpHash; }
    public void setOtpHash(String otpHash) { this.otpHash = otpHash; }

    public java.time.Instant getOtpExpiry() { return otpExpiry; }
    public void setOtpExpiry(java.time.Instant otpExpiry) { this.otpExpiry = otpExpiry; }

    public Integer getOtpAttempts() { return otpAttempts; }
    public void setOtpAttempts(Integer otpAttempts) { this.otpAttempts = otpAttempts; }

    public java.time.Instant getOtpSentAt() { return otpSentAt; }
    public void setOtpSentAt(java.time.Instant otpSentAt) { this.otpSentAt = otpSentAt; }

    public String getRelationFormat() { return relationFormat; }
    public void setRelationFormat(String relationFormat) { this.relationFormat = relationFormat; }
    public java.time.Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(java.time.Instant createdAt) { this.createdAt = createdAt; }

    public Integer getFailedLoginAttempts() { return failedLoginAttempts; }
    public void setFailedLoginAttempts(Integer failedLoginAttempts) { this.failedLoginAttempts = failedLoginAttempts; }

    public java.time.Instant getLockoutUntil() { return lockoutUntil; }
    public void setLockoutUntil(java.time.Instant lockoutUntil) { this.lockoutUntil = lockoutUntil; }

    public Integer getLockoutLevel() { return lockoutLevel; }
    public void setLockoutLevel(Integer lockoutLevel) { this.lockoutLevel = lockoutLevel; }

    public Integer getRegisterOtpQuotaCount() { return registerOtpQuotaCount; }
    public void setRegisterOtpQuotaCount(Integer count) { this.registerOtpQuotaCount = count; }

    public Integer getForgotOtpQuotaCount() { return forgotOtpQuotaCount; }
    public void setForgotOtpQuotaCount(Integer count) { this.forgotOtpQuotaCount = count; }

    public Integer getDeleteOtpQuotaCount() { return deleteOtpQuotaCount; }
    public void setDeleteOtpQuotaCount(Integer count) { this.deleteOtpQuotaCount = count; }

    public java.time.Instant getRegisterOtpQuotaWindowStart() { return registerOtpQuotaWindowStart; }
    public void setRegisterOtpQuotaWindowStart(java.time.Instant value) { this.registerOtpQuotaWindowStart = value; }

    public java.time.Instant getForgotOtpQuotaWindowStart() { return forgotOtpQuotaWindowStart; }
    public void setForgotOtpQuotaWindowStart(java.time.Instant value) { this.forgotOtpQuotaWindowStart = value; }

    public java.time.Instant getDeleteOtpQuotaWindowStart() { return deleteOtpQuotaWindowStart; }
    public void setDeleteOtpQuotaWindowStart(java.time.Instant value) { this.deleteOtpQuotaWindowStart = value; }
}
