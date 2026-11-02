package com.cozicut.media;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;

class ProcessFfmpegExecutorTest {

    private final ProcessFfmpegExecutor executor = new ProcessFfmpegExecutor(5);
    private final String javaExecutable = Path.of(System.getProperty("java.home"), "bin", "java").toString();

    @Test
    void completesAZeroExitCommandWithoutUsingAShell() {
        assertDoesNotThrow(() -> executor.execute(List.of(javaExecutable, "-version"), Path.of(".")));
    }

    @Test
    void translatesNonZeroExitIntoDomainException() {
        assertThrows(MediaProcessingException.class,
                () -> executor.execute(List.of(javaExecutable, "--not-a-real-java-option"), Path.of(".")));
    }
}
