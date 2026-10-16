package com.example.demo.service;

import com.example.demo.dto.*;
import com.example.demo.exception.AccountLockedException;
import com.example.demo.model.EmailOtpVerification;
import com.example.demo.model.User;
import com.example.demo.model.UserSession;
import com.example.demo.repository.ContactRepository;
import com.example.demo.repository.EmailOtpRepository;
import com.example.demo.repository.UserRelationRepository;
import com.example.demo.repository.UserRepository;
import com.example.demo.repository.UserSessionRepository;
import com.example.demo.repository.UsernameChangeHistoryRepository;
import com.example.demo.security.JwtUtil;
import com.example.demo.util.HashUtil;
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
    private final OtpMailService mailer;
    private final EmailOtpRepository pendingOtps;
    private final UserSessionRepository sessions;
    private final boolean otpTestMode;
    // Test-hook storage (active only when OTP_TEST_MODE=true): email -> plain OTP.
    // Always empty in production — plain OTPs are never persisted.
    private final java.util.concurrent.ConcurrentHashMap<String, String> testOtpCodes =
            new java.util.concurrent.ConcurrentHashMap<>();

    // OTP: 6-digit, 5-min expiry, max 5 wrong tries, 60-sec resend cooldown.
    // Verified email stays valid for registration for 30 minutes.
    private static final int OTP_EXPIRY_MINUTES = 5;
    private static final int OTP_MAX_ATTEMPTS = 5;
    private static final long RESEND_COOLDOWN_SECONDS = 60;
    private static final long VERIFIED_VALID_MINUTES = 30;

    // Tiered login lockout: maxAttempts fails -> firstLockMinutes lock,
    // then extraAttempts more tries with remaining-count messages,
    // then extendedLockHours lock. Success resets everything.
    private final int loginMaxAttempts;
    private final long loginFirstLockMinutes;
    private final int loginExtraAttempts;
    private final long loginExtendedLockHours;
    private final long loginRepeatLockHours;

    // Max username changes in any rolling 7-day window.
    private static final int MAX_USERNAME_CHANGES_PER_WEEK = 2;

    public AuthService(UserRepository users, PasswordEncoder encoder,
                       JwtUtil jwt, CustomUserDetailsService uds,
                       UsernameChangeHistoryRepository history,
                       UserRelationRepository relations,
                       ContactRepository contacts,
                       OtpMailService mailer,
                       EmailOtpRepository pendingOtps,
                       UserSessionRepository sessions,
                       @org.springframework.beans.factory.annotation.Value("${app.otp.test-mode:false}") boolean otpTestMode,
                       @org.springframework.beans.factory.annotation.Value("${app.disposable-list.url:https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/master/disposable_email_blocklist.conf}") String disposableListUrl,
                        @org.springframework.beans.factory.annotation.Value("${app.security.login-max-attempts:5}") int loginMaxAttempts,
                        @org.springframework.beans.factory.annotation.Value("${app.security.login-first-lock-minutes:1}") long loginFirstLockMinutes,
                        @org.springframework.beans.factory.annotation.Value("${app.security.login-extra-attempts:3}") int loginExtraAttempts,
                        @org.springframework.beans.factory.annotation.Value("${app.security.login-extended-lock-hours:3}") long loginExtendedLockHours,
                        @org.springframework.beans.factory.annotation.Value("${app.security.login-repeat-lock-hours:24}") long loginRepeatLockHours) {
        this.users   = users;
        this.encoder = encoder;
        this.jwt     = jwt;
        this.uds     = uds;
        this.history = history;
        this.relations = relations;
        this.contacts  = contacts;
        this.mailer  = mailer;
        this.pendingOtps = pendingOtps;
        this.sessions = sessions;
        this.otpTestMode = otpTestMode;
        this.loginMaxAttempts = loginMaxAttempts;
        this.loginFirstLockMinutes = loginFirstLockMinutes;
        this.loginExtraAttempts = loginExtraAttempts;
        this.loginExtendedLockHours = loginExtendedLockHours;
        this.loginRepeatLockHours = loginRepeatLockHours;
        if (otpTestMode) {
            System.out.println("WARN: OTP_TEST_MODE=true — /api/auth/test-otp enabled. NEVER use in production.");
        }
        System.out.println("Disposable-domain list loaded: " + DISPOSABLE_DOMAINS.size() + " domains.");
        refreshDisposableListAsync(disposableListUrl);
    }

    private static final java.util.regex.Pattern EMAIL_PATTERN =
            java.util.regex.Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");

    // Disposable / temporary mail providers — loaded from the bundled
    // disposable-domains.txt (seeded from the community-maintained
    // disposable-email-domains list) and refreshed from its upstream URL
    // on startup, so newly rotated temp-mail domains get picked up.
    // Subdomains count too (e.g. xyz.mailinator.com).
    private static final java.util.Set<String> DISPOSABLE_DOMAINS =
            java.util.Collections.synchronizedSet(new java.util.HashSet<>());

    // Deliverability cache: domain -> has MX (or A fallback) record.
    private static final java.util.concurrent.ConcurrentHashMap<String, Boolean> MX_CACHE =
            new java.util.concurrent.ConcurrentHashMap<>();

    static {
        try (java.io.InputStream in =
                     AuthService.class.getResourceAsStream("/disposable-domains.txt")) {
            if (in != null) loadDomainLines(
                    new java.io.InputStreamReader(in, java.nio.charset.StandardCharsets.UTF_8));
        } catch (Exception ignored) {
            // Fall through to the hardcoded fallback below.
        }
        if (DISPOSABLE_DOMAINS.isEmpty()) {
            DISPOSABLE_DOMAINS.addAll(java.util.Set.of(
                    "mailinator.com", "yopmail.com", "tempmail.com", "temp-mail.org",
                    "10minutemail.com", "guerrillamail.com", "trashmail.com",
                    "hudzer.com", "flakeian.com"));
        }
    }

    private static void loadDomainLines(java.io.Reader r) throws java.io.IOException {
        try (java.io.BufferedReader br = new java.io.BufferedReader(r)) {
            String line;
            while ((line = br.readLine()) != null) {
                line = line.trim().toLowerCase();
                if (!line.isEmpty() && !line.startsWith("#")) DISPOSABLE_DOMAINS.add(line);
            }
        }
    }

    // Refresh the list from upstream in the background on startup.
    // Offline / slow network just keeps the bundled list — never blocks boot.
    private void refreshDisposableListAsync(String url) {
        if (url == null || url.isBlank()) return;
        java.util.concurrent.CompletableFuture.runAsync(() -> {
            try {
                java.net.HttpURLConnection c = (java.net.HttpURLConnection)
                        new java.net.URL(url).openConnection();
                c.setConnectTimeout(5000);
                c.setReadTimeout(15000);
                try (java.io.InputStream in = c.getInputStream()) {
                    int before = DISPOSABLE_DOMAINS.size();
                    loadDomainLines(new java.io.InputStreamReader(
                            in, java.nio.charset.StandardCharsets.UTF_8));
                    System.out.println("Disposable-domain list refreshed: "
                            + before + " -> " + DISPOSABLE_DOMAINS.size());
                }
            } catch (Exception e) {
                System.out.println("Disposable-list refresh skipped (using bundled list): "
                        + e.getMessage());
            }
        });
    }

    static boolean isDisposableEmail(String normalizedEmail) {
        int at = normalizedEmail.lastIndexOf('@');
        if (at < 0) return false;
        String domain = normalizedEmail.substring(at + 1).toLowerCase();
        for (String d : DISPOSABLE_DOMAINS) {
            if (domain.equals(d) || domain.endsWith("." + d)) return true;
        }
        return false;
    }

    static String normalizeEmail(String email) {
        if (email == null) throw new RuntimeException("Email is required");
        String v = email.trim().toLowerCase();
        if (!EMAIL_PATTERN.matcher(v).matches())
            throw new RuntimeException("Please enter a valid email");
        if (isDisposableEmail(v))
            throw new RuntimeException("Temporary email addresses are not allowed. Please use a permanent email.");
        String domain = v.substring(v.lastIndexOf('@') + 1);
        if (!domainAcceptsMail(domain))
            throw new RuntimeException("This email domain does not accept mail. Please check the address.");
        return v;
    }

    // True when the domain has an MX record (or an A record fallback per
    // RFC 5321) — i.e. mail to it is at least routable. Results are cached
    // per process. Random gibberish domains fail here even if they are not
    // on any disposable list.
    static boolean domainAcceptsMail(String domain) {
        return MX_CACHE.computeIfAbsent(domain, d -> {
            try {
                java.util.Hashtable<String, String> env = new java.util.Hashtable<>();
                env.put("java.naming.factory.initial", "com.sun.jndi.dns.DnsContextFactory");
                env.put("com.sun.jndi.dns.timeout.initial", "2000");
                env.put("com.sun.jndi.dns.timeout.retries", "1");
                javax.naming.directory.DirContext ctx =
                        new javax.naming.directory.InitialDirContext(env);
                try {
                    javax.naming.directory.Attributes mx =
                            ctx.getAttributes(d, new String[]{"MX"});
                    if (mx.get("MX") != null) return true;
                    javax.naming.directory.Attributes a =
                            ctx.getAttributes(d, new String[]{"A"});
                    return a.get("A") != null;
                } finally {
                    ctx.close();
                }
            } catch (Exception e) {
                return false;
            }
        });
    }

    // Step 1 of registration: email-only OTP. No account is created here.
    public java.util.Map<String, Object> requestOtp(String rawEmail) {
        String email = normalizeEmail(rawEmail);
        if (users.existsByEmail(email)) {
            // New-flow account waiting for verification (created via old endpoint)?
            // Those users verify through /verify-otp fallback instead.
            User existing = users.findByEmail(email).orElse(null);
            if (existing != null && !Boolean.TRUE.equals(existing.getEmailVerified())
                    && existing.getOtpHash() != null) {
                throw new RuntimeException("OTP already sent. Please verify the OTP.");
            }
            throw new RuntimeException("Email already exists. Please login.");
        }
        EmailOtpVerification p = pendingOtps.findByEmail(email).orElseGet(() -> {
            EmailOtpVerification n = new EmailOtpVerification();
            n.setEmail(email);
            return n;
        });
        if (p.getOtpSentAt() != null && java.time.Instant.now().isBefore(
                p.getOtpSentAt().plusSeconds(RESEND_COOLDOWN_SECONDS))) {
            throw new RuntimeException("Please wait a minute before resending OTP.");
        }
        String otp = newOtp(p);
        pendingOtps.save(p);
        if (otpTestMode) testOtpCodes.put(email, otp);
        // Synchronous: report real delivery status so the client only shows
        // success after Resend accepted the mail. On failure clear otpSentAt
        // so an immediate retry is not blocked by the resend cooldown.
        boolean delivered = mailer.sendOtp(email, otp, null);
        if (!delivered) {
            p.setOtpSentAt(null);
            pendingOtps.save(p);
        }
        return java.util.Map.of("message", "OTP sent to your email.", "email", email,
                "delivered", delivered);
    }

    // Verify an OTP code. The presented code is ALWAYS checked against the
    // live hash — a previously verified row never confirms a different code,
    // and a missing OTP never verifies (no verified-user shortcut).
    public java.util.Map<String, Object> verifyOtp(String rawEmail, String otp) {
        String email = normalizeEmail(rawEmail);
        EmailOtpVerification p = pendingOtps.findByEmail(email).orElse(null);
        if (p != null) {
            checkOtp(p.getOtpHash(), p.getOtpExpiry(), p.getOtpAttempts(), otp);
            if (!encoder.matches(otp, p.getOtpHash())) {
                p.setOtpAttempts((p.getOtpAttempts() == null ? 0 : p.getOtpAttempts()) + 1);
                pendingOtps.save(p);
                throw new RuntimeException("Invalid OTP.");
            }
            // Hash is deliberately retained (not nulled): the terminal action
            // (register / reset / delete) re-checks the same code, so a stale
            // verified row can never authorize a code nobody typed.
            p.setVerified(true);
            p.setVerifiedAt(java.time.Instant.now());
            p.setOtpAttempts(0);
            pendingOtps.save(p);
            if (otpTestMode) testOtpCodes.remove(email);
            return java.util.Map.of("verified", true, "email", email);
        }
        // Fallback: legacy User row with an embedded not-yet-consumed OTP.
        // No hash anywhere means no pending OTP — never confirm.
        User u = users.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("No OTP request found. Please send OTP first."));
        if (u.getOtpHash() == null)
            throw new RuntimeException("No OTP request found. Please send OTP first.");
        checkOtp(u.getOtpHash(), u.getOtpExpiry(), u.getOtpAttempts(), otp);
        if (!encoder.matches(otp, u.getOtpHash())) {
            u.setOtpAttempts((u.getOtpAttempts() == null ? 0 : u.getOtpAttempts()) + 1);
            users.save(u);
            throw new RuntimeException("Invalid OTP.");
        }
        u.setEmailVerified(true);
        u.setOtpHash(null);
        u.setOtpExpiry(null);
        u.setOtpAttempts(0);
        users.save(u);
        return java.util.Map.of("verified", true, "email", email);
    }

    private void checkOtp(String hash, java.time.Instant expiry, Integer attempts, String otp) {
        if (otp == null || !otp.matches("^[0-9]{6}$"))
            throw new RuntimeException("OTP must be 6 digits.");
        if (hash == null || expiry == null || java.time.Instant.now().isAfter(expiry)) {
            throw new RuntimeException("OTP expired. Please resend OTP.");
        }
        if ((attempts == null ? 0 : attempts) >= OTP_MAX_ATTEMPTS) {
            throw new RuntimeException("Too many wrong attempts. Please resend OTP.");
        }
    }

    private String newOtp(EmailOtpVerification p) {
        String otp = String.format("%06d", new java.security.SecureRandom().nextInt(1_000_000));
        p.setOtpHash(encoder.encode(otp));
        p.setOtpExpiry(java.time.Instant.now().plus(OTP_EXPIRY_MINUTES, java.time.temporal.ChronoUnit.MINUTES));
        p.setOtpAttempts(0);
        p.setOtpSentAt(java.time.Instant.now());
        p.setVerified(false);
        p.setVerifiedAt(null);
        return otp;
    }

    // Step 2 of registration: requires a verified Step-1 OTP. Returns token.
    public AuthResponse register(RegisterRequest req, String deviceName, String userAgent, String ipAddress) {
        String email = normalizeEmail(req.getEmail());
        EmailOtpVerification p = pendingOtps.findByEmail(email).orElse(null);
        boolean verified = p != null && Boolean.TRUE.equals(p.getVerified())
                && p.getVerifiedAt() != null && java.time.Instant.now().isBefore(
                        p.getVerifiedAt().plus(VERIFIED_VALID_MINUTES, java.time.temporal.ChronoUnit.MINUTES));
        if (!verified)
            throw new RuntimeException("Please verify email OTP first.");

        String username = validateUsername(req.getUsername());
        String phone = validatePhone(req.getPhone());
        if (users.existsByUsernameIgnoreCase(username))
            throw new RuntimeException("Username already taken");
        if (users.existsByPhone(phone))
            throw new RuntimeException("Phone already exists");
        if (users.existsByEmail(email))
            throw new RuntimeException("Email already exists");

        User u = new User();
        u.setUsername(username);
        u.setPassword(encoder.encode(validateNewPassword(req.getPassword())));
        u.setEmail(email);
        u.setPhone(phone);
        u.setFullName(normalizeFullName(req.getFullName()));
        u.setOccupation(validateOccupation(req.getOccupation()));
        u.setGender(req.getGender());
        u.setBirthDate(validateBirthDate(req.getBirthDate()));
        u.setRelationFormat(normalizeRelationFormat(req.getRelationFormat()));
        u.setEmailVerified(true);
        users.save(u);
        pendingOtps.deleteByEmail(email);
        if (otpTestMode) testOtpCodes.remove(email);

        return buildResponseWithSession(u, req.getDeviceName(), userAgent, ipAddress);
    }

    public java.util.Map<String, Object> resendOtp(String rawEmail) {
        String email = normalizeEmail(rawEmail);
        EmailOtpVerification p = pendingOtps.findByEmail(email).orElse(null);
        if (p == null) {
            // Fallback: new-flow User row waiting for verification.
            User u = users.findByEmail(email).orElse(null);
            if (u != null && !Boolean.TRUE.equals(u.getEmailVerified()) && u.getOtpHash() != null) {
                if (u.getOtpSentAt() != null && java.time.Instant.now().isBefore(
                        u.getOtpSentAt().plusSeconds(RESEND_COOLDOWN_SECONDS))) {
                    throw new RuntimeException("Please wait a minute before resending OTP.");
                }
                String otp = String.format("%06d", new java.security.SecureRandom().nextInt(1_000_000));
                u.setOtpHash(encoder.encode(otp));
                u.setOtpExpiry(java.time.Instant.now().plus(OTP_EXPIRY_MINUTES, java.time.temporal.ChronoUnit.MINUTES));
                u.setOtpAttempts(0);
                u.setOtpSentAt(java.time.Instant.now());
                users.save(u);
                boolean delivered = mailer.sendOtp(email, otp, u.getFullName());
                if (!delivered) {
                    u.setOtpSentAt(null);
                    users.save(u);
                }
                return java.util.Map.of("message", "OTP resent to your email.", "email", email,
                        "delivered", delivered);
            }
            throw new RuntimeException("No OTP request found. Please send OTP first.");
        }
        if (Boolean.TRUE.equals(p.getVerified())) {
            return java.util.Map.of("message", "Email already verified.", "email", email);
        }
        if (p.getOtpSentAt() != null && java.time.Instant.now().isBefore(
                p.getOtpSentAt().plusSeconds(RESEND_COOLDOWN_SECONDS))) {
            throw new RuntimeException("Please wait a minute before resending OTP.");
        }
        String otp = newOtp(p);
        pendingOtps.save(p);
        if (otpTestMode) testOtpCodes.put(email, otp);
        boolean delivered = mailer.sendOtp(email, otp, null);
        if (!delivered) {
            p.setOtpSentAt(null);
            pendingOtps.save(p);
        }
        return java.util.Map.of("message", "OTP resent to your email.", "email", email,
                "delivered", delivered);
    }

    // Test hook — works only when OTP_TEST_MODE=true, otherwise behaves as not found.
    public String getTestOtp(String rawEmail) {
        if (!otpTestMode) throw new RuntimeException("Not found");
        String email = normalizeEmail(rawEmail);
        String code = testOtpCodes.get(email);
        if (code == null) throw new RuntimeException("No OTP for this email");
        return code;
    }

    // ── Forgot password ──────────────────────────────────────────────
    // Step 1: send a reset OTP to an existing account. Reuses the pending
    // OTP table so the existing /verify-otp endpoint can confirm it.
    public java.util.Map<String, Object> forgotRequest(String rawEmail) {
        String email = normalizeEmail(rawEmail);
        User u = users.findByEmail(email).orElse(null);
        if (u == null)
            throw new RuntimeException("No account found with this email.");
        EmailOtpVerification p = pendingOtps.findByEmail(email).orElseGet(() -> {
            EmailOtpVerification n = new EmailOtpVerification();
            n.setEmail(email);
            return n;
        });
        if (p.getOtpSentAt() != null && java.time.Instant.now().isBefore(
                p.getOtpSentAt().plusSeconds(RESEND_COOLDOWN_SECONDS))) {
            throw new RuntimeException("Please wait a minute before resending OTP.");
        }
        String otp = newOtp(p);
        pendingOtps.save(p);
        if (otpTestMode) testOtpCodes.put(email, otp);
        boolean delivered = mailer.sendOtp(email, otp, u.getFullName(),
                OtpMailService.OtpPurpose.PASSWORD_RESET);
        if (!delivered) {
            p.setOtpSentAt(null);
            pendingOtps.save(p);
        }
        return java.util.Map.of("message", "OTP sent to your email.", "email", email,
                "delivered", delivered);
    }

    // Step 2: verify OTP + set a new password. The verify step must be done
    // AND the same code presented again — a stale verified row never
    // authorizes a code nobody typed.
    public java.util.Map<String, Object> forgotReset(String rawEmail, String otp, String newPassword) {
        String email = normalizeEmail(rawEmail);
        User u = users.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("No account found with this email."));
        EmailOtpVerification p = pendingOtps.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("No OTP request found. Please send OTP first."));
        boolean fresh = Boolean.TRUE.equals(p.getVerified())
                && p.getVerifiedAt() != null && java.time.Instant.now().isBefore(
                        p.getVerifiedAt().plus(VERIFIED_VALID_MINUTES, java.time.temporal.ChronoUnit.MINUTES));
        if (!fresh)
            throw new RuntimeException("Please verify email OTP first.");
        checkOtp(p.getOtpHash(), p.getOtpExpiry(), p.getOtpAttempts(), otp);
        if (!encoder.matches(otp, p.getOtpHash())) {
            p.setOtpAttempts((p.getOtpAttempts() == null ? 0 : p.getOtpAttempts()) + 1);
            pendingOtps.save(p);
            throw new RuntimeException("Invalid OTP.");
        }
        u.setPassword(encoder.encode(validateNewPassword(newPassword)));
        // Invalidate any login OTP state on the user row (legacy fallback).
        u.setOtpHash(null);
        u.setOtpExpiry(null);
        u.setOtpAttempts(0);
        users.save(u);
        try { pendingOtps.deleteByEmail(email); } catch (Exception ignored) {}
        if (otpTestMode) testOtpCodes.remove(email);
        return java.util.Map.of("message", "Password reset successful. Please login.");
    }

    public AuthResponse login(LoginRequest req, String deviceName, String userAgent, String ipAddress) {
        User u = users.findByIdentifier(req.getIdentifier())
                .orElseThrow(() -> new BadCredentialsException("User not found"));

        java.time.Instant now = java.time.Instant.now();
        int hardLimit = loginMaxAttempts + loginExtraAttempts;

        // Active lockout — even the right password stays blocked until expiry.
        if (u.getLockoutUntil() != null && now.isBefore(u.getLockoutUntil())) {
            long secs = Math.max(1, u.getLockoutUntil().getEpochSecond() - now.getEpochSecond());
            throw new AccountLockedException(
                    "Account temporarily locked. Try again in " + formatLockDuration(secs) + ".", secs);
        }

        // A finished hard lock grants a fresh grace window (extraAttempts
        // tries again) instead of re-locking on the next single mistake.
        // The 1-minute lock needs no reset: attempts stay at maxAttempts,
        // which is exactly where the +extraAttempts window starts.
        int priorAttempts = u.getFailedLoginAttempts() == null ? 0 : u.getFailedLoginAttempts();
        if (u.getLockoutUntil() != null && priorAttempts >= hardLimit) {
            priorAttempts = loginMaxAttempts;
            u.setFailedLoginAttempts(priorAttempts);
            u.setLockoutUntil(null);
        }

        if (!encoder.matches(req.getPassword(), u.getPassword())) {
            int attempts = priorAttempts + 1;
            u.setFailedLoginAttempts(attempts);

            if (attempts == loginMaxAttempts) {
                // Tier 1: short cooldown (default 1 minute).
                long secs = loginFirstLockMinutes * 60L;
                u.setLockoutUntil(now.plus(loginFirstLockMinutes, java.time.temporal.ChronoUnit.MINUTES));
                users.save(u);
                throw new AccountLockedException(
                        "Too many failed attempts. Account locked for "
                                + formatLockDuration(secs) + ".", secs);
            }
            if (attempts >= hardLimit) {
                // Tier 2 exhausted: first time -> extended lock (default 3h),
                // every time after that -> repeat lock (default 24h).
                int level = u.getLockoutLevel() == null ? 0 : u.getLockoutLevel();
                long hours = level >= 1 ? loginRepeatLockHours : loginExtendedLockHours;
                u.setLockoutLevel(Math.min(level + 1, 2));
                long secs = hours * 3600L;
                u.setLockoutUntil(now.plus(hours, java.time.temporal.ChronoUnit.HOURS));
                users.save(u);
                throw new AccountLockedException(
                        "Too many failed attempts. Account locked for "
                                + formatLockDuration(secs) + ".", secs);
            }
            users.save(u);
            if (attempts > loginMaxAttempts) {
                int left = hardLimit - attempts;
                throw new BadCredentialsException(
                        "Invalid password. " + left + " attempt(s) left before account lock.");
            }
            throw new BadCredentialsException("Invalid password");
        }

        // Success resets the whole ladder.
        u.setFailedLoginAttempts(0);
        u.setLockoutUntil(null);
        u.setLockoutLevel(0);

        if (!Boolean.TRUE.equals(u.getEmailVerified())) {
            // New-flow account still pending OTP -> block. Legacy accounts
            // (created before OTP existed: no OTP fields) pass through once
            // and get marked verified.
            if (u.getOtpHash() != null || u.getOtpSentAt() != null) {
                users.save(u);
                throw new RuntimeException("Email not verified. Please verify OTP sent to your email.");
            }
            u.setEmailVerified(true);
        }
        users.save(u);

        return buildResponseWithSession(u, req.getDeviceName(), userAgent, ipAddress);
    }

    private static String formatLockDuration(long totalSeconds) {
        if (totalSeconds >= 3600) {
            long h = totalSeconds / 3600;
            long m = (totalSeconds % 3600) / 60;
            return m == 0 ? h + (h == 1 ? " hour" : " hours")
                    : h + (h == 1 ? " hour " : " hours ") + m + (m == 1 ? " minute" : " minutes");
        }
        if (totalSeconds >= 60) {
            long m = totalSeconds / 60;
            return m + (m == 1 ? " minute" : " minutes");
        }
        return totalSeconds + (totalSeconds == 1 ? " second" : " seconds");
    }

    public AuthResponse updateProfile(String email, UpdateProfileRequest req) {
        User u = users.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found"));

        if (req.getPhone() != null && !req.getPhone().isBlank()
                && !req.getPhone().equals(u.getPhone())) {
            String phone = validatePhone(req.getPhone());
            if (users.existsByPhone(phone))
                throw new RuntimeException("Phone already in use");
            u.setPhone(phone);
        }

        if (req.getFullName() != null && !req.getFullName().isBlank())
            u.setFullName(normalizeFullName(req.getFullName()));

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

        if (req.getOccupation() != null)
            u.setOccupation(validateOccupation(req.getOccupation()));

        // One stored image, compressed once on upload (avatars ≤512px,
        // covers ≤1280px). Lists ship it as-is (covers never ship in lists),
        // so this bound is what keeps 50-row pages usable on slow networks.
        // Hard caps below only catch non-image/absurd payloads.
        if (req.getProfilePicture() != null) {
            String pic = req.getProfilePicture();
            if (!pic.isEmpty() && pic.length() > 1_000_000)
                throw new RuntimeException("Profile photo is too large — please choose a smaller image.");
            u.setProfilePicture(
                    pic.isEmpty() ? pic : com.example.demo.util.ImageCompress.compressAvatar(pic));
        }

        if (req.getCoverImage() != null) {
            String cover = req.getCoverImage();
            if (!cover.isEmpty() && cover.length() > 2_000_000)
                throw new RuntimeException("Cover photo is too large — please choose a smaller image.");
            u.setCoverImage(
                    cover.isEmpty() ? cover : com.example.demo.util.ImageCompress.compressCover(cover));
        }

        if (req.getHideCover() != null)
            u.setHideCover(req.getHideCover());
        if (req.getHideConnections() != null)
            u.setHideConnections(req.getHideConnections());
        if (req.getHideContactInfo() != null)
            u.setHideContactInfo(req.getHideContactInfo());

        if (req.getRelationFormat() != null) {
            String fmt = normalizeRelationFormat(req.getRelationFormat());
            if (fmt == null)
                throw new RuntimeException("relationFormat must be 'english' or 'indian'");
            u.setRelationFormat(fmt);
        }

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

    // ── Login sessions ─────────────────────────────────────────────
    // One row per device; deleting a row revokes that login instantly.

    public java.util.List<java.util.Map<String, Object>> listSessions(String email, String currentHash) {
        User u = users.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found"));
        java.util.List<java.util.Map<String, Object>> out = new java.util.ArrayList<>();
        for (UserSession s : sessions.findByUserOrderByLastActiveAtDesc(u)) {
            java.util.Map<String, Object> m = new java.util.HashMap<>();
            m.put("id", s.getId());
            m.put("deviceInfo", s.getDeviceInfo());
            m.put("deviceName", s.getDeviceName());
            m.put("ipAddress", s.getIpAddress());
            m.put("createdAt", s.getCreatedAt() == null ? null : s.getCreatedAt().toString());
            m.put("lastActiveAt", s.getLastActiveAt() == null ? null : s.getLastActiveAt().toString());
            m.put("expiresAt", s.getExpiresAt() == null ? null : s.getExpiresAt().toString());
            m.put("current", currentHash != null && currentHash.equals(s.getTokenHash()));
            out.add(m);
        }
        return out;
    }

    public void revokeSession(String email, Long sessionId) {
        User u = users.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found"));
        UserSession s = sessions.findByIdAndUser(sessionId, u)
                .orElseThrow(() -> new RuntimeException("Session not found"));
        sessions.delete(s);
    }

    @org.springframework.transaction.annotation.Transactional
    public int revokeAllSessions(String email) {
        User u = users.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found"));
        return sessions.deleteByUser(u);
    }

    // Best-effort single-device logout — never throws.
    @org.springframework.transaction.annotation.Transactional
    public void logoutSession(String email, String tokenHash) {
        if (email == null || tokenHash == null) return;
        try {
            User u = users.findByEmail(email).orElse(null);
            if (u == null) return;
            sessions.findByTokenHash(tokenHash).ifPresent(sessions::delete);
        } catch (Exception ignored) {
            // Logout must never fail the client.
        }
    }

    // Full account wipe: every relation row touching the user (either side,
    // any status), their address-book contacts and username history, then
    // the user row itself. Other users' address-book snapshots stay untouched.
    // Requires a fresh OTP sent to the account email (see deleteAccountRequest).
    public java.util.Map<String, Object> deleteAccountRequest(String email) {
        User u = users.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found"));
        EmailOtpVerification p = pendingOtps.findByEmail(email).orElseGet(() -> {
            EmailOtpVerification n = new EmailOtpVerification();
            n.setEmail(email);
            return n;
        });
        if (p.getOtpSentAt() != null && java.time.Instant.now().isBefore(
                p.getOtpSentAt().plusSeconds(RESEND_COOLDOWN_SECONDS))) {
            throw new RuntimeException("Please wait a minute before resending OTP.");
        }
        String otp = newOtp(p);
        pendingOtps.save(p);
        if (otpTestMode) testOtpCodes.put(email, otp);
        boolean delivered = mailer.sendOtp(email, otp, u.getFullName(),
                OtpMailService.OtpPurpose.ACCOUNT_DELETION);
        if (!delivered) {
            p.setOtpSentAt(null);
            pendingOtps.save(p);
        }
        return java.util.Map.of("message", "OTP sent to your email.", "email", email,
                "delivered", delivered);
    }

    @org.springframework.transaction.annotation.Transactional
    public void deleteAccount(String email, String otp) {
        User u = users.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found"));
        EmailOtpVerification p = pendingOtps.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("No OTP request found. Please send OTP first."));
        // The verify step must be done AND the same code presented again —
        // a stale verified row never authorizes a code nobody typed.
        boolean fresh = Boolean.TRUE.equals(p.getVerified())
                && p.getVerifiedAt() != null && java.time.Instant.now().isBefore(
                        p.getVerifiedAt().plus(VERIFIED_VALID_MINUTES, java.time.temporal.ChronoUnit.MINUTES));
        if (!fresh)
            throw new RuntimeException("Please verify email OTP first.");
        checkOtp(p.getOtpHash(), p.getOtpExpiry(), p.getOtpAttempts(), otp);
        if (!encoder.matches(otp, p.getOtpHash())) {
            p.setOtpAttempts((p.getOtpAttempts() == null ? 0 : p.getOtpAttempts()) + 1);
            pendingOtps.save(p);
            throw new RuntimeException("Invalid OTP.");
        }
        relations.deleteAllInvolving(u);
        contacts.deleteByUser(u);
        history.deleteByUser(u);
        try { sessions.deleteByUser(u); } catch (Exception ignored) {}
        try { pendingOtps.deleteByEmail(email); } catch (Exception ignored) {}
        if (otpTestMode) testOtpCodes.remove(email);
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

    // Instant availability for register Step-1 — same idea as username.
    // Taken returns false; bad format / disposable throws so the caller
    // can show the real message instead of a misleading "taken".
    public boolean isEmailAvailable(String rawEmail) {
        if (rawEmail == null || rawEmail.isBlank()) return false;
        String v = normalizeEmail(rawEmail);
        return !users.existsByEmail(v);
    }

    public boolean isPhoneAvailable(String phone) {
        if (phone == null) return false;
        String v = phone.trim();
        if (!PHONE_PATTERN.matcher(v).matches()) return false;
        return !users.existsByPhone(v);
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
        // Echo the live session's token — never re-mint here. Re-minting on
        // every /me call (polling + user actions run concurrently) could hand
        // two live tokens to one session row and desync it. Fresh tokens are
        // minted only at login / registration (see buildResponseWithSession).
        return authResponseOf(u, currentRequestToken());
    }

    // Fresh login / registration: mint a token and register its session row.
    // The client sends its own display name ("Chrome · Windows"); older
    // clients fall back to server-side UA parsing.
    private AuthResponse buildResponseWithSession(User u, String deviceName, String userAgent, String ipAddress) {
        UserDetails d = uds.loadUserByUsername(u.getEmail());
        String token = jwt.generateToken(d);
        java.time.Instant now = java.time.Instant.now();
        UserSession s = new UserSession();
        s.setUser(u);
        s.setTokenHash(HashUtil.sha256Hex(token));
        s.setDeviceInfo(truncate(userAgent, 255));
        s.setDeviceName(displayDeviceName(deviceName, userAgent));
        s.setIpAddress(ipAddress);
        s.setCreatedAt(now);
        s.setLastActiveAt(now);
        s.setExpiresAt(now.plusMillis(jwt.getExpirationMs()));
        sessions.save(s);
        return authResponseOf(u, token);
    }

    static String truncate(String v, int max) {
        if (v == null) return null;
        return v.length() > max ? v.substring(0, max) : v;
    }

    // Client display name wins; otherwise "Browser · OS" from the UA.
    static String displayDeviceName(String deviceName, String userAgent) {
        if (deviceName != null && !deviceName.isBlank()) {
            String v = deviceName.trim();
            return v.length() > 100 ? v.substring(0, 100) : v;
        }
        String ua = userAgent == null ? "" : userAgent;
        String browser = null;
        if (ua.matches("(?i).*edg/[\\d.]+.*")) browser = "Edge";
        else if (ua.matches("(?i).*(opr/|opera).*")) browser = "Opera";
        else if (ua.matches("(?i).*chrome/[\\d.]+.*") && !ua.matches("(?i).*edg.*")) browser = "Chrome";
        else if (ua.matches("(?i).*firefox/[\\d.]+.*")) browser = "Firefox";
        else if (ua.matches("(?i).*safari/[\\d.]+.*") && !ua.matches("(?i).*chrome.*")) browser = "Safari";
        String os = null;
        if (ua.matches("(?i).*android.*")) os = "Android";
        else if (ua.matches("(?i).*(iphone|ipad|ipod).*")) os = "iOS";
        else if (ua.matches("(?i).*windows.*")) os = "Windows";
        else if (ua.matches("(?i).*mac os.*")) os = "macOS";
        else if (ua.matches("(?i).*linux.*")) os = "Linux";
        String name = ((browser == null ? "" : browser)
                + (browser != null && os != null ? " · " : "")
                + (os == null ? "" : os)).trim();
        return name.isEmpty() ? "Unknown device" : name;
    }

    private AuthResponse authResponseOf(User u, String token) {
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
                u.getOccupation(),
                u.getHideCover(),
                u.getHideConnections(),
                u.getHideContactInfo(),
                u.getRelationFormat()
        );
    }

    // Raw bearer token of the current request (null when absent).
    static String currentRequestToken() {
        try {
            org.springframework.web.context.request.RequestAttributes attrs =
                    org.springframework.web.context.request.RequestContextHolder.getRequestAttributes();
            if (attrs instanceof org.springframework.web.context.request.ServletRequestAttributes sra) {
                String h = sra.getRequest().getHeader("Authorization");
                if (h != null && h.startsWith("Bearer ")) {
                    String t = h.substring(7).trim();
                    if (!t.isEmpty()) return t;
                }
            }
        } catch (Exception ignored) {
            // No request context (jobs/tests) — no token to echo.
        }
        return null;
    }

    // SHA-256 of the current request's bearer token (null when absent).
    static String currentRequestTokenHash() {
        String t = currentRequestToken();
        return t == null ? null : HashUtil.sha256Hex(t);
    }

    // Full name: trimmed, single spaces, first letter of every word
    // capital (register + profile update) — "jesmin  sheladiya" → "Jesmin Sheladiya".
    static String normalizeFullName(String fullName) {
        if (fullName == null) return null;
        String v = fullName.trim().replaceAll("\\s+", " ");
        if (v.isEmpty()) return v;
        String[] words = v.split(" ");
        StringBuilder sb = new StringBuilder();
        for (String w : words) {
            if (sb.length() > 0) sb.append(' ');
            sb.append(Character.toUpperCase(w.charAt(0)));
            if (w.length() > 1) sb.append(w.substring(1).toLowerCase());
        }
        return sb.toString();
    }

    // Occupation: optional (blank clears it). Only rule is max length —
    // any text is allowed. Normalized to Title Case, keeping short
    // all-caps words (CEO, HR, IT) as acronyms.
    private static final java.util.regex.Pattern OCCUPATION_ACRONYM =
            java.util.regex.Pattern.compile("^[A-Z0-9&.'()/\\-]{1,6}$");

    static String validateOccupation(String occupation) {
        if (occupation == null) return null;
        String v = occupation.trim().replaceAll("\\s+", " ");
        if (v.isEmpty()) return null;
        if (v.length() > 60)
            throw new RuntimeException("Occupation must be 60 characters or less");
        String[] words = v.split(" ");
        StringBuilder sb = new StringBuilder();
        for (String w : words) {
            if (sb.length() > 0) sb.append(' ');
            if (OCCUPATION_ACRONYM.matcher(w).matches()) sb.append(w);
            else {
                sb.append(Character.toUpperCase(w.charAt(0)));
                if (w.length() > 1) sb.append(w.substring(1).toLowerCase());
            }
        }
        return sb.toString();
    }

    // Phone: digits only, exactly 10 (register + profile update).
    private static final java.util.regex.Pattern PHONE_PATTERN =
            java.util.regex.Pattern.compile("^[0-9]{10}$");

    static String validatePhone(String phone) {
        String v = phone == null ? "" : phone.trim();
        if (!PHONE_PATTERN.matcher(v).matches())
            throw new RuntimeException("Phone must be 10 digits");
        return v;
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

    // Relation display language: 'english' | 'indian'. Null stays null
    // (never chose); anything else throws via callers that require non-null.
    static String normalizeRelationFormat(String v) {
        if (v == null) return null;
        String s = v.trim().toLowerCase();
        if (s.isEmpty()) return null;
        if (s.equals("indian")) return "indian";
        if (s.equals("english")) return "english";
        return null;
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