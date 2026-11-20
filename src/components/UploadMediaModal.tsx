import React, {useRef, useState} from 'react';
import {
  CheckCircle2,
  Download,
  FileAudio,
  FileVideo,
  HardDrive,
  Loader2,
  Upload,
  X,
} from 'lucide-react';
import {saveMediaBlob, saveVideo} from '../lib/offlineDb';
import {formatBytes} from '../lib/youtube';
import type {MediaSourceType, VideoItem} from '../types/video';

interface UploadMediaModalProps {
  activeVideo: VideoItem | null;
  collections: string[];
  isOnline: boolean;
  onAddedLocalItem: (item: VideoItem) => void;
  onUpdatedActiveVideo: (updated: VideoItem) => void;
  onStatsChange: () => void;
  onClose: () => void;
}

export const UploadMediaModal: React.FC<UploadMediaModalProps> = ({
  activeVideo,
  collections,
  isOnline,
  onAddedLocalItem,
  onUpdatedActiveVideo,
  onStatsChange,
  onClose,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadMode, setUploadMode] = useState<'standalone' | 'attach'>('standalone');
  const [mediaKind, setMediaKind] = useState<'video' | 'audio'>('video');
  const [collection, setCollection] = useState(collections[0] || 'Watch Later');
  const [directUrl, setDirectUrl] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const canAttach = Boolean(activeVideo && (!activeVideo.sourceType || activeVideo.sourceType === 'youtube'));

  async function storeBlobAsItem(blob: Blob, name: string, mimeType: string) {
    const isAudio = mimeType.startsWith('audio/') || /\.(mp3|m4a|wav|ogg|flac|aac)$/i.test(name);
    const sourceType: MediaSourceType = isAudio ? 'local-audio' : 'local-video';

    if (uploadMode === 'attach' && canAttach && activeVideo) {
      const bytes = await saveMediaBlob(activeVideo.videoId, blob, mimeType);
      onUpdatedActiveVideo({
        ...activeVideo,
        mediaCached: true,
        mediaBytes: bytes,
        mediaMimeType: mimeType,
      });
      onStatsChange();
      setStatusMsg(`Attached offline ${isAudio ? 'audio' : 'video'} (${formatBytes(bytes)}) to "${activeVideo.title}".`);
      setTimeout(() => onClose(), 550);
      return;
    }

    const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const cleanTitle = name.replace(/\.[^/.]+$/, '') || (isAudio ? 'Uploaded Audio' : 'Uploaded Video');
    const bytes = await saveMediaBlob(id, blob, mimeType);

    const newItem: VideoItem = {
      id,
      videoId: id,
      sourceType,
      originalUrl: '',
      title: cleanTitle,
      authorName: isAudio ? 'Local Audio File' : 'Local Video File',
      authorUrl: '',
      description: '',
      durationSeconds: null,
      collection,
      addedAt: Date.now(),
      lastWatchedAt: null,
      lastPositionSeconds: 0,
      playbackRate: 1,
      bookmarks: [],
      notes: '',
      thumbCached: false,
      mediaCached: true,
      mediaBytes: bytes,
      mediaMimeType: mimeType,
    };

    await saveVideo(newItem);
    onAddedLocalItem(newItem);
    onStatsChange();
    setStatusMsg(`Saved "${cleanTitle}" (${formatBytes(bytes)}) to offline storage.`);
    setTimeout(() => onClose(), 550);
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setStatusMsg(null);
    try {
      await storeBlobAsItem(file, file.name, file.type || (mediaKind === 'audio' ? 'audio/mpeg' : 'video/mp4'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to store uploaded file');
    } finally {
      e.target.value = '';
    }
  }

  async function handleDirectUrlCache(e: React.FormEvent) {
    e.preventDefault();
    const url = directUrl.trim();
    if (!url || progress !== null) return;
    setError(null);
    setStatusMsg(null);
    setProgress(0);

    try {
      const resp = await fetch(`/api/media/proxy?url=${encodeURIComponent(url)}`);
      if (!resp.ok || !resp.body) {
        const errData = (await resp.json().catch(() => ({}))) as {error?: string};
        throw new Error(errData.error || `Download failed (${resp.status})`);
      }

      const contentType = resp.headers.get('content-type') || (mediaKind === 'audio' ? 'audio/mpeg' : 'video/mp4');
      const contentLength = Number(resp.headers.get('content-length') || '0');
      const reader = resp.body.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;

      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          received += value.length;
          if (contentLength > 0) {
            setProgress(Math.min(99, Math.round((received / contentLength) * 100)));
          }
        }
      }

      const blob = new Blob(chunks as BlobPart[], {type: contentType});
      const urlName = url.split('/').pop()?.split('?')[0] || 'Cached Stream';
      await storeBlobAsItem(blob, urlName, contentType);
      setDirectUrl('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not cache stream URL');
    } finally {
      setProgress(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 dark:border-[#1E2430] bg-white dark:bg-[#13161D] p-6 shadow-2xl space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
              Upload Video &amp; Audio Files
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Store local video or audio files directly in IndexedDB for 100% offline playback—completely separate from YouTube links.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close upload modal"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-[#1C212C] hover:text-slate-900 dark:hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Toggle: Standalone vs Attach to Active YouTube Video */}
        {canAttach && (
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#0B0D11] border border-slate-200 dark:border-[#242A38]">
            <button
              type="button"
              onClick={() => setUploadMode('standalone')}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                uploadMode === 'standalone'
                  ? 'bg-white dark:bg-[#1E2430] text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Add New Video / Audio Track
            </button>
            <button
              type="button"
              onClick={() => setUploadMode('attach')}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                uploadMode === 'attach'
                  ? 'bg-white dark:bg-[#1E2430] text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Attach Offline Copy to Active Video
            </button>
          </div>
        )}

        {/* Separate Video vs Audio Selector */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setMediaKind('video')}
            className={`p-3.5 rounded-xl border text-left transition-colors cursor-pointer ${
              mediaKind === 'video'
                ? 'border-rose-600 bg-rose-600/[0.06]'
                : 'border-slate-200 dark:border-[#242A38] hover:bg-slate-50 dark:hover:bg-[#171B24]'
            }`}
          >
            <FileVideo className="w-5 h-5 text-rose-500 mb-1.5" />
            <div className="text-xs font-semibold text-slate-900 dark:text-white">
              Video File
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              MP4, WebM, MOV, MKV
            </div>
          </button>

          <button
            type="button"
            onClick={() => setMediaKind('audio')}
            className={`p-3.5 rounded-xl border text-left transition-colors cursor-pointer ${
              mediaKind === 'audio'
                ? 'border-rose-600 bg-rose-600/[0.06]'
                : 'border-slate-200 dark:border-[#242A38] hover:bg-slate-50 dark:hover:bg-[#171B24]'
            }`}
          >
            <FileAudio className="w-5 h-5 text-rose-500 mb-1.5" />
            <div className="text-xs font-semibold text-slate-900 dark:text-white">
              Audio Track
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              MP3, M4A, WAV, OGG, FLAC
            </div>
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept={
            mediaKind === 'audio'
              ? 'audio/*,.mp3,.m4a,.wav,.ogg,.flac,.aac'
              : 'video/*,.mp4,.webm,.mkv,.mov'
          }
          onChange={handleFileSelect}
          className="hidden"
        />

        {uploadMode === 'standalone' && (
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Collection
            </label>
            <select
              value={collection}
              onChange={(e) => setCollection(e.target.value)}
              className="w-full min-h-[40px] rounded-lg border border-slate-200 dark:border-[#242A38] bg-slate-50 dark:bg-[#0B0D11] px-3 text-xs text-slate-900 dark:text-slate-100"
            >
              {collections.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        )}

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full min-h-[48px] rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          <Upload className="w-4 h-4" />
          <span>
            Choose {mediaKind === 'audio' ? 'Audio' : 'Video'} File from Device
          </span>
        </button>

        {/* Direct Stream URL Caching */}
        <form
          onSubmit={handleDirectUrlCache}
          className="pt-3 border-t border-slate-100 dark:border-[#1E2430] space-y-2"
        >
          <label
            htmlFor="upload-direct-url"
            className="block text-xs font-medium text-slate-700 dark:text-slate-300"
          >
            Or Download Direct {mediaKind === 'audio' ? 'Audio' : 'Video'} URL for Offline
          </label>
          <div className="flex items-center gap-2">
            <input
              id="upload-direct-url"
              type="url"
              value={directUrl}
              onChange={(e) => setDirectUrl(e.target.value)}
              disabled={!isOnline || progress !== null}
              placeholder={
                mediaKind === 'audio'
                  ? 'https://example.com/podcast.mp3'
                  : 'https://example.com/lecture.mp4'
              }
              className="flex-1 min-h-[40px] rounded-lg border border-slate-200 dark:border-[#242A38] bg-slate-50 dark:bg-[#0B0D11] px-3 font-mono text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-600/50 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!isOnline || !directUrl.trim() || progress !== null}
              className="min-h-[40px] px-3.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold disabled:opacity-40 inline-flex items-center gap-1.5 cursor-pointer"
            >
              {progress !== null ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span className="font-mono tabular-nums">{progress}%</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>Cache</span>
                </>
              )}
            </button>
          </div>
        </form>

        {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}

        {statusMsg && (
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{statusMsg}</span>
          </div>
        )}

        <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
          <HardDrive className="w-3.5 h-3.5 shrink-0" />
          <span>Saved in browser IndexedDB for zero-data playback.</span>
        </div>
      </div>
    </div>
  );
};
