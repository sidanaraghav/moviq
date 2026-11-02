package com.cozicut.download;

import com.cozicut.media.MediaProcessingException;
import com.cozicut.media.MediaProcessingTimeoutException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

@Service
public class MediaDownloadService {

    private final String ytdlpExecutable;
    private final String nodeExecutable;
    private final Duration timeout;
    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;

    public MediaDownloadService(
            @Value("${cozicut.ytdlp.executable:/opt/homebrew/bin/yt-dlp}") String ytdlpExecutable,
            @Value("${cozicut.node.executable:/opt/homebrew/bin/node}") String nodeExecutable,
            @Value("${cozicut.ytdlp.timeout-seconds:120}") long timeoutSeconds,
            ObjectMapper objectMapper
    ) {
        this.ytdlpExecutable = ytdlpExecutable;
        this.nodeExecutable = nodeExecutable;
        this.timeout = Duration.ofSeconds(timeoutSeconds);
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
        this.objectMapper = objectMapper;
    }

    public DownloadedMedia download(String rawUrl) {
        if (rawUrl == null || rawUrl.isBlank()) {
            throw new IllegalArgumentException("A valid media URL is required.");
        }

        String trimmedUrl = rawUrl.trim();
        if (!trimmedUrl.startsWith("http://") && !trimmedUrl.startsWith("https://")) {
            throw new IllegalArgumentException("URL must start with http:// or https://");
        }

        String targetUrl = trimmedUrl;
        String resolvedTitle = null;

        // Special handling for Spotify links via public oEmbed
        if (trimmedUrl.contains("spotify.com")) {
            resolvedTitle = fetchSpotifyTrackTitle(trimmedUrl);
            if (resolvedTitle != null && !resolvedTitle.isBlank()) {
                targetUrl = "ytsearch1:" + resolvedTitle + " audio";
            }
        }

        Path workspace = null;
        try {
            workspace = Files.createTempDirectory("cozicut-download-");
            Path outputFile = workspace.resolve("audio.mp3");

            List<String> command = new ArrayList<>();
            command.add(ytdlpExecutable);
            if (nodeExecutable != null && !nodeExecutable.isBlank() && Files.isExecutable(Path.of(nodeExecutable))) {
                command.add("--js-runtimes");
                command.add("node:" + nodeExecutable);
            }
            command.add("--no-playlist");
            command.add("--no-simulate");
            command.add("--max-filesize");
            command.add("500M");
            command.add("-x");
            command.add("--audio-format");
            command.add("mp3");
            command.add("--audio-quality");
            command.add("0");
            command.add("--print");
            command.add("title");
            command.add("-o");
            command.add("audio.%(ext)s");
            command.add(targetUrl);

            Process process = new ProcessBuilder(command)
                    .directory(workspace.toFile())
                    .redirectErrorStream(true)
                    .start();

            CompletableFuture<String> outputFuture = CompletableFuture.supplyAsync(() -> {
                try {
                    return new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
                } catch (IOException e) {
                    return "";
                }
            });

            boolean finished = process.waitFor(timeout.toMillis(), TimeUnit.MILLISECONDS);
            if (!finished) {
                process.destroyForcibly();
                process.waitFor();
                throw new MediaProcessingTimeoutException("Downloading media from the URL timed out.");
            }

            String processOutput = outputFuture.join();

            if (!Files.isRegularFile(outputFile) || Files.size(outputFile) == 0) {
                String errorDetails = summarize(processOutput);
                throw new MediaProcessingException("Could not extract audio from this link. " + errorDetails);
            }

            if (resolvedTitle == null || resolvedTitle.isBlank()) {
                // The first non-empty line of process output when using --print title is the title
                resolvedTitle = extractTitle(processOutput);
            }

            if (resolvedTitle == null || resolvedTitle.isBlank()) {
                resolvedTitle = "Imported Audio";
            }

            return new DownloadedMedia(workspace, outputFile, sanitizeFilename(resolvedTitle));
        } catch (IOException exception) {
            cleanup(workspace);
            throw new MediaProcessingException("Could not prepare download workspace.", exception);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            cleanup(workspace);
            throw new MediaProcessingException("Media download was interrupted.", exception);
        } catch (RuntimeException exception) {
            cleanup(workspace);
            throw exception;
        }
    }

    private String fetchSpotifyTrackTitle(String spotifyUrl) {
        try {
            String oembedUrl = "https://open.spotify.com/oembed?url=" + URLEncoder.encode(spotifyUrl, StandardCharsets.UTF_8);
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(oembedUrl))
                    .timeout(Duration.ofSeconds(6))
                    .header("User-Agent", "CoziCut/1.0")
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 200) {
                JsonNode json = objectMapper.readTree(response.body());
                if (json.has("title")) {
                    return json.get("title").asText();
                }
            }
        } catch (Exception ignored) {
            // Fall back to direct yt-dlp handling
        }
        return null;
    }

    private String extractTitle(String processOutput) {
        if (processOutput == null) return null;
        for (String line : processOutput.lines().toList()) {
            String trimmed = line.trim();
            if (!trimmed.isEmpty() && !trimmed.startsWith("[") && !trimmed.startsWith("ERROR") && !trimmed.startsWith("WARNING")) {
                return trimmed;
            }
        }
        return null;
    }

    private String sanitizeFilename(String name) {
        if (name == null) return "Imported Audio";
        String clean = name.replaceAll("[\\\\/:*?\"<>|]", " ").trim();
        return clean.isEmpty() ? "Imported Audio" : clean;
    }

    private String summarize(String output) {
        if (output == null || output.isBlank()) return "Please verify the link is accessible and not private.";
        for (String line : output.lines().toList()) {
            if (line.contains("ERROR:") || line.contains("Private video") || line.contains("unavailable") || line.contains("Sign in")) {
                return line.replaceAll("\\s+", " ").trim();
            }
        }
        return "Please verify the link is accessible and not private.";
    }

    private void cleanup(Path workspace) {
        if (workspace == null) return;
        try {
            new DownloadedMedia(workspace, workspace, "").close();
        } catch (IOException ignored) {}
    }
}
