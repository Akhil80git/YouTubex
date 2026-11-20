import React, {useRef, useState} from 'react';
import {
  CheckCircle2,
  Database,
  Download,
  HardDrive,
  RefreshCw,
  Trash2,
  Upload,
  WifiOff,
} from 'lucide-react';
import {clearAllMediaCache, saveThumbnailBlob, saveVideosBulk} from '../lib/offlineDb';
import {formatBytes} from '../lib/youtube';
import type {StorageStats, VideoItem} from '../types/video';

interface StorageManagerViewProps {
  stats: StorageStats;
  videos: VideoItem[];
  isOnline: boolean;
  simulatedOffline: boolean;
  onToggleSimulatedOffline: (val: boolean) => void;
  onRefreshLibrary: () => Promise<void>;
  onStatsChange: () => void;
}

export const StorageManagerView: React.FC<StorageManagerViewProps> = ({
  stats,
  videos,
  isOnline,
  simulatedOffline,
  onToggleSimulatedOffline,
  onRefreshLibrary,
  onStatsChange,
}) => {
  const importRef = useRef<HTMLInputElement | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSyncPending() {
    if (!isOnline || syncing) return;
    setSyncing(true);
    setMessage(null);
    let syncedCount = 0;

    const updated: VideoItem[] = [];
    for (const v of videos) {
      let next = {...v};
      if (v.title.startsWith('YouTube Video (') || v.authorName.includes('Pending Sync')) {
        try {
          const resp = await fetch(
            `/api/youtube/metadata?videoId=${encodeURIComponent(v.videoId)}`
          );
          if (resp.ok) {
            const meta = (await resp.json()) as {
              title?: string;
              authorName?: string;
              authorUrl?: string;
              description?: string;
              durationSeconds?: number | null;
            };
            next = {
              ...next,
              title: meta.title || next.title,
              authorName: meta.authorName || next.authorName,
              authorUrl: meta.authorUrl || next.authorUrl,
              description: meta.description || next.description,
              durationSeconds: meta.durationSeconds ?? next.durationSeconds,
            };
            syncedCount++;
          }
        } catch {
          // Ignore individual failures
        }
      }

      if (!v.thumbCached) {
        try {
          const tResp = await fetch(
            `/api/youtube/thumbnail?videoId=${encodeURIComponent(v.videoId)}`
          );
          if (tResp.ok) {
            const blob = await tResp.blob();
            await saveThumbnailBlob(v.videoId, blob);
            next.thumbCached = true;
            syncedCount++;
          }
        } catch {
          // Ignore
        }
      }
      updated.push(next);
    }

    await saveVideosBulk(updated);
    await onRefreshLibrary();
    onStatsChange();
    setSyncing(false);
    setMessage(`Synced ${syncedCount} metadata & thumbnail records to offline cache.`);
  }

  function handleExportBackup() {
    const payload = {
      exportedAt: new Date().toISOString(),
      app: 'TubeVault',
      videos,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tubevault-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage('Exported library, notes, and timestamp bookmarks as JSON.');
  }

  async function handleImportBackup(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as {videos?: VideoItem[]};
      if (!Array.isArray(parsed.videos)) {
        throw new Error('Invalid TubeVault backup file.');
      }
      await saveVideosBulk(parsed.videos);
      await onRefreshLibrary();
      onStatsChange();
      setMessage(`Imported ${parsed.videos.length} videos from backup.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Backup import failed');
    } finally {
      e.target.value = '';
    }
  }

  async function handleClearMedia() {
    await clearAllMediaCache();
    await onRefreshLibrary();
    onStatsChange();
    setMessage('Cleared cached offline video files. Links, thumbnails, and notes remain preserved.');
  }

  const usagePercent =
    stats.quotaBytes && stats.usageBytes
      ? Math.min(100, Math.max(1, (stats.usageBytes / stats.quotaBytes) * 100))
      : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Offline Storage &amp; Sync
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Inspect local IndexedDB cache capacity, test airplane-mode playback, and back up your curated links and notes.
        </p>
      </div>

      {/* 4-Column Metric Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200 dark:border-[#1E2430] bg-white dark:bg-[#13161D] p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Queued Videos
          </div>
          <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {stats.videoCount}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-[#1E2430] bg-white dark:bg-[#13161D] p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Cached Thumbnails
          </div>
          <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {stats.cachedThumbsCount}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-[#1E2430] bg-white dark:bg-[#13161D] p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Offline Video Files
          </div>
          <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {stats.cachedMediaCount}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-[#1E2430] bg-white dark:bg-[#13161D] p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Offline Media Size
          </div>
          <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {formatBytes(stats.totalMediaBytes)}
          </div>
        </div>
      </div>

      {/* Storage Quota & Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-200 dark:border-[#1E2430] bg-white dark:bg-[#13161D] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <HardDrive className="w-4 h-4 text-rose-500" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Browser Storage Quota
              </h2>
            </div>
            <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
              {stats.usageBytes != null ? formatBytes(stats.usageBytes) : '—'} /{' '}
              {stats.quotaBytes != null ? formatBytes(stats.quotaBytes) : '—'}
            </span>
          </div>

          <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-[#1E2430] overflow-hidden">
            <div
              className="h-full bg-rose-600 transition-all duration-300"
              style={{width: `${usagePercent}%`}}
            />
          </div>

          <div className="pt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleSyncPending}
              disabled={!isOnline || syncing}
              className="min-h-[42px] px-4 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold disabled:opacity-40 inline-flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              <span>{syncing ? 'Syncing Cache...' : 'Sync Missing Metadata & Thumbs'}</span>
            </button>

            <button
              type="button"
              onClick={handleClearMedia}
              disabled={stats.cachedMediaCount === 0}
              className="min-h-[42px] px-4 rounded-xl border border-slate-200 dark:border-[#242A38] text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 disabled:opacity-40 inline-flex items-center gap-2 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Video Blobs</span>
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-[#1E2430] bg-white dark:bg-[#13161D] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Database className="w-4 h-4 text-rose-500" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Offline Testing &amp; Library Backup
              </h2>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 py-2 border-y border-slate-100 dark:border-[#1E2430]">
            <div>
              <div className="text-xs font-medium text-slate-900 dark:text-white flex items-center gap-1.5">
                <WifiOff className="w-3.5 h-3.5 text-amber-500" />
                <span>Simulate Offline Mode</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Test zero-data playback &amp; cached thumbnails without disconnecting Wi-Fi.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={simulatedOffline}
              onClick={() => onToggleSimulatedOffline(!simulatedOffline)}
              className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                simulatedOffline ? 'bg-amber-500' : 'bg-slate-300 dark:bg-[#242A38]'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform ${
                  simulatedOffline ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <input
            ref={importRef}
            type="file"
            accept="application/json,.json"
            onChange={handleImportBackup}
            className="hidden"
          />

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleExportBackup}
              disabled={videos.length === 0}
              className="min-h-[42px] px-4 rounded-xl border border-slate-200 dark:border-[#242A38] text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1C212C] disabled:opacity-40 inline-flex items-center gap-2 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Library JSON</span>
            </button>

            <button
              type="button"
              onClick={() => importRef.current?.click()}
              className="min-h-[42px] px-4 rounded-xl border border-slate-200 dark:border-[#242A38] text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1C212C] inline-flex items-center gap-2 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Import Backup JSON</span>
            </button>
          </div>
        </div>
      </div>

      {message && (
        <div className="flex items-center gap-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{message}</span>
        </div>
      )}
    </div>
  );
};
