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
class AudioMixIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    @DisplayName("End-to-end multi-clip mix with WAV audio and MP4 video extracts and stitches to ~4.0s MP3")
    void endToEndCleanCutMixFromAudioAndVideo() throws Exception {
        Path tempDir = Files.createTempDirectory("cozicut-test-mix-media-");
        Path syntheticWav = tempDir.resolve("sine-3s.wav");
        Path syntheticMp4 = tempDir.resolve("video-3s.mp4");
        Path outputMasterMp3 = tempDir.resolve("master.mp3");

        try {
            // 1. Generate 3s synthetic WAV
            Process wavProcess = new ProcessBuilder(
                    "ffmpeg", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=3", syntheticWav.toString()
            ).redirectErrorStream(true).start();
            assertTrue(wavProcess.waitFor(10, TimeUnit.SECONDS) && wavProcess.exitValue() == 0);

            // 2. Generate 3s synthetic MP4 (video + audio track)
            Process mp4Process = new ProcessBuilder(
                    "ffmpeg", "-y",
                    "-f", "lavfi", "-i", "sine=frequency=880:duration=3",
                    "-f", "lavfi", "-i", "testsrc=duration=3:size=160x120:rate=10",
                    "-c:a", "aac", "-c:v", "libx264", syntheticMp4.toString()
            ).redirectErrorStream(true).start();
            assertTrue(mp4Process.waitFor(10, TimeUnit.SECONDS) && mp4Process.exitValue() == 0);

            MockMultipartFile wavFile = new MockMultipartFile(
                    "files", "sine-3s.wav", "audio/wav", Files.readAllBytes(syntheticWav)
            );
            MockMultipartFile mp4File = new MockMultipartFile(
                    "files", "video-3s.mp4", "video/mp4", Files.readAllBytes(syntheticMp4)
            );

            // 3. Request mix: Clip 1 (from WAV, 0.5s to 2.5s = 2s) + Clip 2 (from MP4, 0.5s to 2.5s = 2s)
            // Clean cut (0s crossfade, default) -> expected duration = 4.0s
            String manifest = """
                    {
                      "crossfadeSeconds": 0.0,
                      "normalizeVolume": false,
                      "clips": [
                        {"fileIndex": 0, "startSeconds": 0.5, "endSeconds": 2.5},
                        {"fileIndex": 1, "startSeconds": 0.5, "endSeconds": 2.5}
                      ]
                    }
                    """;

            MvcResult mvcResult = mockMvc.perform(multipart("/api/v1/audio/mixes")
                            .file(wavFile)
                            .file(mp4File)
                            .param("manifest", manifest))
                    .andExpect(status().isOk())
                    .andExpect(request().asyncStarted())
                    .andExpect(header().string("Content-Type", "audio/mpeg"))
                    .andExpect(header().string("Content-Disposition", "attachment; filename=\"moviq_audio.mp3\""))
                    .andReturn();

            mockMvc.perform(asyncDispatch(mvcResult))
                    .andExpect(status().isOk());

            byte[] masterBytes = mvcResult.getResponse().getContentAsByteArray();
            assertTrue(masterBytes.length > 0, "Master mix output is empty");
            Files.write(outputMasterMp3, masterBytes);

            // 4. Assert total duration is ~4.0s with ffprobe
            Process probeProcess = new ProcessBuilder(
                    "ffprobe", "-v", "error", "-show_entries", "format=duration",
                    "-of", "default=noprint_wrappers=1:nokey=1", outputMasterMp3.toString()
            ).start();
            assertTrue(probeProcess.waitFor(5, TimeUnit.SECONDS) && probeProcess.exitValue() == 0);

            try (BufferedReader reader = new BufferedReader(new InputStreamReader(probeProcess.getInputStream()))) {
                double duration = Double.parseDouble(reader.readLine().trim());
                assertEquals(4.0, duration, 0.15, "Duration of stitched mix should be ~4.0 seconds");
            }
        } finally {
            Files.deleteIfExists(syntheticWav);
            Files.deleteIfExists(syntheticMp4);
            Files.deleteIfExists(outputMasterMp3);
            Files.deleteIfExists(tempDir);
        }
    }

    @Test
    @DisplayName("End-to-end mix with 1s crossfade yields expected overlapped duration ~3.0s")
    void endToEndCrossfadeMixYieldsOverlappedDuration() throws Exception {
        Path tempDir = Files.createTempDirectory("cozicut-test-crossfade-media-");
        Path clip1Wav = tempDir.resolve("c1.wav");
        Path clip2Wav = tempDir.resolve("c2.wav");
        Path outputMasterMp3 = tempDir.resolve("crossfade_master.mp3");

        try {
            // Generate two 2.5s clips
            Process p1 = new ProcessBuilder("ffmpeg", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=2.5", clip1Wav.toString()).start();
            Process p2 = new ProcessBuilder("ffmpeg", "-y", "-f", "lavfi", "-i", "sine=frequency=880:duration=2.5", clip2Wav.toString()).start();
            assertTrue(p1.waitFor(5, TimeUnit.SECONDS) && p2.waitFor(5, TimeUnit.SECONDS));

            MockMultipartFile f1 = new MockMultipartFile("files", "c1.wav", "audio/wav", Files.readAllBytes(clip1Wav));
            MockMultipartFile f2 = new MockMultipartFile("files", "c2.wav", "audio/wav", Files.readAllBytes(clip2Wav));

            // Clip 1 = 2s (0.0 to 2.0), Clip 2 = 2s (0.0 to 2.0), Crossfade = 1s -> Expected duration = 2 + 2 - 1 = 3.0s
            String manifest = """
                    {
                      "crossfadeSeconds": 1.0,
                      "normalizeVolume": true,
                      "clips": [
                        {"fileIndex": 0, "startSeconds": 0.0, "endSeconds": 2.0},
                        {"fileIndex": 1, "startSeconds": 0.0, "endSeconds": 2.0}
                      ]
                    }
                    """;

            MvcResult mvcResult = mockMvc.perform(multipart("/api/v1/audio/mixes")
                            .file(f1)
                            .file(f2)
                            .param("manifest", manifest))
                    .andExpect(status().isOk())
                    .andExpect(request().asyncStarted())
                    .andReturn();

            mockMvc.perform(asyncDispatch(mvcResult))
                    .andExpect(status().isOk());

            byte[] masterBytes = mvcResult.getResponse().getContentAsByteArray();
            Files.write(outputMasterMp3, masterBytes);

            Process probeProcess = new ProcessBuilder(
                    "ffprobe", "-v", "error", "-show_entries", "format=duration",
                    "-of", "default=noprint_wrappers=1:nokey=1", outputMasterMp3.toString()
            ).start();
            assertTrue(probeProcess.waitFor(5, TimeUnit.SECONDS) && probeProcess.exitValue() == 0);

            try (BufferedReader reader = new BufferedReader(new InputStreamReader(probeProcess.getInputStream()))) {
                double duration = Double.parseDouble(reader.readLine().trim());
                assertEquals(3.0, duration, 0.15, "Crossfaded mix duration should be ~3.0s (2 + 2 - 1)");
            }
        } finally {
            Files.deleteIfExists(clip1Wav);
            Files.deleteIfExists(clip2Wav);
            Files.deleteIfExists(outputMasterMp3);
            Files.deleteIfExists(tempDir);
        }
    }
}
