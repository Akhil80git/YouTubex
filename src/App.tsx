import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Database,
  Film,
  Library,
  Link2,
  Moon,
  PlayCircle,
  Search,
  Sun,
  Upload,
  WifiOff,
} from 'lucide-react';
import {AddLinksPanel} from './components/AddLinksPanel';
import {DiscoverSearchView} from './components/DiscoverSearchView';
import {PWAInstallButton} from './components/PWAInstallButton';
import {StorageManagerView} from './components/StorageManagerView';
import {UploadMediaModal} from './components/UploadMediaModal';
import {VideoPlayerStage} from './components/VideoPlayerStage';
import {VideoQueueList} from './components/VideoQueueList';
import {useOnlineStatus} from './hooks/useOnlineStatus';
import {
  deleteVideoRecord,
  getAllVideos,
  getSetting,
  getStorageStats,
  saveThumbnailBlob,
  saveVideo,
  saveVideosBulk,
  setSetting,
} from './lib/offlineDb';
import type {AppView, StorageStats, VideoItem} from './types/video';

const DEFAULT_COLLECTIONS = ['Watch Later', 'Tutorials', 'Music', 'Podcasts'];

const STARTER_VIDEO_IDS = [
  {videoId: 'aqz-KE-bpKQ', collection: 'Watch Later'},
  {videoId: 'LXb3EKWsInQ', collection: 'Watch Later'},
  {videoId: 'YE7VzlLtp-4', collection: 'Watch Later'},
  {videoId: 'M7lc1UVf-VE', collection: 'Tutorials'},
];

