import React, { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import { Play, Pause, RotateCcw, GripVertical } from 'lucide-react';
import { formatTime } from '../utils/timeFormat';

interface WaveformTrimmerProps {
  file: File;
  startSeconds: number;
  endSeconds: number;
  onRangeChange: (start: number, end: number) => void;
  duration?: number;
  isVideo?: boolean;
  peaks?: number[];
}

export const WaveformTrimmer: React.FC<WaveformTrimmerProps> = ({
  file,
  startSeconds,
  endSeconds,
  onRangeChange,
  duration: initialDuration,
  isVideo: isVideoProp,
  peaks,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const visualTrackRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<any>(null);
  const activeRegionRef = useRef<any>(null);
  const fallbackMediaRef = useRef<HTMLMediaElement | null>(null);

  const [isPlayingSnippet, setIsPlayingSnippet] = useState(false);
  const [currentTime, setCurrentTime] = useState(startSeconds);
  const [isReady, setIsReady] = useState(false);
  const [totalDuration, setTotalDuration] = useState<number>(initialDuration || 0);

  const isVideo =
    isVideoProp ||
    file.type.startsWith('video/') ||
    file.name.match(/\.(mp4|mov|mkv|webm|m4v|avi)$/i) !== null;

  const hasPeaks = Array.isArray(peaks) && peaks.length > 0;

  // Use visual track fallback only if it's a video file and we don't have server-extracted peaks yet
  const [useVisualFallback, setUseVisualFallback] = useState<boolean>(
    isVideo && !hasPeaks
  );

  // Switch to waveform view as soon as server peaks arrive
  useEffect(() => {
    if (hasPeaks) {
      setUseVisualFallback(false);
    }
  }, [hasPeaks]);

  // Dragging state for visual track
  const dragModeRef = useRef<'none' | 'start' | 'end' | 'window'>('none');
  const dragStartXRef = useRef<number>(0);
  const dragInitialRangeRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });

  // Determine media duration
  useEffect(() => {
    if (initialDuration && initialDuration > 0) {
      setTotalDuration(initialDuration);
      setIsReady(true);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const tempMedia = document.createElement(isVideo ? 'video' : 'audio');
    tempMedia.preload = 'metadata';
    tempMedia.src = objectUrl;

    tempMedia.onloadedmetadata = () => {
      if (tempMedia.duration && !isNaN(tempMedia.duration)) {
        setTotalDuration(tempMedia.duration);
        setIsReady(true);
      }
      URL.revokeObjectURL(objectUrl);
    };

    tempMedia.onerror = () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [file, initialDuration, isVideo]);

  // WaveSurfer initialization (renders real waveform using server peaks for video or browser decode for audio)
  useEffect(() => {
    if (isVideo && !hasPeaks) {
      setUseVisualFallback(true);
      setIsReady(true);
      return;
    }

    if (!containerRef.current) return;

    const objectUrl = URL.createObjectURL(file);
    const mediaEl = document.createElement(isVideo ? 'video' : 'audio');
    mediaEl.src = objectUrl;
    mediaEl.preload = 'metadata';

    try {
      const ws = WaveSurfer.create({
        container: containerRef.current,
        waveColor: '#d6d3d1',
        progressColor: '#ea580c',
        cursorColor: '#ea580c',
        cursorWidth: 2,
        height: 80,
        normalize: true,
        media: mediaEl,
        url: objectUrl,
        peaks: hasPeaks ? [peaks] : undefined,
        duration:
          totalDuration > 0
            ? totalDuration
            : initialDuration && initialDuration > 0
            ? initialDuration
            : undefined,
      });

      const regions = ws.registerPlugin(RegionsPlugin.create());
      regionsRef.current = regions;
      wavesurferRef.current = ws;

      const initRegion = (durationVal: number) => {
        const fileDuration = durationVal > 0 ? durationVal : 60;
        setTotalDuration(fileDuration);

        const safeEnd =
          endSeconds > 0 ? Math.min(endSeconds, fileDuration) : fileDuration;
        const safeStart = Math.min(startSeconds, Math.max(0, safeEnd - 0.2));

        regions.clearRegions();
        const region = regions.addRegion({
          start: Math.max(0, safeStart),
          end: Math.max(safeStart + 0.2, safeEnd),
          color: 'rgba(245, 158, 11, 0.16)',
          drag: true,
          resize: true,
        });

        activeRegionRef.current = region;
        setIsReady(true);
      };

      ws.on('ready', () => {
        const d = ws.getDuration();
        initRegion(d || totalDuration || initialDuration || 60);
      });

      // If pre-extracted peaks and duration are available, initialize region immediately
      if (
        hasPeaks &&
        (totalDuration > 0 || (initialDuration && initialDuration > 0))
      ) {
        initRegion(totalDuration > 0 ? totalDuration : initialDuration!);
      }

      ws.on('error', (err) => {
        console.warn('WaveSurfer notice; falling back to visual track:', err);
        setUseVisualFallback(true);
        setIsReady(true);
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

      ws.on('pause', () => setIsPlayingSnippet(false));
      ws.on('finish', () => setIsPlayingSnippet(false));

      return () => {
        try {
          URL.revokeObjectURL(objectUrl);
          ws.destroy();
        } catch {
          // ignore
        }
      };
    } catch (err) {
      console.warn('WaveSurfer init error; falling back to visual track:', err);
      setUseVisualFallback(true);
      setIsReady(true);
    }
  }, [file, isVideo, hasPeaks, peaks, useVisualFallback]);

  // Synchronize WaveSurfer region if start/end changes from outside
  useEffect(() => {
    if (useVisualFallback || !activeRegionRef.current || !isReady) return;
    const region = activeRegionRef.current;
    if (Math.abs(region.start - startSeconds) > 0.15 || Math.abs(region.end - endSeconds) > 0.15) {
      region.setOptions({
        start: startSeconds,
        end: endSeconds,
      });
    }
  }, [startSeconds, endSeconds, isReady, useVisualFallback]);

  // Snippet Playback handler
  const playSnippet = () => {
    if (useVisualFallback) {
      const media = fallbackMediaRef.current;
      if (!media) return;

      if (isPlayingSnippet) {
        media.pause();
        setIsPlayingSnippet(false);
      } else {
        media.currentTime = startSeconds;
        setCurrentTime(startSeconds);
        media
          .play()
          .then(() => setIsPlayingSnippet(true))
          .catch(() => setIsPlayingSnippet(false));
      }
    } else {
      if (!wavesurferRef.current || !activeRegionRef.current) return;
      if (isPlayingSnippet) {
        wavesurferRef.current.pause();
      } else {
        wavesurferRef.current.setTime(activeRegionRef.current.start);
        wavesurferRef.current.play();
        setIsPlayingSnippet(true);
      }
    }
  };

  const handleFallbackMediaTimeUpdate = () => {
    const media = fallbackMediaRef.current;
    if (!media) return;

    setCurrentTime(media.currentTime);

    if (media.currentTime >= endSeconds || media.ended) {
      media.pause();
      media.currentTime = startSeconds;
      setCurrentTime(startSeconds);
      setIsPlayingSnippet(false);
    }
  };

  const resetToFull = () => {
    const safeTotal = totalDuration > 0 ? totalDuration : 60;
    if (useVisualFallback) {
      onRangeChange(0, Math.round(safeTotal * 10) / 10);
    } else if (wavesurferRef.current && activeRegionRef.current) {
      activeRegionRef.current.setOptions({ start: 0, end: safeTotal });
      onRangeChange(0, Math.round(safeTotal * 10) / 10);
    }
  };

  // Interactive Pointer dragging for Visual Track
  const handlePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    mode: 'start' | 'end' | 'window'
  ) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragModeRef.current = mode;
    dragStartXRef.current = e.clientX;
    dragInitialRangeRef.current = { start: startSeconds, end: endSeconds };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragModeRef.current === 'none' || !visualTrackRef.current || totalDuration <= 0) return;

    const rect = visualTrackRef.current.getBoundingClientRect();
    const deltaX = e.clientX - dragStartXRef.current;
    const deltaSeconds = (deltaX / rect.width) * totalDuration;

    const initial = dragInitialRangeRef.current;
    const minCutDuration = 0.5;

    if (dragModeRef.current === 'start') {
      const newStart = Math.max(0, Math.min(initial.end - minCutDuration, initial.start + deltaSeconds));
      onRangeChange(Math.round(newStart * 10) / 10, initial.end);
    } else if (dragModeRef.current === 'end') {
      const newEnd = Math.min(totalDuration, Math.max(initial.start + minCutDuration, initial.end + deltaSeconds));
      onRangeChange(initial.start, Math.round(newEnd * 10) / 10);
    } else if (dragModeRef.current === 'window') {
      const cutLen = initial.end - initial.start;
      let newStart = initial.start + deltaSeconds;
      let newEnd = initial.end + deltaSeconds;

      if (newStart < 0) {
        newStart = 0;
        newEnd = cutLen;
      }
      if (newEnd > totalDuration) {
        newEnd = totalDuration;
        newStart = Math.max(0, totalDuration - cutLen);
      }

      onRangeChange(Math.round(newStart * 10) / 10, Math.round(newEnd * 10) / 10);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragModeRef.current !== 'none') {
      dragModeRef.current = 'none';
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
  };

  const duration = Math.max(0, endSeconds - startSeconds);
  const effectiveTotal = totalDuration > 0 ? totalDuration : Math.max(endSeconds, 60);

  const leftPercent = Math.min(100, Math.max(0, (startSeconds / effectiveTotal) * 100));
  const rightPercent = Math.min(100, Math.max(0, (endSeconds / effectiveTotal) * 100));
  const widthPercent = Math.max(1, rightPercent - leftPercent);
  const playheadPercent = Math.min(100, Math.max(0, (currentTime / effectiveTotal) * 100));

  return (
    <div className="bg-stone-50/80 rounded-xl p-3.5 border border-stone-200 mt-3 text-xs select-none">
      {/* Fallback hidden media player for visual mode */}
      {useVisualFallback && (
        <video
          ref={fallbackMediaRef as any}
          src={URL.createObjectURL(file)}
          playsInline
          onTimeUpdate={handleFallbackMediaTimeUpdate}
          onPause={() => setIsPlayingSnippet(false)}
          onEnded={() => setIsPlayingSnippet(false)}
          className="hidden"
        />
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={playSnippet}
            disabled={!isReady}
            className="inline-flex items-center gap-1.5 px-3 py-1 font-semibold text-stone-900 bg-amber-400 hover:bg-amber-500 rounded-lg shadow-2xs transition disabled:opacity-50 cursor-pointer text-xs"
          >
            {isPlayingSnippet ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
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
          className="p-1 text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 rounded-md transition cursor-pointer"
          title="Reset selection to full duration"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Visual Timeline Track */}
      {useVisualFallback ? (
        <div
          ref={visualTrackRef}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="relative w-full h-20 bg-stone-900 rounded-lg border border-stone-800 overflow-hidden shadow-inner touch-none cursor-pointer"
          title="Drag the left handle to set Start, right handle to set End, or drag the window to slide your cut"
        >
          {/* Background Tick Lines & Filmstrip Grid */}
          <div className="absolute inset-0 flex items-center justify-between px-3 pointer-events-none opacity-30">
            {Array.from({ length: 24 }).map((_, i) => (
              <div
                key={i}
                className={`w-0.5 bg-stone-500 rounded-full ${
                  i % 4 === 0 ? 'h-9 bg-amber-400 opacity-60' : 'h-5'
                }`}
              />
            ))}
          </div>

          {/* Time markers across the track */}
          <div className="absolute bottom-1 inset-x-3 flex justify-between text-[9px] font-mono text-stone-500 pointer-events-none">
            <span>0:00</span>
            <span>{formatTime(effectiveTotal * 0.25)}</span>
            <span>{formatTime(effectiveTotal * 0.5)}</span>
            <span>{formatTime(effectiveTotal * 0.75)}</span>
            <span>{formatTime(effectiveTotal)}</span>
          </div>

          {/* Selected Region Window (Draggable) */}
          <div
            style={{
              left: `${leftPercent}%`,
              width: `${widthPercent}%`,
            }}
            onPointerDown={(e) => handlePointerDown(e, 'window')}
            className="absolute top-0 bottom-0 bg-amber-500/20 border-t-2 border-b-2 border-amber-400 cursor-grab active:cursor-grabbing group shadow-lg"
          >
            {/* Center Label */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-[10px] font-bold text-amber-300 bg-stone-950/70 px-2 py-0.5 rounded backdrop-blur-xs font-mono shadow-xs border border-amber-500/30">
                {duration.toFixed(1)}s Cut
              </span>
            </div>

            {/* Left Drag Handle (Start) */}
            <div
              onPointerDown={(e) => handlePointerDown(e, 'start')}
              className="absolute left-0 top-0 bottom-0 w-6 -translate-x-1/2 flex items-center justify-center cursor-ew-resize group-hover:scale-105 transition-transform z-20"
              title="Drag to adjust Start Time"
            >
              <div className="w-3.5 h-11 bg-amber-500 hover:bg-amber-400 rounded-l-md flex items-center justify-center shadow-md border-r border-amber-600">
                <GripVertical className="w-3 h-3 text-stone-950" />
              </div>
            </div>

            {/* Right Drag Handle (End) */}
            <div
              onPointerDown={(e) => handlePointerDown(e, 'end')}
              className="absolute right-0 top-0 bottom-0 w-6 translate-x-1/2 flex items-center justify-center cursor-ew-resize group-hover:scale-105 transition-transform z-20"
              title="Drag to adjust End Time"
            >
              <div className="w-3.5 h-11 bg-amber-500 hover:bg-amber-400 rounded-r-md flex items-center justify-center shadow-md border-l border-amber-600">
                <GripVertical className="w-3 h-3 text-stone-950" />
              </div>
            </div>
          </div>

          {/* Active Playhead Needle */}
          {isPlayingSnippet && (
            <div
              style={{ left: `${playheadPercent}%` }}
              className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg pointer-events-none z-30 flex flex-col items-center"
            >
              <div className="w-2.5 h-2.5 rounded-full bg-white -mt-0.5 shadow-sm" />
            </div>
          )}
        </div>
      ) : (
        /* Native Audio Waveform Container (WaveSurfer for pure audio) */
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
          Duration: {duration.toFixed(1)}s
        </div>
        <div className="flex items-center gap-1">
          End: <span className="font-semibold text-stone-900">{formatTime(endSeconds)}</span>
          <span className="w-2 h-2 rounded-full bg-amber-500 inline-block"></span>
        </div>
      </div>
    </div>
  );
};
