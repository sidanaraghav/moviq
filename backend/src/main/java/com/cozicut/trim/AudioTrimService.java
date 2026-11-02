package com.cozicut.trim;

import com.cozicut.media.FfmpegExecutor;
import com.cozicut.media.MediaProcessingException;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
public class AudioTrimService {

    private final FfmpegExecutor ffmpegExecutor;
    private final String ffmpegExecutable;

    public AudioTrimService(FfmpegExecutor ffmpegExecutor,
                            @Value("${cozicut.ffmpeg.executable:ffmpeg}") String ffmpegExecutable) {
        this.ffmpegExecutor = ffmpegExecutor;
        this.ffmpegExecutable = ffmpegExecutable;
    }

    public TrimmedAudio trim(MultipartFile upload, double startSeconds, double endSeconds) {
        Path workspace = null;
        try {
            workspace = Files.createTempDirectory("cozicut-trim-");
            Path input = workspace.resolve("input");
            Path output = workspace.resolve("trim.mp3");
            try (var inputStream = upload.getInputStream()) {
                Files.copy(inputStream, input, StandardCopyOption.REPLACE_EXISTING);
            }

            List<String> command = List.of(
                    ffmpegExecutable, "-y", "-i", input.toString(), "-ss", Double.toString(startSeconds),
                    "-to", Double.toString(endSeconds), "-vn", "-codec:a", "libmp3lame", output.toString());
            ffmpegExecutor.execute(command, workspace);

            if (!Files.isRegularFile(output) || Files.size(output) == 0) {
                throw new MediaProcessingException("FFmpeg completed without creating an MP3 output.");
            }
            return new TrimmedAudio(workspace, output);
        } catch (IOException exception) {
            cleanup(workspace);
            throw new MediaProcessingException("Could not prepare the audio workspace.", exception);
        } catch (RuntimeException exception) {
            cleanup(workspace);
            throw exception;
        }
    }

    private void cleanup(Path workspace) {
        if (workspace == null) {
            return;
        }
        try {
            new TrimmedAudio(workspace, workspace).close();
        } catch (IOException ignored) {
            // A best-effort cleanup failure must not hide the processing failure.
        }
    }
}
