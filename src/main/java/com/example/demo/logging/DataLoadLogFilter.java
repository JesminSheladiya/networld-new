package com.example.demo.logging;

import jakarta.persistence.EntityManagerFactory;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.hibernate.engine.spi.SessionFactoryImplementor;
import org.hibernate.stat.Statistics;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Writes one clearly-labeled [NETWORK-DEBUG] line to the backend terminal for
 * every HTTP request, showing exactly who clicked what, how much data load it
 * caused, and how long it took.
 *
 * Purpose: debug mobile/network behaviour from the backend terminal — the
 * phone shows "loading..." while this terminal shows:
 *   * which user made the request
 *   * which page/endpoint was hit (GET /api/contacts/...)
 *   * HTTP status and duration
 *   * data loads: queries / entity loads / collection loads
 *   * lifetime totals for the whole backend session
 *
 * Grep example:  grep "\[NETWORK-DEBUG\]" backend/backend.log
 *
 * Requires spring.jpa.properties.hibernate.generate_statistics=true
 * (set in application.properties, gated by app.dataload.logging.enabled).
 */
@Component
public class DataLoadLogFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(DataLoadLogFilter.class);
    private static final String PREFIX = "[NETWORK-DEBUG] DATA-LOAD";

    private final Statistics statistics;
    private final boolean enabled;

    // Lifetime totals across all requests of this process.
    private final AtomicLong totalQueries = new AtomicLong();
    private final AtomicLong totalEntityLoads = new AtomicLong();
    private final AtomicLong totalCollectionLoads = new AtomicLong();

    // Per-request snapshot taken before the request, read after it completes.
    private static final ThreadLocal<Snap> CURRENT = new ThreadLocal<>();

    private record Snap(long queries, long entityLoads, long collectionLoads, long startNs) {}

    public DataLoadLogFilter(EntityManagerFactory entityManagerFactory,
                             @Value("${app.dataload.logging.enabled:true}") boolean enabled) {
        this.enabled = enabled;
        SessionFactoryImplementor sf = entityManagerFactory.unwrap(SessionFactoryImplementor.class);
        this.statistics = sf == null ? null : sf.getStatistics();
        if (enabled && this.statistics == null) {
            log.warn("{} DISABLED — Hibernate statistics not available. Set "
                    + "spring.jpa.properties.hibernate.generate_statistics=true", PREFIX);
        } else if (enabled) {
            log.info("{} ENABLED — logging every request's user, page, data-load count and duration to the terminal",
                    PREFIX);
        } else {
            log.info("{} DISABLED by config (app.dataload.logging.enabled=false)", PREFIX);
        }
    }

    private boolean active() {
        return enabled && statistics != null;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !active();
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain) throws IOException, ServletException {
        Statistics s = statistics;
        long startNs = System.nanoTime();
        CURRENT.set(new Snap(s.getQueryExecutionCount(), s.getEntityLoadCount(),
                s.getCollectionLoadCount(), startNs));
        try {
            chain.doFilter(request, response);
        } finally {
            Snap snap = CURRENT.get();
            CURRENT.remove();
            if (snap == null) {
                return;
            }
            long queries = s.getQueryExecutionCount() - snap.queries();
            long entityLoads = s.getEntityLoadCount() - snap.entityLoads();
            long collectionLoads = s.getCollectionLoadCount() - snap.collectionLoads();
            totalQueries.addAndGet(queries);
            totalEntityLoads.addAndGet(entityLoads);
            totalCollectionLoads.addAndGet(collectionLoads);
            long ms = (System.nanoTime() - snap.startNs()) / 1_000_000;

            String path = request.getRequestURI();
            String qs = request.getQueryString();
            if (qs != null && !qs.isBlank()) {
                path = path + "?" + qs;
            }

            log.info("{} | user={} | {} {} | status={} | duration={}ms | dataLoads: queries={} entityLoads={} collectionLoads={} | "
                            + "lifetime totals: queries={} entityLoads={} collectionLoads={}",
                    PREFIX, currentUser(), request.getMethod(), path, response.getStatus(),
                    ms, queries, entityLoads, collectionLoads,
                    totalQueries.get(), totalEntityLoads.get(), totalCollectionLoads.get());
        }
    }

    /** Email of the authenticated user, or "anonymous" when not logged in. */
    private String currentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) {
            return "anonymous";
        }
        Object principal = auth.getPrincipal();
        if (principal instanceof UserDetails ud) {
            return ud.getUsername();
        }
        return principal == null ? "unknown" : principal.toString();
    }
}
