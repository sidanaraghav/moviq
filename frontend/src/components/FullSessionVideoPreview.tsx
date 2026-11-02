import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  X,
  Volume2,
  VolumeX,
  Film,
  Music,
  Download,
} from 'lucide-react';
import { formatTime } from '../utils/timeFormat';

export interface PlayableSection {
  clipIndex: number;
  sectionIndex: number;
  clipId: string;
  sectionId: string;
  sourceUrl: string;
  startSeconds: number;
  endSeconds: number;
  displayName: string;
  isVideo: boolean;
  title: string;
}

interface FullSessionVideoPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  sections: PlayableSection[];
  onExportVideo?: () => void;
}

export const FullSessionVideoPreview: React.FC<FullSessionVideoPreviewProps> = ({
  isOpen,
  onClose,
  sections,
  onExportVideo,
}) => {
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [currentCutTime, setCurrentCutTime] = useState<number>(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const currentSection = sections[currentIndex] || null;

  // Calculate total medley duration
  const totalDuration = sections.reduce(
    (acc, s) => acc + Math.max(0, s.endSeconds - s.startSeconds),
    0
  );

  // Calculate elapsed time prior to current cut
  const elapsedPriorToCurrent = sections
    .slice(0, currentIndex)
    .reduce((acc, s) => acc + Math.max(0, s.endSeconds - s.startSeconds), 0);

  const currentOverallElapsed = Math.min(
    totalDuration,
    elapsedPriorToCurrent + Math.max(0, currentCutTime - (currentSection?.startSeconds || 0))
  );

  // Reset to first section when opened
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(0);
      setIsPlaying(true);
      if (sections[0]) {
        setCurrentCutTime(sections[0].startSeconds);
      }
    } else {
      setIsPlaying(false);
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    }
  }, [isOpen, sections]);

  // Load and play when currentSection changes
  useEffect(() => {
    if (!isOpen || !currentSection) return;

    setCurrentCutTime(currentSection.startSeconds);

    if (currentSection.isVideo) {
      const v = videoRef.current;
      if (v) {
        v.src = currentSection.sourceUrl;
        v.currentTime = currentSection.startSeconds;
        v.muted = isMuted;
        if (isPlaying) {
          v.play().catch(() => setIsPlaying(false));
        }
      }
    } else {
      const a = audioRef.current;
      if (a) {
        a.src = currentSection.sourceUrl;
        a.currentTime = currentSection.startSeconds;
        a.muted = isMuted;
        if (isPlaying) {
          a.play().catch(() => setIsPlaying(false));
        }
      }
    }
  }, [currentIndex, isOpen, currentSection?.sourceUrl, currentSection?.startSeconds]);

  // Handle play/pause state changes
  useEffect(() => {
    if (!isOpen || !currentSection) return;

    const media = currentSection.isVideo ? videoRef.current : audioRef.current;
    if (!media) return;

    if (isPlaying) {
      media.play().catch(() => setIsPlaying(false));
    } else {
      media.pause();
    }
  }, [isPlaying, isOpen, currentSection]);

  // Handle mute changes
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = isMuted;
    if (audioRef.current) audioRef.current.muted = isMuted;
  }, [isMuted]);

  // Animate dynamic waveform title card on canvas when playing an audio-only cut
  useEffect(() => {
    if (!isOpen || !currentSection || currentSection.isVideo) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let tick = 0;
    const barCount = 48;

    const renderCard = () => {
      tick++;
      const w = canvas.width;
      const h = canvas.height;

      // Dark background
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#0f172a');
      grad.addColorStop(1, '#18181b');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Ambient warm glow in center
      const glow = ctx.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, 380);
      glow.addColorStop(0, 'rgba(245, 158, 11, 0.12)');
      glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      // Translucent rounded card
      const cardW = Math.min(w - 80, 800);
      const cardH = Math.min(h - 80, 420);
      const cardX = (w - cardW) / 2;
      const cardY = (h - cardH) / 2;

      ctx.fillStyle = 'rgba(30, 41, 59, 0.85)';
      ctx.beginPath();
      ctx.roundRect(cardX, cardY, cardW, cardH, 24);
      ctx.fill();
      ctx.strokeStyle = 'rgba(71, 85, 105, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Audio Badge
      const badgeW = 160;
      const badgeH = 32;
      const badgeX = (w - badgeW) / 2;
      const badgeY = cardY + 36;
      ctx.fillStyle = 'rgba(245, 158, 11, 0.2)';
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 16);
      ctx.fill();
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.8)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('AUDIO TRACK', w / 2, badgeY + badgeH / 2);

      // Track Title
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px sans-serif';
      let title = currentSection.title.replace(/\.[^/.]+$/, '');
      if (title.length > 36) title = title.substring(0, 36) + '...';
      ctx.fillText(title, w / 2, badgeY + 84);

      // Subtitle
      ctx.fillStyle = '#94a3b8';
      ctx.font = '14px sans-serif';
      ctx.fillText(currentSection.displayName, w / 2, badgeY + 116);

      // Waveform Container
      const waveW = cardW - 80;
      const waveH = 100;
      const waveX = (w - waveW) / 2;
      const waveY = cardY + cardH - waveH - 36;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
      ctx.beginPath();
      ctx.roundRect(waveX, waveY, waveW, waveH, 16);
      ctx.fill();
      ctx.strokeStyle = 'rgba(51, 65, 85, 0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Animated waveform bars
      const barWidth = (waveW - (barCount - 1) * 3) / barCount;
      for (let i = 0; i < barCount; i++) {
        const factor = isPlaying
          ? Math.sin(tick * 0.12 + i * 0.35) * 0.5 + 0.5
          : 0.15;
        const barHeight = Math.max(6, factor * (waveH - 24));
        const bx = waveX + i * (barWidth + 3);
        const by = waveY + (waveH - barHeight) / 2;

        const barGrad = ctx.createLinearGradient(0, by, 0, by + barHeight);
        barGrad.addColorStop(0, '#f59e0b');
        barGrad.addColorStop(1, '#d97706');
        ctx.fillStyle = barGrad;
        ctx.beginPath();
        ctx.roundRect(bx, by, barWidth, barHeight, 2);
        ctx.fill();
      }

      if (isPlaying) {
        animFrameRef.current = requestAnimationFrame(renderCard);
      }
    };

    animFrameRef.current = requestAnimationFrame(renderCard);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isOpen, currentSection, isPlaying]);

  // Handle media time update and track transitions
  const handleTimeUpdate = () => {
    if (!currentSection) return;
    const media = currentSection.isVideo ? videoRef.current : audioRef.current;
    if (!media) return;

    setCurrentCutTime(media.currentTime);

    // If reached end of cut
    if (media.currentTime >= currentSection.endSeconds || media.ended) {
      if (currentIndex + 1 < sections.length) {
        // Move to next cut in medley
        setCurrentIndex((prev) => prev + 1);
      } else {
        // Finished entire medley
        media.pause();
        setIsPlaying(false);
        setCurrentIndex(0);
      }
    }
  };

  const jumpToCut = (idx: number) => {
    if (idx < 0 || idx >= sections.length) return;
    setCurrentIndex(idx);
    setIsPlaying(true);
  };

  if (!isOpen || sections.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
      <div className="bg-stone-950 border border-stone-800 rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Modal Top Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-stone-800 bg-stone-900/60">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse"></span>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-white text-sm">
                Full Medley Video Preview
              </h3>
              <span className="text-[11px] font-semibold text-stone-400 bg-stone-800 px-2 py-0.5 rounded-md">
                Cut {currentIndex + 1} of {sections.length}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition cursor-pointer"
            title="Close Preview"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Video / Visual Screen Area (16:9 aspect) */}
        <div className="relative w-full aspect-video bg-black flex items-center justify-center overflow-hidden">
          {/* Active Cut: Video Footage */}
          {currentSection && currentSection.isVideo ? (
            <video
              ref={videoRef}
              src={currentSection.sourceUrl}
              playsInline
              onTimeUpdate={handleTimeUpdate}
              onPause={() => setIsPlaying(false)}
              onPlay={() => setIsPlaying(true)}
              onEnded={handleTimeUpdate}
              className="w-full h-full object-contain"
            />
          ) : (
            /* Active Cut: Aesthetic Title Card for Audio Tracks */
            <div className="w-full h-full relative">
              <canvas
                ref={canvasRef}
                width={960}
                height={540}
                className="w-full h-full object-contain"
              />
              <audio
                ref={audioRef}
                src={currentSection?.sourceUrl}
                onTimeUpdate={handleTimeUpdate}
                onPause={() => setIsPlaying(false)}
                onPlay={() => setIsPlaying(true)}
                onEnded={handleTimeUpdate}
              />
            </div>
          )}

          {/* Current Cut Floating Badge */}
          {currentSection && (
            <div className="absolute top-3 left-3 bg-stone-950/80 backdrop-blur-md border border-stone-800 px-3 py-1.5 rounded-xl flex items-center gap-2 text-xs text-stone-200 shadow-md">
              {currentSection.isVideo ? (
                <Film className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <Music className="w-3.5 h-3.5 text-amber-400" />
              )}
              <span className="font-semibold truncate max-w-[220px]">
                {currentSection.displayName}
              </span>
            </div>
          )}
        </div>

        {/* Multi-Section Visual Timeline Scrubber */}
        <div className="px-5 pt-3 bg-stone-900/90 border-t border-stone-800">
          <div className="flex items-center gap-1.5 h-3 bg-stone-800/80 rounded-full p-0.5 overflow-hidden">
            {sections.map((sec, idx) => {
              const dur = Math.max(0.1, sec.endSeconds - sec.startSeconds);
              const flexWeight = Math.max(1, Math.round(dur));
              const isPast = idx < currentIndex;
              const isCurrent = idx === currentIndex;

              let fillPercent = 0;
              if (isPast) fillPercent = 100;
              else if (isCurrent) {
                fillPercent = Math.min(
                  100,
                  Math.max(
                    0,
                    ((currentCutTime - sec.startSeconds) / dur) * 100
                  )
                );
              }

              return (
                <button
                  key={sec.sectionId}
                  type="button"
                  onClick={() => jumpToCut(idx)}
                  style={{ flex: flexWeight }}
                  className="h-full bg-stone-700/60 rounded-full overflow-hidden relative group cursor-pointer"
                  title={`Jump to: ${sec.displayName}`}
                >
                  <div
                    style={{ width: `${fillPercent}%` }}
                    className={`h-full transition-all duration-75 ${
                      isCurrent
                        ? 'bg-amber-400'
                        : isPast
                        ? 'bg-stone-400'
                        : 'bg-transparent'
                    }`}
                  />
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-[11px] text-stone-400 mt-1.5 font-mono">
            <span>{formatTime(currentOverallElapsed)}</span>
            <span>{formatTime(totalDuration)}</span>
          </div>
        </div>

        {/* Player Controls Bar */}
        <div className="px-5 py-3 bg-stone-900 flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Left: Previous / Play / Next */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => jumpToCut(currentIndex - 1)}
              disabled={currentIndex === 0}
              className="p-2 rounded-xl text-stone-300 hover:text-white hover:bg-stone-800 disabled:opacity-30 transition cursor-pointer"
              title="Previous Cut"
            >
              <SkipBack className="w-4 h-4 fill-current" />
            </button>

            <button
              type="button"
              onClick={() => setIsPlaying(!isPlaying)}
              className="w-10 h-10 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 flex items-center justify-center font-bold shadow-md transition cursor-pointer"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 fill-current ml-0.5" />
              )}
            </button>

            <button
              type="button"
              onClick={() => jumpToCut(currentIndex + 1)}
              disabled={currentIndex === sections.length - 1}
              className="p-2 rounded-xl text-stone-300 hover:text-white hover:bg-stone-800 disabled:opacity-30 transition cursor-pointer"
              title="Next Cut"
            >
              <SkipForward className="w-4 h-4 fill-current" />
            </button>

            <button
              type="button"
              onClick={() => setIsMuted(!isMuted)}
              className="p-2 rounded-xl text-stone-400 hover:text-stone-200 hover:bg-stone-800 transition cursor-pointer ml-1"
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? (
                <VolumeX className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* Right: Quick Action to Export */}
          {onExportVideo && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-stone-400 hidden sm:inline">
                Looks good?
              </span>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onExportVideo();
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-stone-100 hover:bg-white text-stone-900 rounded-xl font-semibold text-xs transition shadow-sm cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Final Video (MP4)</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
