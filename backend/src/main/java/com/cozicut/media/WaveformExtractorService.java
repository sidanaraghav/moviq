package com.cozicut.media;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

@Service
public class WaveformExtractorService {

    private final String ffmpegExecutable;

    public WaveformExtractorService(
            @Value("${cozicut.ffmpeg.executable:ffmpeg}") String ffmpegExecutable
    ) {
        this.ffmpegExecutable = ffmpegExecutable;
    }

    public List<Integer> extractPeaks(Path mediaFile, int targetPeaks) {
        if (targetPeaks <= 0) targetPeaks = 400;

        List<String> command = List.of(
                ffmpegExecutable,
                "-nostdin",
                "-y",
                "-i", mediaFile.toString(),
                "-vn",
                "-ac", "1",
                "-filter:a", "aresample=4000",
                "-c:a", "pcm_s16le",
                "-f", "s16le",
                "-"
        );

        try {
            Process process = new ProcessBuilder(command)
                    .redirectError(ProcessBuilder.Redirect.DISCARD)
                    .start();

            InputStream is = process.getInputStream();
            byte[] allPcm = is.readAllBytes();
            process.waitFor(10, TimeUnit.SECONDS);

            int totalSamples = allPcm.length / 2;
            if (totalSamples == 0) return List.of();

            int bucketSize = Math.max(1, totalSamples / targetPeaks);
            int maxFoundOverall = 1;

            int[] bucketMax = new int[targetPeaks];
            for (int i = 0; i < targetPeaks; i++) {
                int start = i * bucketSize;
                int end = Math.min(totalSamples, (i + 1) * bucketSize);
                int chunkMax = 0;
                for (int s = start; s < end; s++) {
                    int bLow = allPcm[s * 2] & 0xFF;
                    int bHigh = allPcm[s * 2 + 1];
                    int sample = (bHigh << 8) | bLow;
                    int abs = Math.abs(sample);
                    if (abs > chunkMax) chunkMax = abs;
                }
                bucketMax[i] = chunkMax;
                if (chunkMax > maxFoundOverall) maxFoundOverall = chunkMax;
            }

            List<Integer> result = new ArrayList<>(targetPeaks);
            for (int max : bucketMax) {
                int normalized = Math.min(99, Math.max(2, (int) Math.round(((double) max / maxFoundOverall) * 99)));
                result.add(normalized);
            }
            return result;

        } catch (Exception e) {
            return List.of();
        }
    }

    public String extractPeaksAsString(Path mediaFile, int targetPeaks) {
        List<Integer> peaks = extractPeaks(mediaFile, targetPeaks);
        if (peaks.isEmpty()) return null;
        return peaks.stream().map(String::valueOf).collect(Collectors.joining(","));
    }
}
