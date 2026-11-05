package com.cozicut.api;

import com.cozicut.download.DownloadedMedia;
import com.cozicut.download.MediaDownloadService;
import com.cozicut.media.MediaProcessingException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.is;
import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(MediaImportController.class)
class MediaImportControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private MediaDownloadService downloadService;

    @MockitoBean
    private com.cozicut.media.WaveformExtractorService waveformExtractorService;

    @Test
    @DisplayName("Valid URL import request returns 200 OK, audio/mpeg header, X-Media-Title and streams MP3")
    void validUrlImportReturnsOkAndStreamsAudio() throws Exception {
        Path tempDir = Files.createTempDirectory("test-download-workspace-");
        Path tempMp3 = tempDir.resolve("audio.mp3");
        byte[] expectedContent = "mock-streamed-audio".getBytes();
        Files.write(tempMp3, expectedContent);

        when(downloadService.download("https://www.youtube.com/watch?v=sample"))
                .thenReturn(new DownloadedMedia(tempDir, tempMp3, "Sample Track Title"));

        MvcResult result = mockMvc.perform(post("/api/v1/media/import-url")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"url\": \"https://www.youtube.com/watch?v=sample\"}"))
                .andExpect(request().asyncStarted())
                .andReturn();

        mockMvc.perform(asyncDispatch(result))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", is("audio/mpeg")))
                .andExpect(header().string("Content-Disposition", containsString("Sample Track Title.mp3")))
                .andExpect(header().exists("X-Media-Title"));

        assertArrayEquals(expectedContent, result.getResponse().getContentAsByteArray());
    }

    @Test
    @DisplayName("Valid video URL import request returns 200 OK, video/mp4 header, X-Media-Is-Video: true and streams MP4")
    void validVideoUrlImportReturnsOkAndStreamsVideo() throws Exception {
        Path tempDir = Files.createTempDirectory("test-download-video-");
        Path tempMp4 = tempDir.resolve("video.mp4");
        byte[] expectedContent = "mock-streamed-video".getBytes();
        Files.write(tempMp4, expectedContent);

        when(downloadService.download("https://www.youtube.com/watch?v=sample-video"))
                .thenReturn(new DownloadedMedia(tempDir, tempMp4, "Sample Video Title", "video/mp4", true));

        MvcResult result = mockMvc.perform(post("/api/v1/media/import-url")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"url\": \"https://www.youtube.com/watch?v=sample-video\"}"))
                .andExpect(request().asyncStarted())
                .andReturn();

        mockMvc.perform(asyncDispatch(result))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", is("video/mp4")))
                .andExpect(header().string("Content-Disposition", containsString("Sample Video Title.mp4")))
                .andExpect(header().string("X-Media-Is-Video", is("true")))
                .andExpect(header().exists("X-Media-Title"));

        assertArrayEquals(expectedContent, result.getResponse().getContentAsByteArray());
    }

    @Test
    @DisplayName("Empty URL returns 400 Bad Request")
    void emptyUrlReturnsBadRequest() throws Exception {
        mockMvc.perform(post("/api/v1/media/import-url")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"url\": \"\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", containsString("URL parameter is required")));
    }

    @Test
    @DisplayName("Processing failure from downloader returns 422 Unprocessable Entity")
    void downloadFailureReturnsUnprocessableEntity() throws Exception {
        when(downloadService.download(anyString()))
                .thenThrow(new MediaProcessingException("Could not extract audio from this link."));

        mockMvc.perform(post("/api/v1/media/import-url")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"url\": \"https://www.instagram.com/reel/invalid\"}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.message", containsString("The supplied audio could not be processed")));
    }
}
