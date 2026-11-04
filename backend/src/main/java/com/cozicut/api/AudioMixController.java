package com.cozicut.api;

import com.cozicut.mix.AudioMixService;
import com.cozicut.mix.ClipSpec;
import com.cozicut.mix.MixManifest;
import com.cozicut.mix.MixRequest;
import com.cozicut.mix.VideoMixService;
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
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

@RestController
@RequestMapping("/api/v1")
public class AudioMixController {

    private static final long MAX_FILE_SIZE_BYTES = 500L * 1024 * 1024; // 500 MB per file
    private static final Set<String> ALLOWED_EXTENSIONS = Set.of(
            // Audio formats
            ".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".opus", ".wma", ".aiff", ".weba",
            // Video formats (audio is extracted)
            ".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v", ".3gp", ".flv", ".wmv"
    );

    private final AudioMixService audioMixService;
    private final VideoMixService videoMixService;
    private final String videoExportFilename;
    private final String audioExportFilename;
    private final ObjectMapper objectMapper;

    public AudioMixController(
            AudioMixService audioMixService,
            VideoMixService videoMixService,
            @org.springframework.beans.factory.annotation.Value("${app.brand.video-export-filename:moviq_video.mp4}") String videoExportFilename,
            @org.springframework.beans.factory.annotation.Value("${app.brand.audio-export-filename:moviq_audio.mp3}") String audioExportFilename
    ) {
        this.audioMixService = audioMixService;
        this.videoMixService = videoMixService;
        this.videoExportFilename = videoExportFilename;
        this.audioExportFilename = audioExportFilename;
        this.objectMapper = new ObjectMapper();
    }

    @PostMapping(value = "/audio/mixes", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<StreamingResponseBody> createMix(
            @RequestParam(name = "files", required = false) List<MultipartFile> files,
            @RequestParam(name = "manifest", required = false) String manifestJson,
            @RequestParam(name = "startSeconds", required = false) List<Double> startSeconds,
            @RequestParam(name = "endSeconds", required = false) List<Double> endSeconds,
            @RequestParam(name = "crossfadeSeconds", required = false) Double crossfadeSeconds,
            @RequestParam(name = "normalizeVolume", required = false) Boolean normalizeVolume,
            @RequestParam(name = "format", required = false, defaultValue = "mp3") String format
    ) {
        MixRequest mixRequest = validateAndBuildRequest(files, manifestJson, startSeconds, endSeconds, crossfadeSeconds, normalizeVolume);

        boolean isVideo = "mp4".equalsIgnoreCase(format) || "video".equalsIgnoreCase(format);
        TrimmedAudio masterMix = isVideo
                ? videoMixService.mixVideo(files, mixRequest)
                : audioMixService.mix(files, mixRequest);

        StreamingResponseBody body = outputStream -> {
            try (masterMix) {
                Files.copy(masterMix.outputFile(), outputStream);
            } catch (IOException exception) {
                throw new IllegalStateException("Could not stream master mix " + (isVideo ? "video." : "audio."), exception);
            }
        };

        String filename = isVideo ? videoExportFilename : audioExportFilename;
        MediaType contentType = isVideo ? MediaType.valueOf("video/mp4") : MediaType.valueOf("audio/mpeg");

        ContentDisposition contentDisposition = ContentDisposition.attachment()
                .filename(filename)
                .build();

        return ResponseEntity.ok()
                .contentType(contentType)
                .header(HttpHeaders.CONTENT_DISPOSITION, contentDisposition.toString())
                .body(body);
    }

    private MixRequest validateAndBuildRequest(
            List<MultipartFile> files,
            String manifestJson,
            List<Double> startSeconds,
            List<Double> endSeconds,
            Double queryCrossfade,
            Boolean queryNormalize
    ) {
        if (files == null || files.isEmpty()) {
            throw new IllegalArgumentException("At least one media file is required.");
        }

        for (int i = 0; i < files.size(); i++) {
            MultipartFile file = files.get(i);
            if (file == null || file.isEmpty()) {
                throw new IllegalArgumentException("File at index " + i + " is empty.");
            }
            if (file.getSize() > MAX_FILE_SIZE_BYTES) {
                throw new IllegalArgumentException("File at index " + i + " exceeds the 500 MB limit.");
            }
            validateMediaFormat(file, i);
        }

        List<ClipSpec> clips;
        double effectiveCrossfade = queryCrossfade != null ? queryCrossfade : 0.0;
        boolean effectiveNormalize = queryNormalize != null && queryNormalize;

        if (manifestJson != null && !manifestJson.isBlank()) {
            try {
                MixManifest manifest = objectMapper.readValue(manifestJson, MixManifest.class);
                if (manifest.clips() == null || manifest.clips().isEmpty()) {
                    throw new IllegalArgumentException("Manifest must contain at least one clip.");
                }
                clips = manifest.clips();
                if (queryCrossfade == null && manifest.crossfadeSeconds() != null) {
                    effectiveCrossfade = manifest.crossfadeSeconds();
                }
                if (queryNormalize == null && manifest.normalizeVolume() != null) {
                    effectiveNormalize = manifest.normalizeVolume();
                }
            } catch (Exception exception) {
                throw new IllegalArgumentException("Invalid manifest JSON: " + exception.getMessage());
            }
        } else {
            if (startSeconds == null || endSeconds == null) {
                throw new IllegalArgumentException("startSeconds and endSeconds must be provided when manifest is omitted.");
            }
            if (startSeconds.size() != endSeconds.size()) {
                throw new IllegalArgumentException("startSeconds and endSeconds must have matching element counts.");
            }
            if (startSeconds.size() != files.size()) {
                throw new IllegalArgumentException("Clip count (" + startSeconds.size()
                        + ") does not match file count (" + files.size() + "). Use a manifest to map clips to files.");
            }

            clips = new ArrayList<>();
            for (int i = 0; i < startSeconds.size(); i++) {
                Double start = startSeconds.get(i);
                Double end = endSeconds.get(i);
                if (start == null || end == null) {
                    throw new IllegalArgumentException("Clip timestamps must not be null at index " + i + ".");
                }
                clips.add(new ClipSpec(i, start, end));
            }
        }

        for (ClipSpec clip : clips) {
            if (clip.fileIndex() < 0 || clip.fileIndex() >= files.size()) {
                throw new IllegalArgumentException("Invalid fileIndex " + clip.fileIndex()
                        + " in clip. Total files provided: " + files.size());
            }
        }

        return new MixRequest(clips, effectiveCrossfade, effectiveNormalize);
    }

    private void validateMediaFormat(MultipartFile file, int index) {
        String contentType = file.getContentType();
        String filename = file.getOriginalFilename();

        boolean hasAudioOrVideoContentType = contentType != null && (
                contentType.toLowerCase(Locale.ROOT).startsWith("audio/") ||
                contentType.toLowerCase(Locale.ROOT).startsWith("video/")
        );

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

        if (!hasAudioOrVideoContentType && !hasAllowedExtension) {
            throw new IllegalArgumentException("File at index " + index
                    + " has an unsupported format. Supported formats: audio or video (" + String.join(", ", ALLOWED_EXTENSIONS) + ").");
        }
    }
}
