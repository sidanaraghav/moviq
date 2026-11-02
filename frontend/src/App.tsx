import React, { useState, useRef } from 'react';
import {
  Upload,
  Download,
  AlertCircle,
  Loader2,
  Sparkles,
  Volume2,
  Play,
  Pause,
} from 'lucide-react';
import { ClipGroupCard, ClipGroup } from './components/ClipGroupCard';
import { SectionItem } from './components/SectionCard';
import { formatTime } from './utils/timeFormat';

export default function App() {
  const [clipGroups, setClipGroups] = useState<ClipGroup[]>([]);
  const [crossfadeSeconds, setCrossfadeSeconds] = useState<number>(0);
  const [normalizeVolume, setNormalizeVolume] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [masterAudioUrl, setMasterAudioUrl] = useState<string | null>(null);

  // In-browser sequential audition player
  const [auditionIndex, setAuditionIndex] = useState<number | null>(null);
  const auditionAudioRef = useRef<HTMLAudioElement | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Flattened playable sections list
  const allPlayableSections = clipGroups.flatMap((group, gIdx) =>
    group.sections.map((sec, sIdx) => ({
      clipIndex: gIdx,
      sectionIndex: sIdx,
      clipId: group.id,
      sectionId: sec.id,
      sourceUrl: group.objectUrl,
      startSeconds: sec.startSeconds,
      endSeconds: sec.endSeconds,
      displayName: `Clip ${gIdx + 1}, Section ${sIdx + 1}${
        sec.label ? ` (${sec.label})` : ''
      }`,
    }))
  );

  const allPlayableSectionsRef = useRef(allPlayableSections);
  allPlayableSectionsRef.current = allPlayableSections;

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
        const initialEnd = Math.min(duration, 30);

        const newGroup: ClipGroup = {
          id: fileId,
          file,
          name: file.name,
          duration,
          isVideo,
          objectUrl,
          showVideoPlayer: false,
          sections: [
            {
              id: `sec-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              startSeconds: 0,
              endSeconds: initialEnd,
              label: '',
              showVisualEditor: true, // Visual trimmer timeline open by default
            },
          ],
        };

        setClipGroups((prev) => [...prev, newGroup]);
      };

      media.onerror = () => {
        const fallbackGroup: ClipGroup = {
          id: fileId,
          file,
          name: file.name,
          duration: 180,
          isVideo,
          objectUrl,
          showVideoPlayer: false,
          sections: [
            {
              id: `sec-${Date.now()}`,
              startSeconds: 0,
              endSeconds: 30,
              label: '',
              showVisualEditor: true,
            },
          ],
        };
        setClipGroups((prev) => [...prev, fallbackGroup]);
      };
    });
  };

  const updateSectionRange = (
    clipId: string,
    sectionId: string,
    start: number,
    end: number
  ) => {
    setClipGroups((prev) =>
      prev.map((group) => {
        if (group.id !== clipId) return group;
        return {
          ...group,
          sections: group.sections.map((sec) =>
            sec.id === sectionId
              ? {
                  ...sec,
                  startSeconds: Math.max(0, start),
                  endSeconds: Math.max(start + 0.1, end),
                }
              : sec
          ),
        };
      })
    );
  };

  const updateSectionLabel = (
    clipId: string,
    sectionId: string,
    label: string
  ) => {
    setClipGroups((prev) =>
      prev.map((group) => {
        if (group.id !== clipId) return group;
        return {
          ...group,
          sections: group.sections.map((sec) =>
            sec.id === sectionId ? { ...sec, label } : sec
          ),
        };
      })
    );
  };

  const toggleSectionVisualEditor = (clipId: string, sectionId: string) => {
    setClipGroups((prev) =>
      prev.map((group) => {
        if (group.id !== clipId) return group;
        return {
          ...group,
          sections: group.sections.map((sec) =>
            sec.id === sectionId
              ? { ...sec, showVisualEditor: !sec.showVisualEditor }
              : sec
          ),
        };
      })
    );
  };

  const addSection = (clipId: string) => {
    setClipGroups((prev) =>
      prev.map((group) => {
        if (group.id !== clipId) return group;
        const lastSection = group.sections[group.sections.length - 1];
        const nextStart = lastSection
          ? Math.min(Math.max(0, group.duration - 1), lastSection.endSeconds)
          : 0;
        const nextEnd = Math.min(group.duration, nextStart + 20);

        const newSection: SectionItem = {
          id: `sec-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          startSeconds: Math.max(0, nextStart),
          endSeconds: Math.max(nextStart + 0.5, nextEnd),
          label: '',
          showVisualEditor: true, // open visual timeline trimmer by default
        };

        return {
          ...group,
          sections: [...group.sections, newSection],
        };
      })
    );
  };

  const moveSection = (
    clipId: string,
    sectionIndex: number,
    direction: 'up' | 'down'
  ) => {
    const targetIndex = direction === 'up' ? sectionIndex - 1 : sectionIndex + 1;
    setClipGroups((prev) =>
      prev.map((group) => {
        if (group.id !== clipId) return group;
        if (targetIndex < 0 || targetIndex >= group.sections.length) return group;
        const reordered = [...group.sections];
        const [moved] = reordered.splice(sectionIndex, 1);
        reordered.splice(targetIndex, 0, moved);
        return { ...group, sections: reordered };
      })
    );
  };

  const removeSection = (clipId: string, sectionId: string) => {
    setClipGroups((prev) =>
      prev
        .map((group) => {
          if (group.id !== clipId) return group;
          return {
            ...group,
            sections: group.sections.filter((s) => s.id !== sectionId),
          };
        })
        .filter((group) => group.sections.length > 0)
    );
  };

  const toggleVideo = (clipId: string) => {
    setClipGroups((prev) =>
      prev.map((group) =>
        group.id === clipId
          ? { ...group, showVideoPlayer: !group.showVideoPlayer }
          : group
      )
    );
  };

  const moveClipGroup = (clipIndex: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? clipIndex - 1 : clipIndex + 1;
    if (targetIndex < 0 || targetIndex >= clipGroups.length) return;
    setClipGroups((prev) => {
      const reordered = [...prev];
      const [moved] = reordered.splice(clipIndex, 1);
      reordered.splice(targetIndex, 0, moved);
      return reordered;
    });
  };

  const removeClipGroup = (clipId: string) => {
    setClipGroups((prev) => prev.filter((g) => g.id !== clipId));
  };

  // Audition playback controller
  const startAuditionItem = (idx: number) => {
    const list = allPlayableSectionsRef.current;
    if (idx < 0 || idx >= list.length) {
      setAuditionIndex(null);
      return;
    }
    const item = list[idx];
    const audio = auditionAudioRef.current;
    if (!audio) {
      setAuditionIndex(null);
      return;
    }

    setAuditionIndex(idx);
    audio.src = item.sourceUrl;
    audio.currentTime = item.startSeconds;
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
      if (allPlayableSections.length > 0) {
        startAuditionItem(0);
      }
    }
  };

  const handleAuditionTimeUpdate = () => {
    if (auditionIndex === null || !auditionAudioRef.current) return;
    const list = allPlayableSectionsRef.current;
    const item = list[auditionIndex];
    if (!item) return;

    if (auditionAudioRef.current.currentTime >= item.endSeconds) {
      if (auditionIndex + 1 < list.length) {
        startAuditionItem(auditionIndex + 1);
      } else {
        auditionAudioRef.current.pause();
        setAuditionIndex(null);
      }
    }
  };

  const totalEstimatedDuration = allPlayableSections.reduce((acc, sec, idx) => {
    const duration = sec.endSeconds - sec.startSeconds;
    const overlap = idx > 0 ? crossfadeSeconds : 0;
    return Math.max(0, acc + duration - overlap);
  }, 0);

  const activeAuditionSectionId =
    auditionIndex !== null && allPlayableSections[auditionIndex]
      ? allPlayableSections[auditionIndex].sectionId
      : null;

  const currentAuditionItem =
    auditionIndex !== null && allPlayableSections[auditionIndex]
      ? allPlayableSections[auditionIndex]
      : null;

  const generateMix = async () => {
    if (allPlayableSections.length === 0) {
      setErrorMessage('Please add at least one section before creating your combined audio.');
      return;
    }

    setIsGenerating(true);
    setErrorMessage(null);

    try {
      const manifestClips = clipGroups.flatMap((group, groupIndex) =>
        group.sections.map((section) => ({
          fileIndex: groupIndex,
          startSeconds: section.startSeconds,
          endSeconds: section.endSeconds,
        }))
      );

      const manifest = {
        crossfadeSeconds,
        normalizeVolume,
        clips: manifestClips,
      };

      const formData = new FormData();
      clipGroups.forEach((group) => {
        formData.append('files', group.file, group.name);
      });
      formData.append('manifest', JSON.stringify(manifest));

      const response = await fetch('/api/v1/audio/mixes', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let errText = 'Failed to create combined audio.';
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
      </section>

      {/* Hidden sequential audio audition player */}
      <audio
        ref={auditionAudioRef}
        onTimeUpdate={handleAuditionTimeUpdate}
        onEnded={() => {
          if (auditionIndex !== null && auditionIndex + 1 < allPlayableSections.length) {
            startAuditionItem(auditionIndex + 1);
          } else {
            setAuditionIndex(null);
          }
        }}
      />

      {/* Step 2: Structured Clips & Sections */}
      {clipGroups.length > 0 && (
        <section className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-sm font-semibold tracking-wider uppercase text-stone-500">
                Step 2: Clips & Sections ({clipGroups.length} {clipGroups.length === 1 ? 'clip' : 'clips'} • {allPlayableSections.length} {allPlayableSections.length === 1 ? 'section' : 'sections'} total)
              </h2>
              <p className="text-xs text-stone-400">
                Each clip contains its trimmed sections. You can add multiple sections per clip and arrange their order.
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
                title="Listen to all clips and sections played in sequence"
              >
                {auditionIndex !== null && currentAuditionItem ? (
                  <>
                    <Pause className="w-3.5 h-3.5" />
                    Stop Playing ({currentAuditionItem.displayName})
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

          {/* Grouped Clips List */}
          <div className="space-y-6">
            {clipGroups.map((group, index) => (
              <ClipGroupCard
                key={group.id}
                clipGroup={group}
                clipIndex={index}
                totalClips={clipGroups.length}
                activeAuditionSectionId={activeAuditionSectionId}
                onUpdateSectionRange={updateSectionRange}
                onUpdateSectionLabel={updateSectionLabel}
                onToggleSectionVisualEditor={toggleSectionVisualEditor}
                onAddSection={addSection}
                onMoveSection={moveSection}
                onRemoveSection={removeSection}
                onToggleVideo={toggleVideo}
                onMoveClip={moveClipGroup}
                onRemoveClip={removeClipGroup}
              />
            ))}
          </div>
        </section>
      )}

      {/* Step 3: Transition & Volume Settings */}
      {clipGroups.length > 0 && (
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
      {clipGroups.length > 0 && (
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
                Create & Download Combined Audio ({clipGroups.length} {clipGroups.length === 1 ? 'clip' : 'clips'} • ~
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
