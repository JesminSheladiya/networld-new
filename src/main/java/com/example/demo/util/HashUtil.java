package com.example.demo.util;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

// SHA-256 hex digests. Used to key server-side login sessions by token
// without ever persisting the raw JWT.
public final class HashUtil {

    private HashUtil() {}

    public static String sha256Hex(String value) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] bytes = md.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(bytes.length * 2);
            for (byte b : bytes) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
}
