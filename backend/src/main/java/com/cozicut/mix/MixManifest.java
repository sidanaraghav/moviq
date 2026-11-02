package com.cozicut.mix;

import java.util.List;

public record MixManifest(
        List<ClipSpec> clips,
        Double crossfadeSeconds,
        Boolean normalizeVolume
) {
}
