package com.cozicut.media;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class ProcessFfmpegExecutor implements FfmpegExecutor {

    private final Duration timeout;

    public ProcessFfmpegExecutor(@Value("${cozicut.ffmpeg.timeout-seconds:60}") long timeoutSeconds) {
        this.timeout = Duration.ofSeconds(timeoutSeconds);
    }

    @Override
    public void execute(List<String> command, Path workingDirectory) {
        try {
            Process process = new ProcessBuilder(command)
                    .directory(workingDirectory.toFile())
                    .redirectErrorStream(true)
                    .start();
            CompletableFuture<String> diagnostics = CompletableFuture.supplyAsync(() -> readDiagnostics(process));

            boolean completed = process.waitFor(timeout.toMillis(), TimeUnit.MILLISECONDS);
            if (!completed) {
                process.destroyForcibly();
                process.waitFor();
                throw new MediaProcessingTimeoutException("Audio processing timed out.");
            }

            String output = diagnostics.join();
            if (process.exitValue() != 0) {
                throw new MediaProcessingException("FFmpeg could not process the supplied audio. " + summarize(output));
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new MediaProcessingException("Audio processing was interrupted.", exception);
        } catch (IOException exception) {
            throw new MediaProcessingException("Could not start FFmpeg.", exception);
        }
    }

    private String readDiagnostics(Process process) {
        try {
            return new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException exception) {
            return "Unable to read FFmpeg diagnostics.";
        }
    }

    private String summarize(String diagnostics) {
        String normalized = diagnostics.replaceAll("\\s+", " ").trim();
        return normalized.isEmpty() ? "No diagnostics were produced." : normalized.substring(0, Math.min(500, normalized.length()));
    }
}
