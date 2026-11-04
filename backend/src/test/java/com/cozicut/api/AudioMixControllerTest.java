package com.cozicut.api;

import com.cozicut.mix.AudioMixService;
import com.cozicut.mix.VideoMixService;
import com.cozicut.trim.TrimmedAudio;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.is;
import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(AudioMixController.class)
class AudioMixControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private AudioMixService audioMixService;

    @MockitoBean
    private VideoMixService videoMixService;

    private static final byte[] FAKE_BYTES = new byte[]{1, 2, 3};

    @Test
    @DisplayName("Valid multi-clip mix with manifest returns 200 OK and streams master_mix.mp3")
    void validMixWithManifestStreamsMp3() throws Exception {
        Path tempDir = Files.createTempDirectory("test-mix-workspace-");
        Path tempOutput = tempDir.resolve("master_mix.mp3");
        byte[] expectedContent = "mock-master-mix-content".getBytes();
        Files.write(tempOutput, expectedContent);

        when(audioMixService.mix(any(), any()))
                .thenReturn(new TrimmedAudio(tempDir, tempOutput));

        MockMultipartFile audioFile = new MockMultipartFile("files", "audio.mp3", "audio/mpeg", FAKE_BYTES);
        MockMultipartFile videoFile = new MockMultipartFile("files", "video.mp4", "video/mp4", FAKE_BYTES);

        String manifest = """
                {
                  "crossfadeSeconds": 0.0,
                  "normalizeVolume": false,
                  "clips": [
                    {"fileIndex": 0, "startSeconds": 5.0, "endSeconds": 15.0},
                    {"fileIndex": 1, "startSeconds": 2.0, "endSeconds": 12.0}
                  ]
                }
                """;

        MvcResult mvcResult = mockMvc.perform(multipart("/api/v1/audio/mixes")
                        .file(audioFile)
                        .file(videoFile)
                        .param("manifest", manifest))
                .andExpect(status().isOk())
                .andExpect(request().asyncStarted())
                .andExpect(header().string("Content-Type", "audio/mpeg"))
                .andExpect(header().string("Content-Disposition", "attachment; filename=\"moviq_audio.mp3\""))
                .andReturn();

        mockMvc.perform(asyncDispatch(mvcResult))
                .andExpect(status().isOk());

        assertArrayEquals(expectedContent, mvcResult.getResponse().getContentAsByteArray());
    }

    @Test
    @DisplayName("Valid mix with parallel startSeconds and endSeconds arrays succeeds")
    void validMixWithParallelArraysSucceeds() throws Exception {
        Path tempDir = Files.createTempDirectory("test-mix-workspace-");
        Path tempOutput = tempDir.resolve("master_mix.mp3");
        Files.write(tempOutput, "content".getBytes());

        when(audioMixService.mix(any(), any()))
                .thenReturn(new TrimmedAudio(tempDir, tempOutput));

        MockMultipartFile file1 = new MockMultipartFile("files", "song1.wav", "audio/wav", FAKE_BYTES);
        MockMultipartFile file2 = new MockMultipartFile("files", "song2.m4a", "audio/m4a", FAKE_BYTES);

        mockMvc.perform(multipart("/api/v1/audio/mixes")
                        .file(file1)
                        .file(file2)
                        .param("startSeconds", "0.0", "10.0")
                        .param("endSeconds", "15.0", "25.0"))
                .andExpect(status().isOk())
                .andExpect(request().asyncStarted());
    }

    @Test
    @DisplayName("Missing files parameter returns 400 Bad Request")
    void missingFilesReturnsBadRequest() throws Exception {
        mockMvc.perform(multipart("/api/v1/audio/mixes")
                        .param("startSeconds", "0.0")
                        .param("endSeconds", "10.0"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error", is("Bad Request")))
                .andExpect(jsonPath("$.message", containsString("At least one media file is required")));
    }

    @Test
    @DisplayName("Unsupported file format returns 400 Bad Request")
    void unsupportedFormatReturnsBadRequest() throws Exception {
        MockMultipartFile badFile = new MockMultipartFile("files", "document.pdf", "application/pdf", FAKE_BYTES);

        mockMvc.perform(multipart("/api/v1/audio/mixes")
                        .file(badFile)
                        .param("startSeconds", "0.0")
                        .param("endSeconds", "5.0"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error", is("Bad Request")))
                .andExpect(jsonPath("$.message", containsString("unsupported format")));
    }

    @Test
    @DisplayName("Out-of-bounds fileIndex in manifest returns 400 Bad Request")
    void outOfBoundsFileIndexReturnsBadRequest() throws Exception {
        MockMultipartFile file = new MockMultipartFile("files", "song.mp3", "audio/mpeg", FAKE_BYTES);
        String manifest = """
                {
                  "clips": [
                    {"fileIndex": 99, "startSeconds": 0.0, "endSeconds": 5.0}
                  ]
                }
                """;

        mockMvc.perform(multipart("/api/v1/audio/mixes")
                        .file(file)
                        .param("manifest", manifest))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error", is("Bad Request")))
                .andExpect(jsonPath("$.message", containsString("Invalid fileIndex 99")));
    }

    @Test
    @DisplayName("Crossfade duration greater than clip duration returns 400 Bad Request")
    void crossfadeGreaterThanClipDurationReturnsBadRequest() throws Exception {
        MockMultipartFile file1 = new MockMultipartFile("files", "song1.mp3", "audio/mpeg", FAKE_BYTES);
        MockMultipartFile file2 = new MockMultipartFile("files", "song2.mp3", "audio/mpeg", FAKE_BYTES);

        String manifest = """
                {
                  "crossfadeSeconds": 4.0,
                  "clips": [
                    {"fileIndex": 0, "startSeconds": 0.0, "endSeconds": 2.0},
                    {"fileIndex": 1, "startSeconds": 0.0, "endSeconds": 10.0}
                  ]
                }
                """;

        mockMvc.perform(multipart("/api/v1/audio/mixes")
                        .file(file1)
                        .file(file2)
                        .param("manifest", manifest))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error", is("Bad Request")))
                .andExpect(jsonPath("$.message", containsString("must be greater than crossfade duration")));
    }

    @Test
    @DisplayName("Video mix request with format=mp4 returns 200 OK and streams moviq_video.mp4")
    void validVideoMixStreamsMp4() throws Exception {
        Path tempDir = Files.createTempDirectory("test-video-workspace-");
        Path tempOutput = tempDir.resolve("master_mix.mp4");
        byte[] expectedContent = "mock-video-content".getBytes();
        Files.write(tempOutput, expectedContent);

        when(videoMixService.mixVideo(any(), any()))
                .thenReturn(new TrimmedAudio(tempDir, tempOutput));

        MockMultipartFile file = new MockMultipartFile("files", "clip.mp4", "video/mp4", FAKE_BYTES);

        String manifest = """
                {
                  "clips": [
                    {"fileIndex": 0, "startSeconds": 0.0, "endSeconds": 5.0}
                  ]
                }
                """;

        MvcResult mvcResult = mockMvc.perform(multipart("/api/v1/audio/mixes")
                        .file(file)
                        .param("manifest", manifest)
                        .param("format", "mp4"))
                .andExpect(request().asyncStarted())
                .andReturn();

        byte[] responseContent = mockMvc.perform(asyncDispatch(mvcResult))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "video/mp4"))
                .andExpect(header().string("Content-Disposition", "attachment; filename=\"moviq_video.mp4\""))
                .andReturn()
                .getResponse()
                .getContentAsByteArray();

        assertArrayEquals(expectedContent, responseContent);
    }
}
