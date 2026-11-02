import React, { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import { Play, Pause, RotateCcw } from 'lucide-react';

interface WaveformTrimmerProps {
  file: File;
  startSeconds: number;
  endSeconds: number;
  onRangeChange: (start: number, end: number) => void;
}

export const WaveformTrimmer: React.FC<WaveformTrimmerProps> = ({
  file,
  startSeconds,
  endSeconds,
  onRangeChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<any>(null);
  const activeRegionRef = useRef<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const objectUrl = URL.createObjectURL(file);

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#dec2b1',
      progressColor: '#8e5845',
      cursorColor: '#613e33',
      cursorWidth: 2,
      height: 90,
      normalize: true,
      url: objectUrl,
    });

    const regions = ws.registerPlugin(RegionsPlugin.create());
    regionsRef.current = regions;
    wavesurferRef.current = ws;

    ws.on('ready', () => {
      setIsReady(true);
      const fileDuration = ws.getDuration();
      const safeEnd = endSeconds > 0 ? Math.min(endSeconds, fileDuration) : fileDuration;
      const safeStart = Math.min(startSeconds, safeEnd - 0.5);

      const region = regions.addRegion({
        start: Math.max(0, safeStart),
        end: Math.max(safeStart + 0.5, safeEnd),
        color: 'rgba(189, 132, 110, 0.35)',
        drag: true,
        resize: true,
      });

      activeRegionRef.current = region;
    });

    regions.on('region-updated', (region: any) => {
      activeRegionRef.current = region;
      onRangeChange(
        Math.round(region.start * 10) / 10,
        Math.round(region.end * 10) / 10
      );
    });

    ws.on('play', () => setIsPlaying(true));
    ws.on('pause', () => setIsPlaying(false));
    ws.on('finish', () => setIsPlaying(false));

    return () => {
      URL.revokeObjectURL(objectUrl);
      ws.destroy();
    };
  }, [file]);

  const togglePlaySnippet = () => {
    if (!wavesurferRef.current || !activeRegionRef.current) return;
    if (isPlaying) {
      wavesurferRef.current.pause();
    } else {
      activeRegionRef.current.play();
    }
  };

  const resetToFull = () => {
    if (!wavesurferRef.current || !activeRegionRef.current) return;
    const total = wavesurferRef.current.getDuration();
    activeRegionRef.current.setOptions({ start: 0, end: total });
    onRangeChange(0, Math.round(total * 10) / 10);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(1);
    return `${mins}:${Number(secs) < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="bg-stone-50 rounded-xl p-4 border border-stone-200 mt-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">
          Visual Audio Waveform (Drag handles to trim)
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={togglePlaySnippet}
            disabled={!isReady}
            className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-stone-800 bg-white hover:bg-stone-100 border border-stone-300 rounded-lg shadow-sm disabled:opacity-50 transition"
          >
            {isPlaying ? (
              <>
                <Pause className="w-3.5 h-3.5 text-stone-700" />
                Pause Snippet
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 text-stone-700" />
                Play Snippet
              </>
            )}
          </button>
          <button
            type="button"
            onClick={resetToFull}
            disabled={!isReady}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-stone-600 hover:text-stone-900 bg-white hover:bg-stone-100 border border-stone-200 rounded-lg transition"
            title="Reset trim to full duration"
          >
            <RotateCcw className="w-3 h-3" />
            Reset
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="w-full bg-white rounded-lg border border-stone-200/80 p-2 shadow-inner"
      />

      <div className="flex items-center justify-between mt-2 text-xs text-stone-600">
        <div>
          Start: <span className="font-mono font-medium text-stone-800">{formatTime(startSeconds)}</span>
        </div>
        <div>
          Snippet Duration: <span className="font-mono font-semibold text-stone-900">{(endSeconds - startSeconds).toFixed(1)}s</span>
        </div>
        <div>
          End: <span className="font-mono font-medium text-stone-800">{formatTime(endSeconds)}</span>
        </div>
      </div>
    </div>
  );
};
