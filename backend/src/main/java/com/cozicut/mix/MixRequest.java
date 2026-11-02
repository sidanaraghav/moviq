package com.cozicut.mix;

import java.util.List;

public record MixRequest(
        List<ClipSpec> clips,
        double crossfadeSeconds,
        boolean normalizeVolume
) {
    public MixRequest {
        if (clips == null || clips.isEmpty()) {
            throw new IllegalArgumentException("At least one clip must be specified.");
        }
        if (crossfadeSeconds < 0.0) {
            throw new IllegalArgumentException("crossfadeSeconds must be greater than or equal to 0.");
        }
        for (int i = 0; i < clips.size(); i++) {
            ClipSpec clip = clips.get(i);
            if (clip.startSeconds() < 0.0) {
                throw new IllegalArgumentException("Clip " + (i + 1) + " startSeconds must be greater than or equal to 0.");
            }
            if (clip.endSeconds() <= clip.startSeconds()) {
                throw new IllegalArgumentException("Clip " + (i + 1) + " endSeconds must be greater than startSeconds.");
            }
            if (crossfadeSeconds > 0.0 && clips.size() > 1 && clip.duration() <= crossfadeSeconds) {
                throw new IllegalArgumentException("Clip " + (i + 1) + " duration (" + clip.duration()
                        + "s) must be greater than crossfade duration (" + crossfadeSeconds + "s).");
            }
        }
    }
}
