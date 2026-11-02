package com.cozicut.api;

import com.cozicut.media.MediaProcessingException;
import com.cozicut.media.MediaProcessingTimeoutException;
import com.cozicut.trim.AudioTrimService;
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
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(AudioTrimController.class)
class AudioTrimControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private AudioTrimService audioTrimService;

    private static final byte[] FAKE_AUDIO_BYTES = new byte[]{1, 2, 3, 4};

    @Test
    @DisplayName("Valid trim request returns 200 OK, audio/mpeg header, and streams MP3")
    void validRequestReturnsOkAndStreamsMp3() throws Exception {
        Path tempDir = Files.createTempDirectory("test-workspace-");
        Path tempMp3 = tempDir.resolve("trim.mp3");
        byte[] expectedContent = "mock-mp3-content".getBytes();
        Files.write(tempMp3, expectedContent);

        when(audioTrimService.trim(any(), anyDouble(), anyDouble()))
                .thenReturn(new TrimmedAudio(tempDir, tempMp3));

        MockMultipartFile file = new MockMultipartFile(
                "file",
                "sample.mp3",
                "audio/mpeg",
                FAKE_AUDIO_BYTES
        );

        MvcResult mvcResult = mockMvc.perform(multipart("/api/v1/audio/trims")
                        .file(file)
                        .param("startSeconds", "10.0")
                        .param("endSeconds", "25.5"))
                .andExpect(status().isOk())
                .andExpect(request().asyncStarted())
                .andExpect(header().string("Content-Type", "audio/mpeg"))
                .andExpect(header().string("Content-Disposition", "attachment; filename=\"trim.mp3\""))
                .andReturn();

        mockMvc.perform(asyncDispatch(mvcResult))
                .andExpect(status().isOk());

        assertArrayEquals(expectedContent, mvcResult.getResponse().getContentAsByteArray());
    }

    @Test
    @DisplayName("Missing file returns 400 Bad Request")
    void missingFileReturnsBadRequest() throws Exception {
        mockMvc.perform(multipart("/api/v1/audio/trims")
                        .param("startSeconds", "10.0")
                        .param("endSeconds", "25.0"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error", is("Bad Request")))
                .andExpect(jsonPath("$.message", containsString("Audio file is required")));
    }

    @Test
    @DisplayName("Empty file returns 400 Bad Request")
    void emptyFileReturnsBadRequest() throws Exception {
        MockMultipartFile emptyFile = new MockMultipartFile(
                "file",
                "empty.mp3",
                "audio/mpeg",
                new byte[0]
        );

        mockMvc.perform(multipart("/api/v1/audio/trims")
                        .file(emptyFile)
                        .param("startSeconds", "10.0")
                        .param("endSeconds", "25.0"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error", is("Bad Request")))
                .andExpect(jsonPath("$.message", containsString("Audio file is required")));
    }

    @Test
    @DisplayName("Missing startSeconds returns 400 Bad Request")
    void missingStartSecondsReturnsBadRequest() throws Exception {
        MockMultipartFile file = new MockMultipartFile(
                "file",
                "sample.mp3",
                "audio/mpeg",
                FAKE_AUDIO_BYTES
        );

        mockMvc.perform(multipart("/api/v1/audio/trims")
                        .file(file)
                        .param("endSeconds", "25.0"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error", is("Bad Request")))
                .andExpect(jsonPath("$.message", containsString("startSeconds is required")));
    }

    @Test
    @DisplayName("Negative startSeconds returns 400 Bad Request")
    void negativeStartSecondsReturnsBadRequest() throws Exception {
        MockMultipartFile file = new MockMultipartFile(
                "file",
                "sample.mp3",
                "audio/mpeg",
                FAKE_AUDIO_BYTES
        );

        mockMvc.perform(multipart("/api/v1/audio/trims")
                        .file(file)
                        .param("startSeconds", "-1.0")
                        .param("endSeconds", "25.0"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error", is("Bad Request")))
                .andExpect(jsonPath("$.message", containsString("startSeconds must be greater than or equal to 0")));
    }

    @Test
    @DisplayName("Missing endSeconds returns 400 Bad Request")
    void missingEndSecondsReturnsBadRequest() throws Exception {
        MockMultipartFile file = new MockMultipartFile(
                "file",
                "sample.mp3",
                "audio/mpeg",
                FAKE_AUDIO_BYTES
        );

        mockMvc.perform(multipart("/api/v1/audio/trims")
                        .file(file)
                        .param("startSeconds", "10.0"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error", is("Bad Request")))
                .andExpect(jsonPath("$.message", containsString("endSeconds is required")));
    }

    @Test
    @DisplayName("endSeconds equal to startSeconds returns 400 Bad Request")
    void endSecondsEqualToStartSecondsReturnsBadRequest() throws Exception {
        MockMultipartFile file = new MockMultipartFile(
                "file",
                "sample.mp3",
                "audio/mpeg",
                FAKE_AUDIO_BYTES
        );

        mockMvc.perform(multipart("/api/v1/audio/trims")
                        .file(file)
                        .param("startSeconds", "15.0")
                        .param("endSeconds", "15.0"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error", is("Bad Request")))
                .andExpect(jsonPath("$.message", containsString("endSeconds must be greater than startSeconds")));
    }

    @Test
    @DisplayName("endSeconds less than startSeconds returns 400 Bad Request")
    void endSecondsLessThanStartSecondsReturnsBadRequest() throws Exception {
        MockMultipartFile file = new MockMultipartFile(
                "file",
                "sample.mp3",
                "audio/mpeg",
                FAKE_AUDIO_BYTES
        );

        mockMvc.perform(multipart("/api/v1/audio/trims")
                        .file(file)
                        .param("startSeconds", "20.0")
                        .param("endSeconds", "10.0"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error", is("Bad Request")))
                .andExpect(jsonPath("$.message", containsString("endSeconds must be greater than startSeconds")));
    }

    @Test
    @DisplayName("Non-audio file returns 400 Bad Request")
    void nonAudioFileReturnsBadRequest() throws Exception {
        MockMultipartFile textFile = new MockMultipartFile(
                "file",
                "notes.txt",
                "text/plain",
                "some text".getBytes()
        );

        mockMvc.perform(multipart("/api/v1/audio/trims")
                        .file(textFile)
                        .param("startSeconds", "0.0")
                        .param("endSeconds", "10.0"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error", is("Bad Request")))
                .andExpect(jsonPath("$.message", containsString("Only audio files are supported")));
    }

    @Test
    @DisplayName("MediaProcessingException translates to 422 Unprocessable Content")
    void mediaProcessingExceptionReturns422() throws Exception {
        when(audioTrimService.trim(any(), anyDouble(), anyDouble()))
                .thenThrow(new MediaProcessingException("Failed to decode"));

        MockMultipartFile file = new MockMultipartFile(
                "file",
                "corrupted.mp3",
                "audio/mpeg",
                FAKE_AUDIO_BYTES
        );

        mockMvc.perform(multipart("/api/v1/audio/trims")
                        .file(file)
                        .param("startSeconds", "0.0")
                        .param("endSeconds", "5.0"))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.error", is("Unprocessable Content")))
                .andExpect(jsonPath("$.message", containsString("The supplied audio could not be processed")));
    }

    @Test
    @DisplayName("MediaProcessingTimeoutException translates to 500 Internal Server Error")
    void timeoutExceptionReturns500() throws Exception {
        when(audioTrimService.trim(any(), anyDouble(), anyDouble()))
                .thenThrow(new MediaProcessingTimeoutException("Timeout"));

        MockMultipartFile file = new MockMultipartFile(
                "file",
                "long.mp3",
                "audio/mpeg",
                FAKE_AUDIO_BYTES
        );

        mockMvc.perform(multipart("/api/v1/audio/trims")
                        .file(file)
                        .param("startSeconds", "0.0")
                        .param("endSeconds", "5.0"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.error", is("Internal Server Error")))
                .andExpect(jsonPath("$.message", containsString("Audio processing timed out")));
    }
}
