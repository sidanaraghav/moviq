/**
 * Helper to upload media, process via FFmpeg on the server, and download
 * while reporting high-precision progress percentages and status messages.
 */
export interface ExportProgressCallback {
  (progress: number, statusText: string): void;
}

export function exportWithProgress({
  format,
  formData,
  clipCount,
  onProgress,
}: {
  format: 'mp3' | 'mp4';
  formData: FormData;
  clipCount: number;
  onProgress: ExportProgressCallback;
}): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/v1/audio/mixes?format=${format}`);
    xhr.responseType = 'blob';

    let processingTimer: ReturnType<typeof setInterval> | null = null;
    let currentProgress = 5;

    onProgress(5, 'Preparing media files...');

    // 1. Upload progress (0% -> 25%)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        const fraction = event.loaded / event.total;
        const uploadPct = Math.min(25, Math.max(5, Math.round(fraction * 25)));
        currentProgress = uploadPct;

        const loadedMb = (event.loaded / (1024 * 1024)).toFixed(1);
        const totalMb = (event.total / (1024 * 1024)).toFixed(1);
        const filePct = Math.round(fraction * 100);

        if (uploadPct < 25) {
          onProgress(uploadPct, `Uploading files: ${filePct}% (${loadedMb} MB / ${totalMb} MB)`);
        } else {
          onProgress(25, 'Upload complete (100%). Starting media processing...');
        }
      }
    };

    // 2. Server Processing Phase (25% -> 85%)
    xhr.upload.onload = () => {
      currentProgress = 25;
      onProgress(25, `Extracting & trimming ${clipCount} segment${clipCount === 1 ? '' : 's'}...`);

      // Target ~4.5 seconds for typical 720p render with 250ms interval ticks
      const totalTicks = 20; // 20 * 250ms = 5000ms
      let tick = 0;

      processingTimer = setInterval(() => {
        tick++;
        const targetPercent = Math.min(85, Math.round(25 + (tick / totalTicks) * 60));

        if (targetPercent > currentProgress) {
          currentProgress = targetPercent;
        }

        let stageMsg = '';
        if (currentProgress < 40) {
          stageMsg = `Extracting & trimming ${clipCount} segment${clipCount === 1 ? '' : 's'}...`;
        } else if (currentProgress < 60) {
          stageMsg =
            format === 'mp4'
              ? 'Normalizing video cuts to 720p HD...'
              : 'Applying crossfades & mixing audio streams...';
        } else if (currentProgress < 75) {
          stageMsg =
            format === 'mp4'
              ? 'Rendering audio visualizer title cards...'
              : 'Leveling audio loudness & volume...';
        } else {
          stageMsg = 'Stitching final medley sequence...';
        }

        onProgress(currentProgress, stageMsg);

        if (tick >= totalTicks) {
          if (processingTimer) clearInterval(processingTimer);
        }
      }, 250);
    };

    // 3. Download streaming progress (85% -> 98%)
    xhr.onprogress = (event) => {
      if (processingTimer) {
        clearInterval(processingTimer);
        processingTimer = null;
      }

      if (event.lengthComputable && event.total > 0) {
        const downloadFraction = event.loaded / event.total;
        const dlPct = Math.min(98, Math.max(86, Math.round(85 + downloadFraction * 13)));
        currentProgress = dlPct;
        onProgress(dlPct, `Downloading ${format.toUpperCase()} medley... (${dlPct}%)`);
      } else {
        currentProgress = Math.min(96, Math.max(currentProgress, 88));
        onProgress(currentProgress, `Receiving master ${format.toUpperCase()} stream...`);
      }
    };

    // 4. Request finished
    xhr.onload = () => {
      if (processingTimer) clearInterval(processingTimer);

      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100, `Done! Your ${format.toUpperCase()} is ready.`);
        resolve(xhr.response as Blob);
      } else {
        // Read error text from response blob if present
        const blob = xhr.response as Blob;
        if (blob && blob.size > 0) {
          const reader = new FileReader();
          reader.onload = () => {
            try {
              const errJson = JSON.parse(reader.result as string);
              reject(new Error(errJson.message || errJson.error || `Server error (${xhr.status})`));
            } catch {
              reject(new Error((reader.result as string) || `Server error (${xhr.status})`));
            }
          };
          reader.onerror = () => reject(new Error(`Server error (${xhr.status})`));
          reader.readAsText(blob);
        } else {
          reject(new Error(`Server error (${xhr.status})`));
        }
      }
    };

    // 5. Handle network errors
    xhr.onerror = () => {
      if (processingTimer) clearInterval(processingTimer);
      reject(new Error('Network error occurred while connecting to the server.'));
    };

    xhr.ontimeout = () => {
      if (processingTimer) clearInterval(processingTimer);
      reject(new Error('Export timed out. Please try with fewer or shorter clips.'));
    };

    xhr.send(formData);
  });
}
