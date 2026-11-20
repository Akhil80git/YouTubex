export interface VideoBookmark {
  id: string;
  timeSeconds: number;
  label: string;
  createdAt: number;
}

export type MediaSourceType = 'youtube' | 'local-video' | 'local-audio';

export interface VideoItem {
  id: string;
  videoId: string;
  sourceType?: MediaSourceType;
  originalUrl: string;
  title: string;
  authorName: string;
  authorUrl: string;
  description: string;
  durationSeconds: number | null;
  collection: string;
  addedAt: number;
  lastWatchedAt: number | null;
  lastPositionSeconds: number;
  playbackRate: number;
  bookmarks: VideoBookmark[];
  notes: string;
  thumbCached: boolean;
  mediaCached: boolean;
  mediaBytes: number;
  mediaMimeType?: string;
}

export interface StorageStats {
  quotaBytes: number | null;
  usageBytes: number | null;
  videoCount: number;
  cachedThumbsCount: number;
  cachedMediaCount: number;
  totalMediaBytes: number;
}

export type AppView = 'player' | 'discover' | 'library' | 'storage';
