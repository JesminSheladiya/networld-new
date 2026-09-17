package com.example.demo.controller;

import com.example.demo.dto.*;
import com.example.demo.model.User;
import com.example.demo.repository.UserRepository;
import com.example.demo.service.AuthService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService auth;
    private final UserRepository users;
    public AuthController(AuthService auth, UserRepository users) { this.auth = auth; this.users = users; }

    @PostMapping("/register")
    public ResponseEntity<?> register(@Valid @RequestBody RegisterRequest req) {
        return ResponseEntity.ok(auth.register(req));
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@Valid @RequestBody LoginRequest req) {
        return ResponseEntity.ok(auth.login(req));
    }

    @GetMapping("/me")
    public ResponseEntity<?> getProfile(@AuthenticationPrincipal UserDetails userDetails) {
        User u = users.findByEmail(userDetails.getUsername())
                .orElseThrow(() -> new RuntimeException("User not found"));
        return ResponseEntity.ok(auth.buildResponse(u));
    }

    @PutMapping("/me")
    public ResponseEntity<?> updateProfile(
            @AuthenticationPrincipal UserDetails userDetails,
            @RequestBody UpdateProfileRequest req) {
        return ResponseEntity.ok(auth.updateProfile(userDetails.getUsername(), req));
    }

    // Public (register page is anonymous) — email null means every match counts.
    @GetMapping("/username-available")
    public ResponseEntity<?> usernameAvailable(
            @AuthenticationPrincipal UserDetails userDetails,
            @RequestParam("username") String username) {
        String email = userDetails == null ? null : userDetails.getUsername();
        return ResponseEntity.ok(java.util.Map.of("available",
                auth.isUsernameAvailable(email, username)));
    }

    @GetMapping("/username-suggestions")
    public ResponseEntity<?> usernameSuggestions(
            @AuthenticationPrincipal UserDetails userDetails,
            @RequestParam(value = "base", required = false) String base,
            @RequestParam(value = "limit", required = false, defaultValue = "5") int limit) {
        String email = userDetails == null ? null : userDetails.getUsername();
        return ResponseEntity.ok(auth.suggestUsernames(email, base, limit));
    }

    @GetMapping("/username-change-info")
    public ResponseEntity<?> usernameChangeInfo(
            @AuthenticationPrincipal UserDetails userDetails) {
        return ResponseEntity.ok(auth.usernameChangeInfo(userDetails.getUsername()));
    }
}