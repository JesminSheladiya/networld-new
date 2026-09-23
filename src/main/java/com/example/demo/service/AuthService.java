package com.example.demo.service;

import com.example.demo.dto.*;
import com.example.demo.model.User;
import com.example.demo.repository.ContactRepository;
import com.example.demo.repository.UserRelationRepository;
import com.example.demo.repository.UserRepository;
import com.example.demo.repository.UsernameChangeHistoryRepository;
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
    private final UsernameChangeHistoryRepository history;
    private final UserRelationRepository relations;
    private final ContactRepository contacts;

    // Max username changes in any rolling 7-day window.
    private static final int MAX_USERNAME_CHANGES_PER_WEEK = 2;

    public AuthService(UserRepository users, PasswordEncoder encoder,
                       JwtUtil jwt, CustomUserDetailsService uds,
                       UsernameChangeHistoryRepository history,
                       UserRelationRepository relations,
                       ContactRepository contacts) {
        this.users   = users;
        this.encoder = encoder;
        this.jwt     = jwt;
        this.uds     = uds;
        this.history = history;
        this.relations = relations;
        this.contacts  = contacts;
    }

    public AuthResponse register(RegisterRequest req) {
        String username = validateUsername(req.getUsername());
        if (users.existsByUsernameIgnoreCase(username))
            throw new RuntimeException("Username already taken");
        if (users.existsByEmail(req.getEmail()))
            throw new RuntimeException("Email already exists");
        if (users.existsByPhone(req.getPhone()))
            throw new RuntimeException("Phone already exists");

        User u = new User();
        u.setUsername(username);
        u.setPassword(encoder.encode(validateNewPassword(req.getPassword())));
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

        if (req.getUsername() != null && !req.getUsername().isBlank()) {
            String newUsername = validateUsername(req.getUsername());
            String current = u.getDisplayName() == null ? "" : u.getDisplayName();
            if (!newUsername.equalsIgnoreCase(current)) {
                if (users.existsByUsernameIgnoreCaseAndEmailNot(newUsername, u.getEmail()))
                    throw new RuntimeException("Username already taken");
                java.time.Instant weekAgo =
                        java.time.Instant.now().minus(7, java.time.temporal.ChronoUnit.DAYS);
                if (history.countByUserAndChangedAtAfter(u, weekAgo)
                        >= MAX_USERNAME_CHANGES_PER_WEEK)
                    throw new RuntimeException(
                            "Username can only be changed twice a week. Try again later.");
                u.setUsername(newUsername);
                history.save(new com.example.demo.model.UsernameChangeHistory(
                        u, java.time.Instant.now()));
            }
        }

        if (req.getGender() != null && !req.getGender().isBlank())
            u.setGender(req.getGender());

        if (Boolean.TRUE.equals(req.getClearBirthDate()))
            u.setBirthDate(null);
        else if (req.getBirthDate() != null)
            u.setBirthDate(validateBirthDate(req.getBirthDate()));

        if (req.getBio() != null) {
            String bio = req.getBio().trim();
            if (bio.length() > 200)
                throw new RuntimeException("Bio must be 200 characters or less");
            u.setBio(bio.isEmpty() ? null : bio);
        }

        if (req.getProfilePicture() != null)
            u.setProfilePicture(req.getProfilePicture());

        if (req.getCoverImage() != null)
            u.setCoverImage(req.getCoverImage());

        if (req.getHideCover() != null)
            u.setHideCover(req.getHideCover());
        if (req.getHideConnections() != null)
            u.setHideConnections(req.getHideConnections());
        if (req.getHideContactInfo() != null)
            u.setHideContactInfo(req.getHideContactInfo());

        if (req.getNewPassword() != null && !req.getNewPassword().isBlank()) {
            if (req.getCurrentPassword() == null || req.getCurrentPassword().isBlank())
                throw new RuntimeException("Current password is required");
            if (!encoder.matches(req.getCurrentPassword(), u.getPassword()))
                throw new RuntimeException("Current password is incorrect");
            validateNewPassword(req.getNewPassword());
            if (req.getConfirmPassword() == null || !req.getConfirmPassword().equals(req.getNewPassword()))
                throw new RuntimeException("Passwords do not match");
            u.setPassword(encoder.encode(req.getNewPassword()));
        }

        users.save(u);
        return buildResponse(u);
    }

    // Full account wipe: every relation row touching the user (either side,
    // any status), their address-book contacts and username history, then
    // the user row itself. Other users' address-book snapshots stay untouched.
    @org.springframework.transaction.annotation.Transactional
    public void deleteAccount(String email) {
        User u = users.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found"));
        relations.deleteAllInvolving(u);
        contacts.deleteByUser(u);
        history.deleteByUser(u);
        users.delete(u);
    }

    // Username rules: max 30 chars, lowercase a-z / 0-9 / _ / . only,
    // cannot start or end with a period.
    private static final java.util.regex.Pattern USERNAME_PATTERN =
            java.util.regex.Pattern.compile("^(?!\\.)(?!.*\\.$)[a-z0-9._]{1,30}$");

    static String validateUsername(String username) {
        if (username == null) return null;
        String v = username.trim().toLowerCase();
        if (v.length() > 30)
            throw new RuntimeException("Username must be 30 characters or less");
        if (!USERNAME_PATTERN.matcher(v).matches())
            throw new RuntimeException(
                    "Username: lowercase a-z, 0-9, _ and . only; cannot start or end with a period");
        return v;
    }

    // Available = format-valid and not used by any other user
    // (case-insensitive). The caller's own current username counts as available.
    // Anonymous callers (register page) pass null email — then every match counts.
    public boolean isUsernameAvailable(String email, String username) {
        if (username == null || username.isBlank()) return false;
        String v = username.trim();
        if (!USERNAME_PATTERN.matcher(v).matches()) return false;
        if (email == null) return !users.existsByUsernameIgnoreCase(v);
        return !users.existsByUsernameIgnoreCaseAndEmailNot(v, email);
    }

    // Suggest available usernames derived from a base (full name / typed name).
    // Spaces become separators: "jesmin sheladiya" yields jesmin_sheladiya,
    // jesmin.sheladiya and jesminsheladiya variants.
    public java.util.List<String> suggestUsernames(String email, String base, int limit) {
        int n = Math.max(1, Math.min(limit <= 0 ? 5 : limit, 10));
        String lower = base == null ? "" : base.toLowerCase().trim();
        java.util.List<String> variants = new java.util.ArrayList<>();
        for (String v : new String[]{
                lower.replaceAll("\\s+", "_"),
                lower.replaceAll("\\s+", "."),
                lower.replaceAll("\\s+", "")}) {
            String clean = v.replaceAll("[^a-z0-9._]", "")
                    .replaceAll("^\\.+", "")
                    .replaceAll("\\.+$", "");
            if (clean.isEmpty()) continue;
            if (clean.length() > 24) clean = clean.substring(0, 24);
            if (!variants.contains(clean)) variants.add(clean);
        }
        if (variants.isEmpty()) variants.add("user");
        String own = (email == null) ? "" :
                users.findByEmail(email).map(User::getDisplayName).orElse("");
        java.util.List<String> out = new java.util.ArrayList<>();
        String[] suffixes = {"", "1", "12", "123", "_1", "_12", "1234", "_123", "2026", "_2026"};
        for (String s : suffixes) {
            for (String clean : variants) {
                if (out.size() >= n) break;
                String c = clean + s;
                if (c.length() > 30) c = clean.substring(0, Math.max(1, 30 - s.length())) + s;
                c = c.replaceAll("\\.+$", "");
                if (!USERNAME_PATTERN.matcher(c).matches()) continue;
                if (c.equalsIgnoreCase(own == null ? "" : own)) continue;
                boolean taken = (email == null)
                        ? users.existsByUsernameIgnoreCase(c)
                        : users.existsByUsernameIgnoreCaseAndEmailNot(c, email);
                if (taken) continue;
                if (!out.contains(c)) out.add(c);
            }
            if (out.size() >= n) break;
        }
        return out;
    }

    // How many username changes the user still has in the current
    // rolling 7-day window, and when the next one unlocks (ISO instant).
    public java.util.Map<String, Object> usernameChangeInfo(String email) {
        User u = users.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found"));
        java.time.Instant weekAgo =
                java.time.Instant.now().minus(7, java.time.temporal.ChronoUnit.DAYS);
        long recent = history.countByUserAndChangedAtAfter(u, weekAgo);
        int left = (int) Math.max(0, MAX_USERNAME_CHANGES_PER_WEEK - recent);
        String nextAvailableAt = null;
        if (left <= 0) {
            nextAvailableAt = history
                    .findFirstByUserAndChangedAtAfterOrderByChangedAtAsc(u, weekAgo)
                    .map(h -> h.getChangedAt()
                            .plus(7, java.time.temporal.ChronoUnit.DAYS)
                            .toString())
                    .orElse(null);
        }
        java.util.Map<String, Object> out = new java.util.HashMap<>();
        out.put("changesLeft", left);
        out.put("maxPerWeek", MAX_USERNAME_CHANGES_PER_WEEK);
        out.put("nextAvailableAt", nextAvailableAt);
        return out;
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
                u.getCoverImage(),
                u.getGender(),
                u.getBirthDate(),
                u.getBio(),
                u.getHideCover(),
                u.getHideConnections(),
                u.getHideContactInfo()
        );
    }

    // Registration + change: min 8 chars with at least one letter,
    // one number and one symbol — enforced in both places.
    static String validateNewPassword(String password) {
        if (password == null || password.length() < 8)
            throw new RuntimeException("Password must be at least 8 characters");
        if (!password.matches("^(?=.*[A-Za-z])(?=.*\\d)(?=.*[^A-Za-z\\d]).+$"))
            throw new RuntimeException("Password must contain a letter, a number and a symbol");
        return password;
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