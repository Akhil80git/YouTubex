import React, {useEffect, useRef, useState} from 'react';
import {ExternalLink, FileAudio, Maximize2, WifiOff, X} from 'lucide-react';
import {getMediaBlob} from '../lib/offlineDb';
import type {MediaSourceType} from '../types/video';
import {CachedThumbnail} from './CachedThumbnail';

interface YTPlayerLite {
  playVideo: () => void;
  destroy: () => void;
}

interface InlineCardPlayerProps {
  videoId: string;
  title: string;
  sourceType?: MediaSourceType;
  isOnline: boolean;
  onExpand: () => void;
  onStop: () => void;
  compact?: boolean;
}

export const InlineCardPlayer: React.FC<InlineCardPlayerProps> = ({
  videoId,
  title,
  sourceType = 'youtube',
  isOnline,
  onExpand,
  onStop,
  compact = false,
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayerLite | null>(null);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [embedError, setEmbedError] = useState<string | null>(null);
  const [checkedOffline, setCheckedOffline] = useState(false);

  const isLocal = sourceType === 'local-video' || sourceType === 'local-audio';

  // Load local/cached media blob if present
  useEffect(() => {
    let active = true;
    let url: string | null = null;
    setCheckedOffline(false);

    async function loadBlob() {
      const rec = await getMediaBlob(videoId);
      if (!active) return;
      if (rec) {
        url = URL.createObjectURL(rec.blob);
        setLocalUrl(url);
      } else {
        setLocalUrl(null);
      }
      setCheckedOffline(true);
    }

    loadBlob();
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [videoId]);

  // Mount YouTube IFrame API right inside this small card box
  useEffect(() => {
    if (!checkedOffline) return;
    if (localUrl || isLocal || !isOnline) return;

    let cancelled = false;
    setEmbedError(null);

    const mountPlayer = () => {
      if (cancelled || !hostRef.current || !window.YT?.Player) return;
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          // Ignore
        }
      }

      hostRef.current.innerHTML = '';
      const node = document.createElement('div');
      hostRef.current.appendChild(node);

      playerRef.current = new (window.YT.Player as unknown as new (
        el: HTMLElement,
        opts: Record<string, unknown>
      ) => YTPlayerLite)(node, {
        videoId,
        playerVars: {
          autoplay: 1,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (e: {target: YTPlayerLite}) => {
            if (!cancelled) {
              try {
                e.target.playVideo();
              } catch {
                // Ignore
              }
            }
          },
          onError: (e: {data: number}) => {
            if (cancelled) return;
            if (e.data === 101 || e.data === 150) {
              setEmbedError('Embed disabled by owner');
            } else if (e.data === 100) {
              setEmbedError('Video unavailable');
            } else {
              setEmbedError('Playback error');
            }
          },
        },
      });
    };

    if (window.YT?.Player) {
      mountPlayer();
    } else {
      const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
      if (!existing) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      }
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (prev) prev();
        mountPlayer();
      };
    }

    return () => {
      cancelled = true;
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          // Ignore
        }
        playerRef.current = null;
      }
    };
  }, [videoId, isOnline, localUrl, isLocal, checkedOffline]);

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      {/* Live Video / Audio / YouTube IFrame inside the exact thumbnail box */}
      {sourceType === 'local-audio' && localUrl ? (
        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#1B1218] to-black p-2">
          <FileAudio className="w-5 h-5 text-rose-500 mb-1" />
          <audio src={localUrl} controls autoPlay className="w-full max-w-[95%] h-8" />
        </div>
      ) : localUrl ? (
        <video
          src={localUrl}
          controls
          autoPlay
          playsInline
          className="w-full h-full object-contain bg-black"
        />
      ) : !isOnline ? (
        <div className="relative w-full h-full flex flex-col items-center justify-center p-2 text-center text-white">
          <CachedThumbnail
            videoId={videoId}
            alt={title}
            isOnline={false}
            sourceType={sourceType}
            className="absolute inset-0 w-full h-full opacity-25"
          />
          <WifiOff className="relative z-10 w-4 h-4 text-amber-400 mb-1" />
          <span className="relative z-10 text-[10px] font-medium leading-tight">
            Offline — No cached file
          </span>
        </div>
      ) : embedError ? (
        <div className="w-full h-full flex flex-col items-center justify-center bg-[#12141B] p-2 text-center text-white">
          <span className="text-[11px] font-semibold text-rose-400 leading-tight">
            {embedError}
          </span>
          <a
            href={`https://www.youtube.com/watch?v=${videoId}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="mt-1.5 inline-flex items-center gap-1 rounded bg-white/10 hover:bg-white/20 px-2 py-1 text-[10px] font-medium text-white"
          >
            <span>Open YouTube</span>
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>
      ) : (
        <div ref={hostRef} className="w-full h-full" />
      )}

      {/* Top Overlay Controls: Expand to Full Player OR Stop inline playback */}
      <div className="absolute top-1.5 right-1.5 z-20 flex items-center gap-1">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onExpand();
          }}
          title="Open in Full Player"
          aria-label="Open in Full Player"
          className={`${
            compact ? 'h-6 px-1.5 text-[10px]' : 'h-7 px-2 text-[11px]'
          } rounded-md bg-black/80 hover:bg-rose-600 text-white font-semibold inline-flex items-center gap-1 shadow transition-colors cursor-pointer`}
        >
          <Maximize2 className="w-3 h-3" />
          {!compact && <span>Expand</span>}
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onStop();
          }}
          title="Stop preview"
          aria-label="Stop preview"
          className={`${
            compact ? 'h-6 w-6' : 'h-7 w-7'
          } rounded-md bg-black/80 hover:bg-black text-white inline-flex items-center justify-center shadow transition-colors cursor-pointer`}
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};
