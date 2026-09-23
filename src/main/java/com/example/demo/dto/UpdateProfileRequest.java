package com.example.demo.dto;

public class UpdateProfileRequest {
    private String username;
    private String fullName;
    private String phone;
    private String currentPassword;
    private String newPassword;
    private String confirmPassword;
    private String profilePicture;
    private String coverImage;
    private String gender;
    private java.time.LocalDate birthDate;
    private String bio;
    private Boolean privateAccount;
    private Boolean hideCover;
    private Boolean hideConnections;
    private Boolean hideContactInfo;


    public String getUsername()        { return username; }
    public void setUsername(String v)  { this.username = v; }

    public String getFullName()        { return fullName; }
    public void setFullName(String v)  { this.fullName = v; }

    public String getPhone()           { return phone; }
    public void setPhone(String v)     { this.phone = v; }

    public String getCurrentPassword()       { return currentPassword; }
    public void setCurrentPassword(String v) { this.currentPassword = v; }

    public String getNewPassword()       { return newPassword; }
    public void setNewPassword(String v) { this.newPassword = v; }

    public String getConfirmPassword()       { return confirmPassword; }
    public void setConfirmPassword(String v) { this.confirmPassword = v; }

    public String getProfilePicture()        { return profilePicture; }
    public void   setProfilePicture(String v){ this.profilePicture = v; }

    public String getCoverImage()        { return coverImage; }
    public void   setCoverImage(String v){ this.coverImage = v; }

    public String getGender()       { return gender; }
    public void setGender(String v) { this.gender = v; }

    public java.time.LocalDate getBirthDate()       { return birthDate; }
    public void setBirthDate(java.time.LocalDate v) { this.birthDate = v; }

    public String getBio()       { return bio; }
    public void setBio(String v) { this.bio = v; }

    public Boolean getPrivateAccount()       { return privateAccount; }
    public void setPrivateAccount(Boolean v) { this.privateAccount = v; }

    public Boolean getHideCover()       { return hideCover; }
    public void setHideCover(Boolean v) { this.hideCover = v; }

    public Boolean getHideConnections()       { return hideConnections; }
    public void setHideConnections(Boolean v) { this.hideConnections = v; }

    public Boolean getHideContactInfo()       { return hideContactInfo; }
    public void setHideContactInfo(Boolean v) { this.hideContactInfo = v; }
}