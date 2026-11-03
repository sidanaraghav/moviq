package com.cozicut.download;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;

public final class DownloadedMedia implements AutoCloseable {

    private final Path workspace;
    private final Path outputFile;
    private final String title;
    private final String contentType;
    private final boolean isVideo;

    public DownloadedMedia(Path workspace, Path outputFile, String title) {
        this(workspace, outputFile, title, "audio/mpeg", false);
    }

    public DownloadedMedia(Path workspace, Path outputFile, String title, String contentType, boolean isVideo) {
        this.workspace = workspace;
        this.outputFile = outputFile;
        this.title = title;
        this.contentType = contentType != null ? contentType : (isVideo ? "video/mp4" : "audio/mpeg");
        this.isVideo = isVideo;
    }

    public Path outputFile() {
        return outputFile;
    }

    public String title() {
        return title;
    }

    public String contentType() {
        return contentType;
    }

    public boolean isVideo() {
        return isVideo;
    }

    @Override
    public void close() throws IOException {
        if (Files.exists(workspace)) {
            try (var paths = Files.walk(workspace)) {
                paths.sorted(Comparator.reverseOrder()).forEach(path -> {
                    try {
                        Files.deleteIfExists(path);
                    } catch (IOException exception) {
                        throw new WorkspaceCleanupException(exception);
                    }
                });
            } catch (WorkspaceCleanupException exception) {
                throw exception.getCause();
            }
        }
    }

    private static final class WorkspaceCleanupException extends RuntimeException {
        WorkspaceCleanupException(IOException cause) {
            super(cause);
        }

        @Override
        public synchronized IOException getCause() {
            return (IOException) super.getCause();
        }
    }
}
