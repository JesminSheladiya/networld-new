package com.example.demo.model;

import jakarta.persistence.*;

@Entity
@Table(
        name = "user_relations",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_user_relations_from_to",
                columnNames = {"from_user_id", "to_user_id"}
        )
)
public class UserRelation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "from_user_id", nullable = false)
    private User fromUser;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "to_user_id", nullable = false)
    private User toUser;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "relation_id", nullable = false)
    private Relation relation;

    @Column(nullable = false, length = 20)
    private String status = "PENDING"; // PENDING | ACCEPTED | DECLINED | SUGGESTED

    public UserRelation() {}

    public UserRelation(User fromUser, User toUser, Relation relation, String status) {
        this.fromUser = fromUser;
        this.toUser   = toUser;
        this.relation = relation;
        this.status   = status;
    }

    public Long getId()           { return id; }
    public User getFromUser()     { return fromUser; }
    public void setFromUser(User fromUser) { this.fromUser = fromUser; }
    public User getToUser()       { return toUser; }
    public void setToUser(User toUser) { this.toUser = toUser; }
    public Relation getRelation() { return relation; }
    public void setRelation(Relation relation) { this.relation = relation; }
    public String getStatus()     { return status; }
    public void setStatus(String status) { this.status = status; }
}