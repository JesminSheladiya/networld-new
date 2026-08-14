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

        if (req.getProfilePicture() != null)
            u.setProfilePicture(req.getProfilePicture());

        if (req.getNewPassword() != null && !req.getNewPassword().isBlank()) {
            if (!encoder.matches(req.getCurrentPassword(), u.getPassword()))
                throw new RuntimeException("Current password is incorrect");
            u.setPassword(encoder.encode(req.getNewPassword()));
        }

        users.save(u);
        return buildResponse(u);
    }

    private AuthResponse buildResponse(User u) {
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
                u.getGender()
        );
    }
}