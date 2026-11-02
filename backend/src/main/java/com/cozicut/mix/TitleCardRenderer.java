package com.cozicut.mix;

import org.springframework.stereotype.Component;

import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.Path;

@Component
public class TitleCardRenderer {

    public static final int WIDTH = 1920;
    public static final int HEIGHT = 1080;

    static {
        System.setProperty("java.awt.headless", "true");
    }

    public void renderTitleCard(String rawTitle, String subtitle, Path outputPath) throws IOException {
        String cleanTitle = formatTitle(rawTitle);
        String cleanSubtitle = (subtitle != null && !subtitle.isBlank()) ? subtitle : "CoziCut Audio Track";

        BufferedImage img = new BufferedImage(WIDTH, HEIGHT, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = img.createGraphics();

        try {
            g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_LCD_HRGB);
            g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);

            // 1. Dark elegant gradient background
            GradientPaint bgPaint = new GradientPaint(
                    0, 0, new Color(15, 23, 42),
                    WIDTH, HEIGHT, new Color(24, 24, 27)
            );
            g.setPaint(bgPaint);
            g.fillRect(0, 0, WIDTH, HEIGHT);

            // Subtle ambient warm glow in center
            g.setColor(new Color(245, 158, 11, 22));
            g.fillOval(WIDTH / 2 - 450, HEIGHT / 2 - 320, 900, 640);

            // 2. Translucent Glass Card in Center
            int cardW = 1200;
            int cardH = 620;
            int cardX = (WIDTH - cardW) / 2;
            int cardY = (HEIGHT - cardH) / 2;

            g.setColor(new Color(30, 41, 59, 215));
            g.fillRoundRect(cardX, cardY, cardW, cardH, 44, 44);

            // Card border
            g.setColor(new Color(71, 85, 105, 140));
            g.setStroke(new BasicStroke(2.5f));
            g.drawRoundRect(cardX, cardY, cardW, cardH, 44, 44);

            // 3. Audio Pill Badge
            int badgeW = 220;
            int badgeH = 44;
            int badgeX = (WIDTH - badgeW) / 2;
            int badgeY = cardY + 55;
            g.setColor(new Color(245, 158, 11, 35));
            g.fillRoundRect(badgeX, badgeY, badgeW, badgeH, 22, 22);
            g.setColor(new Color(245, 158, 11, 200));
            g.setStroke(new BasicStroke(1.5f));
            g.drawRoundRect(badgeX, badgeY, badgeW, badgeH, 22, 22);

            g.setFont(new Font("SansSerif", Font.BOLD, 16));
            g.setColor(new Color(251, 191, 36));
            FontMetrics badgeFm = g.getFontMetrics();
            String badgeText = "AUDIO TRACK";
            int btx = badgeX + (badgeW - badgeFm.stringWidth(badgeText)) / 2;
            int bty = badgeY + ((badgeH - badgeFm.getHeight()) / 2) + badgeFm.getAscent();
            g.drawString(badgeText, btx, bty);

            // 4. Track Title
            g.setFont(new Font("SansSerif", Font.BOLD, 46));
            g.setColor(Color.WHITE);
            FontMetrics titleFm = g.getFontMetrics();
            String displayTitle = cleanTitle;
            if (titleFm.stringWidth(displayTitle) > cardW - 120) {
                while (displayTitle.length() > 5 && titleFm.stringWidth(displayTitle + "...") > cardW - 120) {
                    displayTitle = displayTitle.substring(0, displayTitle.length() - 1);
                }
                displayTitle = displayTitle + "...";
            }
            int tX = (WIDTH - titleFm.stringWidth(displayTitle)) / 2;
            int tY = badgeY + 120;
            g.drawString(displayTitle, tX, tY);

            // Subtitle
            g.setFont(new Font("SansSerif", Font.PLAIN, 22));
            g.setColor(new Color(148, 163, 184));
            FontMetrics subFm = g.getFontMetrics();
            int sX = (WIDTH - subFm.stringWidth(cleanSubtitle)) / 2;
            int sY = tY + 45;
            g.drawString(cleanSubtitle, sX, sY);

            // 5. Waveform container cutout frame
            int waveW = 1040;
            int waveH = 170;
            int waveX = (WIDTH - waveW) / 2;
            int waveY = cardY + cardH - waveH - 55;

            g.setColor(new Color(15, 23, 42, 180));
            g.fillRoundRect(waveX, waveY, waveW, waveH, 24, 24);
            g.setColor(new Color(51, 65, 85, 160));
            g.setStroke(new BasicStroke(1.5f));
            g.drawRoundRect(waveX, waveY, waveW, waveH, 24, 24);

            // 6. Subtle branding in bottom right corner
            g.setFont(new Font("SansSerif", Font.PLAIN, 18));
            g.setColor(new Color(100, 116, 139));
            g.drawString("CoziCut", WIDTH - 160, HEIGHT - 40);

        } finally {
            g.dispose();
        }

        ImageIO.write(img, "png", outputPath.toFile());
    }

    private String formatTitle(String filename) {
        if (filename == null || filename.isBlank()) {
            return "Audio Clip";
        }
        String name = filename;
        int dot = name.lastIndexOf('.');
        if (dot > 0) {
            name = name.substring(0, dot);
        }
        name = name.replace('_', ' ').replace('-', ' ').trim();
        if (name.isBlank()) {
            return "Audio Clip";
        }
        return name;
    }
}
