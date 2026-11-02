package com.cozicut.mix;

public record ClipSpec(
        int fileIndex,
        double startSeconds,
        double endSeconds
) {
    public double duration() {
        return endSeconds - startSeconds;
    }
}
