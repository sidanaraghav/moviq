package com.cozicut.mix;

import com.cozicut.media.FfmpegExecutor;
import com.cozicut.media.MediaProcessingException;
import com.cozicut.trim.TrimmedAudio;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.TimeUnit;

@Service
public class VideoMixService {

    private static final Set<String> COMMON_VIDEO_EXTENSIONS = Set.of(
            ".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v", ".3gp", ".flv", ".wmv"
    );

    private final FfmpegExecutor ffmpegExecutor;
    private final TitleCardRenderer titleCardRenderer;
    private final String ffmpegExecutable;
    private final String ffprobeExecutable;

    public VideoMixService(
            FfmpegExecutor ffmpegExecutor,
            TitleCardRenderer titleCardRenderer,
            @Value("${cozicut.ffmpeg.executable:ffmpeg}") String ffmpegExecutable,
            @Value("${cozicut.ffprobe.executable:ffprobe}") String ffprobeExecutable
    ) {
        this.ffmpegExecutor = ffmpegExecutor;
        this.titleCardRenderer = titleCardRenderer;
        this.ffmpegExecutable = ffmpegExecutable;
        this.ffprobeExecutable = ffprobeExecutable;
    }

    public TrimmedAudio mixVideo(List<MultipartFile> files, MixRequest request) {
        Path workspace = null;
        try {
            workspace = Files.createTempDirectory("cozicut-video-mix-");

            // 1. Copy source files into the isolated workspace
            List<Path> sourcePaths = new ArrayList<>();
            List<String> originalFilenames = new ArrayList<>();
            List<Boolean> hasVideoStream = new ArrayList<>();

            for (int i = 0; i < files.size(); i++) {
                MultipartFile file = files.get(i);
                String origName = file.getOriginalFilename() != null ? file.getOriginalFilename() : ("source_" + i);
                originalFilenames.add(origName);

                String extension = getExtension(origName);
                Path sourcePath = workspace.resolve("source_" + i + extension);
                try (var inputStream = file.getInputStream()) {
                    Files.copy(inputStream, sourcePath, StandardCopyOption.REPLACE_EXISTING);
                }
                sourcePaths.add(sourcePath);

                boolean isVideo = detectHasVideo(sourcePath, extension);
                hasVideoStream.add(isVideo);
            }

            // 2. Process each requested clip into intermediate 1080p MP4
            List<Path> normalizedClips = new ArrayList<>();
            for (int i = 0; i < request.clips().size(); i++) {
                ClipSpec clip = request.clips().get(i);
                int fileIdx = clip.fileIndex();
                Path source = sourcePaths.get(fileIdx);
                String filename = originalFilenames.get(fileIdx);
                boolean isVideo = hasVideoStream.get(fileIdx);

                Path clipOutput = workspace.resolve("clip_" + i + ".mp4");

                if (isVideo) {
                    // Normalize video stream: scale with aspect preservation into 1280x720 canvas
                    List<String> cmd = List.of(
                            ffmpegExecutable, "-y",
                            "-ss", Double.toString(clip.startSeconds()),
                            "-to", Double.toString(clip.endSeconds()),
                            "-i", source.toString(),
                            "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30",
                            "-c:v", "libx264",
                            "-pix_fmt", "yuv420p",
                            "-r", "30",
                            "-c:a", "aac",
                            "-b:a", "192k",
                            "-ar", "44100",
                            "-ac", "2",
                            clipOutput.toString()
                    );
                    ffmpegExecutor.execute(cmd, workspace);
                } else {
                    // Audio-only input: generate aesthetic audio title card with dynamic waveform
                    Path cardImg = workspace.resolve("card_" + i + ".png");
                    String subtitle = "Clip " + (fileIdx + 1) + " • " + String.format(Locale.ROOT, "%.1fs - %.1fs", clip.startSeconds(), clip.endSeconds());
                    titleCardRenderer.renderTitleCard(filename, subtitle, cardImg);

                    List<String> cmd = List.of(
                            ffmpegExecutable, "-y",
                            "-ss", Double.toString(clip.startSeconds()),
                            "-to", Double.toString(clip.endSeconds()),
                            "-i", source.toString(),
                            "-loop", "1",
                            "-i", cardImg.toString(),
                            "-filter_complex", "[0:a]showwaves=s=680x96:mode=cline:colors=0xf59e0b|0xfbbf24[waves];[1:v][waves]overlay=300:436:shortest=1[outv]",
                            "-map", "[outv]",
                            "-map", "0:a",
                            "-c:v", "libx264",
                            "-pix_fmt", "yuv420p",
                            "-r", "30",
                            "-c:a", "aac",
                            "-b:a", "192k",
                            "-ar", "44100",
                            "-ac", "2",
                            "-shortest",
                            clipOutput.toString()
                    );
                    ffmpegExecutor.execute(cmd, workspace);
                }

                if (!Files.isRegularFile(clipOutput) || Files.size(clipOutput) == 0) {
                    throw new MediaProcessingException("Failed to render video segment " + (i + 1) + ".");
                }
                normalizedClips.add(clipOutput);
            }

            // 3. Combine / stitch the clips into final master video
            Path output = workspace.resolve("master_mix.mp4");

            if (normalizedClips.size() == 1 && !request.normalizeVolume()) {
                Files.copy(normalizedClips.getFirst(), output, StandardCopyOption.REPLACE_EXISTING);
            } else {
                List<String> stitchCmd = buildVideoStitchCommand(normalizedClips, request, output);
                ffmpegExecutor.execute(stitchCmd, workspace);
            }

            if (!Files.isRegularFile(output) || Files.size(output) == 0) {
                throw new MediaProcessingException("FFmpeg completed without creating master video output.");
            }

            return new TrimmedAudio(workspace, output);
        } catch (IOException exception) {
            cleanup(workspace);
            throw new MediaProcessingException("Could not prepare the video mixing workspace.", exception);
        } catch (RuntimeException exception) {
            cleanup(workspace);
            throw exception;
        }
    }

