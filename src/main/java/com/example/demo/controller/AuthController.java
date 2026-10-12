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
    public ResponseEntity<?> register(@Valid @RequestBody RegisterRequest req,
                                      jakarta.servlet.http.HttpServletRequest http) {
        return ResponseEntity.ok(auth.register(req, req.getDeviceName(), userAgentOf(http), ipOf(http)));
    }

    @PostMapping("/verify-otp")
    public ResponseEntity<?> verifyOtp(@Valid @RequestBody VerifyOtpRequest req) {
        return ResponseEntity.ok(auth.verifyOtp(req.getEmail(), req.getOtp()));
    }

    @PostMapping("/request-otp")
    public ResponseEntity<?> requestOtp(@RequestBody java.util.Map<String, String> body) {
        return ResponseEntity.ok(auth.requestOtp(body.get("email")));
    }

    // Test hook — active only when OTP_TEST_MODE=true, otherwise returns "Not found".
    @GetMapping("/test-otp")
    public ResponseEntity<?> testOtp(@RequestParam("email") String email) {
        return ResponseEntity.ok(java.util.Map.of("otp", auth.getTestOtp(email)));
    }

    @PostMapping("/resend-otp")
    public ResponseEntity<?> resendOtp(@RequestBody java.util.Map<String, String> body) {
        return ResponseEntity.ok(auth.resendOtp(body.get("email")));
    }

    @PostMapping("/forgot-password/request")
    public ResponseEntity<?> forgotRequest(@RequestBody java.util.Map<String, String> body) {
        return ResponseEntity.ok(auth.forgotRequest(body.get("email")));
    }

    @PostMapping("/forgot-password/reset")
    public ResponseEntity<?> forgotReset(@Valid @RequestBody ForgotResetRequest req) {
        return ResponseEntity.ok(auth.forgotReset(req.getEmail(), req.getOtp(), req.getNewPassword()));
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@Valid @RequestBody LoginRequest req,
                                   jakarta.servlet.http.HttpServletRequest http) {
        return ResponseEntity.ok(auth.login(req, req.getDeviceName(), userAgentOf(http), ipOf(http)));
    }

    // Revoke only the calling device's session (best-effort — always 200).
    @PostMapping("/logout")
    public ResponseEntity<?> logout(@AuthenticationPrincipal UserDetails userDetails,
                                    jakarta.servlet.http.HttpServletRequest http) {
        String email = userDetails == null ? null : userDetails.getUsername();
        auth.logoutSession(email, bearerHash(http));
        return ResponseEntity.ok(java.util.Map.of("message", "Logged out"));
    }

    @GetMapping("/sessions")
    public ResponseEntity<?> sessions(
            @AuthenticationPrincipal UserDetails userDetails,
            jakarta.servlet.http.HttpServletRequest http) {
        return ResponseEntity.ok(auth.listSessions(emailOf(userDetails), bearerHash(http)));
    }

    @DeleteMapping("/sessions/{id}")
    public ResponseEntity<?> revokeSession(
            @AuthenticationPrincipal UserDetails userDetails,
            @PathVariable("id") Long id) {
        auth.revokeSession(emailOf(userDetails), id);
        return ResponseEntity.ok(java.util.Map.of("message", "Session revoked"));
    }

    // Log out everywhere, including this device.
    @DeleteMapping("/sessions")
    public ResponseEntity<?> revokeAllSessions(
            @AuthenticationPrincipal UserDetails userDetails) {
        int n = auth.revokeAllSessions(emailOf(userDetails));
        return ResponseEntity.ok(java.util.Map.of("message", "All sessions revoked", "revoked", n));
    }

    // Authenticated endpoints sit under permitAll /api/auth/**, so a dead
    // token arrives here with no principal instead of a 403 — turn that
    // into a 401 the client handles (wipes local auth, back to login).
    private static String emailOf(UserDetails userDetails) {
        if (userDetails == null)
            throw new org.springframework.security.authentication.BadCredentialsException(
                    "Session expired. Please login again.");
        return userDetails.getUsername();
    }

    private static String bearerHash(jakarta.servlet.http.HttpServletRequest http) {
        String h = http.getHeader("Authorization");
        if (h != null && h.startsWith("Bearer ")) {
            String t = h.substring(7).trim();
            if (!t.isEmpty()) return com.example.demo.util.HashUtil.sha256Hex(t);
        }
        return null;
    }

    private static String deviceOf(jakarta.servlet.http.HttpServletRequest http) {
        String ua = http.getHeader("User-Agent");
        if (ua == null || ua.isBlank()) return "Unknown device";
        return ua.length() > 255 ? ua.substring(0, 255) : ua;
    }

    private static String userAgentOf(jakarta.servlet.http.HttpServletRequest http) {
        String ua = http.getHeader("User-Agent");
        if (ua == null || ua.isBlank()) return null;
        return ua.length() > 255 ? ua.substring(0, 255) : ua;
    }

    private static String ipOf(jakarta.servlet.http.HttpServletRequest http) {
        String fwd = http.getHeader("X-Forwarded-For");
        if (fwd != null && !fwd.isBlank()) return fwd.split(",")[0].trim();
        String ip = http.getRemoteAddr();
        return ip == null ? "Unknown" : ip;
    }

    @GetMapping("/me")
    public ResponseEntity<?> getProfile(@AuthenticationPrincipal UserDetails userDetails) {
        User u = users.findByEmail(emailOf(userDetails))
                .orElseThrow(() -> new RuntimeException("User not found"));
        return ResponseEntity.ok(auth.buildResponse(u));
    }

    @PutMapping("/me")
    public ResponseEntity<?> updateProfile(
            @AuthenticationPrincipal UserDetails userDetails,
            @RequestBody UpdateProfileRequest req) {
        return ResponseEntity.ok(auth.updateProfile(emailOf(userDetails), req));
    }

    @PostMapping("/delete-account/request")
    public ResponseEntity<?> deleteAccountRequest(
            @AuthenticationPrincipal UserDetails userDetails) {
        return ResponseEntity.ok(auth.deleteAccountRequest(emailOf(userDetails)));
    }

    @DeleteMapping("/me")
    public ResponseEntity<?> deleteAccount(
            @AuthenticationPrincipal UserDetails userDetails,
            @RequestBody(required = false) java.util.Map<String, String> body) {
        String otp = body == null ? null : body.get("otp");
        auth.deleteAccount(emailOf(userDetails), otp);
        return ResponseEntity.ok(java.util.Map.of("message", "Account deleted"));
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

    // Public instant checks for register Step-1 — same pattern as username-available.
    @GetMapping("/email-available")
    public ResponseEntity<?> emailAvailable(@RequestParam("email") String email) {
        return ResponseEntity.ok(java.util.Map.of("available",
                auth.isEmailAvailable(email)));
    }

    @GetMapping("/phone-available")
    public ResponseEntity<?> phoneAvailable(@RequestParam("phone") String phone) {
        return ResponseEntity.ok(java.util.Map.of("available",
                auth.isPhoneAvailable(phone)));
    }

    @GetMapping("/username-change-info")
    public ResponseEntity<?> usernameChangeInfo(
            @AuthenticationPrincipal UserDetails userDetails) {
        return ResponseEntity.ok(auth.usernameChangeInfo(emailOf(userDetails)));
    }
}