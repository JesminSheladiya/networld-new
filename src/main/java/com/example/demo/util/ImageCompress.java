package com.example.demo.util;

import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.Base64;
import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageOutputStream;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import java.util.concurrent.TimeUnit;

/**
 * Backend photo compression on upload: one stored image, bounded once.
 * Avatars cap at 512px, covers at 1280px (JPEG quality 0.82) — enough for
 * full-clarity profiles and viewers, small enough that 50-row lists stay
 * usable on slow networks. Already-small photos pass through byte-for-byte
 * (no pointless re-encode). Any failure returns the original bytes so an
 * upload can never break because of compression.
 */
public final class ImageCompress {

    private ImageCompress() {}

    public static final int AVATAR_MAX_DIM = 512;
    public static final int COVER_MAX_DIM = 1280;
    private static final float JPEG_QUALITY = 0.82f;

    public static String compressAvatar(String dataUrl) {
        return downscaleToBound(dataUrl, AVATAR_MAX_DIM);
    }

    public static String compressCover(String dataUrl) {
        return downscaleToBound(dataUrl, COVER_MAX_DIM);
    }

    // List thumbnail cache: lists (contacts/requests/suggestions/
    // connections/search) show a 100px version (~6KB) while profiles and
    // viewers get the full stored photo. No extra DB column — the thumb is
    // derived server-side and cached in memory, keyed by owner + content, so
    // a photo change naturally misses and recomputes. Bounded (5k entries,
    // 10-min expiry) so memory stays flat at any user scale.
    private static final Cache<String, String> LIST_THUMBS = Caffeine.newBuilder()
            .maximumSize(5_000)
            .expireAfterWrite(10, TimeUnit.MINUTES)
            .build();

    public static String listThumb(String dataUrl, long ownerId) {
        if (dataUrl == null || dataUrl.isEmpty()) return dataUrl;
        String key = ownerId + ":" + dataUrl.length() + ":" + dataUrl.hashCode();
        String cached = LIST_THUMBS.getIfPresent(key);
        if (cached != null) return cached;
        String thumb = renderScaled(dataUrl, 100, 0.72f);
        if (thumb == null) return dataUrl; // unreadable — serve original
        LIST_THUMBS.put(key, thumb);
        return thumb;
    }

    static String downscaleToBound(String dataUrl, int maxDim) {
        if (dataUrl == null || dataUrl.isEmpty()) return dataUrl;
        int[] wh = dimensionsOf(dataUrl);
        if (wh == null) return dataUrl; // not a readable image — keep as-is
        if (Math.max(wh[0], wh[1]) <= maxDim) return dataUrl; // already small — untouched
        String out = renderScaled(dataUrl, maxDim, JPEG_QUALITY);
        return out != null ? out : dataUrl; // fail open on bytes, never on the upload
    }

    private static int[] dimensionsOf(String dataUrl) {
        try {
            BufferedImage src = read(dataUrl);
            if (src == null || src.getWidth() <= 0 || src.getHeight() <= 0) return null;
            return new int[]{src.getWidth(), src.getHeight()};
        } catch (Exception e) {
            return null;
        }
    }

    private static BufferedImage read(String dataUrl) throws Exception {
        String b64 = dataUrl;
        int comma = dataUrl.indexOf(',');
        if (comma >= 0) b64 = dataUrl.substring(comma + 1);
        return ImageIO.read(new ByteArrayInputStream(Base64.getDecoder().decode(b64)));
    }

    private static String renderScaled(String dataUrl, int maxDim, float quality) {
        try {
            BufferedImage src = read(dataUrl);
            if (src == null) return null;
            int w = src.getWidth(), h = src.getHeight();
            if (w <= 0 || h <= 0) return null;
            double scale = (double) maxDim / Math.max(w, h);
            // Thumbs never upscale tiny originals — serve them as-is instead.
            if (scale >= 1.0) return dataUrl;
            int nw = Math.max(1, (int) Math.round(w * scale));
            int nh = Math.max(1, (int) Math.round(h * scale));
            BufferedImage rgb = new BufferedImage(nw, nh, BufferedImage.TYPE_INT_RGB);
            Graphics2D g = rgb.createGraphics();
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION,
                    RenderingHints.VALUE_INTERPOLATION_BICUBIC);
            // White base: JPEG has no alpha (transparent PNGs → white, not black).
            g.setBackground(java.awt.Color.WHITE);
            g.clearRect(0, 0, nw, nh);
            g.drawImage(src, 0, 0, nw, nh, null);
            g.dispose();
            ByteArrayOutputStream out = new ByteArrayOutputStream(nw * nh);
            ImageWriter writer = ImageIO.getImageWritersByFormatName("jpeg").next();
            try (ImageOutputStream ios = ImageIO.createImageOutputStream(out)) {
                writer.setOutput(ios);
                ImageWriteParam param = writer.getDefaultWriteParam();
                param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
                param.setCompressionQuality(quality);
                writer.write(null, new IIOImage(rgb, null, null), param);
            } finally {
                writer.dispose();
            }
            return "data:image/jpeg;base64,"
                    + Base64.getEncoder().encodeToString(out.toByteArray());
        } catch (Exception e) {
            return null;
        }
    }
}
