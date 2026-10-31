package com.example.demo.security;

import com.example.demo.config.RateLimitProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/**
 * Rate limiting that is PER-USER when authenticated (so multiple devices
 * logged in as the same user each get their own bucket) and per-IP for
 * unauthenticated requests (login/register/OTP — brute-force protection).
 * Runs AFTER JwtAuthenticationFilter so the SecurityContext is populated.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class RateLimitFilter extends OncePerRequestFilter {

    private final RateLimitService limiter;
    private final RateLimitProperties props;
    private final ObjectMapper mapper = new ObjectMapper();

    public RateLimitFilter(RateLimitService limiter, RateLimitProperties props) {
        this.limiter = limiter;
        this.props = props;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        if (!props.isEnabled()) return true;
        // CORS preflight + non-API traffic are never limited.
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) return true;
        String path = pathOf(request);
        return !path.startsWith("/api/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String path = pathOf(request);
        String ip = clientIp(request);

        // Per-user bucket when authenticated (multiple devices = separate buckets),
        // per-IP bucket for unauthenticated requests (brute-force protection).
        String userKey = authenticatedUser();
        String bucketKey = (userKey != null) ? categoryPrefix(path) + ":" + userKey : categoryPrefix(path) + ":" + ip;

        int maxHits;
        long windowMs;

        if (isOtpVerifyPath(path)) {
            maxHits = props.getOtpRequests();
            windowMs = TimeUnit.MINUTES.toMillis(props.getOtpWindowMinutes());
        } else if (isOtpSendPath(path)) {
            maxHits = props.getOtpRequests();
            windowMs = TimeUnit.MINUTES.toMillis(props.getOtpWindowMinutes());
        } else if (isAuthPath(path)) {
            maxHits = props.getAuthRequests();
            windowMs = TimeUnit.MINUTES.toMillis(props.getAuthWindowMinutes());
        } else if ("GET".equalsIgnoreCase(request.getMethod())) {
            maxHits = props.getReadRequests();
            windowMs = TimeUnit.MINUTES.toMillis(props.getReadWindowMinutes());
        } else {
            maxHits = props.getGlobalRequests();
            windowMs = TimeUnit.MINUTES.toMillis(props.getGlobalWindowMinutes());
        }

        RateLimitService.Decision decision =
                limiter.tryConsume(bucketKey, maxHits, windowMs);
        limiter.cleanupIfLarge(windowMs);

        if (!decision.isAllowed()) {
            response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.setHeader("Retry-After", String.valueOf(decision.getRetryAfterSeconds()));
            Map<String, Object> body = Map.of(
                    "message", "Too many requests. Please try again in "
                            + decision.getRetryAfterSeconds() + " seconds.",
                    "error", "Too Many Requests",
                    "retryAfterSeconds", decision.getRetryAfterSeconds());
            mapper.writeValue(response.getWriter(), body);
            return;
        }

        chain.doFilter(request, response);
    }

    private static String pathOf(HttpServletRequest request) {
        String uri = request.getRequestURI();
        String ctx = request.getContextPath();
        if (ctx != null && !ctx.isEmpty() && uri.startsWith(ctx)) {
            uri = uri.substring(ctx.length());
        }
        return uri == null ? "" : uri;
    }

    private static boolean isOtpSendPath(String path) {
        return path.contains("request-otp")
                || path.contains("resend-otp")
                || path.contains("forgot-password")
                || path.contains("delete-account/request");
    }

    private static boolean isOtpVerifyPath(String path) {
        return path.contains("verify-otp");
    }

    private static boolean isAuthPath(String path) {
        // Strict bucket ONLY for register/logout.
        // /api/auth/login has its own per-account tiered lockout in
        // AuthService (5 fails -> 1-min lock -> +3 tries -> hours lock),
        // so it stays in the global bucket — a strict per-IP bucket here
        // would mask those account messages with generic 429s.
        // /api/auth/me stays global too — the frontend polls it every 30s
        // (USER_POLL_INTERVAL_MS), so a strict bucket would lock out
        // normal logged-in users.
        return path.equals("/api/auth/register")
                || path.equals("/api/auth/logout");
    }

    private static String clientIp(HttpServletRequest request) {
        String fwd = request.getHeader("X-Forwarded-For");
        if (fwd != null && !fwd.isBlank()) return fwd.split(",")[0].trim();
        String real = request.getHeader("X-Real-IP");
        if (real != null && !real.isBlank()) return real.trim();
        String ip = request.getRemoteAddr();
        return ip == null ? "unknown" : ip;
    }

    // Email of the authenticated user, or null when not logged in.
    private String authenticatedUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()
                || auth instanceof AnonymousAuthenticationToken) {
            return null;
        }
        Object principal = auth.getPrincipal();
        if (principal instanceof UserDetails ud) {
            return ud.getUsername();
        }
        return principal == null ? null : principal.toString();
    }

    // Short category name used as the rate-limit key prefix.
    // Only used to separate buckets in the key — actual limits come from the
    // method-based if/else chain in doFilterInternal.
    private static String categoryPrefix(String path) {
        if (isOtpVerifyPath(path)) return "otp-verify";
        if (isOtpSendPath(path)) return "otp-send";
        if (isAuthPath(path)) return "auth";
        return "api";
    }
}
