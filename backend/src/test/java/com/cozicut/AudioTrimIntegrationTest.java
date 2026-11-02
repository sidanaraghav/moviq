package com.cozicut;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class AudioTrimIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    @DisplayName("End-to-end trim of synthetic audio through FFmpeg produces ~2s MP3")
    void endToEndTrimWithSyntheticAudio() throws Exception {
        Path tempDir = Files.createTempDirectory("cozicut-test-media-");
        Path syntheticWav = tempDir.resolve("sine-4s.wav");
        Path outputMp3 = tempDir.resolve("output.mp3");

        try {
            // 1. Generate 4 seconds of synthetic 1kHz sine wave
            Process generateProcess = new ProcessBuilder(
                    "ffmpeg", "-y", "-f", "lavfi", "-i", "sine=frequency=1000:duration=4", syntheticWav.toString()
            ).redirectErrorStream(true).start();

            boolean generated = generateProcess.waitFor(10, TimeUnit.SECONDS);
            assertTrue(generated && generateProcess.exitValue() == 0, "Failed to generate synthetic WAV");
            assertTrue(Files.size(syntheticWav) > 0, "Generated synthetic WAV is empty");

            byte[] wavBytes = Files.readAllBytes(syntheticWav);
            MockMultipartFile multipartFile = new MockMultipartFile(
                    "file",
                    "sine-4s.wav",
                    "audio/wav",
                    wavBytes
            );

            // 2. Perform multipart POST request to trim from 1.0s to 3.0s (duration = 2.0s)
            MvcResult mvcResult = mockMvc.perform(multipart("/api/v1/audio/trims")
                            .file(multipartFile)
                            .param("startSeconds", "1.0")
                            .param("endSeconds", "3.0"))
                    .andExpect(status().isOk())
                    .andExpect(request().asyncStarted())
                    .andExpect(header().string("Content-Type", "audio/mpeg"))
                    .andExpect(header().string("Content-Disposition", "attachment; filename=\"trim.mp3\""))
                    .andReturn();

            mockMvc.perform(asyncDispatch(mvcResult))
                    .andExpect(status().isOk());

            byte[] trimmedMp3Bytes = mvcResult.getResponse().getContentAsByteArray();
            assertTrue(trimmedMp3Bytes.length > 0, "Trimmed MP3 response was empty");

            Files.write(outputMp3, trimmedMp3Bytes);

            // 3. Inspect duration with ffprobe
            Process probeProcess = new ProcessBuilder(
                    "ffprobe", "-v", "error", "-show_entries", "format=duration",
                    "-of", "default=noprint_wrappers=1:nokey=1", outputMp3.toString()
            ).start();

            boolean probed = probeProcess.waitFor(5, TimeUnit.SECONDS);
            assertTrue(probed && probeProcess.exitValue() == 0, "ffprobe failed");

            try (BufferedReader reader = new BufferedReader(new InputStreamReader(probeProcess.getInputStream()))) {
                String durationLine = reader.readLine();
                double duration = Double.parseDouble(durationLine.trim());
                // Expected duration is ~2.0 seconds (within 0.1s due to MP3 frame boundary padding)
                assertEquals(2.0, duration, 0.1, "Duration of trimmed MP3 must be approximately 2.0s");
            }
        } finally {
            Files.deleteIfExists(syntheticWav);
            Files.deleteIfExists(outputMp3);
            Files.deleteIfExists(tempDir);
        }
    }
}
