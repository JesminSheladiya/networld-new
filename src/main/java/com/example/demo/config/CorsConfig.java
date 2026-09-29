package com.example.demo.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.*;

@Configuration
public class CorsConfig implements WebMvcConfigurer {
    @Override
    public void addCorsMappings(CorsRegistry registry) {
        // allowedOriginPatterns (not allowedOrigins) so any current/future
        // LAN IP works on any private range: 192.168.x.x (any subnet, not
        // just 192.168.1.x), 10.x.x.x (hotspots/VPNs) and 172.16-31.x.x.
        // A phone on a different subnet than the PC was getting its
        // preflight rejected, which broke login/register on mobile only.
        registry.addMapping("/api/**")
                .allowedOriginPatterns(
                        "http://localhost:3000",
                        "http://127.0.0.1:3000",
                        "http://192.168.*:3000",
                        "http://10.*:3000",
                        "http://172.*:3000")
                .allowedMethods("GET","POST","PUT","DELETE","OPTIONS")
                .allowedHeaders("*")
                .maxAge(3600);
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/uploads/**")
                .addResourceLocations("file:uploads/");
    }
}
