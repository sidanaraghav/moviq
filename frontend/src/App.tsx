import React, { useState, useRef } from 'react';
import {
  Upload,
  Music,
  Video,
  ArrowUp,
  ArrowDown,
  Trash2,
  Plus,
  Scissors,
  Download,
  AlertCircle,
  Loader2,
  Sparkles,
  Volume2,
} from 'lucide-react';
import { WaveformTrimmer } from './components/WaveformTrimmer';

interface SourceFile {
  id: string;
  file: File;
  name: string;
  duration: number;
  isVideo: boolean;
}

interface ClipItem {
  id: string;
  sourceFileId: string;
  startSeconds: number;
  endSeconds: number;
  label?: string;
  showWaveform: boolean;
}

export default function App() {
  const [sourceFiles, setSourceFiles] = useState<SourceFile[]>([]);
  const [clips, setClips] = useState<ClipItem[]>([]);
  const [crossfadeSeconds, setCrossfadeSeconds] = useState<number>(0);
  const [normalizeVolume, setNormalizeVolume] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [masterAudioUrl, setMasterAudioUrl] = useState<string | null>(null);

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
      const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|mkv|webm|avi|m4v)$/i.test(file.name);

      // Probe duration in browser
      const media = document.createElement(isVideo ? 'video' : 'audio');
      const objectUrl = URL.createObjectURL(file);
      media.src = objectUrl;

      media.onloadedmetadata = () => {
        const duration = Math.round((media.duration || 60) * 10) / 10;
        URL.revokeObjectURL(objectUrl);

        const newSource: SourceFile = {
          id: fileId,
          file,
          name: file.name,
          duration,
          isVideo,
        };

        setSourceFiles((prev) => [...prev, newSource]);

        // Automatically create initial clip for this file
        const initialEnd = Math.min(duration, 30);
        const newClip: ClipItem = {
          id: `clip-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          sourceFileId: fileId,
          startSeconds: 0,
          endSeconds: initialEnd,
          showWaveform: false,
        };
        setClips((prev) => [...prev, newClip]);
      };

      media.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        // Fallback if browser can't decode codec metadata (e.g. MKV)
        const fallbackSource: SourceFile = {
          id: fileId,
          file,
          name: file.name,
          duration: 180,
          isVideo,
        };
        setSourceFiles((prev) => [...prev, fallbackSource]);
        setClips((prev) => [
          ...prev,
          {
            id: `clip-${Date.now()}`,
            sourceFileId: fileId,
            startSeconds: 0,
            endSeconds: 30,
            showWaveform: false,
          },
        ]);
      };
    });
  };

  const updateClipRange = (clipId: string, start: number, end: number) => {
    setClips((prev) =>
      prev.map((clip) =>
        clip.id === clipId
          ? { ...clip, startSeconds: Math.max(0, start), endSeconds: Math.max(start + 0.1, end) }
          : clip
      )
    );
  };

  const toggleWaveform = (clipId: string) => {
    setClips((prev) =>
      prev.map((clip) =>
        clip.id === clipId ? { ...clip, showWaveform: !clip.showWaveform } : clip
      )
    );
  };

  const addDuplicateCut = (sourceFileId: string) => {
    const source = sourceFiles.find((s) => s.id === sourceFileId);
    if (!source) return;
    const newClip: ClipItem = {
      id: `clip-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      sourceFileId,
      startSeconds: 0,
      endSeconds: Math.min(source.duration, 20),
      showWaveform: true,
    };
    setClips((prev) => [...prev, newClip]);
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

  const totalEstimatedDuration = clips.reduce((acc, clip, idx) => {
    const duration = clip.endSeconds - clip.startSeconds;
    const overlap = idx > 0 ? crossfadeSeconds : 0;
    return Math.max(0, acc + duration - overlap);
  }, 0);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const generateMix = async () => {
    if (clips.length === 0) {
      setErrorMessage('Please add at least one clip before generating a mix.');
      return;
    }

    setIsGenerating(true);
    setErrorMessage(null);

    try {
      // Build mapping from unique files to fileIndex
      const uniqueSourceIds = Array.from(new Set(clips.map((c) => c.sourceFileId)));
      const uniqueSources = uniqueSourceIds.map((id) => sourceFiles.find((s) => s.id === id)!);

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

      // Trigger automatic download
      const a = document.createElement('a');
      a.href = url;
      a.download = 'wedding_master_mix.mp3';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred while generating the mix.');
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
            <p className="text-sm text-stone-500">Event Performance & Sangeet Medley Builder</p>
          </div>
        </div>
      </header>

      {/* Error message */}
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
            Step 1: Add Songs or Videos
          </h2>
          <span className="text-xs text-stone-500">Supports MP3, WAV, M4A, MP4 Reels, MOV</span>
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
            Click to upload or drag & drop files here
          </p>
          <p className="text-xs text-stone-500 mt-1">
            Reel screen recordings, Spotify/YouTube downloads, or audio tracks (up to 50MB each)
          </p>
        </div>
      </section>

      {/* Step 2: Sequence of clips */}
      {clips.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold tracking-wider uppercase text-stone-500">
              Step 2: Arrange Performance Sequence ({clips.length} {clips.length === 1 ? 'clip' : 'clips'})
            </h2>
            <div className="text-xs font-medium text-stone-700 bg-stone-100 px-3 py-1 rounded-full border border-stone-200">
              Estimated Master Duration: <span className="font-mono font-bold text-stone-900">{formatTime(totalEstimatedDuration)}</span>
            </div>
          </div>

          <div className="space-y-4">
            {clips.map((clip, index) => {
              const source = sourceFiles.find((s) => s.id === clip.sourceFileId);
              if (!source) return null;
              const clipDuration = Math.max(0, clip.endSeconds - clip.startSeconds);

              return (
                <div
                  key={clip.id}
                  className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm transition hover:border-stone-300"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="w-7 h-7 rounded-lg bg-stone-100 text-stone-700 font-bold text-xs flex items-center justify-center border border-stone-200 shrink-0">
                        #{index + 1}
                      </span>
                      <div className="flex items-center gap-2 overflow-hidden">
                        {source.isVideo ? (
                          <Video className="w-4 h-4 text-stone-500 shrink-0" />
                        ) : (
                          <Music className="w-4 h-4 text-stone-500 shrink-0" />
                        )}
                        <span className="font-semibold text-stone-900 text-sm truncate max-w-[240px] sm:max-w-xs" title={source.name}>
                          {source.name}
                        </span>
                        {source.isVideo && (
                          <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-stone-100 text-stone-600 border border-stone-200">
                            Video Audio
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1.5 self-end sm:self-auto">
                      <button
                        type="button"
                        onClick={() => toggleWaveform(clip.id)}
                        className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border transition ${
                          clip.showWaveform
                            ? 'bg-stone-900 text-white border-stone-900'
                            : 'bg-stone-50 text-stone-700 hover:bg-stone-100 border-stone-200'
                        }`}
                      >
                        <Scissors className="w-3.5 h-3.5" />
                        {clip.showWaveform ? 'Hide Waveform' : 'Visual Waveform'}
                      </button>

                      <button
                        type="button"
                        onClick={() => addDuplicateCut(source.id)}
                        className="p-1.5 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-lg border border-transparent hover:border-stone-200 transition"
                        title="Add another cut from this track"
                      >
                        <Plus className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => moveClip(index, 'up')}
                        disabled={index === 0}
                        className="p-1.5 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-lg border border-transparent hover:border-stone-200 disabled:opacity-30 transition"
                        title="Move Up"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => moveClip(index, 'down')}
                        disabled={index === clips.length - 1}
                        className="p-1.5 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-lg border border-transparent hover:border-stone-200 disabled:opacity-30 transition"
                        title="Move Down"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => removeClip(clip.id)}
                        className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg border border-transparent hover:border-red-200 transition"
                        title="Remove Clip"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Manual timestamp inputs */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4 pt-3 border-t border-stone-100 text-xs">
                    <div>
                      <label className="block text-stone-500 font-medium mb-1">
                        Start Second
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max={source.duration}
                        value={clip.startSeconds}
                        onChange={(e) =>
                          updateClipRange(clip.id, parseFloat(e.target.value) || 0, clip.endSeconds)
                        }
                        className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-1.5 text-stone-900 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-stone-400"
                      />
                    </div>

                    <div>
                      <label className="block text-stone-500 font-medium mb-1">
                        End Second
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="0.1"
                        max={source.duration}
                        value={clip.endSeconds}
                        onChange={(e) =>
                          updateClipRange(clip.id, clip.startSeconds, parseFloat(e.target.value) || 1)
                        }
                        className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-1.5 text-stone-900 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-stone-400"
                      />
                    </div>

                    <div className="col-span-2 sm:col-span-1 flex flex-col justify-end">
                      <div className="bg-stone-100/80 rounded-lg px-3 py-2 text-stone-700 flex items-center justify-between border border-stone-200/60">
                        <span>Snippet:</span>
                        <span className="font-mono font-bold text-stone-900">{clipDuration.toFixed(1)}s</span>
                      </div>
                    </div>
                  </div>

                  {/* Waveform Drawer */}
                  {clip.showWaveform && (
                    <WaveformTrimmer
                      file={source.file}
                      startSeconds={clip.startSeconds}
                      endSeconds={clip.endSeconds}
                      onRangeChange={(start, end) => updateClipRange(clip.id, start, end)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Step 3: Transition & Volume Settings */}
      {clips.length > 0 && (
        <section className="mb-8 bg-white border border-stone-200 rounded-2xl p-6 shadow-sm">
          <h2 className="text-sm font-semibold tracking-wider uppercase text-stone-500 mb-4">
            Step 3: DJ & Transition Settings
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Crossfade Selector */}
            <div>
              <label className="block text-sm font-medium text-stone-800 mb-1">
                Transition Between Songs
              </label>
              <p className="text-xs text-stone-500 mb-2">
                Clean cut is recommended for dance performances so beats aren't blurred.
              </p>
              <select
                value={crossfadeSeconds}
                onChange={(e) => setCrossfadeSeconds(parseFloat(e.target.value))}
                className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm font-medium text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-400"
              >
                <option value={0}>Clean Cut (0s — Default for Dancers)</option>
                <option value={1}>1.0s Smooth Crossfade</option>
                <option value={2}>2.0s Smooth Crossfade</option>
                <option value={3}>3.0s Long Crossfade</option>
              </select>
            </div>

            {/* Volume Normalization */}
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
                    Auto-Level Volume (EBU R128)
                  </span>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Equalizes quiet Instagram reel audios with loud studio music videos so the sound system doesn't blow out.
                  </p>
                </div>
              </label>
            </div>
          </div>
        </section>
      )}

      {/* Step 4: Generate Action */}
      {clips.length > 0 && (
        <section className="mb-12">
          <button
            type="button"
            onClick={generateMix}
            disabled={isGenerating}
            className="w-full py-4 px-6 rounded-2xl bg-stone-900 hover:bg-black text-white font-semibold text-base shadow-lg shadow-stone-900/10 flex items-center justify-center gap-2 disabled:opacity-50 transition"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin text-stone-300" />
                Trimming & Stitching Mix in Spring Boot...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5 text-amber-400" />
                Generate Master Mix ({clips.length} {clips.length === 1 ? 'clip' : 'clips'} • ~{formatTime(totalEstimatedDuration)})
              </>
            )}
          </button>
        </section>
      )}

      {/* Completed Master Mix Player */}
      {masterAudioUrl && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-emerald-950 mb-10 shadow-sm animate-in fade-in">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <h3 className="font-bold text-sm text-emerald-900">Your Master Mix is Ready!</h3>
            </div>
            <a
              href={masterAudioUrl}
              download="wedding_master_mix.mp3"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              Download MP3
            </a>
          </div>

          <p className="text-xs text-emerald-800 mb-4">
            Listen to your stitched mix below to verify the cuts before sharing with the venue DJ or choreographers.
          </p>

          <audio controls src={masterAudioUrl} className="w-full rounded-lg" />
        </div>
      )}
    </div>
  );
}
