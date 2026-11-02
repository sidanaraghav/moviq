package com.cozicut.media;

import java.nio.file.Path;
import java.util.List;

public interface FfmpegExecutor {

    void execute(List<String> command, Path workingDirectory);
}
