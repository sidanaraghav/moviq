import React, { useState, useRef } from 'react';
import {
  Upload,
  Music,
  Video,
  Download,
  AlertCircle,
  Loader2,
  Sparkles,
  Volume2,
  Plus,
  Play,
  Pause,
} from 'lucide-react';
import { ClipCard, SourceFile, ClipItem } from './components/ClipCard';
import { formatTime } from './utils/timeFormat';

export default function App() {
  const [sourceFiles, setSourceFiles] = useState<SourceFile[]>([]);
  const [clips, setClips] = useState<ClipItem[]>([]);
  const [crossfadeSeconds, setCrossfadeSeconds] = useState<number>(0);
  const [normalizeVolume, setNormalizeVolume] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [masterAudioUrl, setMasterAudioUrl] = useState<string | null>(null);

  // In-browser sequential audition player
  const [auditionIndex, setAuditionIndex] = useState<number | null>(null);
  const auditionAudioRef = useRef<HTMLAudioElement | null>(null);
  const clipsRef = useRef(clips);
  clipsRef.current = clips;
  const sourceFilesRef = useRef(sourceFiles);
  sourceFilesRef.current = sourceFiles;

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    processNewFiles(Array.from(files));
    event.target.value = '';
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      processNewFiles(Array.from(event.dataTransfer.files));
    }
  };

  const processNewFiles = (newFiles: File[]) => {
    setErrorMessage(null);
    newFiles.forEach((file) => {
      const fileId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const isVideo =
        file.type.startsWith('video/') ||
        /\.(mp4|mov|mkv|webm|avi|m4v)$/i.test(file.name);

      const objectUrl = URL.createObjectURL(file);
      const media = document.createElement(isVideo ? 'video' : 'audio');
      media.src = objectUrl;

      media.onloadedmetadata = () => {
        const duration = Math.round((media.duration || 60) * 10) / 10;

        const newSource: SourceFile = {
          id: fileId,
          file,
          name: file.name,
          duration,
          isVideo,
          objectUrl,
        };

        setSourceFiles((prev) => [...prev, newSource]);

        // Add initial clip for this source
        const initialEnd = Math.min(duration, 30);
        const newClip: ClipItem = {
          id: `clip-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          sourceFileId: fileId,
          startSeconds: 0,
          endSeconds: initialEnd,
          label: '',
          showWaveform: false,
          showVideoPlayer: false,
        };
        setClips((prev) => [...prev, newClip]);
      };

      media.onerror = () => {
        const fallbackSource: SourceFile = {
          id: fileId,
          file,
          name: file.name,
          duration: 180,
          isVideo,
          objectUrl,
        };
        setSourceFiles((prev) => [...prev, fallbackSource]);
        setClips((prev) => [
          ...prev,
          {
            id: `clip-${Date.now()}`,
            sourceFileId: fileId,
            startSeconds: 0,
            endSeconds: 30,
            label: '',
            showWaveform: false,
            showVideoPlayer: false,
          },
        ]);
      };
    });
  };

  const updateClipRange = (clipId: string, start: number, end: number) => {
    setClips((prev) =>
      prev.map((clip) =>
        clip.id === clipId
          ? {
              ...clip,
              startSeconds: Math.max(0, start),
              endSeconds: Math.max(start + 0.1, end),
            }
          : clip
      )
    );
  };

  const updateClipLabel = (clipId: string, label: string) => {
    setClips((prev) =>
      prev.map((clip) => (clip.id === clipId ? { ...clip, label } : clip))
    );
  };

  const toggleWaveform = (clipId: string) => {
    setClips((prev) =>
      prev.map((clip) =>
        clip.id === clipId ? { ...clip, showWaveform: !clip.showWaveform } : clip
      )
    );
  };

  const toggleVideoPlayer = (clipId: string) => {
    setClips((prev) =>
      prev.map((clip) =>
        clip.id === clipId
          ? { ...clip, showVideoPlayer: !clip.showVideoPlayer }
          : clip
      )
    );
  };

  const addAnotherCut = (sourceFileId: string, insertAfterIndex?: number) => {
    const source = sourceFiles.find((s) => s.id === sourceFileId);
    if (!source) return;

    // Default: pick the next 20 seconds, or 0 to 20
    const newClip: ClipItem = {
      id: `clip-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      sourceFileId,
      startSeconds: 0,
      endSeconds: Math.min(source.duration, 20),
      label: '',
      showWaveform: true,
      showVideoPlayer: false,
    };

    setClips((prev) => {
      if (typeof insertAfterIndex === 'number' && insertAfterIndex >= 0) {
        const next = [...prev];
        next.splice(insertAfterIndex + 1, 0, newClip);
        return next;
      }
      return [...prev, newClip];
    });
  };

  const moveClip = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= clips.length) return;
    const reordered = [...clips];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);
    setClips(reordered);
  };

  const removeClip = (clipId: string) => {
    setClips((prev) => prev.filter((c) => c.id !== clipId));
  };

  const startAuditionClip = (idx: number) => {
    const currentClips = clipsRef.current;
    if (idx < 0 || idx >= currentClips.length) {
      setAuditionIndex(null);
      return;
    }
    const clip = currentClips[idx];
    const source = sourceFilesRef.current.find((s) => s.id === clip.sourceFileId);
    if (!source || !auditionAudioRef.current) {
      setAuditionIndex(null);
      return;
    }

    setAuditionIndex(idx);
    const audio = auditionAudioRef.current;
    audio.src = source.objectUrl;
    audio.currentTime = clip.startSeconds;
    audio.play().catch((e) => {
      console.warn('Audition playback notice:', e);
      setAuditionIndex(null);
    });
  };

  const toggleAudition = () => {
    if (auditionIndex !== null) {
      if (auditionAudioRef.current) {
        auditionAudioRef.current.pause();
      }
      setAuditionIndex(null);
    } else {
      if (clips.length > 0) {
        startAuditionClip(0);
      }
    }
  };

  const handleAuditionTimeUpdate = () => {
    if (auditionIndex === null || !auditionAudioRef.current) return;
    const currentClips = clipsRef.current;
    const currentClip = currentClips[auditionIndex];
    if (!currentClip) return;

    if (auditionAudioRef.current.currentTime >= currentClip.endSeconds) {
      if (auditionIndex + 1 < currentClips.length) {
        startAuditionClip(auditionIndex + 1);
      } else {
        auditionAudioRef.current.pause();
        setAuditionIndex(null);
      }
    }
  };

  const totalEstimatedDuration = clips.reduce((acc, clip, idx) => {
    const duration = clip.endSeconds - clip.startSeconds;
    const overlap = idx > 0 ? crossfadeSeconds : 0;
    return Math.max(0, acc + duration - overlap);
  }, 0);

  const generateMix = async () => {
    if (clips.length === 0) {
      setErrorMessage('Please add at least one clip before generating a mix.');
      return;
    }

    setIsGenerating(true);
    setErrorMessage(null);

    try {
      const uniqueSourceIds = Array.from(new Set(clips.map((c) => c.sourceFileId)));
      const uniqueSources = uniqueSourceIds.map((id) =>
        sourceFiles.find((s) => s.id === id)!
      );

      const sourceIdToIndex = new Map<string, number>();
      uniqueSources.forEach((src, idx) => sourceIdToIndex.set(src.id, idx));

      const manifestClips = clips.map((c) => ({
        fileIndex: sourceIdToIndex.get(c.sourceFileId) ?? 0,
        startSeconds: c.startSeconds,
        endSeconds: c.endSeconds,
      }));

      const manifest = {
        crossfadeSeconds,
        normalizeVolume,
        clips: manifestClips,
      };

      const formData = new FormData();
      uniqueSources.forEach((src) => {
        formData.append('files', src.file, src.name);
      });
      formData.append('manifest', JSON.stringify(manifest));

      const response = await fetch('/api/v1/audio/mixes', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let errText = 'Failed to generate mix.';
        try {
          const json = await response.json();
          errText = json.message || json.error || errText;
        } catch {
          errText = `Server returned status ${response.status}`;
        }
        throw new Error(errText);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setMasterAudioUrl(url);

      const a = document.createElement('a');
      a.href = url;
      a.download = 'cozicut_audio.mp3';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred while creating your audio.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <header className="mb-8 pb-6 border-b border-stone-200">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-stone-900 text-stone-100 flex items-center justify-center font-bold text-lg shadow-sm">
            ✂️
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-stone-900">CoziCut</h1>
            <p className="text-sm text-stone-500">
              Trim & Combine Audio and Video Clips
            </p>
          </div>
        </div>
      </header>

      {/* Error alert */}
      {errorMessage && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 text-amber-900 text-sm">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Notice</p>
            <p className="text-amber-800">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* Step 1: Upload Dropzone */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold tracking-wider uppercase text-stone-500">
            Step 1: Add Audio or Video Files
          </h2>
          <span className="text-xs text-stone-500">Audio and video files up to 50MB</span>
        </div>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-stone-300 hover:border-stone-500 rounded-2xl p-8 text-center bg-white hover:bg-stone-50/50 cursor-pointer transition shadow-sm"
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="audio/*,video/*,.mp3,.wav,.m4a,.aac,.flac,.ogg,.mp4,.mov,.mkv,.webm"
            className="hidden"
            onChange={handleFileUpload}
          />
          <div className="w-12 h-12 rounded-full bg-stone-100 text-stone-600 flex items-center justify-center mx-auto mb-3">
            <Upload className="w-6 h-6" />
          </div>
          <p className="text-sm font-semibold text-stone-800">
            Click to upload or drag & drop audio / video files here
          </p>
          <p className="text-xs text-stone-500 mt-1">
            Audio tracks are automatically extracted from videos and combined with audio files
          </p>
        </div>

        {/* Uploaded media files library */}
        {sourceFiles.length > 0 && (
          <div className="mt-4 bg-stone-100/70 rounded-xl p-3 border border-stone-200/80">
            <div className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-2">
              Uploaded Files ({sourceFiles.length})
            </div>
            <div className="flex flex-wrap gap-2">
              {sourceFiles.map((src) => (
                <div
                  key={src.id}
                  className="bg-white border border-stone-200 rounded-lg px-3 py-1.5 flex items-center gap-2 text-xs shadow-2xs"
                >
                  {src.isVideo ? (
                    <Video className="w-3.5 h-3.5 text-stone-500" />
                  ) : (
                    <Music className="w-3.5 h-3.5 text-stone-500" />
                  )}
                  <span className="font-medium text-stone-800 truncate max-w-[160px]" title={src.name}>
                    {src.name}
                  </span>
                  <span className="text-stone-400 font-mono">({formatTime(src.duration)})</span>
                  <button
                    type="button"
                    onClick={() => addAnotherCut(src.id)}
                    className="ml-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded text-[11px] font-semibold transition"
                    title="Select another section from this file"
                  >
                    <Plus className="w-3 h-3" /> Section
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Hidden sequential audio audition player */}
      <audio
        ref={auditionAudioRef}
        onTimeUpdate={handleAuditionTimeUpdate}
        onEnded={() => {
          if (auditionIndex !== null && auditionIndex + 1 < clips.length) {
            startAuditionClip(auditionIndex + 1);
          } else {
            setAuditionIndex(null);
          }
        }}
        onPause={() => {
          // If not programmatically transitioning to next clip
        }}
      />

      {/* Step 2: Medley Sequence */}
      {clips.length > 0 && (
        <section className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
            <div>
              <h2 className="text-sm font-semibold tracking-wider uppercase text-stone-500">
                Step 2: Clip Sequence ({clips.length} {clips.length === 1 ? 'clip' : 'clips'})
              </h2>
              <p className="text-xs text-stone-400">
                Choose start and end times for each clip, then preview the sequence
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={toggleAudition}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full border transition ${
                  auditionIndex !== null
                    ? 'bg-amber-500 text-white border-amber-600 shadow-sm animate-pulse'
                    : 'bg-white hover:bg-stone-50 text-stone-800 border-stone-300 shadow-2xs'
                }`}
                title="Listen to all clips played in sequence"
              >
                {auditionIndex !== null ? (
                  <>
                    <Pause className="w-3.5 h-3.5" />
                    Stop Playing (Clip #{auditionIndex + 1} of {clips.length})
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    Listen to All Clips
                  </>
                )}
              </button>

              <div className="text-xs font-medium text-stone-700 bg-stone-100 px-3 py-1.5 rounded-full border border-stone-200">
                Total:{' '}
                <span className="font-mono font-bold text-stone-900">
                  {formatTime(totalEstimatedDuration)}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {clips.map((clip, index) => {
              const source = sourceFiles.find((s) => s.id === clip.sourceFileId);
              if (!source) return null;

              return (
                <ClipCard
                  key={clip.id}
                  clip={clip}
                  index={index}
                  totalClips={clips.length}
                  source={source}
                  isAuditioning={auditionIndex === index}
                  onUpdateRange={updateClipRange}
                  onUpdateLabel={updateClipLabel}
                  onToggleWaveform={toggleWaveform}
                  onToggleVideo={toggleVideoPlayer}
                  onAddAnotherCut={addAnotherCut}
                  onMoveClip={moveClip}
                  onRemoveClip={removeClip}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* Step 3: Transition & Volume Settings */}
      {clips.length > 0 && (
        <section className="mb-8 bg-white border border-stone-200 rounded-2xl p-6 shadow-sm">
          <h2 className="text-sm font-semibold tracking-wider uppercase text-stone-500 mb-4">
            Step 3: Transitions & Volume
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-stone-800 mb-1">
                Transition Between Clips
              </label>
              <p className="text-xs text-stone-500 mb-2">
                Choose whether clips cut directly or smoothly fade into each other.
              </p>
              <select
                value={crossfadeSeconds}
                onChange={(e) => setCrossfadeSeconds(parseFloat(e.target.value))}
                className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm font-medium text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-400"
              >
                <option value={0}>Direct Cut (Instant jump, no fade)</option>
                <option value={1}>1.0s Smooth Blend (Fade)</option>
                <option value={2}>2.0s Smooth Blend (Fade)</option>
                <option value={3}>3.0s Long Blend (Fade)</option>
              </select>
            </div>

            <div className="flex flex-col justify-center">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={normalizeVolume}
                  onChange={(e) => setNormalizeVolume(e.target.checked)}
                  className="mt-1 w-4 h-4 text-stone-900 border-stone-300 rounded focus:ring-stone-500 cursor-pointer"
                />
                <div>
                  <span className="text-sm font-medium text-stone-900 flex items-center gap-1.5">
                    <Volume2 className="w-4 h-4 text-stone-600" />
                    Balance Volume Levels
                  </span>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Automatically balances quiet and loud audio so all clips play at a smooth, even volume.
                  </p>
                </div>
              </label>
            </div>
          </div>
        </section>
      )}

      {/* Step 4: Export Final Audio */}
      {clips.length > 0 && (
        <section className="mb-12">
          <button
            type="button"
            onClick={generateMix}
            disabled={isGenerating}
            className="w-full py-4 px-6 rounded-2xl bg-stone-900 hover:bg-black text-white font-semibold text-base shadow-lg shadow-stone-900/10 flex items-center justify-center gap-2 disabled:opacity-50 transition cursor-pointer"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin text-stone-300" />
                Combining your audio clips...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5 text-amber-400" />
                Create & Download Combined Audio ({clips.length} {clips.length === 1 ? 'clip' : 'clips'} • ~
                {formatTime(totalEstimatedDuration)})
              </>
            )}
          </button>
        </section>
      )}

      {/* In-Browser Audio Player */}
      {masterAudioUrl && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-emerald-950 mb-10 shadow-sm animate-in fade-in">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <h3 className="font-bold text-sm text-emerald-900">
                Your Combined Audio is Ready!
              </h3>
            </div>
            <a
              href={masterAudioUrl}
              download="cozicut_audio.mp3"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              Download Audio (MP3)
            </a>
          </div>

          <p className="text-xs text-emerald-800 mb-4">
            Listen to your combined audio below, or download the audio file directly.
          </p>

          <audio controls src={masterAudioUrl} className="w-full rounded-lg" />
        </div>
      )}
    </div>
  );
}