    private List<String> buildVideoStitchCommand(List<Path> clips, MixRequest request, Path output) {
        List<String> command = new ArrayList<>();
        command.add(ffmpegExecutable);
        command.add("-y");

        for (Path clip : clips) {
            command.add("-i");
            command.add(clip.toString());
        }

        command.add("-filter_complex");

        int n = clips.size();
        StringBuilder filter = new StringBuilder();

        for (int i = 0; i < n; i++) {
            filter.append("[").append(i).append(":v][").append(i).append(":a]");
        }

        if (request.normalizeVolume()) {
            filter.append("concat=n=").append(n).append(":v=1:a=1[v][raw_a];[raw_a]loudnorm[a]");
        } else {
            filter.append("concat=n=").append(n).append(":v=1:a=1[v][a]");
        }

        command.add(filter.toString());
        command.add("-map");
        command.add("[v]");
        command.add("-map");
        command.add("[a]");
        command.add("-c:v");
        command.add("libx264");
        command.add("-pix_fmt");
        command.add("yuv420p");
        command.add("-c:a");
        command.add("aac");
        command.add("-b:a");
        command.add("192k");
        command.add(output.toString());

        return command;
    }

    private boolean detectHasVideo(Path file, String extension) {
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
                // If it contains "video,0" or starts with "video" without "attached_pic"
                if (result.startsWith("video,0") || (result.startsWith("video") && !result.contains("1"))) {
                    return true;
                }
                if (result.isEmpty()) {
                    return false;
                }
            }
        } catch (Exception ignored) {
            // Fallback to extension check
        }

        return COMMON_VIDEO_EXTENSIONS.contains(extension.toLowerCase(Locale.ROOT));
    }

    private String getExtension(String filename) {
        if (filename == null || !filename.contains(".")) {
            return ".tmp";
        }
        return filename.substring(filename.lastIndexOf("."));
    }

    private void cleanup(Path workspace) {
        if (workspace == null) {
            return;
        }
        try {
            new TrimmedAudio(workspace, workspace).close();
        } catch (IOException ignored) {
            // Best-effort cleanup
        }
    }
}
