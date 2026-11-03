package com.cozicut.api;

import com.cozicut.download.DownloadedMedia;
import com.cozicut.download.MediaDownloadService;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

@RestController
@RequestMapping("/api/v1/media")
@CrossOrigin(
        origins = "*",
        exposedHeaders = {
                HttpHeaders.CONTENT_DISPOSITION,
                "X-Media-Title",
                "X-Media-Is-Video"
        }
)
public class MediaImportController {

    private final MediaDownloadService downloadService;

    public MediaImportController(MediaDownloadService downloadService) {
        this.downloadService = downloadService;
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

        return ResponseEntity.ok()
                .contentType(MediaType.valueOf(downloaded.contentType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, contentDisposition.toString())
                .header("X-Media-Title", URLEncoder.encode(title, StandardCharsets.UTF_8))
                .header("X-Media-Is-Video", String.valueOf(isVideo))
                .body(responseBody);
    }
}