export default function App() {
  const {isOnline, simulatedOffline, setSimulatedOffline} = useOnlineStatus();

  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<AppView>('player');
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [autoPlaySignal, setAutoPlaySignal] = useState(0);
  const [miniPlayerVisible, setMiniPlayerVisible] = useState(false);
  const [scrolledPastStage, setScrolledPastStage] = useState(false);

  const [showAddLinksModal, setShowAddLinksModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [theaterMode, setTheaterMode] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const [stats, setStats] = useState<StorageStats>({
    quotaBytes: null,
    usageBytes: null,
    videoCount: 0,
    cachedThumbsCount: 0,
    cachedMediaCount: 0,
    totalMediaBytes: 0,
  });

  const stageAnchorRef = useRef<HTMLDivElement | null>(null);

  const refreshStats = useCallback(async () => {
    const next = await getStorageStats();
    setStats(next);
  }, []);

  const refreshLibrary = useCallback(async () => {
    const loaded = await getAllVideos();
    setVideos(loaded);
    setActiveVideoId((prev) => {
      if (prev && loaded.some((v) => v.id === prev)) return prev;
      return loaded[0]?.id ?? null;
    });
  }, []);

  useEffect(() => {
    async function init() {
      const [loadedVideos, savedTheme, savedActiveId, alreadyInitialized] = await Promise.all([
        getAllVideos(),
        getSetting<'dark' | 'light'>('theme', 'dark'),
        getSetting<string | null>('activeVideoId', null),
        getSetting<boolean>('initialized', false),
      ]);

      setDarkMode(savedTheme === 'dark');
      document.documentElement.classList.toggle('dark', savedTheme === 'dark');

      let workingVideos = loadedVideos;

      if (workingVideos.length === 0 && !alreadyInitialized) {
        await setSetting('initialized', true);
        const seeded: VideoItem[] = [];
        for (let i = 0; i < STARTER_VIDEO_IDS.length; i++) {
          const entry = STARTER_VIDEO_IDS[i];
          let title = `YouTube Video (${entry.videoId})`;
          let authorName = 'YouTube';
          let authorUrl = '';
          let description = '';
          let durationSeconds: number | null = null;
          let thumbCached = false;

          if (navigator.onLine) {
            try {
              const metaResp = await fetch(
                `/api/youtube/metadata?videoId=${encodeURIComponent(entry.videoId)}`
              );
              if (metaResp.ok) {
                const meta = (await metaResp.json()) as {
                  title?: string;
                  authorName?: string;
                  authorUrl?: string;
                  description?: string;
                  durationSeconds?: number | null;
                };
                if (meta.title) title = meta.title;
                if (meta.authorName) authorName = meta.authorName;
                if (meta.authorUrl) authorUrl = meta.authorUrl;
                if (meta.description) description = meta.description;
                if (meta.durationSeconds) durationSeconds = meta.durationSeconds;
              }
            } catch {
              // Keep fallback
            }

            try {
              const tResp = await fetch(
                `/api/youtube/thumbnail?videoId=${encodeURIComponent(entry.videoId)}`
              );
              if (tResp.ok) {
                const blob = await tResp.blob();
                await saveThumbnailBlob(entry.videoId, blob);
                thumbCached = true;
              }
            } catch {
              // Ignore
            }
          }

          seeded.push({
            id: `${entry.videoId}-${Date.now()}-${i}`,
            videoId: entry.videoId,
            sourceType: 'youtube',
            originalUrl: `https://www.youtube.com/watch?v=${entry.videoId}`,
            title,
            authorName,
            authorUrl,
            description,
            durationSeconds,
            collection: entry.collection,
            addedAt: Date.now() + (STARTER_VIDEO_IDS.length - i),
            lastWatchedAt: null,
            lastPositionSeconds: 0,
            playbackRate: 1,
            bookmarks: [],
            notes: '',
            thumbCached,
            mediaCached: false,
            mediaBytes: 0,
          });
        }
        await saveVideosBulk(seeded);
        workingVideos = seeded;
      }

      setVideos(workingVideos);

      if (savedActiveId && workingVideos.some((v) => v.id === savedActiveId)) {
        setActiveVideoId(savedActiveId);
      } else if (workingVideos[0]) {
        setActiveVideoId(workingVideos[0].id);
      }

      await refreshStats();
      setLoading(false);
    }
    init();
  }, [refreshStats]);

  // Observe when user scrolls past the top player stage on Player view -> detach smoothly to Mini-Player
  useEffect(() => {
    if (activeView !== 'player' || !stageAnchorRef.current) {
      setScrolledPastStage(false);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        const past = !entry.isIntersecting && entry.boundingClientRect.top < 0;
        setScrolledPastStage(past);
        if (past) {
          setMiniPlayerVisible(true);
        }
      },
      {threshold: 0.05}
    );

    observer.observe(stageAnchorRef.current);
    return () => observer.disconnect();
  }, [activeView, videos.length]);

  const toggleTheme = useCallback(() => {
    setDarkMode((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle('dark', next);
      setSetting('theme', next ? 'dark' : 'light');
      return next;
    });
  }, []);

  const collections = useMemo(() => {
    const set = new Set(DEFAULT_COLLECTIONS);
    for (const v of videos) {
      if (v.collection) set.add(v.collection);
    }
    return Array.from(set);
  }, [videos]);

  const existingVideoIds = useMemo(
    () => new Set(videos.map((v) => v.videoId)),
    [videos]
  );

  const activeVideo = useMemo(
    () => videos.find((v) => v.id === activeVideoId) ?? videos[0] ?? null,
    [videos, activeVideoId]
  );

  // Clicking a card's Title or Expand button opens the video in the Full Player Stage
  const handleSelectVideo = useCallback((id: string) => {
    setActiveVideoId(id);
    setSetting('activeVideoId', id);
    setAutoPlaySignal((s) => s + 1);
    setActiveView('player');
    setMiniPlayerVisible(false);
    setScrolledPastStage(false);
    window.scrollTo({top: 0, behavior: 'smooth'});
  }, []);

  const handlePlayExistingByYtId = useCallback(
    (ytVideoId: string) => {
      const match = videos.find((v) => v.videoId === ytVideoId);
      if (match) {
        handleSelectVideo(match.id);
      }
    },
    [videos, handleSelectVideo]
  );

  const handleExpandFromMini = useCallback(() => {
    setActiveView('player');
    setScrolledPastStage(false);
    setMiniPlayerVisible(false);
    window.scrollTo({top: 0, behavior: 'smooth'});
  }, []);

  const handleAddedVideos = useCallback(
    (created: VideoItem[], stayInPlace = false) => {
      setVideos((prev) => [...created, ...prev]);
      if (created[0]) {
        setActiveVideoId(created[0].id);
        setSetting('activeVideoId', created[0].id);
        setAutoPlaySignal((s) => s + 1);
        if (stayInPlace || activeView !== 'player' || scrolledPastStage) {
          setMiniPlayerVisible(true);
        } else {
          setActiveView('player');
        }
      }
      refreshStats();
    },
    [refreshStats, activeView, scrolledPastStage]
  );

  const handleAddedLocalItem = useCallback(
    (item: VideoItem) => {
      setVideos((prev) => [item, ...prev]);
      setActiveVideoId(item.id);
      setSetting('activeVideoId', item.id);
      setAutoPlaySignal((s) => s + 1);
      if (activeView !== 'player' || scrolledPastStage) {
        setMiniPlayerVisible(true);
      } else {
        setActiveView('player');
      }
      refreshStats();
    },
    [refreshStats, activeView, scrolledPastStage]
  );

  const handleUpdateVideo = useCallback(async (updated: VideoItem) => {
    setVideos((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
    await saveVideo(updated);
  }, []);

  const handleDeleteVideo = useCallback(
    async (target: VideoItem) => {
      await deleteVideoRecord(target.id, target.videoId);
      setVideos((prev) => {
        const next = prev.filter((v) => v.id !== target.id);
        if (activeVideoId === target.id) {
          const nextActive = next[0]?.id ?? null;
          setActiveVideoId(nextActive);
          setSetting('activeVideoId', nextActive);
        }
        return next;
      });
      refreshStats();
    },
    [activeVideoId, refreshStats]
  );

  const handleMoveVideo = useCallback(
    async (id: string, direction: 'up' | 'down') => {
      const idx = videos.findIndex((v) => v.id === id);
      if (idx < 0) return;
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= videos.length) return;

      const copy = [...videos];
      const temp = copy[idx];
      copy[idx] = copy[swapIdx];
      copy[swapIdx] = temp;

      const baseTime = Date.now();
      const reordered = copy.map((item, i) => ({
        ...item,
        addedAt: baseTime - i * 10,
      }));
      setVideos(reordered);
      await saveVideosBulk(reordered);
    },
    [videos]
  );

  const activeIndex = activeVideo ? videos.findIndex((v) => v.id === activeVideo.id) : -1;
  const hasNext = activeIndex >= 0 && activeIndex < videos.length - 1;

  const handleNextVideo = useCallback(() => {
    if (!hasNext) return;
    const nextItem = videos[activeIndex + 1];
    if (nextItem) {
      handleSelectVideo(nextItem.id);
    }
  }, [hasNext, videos, activeIndex, handleSelectVideo]);

  const navItems: Array<{id: AppView; label: string}> = [
    {id: 'player', label: 'Player'},
    {id: 'discover', label: 'Discover'},
    {id: 'library', label: 'Library'},
    {id: 'storage', label: 'Storage'},
  ];

  // Determine whether the persistent VideoPlayerStage renders docked in top stage OR floating mini-player
  const isFloatingMini =
    Boolean(activeVideo) &&
    ((activeView !== 'player' && miniPlayerVisible) ||
      (activeView === 'player' && scrolledPastStage && miniPlayerVisible));

  const showTopPlayerStage = activeView === 'player' && !isFloatingMini;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 dark:bg-[#0B0D11] dark:text-slate-100">
      {/* Three-Zone Top Bar */}
      <header className="sticky top-0 z-30 h-[52px] md:h-16 border-b border-slate-200 dark:border-[#1E2430] bg-white/90 dark:bg-[#0B0D11]/90 backdrop-blur-md">
        <div className="max-w-[1440px] mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={() => {
              setActiveView('player');
              setMiniPlayerVisible(false);
              window.scrollTo({top: 0, behavior: 'smooth'});
            }}
            className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0 cursor-pointer"
          >
            TubeVault
          </button>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            {navItems.map((item) => {
              const active = activeView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveView(item.id)}
                  className={`py-1.5 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'border-rose-600 text-slate-900 dark:text-white'
                      : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <PWAInstallButton />
            <button
              type="button"
              onClick={() => setShowUploadModal(true)}
              title="Upload Video or Audio File"
              aria-label="Upload Video or Audio File"
              className="min-h-[38px] md:min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-[#242A38] bg-white dark:bg-[#171B24] hover:bg-slate-100 dark:hover:bg-[#1F2430] text-slate-800 dark:text-slate-100 text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Upload className="w-4 h-4 text-rose-500" />
              <span className="hidden sm:inline">Upload</span>
            </button>

            <button
              type="button"
              onClick={() => setShowAddLinksModal(true)}
              className="min-h-[38px] md:min-h-[40px] px-3.5 md:px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Link2 className="w-4 h-4" />
              <span>Add Links</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-[1440px] mx-auto px-4 sm:px-6 py-5 pb-28 md:pb-10">
        {/* Compact Workspace Utility Strip */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex flex-wrap items-center gap-2 font-mono tabular-nums">
            <span>{videos.length} items</span>
            <span aria-hidden="true">·</span>
            <span>{stats.cachedThumbsCount} thumbs cached</span>
            <span aria-hidden="true">·</span>
            <span>{stats.cachedMediaCount} offline files</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSimulatedOffline(!simulatedOffline)}
              className={`min-h-[36px] px-3 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                !isOnline
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                  : 'border-slate-200 dark:border-[#1E2430] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#171B24]'
              }`}
            >
              <WifiOff className="w-3.5 h-3.5" />
              <span>{simulatedOffline ? 'Exit Offline Test' : 'Test Offline'}</span>
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-slate-200 dark:border-[#1E2430] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#171B24] transition-colors cursor-pointer"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Non-Player Views */}
        {loading ? (
          <div className="rounded-2xl border border-slate-200 dark:border-[#1E2430] bg-white dark:bg-[#13161D] p-12 text-center text-sm text-slate-500">
            Loading player and cached media...
          </div>
        ) : activeView === 'discover' ? (
          <DiscoverSearchView
            existingVideoIds={existingVideoIds}
            collections={collections}
            isOnline={isOnline}
            onAdded={handleAddedVideos}
            onPlayExisting={handlePlayExistingByYtId}
          />
        ) : activeView === 'storage' ? (
          <StorageManagerView
            stats={stats}
            videos={videos}
            isOnline={isOnline}
            simulatedOffline={simulatedOffline}
            onToggleSimulatedOffline={setSimulatedOffline}
            onRefreshLibrary={refreshLibrary}
            onStatsChange={refreshStats}
          />
        ) : activeView === 'library' ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                Media Library
              </h1>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Click any item to play immediately in mini-player while scrolling
              </span>
            </div>
            <VideoQueueList
              videos={videos}
              activeVideoId={activeVideo?.id ?? null}
              isOnline={isOnline}
              collections={collections}
              onSelectVideo={handleSelectVideo}
              onMoveVideo={handleMoveVideo}
              onDeleteVideo={handleDeleteVideo}
              layout="grid"
            />
          </div>
        ) : videos.length === 0 ? (
          <div className="max-w-xl mx-auto py-12 text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-rose-600/10 border border-rose-600/20 flex items-center justify-center text-rose-600 dark:text-rose-500">
              <Film className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
              Your queue is empty
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Add YouTube links, upload local video/audio files, or search any YouTube channel.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowAddLinksModal(true)}
                className="min-h-[42px] px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
              >
                <Link2 className="w-4 h-4" />
                <span>Add YouTube Links</span>
              </button>
              <button
                type="button"
                onClick={() => setShowUploadModal(true)}
                className="min-h-[42px] px-4 rounded-xl border border-slate-200 dark:border-[#242A38] text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-2 cursor-pointer"
              >
                <Upload className="w-4 h-4 text-rose-500" />
                <span>Upload Video / Audio</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveView('discover')}
                className="min-h-[42px] px-4 rounded-xl border border-slate-200 dark:border-[#242A38] text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-2 cursor-pointer"
              >
                <Search className="w-4 h-4 text-rose-500" />
                <span>Search Channel</span>
              </button>
            </div>
          </div>
        ) : null}

        {/* Persistent Player + Queue Layout: keeps VideoPlayerStage mounted across Mini <-> Full transitions */}
        {!loading && videos.length > 0 && activeVideo && (
          <div
            className={
              activeView === 'player'
                ? `grid gap-6 items-start ${theaterMode ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-12'}`
                : ''
            }
          >
            {/* Scroll Anchor Spacer (prevents layout jump when player floats to mini-player) */}
            {activeView === 'player' && (
              <div
                ref={stageAnchorRef}
                className={theaterMode ? 'w-full' : 'lg:col-span-8'}
              >
                {isFloatingMini && (
                  <div className="w-full aspect-video rounded-2xl border border-dashed border-slate-200 dark:border-[#1E2430] bg-slate-100/50 dark:bg-[#13161D]/40 flex flex-col items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span>Playing in floating mini-player</span>
                    <button
                      type="button"
                      onClick={handleExpandFromMini}
                      className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-semibold cursor-pointer"
                    >
                      Return Video Here
                    </button>
                  </div>
                )}

                {showTopPlayerStage && (
                  <VideoPlayerStage
                    video={activeVideo}
                    autoPlaySignal={autoPlaySignal}
                    isOnline={isOnline}
                    isMini={false}
                    theaterMode={theaterMode}
                    onToggleTheater={() => setTheaterMode((v) => !v)}
                    onExpandFromMini={handleExpandFromMini}
                    onDismissMini={() => setMiniPlayerVisible(false)}
                    onUpdateVideo={handleUpdateVideo}
                    onNextVideo={handleNextVideo}
                    hasNext={hasNext}
                    onOpenUploadModal={() => setShowUploadModal(true)}
                    onStatsChange={refreshStats}
                  />
                )}
              </div>
            )}

            {/* Floating Mini-Player when scrolled down or browsing Library / Discover */}
            {isFloatingMini && (
              <div className="fixed bottom-16 md:bottom-5 right-3 sm:right-5 z-40 w-[calc(100vw-24px)] max-w-[380px] sm:w-[330px]">
                <VideoPlayerStage
                  video={activeVideo}
                  autoPlaySignal={autoPlaySignal}
                  isOnline={isOnline}
                  isMini={true}
                  theaterMode={false}
                  onToggleTheater={() => setTheaterMode((v) => !v)}
                  onExpandFromMini={handleExpandFromMini}
                  onDismissMini={() => setMiniPlayerVisible(false)}
                  onUpdateVideo={handleUpdateVideo}
                  onNextVideo={handleNextVideo}
                  hasNext={hasNext}
                  onOpenUploadModal={() => setShowUploadModal(true)}
                  onStatsChange={refreshStats}
                />
              </div>
            )}

            {/* Queue Sidebar (on Player View) */}
            {activeView === 'player' && (
              <aside className={theaterMode ? 'w-full' : 'lg:col-span-4 lg:sticky lg:top-20'}>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Up Next Queue
                  </h2>
                  <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                    {videos.length} items
                  </span>
                </div>
                <VideoQueueList
                  videos={videos}
                  activeVideoId={activeVideo?.id ?? null}
                  isOnline={isOnline}
                  collections={collections}
                  onSelectVideo={handleSelectVideo}
                  onMoveVideo={handleMoveVideo}
                  onDeleteVideo={handleDeleteVideo}
                  layout="sidebar"
                />
              </aside>
            )}
          </div>
        )}
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 h-14 pb-safe border-t border-slate-200 dark:border-[#1E2430] bg-white/95 dark:bg-[#0B0D11]/95 backdrop-blur-md grid grid-cols-4 items-center">
        {[
          {id: 'player' as AppView, label: 'Player', icon: PlayCircle},
          {id: 'discover' as AppView, label: 'Discover', icon: Search},
          {id: 'library' as AppView, label: 'Library', icon: Library},
          {id: 'storage' as AppView, label: 'Storage', icon: Database},
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeView === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveView(tab.id)}
              className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                active
                  ? 'text-rose-600 dark:text-rose-500'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium tracking-tight">{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Non-intrusive Offline Connectivity Indicator */}
      {!isOnline && (
        <div className="fixed bottom-16 md:bottom-4 left-4 z-30 flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-medium text-white shadow-lg">
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          <span>Offline Mode — Cached thumbnails, notes &amp; offline media active</span>
        </div>
      )}

      {/* Separate YouTube Links & Playlists Modal */}
      {showAddLinksModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
          <AddLinksPanel
            existingVideoIds={existingVideoIds}
            collections={collections}
            isOnline={isOnline}
            onAdded={(items) => handleAddedVideos(items, false)}
            onClose={() => setShowAddLinksModal(false)}
            onOpenDiscover={() => setActiveView('discover')}
            isModal
          />
        </div>
      )}

      {/* Separate Local Video / Audio Upload Modal */}
      {showUploadModal && (
        <UploadMediaModal
          activeVideo={activeVideo}
          collections={collections}
          isOnline={isOnline}
          onAddedLocalItem={handleAddedLocalItem}
          onUpdatedActiveVideo={handleUpdateVideo}
          onStatsChange={refreshStats}
          onClose={() => setShowUploadModal(false)}
        />
      )}
    </div>
  );
}
