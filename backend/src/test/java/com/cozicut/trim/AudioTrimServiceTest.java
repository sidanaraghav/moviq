package com.cozicut.trim;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.cozicut.media.FfmpegExecutor;
import com.cozicut.media.MediaProcessingException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

class AudioTrimServiceTest {

    @Test
    void buildsSafeFfmpegArgumentsAndCleansWorkspaceWhenClosed() throws Exception {
        RecordingExecutor executor = new RecordingExecutor(false);
        AudioTrimService service = new AudioTrimService(executor, "ffmpeg-test");

        TrimmedAudio result = service.trim(new MockMultipartFile("file", "source.wav", "audio/wav", new byte[] {1, 2}), 1.5, 3.0);

        assertEquals("ffmpeg-test", executor.command.getFirst());
        assertEquals("-ss", executor.command.get(4));
        assertEquals("1.5", executor.command.get(5));
        assertEquals("-to", executor.command.get(6));
        assertEquals("3.0", executor.command.get(7));
        Path output = result.outputFile();
        assertEquals("trim.mp3", output.getFileName().toString());
        result.close();
        assertFalse(Files.exists(output.getParent()));
    }

    @Test
    void cleansWorkspaceWhenFfmpegFails() {
        RecordingExecutor executor = new RecordingExecutor(true);
        AudioTrimService service = new AudioTrimService(executor, "ffmpeg-test");

        assertThrows(MediaProcessingException.class,
                () -> service.trim(new MockMultipartFile("file", "source.wav", "audio/wav", new byte[] {1}), 0, 1));
        assertFalse(Files.exists(executor.workingDirectory));
    }

    private static final class RecordingExecutor implements FfmpegExecutor {
        private final boolean fail;
        private List<String> command;
        private Path workingDirectory;

        RecordingExecutor(boolean fail) {
            this.fail = fail;
        }

        @Override
        public void execute(List<String> command, Path workingDirectory) {
            this.command = command;
            this.workingDirectory = workingDirectory;
            if (fail) {
                throw new MediaProcessingException("failed");
            }
            try {
                Files.writeString(Path.of(command.getLast()), "mp3");
            } catch (Exception exception) {
                throw new RuntimeException(exception);
            }
        }
    }
}
