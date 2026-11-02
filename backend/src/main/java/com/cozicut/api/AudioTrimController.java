package com.cozicut.api;

import com.cozicut.trim.AudioTrimService;
import com.cozicut.trim.TrimmedAudio;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.io.IOException;
import java.nio.file.Files;
import java.util.Locale;
import java.util.Set;

@RestController
@RequestMapping("/api/v1")
public class AudioTrimController {

    private static final long MAX_FILE_SIZE_BYTES = 500L * 1024 * 1024; // 500 MB
    private static final Set<String> ALLOWED_EXTENSIONS = Set.of(
            ".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".wma", ".aiff", ".opus"
    );

    private final AudioTrimService audioTrimService;

    public AudioTrimController(AudioTrimService audioTrimService) {
        this.audioTrimService = audioTrimService;
    }

    @PostMapping(value = "/audio/trims", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<StreamingResponseBody> trimAudio(
            @RequestParam(name = "file", required = false) MultipartFile file,
            @RequestParam(name = "startSeconds", required = false) Double startSeconds,
            @RequestParam(name = "endSeconds", required = false) Double endSeconds
    ) {
        validateRequest(file, startSeconds, endSeconds);

        TrimmedAudio trimmedAudio = audioTrimService.trim(file, startSeconds, endSeconds);

        StreamingResponseBody body = outputStream -> {
            try (trimmedAudio) {
                Files.copy(trimmedAudio.outputFile(), outputStream);
            } catch (IOException exception) {
                throw new IllegalStateException("Could not stream trimmed audio.", exception);
            }
        };

        ContentDisposition contentDisposition = ContentDisposition.attachment()
                .filename("trim.mp3")
                .build();

        return ResponseEntity.ok()
                .contentType(MediaType.valueOf("audio/mpeg"))
                .header(HttpHeaders.CONTENT_DISPOSITION, contentDisposition.toString())
                .body(body);
    }

    private void validateRequest(MultipartFile file, Double startSeconds, Double endSeconds) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("Audio file is required.");
        }

        if (file.getSize() > MAX_FILE_SIZE_BYTES) {
            throw new IllegalArgumentException("Audio file exceeds the 500 MB limit.");
        }

        validateAudioType(file);

        if (startSeconds == null) {
            throw new IllegalArgumentException("startSeconds is required.");
        }

        if (startSeconds < 0) {
            throw new IllegalArgumentException("startSeconds must be greater than or equal to 0.");
        }

        if (endSeconds == null) {
            throw new IllegalArgumentException("endSeconds is required.");
        }

        if (endSeconds <= startSeconds) {
            throw new IllegalArgumentException("endSeconds must be greater than startSeconds.");
        }
    }

    private void validateAudioType(MultipartFile file) {
        String contentType = file.getContentType();
        String filename = file.getOriginalFilename();

        boolean hasAudioContentType = contentType != null && contentType.toLowerCase(Locale.ROOT).startsWith("audio/");
        boolean hasAllowedExtension = false;

        if (filename != null) {
            String lower = filename.toLowerCase(Locale.ROOT);
            for (String ext : ALLOWED_EXTENSIONS) {
                if (lower.endsWith(ext)) {
                    hasAllowedExtension = true;
                    break;
                }
            }
        }

        if (!hasAudioContentType && !hasAllowedExtension) {
            throw new IllegalArgumentException("Only audio files are supported.");
        }
    }
}
