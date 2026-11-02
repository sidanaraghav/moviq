import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  ArrowUp,
  ArrowDown,
  Trash2,
  Scissors,
} from 'lucide-react';
import { WaveformTrimmer } from './WaveformTrimmer';
import { formatTime, parseTime } from '../utils/timeFormat';

export interface SectionItem {
  id: string;
  startSeconds: number;
  endSeconds: number;
  label: string;
  showVisualEditor: boolean;
}

interface SectionCardProps {
  section: SectionItem;
  sectionIndex: number;
  totalSections: number;
  clipIndex: number;
  file: File;
  sourceDuration: number;
  sourceObjectUrl: string;
  isAuditioning?: boolean;
  onUpdateRange: (sectionId: string, start: number, end: number) => void;
  onUpdateLabel: (sectionId: string, label: string) => void;
  onToggleVisualEditor: (sectionId: string) => void;
  onMoveSection: (sectionIndex: number, direction: 'up' | 'down') => void;
  onRemoveSection: (sectionId: string) => void;
}

export const SectionCard: React.FC<SectionCardProps> = ({
  section,
  sectionIndex,
  totalSections,
  clipIndex,
  file,
  sourceDuration,
  sourceObjectUrl,
  isAuditioning = false,
  onUpdateRange,
  onUpdateLabel,
  onToggleVisualEditor,
  onMoveSection,
  onRemoveSection,
}) => {
  // Local string states for smooth free-form typing without cursor fighting
  const [startInput, setStartInput] = useState(formatTime(section.startSeconds));
  const [endInput, setEndInput] = useState(formatTime(section.endSeconds));
  const [durationInput, setDurationInput] = useState(
    (section.endSeconds - section.startSeconds).toFixed(1)
  );

  // In-browser preview state for this specific section
  const [isPreviewing, setIsPreviewing] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Sync inputs whenever parent section props update (e.g. from waveform dragging)
  useEffect(() => {
    setStartInput(formatTime(section.startSeconds));
    setEndInput(formatTime(section.endSeconds));
    setDurationInput((section.endSeconds - section.startSeconds).toFixed(1));
  }, [section.startSeconds, section.endSeconds]);

  const maxDuration = sourceDuration > 0 ? sourceDuration : 3600;

  const handleStartCommit = () => {
    const parsed = parseTime(startInput);
    if (parsed !== null && parsed >= 0) {
      const safeStart = Math.min(parsed, Math.max(0, maxDuration - 0.2));
      let safeEnd = section.endSeconds;
      if (safeEnd <= safeStart) {
        safeEnd = Math.min(maxDuration, safeStart + 10);
      }
      onUpdateRange(section.id, safeStart, safeEnd);
    } else {
      setStartInput(formatTime(section.startSeconds));
    }
  };

  const handleEndCommit = () => {
    const parsed = parseTime(endInput);
    if (parsed !== null && parsed > 0) {
      const safeEnd = Math.min(parsed, maxDuration);
      let safeStart = section.startSeconds;
      if (safeStart >= safeEnd) {
        safeStart = Math.max(0, safeEnd - 10);
      }
      onUpdateRange(section.id, safeStart, safeEnd);
    } else {
      setEndInput(formatTime(section.endSeconds));
    }
  };

  const handleDurationCommit = () => {
    const parsed = parseTime(durationInput);
    if (parsed !== null && parsed > 0) {
      const safeEnd = Math.min(maxDuration, section.startSeconds + parsed);
      onUpdateRange(section.id, section.startSeconds, safeEnd);
    } else {
      setDurationInput((section.endSeconds - section.startSeconds).toFixed(1));
    }
  };

  const togglePreview = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPreviewing) {
      audio.pause();
      setIsPreviewing(false);
    } else {
      audio.currentTime = section.startSeconds;
      audio.play().catch(() => setIsPreviewing(false));
      setIsPreviewing(true);
    }
  };

  const handleTimeUpdate = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.currentTime >= section.endSeconds) {
      audio.pause();
      audio.currentTime = section.startSeconds;
      setIsPreviewing(false);
    }
  };

  return (
    <div
      className={`rounded-xl border transition p-4 ${
        isAuditioning
          ? 'bg-amber-50/60 border-amber-400 ring-2 ring-amber-200'
          : 'bg-white border-stone-200/90 shadow-2xs hover:border-stone-300'
      }`}
    >
      {/* Hidden audio element for previewing this specific section */}
      <audio
        ref={audioRef}
        src={sourceObjectUrl}
        onTimeUpdate={handleTimeUpdate}
        onPause={() => setIsPreviewing(false)}
        onEnded={() => setIsPreviewing(false)}
      />

      {/* Section Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <span className="px-2 py-0.5 rounded-md bg-stone-100 border border-stone-200/80 text-stone-700 font-semibold text-xs tracking-tight">
            Section {sectionIndex + 1}
          </span>

          <input
            type="text"
            value={section.label}
            placeholder={`Clip ${clipIndex + 1}, Section ${sectionIndex + 1} label (optional)`}
            onChange={(e) => onUpdateLabel(section.id, e.target.value)}
            className="text-xs font-medium text-stone-800 bg-stone-50 hover:bg-stone-100/70 focus:bg-white border border-transparent focus:border-stone-300 rounded-lg px-2.5 py-1 focus:outline-none transition w-44 sm:w-56"
          />
        </div>

        {/* Section Action Buttons */}
        <div className="flex items-center gap-1.5 self-end sm:self-auto">
          {/* Play/Pause Button */}
          <button
            type="button"
            onClick={togglePreview}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border transition ${
              isPreviewing
                ? 'bg-amber-500 text-white border-amber-600'
                : 'bg-stone-100 hover:bg-stone-200 text-stone-800 border-stone-200'
            }`}
            title="Listen to this section"
          >
            {isPreviewing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
            {isPreviewing ? 'Pause' : 'Play Section'}
          </button>

          {/* Toggle Timeline */}
          <button
            type="button"
            onClick={() => onToggleVisualEditor(section.id)}
            className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-lg border transition ${
              section.showVisualEditor
                ? 'bg-stone-800 text-white border-stone-800'
                : 'text-stone-700 bg-white hover:bg-stone-100 border-stone-200'
            }`}
            title={section.showVisualEditor ? 'Hide visual timeline' : 'Show visual timeline'}
          >
            <Scissors className="w-3 h-3" />
            {section.showVisualEditor ? 'Hide Timeline' : 'Visual Editor'}
          </button>

          {/* Move Up/Down within this Clip */}
          {totalSections > 1 && (
            <>
              <button
                type="button"
                onClick={() => onMoveSection(sectionIndex, 'up')}
                disabled={sectionIndex === 0}
                className="p-1 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-lg border border-transparent hover:border-stone-200 disabled:opacity-25 transition"
                title="Move earlier in this clip"
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => onMoveSection(sectionIndex, 'down')}
                disabled={sectionIndex === totalSections - 1}
                className="p-1 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-lg border border-transparent hover:border-stone-200 disabled:opacity-25 transition"
                title="Move later in this clip"
              >
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          {/* Delete Section */}
          <button
            type="button"
            onClick={() => onRemoveSection(section.id)}
            className="p-1 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg border border-transparent hover:border-red-200 transition"
            title="Delete this section"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Free-form Time Controls: Start, End, and Length */}
      <div className="grid grid-cols-3 gap-2.5 mt-3 pt-2.5 border-t border-stone-100 text-xs">
        <div>
          <label className="block text-stone-500 font-medium mb-1 text-[11px]">
            Start <span className="text-[10px] text-stone-400">(e.g. 0:15)</span>
          </label>
          <input
            type="text"
            value={startInput}
            onChange={(e) => setStartInput(e.target.value)}
            onBlur={handleStartCommit}
            onKeyDown={(e) => e.key === 'Enter' && handleStartCommit()}
            placeholder="0:00"
            className="w-full bg-stone-50 border border-stone-200 focus:bg-white rounded-lg px-2.5 py-1 text-stone-900 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-stone-400 transition"
          />
        </div>

        <div>
          <label className="block text-stone-500 font-medium mb-1 text-[11px]">
            End <span className="text-[10px] text-stone-400">(e.g. 0:45)</span>
          </label>
          <input
            type="text"
            value={endInput}
            onChange={(e) => setEndInput(e.target.value)}
            onBlur={handleEndCommit}
            onKeyDown={(e) => e.key === 'Enter' && handleEndCommit()}
            placeholder="0:30"
            className="w-full bg-stone-50 border border-stone-200 focus:bg-white rounded-lg px-2.5 py-1 text-stone-900 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-stone-400 transition"
          />
        </div>

        <div>
          <label className="block text-stone-500 font-medium mb-1 text-[11px]">
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
              className="w-full bg-stone-50 border border-stone-200 focus:bg-white rounded-lg px-2.5 py-1 text-stone-900 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-stone-400 transition pr-6"
            />
            <span className="absolute right-2 top-1.5 text-[11px] font-mono text-stone-400 pointer-events-none">
              s
            </span>
          </div>
        </div>
      </div>

      {/* Visual Timeline Drawer (shown by default) */}
      {section.showVisualEditor && (
        <WaveformTrimmer
          file={file}
          startSeconds={section.startSeconds}
          endSeconds={section.endSeconds}
          onRangeChange={(start, end) => onUpdateRange(section.id, start, end)}
        />
      )}
    </div>
  );
};
