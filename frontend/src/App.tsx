import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  Download,
  AlertCircle,
  Loader2,
  Sparkles,
  Volume2,
  Play,
  Pause,
  Link,
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

  // Import mode & URL import state
  const [importMode, setImportMode] = useState<'upload' | 'url'>('upload');
  const [urlInput, setUrlInput] = useState<string>('');
  const [isImportingUrl, setIsImportingUrl] = useState<boolean>(false);

  // In-browser sequential audition player with real-time crossfade support
  const [auditionIndex, setAuditionIndex] = useState<number | null>(null);
  const auditionAudioARef = useRef<HTMLAudioElement | null>(null);
  const auditionAudioBRef = useRef<HTMLAudioElement | null>(null);
  const activePlayerRef = useRef<'A' | 'B'>('A');
  const nextPlayerStartedRef = useRef<boolean>(false);
  const crossfadeSecondsRef = useRef<number>(crossfadeSeconds);
  crossfadeSecondsRef.current = crossfadeSeconds;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const generatedAudioSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (masterAudioUrl && generatedAudioSectionRef.current) {
      generatedAudioSectionRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [masterAudioUrl]);

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

  const handleImportUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUrl = urlInput.trim();
    if (!cleanUrl) return;

    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      setErrorMessage('Please enter a valid link starting with http:// or https://');
      return;
    }

    setIsImportingUrl(true);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/v1/media/import-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: cleanUrl }),
      });

      if (!response.ok) {
        let errMessage = 'Failed to extract audio from the provided link.';
        try {
          const json = await response.json();
          errMessage = json.message || errMessage;
        } catch {
          errMessage = `Server returned status ${response.status}`;
        }
        throw new Error(errMessage);
      }

      const encodedTitle = response.headers.get('X-Media-Title');
      let title = 'Imported Audio';
      if (encodedTitle) {
        try {
          title = decodeURIComponent(encodedTitle.replace(/\+/g, ' '));
        } catch {
          title = encodedTitle;
        }
      }

      const blob = await response.blob();
      const file = new File([blob], `${title}.mp3`, { type: 'audio/mpeg' });

      processNewFiles([file]);
      setUrlInput('');
    } catch (err: any) {
      setErrorMessage(err.message || 'Could not import audio from link.');
    } finally {
      setIsImportingUrl(false);
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

  // Audition playback controller with dual-player crossfading
  const stopAudition = () => {
    if (auditionAudioARef.current) {
      auditionAudioARef.current.pause();
      auditionAudioARef.current.volume = 1;
    }
    if (auditionAudioBRef.current) {
      auditionAudioBRef.current.pause();
      auditionAudioBRef.current.volume = 1;
    }
    setAuditionIndex(null);
    activePlayerRef.current = 'A';
    nextPlayerStartedRef.current = false;
  };

  const startAuditionItem = (idx: number) => {
    const list = allPlayableSectionsRef.current;
    if (idx < 0 || idx >= list.length) {
      stopAudition();
      return;
    }
    const item = list[idx];
    const activeAudio =
      activePlayerRef.current === 'A' ? auditionAudioARef.current : auditionAudioBRef.current;
    const idleAudio =
      activePlayerRef.current === 'A' ? auditionAudioBRef.current : auditionAudioARef.current;

    if (idleAudio) {
      idleAudio.pause();
      idleAudio.volume = 1;
    }

    if (!activeAudio) {
      stopAudition();
      return;
    }

    setAuditionIndex(idx);
    nextPlayerStartedRef.current = false;
    activeAudio.src = item.sourceUrl;
    activeAudio.currentTime = item.startSeconds;
    activeAudio.volume = 1;
    activeAudio.play().catch((e) => {
      console.warn('Audition playback notice:', e);
      stopAudition();
    });
  };

  const toggleAudition = () => {
    if (auditionIndex !== null) {
      stopAudition();
    } else {
      if (allPlayableSections.length > 0) {
        activePlayerRef.current = 'A';
        startAuditionItem(0);
      }
    }
  };

  const handleAuditionTimeUpdate = (player: 'A' | 'B') => {
    if (activePlayerRef.current !== player || auditionIndex === null) return;
    const list = allPlayableSectionsRef.current;
    const currentItem = list[auditionIndex];
    if (!currentItem) return;

    const activeAudio =
      player === 'A' ? auditionAudioARef.current : auditionAudioBRef.current;
    const nextAudio =
      player === 'A' ? auditionAudioBRef.current : auditionAudioARef.current;
    if (!activeAudio) return;

    const curTime = activeAudio.currentTime;
    const remainingTime = Math.max(0, currentItem.endSeconds - curTime);
    const nextIndex = auditionIndex + 1;
    const hasNext = nextIndex < list.length;
    const nextItem = hasNext ? list[nextIndex] : null;

    const fadeSetting = crossfadeSecondsRef.current;
    const currentDuration = currentItem.endSeconds - currentItem.startSeconds;
    const nextDuration = nextItem ? nextItem.endSeconds - nextItem.startSeconds : 0;
    const maxAllowedFade = Math.min(currentDuration / 2, nextDuration / 2);
    const effectiveFade = hasNext && fadeSetting > 0 ? Math.min(fadeSetting, maxAllowedFade) : 0;

    // In-flight crossfade blending
    if (effectiveFade > 0 && hasNext && nextAudio && nextItem) {
      if (remainingTime <= effectiveFade) {
        if (!nextPlayerStartedRef.current) {
          nextAudio.src = nextItem.sourceUrl;
          nextAudio.currentTime = nextItem.startSeconds;
          nextAudio.volume = 0;
          nextAudio.play().catch((e) => console.warn('Next track playback notice:', e));
          nextPlayerStartedRef.current = true;
        }

        const progress = Math.max(0, Math.min(1, (effectiveFade - remainingTime) / effectiveFade));
        // Equal-power quarter-sine crossfade curve
        activeAudio.volume = Math.cos(progress * Math.PI * 0.5);
        nextAudio.volume = Math.sin(progress * Math.PI * 0.5);
      }
    }

    // Finished current section
    if (curTime >= currentItem.endSeconds || activeAudio.ended) {
      activeAudio.pause();
      activeAudio.volume = 1;

      if (hasNext && nextAudio) {
        nextAudio.volume = 1;
        activePlayerRef.current = player === 'A' ? 'B' : 'A';
        nextPlayerStartedRef.current = false;
        setAuditionIndex(nextIndex);
        if (nextAudio.paused) {
          nextAudio.play().catch((e) => console.warn('Track playback notice:', e));
        }
      } else {
        stopAudition();
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
    setMasterAudioUrl(null);

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

      {/* Step 1: Add Media (Upload Files or Import from Link) */}
      <section className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div>
            <h2 className="text-sm font-semibold tracking-wider uppercase text-stone-500">
              Step 1: Add Audio or Video Files
            </h2>
            <p className="text-xs text-stone-400">
              Upload local files or paste a link from YouTube, Instagram, Facebook, TikTok, Spotify, etc.
            </p>
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center p-1 bg-stone-100 rounded-xl border border-stone-200 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setImportMode('upload')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                importMode === 'upload'
                  ? 'bg-white text-stone-900 shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Upload Local File
            </button>
            <button
              type="button"
              onClick={() => setImportMode('url')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition flex items-center gap-1 cursor-pointer ${
                importMode === 'url'
                  ? 'bg-white text-stone-900 shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Link className="w-3 h-3 text-amber-600" />
              Import from Link
            </button>
          </div>
        </div>

        {importMode === 'upload' ? (
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
              Supports files up to 500MB • Audio tracks are automatically extracted from videos
            </p>
          </div>
        ) : (
          <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm">
            <form onSubmit={handleImportUrl} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1.5">
                  Paste Media Link
                </label>
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-400">
                      <Link className="w-4 h-4" />
                    </div>
                    <input
                      type="url"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      placeholder="Paste YouTube, Instagram, Facebook, TikTok, or Spotify link..."
                      disabled={isImportingUrl}
                      className="w-full pl-10 pr-4 py-2.5 text-sm bg-stone-50 border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white text-stone-900 transition disabled:opacity-60"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isImportingUrl || !urlInput.trim()}
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold bg-stone-900 hover:bg-stone-800 text-white rounded-xl transition shadow-sm disabled:opacity-50 cursor-pointer shrink-0"
                  >
                    {isImportingUrl ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                        Fetching Audio...
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        Import Track
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Supported Platforms Badges */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px] text-stone-500">
                <span className="font-semibold text-stone-700 mr-1">Supported Platforms:</span>
                <span className="bg-stone-100 border border-stone-200 px-2 py-0.5 rounded-md font-medium text-stone-700">YouTube</span>
                <span className="bg-stone-100 border border-stone-200 px-2 py-0.5 rounded-md font-medium text-stone-700">Instagram</span>
                <span className="bg-stone-100 border border-stone-200 px-2 py-0.5 rounded-md font-medium text-stone-700">Facebook</span>
                <span className="bg-stone-100 border border-stone-200 px-2 py-0.5 rounded-md font-medium text-stone-700">TikTok</span>
                <span className="bg-stone-100 border border-stone-200 px-2 py-0.5 rounded-md font-medium text-stone-700">Spotify</span>
                <span className="bg-stone-100 border border-stone-200 px-2 py-0.5 rounded-md font-medium text-stone-700">SoundCloud</span>
              </div>

              {isImportingUrl && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3 text-amber-900 text-xs animate-pulse">
                  <Loader2 className="w-4 h-4 animate-spin text-amber-600 shrink-0" />
                  <span>Extracting audio from link... this usually takes 3 to 10 seconds.</span>
                </div>
              )}
            </form>
          </div>
        )}
      </section>

      {/* Hidden dual-player audio audition system for real-time crossfade preview */}
      <audio
        ref={auditionAudioARef}
        onTimeUpdate={() => handleAuditionTimeUpdate('A')}
        onEnded={() => {
          if (activePlayerRef.current === 'A') {
            handleAuditionTimeUpdate('A');
          }
        }}
      />
      <audio
        ref={auditionAudioBRef}
        onTimeUpdate={() => handleAuditionTimeUpdate('B')}
        onEnded={() => {
          if (activePlayerRef.current === 'B') {
            handleAuditionTimeUpdate('B');
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
              {allPlayableSections.length < 2 ? (
                <p className="text-[11px] text-amber-800 bg-amber-50 rounded-lg p-2.5 mt-2 border border-amber-200">
                  Transitions blend between 2 or more sections. Add another section or clip to hear them blend together.
                </p>
              ) : crossfadeSeconds > 0 ? (
                <p className="text-[11px] text-emerald-800 bg-emerald-50 rounded-lg p-2.5 mt-2 border border-emerald-200">
                  Active: Click "Listen to All Clips" above to preview this {crossfadeSeconds}s smooth fade in real-time.
                </p>
              ) : null}
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
        <div
          ref={generatedAudioSectionRef}
          id="generated-audio-section"
          className="scroll-mt-8 bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-emerald-950 mb-10 shadow-sm animate-in fade-in"
        >
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
