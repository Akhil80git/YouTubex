import React, {useEffect, useState} from 'react';
import {FileAudio, FileVideo, Film} from 'lucide-react';
import {getThumbnailBlob, saveThumbnailBlob} from '../lib/offlineDb';
import type {MediaSourceType} from '../types/video';

interface CachedThumbnailProps {
  videoId: string;
  alt: string;
  isOnline: boolean;
  sourceType?: MediaSourceType;
  className?: string;
}

export const CachedThumbnail: React.FC<CachedThumbnailProps> = ({
  videoId,
  alt,
  isOnline,
  sourceType = 'youtube',
  className = '',
}) => {
  const [srcUrl, setSrcUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const isLocalMedia = sourceType === 'local-audio' || sourceType === 'local-video';

  useEffect(() => {
    if (isLocalMedia) return;

    let active = true;
    let objectUrl: string | null = null;
    setFailed(false);

    async function loadThumb() {
      try {
        const cachedBlob = await getThumbnailBlob(videoId);
        if (cachedBlob && active) {
          objectUrl = URL.createObjectURL(cachedBlob);
          setSrcUrl(objectUrl);
          return;
        }

        if (!isOnline) {
          if (active) setFailed(true);
          return;
        }

        const resp = await fetch(`/api/youtube/thumbnail?videoId=${encodeURIComponent(videoId)}`);
        if (!resp.ok) {
          if (active) setFailed(true);
          return;
        }
        const blob = await resp.blob();
        await saveThumbnailBlob(videoId, blob);
        if (active) {
          objectUrl = URL.createObjectURL(blob);
          setSrcUrl(objectUrl);
        }
      } catch {
        if (active) setFailed(true);
      }
    }

    loadThumb();

    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [videoId, isOnline, isLocalMedia]);

  if (sourceType === 'local-audio') {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-rose-950/60 to-[#11151E] text-rose-400 select-none ${className}`}
      >
        <FileAudio className="w-6 h-6" />
        <span className="mt-1 font-mono text-[10px] tracking-tight opacity-80">AUDIO</span>
      </div>
    );
  }

  if (sourceType === 'local-video') {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-slate-800 to-[#0E1118] text-slate-300 select-none ${className}`}
      >
        <FileVideo className="w-6 h-6" />
        <span className="mt-1 font-mono text-[10px] tracking-tight opacity-80">VIDEO</span>
      </div>
    );
  }

  if (failed || !srcUrl) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-slate-200 to-slate-300 dark:from-[#171B24] dark:to-[#10131A] text-slate-500 dark:text-slate-400 select-none ${className}`}
      >
        <Film className="w-6 h-6 opacity-60" />
        <span className="mt-1 font-mono text-[10px] tracking-tight opacity-70">{videoId}</span>
      </div>
    );
  }

  return (
    <img
      src={srcUrl}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`object-cover ${className}`}
    />
  );
};
