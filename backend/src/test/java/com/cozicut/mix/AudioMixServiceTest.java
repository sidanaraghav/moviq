package com.cozicut.mix;

import com.cozicut.media.FfmpegExecutor;
import com.cozicut.media.MediaProcessingException;
import com.cozicut.trim.TrimmedAudio;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AudioMixServiceTest {

    @Test
    @DisplayName("Builds clean-cut concat arguments by default (0s crossfade)")
    void buildsCleanCutConcatCommand() throws Exception {
        RecordingExecutor executor = new RecordingExecutor();
        AudioMixService service = new AudioMixService(executor, "ffmpeg");

        MockMultipartFile file1 = new MockMultipartFile("files", "song1.mp3", "audio/mpeg", new byte[]{1, 2});
        MockMultipartFile file2 = new MockMultipartFile("files", "video1.mp4", "video/mp4", new byte[]{3, 4});

        MixRequest request = new MixRequest(
                List.of(
                        new ClipSpec(0, 10.0, 20.0),
                        new ClipSpec(1, 5.0, 15.0)
                ),
                0.0,
                false
        );

        TrimmedAudio result = service.mix(List.of(file1, file2), request);

        // 2 trim executions + 1 stitch execution = 3 calls
        assertEquals(3, executor.commands.size());

        List<String> stitchCommand = executor.commands.get(2);
        assertTrue(stitchCommand.contains("-filter_complex"));
        int filterIndex = stitchCommand.indexOf("-filter_complex");
        assertEquals("[0:a][1:a]concat=n=2:v=0:a=1[outa]", stitchCommand.get(filterIndex + 1));
        assertTrue(stitchCommand.contains("-map"));
        assertTrue(stitchCommand.contains("[outa]"));

        result.close();
        assertFalse(Files.exists(result.outputFile().getParent()));
    }

    @Test
    @DisplayName("Builds acrossfade and loudnorm command when crossfade > 0 and normalizeVolume is true")
    void buildsCrossfadeAndLoudnormCommand() throws Exception {
        RecordingExecutor executor = new RecordingExecutor();
        AudioMixService service = new AudioMixService(executor, "ffmpeg");

        MockMultipartFile file1 = new MockMultipartFile("files", "song1.mp3", "audio/mpeg", new byte[]{1});
        MockMultipartFile file2 = new MockMultipartFile("files", "song2.wav", "audio/wav", new byte[]{2});

        MixRequest request = new MixRequest(
                List.of(
                        new ClipSpec(0, 0.0, 10.0),
                        new ClipSpec(1, 0.0, 10.0)
                ),
                2.0,
                true
        );

        TrimmedAudio result = service.mix(List.of(file1, file2), request);

        List<String> stitchCommand = executor.commands.get(2);
        int filterIndex = stitchCommand.indexOf("-filter_complex");
        String filterGraph = stitchCommand.get(filterIndex + 1);

        assertTrue(filterGraph.contains("acrossfade=d=2.0:c1=qsin:c2=qsin"));
        assertTrue(filterGraph.contains("loudnorm[outa]"));

        result.close();
        assertFalse(Files.exists(result.outputFile().getParent()));
    }

    @Test
    @DisplayName("Cleans workspace when FFmpeg throws MediaProcessingException")
    void cleansWorkspaceOnProcessingFailure() {
        FailingExecutor executor = new FailingExecutor();
        AudioMixService service = new AudioMixService(executor, "ffmpeg");

        MockMultipartFile file = new MockMultipartFile("files", "song.mp3", "audio/mpeg", new byte[]{1});
        MixRequest request = new MixRequest(List.of(new ClipSpec(0, 0.0, 5.0)), 0.0, false);

        assertThrows(MediaProcessingException.class, () -> service.mix(List.of(file), request));
        assertFalse(Files.exists(executor.capturedWorkspace));
    }

    private static final class RecordingExecutor implements FfmpegExecutor {
        private final List<List<String>> commands = new ArrayList<>();

        @Override
        public void execute(List<String> command, Path workingDirectory) {
            commands.add(command);
            try {
                // Mock creating the output file (last parameter)
                Path outputPath = Path.of(command.getLast());
                if (!outputPath.isAbsolute()) {
                    outputPath = workingDirectory.resolve(outputPath);
                }
                Files.write(outputPath, new byte[]{1, 2, 3});
            } catch (Exception exception) {
                throw new RuntimeException(exception);
            }
        }
    }

    private static final class FailingExecutor implements FfmpegExecutor {
        private Path capturedWorkspace;

        @Override
        public void execute(List<String> command, Path workingDirectory) {
            this.capturedWorkspace = workingDirectory;
            throw new MediaProcessingException("Simulated FFmpeg failure");
        }
    }
}
