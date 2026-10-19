package com.example.demo.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;

public class AuthResponse {

    private String token;
    private String username;
    private String email;
    private String phone;
    private String fullName;
    private Long id;
    private String profilePicture;
    private String coverImage;
    private String gender;
    private java.time.LocalDate birthDate;
    private String bio;
    private String occupation;
    private Boolean hideCover;
    private Boolean hideConnections;
    private Boolean hideContactInfo;
    private String relationFormat;
    private java.time.Instant createdAt;

    public AuthResponse(String token, String username, String email,
                        String phone, String fullName, Long id, String profilePicture,
                        String coverImage,
                        String gender, java.time.LocalDate birthDate, String bio,
                        String occupation,
                        Boolean hideCover,
                        Boolean hideConnections, Boolean hideContactInfo,
                         String relationFormat, java.time.Instant createdAt) {
        this.token    = token;
        this.username = username;
        this.email    = email;
        this.phone    = phone;
        this.fullName = fullName;
        this.id       = id;
        this.profilePicture = profilePicture;
        this.coverImage = coverImage;
        this.gender   = gender;
        this.birthDate = birthDate;
        this.bio      = bio;
        this.occupation = occupation;
        this.hideCover = hideCover;
        this.hideConnections = hideConnections;
        this.hideContactInfo = hideContactInfo;
        this.relationFormat = relationFormat;
        this.createdAt = createdAt;
    }

    // The JWT is delivered only through the HttpOnly auth cookie. It must not
    // be exposed in JSON where browser JavaScript/XSS could read it.
    @JsonIgnore
    public String getToken()    { return token; }
    public String getUsername() { return username; }
    public String getEmail()    { return email; }
    public String getPhone()    { return phone; }
    public String getFullName() { return fullName; }
    public Long   getId()       { return id; }
    public String getProfilePicture() { return profilePicture; }
    public String getCoverImage() { return coverImage; }
    public String getGender()   { return gender; }
    public java.time.LocalDate getBirthDate() { return birthDate; }
    public String getBio() { return bio; }
    public String getOccupation() { return occupation; }
    public Boolean getHideCover() { return hideCover; }
    public Boolean getHideConnections() { return hideConnections; }
    public Boolean getHideContactInfo() { return hideContactInfo; }
    public String getRelationFormat() { return relationFormat; }
    public java.time.Instant getCreatedAt() { return createdAt; }
}
