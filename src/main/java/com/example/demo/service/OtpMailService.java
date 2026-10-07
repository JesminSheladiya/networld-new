package com.example.demo.service;

import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.concurrent.CompletableFuture;

// OTP mail sender. Primary path is SMTP (e.g. Gmail + App Password —
// delivers to ANY address). Resend stays as fallback when SMTP is not
// configured (note: Resend's test domain only delivers to the account
// owner's own email). With neither configured, dev mode logs the OTP.
@Service
public class OtpMailService {

    private static final Logger log = LoggerFactory.getLogger(OtpMailService.class);
    private static final String RESEND_API = "https://api.resend.com/emails";

    private final String resendKey;
    private final String resendFrom;
    private final String smtpHost;
    private final int smtpPort;
    private final String smtpUser;
    private final String smtpPass;
    private final String smtpFrom;
    private final RestTemplate http = new RestTemplate();

    public OtpMailService(
            @Value("${resend.api.key:}") String resendKey,
            @Value("${resend.from:onboarding@resend.dev}") String resendFrom,
            @Value("${mail.smtp.host:}") String smtpHost,
            @Value("${mail.smtp.port:587}") int smtpPort,
            @Value("${mail.smtp.username:}") String smtpUser,
            @Value("${mail.smtp.password:}") String smtpPass,
            @Value("${mail.smtp.from:}") String smtpFrom) {
        this.resendKey = resendKey == null ? "" : resendKey.trim();
        this.resendFrom = resendFrom;
        this.smtpHost = smtpHost == null ? "" : smtpHost.trim();
        this.smtpPort = smtpPort;
        this.smtpUser = smtpUser == null ? "" : smtpUser.trim();
        this.smtpPass = smtpPass == null ? "" : smtpPass;
        this.smtpFrom = smtpFrom == null ? "" : smtpFrom.trim();
        if (smtpConfigured()) {
            System.out.println("OTP mail via SMTP " + smtpHost + " as " + smtpUser);
        } else if (resendConfigured()) {
            System.out.println("OTP mail via Resend (test domain delivers to account email only)");
        } else {
            System.out.println("WARN: no mail sender configured — OTPs will only be logged, not emailed.");
        }
    }

    public boolean smtpConfigured() {
        return !smtpHost.isBlank() && !smtpUser.isBlank() && !smtpPass.isBlank();
    }

    public boolean resendConfigured() {
        return !resendKey.isBlank();
    }

    // Kept for compatibility — prefer isConfigured() checks below.
    public boolean isConfigured() {
        return smtpConfigured() || resendConfigured();
    }

    public void sendOtpAsync(String toEmail, String otp, String fullName) {
        CompletableFuture.runAsync(() -> sendOtp(toEmail, otp, fullName));
    }

    // Synchronous send — returns true only when the mail was accepted
    // (or dev mode with no sender, where the OTP goes to logs instead).
    // Callers use this to report real delivery status instead of assuming it.
    public boolean sendOtp(String toEmail, String otp, String fullName) {
        String name = (fullName == null || fullName.isBlank()) ? "there" : fullName.trim().split("\\s+")[0];
        String subject = "NetWorld verification code";
        String text = "Hi " + name + ",\n\nYour NetWorld verification code is " + otp
                + ". It is valid for 5 minutes.\n\nIf you did not request this, ignore this mail.";
        String html = buildOtpHtml(escapeHtml(name), escapeHtml(otp));

        if (smtpConfigured()) return sendViaSmtp(toEmail, subject, text, html);
        if (resendConfigured()) return sendViaResend(toEmail, subject, text, html);
        // Dev mode: no sender configured — skip sending, log OTP instead.
        // Never log OTPs in production.
        log.warn("No mail sender configured — skipping mail to {}. OTP={}", toEmail, otp);
        return true;
    }

