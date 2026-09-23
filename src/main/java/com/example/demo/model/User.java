package com.example.demo.model;

import jakarta.persistence.*;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

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

    // Privacy: master switch + granular hides. Nullable for old rows —
    // null counts as false everywhere (see helpers below).
    @Column(name = "is_private")
    private Boolean privateAccount;

    @Column(name = "hide_cover")
    private Boolean hideCover;

    @Column(name = "hide_connections")
    private Boolean hideConnections;

    @Column(name = "hide_contact_info")
    private Boolean hideContactInfo;

    @Column(nullable = false)
    private String role = "USER";

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

    public Boolean getPrivateAccount() { return privateAccount; }
    public void setPrivateAccount(Boolean privateAccount) { this.privateAccount = privateAccount; }

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
        return Boolean.TRUE.equals(privateAccount) && !isSameUser(viewerEmail) && !connected;
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
}