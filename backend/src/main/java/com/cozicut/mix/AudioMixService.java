package com.cozicut.mix;

import com.cozicut.media.FfmpegExecutor;
import com.cozicut.media.MediaProcessingException;
import com.cozicut.trim.TrimmedAudio;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;

@Service
public class AudioMixService {

    private final FfmpegExecutor ffmpegExecutor;
    private final String ffmpegExecutable;

    public AudioMixService(FfmpegExecutor ffmpegExecutor,
                           @Value("${cozicut.ffmpeg.executable:ffmpeg}") String ffmpegExecutable) {
        this.ffmpegExecutor = ffmpegExecutor;
        this.ffmpegExecutable = ffmpegExecutable;
    }

    public TrimmedAudio mix(List<MultipartFile> files, MixRequest request) {
        Path workspace = null;
        try {
            workspace = Files.createTempDirectory("cozicut-mix-");

            // 1. Copy source files into the isolated workspace
            List<Path> sourcePaths = new ArrayList<>();
            for (int i = 0; i < files.size(); i++) {
                MultipartFile file = files.get(i);
                String extension = getExtension(file.getOriginalFilename());
                Path sourcePath = workspace.resolve("source_" + i + extension);
                try (var inputStream = file.getInputStream()) {
                    Files.copy(inputStream, sourcePath, StandardCopyOption.REPLACE_EXISTING);
                }
                sourcePaths.add(sourcePath);
            }

            // 2. Trim each requested clip into intermediate MP3
            List<Path> trimmedClips = new ArrayList<>();
            for (int i = 0; i < request.clips().size(); i++) {
                ClipSpec clip = request.clips().get(i);
                Path source = sourcePaths.get(clip.fileIndex());
                Path trimmedClip = workspace.resolve("clip_" + i + ".mp3");

                List<String> trimCommand = List.of(
                        ffmpegExecutable, "-y",
                        "-i", source.toString(),
                        "-ss", Double.toString(clip.startSeconds()),
                        "-to", Double.toString(clip.endSeconds()),
                        "-vn",
                        "-codec:a", "libmp3lame",
                        "-b:a", "192k",
                        trimmedClip.toString()
                );
                ffmpegExecutor.execute(trimCommand, workspace);

                if (!Files.isRegularFile(trimmedClip) || Files.size(trimmedClip) == 0) {
                    throw new MediaProcessingException("Failed to trim clip " + (i + 1) + ".");
                }
                trimmedClips.add(trimmedClip);
            }

            // 3. Combine / stitch the clips into final master mix
            Path output = workspace.resolve("master_mix.mp3");

            if (trimmedClips.size() == 1 && !request.normalizeVolume()) {
                Files.copy(trimmedClips.getFirst(), output, StandardCopyOption.REPLACE_EXISTING);
            } else {
                List<String> stitchCommand = buildStitchCommand(trimmedClips, request, output);
                ffmpegExecutor.execute(stitchCommand, workspace);
            }

            if (!Files.isRegularFile(output) || Files.size(output) == 0) {
                throw new MediaProcessingException("FFmpeg completed without creating master mix output.");
            }

            return new TrimmedAudio(workspace, output);
        } catch (IOException exception) {
            cleanup(workspace);
            throw new MediaProcessingException("Could not prepare the audio mixing workspace.", exception);
        } catch (RuntimeException exception) {
            cleanup(workspace);
            throw exception;
        }
    }

    private List<String> buildStitchCommand(List<Path> clips, MixRequest request, Path output) {
        List<String> command = new ArrayList<>();
        command.add(ffmpegExecutable);
        command.add("-y");

        for (Path clip : clips) {
            command.add("-i");
            command.add(clip.toString());
        }

        command.add("-filter_complex");

        int n = clips.size();
        String mapLabel;

        if (n == 1) {
            command.add("[0:a]loudnorm[outa]");
            mapLabel = "[outa]";
        } else if (request.crossfadeSeconds() <= 0.0) {
            // Clean sequential cut (default)
            StringBuilder filter = new StringBuilder();
            for (int i = 0; i < n; i++) {
                filter.append("[").append(i).append(":a]");
            }
            if (request.normalizeVolume()) {
                filter.append("concat=n=").append(n).append(":v=0:a=1[concata];[concata]loudnorm[outa]");
                mapLabel = "[outa]";
            } else {
                filter.append("concat=n=").append(n).append(":v=0:a=1[outa]");
                mapLabel = "[outa]";
            }
            command.add(filter.toString());
        } else {
            // Crossfaded mix
            String duration = Double.toString(request.crossfadeSeconds());
            StringBuilder filter = new StringBuilder();
            filter.append("[0:a][1:a]acrossfade=d=").append(duration).append(":c1=qsin:c2=qsin[a01]");
            String currentLabel = "a01";

            for (int i = 2; i < n; i++) {
                String nextLabel = "a0" + i;
                filter.append(";[").append(currentLabel).append("][").append(i).append(":a]acrossfade=d=")
                        .append(duration).append(":c1=qsin:c2=qsin[").append(nextLabel).append("]");
                currentLabel = nextLabel;
            }

            if (request.normalizeVolume()) {
                filter.append(";[").append(currentLabel).append("]loudnorm[outa]");
                mapLabel = "[outa]";
            } else {
                mapLabel = "[" + currentLabel + "]";
            }
            command.add(filter.toString());
        }

        command.add("-map");
        command.add(mapLabel);
        command.add("-codec:a");
        command.add("libmp3lame");
        command.add("-b:a");
        command.add("192k");
        command.add(output.toString());

        return command;
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
