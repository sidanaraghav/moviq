package com.cozicut.trim;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;

public final class TrimmedAudio implements AutoCloseable {

    private final Path workspace;
    private final Path outputFile;

    public TrimmedAudio(Path workspace, Path outputFile) {
        this.workspace = workspace;
        this.outputFile = outputFile;
    }

    public Path outputFile() {
        return outputFile;
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
        public IOException getCause() {
            return (IOException) super.getCause();
        }
    }
}
