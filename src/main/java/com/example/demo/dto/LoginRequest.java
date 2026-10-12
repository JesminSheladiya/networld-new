package com.example.demo.dto;

import jakarta.validation.constraints.NotBlank;

public class LoginRequest {
    
    @NotBlank(message = "Email, phone or username is required")
    private String identifier;

    @NotBlank(message = "Password is required")
    private String password;

    // Optional display name for this login's device ("Chrome · Windows"),
    // computed by the client. Never validated — informational only.
    private String deviceName;

    public String getIdentifier() { return identifier; }
    public void setIdentifier(String identifier) { this.identifier = identifier; }

    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }

    public String getDeviceName() { return deviceName; }
    public void setDeviceName(String deviceName) { this.deviceName = deviceName; }
}