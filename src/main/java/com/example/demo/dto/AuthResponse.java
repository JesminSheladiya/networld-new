package com.example.demo.dto;

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
    private Boolean privateAccount;
    private Boolean hideCover;
    private Boolean hideConnections;
    private Boolean hideContactInfo;

    public AuthResponse(String token, String username, String email,
                        String phone, String fullName, Long id, String profilePicture,
                        String coverImage,
                        String gender, java.time.LocalDate birthDate, String bio,
                        Boolean privateAccount, Boolean hideCover,
                        Boolean hideConnections, Boolean hideContactInfo) {
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
        this.privateAccount = privateAccount;
        this.hideCover = hideCover;
        this.hideConnections = hideConnections;
        this.hideContactInfo = hideContactInfo;
    }

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
    public Boolean getPrivateAccount() { return privateAccount; }
    public Boolean getHideCover() { return hideCover; }
    public Boolean getHideConnections() { return hideConnections; }
    public Boolean getHideContactInfo() { return hideContactInfo; }
}