    private boolean sendViaSmtp(String toEmail, String subject, String text, String html) {
        try {
            JavaMailSenderImpl sender = new JavaMailSenderImpl();
            sender.setHost(smtpHost);
            sender.setPort(smtpPort);
            sender.setUsername(smtpUser);
            sender.setPassword(smtpPass);
            Properties props = sender.getJavaMailProperties();
            props.put("mail.transport.protocol", "smtp");
            props.put("mail.smtp.auth", "true");
            props.put("mail.smtp.starttls.enable", "true");
            props.put("mail.smtp.connectiontimeout", "8000");
            props.put("mail.smtp.timeout", "15000");
            MimeMessage msg = sender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(msg, true, "UTF-8");
            helper.setFrom(smtpFrom.isBlank() ? smtpUser : smtpFrom);
            helper.setTo(toEmail);
            helper.setSubject(subject);
            helper.setText(text, html);
            sender.send(msg);
            return true;
        } catch (Exception e) {
            // Never fail registration because of a mail error — the user can resend.
            log.error("SMTP error for {}: {}", toEmail, e.getMessage());
            return false;
        }
    }

    private boolean sendViaResend(String toEmail, String subject, String text, String html) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setBearerAuth(resendKey);
            Map<String, Object> body = Map.of(
                    "from", resendFrom,
                    "to", List.of(toEmail),
                    "subject", subject,
                    "text", text,
                    "html", html);
            HttpEntity<Map<String, Object>> req = new HttpEntity<>(body, headers);
            ResponseEntity<String> res = http.postForEntity(RESEND_API, req, String.class);
            if (!res.getStatusCode().is2xxSuccessful()) {
                log.error("Resend failed for {}: {}", toEmail, res.getBody());
                return false;
            }
            return true;
        } catch (Exception e) {
            // Never fail registration because of a mail error — the user can resend.
            log.error("Resend error for {}: {}", toEmail, e.getMessage());
            return false;
        }
    }

    private static String escapeHtml(String s) {
        return s.replace("&", "&amp;").replace("<", "&lt;")
                .replace(">", "&gt;").replace("\"", "&quot;");
    }

    // Branded OTP mail — table layout + inline CSS for email-client compatibility.
    // Plain-text version stays as fallback (added alongside in the API body).
    private static String buildOtpHtml(String name, String otp) {
        return "<!DOCTYPE html><html><body style=\"margin:0;padding:0;background-color:#0b1120;\">"
                + "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"background-color:#0b1120;padding:32px 16px;\">"
                + "<tr><td align=\"center\">"
                + "<table role=\"presentation\" width=\"480\" cellpadding=\"0\" cellspacing=\"0\" style=\"max-width:480px;background-color:#111c33;border:1px solid #26334f;border-radius:16px;overflow:hidden;\">"
                // Header with logo
                + "<tr><td align=\"center\" style=\"padding:28px 24px 8px;\">"
                + "<div style=\"display:inline-block;width:48px;height:48px;line-height:48px;border-radius:14px;background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:#ffffff;font-family:Arial,sans-serif;font-size:24px;font-weight:bold;text-align:center;\">N</div>"
                + "<div style=\"margin-top:10px;color:#f1f5f9;font-family:Arial,sans-serif;font-size:20px;font-weight:bold;\">NetWorld</div>"
                + "</td></tr>"
                // Greeting + message
                + "<tr><td style=\"padding:12px 32px 0;color:#cbd5e1;font-family:Arial,sans-serif;font-size:15px;line-height:22px;\">"
                + "Hi " + name + ",<br><br>Your NetWorld verification code is:"
                + "</td></tr>"
                // Highlighted OTP box
                + "<tr><td align=\"center\" style=\"padding:20px 32px;\">"
                + "<div style=\"display:inline-block;padding:16px 36px;border:1px dashed #3b82f6;border-radius:12px;background-color:#0f2547;\">"
                + "<span style=\"color:#ffffff;font-family:'Courier New',monospace;font-size:34px;font-weight:bold;letter-spacing:10px;margin-right:-10px;\">" + otp + "</span>"
                + "</div>"
                + "<div style=\"margin-top:12px;color:#f59e0b;font-family:Arial,sans-serif;font-size:13px;\">It is valid for 5 minutes.</div>"
                + "</td></tr>"
                // Footer note
                + "<tr><td style=\"padding:0 32px 28px;color:#64748b;font-family:Arial,sans-serif;font-size:13px;line-height:19px;\">"
                + "If you did not request this code, you can safely ignore this mail."
                + "</td></tr>"
                + "</table>"
                + "<div style=\"margin-top:16px;color:#475569;font-family:Arial,sans-serif;font-size:12px;\">© NetWorld</div>"
                + "</td></tr>"
                + "</table>"
                + "</body></html>";
    }
}
