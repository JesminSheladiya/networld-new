package com.example.demo.util;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.Base64;
import javax.imageio.ImageIO;

/**
 * Server-side cover preview for private profiles (LinkedIn-style frosted
 * preview). The blur MUST happen here — a frontend-only blur would still
 * ship the original bytes to the browser where anyone could read them.
 *
 * Strategy: downscale hard (destroys detail) + two box-blur passes
 * (frosted look) + low-quality JPEG. Output is tiny and irreversible.
 * Any failure returns null so callers fail closed (hide, never leak).
 */
public final class ImagePrivacy {

    private ImagePrivacy() {}

    private static final int PREVIEW_WIDTH = 240;
    private static final int BLUR_RADIUS = 4;

    public static String blurredCoverOrNull(String coverImage) {
        if (coverImage == null || coverImage.isBlank()) return null;
        try {
            String base64 = coverImage;
            int comma = coverImage.indexOf(',');
            if (comma >= 0) base64 = coverImage.substring(comma + 1);
            byte[] bytes = Base64.getDecoder().decode(base64.trim());
            BufferedImage src;
            try (ByteArrayInputStream in = new ByteArrayInputStream(bytes)) {
                src = ImageIO.read(in);
            }
            if (src == null || src.getWidth() <= 0 || src.getHeight() <= 0) return null;

            int w = PREVIEW_WIDTH;
            int h = Math.max(1, Math.min(480,
                    (int) Math.round(src.getHeight() * (w / (double) src.getWidth()))));
            BufferedImage small = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
            Graphics2D g = small.createGraphics();
            try {
                g.setRenderingHint(RenderingHints.KEY_INTERPOLATION,
                        RenderingHints.VALUE_INTERPOLATION_BILINEAR);
                g.setColor(Color.BLACK);
                g.fillRect(0, 0, w, h);
                g.drawImage(src, 0, 0, w, h, null);
            } finally {
                g.dispose();
            }

            BufferedImage blurred = boxBlur(boxBlur(small, BLUR_RADIUS), BLUR_RADIUS);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            if (!ImageIO.write(blurred, "jpg", out)) return null;
            return "data:image/jpeg;base64," + Base64.getEncoder().encodeToString(out.toByteArray());
        } catch (Exception e) {
            return null;
        }
    }

    // Separable box blur with clamped edges. Two passes ≈ gaussian look.
    private static BufferedImage boxBlur(BufferedImage src, int r) {
        int w = src.getWidth();
        int h = src.getHeight();
        int[] in = src.getRGB(0, 0, w, h, null, 0, w);
        int[] tmp = new int[in.length];
        int[] out = new int[in.length];
        int div = 2 * r + 1;

        for (int y = 0; y < h; y++) {
            int row = y * w;
            int sumR = 0, sumG = 0, sumB = 0;
            for (int x = -r; x <= r; x++) {
                int px = in[row + clamp(x, 0, w - 1)];
                sumR += (px >> 16) & 0xFF;
                sumG += (px >> 8) & 0xFF;
                sumB += px & 0xFF;
            }
            for (int x = 0; x < w; x++) {
                tmp[row + x] = (0xFF << 24)
                        | ((sumR / div) << 16) | ((sumG / div) << 8) | (sumB / div);
                int remove = in[row + clamp(x - r, 0, w - 1)];
                int add = in[row + clamp(x + r + 1, 0, w - 1)];
                sumR += ((add >> 16) & 0xFF) - ((remove >> 16) & 0xFF);
                sumG += ((add >> 8) & 0xFF) - ((remove >> 8) & 0xFF);
                sumB += (add & 0xFF) - (remove & 0xFF);
            }
        }

        for (int x = 0; x < w; x++) {
            int sumR = 0, sumG = 0, sumB = 0;
            for (int y = -r; y <= r; y++) {
                int px = tmp[clamp(y, 0, h - 1) * w + x];
                sumR += (px >> 16) & 0xFF;
                sumG += (px >> 8) & 0xFF;
                sumB += px & 0xFF;
            }
            for (int y = 0; y < h; y++) {
                out[y * w + x] = (0xFF << 24)
                        | ((sumR / div) << 16) | ((sumG / div) << 8) | (sumB / div);
                int remove = tmp[clamp(y - r, 0, h - 1) * w + x];
                int add = tmp[clamp(y + r + 1, 0, h - 1) * w + x];
                sumR += ((add >> 16) & 0xFF) - ((remove >> 16) & 0xFF);
                sumG += ((add >> 8) & 0xFF) - ((remove >> 8) & 0xFF);
                sumB += (add & 0xFF) - (remove & 0xFF);
            }
        }

        BufferedImage dst = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        dst.setRGB(0, 0, w, h, out, 0, w);
        return dst;
    }

    private static int clamp(int v, int lo, int hi) {
        return Math.max(lo, Math.min(hi, v));
    }
}
