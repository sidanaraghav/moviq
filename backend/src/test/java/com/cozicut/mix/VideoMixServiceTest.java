package com.cozicut.mix;

import com.cozicut.media.FfmpegExecutor;
import com.cozicut.trim.TrimmedAudio;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mock.web.MockMultipartFile;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class VideoMixServiceTest {

    @Test
    @DisplayName("Mixes audio and video clips into combined master_mix.mp4")
    void mixesAudioAndVideoClips() throws Exception {
        FfmpegExecutor ffmpegExecutor = mock(FfmpegExecutor.class);
        TitleCardRenderer titleCardRenderer = new TitleCardRenderer();

        // Simulate ffmpeg creating output files
        doAnswer(invocation -> {
            List<String> command = invocation.getArgument(0);
            Path workspace = invocation.getArgument(1);
            String lastArg = command.getLast();
            Path outputFile = workspace.resolve(lastArg.substring(lastArg.lastIndexOf('/') + 1));
            if (!Files.exists(outputFile)) {
                Files.write(outputFile, "simulated-video-output".getBytes());
            }
            return null;
        }).when(ffmpegExecutor).execute(any(), any());

        VideoMixService videoMixService = new VideoMixService(
                ffmpegExecutor,
                titleCardRenderer,
                "ffmpeg",
                "ffprobe"
        );

        MockMultipartFile audioFile = new MockMultipartFile("files", "track.mp3", "audio/mpeg", new byte[]{1, 2, 3});
        MockMultipartFile videoFile = new MockMultipartFile("files", "clip.mp4", "video/mp4", new byte[]{4, 5, 6});

        MixRequest request = new MixRequest(
                List.of(
                        new ClipSpec(0, 0.0, 10.0),
                        new ClipSpec(1, 5.0, 15.0)
                ),
                0.0,
                false
        );

        TrimmedAudio result = videoMixService.mixVideo(List.of(audioFile, videoFile), request);

        try (result) {
            assertNotNull(result);
            assertTrue(Files.isRegularFile(result.outputFile()));
            assertEquals("master_mix.mp4", result.outputFile().getFileName().toString());
            verify(ffmpegExecutor, atLeastOnce()).execute(any(), any());
        }
    }
}
