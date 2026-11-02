import React, { useRef, useState } from 'react';
import {
  Music,
  Video,
  ArrowUp,
  ArrowDown,
  Trash2,
  Plus,
  Film,
  GripVertical,
} from 'lucide-react';
import { SectionCard, SectionItem } from './SectionCard';
import { formatTime } from '../utils/timeFormat';

export interface ClipGroup {
  id: string;
  file: File;
  name: string;
  duration: number;
  isVideo: boolean;
  objectUrl: string;
  showVideoPlayer?: boolean;
  sections: SectionItem[];
}

interface ClipGroupCardProps {
  clipGroup: ClipGroup;
  clipIndex: number;
  totalClips: number;
  activeAuditionSectionId?: string | null;
  onUpdateSectionRange: (clipId: string, sectionId: string, start: number, end: number) => void;
  onUpdateSectionLabel: (clipId: string, sectionId: string, label: string) => void;
  onToggleSectionVisualEditor: (clipId: string, sectionId: string) => void;
  onAddSection: (clipId: string) => void;
  onMoveSection: (clipId: string, sectionIndex: number, direction: 'up' | 'down') => void;
  onReorderSections?: (clipId: string, sourceIndex: number, targetIndex: number) => void;
  onRemoveSection: (clipId: string, sectionId: string) => void;
  onToggleVideo: (clipId: string) => void;
  onMoveClip: (clipIndex: number, direction: 'up' | 'down') => void;
  onReorderClips?: (sourceIndex: number, targetIndex: number) => void;
  onRemoveClip: (clipId: string) => void;
}

