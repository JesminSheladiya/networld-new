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
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/**
 * Runs before JWT auth. Strict buckets for brute-force targets,
 * generous bucket for everything else under /api/**.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
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

        String category;
        int maxHits;
        long windowMs;

        if (isOtpVerifyPath(path)) {
            category = "otp-verify";
            maxHits = props.getOtpRequests();
            windowMs = TimeUnit.MINUTES.toMillis(props.getOtpWindowMinutes());
        } else if (isOtpSendPath(path)) {
            category = "otp-send";
            maxHits = props.getOtpRequests();
            windowMs = TimeUnit.MINUTES.toMillis(props.getOtpWindowMinutes());
        } else if (isAuthPath(path)) {
            category = "auth";
            maxHits = props.getAuthRequests();
            windowMs = TimeUnit.MINUTES.toMillis(props.getAuthWindowMinutes());
        } else if ("GET".equalsIgnoreCase(request.getMethod())) {
            category = "read";
            maxHits = props.getReadRequests();
            windowMs = TimeUnit.MINUTES.toMillis(props.getReadWindowMinutes());
        } else {
            category = "global";
            maxHits = props.getGlobalRequests();
            windowMs = TimeUnit.MINUTES.toMillis(props.getGlobalWindowMinutes());
        }

        RateLimitService.Decision decision =
                limiter.tryConsume(category + ":" + ip, maxHits, windowMs);
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
}
