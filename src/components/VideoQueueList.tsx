import React, {useMemo, useState} from 'react';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Play,
  Search,
  Trash2,
} from 'lucide-react';
import {formatBytes, formatDuration, formatRelativeDate} from '../lib/youtube';
import type {VideoItem} from '../types/video';
import {CachedThumbnail} from './CachedThumbnail';
import {InlineCardPlayer} from './InlineCardPlayer';

interface VideoQueueListProps {
  videos: VideoItem[];
  activeVideoId: string | null;
  isOnline: boolean;
  collections: string[];
  onSelectVideo: (id: string) => void;
  onMoveVideo: (id: string, direction: 'up' | 'down') => void;
  onDeleteVideo: (video: VideoItem) => void;
  layout?: 'sidebar' | 'grid';
}

export const VideoQueueList: React.FC<VideoQueueListProps> = ({
  videos,
  activeVideoId,
  isOnline,
  collections,
  onSelectVideo,
  onMoveVideo,
  onDeleteVideo,
  layout = 'sidebar',
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCollection, setActiveCollection] = useState('All');
  const [inlinePlayingId, setInlinePlayingId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<
    'all' | 'youtube' | 'local-video' | 'local-audio' | 'offline-ready'
  >('all');

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return videos.filter((v) => {
      const sType = v.sourceType || 'youtube';
      if (activeCollection !== 'All' && v.collection !== activeCollection) return false;
      if (typeFilter === 'youtube' && sType !== 'youtube') return false;
      if (typeFilter === 'local-video' && sType !== 'local-video') return false;
      if (typeFilter === 'local-audio' && sType !== 'local-audio') return false;
      if (typeFilter === 'offline-ready' && !v.mediaCached) return false;

      if (q) {
        const hay = `${v.title} ${v.authorName} ${v.collection} ${v.notes}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [videos, searchQuery, activeCollection, typeFilter]);

  function handleExpand(id: string) {
    setInlinePlayingId(null);
    onSelectVideo(id);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search titles, channels, or notes..."
            className="w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-[#1E2430] bg-white dark:bg-[#13161D] pl-10 pr-4 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-600/50"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#13161D] border border-slate-200 dark:border-[#1E2430] overflow-x-auto max-w-full">
            {[
              {id: 'all', label: 'All'},
              {id: 'youtube', label: 'YouTube'},
              {id: 'local-video', label: 'Video'},
              {id: 'local-audio', label: 'Audio'},
              {id: 'offline-ready', label: 'Offline'},
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTypeFilter(tab.id as typeof typeFilter)}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  typeFilter === tab.id
                    ? 'bg-white dark:bg-[#1E2430] text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {layout === 'grid' && (
            <select
              aria-label="Filter by collection"
              value={activeCollection}
              onChange={(e) => setActiveCollection(e.target.value)}
              className="min-h-[36px] rounded-lg border border-slate-200 dark:border-[#1E2430] bg-white dark:bg-[#13161D] px-2.5 text-xs text-slate-700 dark:text-slate-200"
            >
              {['All', ...collections].map((col) => (
                <option key={col} value={col}>
                  {col}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-[#1E2430] bg-white dark:bg-[#13161D] p-8 text-center">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            No matching items in this view.
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Switch filters or use Add Links / Upload to add media.
          </p>
        </div>
      ) : layout === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((item) => {
            const isActive = item.id === activeVideoId;
            const isInlinePlaying = inlinePlayingId === item.id;
            const sType = item.sourceType || 'youtube';
            return (
              <div
                key={item.id}
                className={`group rounded-2xl border overflow-hidden transition-colors bg-white dark:bg-[#13161D] ${
                  isInlinePlaying || isActive
                    ? 'border-rose-600'
                    : 'border-slate-200 dark:border-[#1E2430] hover:border-slate-300 dark:hover:border-[#2C3446]'
                }`}
              >
                {/* Thumbnail Box — click turns this exact box into a live video player */}
                <div className="relative w-full aspect-video bg-slate-900 overflow-hidden">
                  {isInlinePlaying ? (
                    <InlineCardPlayer
                      videoId={item.videoId}
                      title={item.title}
                      sourceType={sType}
                      isOnline={isOnline}
                      onExpand={() => handleExpand(item.id)}
                      onStop={() => setInlinePlayingId(null)}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setInlinePlayingId(item.id)}
                      aria-label={`Play ${item.title} inline`}
                      className="relative w-full h-full block cursor-pointer"
                    >
                      <CachedThumbnail
                        videoId={item.videoId}
                        alt={item.title}
                        isOnline={isOnline}
                        sourceType={sType}
                        className="w-full h-full group-hover:scale-[1.02] transition-transform duration-200"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
                      {item.durationSeconds && (
                        <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 font-mono text-[11px] font-medium text-white tabular-nums">
                          {formatDuration(item.durationSeconds)}
                        </span>
                      )}
                      <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-md bg-black/70 px-2 py-1 text-[11px] font-medium text-white">
                        <Play className="w-3 h-3 fill-current text-rose-500" />
                        <span>Play Here</span>
                      </span>
                    </button>
                  )}
                </div>

                <div className="p-4 space-y-2">
                  {/* Clicking title opens the video in the full large player */}
                  <button
                    type="button"
                    onClick={() => handleExpand(item.id)}
                    className="text-left w-full cursor-pointer"
                  >
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white line-clamp-2 leading-snug hover:text-rose-600 dark:hover:text-rose-400 transition-colors">
                      {item.title}
                    </h3>
                  </button>

                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <span className="truncate max-w-[140px]">{item.authorName}</span>
                    <span aria-hidden="true">·</span>
                    <span>{item.collection}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatRelativeDate(item.addedAt)}</span>
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-[#1E2430] flex items-center justify-between gap-2 text-xs">
                    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>
                        {item.mediaCached
                          ? `Offline (${formatBytes(item.mediaBytes)})`
                          : item.thumbCached
                            ? 'Cached Info & Thumb'
                            : 'Queued'}
                      </span>
                    </span>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleExpand(item.id)}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1C212C] cursor-pointer"
                      >
                        Full Player
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteVideo(item)}
                        aria-label={`Delete ${item.title}`}
                        className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Sidebar Queue: clicking thumbnail plays inline right inside the small thumbnail box; clicking title opens big stage */
        <div className="rounded-2xl border border-slate-200 dark:border-[#1E2430] bg-white dark:bg-[#13161D] divide-y divide-slate-100 dark:divide-[#1E2430] overflow-hidden">
          {filtered.map((item, idx) => {
            const isActive = item.id === activeVideoId;
            const isInlinePlaying = inlinePlayingId === item.id;
            const sType = item.sourceType || 'youtube';
            return (
              <div
                key={item.id}
                className={`p-3 flex items-start gap-3 transition-colors ${
                  isInlinePlaying || isActive
                    ? 'bg-rose-600/[0.06] dark:bg-rose-500/[0.08]'
                    : 'hover:bg-slate-50 dark:hover:bg-[#171B24]'
                }`}
              >
                <div
                  className={`relative rounded-lg overflow-hidden bg-slate-900 shrink-0 transition-all ${
                    isInlinePlaying ? 'w-44 aspect-video' : 'w-28 aspect-video'
                  }`}
                >
                  {isInlinePlaying ? (
                    <InlineCardPlayer
                      videoId={item.videoId}
                      title={item.title}
                      sourceType={sType}
                      isOnline={isOnline}
                      compact
                      onExpand={() => handleExpand(item.id)}
                      onStop={() => setInlinePlayingId(null)}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setInlinePlayingId(item.id)}
                      aria-label={`Play ${item.title} in thumbnail`}
                      className="relative w-full h-full block cursor-pointer group"
                    >
                      <CachedThumbnail
                        videoId={item.videoId}
                        alt={item.title}
                        isOnline={isOnline}
                        sourceType={sType}
                        className="w-full h-full"
                      />
                      <div className="absolute inset-0 bg-black/25 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                        <span className="w-7 h-7 rounded-full bg-black/70 text-white flex items-center justify-center opacity-85 group-hover:opacity-100">
                          <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                        </span>
                      </div>
                      {item.durationSeconds && (
                        <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 py-0.5 font-mono text-[10px] text-white tabular-nums">
                          {formatDuration(item.durationSeconds)}
                        </span>
                      )}
                    </button>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => handleExpand(item.id)}
                    className="text-left w-full cursor-pointer"
                  >
                    <h4
                      className={`text-xs font-semibold line-clamp-2 leading-snug hover:text-rose-600 dark:hover:text-rose-400 ${
                        isActive
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-slate-900 dark:text-slate-100'
                      }`}
                    >
                      {item.title}
                    </h4>
                  </button>

                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="truncate max-w-[110px]">{item.authorName}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {sType === 'local-audio'
                        ? `Audio (${formatBytes(item.mediaBytes)})`
                        : sType === 'local-video'
                          ? `Video (${formatBytes(item.mediaBytes)})`
                          : item.mediaCached
                            ? `Offline (${formatBytes(item.mediaBytes)})`
                            : 'YouTube'}
                    </span>
                  </div>

                  <div className="mt-1.5 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onMoveVideo(item.id, 'up')}
                      disabled={idx === 0}
                      aria-label="Move up in queue"
                      className="p-1.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30 cursor-pointer"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onMoveVideo(item.id, 'down')}
                      disabled={idx === filtered.length - 1}
                      aria-label="Move down in queue"
                      className="p-1.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30 cursor-pointer"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteVideo(item)}
                      aria-label="Remove video"
                      className="p-1.5 rounded text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer ml-auto"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
