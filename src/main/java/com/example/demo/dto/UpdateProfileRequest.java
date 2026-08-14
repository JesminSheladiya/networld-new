package com.example.demo.dto;

public class UpdateProfileRequest {
    private String fullName;
    private String phone;
    private String currentPassword;
    private String newPassword;
    private String profilePicture;
    private String gender;


    public String getFullName()        { return fullName; }
    public void setFullName(String v)  { this.fullName = v; }

    public String getPhone()           { return phone; }
    public void setPhone(String v)     { this.phone = v; }

    public String getCurrentPassword()       { return currentPassword; }
    public void setCurrentPassword(String v) { this.currentPassword = v; }

    public String getNewPassword()       { return newPassword; }
    public void setNewPassword(String v) { this.newPassword = v; }

    public String getProfilePicture()        { return profilePicture; }
    public void   setProfilePicture(String v){ this.profilePicture = v; }

    public String getGender()       { return gender; }
    public void setGender(String v) { this.gender = v; }
}