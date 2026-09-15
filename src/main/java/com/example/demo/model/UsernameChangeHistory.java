package com.example.demo.model;

import jakarta.persistence.*;
import java.time.Instant;

// One row per username change — used to enforce
// "max 2 username changes per rolling 7 days".
@Entity
@Table(name = "username_change_history")
public class UsernameChangeHistory {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "changed_at", nullable = false)
    private Instant changedAt;

    public UsernameChangeHistory() {}

    public UsernameChangeHistory(User user, Instant changedAt) {
        this.user = user;
        this.changedAt = changedAt;
    }

    public Long getId() { return id; }

    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }

    public Instant getChangedAt() { return changedAt; }
    public void setChangedAt(Instant changedAt) { this.changedAt = changedAt; }
}
