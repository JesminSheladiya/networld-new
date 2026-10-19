package com.example.demo.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "email_otp_verifications")
public class EmailOtpVerification {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(name = "otp_hash", length = 120)
    private String otpHash;

    @Column(name = "otp_expiry")
    private Instant otpExpiry;

    @Column(name = "otp_attempts", nullable = false)
    private Integer otpAttempts = 0;

    @Column(name = "otp_sent_at")
    private Instant otpSentAt;

    @Column(nullable = false)
    private Boolean verified = false;

    @Column(name = "verified_at")
    private Instant verifiedAt;

    // Separate 24-hour quotas per OTP purpose. Register, forgot-password and
    // delete-account each get their own allowance.
    @Column(name = "register_otp_quota_count")
    private Integer registerOtpQuotaCount;

    @Column(name = "forgot_otp_quota_count")
    private Integer forgotOtpQuotaCount;

    @Column(name = "delete_otp_quota_count")
    private Integer deleteOtpQuotaCount;

    @Column(name = "register_otp_quota_window_start")
    private Instant registerOtpQuotaWindowStart;

    @Column(name = "forgot_otp_quota_window_start")
    private Instant forgotOtpQuotaWindowStart;

    @Column(name = "delete_otp_quota_window_start")
    private Instant deleteOtpQuotaWindowStart;

    public Long getId() { return id; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getOtpHash() { return otpHash; }
    public void setOtpHash(String otpHash) { this.otpHash = otpHash; }

    public Instant getOtpExpiry() { return otpExpiry; }
    public void setOtpExpiry(Instant otpExpiry) { this.otpExpiry = otpExpiry; }

    public Integer getOtpAttempts() { return otpAttempts; }
    public void setOtpAttempts(Integer otpAttempts) { this.otpAttempts = otpAttempts; }

    public Instant getOtpSentAt() { return otpSentAt; }
    public void setOtpSentAt(Instant otpSentAt) { this.otpSentAt = otpSentAt; }

    public Boolean getVerified() { return verified; }
    public void setVerified(Boolean verified) { this.verified = verified; }

    public Instant getVerifiedAt() { return verifiedAt; }
    public void setVerifiedAt(Instant verifiedAt) { this.verifiedAt = verifiedAt; }

    public Integer getRegisterOtpQuotaCount() { return registerOtpQuotaCount; }
    public void setRegisterOtpQuotaCount(Integer count) { this.registerOtpQuotaCount = count; }

    public Integer getForgotOtpQuotaCount() { return forgotOtpQuotaCount; }
    public void setForgotOtpQuotaCount(Integer count) { this.forgotOtpQuotaCount = count; }

    public Integer getDeleteOtpQuotaCount() { return deleteOtpQuotaCount; }
    public void setDeleteOtpQuotaCount(Integer count) { this.deleteOtpQuotaCount = count; }

    public Instant getRegisterOtpQuotaWindowStart() { return registerOtpQuotaWindowStart; }
    public void setRegisterOtpQuotaWindowStart(Instant value) { this.registerOtpQuotaWindowStart = value; }

    public Instant getForgotOtpQuotaWindowStart() { return forgotOtpQuotaWindowStart; }
    public void setForgotOtpQuotaWindowStart(Instant value) { this.forgotOtpQuotaWindowStart = value; }

    public Instant getDeleteOtpQuotaWindowStart() { return deleteOtpQuotaWindowStart; }
    public void setDeleteOtpQuotaWindowStart(Instant value) { this.deleteOtpQuotaWindowStart = value; }
}
