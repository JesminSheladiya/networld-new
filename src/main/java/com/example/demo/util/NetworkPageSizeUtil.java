package com.example.demo.util;

/**
 * Network-speed-based page sizing.
 *
 * Page size is derived from the measured downlink speed (Mbps), NOT from the
 * network type label (4G/5G can be slow; WiFi can be congested). The downlink
 * is estimated client-side from API RTT and sent with every paged request.
 *
 * Buckets (downlink in Mbps):
 *   < 0.5  -> max 20  (very slow)
 *   < 1.5  -> max 30  (slow)
 *   < 5    -> max 50  (medium)
 *   >= 5   -> max 100 (fast)
 *
 * The adjusted size never exceeds the frontend-requested size, so a user who
 * explicitly asks for a small page always gets at most that many rows.
 */
public final class NetworkPageSizeUtil {

    private static final int VERY_SLOW_MAX = 20;
    private static final int SLOW_MAX = 30;
    private static final int MEDIUM_MAX = 50;
    private static final int FAST_MAX = 100;

    private static final double VERY_SLOW_THRESHOLD = 0.5;
    private static final double SLOW_THRESHOLD = 1.5;
    private static final double MEDIUM_THRESHOLD = 5.0;

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
        if (downlink < VERY_SLOW_THRESHOLD) {
            maxSize = VERY_SLOW_MAX;   // 20 rows
        } else if (downlink < SLOW_THRESHOLD) {
            maxSize = SLOW_MAX;        // 30 rows
        } else if (downlink < MEDIUM_THRESHOLD) {
            maxSize = MEDIUM_MAX;      // 50 rows
        } else {
            maxSize = FAST_MAX;        // 100 rows
        }
        return Math.min(safeRequested, maxSize);
    }
}
