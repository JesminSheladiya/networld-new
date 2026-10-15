package com.example.demo.config;

import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.cache.CacheManager;
import org.springframework.cache.caffeine.CaffeineCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.concurrent.TimeUnit;

// Bounded in-memory caches: master data is read-only at runtime, and the
// suggestions list is recomputed at most once per user per TTL window
// (a 10k-hub regen costs ~1min — without this every Suggestions open,
// badge refresh and page click would each pay it).
@Configuration
public class CacheConfig {

    @Bean
    public CacheManager cacheManager() {
        CaffeineCacheManager manager = new CaffeineCacheManager(
                "relationsAll", "relationsDisplay", "inferenceRules", "suggestions");
        manager.setCaffeine(Caffeine.newBuilder()
                .expireAfterWrite(60, TimeUnit.SECONDS)
                .maximumSize(10_000));
        return manager;
    }
}
