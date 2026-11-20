import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  BookmarkPlus,
  Check,
  ExternalLink,
  FileAudio,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Repeat,
  RotateCcw,
  RotateCw,
  SkipForward,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
  WifiOff,
  X,
} from 'lucide-react';
import {deleteMediaBlob, getMediaBlob} from '../lib/offlineDb';
import {formatBytes, formatDuration} from '../lib/youtube';
import type {VideoBookmark, VideoItem} from '../types/video';
import {CachedThumbnail} from './CachedThumbnail';

interface YTPlayerInstance {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  setPlaybackRate: (rate: number) => void;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  getPlayerState: () => number;
  destroy: () => void;
}

declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLElement | string,
        options: {
          videoId: string;
          playerVars?: Record<string, string | number>;
          events?: {
            onReady?: (event: {target: YTPlayerInstance}) => void;
            onStateChange?: (event: {data: number; target: YTPlayerInstance}) => void;
            onError?: (event: {data: number}) => void;
          };
        }
      ) => YTPlayerInstance;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface VideoPlayerStageProps {
  video: VideoItem;
  autoPlaySignal: number;
  isOnline: boolean;
  isMini: boolean;
  theaterMode: boolean;
  onToggleTheater: () => void;
  onExpandFromMini: () => void;
  onDismissMini: () => void;
  onUpdateVideo: (updated: VideoItem) => void;
  onNextVideo: () => void;
  hasNext: boolean;
  onOpenUploadModal: () => void;
  onStatsChange: () => void;
}

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export const VideoPlayerStage: React.FC<VideoPlayerStageProps> = ({
  video,
  autoPlaySignal,
  isOnline,
  isMini,
  theaterMode,
  onToggleTheater,
  onExpandFromMini,
  onDismissMini,
  onUpdateVideo,
  onNextVideo,
  hasNext,
  onOpenUploadModal,
  onStatsChange,
}) => {
  const ytHostRef = useRef<HTMLDivElement | null>(null);
  const ytPlayerRef = useRef<YTPlayerInstance | null>(null);
  const htmlMediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);

  const sourceType = video.sourceType || 'youtube';
  const isLocalMedia = sourceType === 'local-video' || sourceType === 'local-audio';

  const [useOfflineSource, setUseOfflineSource] = useState(isLocalMedia);
  const [offlineMediaUrl, setOfflineMediaUrl] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(video.lastPositionSeconds || 0);
  const [duration, setDuration] = useState(video.durationSeconds || 0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(video.playbackRate || 1);
  const [loopA, setLoopA] = useState<number | null>(null);
  const [loopB, setLoopB] = useState<number | null>(null);
  const [loopActive, setLoopActive] = useState(false);

  const [bookmarkLabel, setBookmarkLabel] = useState('');
  const [notesDraft, setNotesDraft] = useState(video.notes || '');
  const [notesSaved, setNotesSaved] = useState(false);
  const [showBookmarksPanel, setShowBookmarksPanel] = useState(false);
  const [embedError, setEmbedError] = useState<string | null>(null);

  const latestVideoRef = useRef(video);
  latestVideoRef.current = video;

  const autoPlayRef = useRef(autoPlaySignal > 0);
  autoPlayRef.current = autoPlaySignal > 0;

  useEffect(() => {
    setNotesDraft(video.notes || '');
    setCurrentTime(video.lastPositionSeconds || 0);
    setDuration(video.durationSeconds || 0);
    setPlaybackRate(video.playbackRate || 1);
    setLoopA(null);
    setLoopB(null);
    setLoopActive(false);
    setUseOfflineSource(isLocalMedia);
    setEmbedError(null);
  }, [video.id, isLocalMedia]);

  // Load cached offline video/audio blob if present
  useEffect(() => {
    let active = true;
    let url: string | null = null;

    async function loadOfflineBlob() {
      const rec = await getMediaBlob(video.videoId);
      if (!active) return;
      if (rec) {
        url = URL.createObjectURL(rec.blob);
        setOfflineMediaUrl(url);
        if (isLocalMedia || !isOnline) {
          setUseOfflineSource(true);
        }
      } else {
        setOfflineMediaUrl(null);
        setUseOfflineSource(false);
      }
    }

    loadOfflineBlob();

    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [video.videoId, video.mediaCached, isOnline, isLocalMedia]);

  useEffect(() => {
    if (isLocalMedia) {
      setUseOfflineSource(true);
      return;
    }
    if (!isOnline && offlineMediaUrl) {
      setUseOfflineSource(true);
    } else if (isOnline && !offlineMediaUrl) {
      setUseOfflineSource(false);
    }
  }, [isOnline, offlineMediaUrl, isLocalMedia]);

  // Initialize YouTube IFrame Player API when playing YouTube online
  useEffect(() => {
    if (isLocalMedia || !isOnline || useOfflineSource) {
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy();
        } catch {
          // Ignore
        }
        ytPlayerRef.current = null;
      }
      return;
    }

    let cancelled = false;

    const createPlayer = () => {
      if (cancelled || !ytHostRef.current || !window.YT?.Player) return;
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy();
        } catch {
          // Ignore
        }
      }

      ytHostRef.current.innerHTML = '';
      const mountNode = document.createElement('div');
      ytHostRef.current.appendChild(mountNode);

      const shouldAutoplay = autoPlayRef.current ? 1 : 0;

      ytPlayerRef.current = new window.YT.Player(mountNode, {
        videoId: video.videoId,
        playerVars: {
          autoplay: shouldAutoplay,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          start: Math.floor(video.lastPositionSeconds || 0),
          origin: window.location.origin,
        },
        events: {
          onReady: (event) => {
            if (cancelled) return;
            const p = event.target;
            try {
              p.setPlaybackRate(latestVideoRef.current.playbackRate || 1);
              const dur = p.getDuration();
              if (dur > 0) setDuration(dur);
              if (autoPlayRef.current) {
                p.playVideo();
              }
            } catch {
              // Ignore
            }
          },
          onStateChange: (event) => {
            if (cancelled) return;
            const state = event.data;
            setIsPlaying(state === 1);
            if (state === 0 && hasNext) {
              onNextVideo();
            }
          },
          onError: (event) => {
            if (cancelled) return;
            if (event.data === 101 || event.data === 150) {
              setEmbedError('Playback on other websites has been disabled by the video owner.');
            } else if (event.data === 100) {
              setEmbedError('This YouTube video is unavailable or private.');
            } else {
              setEmbedError('This YouTube video could not play in the embedded iframe.');
            }
          },
        },
      });
    };

    if (window.YT?.Player) {
      createPlayer();
    } else {
      const existingScript = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
      if (!existingScript) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      }
      const prevCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (prevCallback) prevCallback();
        createPlayer();
      };
    }

    return () => {
      cancelled = true;
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy();
        } catch {
          // Ignore
        }
        ytPlayerRef.current = null;
      }
    };
  }, [video.videoId, isOnline, useOfflineSource, isLocalMedia]);

  // If user clicks the already-loaded video again with autoPlaySignal, start it immediately
  useEffect(() => {
    if (autoPlaySignal === 0) return;
    if (useOfflineSource && htmlMediaRef.current) {
      htmlMediaRef.current.play().catch(() => {});
    } else if (ytPlayerRef.current && typeof ytPlayerRef.current.playVideo === 'function') {
      try {
        ytPlayerRef.current.playVideo();
      } catch {
        // Handled by onReady
      }
    }
  }, [autoPlaySignal, useOfflineSource]);

  // Poll playback position for resume + A-B loop
  useEffect(() => {
    const interval = setInterval(() => {
      let time = currentTime;
      let dur = duration;

      if (useOfflineSource && htmlMediaRef.current) {
        time = htmlMediaRef.current.currentTime;
        dur = htmlMediaRef.current.duration || dur;
      } else if (ytPlayerRef.current && typeof ytPlayerRef.current.getCurrentTime === 'function') {
        try {
          time = ytPlayerRef.current.getCurrentTime();
          const d = ytPlayerRef.current.getDuration();
          if (d > 0) dur = d;
        } catch {
          return;
        }
      } else {
        return;
      }

      if (Number.isFinite(time)) {
        setCurrentTime(time);
        if (Number.isFinite(dur) && dur > 0) setDuration(dur);

        if (loopActive && loopA !== null && loopB !== null && loopB > loopA && time >= loopB) {
          seekTo(loopA);
        }

        if (Math.abs(time - (latestVideoRef.current.lastPositionSeconds || 0)) >= 4) {
          onUpdateVideo({
            ...latestVideoRef.current,
            lastPositionSeconds: Math.floor(time),
            lastWatchedAt: Date.now(),
            durationSeconds: dur > 0 ? Math.floor(dur) : latestVideoRef.current.durationSeconds,
          });
        }
      }
    }, 600);

    return () => clearInterval(interval);
  }, [useOfflineSource, loopActive, loopA, loopB, onUpdateVideo, currentTime, duration]);

  const seekTo = useCallback(
    (seconds: number) => {
      const clamped = Math.max(0, seconds);
      setCurrentTime(clamped);
      if (useOfflineSource && htmlMediaRef.current) {
        htmlMediaRef.current.currentTime = clamped;
      } else if (ytPlayerRef.current) {
        ytPlayerRef.current.seekTo(clamped, true);
      }
    },
    [useOfflineSource]
  );

  const togglePlayPause = useCallback(() => {
    if (useOfflineSource && htmlMediaRef.current) {
      if (htmlMediaRef.current.paused) {
        htmlMediaRef.current.play().catch(() => {});
      } else {
        htmlMediaRef.current.pause();
      }
      return;
    }

    if (ytPlayerRef.current) {
      const state = ytPlayerRef.current.getPlayerState();
      if (state === 1) {
        ytPlayerRef.current.pauseVideo();
      } else {
        ytPlayerRef.current.playVideo();
      }
    }
  }, [useOfflineSource]);

  const toggleMute = useCallback(() => {
    if (useOfflineSource && htmlMediaRef.current) {
      htmlMediaRef.current.muted = !htmlMediaRef.current.muted;
      setIsMuted(htmlMediaRef.current.muted);
      return;
    }
    if (ytPlayerRef.current) {
      if (ytPlayerRef.current.isMuted()) {
        ytPlayerRef.current.unMute();
        setIsMuted(false);
      } else {
        ytPlayerRef.current.mute();
        setIsMuted(true);
      }
    }
  }, [useOfflineSource]);

  const changeSpeed = useCallback(
    (rate: number) => {
      setPlaybackRate(rate);
      if (useOfflineSource && htmlMediaRef.current) {
        htmlMediaRef.current.playbackRate = rate;
      } else if (ytPlayerRef.current) {
        ytPlayerRef.current.setPlaybackRate(rate);
      }
      onUpdateVideo({...latestVideoRef.current, playbackRate: rate});
    },
    [useOfflineSource, onUpdateVideo]
  );

  const handleAddBookmark = useCallback(
    (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      const timeSec = Math.floor(currentTime);
      const label = bookmarkLabel.trim() || `Timestamp ${formatDuration(timeSec)}`;
      const newBm: VideoBookmark = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timeSeconds: timeSec,
        label,
        createdAt: Date.now(),
      };
      const updatedBookmarks = [...video.bookmarks, newBm].sort(
        (a, b) => a.timeSeconds - b.timeSeconds
      );
      onUpdateVideo({...video, bookmarks: updatedBookmarks});
      setBookmarkLabel('');
    },
    [currentTime, bookmarkLabel, video, onUpdateVideo]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      if (e.key === ' ' || e.key.toLowerCase() === 'k') {
        e.preventDefault();
        togglePlayPause();
      } else if (e.key.toLowerCase() === 'j') {
        e.preventDefault();
        seekTo(currentTime - 10);
      } else if (e.key.toLowerCase() === 'l') {
        e.preventDefault();
        seekTo(currentTime + 10);
      } else if (e.key.toLowerCase() === 'm') {
        e.preventDefault();
        toggleMute();
      } else if (e.key.toLowerCase() === 't') {
        e.preventDefault();
        onToggleTheater();
      } else if (e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setShowBookmarksPanel(true);
        handleAddBookmark();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [togglePlayPause, seekTo, currentTime, toggleMute, onToggleTheater, handleAddBookmark]);

  async function handleRemoveOfflineMedia() {
    await deleteMediaBlob(video.videoId);
    onUpdateVideo({
      ...video,
      mediaCached: false,
      mediaBytes: 0,
      mediaMimeType: undefined,
    });
    onStatsChange();
    if (!isLocalMedia) {
      setUseOfflineSource(false);
    }
  }

  function handleSaveNotes() {
    onUpdateVideo({...video, notes: notesDraft});
    setNotesSaved(true);
    setTimeout(() => setNotesSaved(false), 1800);
  }

  return (
    <div
      className={
        isMini
          ? 'rounded-2xl border border-slate-200 dark:border-[#242A38] bg-white/95 dark:bg-[#13161D]/95 backdrop-blur-md shadow-2xl overflow-hidden'
          : 'space-y-4'
      }
    >
      {/* Persistent Media Viewport — moves seamlessly between Full Stage and Mini-Player */}
      <div className={isMini ? 'flex sm:block items-center gap-2.5 p-2 sm:p-0' : ''}>
        <div
          className={
            isMini
              ? 'relative w-24 sm:w-full aspect-video rounded-lg sm:rounded-none overflow-hidden bg-black shrink-0'
              : 'relative w-full aspect-video rounded-2xl overflow-hidden bg-black border border-slate-200 dark:border-[#1E2430]'
          }
        >
          {sourceType === 'local-audio' && offlineMediaUrl ? (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#161924] via-[#0E1118] to-black p-3 sm:p-6 text-center">
              <div
                className={`${
                  isMini ? 'w-8 h-8 rounded-lg' : 'w-16 h-16 rounded-2xl mb-4'
                } bg-rose-600/15 border border-rose-500/30 flex items-center justify-center text-rose-500`}
              >
                <FileAudio className={isMini ? 'w-4 h-4' : 'w-8 h-8'} />
              </div>
              {!isMini && (
                <>
                  <h3 className="text-lg font-semibold text-white max-w-lg truncate">
                    {video.title}
                  </h3>
                  <p className="mt-1 text-xs text-slate-400">
                    Offline Audio Track · {formatBytes(video.mediaBytes)}
                  </p>
                </>
              )}
              <audio
                ref={htmlMediaRef as React.RefObject<HTMLAudioElement>}
                src={offlineMediaUrl}
                controls={!isMini}
                autoPlay={autoPlaySignal > 0}
                onLoadedMetadata={() => {
                  const el = htmlMediaRef.current;
                  if (el) {
                    if (video.lastPositionSeconds > 0 && video.lastPositionSeconds < el.duration) {
                      el.currentTime = video.lastPositionSeconds;
                    }
                    el.playbackRate = playbackRate;
                    setDuration(el.duration || 0);
                    if (autoPlayRef.current) el.play().catch(() => {});
                  }
                }}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => {
                  setIsPlaying(false);
                  if (hasNext) onNextVideo();
                }}
                className={isMini ? 'hidden' : 'mt-6 w-full max-w-md'}
              />
            </div>
          ) : useOfflineSource && offlineMediaUrl ? (
            <video
              ref={htmlMediaRef as React.RefObject<HTMLVideoElement>}
              src={offlineMediaUrl}
              controls={!isMini}
              autoPlay={autoPlaySignal > 0}
              playsInline
              onLoadedMetadata={() => {
                const el = htmlMediaRef.current;
                if (el) {
                  if (video.lastPositionSeconds > 0 && video.lastPositionSeconds < el.duration) {
                    el.currentTime = video.lastPositionSeconds;
                  }
                  el.playbackRate = playbackRate;
                  setDuration(el.duration || 0);
                  if (autoPlayRef.current) el.play().catch(() => {});
                }
              }}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => {
                setIsPlaying(false);
                if (hasNext) onNextVideo();
              }}
              className="w-full h-full object-contain bg-black"
            />
          ) : isOnline && !isLocalMedia ? (
            embedError ? (
              <div className="w-full h-full flex flex-col items-center justify-center bg-[#10131A] p-6 text-center text-white">
                <p className="text-sm font-semibold text-rose-400 max-w-md">{embedError}</p>
                {video.originalUrl && (
                  <a
                    href={video.originalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 min-h-[40px] px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-xs font-semibold text-white inline-flex items-center gap-2"
                  >
                    <span>Watch Directly on YouTube</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            ) : (
              <div ref={ytHostRef} className="w-full h-full" />
            )
          ) : (
            <div className="relative w-full h-full flex items-center justify-center">
              <CachedThumbnail
                videoId={video.videoId}
                alt={video.title}
                isOnline={false}
                sourceType={sourceType}
                className="absolute inset-0 w-full h-full opacity-30 blur-[2px]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/75 to-black/60" />
              {!isMini && (
                <div className="relative z-10 max-w-md px-6 text-center text-white">
                  <div className="mx-auto w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center mb-3">
                    <WifiOff className="w-5 h-5 text-amber-400" />
                  </div>
                  <h3 className="text-base font-semibold tracking-tight">Offline Mode Active</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
                    Thumbnail, notes, and timestamps are loaded offline. To play video with data turned off, attach an offline video/audio file using the Upload button.
                  </p>
                  <button
                    type="button"
                    onClick={onOpenUploadModal}
                    className="mt-4 min-h-[42px] px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-xs font-semibold text-white inline-flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload Offline File</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Mini-Player Compact Bar (Music-style quick controls + Expand to full player) */}
        {isMini && (
          <div className="min-w-0 flex-1 sm:px-3 sm:py-2.5 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onExpandFromMini}
              className="min-w-0 flex-1 text-left cursor-pointer group"
            >
              <div className="text-xs font-semibold text-slate-900 dark:text-white truncate group-hover:text-rose-500 transition-colors">
                {video.title}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {video.authorName} · {formatDuration(currentTime)}
              </div>
            </button>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={togglePlayPause}
                aria-label={isPlaying ? 'Pause' : 'Play'}
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              </button>

              {hasNext && (
                <button
                  type="button"
                  onClick={onNextVideo}
                  aria-label="Next track"
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1C212C] cursor-pointer"
                >
                  <SkipForward className="w-3.5 h-3.5" />
                </button>
              )}

              <button
                type="button"
                onClick={onExpandFromMini}
                title="Expand to Full Player"
                aria-label="Expand to Full Player"
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1C212C] cursor-pointer"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={onDismissMini}
                title="Hide Mini-Player"
                aria-label="Hide Mini-Player"
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-500 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Full Stage Controls & Metadata (hidden while docked in Mini-Player) */}
      {!isMini && (
        <>
          <div className="rounded-xl border border-slate-200 dark:border-[#1E2430] bg-white dark:bg-[#13161D] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={togglePlayPause}
                disabled={!isOnline && !offlineMediaUrl}
                aria-label={isPlaying ? 'Pause' : 'Play'}
                className="min-h-[40px] min-w-[40px] px-3 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white inline-flex items-center gap-1.5 text-xs font-semibold transition-colors cursor-pointer"
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span>{isPlaying ? 'Pause' : 'Play'}</span>
              </button>

              <button
                type="button"
                onClick={() => seekTo(currentTime - 10)}
                disabled={!isOnline && !offlineMediaUrl}
                title="Rewind 10s (J)"
                className="min-h-[40px] px-2.5 rounded-lg border border-slate-200 dark:border-[#242A38] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1C212C] disabled:opacity-40 inline-flex items-center gap-1 text-xs font-mono cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>10s</span>
              </button>

              <button
                type="button"
                onClick={() => seekTo(currentTime + 10)}
                disabled={!isOnline && !offlineMediaUrl}
                title="Forward 10s (L)"
                className="min-h-[40px] px-2.5 rounded-lg border border-slate-200 dark:border-[#242A38] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1C212C] disabled:opacity-40 inline-flex items-center gap-1 text-xs font-mono cursor-pointer"
              >
                <span>10s</span>
                <RotateCw className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={toggleMute}
                disabled={!isOnline && !offlineMediaUrl}
                aria-label={isMuted ? 'Unmute' : 'Mute'}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-slate-200 dark:border-[#242A38] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1C212C] disabled:opacity-40 cursor-pointer"
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>

              {hasNext && (
                <button
                  type="button"
                  onClick={onNextVideo}
                  className="min-h-[40px] px-3 rounded-lg border border-slate-200 dark:border-[#242A38] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1C212C] inline-flex items-center gap-1.5 text-xs font-medium cursor-pointer"
                >
                  <SkipForward className="w-3.5 h-3.5" />
                  <span>Next</span>
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400 px-1.5">
                {formatDuration(currentTime)} / {formatDuration(duration)}
              </div>

              <select
                aria-label="Playback speed"
                value={playbackRate}
                onChange={(e) => changeSpeed(Number(e.target.value))}
                className="min-h-[40px] rounded-lg border border-slate-200 dark:border-[#242A38] bg-slate-50 dark:bg-[#0B0D11] px-2.5 font-mono text-xs text-slate-800 dark:text-slate-200 cursor-pointer"
              >
                {SPEED_OPTIONS.map((rate) => (
                  <option key={rate} value={rate}>
                    {rate}x
                  </option>
                ))}
              </select>

              <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-[#242A38] overflow-hidden">
                <button
                  type="button"
                  onClick={() => setLoopA(Math.floor(currentTime))}
                  title="Set Loop Start (A)"
                  className={`min-h-[38px] px-2.5 font-mono text-xs transition-colors cursor-pointer ${
                    loopA !== null
                      ? 'bg-rose-600/15 text-rose-600 dark:text-rose-400 font-semibold'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1C212C]'
                  }`}
                >
                  A{loopA !== null ? `:${formatDuration(loopA)}` : ''}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const b = Math.floor(currentTime);
                    setLoopB(b);
                    if (loopA !== null && b > loopA) setLoopActive(true);
                  }}
                  title="Set Loop End (B)"
                  className={`min-h-[38px] px-2.5 font-mono text-xs border-l border-slate-200 dark:border-[#242A38] transition-colors cursor-pointer ${
                    loopB !== null
                      ? 'bg-rose-600/15 text-rose-600 dark:text-rose-400 font-semibold'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1C212C]'
                  }`}
                >
                  B{loopB !== null ? `:${formatDuration(loopB)}` : ''}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (loopActive) {
                      setLoopActive(false);
                      setLoopA(null);
                      setLoopB(null);
                    } else if (loopA !== null && loopB !== null && loopB > loopA) {
                      setLoopActive(true);
                    }
                  }}
                  disabled={loopA === null || loopB === null}
                  title="Toggle A-B Loop"
                  className={`min-h-[38px] px-2.5 border-l border-slate-200 dark:border-[#242A38] inline-flex items-center gap-1 text-xs disabled:opacity-40 cursor-pointer ${
                    loopActive
                      ? 'bg-rose-600 text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1C212C]'
                  }`}
                >
                  <Repeat className="w-3.5 h-3.5" />
                </button>
              </div>

              {!isLocalMedia && offlineMediaUrl && isOnline && (
                <button
                  type="button"
                  onClick={() => setUseOfflineSource((v) => !v)}
                  className="min-h-[40px] px-3 rounded-lg border border-slate-200 dark:border-[#242A38] text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1C212C] cursor-pointer"
                >
                  {useOfflineSource ? 'YouTube IFrame' : 'Offline File'}
                </button>
              )}

              <button
                type="button"
                onClick={onToggleTheater}
                title="Theater Mode (T)"
                className="hidden lg:inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-slate-200 dark:border-[#242A38] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1C212C] cursor-pointer"
              >
                {theaterMode ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="px-1 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white leading-snug">
                {video.title}
              </h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {video.authorName}
                </span>
                <span aria-hidden="true">·</span>
                <span>{video.collection}</span>
                <span aria-hidden="true">·</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                  {video.mediaCached
                    ? `Offline Ready (${formatBytes(video.mediaBytes)})`
                    : video.thumbCached
                      ? 'Info & Thumb Cached'
                      : 'Metadata Cached'}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowBookmarksPanel((v) => !v)}
                className="min-h-[38px] px-3 rounded-lg border border-slate-200 dark:border-[#242A38] text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1C212C] inline-flex items-center gap-1.5 cursor-pointer"
              >
                <BookmarkPlus className="w-3.5 h-3.5 text-rose-500" />
                <span>Notes &amp; Timestamps ({video.bookmarks.length})</span>
              </button>

              {!isLocalMedia && (
                <button
                  type="button"
                  onClick={onOpenUploadModal}
                  className="min-h-[38px] px-3 rounded-lg border border-slate-200 dark:border-[#242A38] text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1C212C] inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-rose-500" />
                  <span>{video.mediaCached ? 'Offline Copy' : 'Attach Offline'}</span>
                </button>
              )}

              {!isLocalMedia && video.mediaCached && (
                <button
                  type="button"
                  onClick={handleRemoveOfflineMedia}
                  title="Remove offline video blob"
                  className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border border-slate-200 dark:border-[#242A38] text-slate-400 hover:text-rose-500 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}

              {video.originalUrl && (
                <a
                  href={video.originalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[38px] px-3 rounded-lg border border-slate-200 dark:border-[#242A38] text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1C212C] inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <span>YouTube</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>

          {showBookmarksPanel && (
            <div className="rounded-2xl border border-slate-200 dark:border-[#1E2430] bg-white dark:bg-[#13161D] p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Timestamp Bookmarks &amp; Offline Notes
                </h2>
                <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  {video.bookmarks.length} pinned
                </span>
              </div>

              <form onSubmit={handleAddBookmark} className="flex items-center gap-2">
                <input
                  type="text"
                  value={bookmarkLabel}
                  onChange={(e) => setBookmarkLabel(e.target.value)}
                  placeholder={`Pin note at ${formatDuration(currentTime)}...`}
                  className="flex-1 min-h-[40px] rounded-lg border border-slate-200 dark:border-[#242A38] bg-slate-50 dark:bg-[#0B0D11] px-3 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-600/50"
                />
                <button
                  type="submit"
                  className="min-h-[40px] px-3.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold hover:opacity-90 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <BookmarkPlus className="w-3.5 h-3.5" />
                  <span>Pin {formatDuration(currentTime)}</span>
                </button>
              </form>

              {video.bookmarks.length > 0 && (
                <div className="divide-y divide-slate-100 dark:divide-[#1E2430] max-h-40 overflow-y-auto">
                  {video.bookmarks.map((bm) => (
                    <div key={bm.id} className="py-2 flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => seekTo(bm.timeSeconds)}
                        className="flex items-center gap-2.5 text-left min-w-0 flex-1 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                      >
                        <span className="font-mono text-xs font-semibold text-rose-600 dark:text-rose-400 tabular-nums shrink-0">
                          {formatDuration(bm.timeSeconds)}
                        </span>
                        <span className="text-xs text-slate-700 dark:text-slate-300 truncate">
                          {bm.label}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateVideo({
                            ...video,
                            bookmarks: video.bookmarks.filter((b) => b.id !== bm.id),
                          })
                        }
                        aria-label="Remove bookmark"
                        className="p-1.5 text-slate-400 hover:text-rose-500 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-2 border-t border-slate-100 dark:border-[#1E2430]">
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="video-notes-area"
                    className="text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Offline Notes
                  </label>
                  <button
                    type="button"
                    onClick={handleSaveNotes}
                    className="text-xs font-medium text-rose-600 dark:text-rose-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                  >
                    {notesSaved ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                        <span className="text-emerald-600 dark:text-emerald-400">Saved</span>
                      </>
                    ) : (
                      <span>Save Notes</span>
                    )}
                  </button>
                </div>
                <textarea
                  id="video-notes-area"
                  rows={3}
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  onBlur={handleSaveNotes}
                  placeholder="Write offline notes for this video or audio track..."
                  className="w-full rounded-xl border border-slate-200 dark:border-[#242A38] bg-slate-50 dark:bg-[#0B0D11] px-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-600/50"
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
