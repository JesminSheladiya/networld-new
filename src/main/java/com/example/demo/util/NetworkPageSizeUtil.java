package com.example.demo.util;

/**
 * Network-speed-based page sizing.
 *
 * Page size is derived from the measured downlink speed (Mbps), NOT from the
 * network type label (4G/5G can be slow; WiFi can be congested). The downlink
 * is estimated client-side from API RTT (or navigator.connection.downlink on
 * Chromium mobile) and sent with every paged request.
 *
 * Page size tiers (downlink in Mbps):
 *   < 0.5  -> max 10  (2G / very slow)
 *   < 1.5  -> max 20  (3G)
 *   < 5    -> max 30  (slow 4G)
 *   < 20   -> max 50  (fast 4G)
 *   >= 20  -> max 100 (5G / fast WiFi)
 *
 * The adjusted size never exceeds the frontend-requested size, so a user who
 * explicitly asks for a small page always gets at most that many rows.
 */
public final class NetworkPageSizeUtil {

    private static final int SIZE_2G = 10;
    private static final int SIZE_3G = 20;
    private static final int SIZE_SLOW_4G = 30;
    private static final int SIZE_FAST_4G = 50;
    private static final int SIZE_5G = 100;

    private static final double THRESHOLD_2G = 0.5;
    private static final double THRESHOLD_3G = 1.5;
    private static final double THRESHOLD_SLOW_4G = 5.0;
    private static final double THRESHOLD_FAST_4G = 20.0;

    private NetworkPageSizeUtil() {
    }

    /**
     * Clamp the requested page size based on measured downlink speed.
     *
     * @param downlinkStr   downlink in Mbps (string from query param), may be null
     * @param effectiveType network type label (ignored for sizing; kept for API compatibility)
     * @param requestedSize frontend-requested page size (already clamped to a sane max)
     * @return network-adjusted page size, never exceeding requestedSize
     */
    public static int adjustPageSizeForNetwork(String downlinkStr, String effectiveType,
                                               int requestedSize) {
        int safeRequested = Math.max(1, requestedSize);
        if (downlinkStr == null || downlinkStr.isBlank()) {
            // No network info measured yet — serve the requested size.
            return safeRequested;
        }
        double downlink;
        try {
            downlink = Double.parseDouble(downlinkStr);
        } catch (NumberFormatException ignored) {
            return safeRequested;
        }
        int maxSize;
        if (downlink < THRESHOLD_2G) {
            maxSize = SIZE_2G;      // 10 rows
        } else if (downlink < THRESHOLD_3G) {
            maxSize = SIZE_3G;      // 20 rows
        } else if (downlink < THRESHOLD_SLOW_4G) {
            maxSize = SIZE_SLOW_4G; // 30 rows
        } else if (downlink < THRESHOLD_FAST_4G) {
            maxSize = SIZE_FAST_4G; // 50 rows
        } else {
            maxSize = SIZE_5G;      // 100 rows
        }
        return Math.min(safeRequested, maxSize);
    }
}
