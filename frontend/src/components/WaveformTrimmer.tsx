import React, { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import { Play, Pause, RotateCcw } from 'lucide-react';
import { formatTime } from '../utils/timeFormat';

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

  const [isPlayingSnippet, setIsPlayingSnippet] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const objectUrl = URL.createObjectURL(file);

    // Uniform wave color with NO two-color split, sleek amber playhead needle
    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#d6d3d1',
      progressColor: '#d6d3d1', // Identical to waveColor: eliminates the confusing dark/light split line!
      cursorColor: '#ea580c',   // Subtle orange playhead needle that moves only while playing
      cursorWidth: 2,
      height: 80,
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
      const safeStart = Math.min(startSeconds, safeEnd - 0.2);

      const region = regions.addRegion({
        start: Math.max(0, safeStart),
        end: Math.max(safeStart + 0.2, safeEnd),
        color: 'rgba(245, 158, 11, 0.12)',
        drag: true,
        resize: true,
      });

      activeRegionRef.current = region;
    });

    ws.on('error', (err) => {
      console.warn('Audio visualizer notice:', err);
      setLoadError('Visual timeline is unavailable for this format, but playback and time inputs work normally.');
    });

    regions.on('region-updated', (region: any) => {
      activeRegionRef.current = region;
      onRangeChange(
        Math.round(region.start * 10) / 10,
        Math.round(region.end * 10) / 10
      );
    });

    ws.on('timeupdate', (time) => {
      setCurrentTime(time);
      if (isPlayingSnippet && activeRegionRef.current) {
        if (time >= activeRegionRef.current.end) {
          ws.pause();
          setIsPlayingSnippet(false);
        }
      }
    });

    ws.on('pause', () => {
      setIsPlayingSnippet(false);
    });

    ws.on('finish', () => {
      setIsPlayingSnippet(false);
    });

    return () => {
      URL.revokeObjectURL(objectUrl);
      ws.destroy();
    };
  }, [file]);

  // Synchronize region if parent time inputs change
  useEffect(() => {
    if (!activeRegionRef.current || !isReady) return;
    const region = activeRegionRef.current;
    if (Math.abs(region.start - startSeconds) > 0.15 || Math.abs(region.end - endSeconds) > 0.15) {
      region.setOptions({
        start: startSeconds,
        end: endSeconds,
      });
    }
  }, [startSeconds, endSeconds, isReady]);

  const playSnippet = () => {
    if (!wavesurferRef.current || !activeRegionRef.current) return;
    if (isPlayingSnippet) {
      wavesurferRef.current.pause();
    } else {
      wavesurferRef.current.setTime(activeRegionRef.current.start);
      wavesurferRef.current.play();
      setIsPlayingSnippet(true);
    }
  };

  const resetToFull = () => {
    if (!wavesurferRef.current || !activeRegionRef.current) return;
    const total = wavesurferRef.current.getDuration();
    activeRegionRef.current.setOptions({ start: 0, end: total });
    onRangeChange(0, Math.round(total * 10) / 10);
  };

  const duration = Math.max(0, endSeconds - startSeconds);

  return (
    <div className="bg-stone-50/80 rounded-xl p-3.5 border border-stone-200 mt-3 text-xs">
      {/* Streamlined QuickTime-Style Toolbar */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={playSnippet}
            disabled={!isReady}
            className="inline-flex items-center gap-1.5 px-3 py-1 font-semibold text-stone-900 bg-amber-400 hover:bg-amber-500 text-stone-900 rounded-lg shadow-2xs transition disabled:opacity-50 cursor-pointer text-xs"
          >
            {isPlayingSnippet ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
            {isPlayingSnippet ? 'Pause' : 'Play Selection'}
          </button>

          <span className="text-xs text-stone-500 font-medium">
            {isPlayingSnippet ? (
              <span className="text-amber-800 font-mono font-semibold">
                ▶ {formatTime(currentTime)} <span className="text-stone-400 font-normal">/ {formatTime(endSeconds)}</span>
              </span>
            ) : (
              `${formatTime(startSeconds)} – ${formatTime(endSeconds)} (${duration.toFixed(1)}s)`
            )}
          </span>
        </div>

        <button
          type="button"
          onClick={resetToFull}
          disabled={!isReady}
          className="p-1 text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 rounded-md transition"
          title="Reset selection to full file"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Visual Timeline Canvas with Framed QuickTime Drag Handles */}
      {loadError ? (
        <div className="p-3 bg-amber-50 text-amber-800 rounded-lg text-xs border border-amber-200">
          {loadError}
        </div>
      ) : (
        <div className="relative">
          {!isReady && (
            <div className="absolute inset-0 bg-stone-100/80 backdrop-blur-xs flex items-center justify-center rounded-lg text-stone-500 font-medium text-xs z-10">
              Loading visual timeline...
            </div>
          )}
          <div
            ref={containerRef}
            className="trimmer-container w-full bg-white rounded-lg border border-stone-300 shadow-inner cursor-pointer min-h-[80px] overflow-hidden"
            title="Drag the left handle to set Start, right handle to set End, or drag the frame to move selection"
          />
        </div>
      )}

      {/* Footer Info */}
      <div className="flex items-center justify-between mt-2 text-stone-600 font-mono text-[11px]">
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-amber-500 inline-block"></span>
          Start: <span className="font-semibold text-stone-900">{formatTime(startSeconds)}</span>
        </div>
        <div className="bg-amber-100/70 text-amber-900 px-2 py-0.5 rounded border border-amber-200/80 font-bold text-[10px]">
          Selected: {duration.toFixed(1)}s
        </div>
        <div className="flex items-center gap-1">
          End: <span className="font-semibold text-stone-900">{formatTime(endSeconds)}</span>
          <span className="w-2 h-2 rounded-full bg-amber-500 inline-block"></span>
        </div>
      </div>
    </div>
  );
};
