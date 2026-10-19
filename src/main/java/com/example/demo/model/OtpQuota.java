package com.example.demo.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "otp_quotas", uniqueConstraints = @UniqueConstraint(
        name = "uk_otp_quota_email_purpose", columnNames = {"email", "purpose"}))
public class OtpQuota {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 255)
    private String email;

    @Column(nullable = false, length = 20)
    private String purpose;

    @Column(nullable = false)
    private Integer count = 0;

    @Column(name = "window_start", nullable = false)
    private Instant windowStart;

    public Long getId() { return id; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getPurpose() { return purpose; }
    public void setPurpose(String purpose) { this.purpose = purpose; }
    public Integer getCount() { return count; }
    public void setCount(Integer count) { this.count = count; }
    public Instant getWindowStart() { return windowStart; }
    public void setWindowStart(Instant windowStart) { this.windowStart = windowStart; }
}
