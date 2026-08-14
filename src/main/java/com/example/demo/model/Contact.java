package com.example.demo.model;

import jakarta.persistence.*;

@Entity
@Table(
        name = "contact",
        uniqueConstraints = {
                @UniqueConstraint(name = "uk_contact_phone", columnNames = "phone"),
                @UniqueConstraint(name = "uk_contact_email", columnNames = "email")
        }
)
public class Contact {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String name;

    @Column(nullable = false, updatable = false)  // unique + not editable
    private String phone;

    @Column(nullable = false) // unique
    private String email;

    @Column(name = "profile_picture")
    private String profilePicture;

//    @JoinColumn(name = "relation_id")      // FK column in contact table
//    private Long relationId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "relation_id")  // FK column
    private Relation relation;  // Object!

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    private User user;


    public Long getRelationId() {
        return relation != null ? relation.getId() : null;
    }

    public void setRelationId(Long relationId) {
        if (relationId != null) {
            this.relation = new Relation();
        } else {
            this.relation = null;
        }
    }

    // Getters & Setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getProfilePicture() { return profilePicture; }
    public void setProfilePicture(String profilePicture) { this.profilePicture = profilePicture; }


//    public Long getRelationId() { return relationId; }
//    public void setRelationId(Long relationId) { this.relationId = relationId; }

    public Relation getRelation() { return relation; }
    public void setRelation(Relation relation) { this.relation = relation; }

    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
}
