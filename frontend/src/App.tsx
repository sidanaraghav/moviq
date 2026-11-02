import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  Download,
  AlertCircle,
  Loader2,
  Volume2,
  Play,
  Pause,
  Link,
  Film,
  Music,
  CheckCircle2,
  RotateCcw,
} from 'lucide-react';
import { ClipGroupCard, ClipGroup } from './components/ClipGroupCard';
import { SectionItem } from './components/SectionCard';
import {
  FullSessionVideoPreview,
  PlayableSection,
} from './components/FullSessionVideoPreview';
import { formatTime } from './utils/timeFormat';
import {
  saveMediaBlob,
  getMediaBlob,
  deleteMediaBlob,
  clearCompleteSession,
  saveSessionMetadata,
  loadSessionMetadata,
  SavedSession,
} from './utils/sessionStore';

export default function App() {
  const [clipGroups, setClipGroups] = useState<ClipGroup[]>([]);
  const [crossfadeSeconds, setCrossfadeSeconds] = useState<number>(0);
  const [normalizeVolume, setNormalizeVolume] = useState<boolean>(false);
  const [isExportingAudio, setIsExportingAudio] = useState<boolean>(false);
  const [isExportingVideo, setIsExportingVideo] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [masterAudioUrl, setMasterAudioUrl] = useState<string | null>(null);
  const [masterVideoUrl, setMasterVideoUrl] = useState<string | null>(null);
  const [isVideoPreviewOpen, setIsVideoPreviewOpen] = useState<boolean>(false);

  // Session auto-save state
  const [isSessionLoaded, setIsSessionLoaded] = useState<boolean>(false);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // URL import state
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
  const generatedVideoSectionRef = useRef<HTMLDivElement>(null);

  // Auto-scroll when media is exported
  useEffect(() => {
    if (masterAudioUrl && generatedAudioSectionRef.current) {
      generatedAudioSectionRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [masterAudioUrl]);

  useEffect(() => {
    if (masterVideoUrl && generatedVideoSectionRef.current) {
      generatedVideoSectionRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [masterVideoUrl]);

  // Restore session from IndexedDB + LocalStorage on mount
  useEffect(() => {
    let isCancelled = false;
    async function restoreSession() {
      try {
        const saved = loadSessionMetadata();
        if (!saved || !saved.clips || saved.clips.length === 0) {
          setIsSessionLoaded(true);
          return;
        }

        setCrossfadeSeconds(saved.crossfadeSeconds ?? 0);
        setNormalizeVolume(saved.normalizeVolume ?? false);

        const restoredGroups: ClipGroup[] = [];
        for (const c of saved.clips) {
          const blob = await getMediaBlob(c.id);
          if (blob) {
            const file = new File([blob], c.name, {
              type: blob.type || (c.isVideo ? 'video/mp4' : 'audio/mpeg'),
            });
            const objectUrl = URL.createObjectURL(blob);
            restoredGroups.push({
              id: c.id,
              name: c.name,
              file,
              duration: c.duration,
              isVideo: c.isVideo,
              objectUrl,
              showVideoPlayer: false,
              sections: c.sections,
            });
          }
        }

        if (!isCancelled && restoredGroups.length > 0) {
          setClipGroups(restoredGroups);
          setLastSavedTime(
            new Date(saved.updatedAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })
          );
        }
      } catch (err) {
        console.warn('Failed to restore saved session:', err);
      } finally {
        if (!isCancelled) {
          setIsSessionLoaded(true);
        }
      }
    }

    restoreSession();
    return () => {
      isCancelled = true;
    };
  }, []);

  // Debounced session auto-save (saves blobs to IndexedDB + metadata to LocalStorage)
  useEffect(() => {
    if (!isSessionLoaded) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      if (clipGroups.length === 0) {
        saveSessionMetadata({
          version: 1,
          updatedAt: Date.now(),
          crossfadeSeconds,
          normalizeVolume,
          clips: [],
        });
        return;
      }

      for (const group of clipGroups) {
        await saveMediaBlob(group.id, group.file, group.name);
      }

      const metadata: SavedSession = {
        version: 1,
        updatedAt: Date.now(),
        crossfadeSeconds,
        normalizeVolume,
        clips: clipGroups.map((g) => ({
          id: g.id,
          name: g.name,
          duration: g.duration,
          isVideo: g.isVideo,
          sections: g.sections,
        })),
      };
      saveSessionMetadata(metadata);
      setLastSavedTime(
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      );
    }, 600);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [clipGroups, crossfadeSeconds, normalizeVolume, isSessionLoaded]);

  // Clear session / Start Fresh
  const handleClearSession = async () => {
    if (clipGroups.length > 0) {
      const confirmed = window.confirm(
        'Start a fresh project? All loaded clips and cut sections will be cleared.'
      );
      if (!confirmed) return;
    }
    stopAudition();
    setClipGroups([]);
    setMasterAudioUrl(null);
    setMasterVideoUrl(null);
    setCrossfadeSeconds(0);
    setNormalizeVolume(false);
    setLastSavedTime(null);
    await clearCompleteSession();
  };

  // Flattened playable sections list
  const allPlayableSections: PlayableSection[] = clipGroups.flatMap((group, gIdx) =>
    group.sections.map((sec, sIdx) => ({
      clipIndex: gIdx,
      sectionIndex: sIdx,
      clipId: group.id,
      sectionId: sec.id,
      sourceUrl: group.objectUrl,
      startSeconds: sec.startSeconds,
      endSeconds: sec.endSeconds,
      isVideo: group.isVideo,
      title: group.name,
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
              showVisualEditor: true,
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
          showVisualEditor: true,
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

  // Drag-and-drop reordering for sections within a clip
  const handleReorderSections = (
    clipId: string,
    sourceIndex: number,
    targetIndex: number
  ) => {
    if (sourceIndex === targetIndex) return;
    setClipGroups((prev) =>
      prev.map((group) => {
        if (group.id !== clipId) return group;
        const reordered = [...group.sections];
        const [moved] = reordered.splice(sourceIndex, 1);
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

  // Drag-and-drop reordering for entire clips
  const handleReorderClips = (sourceIndex: number, targetIndex: number) => {
    if (sourceIndex === targetIndex) return;
    setClipGroups((prev) => {
      const reordered = [...prev];
      const [moved] = reordered.splice(sourceIndex, 1);
      reordered.splice(targetIndex, 0, moved);
      return reordered;
    });
  };

  const removeClipGroup = (clipId: string) => {
    setClipGroups((prev) => prev.filter((g) => g.id !== clipId));
    deleteMediaBlob(clipId);
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

  const hasAnyVideo = clipGroups.some((g) => g.isVideo);

  const activeAuditionSectionId =
    auditionIndex !== null && allPlayableSections[auditionIndex]
      ? allPlayableSections[auditionIndex].sectionId
      : null;

  const currentAuditionItem =
    auditionIndex !== null && allPlayableSections[auditionIndex]
      ? allPlayableSections[auditionIndex]
      : null;

  // Unified mix generator for MP3 audio and MP4 video
  const generateMix = async (format: 'mp3' | 'mp4') => {
    if (allPlayableSections.length === 0) {
      setErrorMessage(`Please add at least one section before creating your ${format === 'mp4' ? 'video' : 'audio'}.`);
      return;
    }

    if (format === 'mp4') {
      setIsExportingVideo(true);
      setMasterVideoUrl(null);
    } else {
      setIsExportingAudio(true);
      setMasterAudioUrl(null);
    }
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

      const response = await fetch(`/api/v1/audio/mixes?format=${format}`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let errText = `Failed to create combined ${format === 'mp4' ? 'video' : 'audio'}.`;
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

      if (format === 'mp4') {
        setMasterVideoUrl(url);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'cozicut_video.mp4';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        setMasterAudioUrl(url);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'cozicut_audio.mp3';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (err: any) {
      setErrorMessage(
        err.message || `An error occurred while creating your ${format === 'mp4' ? 'video' : 'audio'}.`
      );
    } finally {
      if (format === 'mp4') {
        setIsExportingVideo(false);
      } else {
        setIsExportingAudio(false);
      }
    }
  };

  const isGenerating = isExportingAudio || isExportingVideo;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <header className="mb-8 pb-6 border-b border-stone-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
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

          {/* Session Auto-Save & Reset Status */}
          <div className="flex items-center gap-2 self-start sm:self-auto">
            {lastSavedTime && (
              <span className="inline-flex items-center gap-1.5 text-xs text-stone-600 bg-stone-100/90 border border-stone-200 px-3 py-1.5 rounded-full font-medium shadow-2xs">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Auto-saved at {lastSavedTime}</span>
              </span>
            )}

            {clipGroups.length > 0 && (
              <button
                type="button"
                onClick={handleClearSession}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-stone-600 hover:text-stone-900 bg-white hover:bg-stone-50 rounded-full border border-stone-200 transition shadow-2xs"
                title="Clear current workspace and start fresh"
              >
                <RotateCcw className="w-3.5 h-3.5 text-stone-400" />
                Start Fresh
              </button>
            )}
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

      {/* Step 1: Add Media (Spacious Dual Cards: Link Import USP + Drag & Drop Upload) */}
      <section className="mb-8">
        <div className="mb-3">
          <h2 className="text-sm font-semibold tracking-wider uppercase text-stone-500">
            Step 1: Add Media to Edit
          </h2>
          <p className="text-xs text-stone-400 mt-0.5">
            Import online tracks from links or upload audio & video files directly from your device.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">
          {/* Card 1: Import from Link (USP) */}
          <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
            <form onSubmit={handleImportUrl} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-stone-800 flex items-center gap-1.5">
                    <Link className="w-3.5 h-3.5 text-amber-500" />
                    Import from Link
                  </label>
                  <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full uppercase tracking-wider">
                    Online Tracks
                  </span>
                </div>
                <p className="text-xs text-stone-500 mb-3">
                  Paste a link to any song or video. Audio is extracted automatically.
                </p>

                <div className="space-y-2.5">
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-400">
                      <Link className="w-4 h-4" />
                    </div>
                    <input
                      type="url"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      placeholder="Paste YouTube, Instagram, Facebook, or Spotify link..."
                      disabled={isImportingUrl}
                      className="w-full pl-10 pr-4 py-2.5 text-sm bg-stone-50 border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white text-stone-900 transition disabled:opacity-60"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isImportingUrl || !urlInput.trim()}
                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-semibold bg-stone-900 hover:bg-stone-800 text-white rounded-xl transition shadow-sm disabled:opacity-50 cursor-pointer"
                  >
                    {isImportingUrl ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                        Fetching & Extracting Audio...
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
              <div className="pt-2 border-t border-stone-100">
                <span className="block text-[11px] font-semibold text-stone-500 mb-1.5">Supported Platforms:</span>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="bg-stone-100 border border-stone-200 px-2 py-0.5 rounded-md font-medium text-stone-700">YouTube</span>
                  <span className="bg-stone-100 border border-stone-200 px-2 py-0.5 rounded-md font-medium text-stone-700">Instagram</span>
                  <span className="bg-stone-100 border border-stone-200 px-2 py-0.5 rounded-md font-medium text-stone-700">Facebook</span>
                  <span className="bg-stone-100 border border-stone-200 px-2 py-0.5 rounded-md font-medium text-stone-700">Spotify</span>
                  <span className="bg-stone-100 border border-stone-200 px-2 py-0.5 rounded-md font-medium text-stone-700">SoundCloud</span>
                </div>
              </div>

              {isImportingUrl && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3 text-amber-900 text-xs animate-pulse">
                  <Loader2 className="w-4 h-4 animate-spin text-amber-600 shrink-0" />
                  <span>Downloading & extracting audio... takes 3 to 10 seconds.</span>
                </div>
              )}
            </form>
          </div>

          {/* Card 2: Upload Files & Videos from Device */}
          <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-stone-800 flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5 text-stone-600" />
                  Upload Local Files
                </label>
                <span className="text-[10px] font-bold text-stone-600 bg-stone-100 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Up to 500MB
                </span>
              </div>
              <p className="text-xs text-stone-500 mb-3">
                Drag & drop audio or video files. Videos and songs can be combined into video or audio medleys.
              </p>
            </div>

            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 min-h-[160px] border-2 border-dashed border-stone-300 hover:border-stone-500 rounded-xl p-6 text-center bg-stone-50/60 hover:bg-stone-100/60 cursor-pointer transition flex flex-col items-center justify-center gap-2.5 group"
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="audio/*,video/*,.mp3,.wav,.m4a,.aac,.flac,.ogg,.mp4,.mov,.mkv,.webm"
                className="hidden"
                onChange={handleFileUpload}
              />
              <div className="w-12 h-12 rounded-full bg-stone-200 group-hover:bg-stone-300 text-stone-700 flex items-center justify-center transition">
                <Upload className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs sm:text-sm font-bold text-stone-800">
                  Drag & drop audio or video files here
                </p>
                <p className="text-[11px] text-stone-500 mt-0.5">
                  or <span className="text-stone-900 underline underline-offset-2 font-semibold">browse files</span> from your computer
                </p>
              </div>
              <span className="text-[10px] text-stone-400 font-medium">
                MP3, WAV, AAC, M4A, MP4, MOV, MKV, WebM
              </span>
            </div>
          </div>
        </div>
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
                Drag cards by their handle (⋮⋮) or use arrows to reorder. You can add multiple sections per clip.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  stopAudition();
                  setIsVideoPreviewOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full border bg-white hover:bg-stone-50 text-stone-800 border-stone-300 shadow-2xs transition cursor-pointer"
                title="Watch full video preview with transitions and title cards"
              >
                <Film className="w-3.5 h-3.5 text-amber-500" />
                <span>Watch Video Preview</span>
              </button>

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
                onReorderSections={handleReorderSections}
                onRemoveSection={removeSection}
                onToggleVideo={toggleVideo}
                onMoveClip={moveClipGroup}
                onReorderClips={handleReorderClips}
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

      {/* Step 4: Export Final Combined Medley (Audio & Video Options) */}
      {clipGroups.length > 0 && (
        <section className="mb-12">
          <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm">
            <div className="mb-4">
              <h2 className="text-sm font-semibold tracking-wider uppercase text-stone-500">
                Step 4: Export Your Combined Medley
              </h2>
              <p className="text-xs text-stone-500 mt-1">
                {hasAnyVideo
                  ? 'Your project contains video clips. Export as a combined 1080p video (audio clips automatically feature aesthetic title cards with dynamic visualizers) or export as an audio-only MP3.'
                  : 'Export your combined clips as an audio file (MP3) or generate a 1080p video with aesthetic title cards and animated audio waveforms.'}
              </p>
            </div>

            {/* Full Session Video Preview Banner (Before Export) */}
            <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-stone-900 via-stone-900 to-stone-800 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-stone-800 shadow-md">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
                  <Film className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm text-stone-100">
                      Watch Full Medley Video Preview
                    </h3>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded-full">
                      Instant Live Preview
                    </span>
                  </div>
                  <p className="text-xs text-stone-400 mt-0.5">
                    Watch all video cuts & audio visualizer title cards stitched in sequence before exporting.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  stopAudition();
                  setIsVideoPreviewOpen(true);
                }}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs rounded-xl shadow-md transition cursor-pointer self-start sm:self-auto shrink-0"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Preview Full Video Medley</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Option 1: Combined Video (MP4) */}
              <button
                type="button"
                onClick={() => generateMix('mp4')}
                disabled={isGenerating}
                className={`py-4 px-6 rounded-2xl font-semibold text-sm shadow-md flex items-center justify-center gap-2.5 transition cursor-pointer disabled:opacity-50 ${
                  hasAnyVideo
                    ? 'bg-stone-900 hover:bg-black text-white shadow-stone-900/10'
                    : 'bg-stone-800 hover:bg-stone-900 text-white shadow-stone-800/10'
                }`}
              >
                {isExportingVideo ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
                    Rendering Combined Video...
                  </>
                ) : (
                  <>
                    <Film className="w-5 h-5 text-amber-400" />
                    <span>
                      Combine & Download Video (MP4)
                    </span>
                  </>
                )}
              </button>

              {/* Option 2: Combined Audio (MP3) */}
              <button
                type="button"
                onClick={() => generateMix('mp3')}
                disabled={isGenerating}
                className={`py-4 px-6 rounded-2xl font-semibold text-sm border transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2.5 ${
                  hasAnyVideo
                    ? 'bg-stone-50 hover:bg-stone-100 text-stone-800 border-stone-300'
                    : 'bg-stone-900 hover:bg-black text-white shadow-md shadow-stone-900/10'
                }`}
              >
                {isExportingAudio ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin text-stone-400" />
                    Combining Audio Clips...
                  </>
                ) : (
                  <>
                    <Music className={`w-5 h-5 ${hasAnyVideo ? 'text-stone-600' : 'text-amber-400'}`} />
                    <span>
                      Combine & Download Audio (MP3)
                    </span>
                  </>
                )}
              </button>
            </div>

            <div className="mt-3 flex items-center justify-between text-[11px] text-stone-400 px-1">
              <span>{clipGroups.length} {clipGroups.length === 1 ? 'clip' : 'clips'} • ~{formatTime(totalEstimatedDuration)} total duration</span>
              <span>1080p H.264 • High-Quality Audio</span>
            </div>
          </div>
        </section>
      )}

      {/* In-Browser Video Player (when Video MP4 is exported) */}
      {masterVideoUrl && (
        <div
          ref={generatedVideoSectionRef}
          id="generated-video-section"
          className="scroll-mt-8 bg-stone-900 text-white rounded-2xl p-6 mb-10 shadow-lg border border-stone-800 animate-in fade-in"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse"></span>
              <h3 className="font-bold text-sm text-stone-100">
                Your Combined Video is Ready!
              </h3>
            </div>
            <a
              href={masterVideoUrl}
              download="cozicut_video.mp4"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-stone-950 rounded-xl transition shadow-sm font-sans"
            >
              <Download className="w-3.5 h-3.5" />
              Download Video (MP4)
            </a>
          </div>

          <p className="text-xs text-stone-400 mb-4">
            Preview your rendered 1080p video medley below. Audio segments feature your aesthetic visualizer title card.
          </p>

          <video
            controls
            src={masterVideoUrl}
            className="w-full max-h-[460px] rounded-xl bg-black shadow-inner"
          />
        </div>
      )}

      {/* In-Browser Audio Player (when Audio MP3 is exported) */}
      {masterAudioUrl && (
        <div
          ref={generatedAudioSectionRef}
          id="generated-audio-section"
          className="scroll-mt-8 bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-emerald-950 mb-10 shadow-sm animate-in fade-in"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <h3 className="font-bold text-sm text-emerald-900">
                Your Combined Audio is Ready!
              </h3>
            </div>
            <a
              href={masterAudioUrl}
              download="cozicut_audio.mp3"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition shadow-sm"
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

      {/* Full Medley Video Preview Modal */}
      <FullSessionVideoPreview
        isOpen={isVideoPreviewOpen}
        onClose={() => setIsVideoPreviewOpen(false)}
        sections={allPlayableSections}
        onExportVideo={() => generateMix('mp4')}
      />
    </div>
  );
}
