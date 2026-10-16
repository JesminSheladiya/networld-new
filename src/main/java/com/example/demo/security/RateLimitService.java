package com.example.demo.security;

import com.example.demo.config.RateLimitProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Fixed-window rate limiter with Redis (distributed) + in-memory fallback.
 * Single instance: in-memory map. Multi-instance: Redis Lua script (atomic
 * INCR + PEXPIRE), so every instance uses the shared counter.
 * If Redis is unavailable, requests continue through the in-memory fallback.
 */
@Service
public class RateLimitService {

    private static final Logger log = LoggerFactory.getLogger(RateLimitService.class);
    private static final String KEY_PREFIX = "rl:";

    // Atomic fixed window: INCR, set PEXPIRE on the first hit, then return PTTL.
    private static final DefaultRedisScript<List> LUA_SCRIPT = new DefaultRedisScript<>(
            "local c = redis.call('INCR', KEYS[1]) " +
            "if c == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end " +
            "local ttl = redis.call('PTTL', KEYS[1]) " +
            "return {c, ttl}",
            List.class);

    private static final class Window {
        long windowStartMillis;
        int count;
    }

    private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();
    private final RateLimitProperties props;
    private final ObjectProvider<StringRedisTemplate> redisProvider;
    private volatile boolean redisBrokenLogged = false;

    public RateLimitService(RateLimitProperties props,
                            ObjectProvider<StringRedisTemplate> redisProvider) {
        this.props = props;
        this.redisProvider = redisProvider;
    }

    public static final class Decision {
        private final boolean allowed;
        private final long retryAfterSeconds;

        public Decision(boolean allowed, long retryAfterSeconds) {
            this.allowed = allowed;
            this.retryAfterSeconds = retryAfterSeconds;
        }

        public boolean isAllowed() { return allowed; }
        public long getRetryAfterSeconds() { return retryAfterSeconds; }
    }

    /**
     * @param key      already namespaced, e.g. "auth:1.2.3.4"
     * @param maxHits  max requests per window
     * @param windowMs window size in millis
     */
    public Decision tryConsume(String key, int maxHits, long windowMs) {
        if (props.isDistributed()) {
            try {
                Decision d = tryConsumeRedis(key, maxHits, windowMs);
                if (d != null) return d;
            } catch (Exception e) {
                if (!redisBrokenLogged) {
                    log.warn("Redis rate-limit unavailable, falling back to in-memory: {}", e.getMessage());
                    redisBrokenLogged = true;
                }
            }
        }
        return tryConsumeMemory(key, maxHits, windowMs);
    }

    @SuppressWarnings("unchecked")
    private Decision tryConsumeRedis(String key, int maxHits, long windowMs) {
        StringRedisTemplate redis = redisProvider.getIfAvailable();
        if (redis == null) return null;
        List<Long> res = (List<Long>) redis.execute(
                LUA_SCRIPT,
                Collections.singletonList(KEY_PREFIX + key),
                String.valueOf(windowMs));
        if (res == null || res.size() < 2 || res.get(0) == null) return null;
        long count = res.get(0);
        long ttlMs = res.get(1) == null ? windowMs : res.get(1);
        if (count <= maxHits) return new Decision(true, 0);
        return new Decision(false, Math.max(1, (ttlMs + 999) / 1000));
    }

    private Decision tryConsumeMemory(String key, int maxHits, long windowMs) {
        long now = System.currentTimeMillis();
        Window w = windows.computeIfAbsent(key, k -> {
            Window nw = new Window();
            nw.windowStartMillis = now;
            nw.count = 0;
            return nw;
        });

        synchronized (w) {
            if (now - w.windowStartMillis >= windowMs) {
                w.windowStartMillis = now;
                w.count = 0;
            }
            if (w.count < maxHits) {
                w.count++;
                return new Decision(true, 0);
            }
            long retryAfter = (w.windowStartMillis + windowMs - now + 999) / 1000;
            return new Decision(false, Math.max(1, retryAfter));
        }
    }

    /** Opportunistic cleanup so the map can't grow forever (called from the filter). */
    public void cleanupIfLarge(long windowMs) {
        if (windows.size() < 20_000) return;
        long now = System.currentTimeMillis();
        for (Map.Entry<String, Window> e : windows.entrySet()) {
            Window w = e.getValue();
            synchronized (w) {
                if (now - w.windowStartMillis >= windowMs * 2) {
                    windows.remove(e.getKey(), w);
                }
            }
        }
    }
}
