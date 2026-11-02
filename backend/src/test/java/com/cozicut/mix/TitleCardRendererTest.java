package com.cozicut.mix;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TitleCardRendererTest {

    private final TitleCardRenderer renderer = new TitleCardRenderer();

    @Test
    @DisplayName("Generates 1920x1080 aesthetic title card PNG")
    void generatesValid1080pPng() throws Exception {
        Path tempDir = Files.createTempDirectory("title-card-test-");
        Path outputPath = tempDir.resolve("test_card.png");

        try {
            renderer.renderTitleCard("Chill_Beats_LoFi.mp3", "Clip 1 • 0.0s - 15.0s", outputPath);

            assertTrue(Files.isRegularFile(outputPath));
            assertTrue(Files.size(outputPath) > 1000);

            BufferedImage img = ImageIO.read(outputPath.toFile());
            assertEquals(1920, img.getWidth());
            assertEquals(1080, img.getHeight());
        } finally {
            Files.deleteIfExists(outputPath);
            Files.deleteIfExists(tempDir);
        }
    }
}
