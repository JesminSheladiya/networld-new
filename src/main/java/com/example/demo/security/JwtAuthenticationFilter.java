package com.example.demo.security;

import com.example.demo.repository.UserSessionRepository;
import com.example.demo.util.HashUtil;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.Cookie;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtUtil jwtUtil;
    private final UserDetailsService userDetailsService;
    private final UserSessionRepository sessions;

    // lastActiveAt writes are throttled — one DB write per session per window.
    private static final long TOUCH_INTERVAL_MINUTES = 5;

    public JwtAuthenticationFilter(JwtUtil jwtUtil, UserDetailsService userDetailsService,
                                   UserSessionRepository sessions) {
        this.jwtUtil = jwtUtil; this.userDetailsService = userDetailsService;
        this.sessions = sessions;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {

        String header = request.getHeader("Authorization");
        String username = null; String token = null;

        if (header != null && header.startsWith("Bearer ")) {
            token = header.substring(7);
            try { username = jwtUtil.extractUsername(token); } catch (Exception ignored) {}
        }
        // HttpOnly cookie is the primary browser auth mechanism. Keep the
        // bearer fallback for controlled API clients/backward compatibility.
        if (token == null && request.getCookies() != null) {
            for (Cookie cookie : request.getCookies()) {
                if ("NW_AUTH".equals(cookie.getName())) {
                    token = cookie.getValue();
                    try { username = jwtUtil.extractUsername(token); } catch (Exception ignored) {}
                    break;
                }
            }
        }

        if (username != null && SecurityContextHolder.getContext().getAuthentication() == null) {
            UserDetails details = userDetailsService.loadUserByUsername(username);
            if (jwtUtil.validate(token, details) && sessionAlive(token)) {
                UsernamePasswordAuthenticationToken auth =
                        new UsernamePasswordAuthenticationToken(details, null, details.getAuthorities());
                auth.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                SecurityContextHolder.getContext().setAuthentication(auth);
            }
        }
        chain.doFilter(request, response);
    }

    // A token is live only while its server-side session row exists and is
    // unexpired. Deleting the row (logout / revoke / new device wipe) kills
    // the token at the next API call — the client then gets a 401.
    private boolean sessionAlive(String token) {
        try {
            var row = sessions.findByTokenHash(HashUtil.sha256Hex(token)).orElse(null);
            if (row == null || row.getExpiresAt() == null
                    || java.time.Instant.now().isAfter(row.getExpiresAt())) {
                return false;
            }
            if (row.getLastActiveAt() == null || row.getLastActiveAt().isBefore(
                    java.time.Instant.now().minus(TOUCH_INTERVAL_MINUTES,
                            java.time.temporal.ChronoUnit.MINUTES))) {
                row.setLastActiveAt(java.time.Instant.now());
                sessions.save(row);
            }
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