export const ClipGroupCard: React.FC<ClipGroupCardProps> = ({
  clipGroup,
  clipIndex,
  totalClips,
  activeAuditionSectionId,
  onUpdateSectionRange,
  onUpdateSectionLabel,
  onToggleSectionVisualEditor,
  onAddSection,
  onMoveSection,
  onReorderSections,
  onRemoveSection,
  onToggleVideo,
  onMoveClip,
  onReorderClips,
  onRemoveClip,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const totalSelectedSeconds = clipGroup.sections.reduce(
    (acc, sec) => acc + Math.max(0, sec.endSeconds - sec.startSeconds),
    0
  );

  return (
    <div
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('application/x-cozicut-clip')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        }
      }}
      onDragEnter={(e) => {
        if (e.dataTransfer.types.includes('application/x-cozicut-clip')) {
          e.preventDefault();
          setIsDragOver(true);
        }
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        const data = e.dataTransfer.getData('application/x-cozicut-clip');
        if (data) {
          const srcIdx = parseInt(data, 10);
          if (!isNaN(srcIdx) && srcIdx !== clipIndex && onReorderClips) {
            onReorderClips(srcIdx, clipIndex);
          }
        }
      }}
      className={`border rounded-2xl p-5 shadow-sm transition ${
        isDragging ? 'opacity-40 scale-[0.99] border-dashed border-stone-400 bg-stone-100/50 shadow-none' : ''
      } ${
        isDragOver ? 'ring-2 ring-amber-500 bg-amber-50/40 border-amber-400' : ''
      } ${
        !isDragging && !isDragOver
          ? 'bg-stone-50/70 border-stone-200 hover:border-stone-300'
          : ''
      }`}
    >
      {/* Top-Level Clip Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-200/80">
        <div className="flex items-center gap-2.5">
          {totalClips > 1 && (
            <div
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/x-cozicut-clip', clipIndex.toString());
                e.dataTransfer.effectAllowed = 'move';
                setIsDragging(true);
              }}
              onDragEnd={() => setIsDragging(false)}
              className="cursor-grab active:cursor-grabbing p-1 text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 rounded-lg transition"
              title="Drag to reorder clip sequence"
            >
              <GripVertical className="w-4 h-4" />
            </div>
          )}

          <span className="w-8 h-8 rounded-xl bg-stone-900 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-sm">
            #{clipIndex + 1}
          </span>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-stone-900 text-sm">
                Clip {clipIndex + 1}
              </h3>

              <span className="inline-flex items-center gap-1 text-xs text-stone-600 bg-white px-2 py-0.5 rounded-md border border-stone-200 shadow-2xs font-medium">
                {clipGroup.isVideo ? (
                  <Video className="w-3.5 h-3.5 text-stone-500 shrink-0" />
                ) : (
                  <Music className="w-3.5 h-3.5 text-stone-500 shrink-0" />
                )}
                <span className="truncate max-w-[200px] sm:max-w-xs" title={clipGroup.name}>
                  {clipGroup.name}
                </span>
                <span className="text-stone-400 font-mono">
                  ({formatTime(clipGroup.duration)})
                </span>
              </span>
            </div>

            <p className="text-[11px] text-stone-500 mt-0.5">
              {clipGroup.sections.length} {clipGroup.sections.length === 1 ? 'section' : 'sections'} • {totalSelectedSeconds.toFixed(1)}s selected total
            </p>
          </div>
        </div>

        {/* Clip-Level Toolbar */}
        <div className="flex items-center gap-1.5 self-end sm:self-auto">
          {/* Video Player Toggle */}
          {clipGroup.isVideo && (
            <button
              type="button"
              onClick={() => onToggleVideo(clipGroup.id)}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition ${
                clipGroup.showVideoPlayer
                  ? 'bg-stone-800 text-white border-stone-800'
                  : 'text-stone-700 bg-white hover:bg-stone-100 border-stone-200'
              }`}
              title="Show video player"
            >
              <Film className="w-3.5 h-3.5" />
              {clipGroup.showVideoPlayer ? 'Hide Video' : 'Video Player'}
            </button>
          )}

          {/* Move Entire Clip Up / Down */}
          {totalClips > 1 && (
            <>
              <button
                type="button"
                onClick={() => onMoveClip(clipIndex, 'up')}
                disabled={clipIndex === 0}
                className="p-1.5 text-stone-500 hover:text-stone-900 hover:bg-white rounded-lg border border-transparent hover:border-stone-200 disabled:opacity-25 transition"
                title="Move Clip Earlier in Sequence"
              >
                <ArrowUp className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => onMoveClip(clipIndex, 'down')}
                disabled={clipIndex === totalClips - 1}
                className="p-1.5 text-stone-500 hover:text-stone-900 hover:bg-white rounded-lg border border-transparent hover:border-stone-200 disabled:opacity-25 transition"
                title="Move Clip Later in Sequence"
              >
                <ArrowDown className="w-4 h-4" />
              </button>
            </>
          )}

          {/* Delete Entire Clip */}
          <button
            type="button"
            onClick={() => onRemoveClip(clipGroup.id)}
            className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg border border-transparent hover:border-red-200 transition"
            title="Delete this Clip and all its sections"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Optional Video Rehearsal Player */}
      {clipGroup.isVideo && clipGroup.showVideoPlayer && (
        <div className="mt-3 bg-stone-900 rounded-xl p-3 flex flex-col items-center">
          <p className="text-[11px] font-medium text-stone-300 mb-2">
            Video Player Preview
          </p>
          <video
            ref={videoRef}
            src={clipGroup.objectUrl}
            controls
            className="max-h-60 rounded-lg shadow-md"
          />
        </div>
      )}

      {/* Nested Sections List */}
      <div className="mt-4 space-y-3 pl-1 sm:pl-3 border-l-2 border-stone-200">
        {clipGroup.sections.map((section, sIndex) => (
          <SectionCard
            key={section.id}
            section={section}
            sectionIndex={sIndex}
            totalSections={clipGroup.sections.length}
            clipIndex={clipIndex}
            file={clipGroup.file}
            sourceDuration={clipGroup.duration}
            sourceObjectUrl={clipGroup.objectUrl}
            isVideo={clipGroup.isVideo}
            isAuditioning={activeAuditionSectionId === section.id}
            onUpdateRange={(sId, start, end) =>
              onUpdateSectionRange(clipGroup.id, sId, start, end)
            }
            onUpdateLabel={(sId, label) =>
              onUpdateSectionLabel(clipGroup.id, sId, label)
            }
            onToggleVisualEditor={(sId) =>
              onToggleSectionVisualEditor(clipGroup.id, sId)
            }
            onMoveSection={(sIdx, dir) =>
              onMoveSection(clipGroup.id, sIdx, dir)
            }
            onReorderSection={(src, target) =>
              onReorderSections && onReorderSections(clipGroup.id, src, target)
            }
            onRemoveSection={(sId) =>
              onRemoveSection(clipGroup.id, sId)
            }
          />
        ))}

        {/* Add Another Section Button */}
        <button
          type="button"
          onClick={() => onAddSection(clipGroup.id)}
          className="w-full py-2.5 px-3 rounded-xl border border-dashed border-stone-300 hover:border-stone-400 bg-white hover:bg-stone-50/80 text-stone-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow-2xs cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5 text-stone-500" />
          <span>+ Add Section from Clip {clipIndex + 1}</span>
          <span className="text-[11px] text-stone-400 font-normal">
            (select another part of {clipGroup.name})
          </span>
        </button>
      </div>
    </div>
  );
};
