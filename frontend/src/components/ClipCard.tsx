import React, { useState, useEffect, useRef } from 'react';
import {
  Music,
  Video,
  Play,
  Pause,
  ArrowUp,
  ArrowDown,
  Trash2,
  Plus,
  Scissors,
  Film,
} from 'lucide-react';
import { WaveformTrimmer } from './WaveformTrimmer';
import { formatTime, parseTime } from '../utils/timeFormat';

export interface SourceFile {
  id: string;
  file: File;
  name: string;
  duration: number;
  isVideo: boolean;
  objectUrl: string;
}

export interface ClipItem {
  id: string;
  sourceFileId: string;
  startSeconds: number;
  endSeconds: number;
  label: string;
  showWaveform: boolean;
  showVideoPlayer?: boolean;
}

interface ClipCardProps {
  clip: ClipItem;
  index: number;
  totalClips: number;
  source: SourceFile;
  isAuditioning?: boolean;
  onUpdateRange: (clipId: string, start: number, end: number) => void;
  onUpdateLabel: (clipId: string, label: string) => void;
  onToggleWaveform: (clipId: string) => void;
  onToggleVideo: (clipId: string) => void;
  onAddAnotherCut: (sourceFileId: string, afterIndex: number) => void;
  onMoveClip: (index: number, direction: 'up' | 'down') => void;
  onRemoveClip: (clipId: string) => void;
}

