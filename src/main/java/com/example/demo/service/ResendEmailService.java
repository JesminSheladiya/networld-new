package com.example.demo.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

@Service
public class ResendEmailService {

    private static final Logger log = LoggerFactory.getLogger(ResendEmailService.class);
    private static final String RESEND_API = "https://api.resend.com/emails";

    private final String apiKey;
    private final String from;
    private final RestTemplate http = new RestTemplate();

    public ResendEmailService(
            @Value("${resend.api.key:}") String apiKey,
            @Value("${resend.from:onboarding@resend.dev}") String from) {
        this.apiKey = apiKey == null ? "" : apiKey.trim();
        this.from = from;
    }

    public boolean isConfigured() {
        return !apiKey.isBlank();
    }

    public void sendOtpAsync(String toEmail, String otp, String fullName) {
        CompletableFuture.runAsync(() -> sendOtp(toEmail, otp, fullName));
    }

    public void sendOtp(String toEmail, String otp, String fullName) {
        String name = (fullName == null || fullName.isBlank()) ? "there" : fullName.trim().split("\\s+")[0];
        String subject = "NetWorld verification code: " + otp;
        String text = "Hi " + name + ",\n\nYour NetWorld verification code is " + otp
                + ". It is valid for 5 minutes.\n\nIf you did not request this, ignore this mail.";

        if (!isConfigured()) {
            // Dev mode: no API key configured — skip sending, log OTP instead.
            // Never log OTPs in production.
            log.warn("RESEND_API_KEY missing — skipping mail to {}. OTP={}", toEmail, otp);
            return;
        }
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setBearerAuth(apiKey);
            Map<String, Object> body = Map.of(
                    "from", from,
                    "to", List.of(toEmail),
                    "subject", subject,
                    "text", text);
            HttpEntity<Map<String, Object>> req = new HttpEntity<>(body, headers);
            ResponseEntity<String> res = http.postForEntity(RESEND_API, req, String.class);
            if (!res.getStatusCode().is2xxSuccessful()) {
                log.error("Resend failed for {}: {}", toEmail, res.getBody());
            }
        } catch (Exception e) {
            // Never fail registration because of a mail error — the user can resend.
            log.error("Resend error for {}: {}", toEmail, e.getMessage());
        }
    }
}
