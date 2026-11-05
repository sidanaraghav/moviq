import React from 'react';
import { Film, Music, Sparkles } from 'lucide-react';

interface ExportProgressModalProps {
  isOpen: boolean;
  format: 'mp3' | 'mp4';
  progress: number;
  statusText: string;
}

export const ExportProgressModal: React.FC<ExportProgressModalProps> = ({
  isOpen,
  format,
  progress,
  statusText,
}) => {
  if (!isOpen) return null;

  const isVideo = format === 'mp4';
  const clampedProgress = Math.min(100, Math.max(0, Math.round(progress)));

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/75 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="w-full max-w-md bg-stone-900 border border-stone-800 rounded-3xl p-6 shadow-2xl text-stone-100 flex flex-col items-center text-center animate-in zoom-in-95 duration-200">
        {/* Animated Icon Glow */}
        <div className="relative mb-5">
          <div
            className={`absolute -inset-2 rounded-2xl blur-lg opacity-40 animate-pulse ${
              isVideo ? 'bg-amber-500' : 'bg-emerald-500'
            }`}
          />
          <div
            className={`relative w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg border ${
              isVideo
                ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
            }`}
          >
            {isVideo ? (
              <Film className="w-8 h-8 animate-bounce-subtle" />
            ) : (
              <Music className="w-8 h-8 animate-bounce-subtle" />
            )}
          </div>
        </div>

        {/* Modal Title */}
        <h3 className="text-lg font-bold text-white mb-1 flex items-center justify-center gap-2">
          <span>
            {isVideo ? 'Rendering Video Medley' : 'Combining Audio Mix'}
          </span>
          <Sparkles className={`w-4 h-4 ${isVideo ? 'text-amber-400' : 'text-emerald-400'}`} />
        </h3>

        {/* Dynamic Status Text */}
        <p className="text-xs text-stone-400 min-h-[36px] flex items-center justify-center px-4 mb-5">
          {statusText || 'Preparing your performance mix...'}
        </p>

        {/* Big Progress Percentage */}
        <div className="w-full flex items-baseline justify-between mb-2 px-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
            {clampedProgress < 25
              ? 'Uploading'
              : clampedProgress < 85
              ? isVideo
                ? 'Processing 720p HD'
                : 'Processing Audio'
              : 'Finalizing'}
          </span>
          <span
            className={`text-2xl font-black tabular-nums ${
              isVideo ? 'text-amber-400' : 'text-emerald-400'
            }`}
          >
            {clampedProgress}%
          </span>
        </div>

        {/* Progress Bar Container */}
        <div className="w-full h-3 bg-stone-800/90 rounded-full overflow-hidden p-0.5 border border-stone-700/60 shadow-inner">
          <div
            className={`h-full rounded-full transition-all duration-300 ease-out shadow-sm relative overflow-hidden ${
              isVideo
                ? 'bg-gradient-to-r from-amber-500 via-amber-400 to-amber-300'
                : 'bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-300'
            }`}
            style={{ width: `${clampedProgress}%` }}
          >
            {/* Shimmer light reflection effect */}
            <div className="absolute inset-0 bg-white/25 animate-shimmer" />
          </div>
        </div>

        {/* Bottom Helper Note */}
        <p className="text-[11px] text-stone-500 mt-5">
          Please keep this tab open while Moviq finishes your download.
        </p>
      </div>
    </div>
  );
};