export const ClipCard: React.FC<ClipCardProps> = ({
  clip,
  index,
  totalClips,
  source,
  isAuditioning = false,
  onUpdateRange,
  onUpdateLabel,
  onToggleWaveform,
  onToggleVideo,
  onAddAnotherCut,
  onMoveClip,
  onRemoveClip,
}) => {
  // Local string states for free typing without cursor jumps or 0-reset
  const [startInput, setStartInput] = useState(formatTime(clip.startSeconds));
  const [endInput, setEndInput] = useState(formatTime(clip.endSeconds));
  const [durationInput, setDurationInput] = useState(
    (clip.endSeconds - clip.startSeconds).toFixed(1)
  );

  // In-browser preview state
  const [isPreviewing, setIsPreviewing] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Sync inputs when clip props change (e.g. from waveform)
  useEffect(() => {
    setStartInput(formatTime(clip.startSeconds));
    setEndInput(formatTime(clip.endSeconds));
    setDurationInput((clip.endSeconds - clip.startSeconds).toFixed(1));
  }, [clip.startSeconds, clip.endSeconds]);

  const maxDuration = source.duration > 0 ? source.duration : 3600;

  const handleStartCommit = () => {
    const parsed = parseTime(startInput);
    if (parsed !== null && parsed >= 0) {
      const safeStart = Math.min(parsed, Math.max(0, maxDuration - 0.2));
      let safeEnd = clip.endSeconds;
      if (safeEnd <= safeStart) {
        safeEnd = Math.min(maxDuration, safeStart + 10);
      }
      onUpdateRange(clip.id, safeStart, safeEnd);
    } else {
      setStartInput(formatTime(clip.startSeconds));
    }
  };

  const handleEndCommit = () => {
    const parsed = parseTime(endInput);
    if (parsed !== null && parsed > 0) {
      const safeEnd = Math.min(parsed, maxDuration);
      let safeStart = clip.startSeconds;
      if (safeStart >= safeEnd) {
        safeStart = Math.max(0, safeEnd - 10);
      }
      onUpdateRange(clip.id, safeStart, safeEnd);
    } else {
      setEndInput(formatTime(clip.endSeconds));
    }
  };

  const handleDurationCommit = () => {
    const parsed = parseTime(durationInput);
    if (parsed !== null && parsed > 0) {
      const safeEnd = Math.min(maxDuration, clip.startSeconds + parsed);
      onUpdateRange(clip.id, clip.startSeconds, safeEnd);
    } else {
      setDurationInput((clip.endSeconds - clip.startSeconds).toFixed(1));
    }
  };

  // Preview snippet natively in browser
  const togglePreview = () => {
    const media = source.isVideo && clip.showVideoPlayer ? videoRef.current : audioRef.current;
    if (!media) return;

    if (isPreviewing) {
      media.pause();
      setIsPreviewing(false);
    } else {
      media.currentTime = clip.startSeconds;
      media.play();
      setIsPreviewing(true);
    }
  };

  const handleTimeUpdate = () => {
    const media = source.isVideo && clip.showVideoPlayer ? videoRef.current : audioRef.current;
    if (!media) return;

    if (media.currentTime >= clip.endSeconds) {
      media.pause();
      media.currentTime = clip.startSeconds;
      setIsPreviewing(false);
    }
  };

  return (
    <div
      className={`bg-white border rounded-2xl p-5 shadow-sm transition ${
        isAuditioning
          ? 'border-amber-500 ring-2 ring-amber-200'
          : 'border-stone-200 hover:border-stone-300'
      }`}
    >
      {/* Hidden audio for preview */}
      <audio
        ref={audioRef}
        src={source.objectUrl}
        onTimeUpdate={handleTimeUpdate}
        onPause={() => setIsPreviewing(false)}
        onEnded={() => setIsPreviewing(false)}
      />

      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="w-7 h-7 rounded-lg bg-stone-900 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-sm">
            #{index + 1}
          </span>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <input
              type="text"
              value={clip.label}
              placeholder={`Clip #${index + 1} (e.g. Intro or Chorus)`}
              onChange={(e) => onUpdateLabel(clip.id, e.target.value)}
              className="text-sm font-bold text-stone-900 bg-stone-50 hover:bg-stone-100/80 focus:bg-white border border-transparent focus:border-stone-300 rounded-lg px-2.5 py-1 focus:outline-none transition w-48 sm:w-56"
            />

            <div className="flex items-center gap-1.5 text-xs text-stone-500 pl-1">
              {source.isVideo ? (
                <Video className="w-3.5 h-3.5 text-stone-400 shrink-0" />
              ) : (
                <Music className="w-3.5 h-3.5 text-stone-400 shrink-0" />
              )}
              <span className="truncate max-w-[180px] sm:max-w-xs" title={source.name}>
                {source.name}
              </span>
              <span className="text-stone-400">({formatTime(source.duration)})</span>
            </div>
          </div>
        </div>

        {/* Toolbar Buttons */}
        <div className="flex items-center gap-1.5 self-end sm:self-auto">
          {/* In-Browser Preview Button */}
          <button
            type="button"
            onClick={togglePreview}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition ${
              isPreviewing
                ? 'bg-amber-500 text-white border-amber-600'
                : 'bg-stone-100 hover:bg-stone-200 text-stone-800 border-stone-200'
            }`}
          >
            {isPreviewing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
            {isPreviewing ? 'Pause' : 'Play Clip'}
          </button>

          {/* Video Toggle if source is video */}
          {source.isVideo && (
            <button
              type="button"
              onClick={() => onToggleVideo(clip.id)}
              className={`p-1.5 rounded-lg border transition ${
                clip.showVideoPlayer
                  ? 'bg-stone-800 text-white border-stone-800'
                  : 'text-stone-600 hover:bg-stone-100 border-stone-200'
              }`}
              title="Show video player"
            >
              <Film className="w-4 h-4" />
            </button>
          )}

          {/* Visual Timeline Toggle */}
          <button
            type="button"
            onClick={() => onToggleWaveform(clip.id)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition ${
              clip.showWaveform
                ? 'bg-stone-800 text-white border-stone-800'
                : 'text-stone-700 bg-white hover:bg-stone-100 border-stone-200'
            }`}
            title="Open visual timeline editor to drag and adjust this clip"
          >
            <Scissors className="w-3.5 h-3.5" />
            {clip.showWaveform ? 'Hide Editor' : 'Trim Visually'}
          </button>

          {/* Add Another Section from this exact file */}
          <button
            type="button"
            onClick={() => onAddAnotherCut(source.id, index)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-stone-700 bg-white hover:bg-stone-100 border border-stone-200 rounded-lg transition"
            title="Select another section from this file"
          >
            <Plus className="w-3.5 h-3.5 text-stone-500" />
            <span>+ Section</span>
          </button>

          {/* Move Up/Down */}
          <button
            type="button"
            onClick={() => onMoveClip(index, 'up')}
            disabled={index === 0}
            className="p-1.5 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-lg border border-transparent hover:border-stone-200 disabled:opacity-25 transition"
            title="Move earlier"
          >
            <ArrowUp className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => onMoveClip(index, 'down')}
            disabled={index === totalClips - 1}
            className="p-1.5 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-lg border border-transparent hover:border-stone-200 disabled:opacity-25 transition"
            title="Move later"
          >
            <ArrowDown className="w-4 h-4" />
          </button>

          {/* Remove */}
          <button
            type="button"
            onClick={() => onRemoveClip(clip.id)}
            className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg border border-transparent hover:border-red-200 transition"
            title="Delete clip"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Free-form Time Controls: Start, End, and Duration */}
      <div className="grid grid-cols-3 gap-3 mt-4 pt-3 border-t border-stone-100 text-xs">
        <div>
          <label className="block text-stone-500 font-medium mb-1">
            Start <span className="text-[10px] text-stone-400">(e.g. 0:15)</span>
          </label>
          <input
            type="text"
            value={startInput}
            onChange={(e) => setStartInput(e.target.value)}
            onBlur={handleStartCommit}
            onKeyDown={(e) => e.key === 'Enter' && handleStartCommit()}
            placeholder="0:00"
            className="w-full bg-stone-50 border border-stone-200 focus:bg-white rounded-lg px-3 py-1.5 text-stone-900 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-stone-400 transition"
          />
        </div>

        <div>
          <label className="block text-stone-500 font-medium mb-1">
            End <span className="text-[10px] text-stone-400">(e.g. 0:45)</span>
          </label>
          <input
            type="text"
            value={endInput}
            onChange={(e) => setEndInput(e.target.value)}
            onBlur={handleEndCommit}
            onKeyDown={(e) => e.key === 'Enter' && handleEndCommit()}
            placeholder="0:30"
            className="w-full bg-stone-50 border border-stone-200 focus:bg-white rounded-lg px-3 py-1.5 text-stone-900 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-stone-400 transition"
          />
        </div>

        <div>
          <label className="block text-stone-500 font-medium mb-1">
            Length <span className="text-[10px] text-stone-400">(seconds)</span>
          </label>
          <div className="relative">
            <input
              type="text"
              value={durationInput}
              onChange={(e) => setDurationInput(e.target.value)}
              onBlur={handleDurationCommit}
              onKeyDown={(e) => e.key === 'Enter' && handleDurationCommit()}
              placeholder="15.0"
              className="w-full bg-stone-50 border border-stone-200 focus:bg-white rounded-lg px-3 py-1.5 text-stone-900 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-stone-400 transition pr-7"
            />
            <span className="absolute right-2.5 top-2 text-xs font-mono text-stone-400 pointer-events-none">
              s
            </span>
          </div>
        </div>
      </div>

      {/* Optional In-Browser Video Player */}
      {source.isVideo && clip.showVideoPlayer && (
        <div className="mt-4 bg-stone-900 rounded-xl p-3 flex flex-col items-center">
          <p className="text-[11px] font-medium text-stone-300 mb-2">
            Video Preview ({formatTime(clip.startSeconds)} to {formatTime(clip.endSeconds)})
          </p>
          <video
            ref={videoRef}
            src={source.objectUrl}
            controls
            onTimeUpdate={handleTimeUpdate}
            onPause={() => setIsPreviewing(false)}
            onEnded={() => setIsPreviewing(false)}
            className="max-h-60 rounded-lg shadow-md"
          />
        </div>
      )}

      {/* Waveform Drawer */}
      {clip.showWaveform && (
        <WaveformTrimmer
          file={source.file}
          startSeconds={clip.startSeconds}
          endSeconds={clip.endSeconds}
          onRangeChange={(start, end) => onUpdateRange(clip.id, start, end)}
        />
      )}
    </div>
  );
};
