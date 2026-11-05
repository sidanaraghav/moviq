package com.cozicut.api;

import com.cozicut.download.DownloadedMedia;
import com.cozicut.download.MediaDownloadService;
import com.cozicut.media.WaveformExtractorService;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/media")
@CrossOrigin(
        origins = "*",
        exposedHeaders = {
                HttpHeaders.CONTENT_DISPOSITION,
                "X-Media-Title",
                "X-Media-Is-Video",
                "X-Media-Peaks"
        }
)
public class MediaImportController {

    private final MediaDownloadService downloadService;
    private final WaveformExtractorService waveformExtractorService;

    public MediaImportController(
            MediaDownloadService downloadService,
            WaveformExtractorService waveformExtractorService
    ) {
        this.downloadService = downloadService;
        this.waveformExtractorService = waveformExtractorService;
    }

    @PostMapping(value = "/import-url", consumes = {MediaType.APPLICATION_JSON_VALUE, MediaType.ALL_VALUE})
    public ResponseEntity<StreamingResponseBody> importUrl(
            @RequestBody(required = false) ImportUrlRequest body,
            @RequestParam(name = "url", required = false) String queryUrl
    ) {
        String url = body != null && body.url() != null ? body.url() : queryUrl;
        if (url == null || url.isBlank()) {
            throw new IllegalArgumentException("URL parameter is required.");
        }

        DownloadedMedia downloaded = downloadService.download(url);

        String title = downloaded.title();
        boolean isVideo = downloaded.isVideo();
        String extension = isVideo ? ".mp4" : ".mp3";
        String safeFilename = title.replaceAll("[^a-zA-Z0-9._ -]", "_") + extension;

        ContentDisposition contentDisposition = ContentDisposition.attachment()
                .filename(safeFilename, StandardCharsets.UTF_8)
                .build();

        StreamingResponseBody responseBody = outputStream -> {
            try (downloaded) {
                Files.copy(downloaded.outputFile(), outputStream);
            } catch (IOException exception) {
                throw new IllegalStateException("Could not stream imported media.", exception);
            }
        };

        var responseBuilder = ResponseEntity.ok()
                .contentType(MediaType.valueOf(downloaded.contentType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, contentDisposition.toString())
                .header("X-Media-Title", URLEncoder.encode(title, StandardCharsets.UTF_8))
                .header("X-Media-Is-Video", String.valueOf(isVideo));

        if (downloaded.peaks() != null && !downloaded.peaks().isBlank()) {
            responseBuilder.header("X-Media-Peaks", downloaded.peaks());
        }

        return responseBuilder.body(responseBody);
    }

    @PostMapping(value = "/peaks", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Map<String, Object>> extractPeaks(
            @RequestParam("file") MultipartFile file
    ) {
        if (file.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "File is required."));
        }

        Path tempFile = null;
        try {
            tempFile = Files.createTempFile("moviq-peak-upload-", ".tmp");
            file.transferTo(tempFile);

            List<Integer> peaks = waveformExtractorService.extractPeaks(tempFile, 400);
            return ResponseEntity.ok(Map.of(
                    "peaks", peaks,
                    "count", peaks.size()
            ));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", "Could not extract peaks"));
        } finally {
            if (tempFile != null) {
                try {
                    Files.deleteIfExists(tempFile);
                } catch (IOException ignored) {
                }
            }
        }
    }
}
