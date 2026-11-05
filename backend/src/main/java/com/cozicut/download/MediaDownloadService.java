package com.cozicut.download;

import com.cozicut.media.MediaProcessingException;
import com.cozicut.media.MediaProcessingTimeoutException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.DirectoryStream;
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
    private final String ffmpegExecutable;
    private final String ffprobeExecutable;
    private final Duration timeout;
    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;
    private final com.cozicut.media.WaveformExtractorService waveformExtractorService;

    public MediaDownloadService(
            @Value("${cozicut.ytdlp.executable:/opt/homebrew/bin/yt-dlp}") String ytdlpExecutable,
            @Value("${cozicut.node.executable:/opt/homebrew/bin/node}") String nodeExecutable,
            @Value("${cozicut.ffmpeg.executable:/opt/homebrew/bin/ffmpeg}") String ffmpegExecutable,
            @Value("${cozicut.ffprobe.executable:/opt/homebrew/bin/ffprobe}") String ffprobeExecutable,
            @Value("${cozicut.ytdlp.timeout-seconds:120}") long timeoutSeconds,
            ObjectMapper objectMapper,
            com.cozicut.media.WaveformExtractorService waveformExtractorService
    ) {
        this.ytdlpExecutable = ytdlpExecutable;
        this.nodeExecutable = nodeExecutable;
        this.ffmpegExecutable = ffmpegExecutable;
        this.ffprobeExecutable = ffprobeExecutable;
        this.timeout = Duration.ofSeconds(timeoutSeconds);
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
        this.objectMapper = objectMapper;
        this.waveformExtractorService = waveformExtractorService;
    }

    public DownloadedMedia download(String rawUrl) {
        if (rawUrl == null || rawUrl.isBlank()) {
            throw new IllegalArgumentException("A valid media URL is required.");
        }

        String trimmedUrl = rawUrl.trim();
        if (!trimmedUrl.startsWith("http://") && !trimmedUrl.startsWith("https://")) {
            throw new IllegalArgumentException("URL must start with http:// or https://");
        }

        boolean isSpotify = trimmedUrl.contains("spotify.com");
        String targetUrl = trimmedUrl;
        String resolvedTitle = null;

        if (isSpotify) {
            resolvedTitle = fetchSpotifyTrackTitle(trimmedUrl);
            if (resolvedTitle != null && !resolvedTitle.isBlank()) {
                targetUrl = "ytsearch1:" + resolvedTitle + " audio";
            }
        }

        Path workspace = null;
        try {
            workspace = Files.createTempDirectory("cozicut-download-");

            if (isSpotify) {
                // Spotify is inherently an audio song - extract as MP3 directly
                Path outputFile = workspace.resolve("audio.mp3");
                List<String> command = buildAudioExtractionCommand(targetUrl, outputFile);
                String processOutput = runProcess(command, workspace);

                if (!Files.isRegularFile(outputFile) || Files.size(outputFile) == 0) {
                    throw new MediaProcessingException("Could not extract audio for this Spotify track. " + summarize(processOutput));
                }

                if (resolvedTitle == null || resolvedTitle.isBlank()) {
                    resolvedTitle = extractTitle(processOutput);
                }
                if (resolvedTitle == null || resolvedTitle.isBlank()) {
                    resolvedTitle = "Spotify Track";
                }

                String peaks = waveformExtractorService.extractPeaksAsString(outputFile, 400);
                return new DownloadedMedia(workspace, outputFile, sanitizeFilename(resolvedTitle), "audio/mpeg", false, peaks);
            }

            // For general URLs: preserve video if present (MP4), or keep as audio (MP3) if audio-only
            List<String> command = buildVideoOrAudioCommand(targetUrl);
            String processOutput = runProcess(command, workspace);

            Path downloadedRaw = findDownloadedFile(workspace);

            // If video format selection failed, fall back to audio extraction
            if (downloadedRaw == null) {
                Path fallbackAudio = workspace.resolve("audio.mp3");
                List<String> fallbackCmd = buildAudioExtractionCommand(targetUrl, fallbackAudio);
                processOutput = runProcess(fallbackCmd, workspace);
                downloadedRaw = findDownloadedFile(workspace);
            }

            if (downloadedRaw == null || !Files.isRegularFile(downloadedRaw) || Files.size(downloadedRaw) == 0) {
                String errorDetails = summarize(processOutput);
                throw new MediaProcessingException("Could not download media from this link. " + errorDetails);
            }

            if (resolvedTitle == null || resolvedTitle.isBlank()) {
                resolvedTitle = extractTitle(processOutput);
            }
            if (resolvedTitle == null || resolvedTitle.isBlank()) {
                resolvedTitle = "Imported Media";
            }

            // Check if downloaded file has a real video stream
            boolean hasVideo = detectHasVideo(downloadedRaw);

            if (hasVideo) {
                // Ensure standardized MP4 container with H.264 video
                Path finalMp4 = workspace.resolve("media_final.mp4");
                if (downloadedRaw.getFileName().toString().toLowerCase().endsWith(".mp4")) {
                    finalMp4 = downloadedRaw;
                } else {
                    remuxToMp4(downloadedRaw, finalMp4);
                }
                String peaks = waveformExtractorService.extractPeaksAsString(finalMp4, 400);
                return new DownloadedMedia(workspace, finalMp4, sanitizeFilename(resolvedTitle), "video/mp4", true, peaks);
            } else {
                // Audio-only media (e.g. SoundCloud, podcast, audio stream) - ensure MP3
                Path finalMp3 = workspace.resolve("audio_final.mp3");
                if (downloadedRaw.getFileName().toString().toLowerCase().endsWith(".mp3")) {
                    finalMp3 = downloadedRaw;
                } else {
                    convertToMp3(downloadedRaw, finalMp3);
                }
                String peaks = waveformExtractorService.extractPeaksAsString(finalMp3, 400);
                return new DownloadedMedia(workspace, finalMp3, sanitizeFilename(resolvedTitle), "audio/mpeg", false, peaks);
            }

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

    private List<String> buildVideoOrAudioCommand(String targetUrl) {
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
        command.add("--format");
        command.add("bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/bestvideo[height<=720]+bestaudio/best[height<=720]/best/bestaudio/best");
        command.add("--merge-output-format");
        command.add("mp4");
        command.add("--print");
        command.add("title");
        command.add("-o");
        command.add("media.%(ext)s");
        command.add(targetUrl);
        return command;
    }

    private List<String> buildAudioExtractionCommand(String targetUrl, Path outputFile) {
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
        command.add(outputFile.getFileName().toString());
        command.add(targetUrl);
        return command;
    }

    private String runProcess(List<String> command, Path workspace) throws IOException, InterruptedException {
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

        return outputFuture.join();
    }

    private Path findDownloadedFile(Path workspace) throws IOException {
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(workspace)) {
            for (Path path : stream) {
                String name = path.getFileName().toString().toLowerCase();
                if (Files.isRegularFile(path) && Files.size(path) > 0 && !name.endsWith(".part") && !name.endsWith(".ytdl")) {
                    return path;
                }
            }
        }
        return null;
    }

    private boolean detectHasVideo(Path file) {
        try {
            ProcessBuilder pb = new ProcessBuilder(
                    ffprobeExecutable,
                    "-v", "error",
                    "-select_streams", "v:0",
                    "-show_entries", "stream=codec_type:stream_disposition=attached_pic",
                    "-of", "csv=p=0",
                    file.toAbsolutePath().toString()
            );
            pb.redirectErrorStream(true);
            Process process = pb.start();

            StringBuilder output = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    output.append(line.trim()).append("\n");
                }
            }

            boolean completed = process.waitFor(5, TimeUnit.SECONDS);
            if (completed && process.exitValue() == 0) {
                String result = output.toString().trim();
                if (result.startsWith("video,0") || (result.startsWith("video") && !result.contains("1"))) {
                    return true;
                }
                if (result.isEmpty()) {
                    return false;
                }
            }
        } catch (Exception ignored) {
        }
        String name = file.getFileName().toString().toLowerCase();
        return name.endsWith(".mp4") || name.endsWith(".mov") || name.endsWith(".webm") || name.endsWith(".mkv");
    }

    private void remuxToMp4(Path input, Path output) {
        try {
            Process process = new ProcessBuilder(
                    ffmpegExecutable, "-y",
                    "-i", input.toAbsolutePath().toString(),
                    "-c:v", "libx264",
                    "-pix_fmt", "yuv420p",
                    "-c:a", "aac",
                    "-b:a", "192k",
                    output.toAbsolutePath().toString()
            ).redirectErrorStream(true).start();
            process.waitFor(60, TimeUnit.SECONDS);
        } catch (Exception ignored) {
        }
    }

    private void convertToMp3(Path input, Path output) {
        try {
            Process process = new ProcessBuilder(
                    ffmpegExecutable, "-y",
                    "-i", input.toAbsolutePath().toString(),
                    "-codec:a", "libmp3lame",
                    "-q:a", "0",
                    output.toAbsolutePath().toString()
            ).redirectErrorStream(true).start();
            process.waitFor(60, TimeUnit.SECONDS);
        } catch (Exception ignored) {
        }
    }

    private String fetchSpotifyTrackTitle(String spotifyUrl) {
        try {
            String oembedUrl = "https://open.spotify.com/oembed?url=" + URLEncoder.encode(spotifyUrl, StandardCharsets.UTF_8);
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(oembedUrl))
                    .timeout(Duration.ofSeconds(6))
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
        }
        return null;
    }

    private String extractTitle(String processOutput) {
        if (processOutput == null || processOutput.isBlank()) {
            return null;
        }
        for (String line : processOutput.lines().toList()) {
            String trimmed = line.trim();
            if (!trimmed.isBlank() && !trimmed.startsWith("[") && !trimmed.startsWith("WARNING") && !trimmed.startsWith("ERROR")) {
                return trimmed;
            }
        }
        return null;
    }

    private String sanitizeFilename(String filename) {
        return filename.replaceAll("[^a-zA-Z0-9._ -]", "_").trim();
    }

    private String summarize(String processOutput) {
        if (processOutput == null || processOutput.isBlank()) {
            return "No output from downloader.";
        }
        String lastLine = processOutput.trim().substring(Math.max(0, processOutput.trim().lastIndexOf('\n'))).trim();
        return lastLine.length() > 200 ? lastLine.substring(0, 200) + "..." : lastLine;
    }

    private void cleanup(Path workspace) {
        if (workspace == null) {
            return;
        }
        try (DownloadedMedia dummy = new DownloadedMedia(workspace, workspace, "dummy")) {
            // Triggers close logic to clean dir
        } catch (Exception ignored) {
        }
    }
}
