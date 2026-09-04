package com.example.demo.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.*;

@Configuration
public class CorsConfig implements WebMvcConfigurer {
    @Override
    public void addCorsMappings(CorsRegistry registry) {
        // allowedOriginPatterns (not allowedOrigins) so any current/future
        // LAN IP works: http://192.168.1.4:3000, .5, .6, ...
        registry.addMapping("/api/**")
                .allowedOriginPatterns(
                        "http://localhost:3000",
                        "http://127.0.0.1:3000",
                        "http://192.168.1.*:3000")
                .allowedMethods("GET","POST","PUT","DELETE","OPTIONS")
                .allowedHeaders("*");
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/uploads/**")
                .addResourceLocations("file:uploads/");
    }
}
