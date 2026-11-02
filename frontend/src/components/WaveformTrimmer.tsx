import React, { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import { Play, Pause, RotateCcw, Crosshair } from 'lucide-react';
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
  const [isPlayingFull, setIsPlayingFull] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const objectUrl = URL.createObjectURL(file);

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#dec2b1',
      progressColor: '#8e5845',
      cursorColor: '#44403c',
      cursorWidth: 2,
      height: 85,
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
        color: 'rgba(189, 132, 110, 0.35)',
        drag: true,
        resize: true,
      });

      activeRegionRef.current = region;
    });

    ws.on('error', (err) => {
      console.warn('Wavesurfer render notice:', err);
      setLoadError('Waveform preview not supported for this specific container, but snippet preview and time controls work.');
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
      setIsPlayingFull(false);
    });

    ws.on('finish', () => {
      setIsPlayingSnippet(false);
      setIsPlayingFull(false);
    });

    return () => {
      URL.revokeObjectURL(objectUrl);
      ws.destroy();
    };
  }, [file]);

  // Synchronize region if parent inputs changed
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
      setIsPlayingFull(false);
    }
  };

  const togglePlayFull = () => {
    if (!wavesurferRef.current) return;
    if (isPlayingFull) {
      wavesurferRef.current.pause();
    } else {
      wavesurferRef.current.play();
      setIsPlayingFull(true);
      setIsPlayingSnippet(false);
    }
  };

  const setStartToPlayhead = () => {
    if (!activeRegionRef.current || !wavesurferRef.current) return;
    const now = Math.round(wavesurferRef.current.getCurrentTime() * 10) / 10;
    const newEnd = Math.max(now + 0.5, endSeconds);
    activeRegionRef.current.setOptions({ start: now, end: newEnd });
    onRangeChange(now, newEnd);
  };

  const setEndToPlayhead = () => {
    if (!activeRegionRef.current || !wavesurferRef.current) return;
    const now = Math.round(wavesurferRef.current.getCurrentTime() * 10) / 10;
    const newStart = Math.min(startSeconds, now - 0.5);
    activeRegionRef.current.setOptions({ start: newStart, end: now });
    onRangeChange(newStart, now);
  };

  const resetToFull = () => {
    if (!wavesurferRef.current || !activeRegionRef.current) return;
    const total = wavesurferRef.current.getDuration();
    activeRegionRef.current.setOptions({ start: 0, end: total });
    onRangeChange(0, Math.round(total * 10) / 10);
  };

  return (
    <div className="bg-stone-50 rounded-xl p-4 border border-stone-200 mt-3 text-xs">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={playSnippet}
            disabled={!isReady}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 font-semibold text-stone-900 bg-amber-100 hover:bg-amber-200 text-stone-900 border border-amber-300 rounded-lg shadow-sm transition disabled:opacity-50"
          >
            {isPlayingSnippet ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
            {isPlayingSnippet ? 'Pause Snippet' : '▶ Play Snippet Cut'}
          </button>

          <button
            type="button"
            onClick={togglePlayFull}
            disabled={!isReady}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-stone-700 bg-white hover:bg-stone-100 border border-stone-200 rounded-lg transition disabled:opacity-50"
          >
            {isPlayingFull ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            {isPlayingFull ? 'Pause Full' : 'Play Full Track'}
          </button>

          <span className="font-mono text-stone-500 pl-1">
            {formatTime(currentTime)}
          </span>
        </div>

        {/* Quick Marker Buttons */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={setStartToPlayhead}
            disabled={!isReady}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-stone-700 hover:text-stone-900 bg-white hover:bg-stone-100 border border-stone-200 rounded-lg transition disabled:opacity-50"
            title="Set start cut to current audio position"
          >
            <Crosshair className="w-3 h-3 text-amber-700" />
            Set Start Here [{formatTime(currentTime)}]
          </button>

          <button
            type="button"
            onClick={setEndToPlayhead}
            disabled={!isReady}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-stone-700 hover:text-stone-900 bg-white hover:bg-stone-100 border border-stone-200 rounded-lg transition disabled:opacity-50"
            title="Set end cut to current audio position"
          >
            <Crosshair className="w-3 h-3 text-red-600" />
            Set End Here [{formatTime(currentTime)}]
          </button>

          <button
            type="button"
            onClick={resetToFull}
            disabled={!isReady}
            className="p-1 text-stone-500 hover:text-stone-800 bg-white hover:bg-stone-100 border border-stone-200 rounded-lg transition"
            title="Reset range to full track"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Waveform Canvas */}
      {loadError ? (
        <div className="p-3 bg-amber-50 text-amber-800 rounded-lg text-xs border border-amber-200">
          {loadError}
        </div>
      ) : (
        <div className="relative">
          {!isReady && (
            <div className="absolute inset-0 bg-stone-100/80 backdrop-blur-xs flex items-center justify-center rounded-lg text-stone-500 font-medium text-xs z-10">
              Generating audio waveform...
            </div>
          )}
          <div
            ref={containerRef}
            className="w-full bg-white rounded-lg border border-stone-200 p-2 shadow-inner cursor-pointer min-h-[90px]"
            title="Click anywhere to jump playhead; drag shaded area or handles to trim snippet"
          />
        </div>
      )}

      {/* Footer Info */}
      <div className="flex items-center justify-between mt-2.5 text-stone-600 font-mono text-[11px]">
        <div>
          Start: <span className="font-semibold text-stone-900">{formatTime(startSeconds)}</span> ({startSeconds.toFixed(1)}s)
        </div>
        <div className="bg-amber-50 text-amber-900 px-2 py-0.5 rounded border border-amber-200 font-bold">
          Snippet Duration: {(endSeconds - startSeconds).toFixed(1)}s
        </div>
        <div>
          End: <span className="font-semibold text-stone-900">{formatTime(endSeconds)}</span> ({endSeconds.toFixed(1)}s)
        </div>
      </div>
    </div>
  );
};
