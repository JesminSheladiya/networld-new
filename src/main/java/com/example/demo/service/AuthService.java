package com.example.demo.service;

import com.example.demo.dto.*;
import com.example.demo.model.User;
import com.example.demo.repository.UserRepository;
import com.example.demo.security.JwtUtil;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class AuthService {

    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final JwtUtil jwt;
    private final CustomUserDetailsService uds;

    public AuthService(UserRepository users, PasswordEncoder encoder,
                       JwtUtil jwt, CustomUserDetailsService uds) {
        this.users   = users;
        this.encoder = encoder;
        this.jwt     = jwt;
        this.uds     = uds;
    }

    public AuthResponse register(RegisterRequest req) {
//        if (users.existsByUsername(req.getUsername()))
//            throw new RuntimeException("Username already exists");
        if (users.existsByEmail(req.getEmail()))
            throw new RuntimeException("Email already exists");
        if (users.existsByPhone(req.getPhone()))
            throw new RuntimeException("Phone already exists");

        User u = new User();
        u.setUsername(req.getUsername());
        u.setPassword(encoder.encode(req.getPassword()));
        u.setEmail(req.getEmail());
        u.setPhone(req.getPhone());
        u.setFullName(req.getFullName());
        u.setGender(req.getGender());
        u.setBirthDate(validateBirthDate(req.getBirthDate()));
        users.save(u);

        return buildResponse(u);
    }

    public AuthResponse login(LoginRequest req) {
        User u = users.findByIdentifier(req.getIdentifier())
                .orElseThrow(() -> new BadCredentialsException("User not found"));

        if (!encoder.matches(req.getPassword(), u.getPassword()))
            throw new BadCredentialsException("Invalid password");

        return buildResponse(u);
    }

    public AuthResponse updateProfile(String email, UpdateProfileRequest req) {
        User u = users.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found"));

        if (req.getPhone() != null && !req.getPhone().isBlank()
                && !req.getPhone().equals(u.getPhone())) {
            if (users.existsByPhone(req.getPhone()))
                throw new RuntimeException("Phone already in use");
            u.setPhone(req.getPhone());
        }

        if (req.getFullName() != null && !req.getFullName().isBlank())
            u.setFullName(req.getFullName());

        if (req.getGender() != null && !req.getGender().isBlank())
            u.setGender(req.getGender());

        if (req.getBirthDate() != null)
            u.setBirthDate(validateBirthDate(req.getBirthDate()));

        if (req.getBio() != null) {
            String bio = req.getBio().trim();
            if (bio.length() > 500)
                throw new RuntimeException("Bio must be 500 characters or less");
            u.setBio(bio.isEmpty() ? null : bio);
        }

        if (req.getProfilePicture() != null)
            u.setProfilePicture(req.getProfilePicture());

        if (req.getNewPassword() != null && !req.getNewPassword().isBlank()) {
            if (req.getCurrentPassword() == null || req.getCurrentPassword().isBlank())
                throw new RuntimeException("Current password is required");
            if (!encoder.matches(req.getCurrentPassword(), u.getPassword()))
                throw new RuntimeException("Current password is incorrect");
            if (req.getNewPassword().length() < 8)
                throw new RuntimeException("New password must be at least 8 characters");
            if (req.getConfirmPassword() == null || !req.getConfirmPassword().equals(req.getNewPassword()))
                throw new RuntimeException("Passwords do not match");
            u.setPassword(encoder.encode(req.getNewPassword()));
        }

        users.save(u);
        return buildResponse(u);
    }

    public AuthResponse buildResponse(User u) {
        UserDetails d = uds.loadUserByUsername(u.getEmail());
        String token  = jwt.generateToken(d);
        return new AuthResponse(
                token,
                u.getDisplayName(),
                u.getEmail(),
                u.getPhone(),
                u.getFullName(),
                u.getId(),
                u.getProfilePicture(),
                u.getGender(),
                u.getBirthDate(),
                u.getBio()
        );
    }

    // Shared birth-date validation (register + profile update): optional,
    // but when provided it must be a past date within a sane human range.
    static java.time.LocalDate validateBirthDate(java.time.LocalDate birthDate) {
        if (birthDate == null) return null;
        java.time.LocalDate today = java.time.LocalDate.now();
        if (!birthDate.isBefore(today.plusDays(1)))
            throw new RuntimeException("Birth date must be in the past");
        if (birthDate.isBefore(today.minusYears(150)))
            throw new RuntimeException("Birth date is too far in the past");
        return birthDate;
    }
}