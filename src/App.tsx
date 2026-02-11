import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { AppHeader } from "./components/AppHeader";
import { VideoListSection } from "./components/VideoListSection";
import { AppModals } from "./components/AppModals";
import { FloatingStatusStack } from "./components/FloatingStatusStack";
import { PlayerContent } from "./components/PlayerContent";
import { VideoCardItem } from "./components/VideoCardItem";
import { VideoSkeletonCard } from "./components/VideoSkeletonCard";
import { LoadingOverlay } from "./components/LoadingOverlay";
import { PlayerWindow } from "./components/PlayerWindow";
import { useMetadataFetch } from "./hooks/useMetadataFetch";
import { useDownloadEvents } from "./hooks/useDownloadEvents";
import { usePlayerState } from "./hooks/usePlayerState";
import { useIntegrityCheck } from "./hooks/useIntegrityCheck";
import { usePlayerWindowManager } from "./hooks/usePlayerWindowManager";
import { useSettingsActions } from "./hooks/useSettingsActions";
import { useBackupActions } from "./hooks/useBackupActions";
import { useDownloadErrorSlides } from "./hooks/useDownloadErrorSlides";
import { useBulkDownloadManager } from "./hooks/useBulkDownloadManager";
import { useVideoFiltering } from "./hooks/useVideoFiltering";
import { useActiveActivityItems } from "./hooks/useActiveActivityItems";
import { useThumbnailManager } from "./hooks/useThumbnailManager";
import { useAddVideoActions } from "./hooks/useAddVideoActions";
import { useDownloadActions } from "./hooks/useDownloadActions";
import { usePersistedState } from "./hooks/usePersistedState";
import { useYtDlpUpdateNotices } from "./hooks/useYtDlpUpdateNotices";
import {
  formatClock,
  formatDuration,
  formatPublishedAt,
  getVideoSortTime,
} from "./utils/formatters";
import {
  buildMetadataFields,
  buildThumbnailCandidates,
} from "./utils/metadataHelpers";
import "./App.css";
import "remixicon/fonts/remixicon.css";

type DownloadStatus = "pending" | "downloading" | "downloaded" | "failed";
type CommentStatus =
  | "pending"
  | "downloading"
  | "downloaded"
  | "failed"
  | "unavailable";

type VideoItem = {
  id: string;
  title: string;
  channel: string;
  thumbnail?: string;
  sourceUrl: string;
  publishedAt?: string;
  contentType?: "video" | "live" | "shorts";
  durationSec?: number;
  liveStatus?: string;
  isLive?: boolean;
  wasLive?: boolean;
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
  tags?: string[];
  categories?: string[];
  description?: string;
  channelId?: string;
  uploaderId?: string;
  channelUrl?: string;
  uploaderUrl?: string;
  availability?: string;
  language?: string;
  audioLanguage?: string;
  ageLimit?: number;
  metadataFetched?: boolean;
  downloadStatus: DownloadStatus;
  commentsStatus: CommentStatus;
  addedAt: string;
};

type IndexedVideo = VideoItem & {
  searchText: string;
  sortTime: number;
};

type FloatingErrorItem = {
  id: string;
  title: string;
  phase: "video" | "comments" | "metadata";
  details: string;
  createdAt: number;
};

type ToolingCheckStatus = {
  ok: boolean;
  path: string;
};

type ToolingCheckResult = {
  ytDlp: ToolingCheckStatus;
  ffmpeg: ToolingCheckStatus;
  ffprobe: ToolingCheckStatus;
};

type BulkDownloadState = {
  active: boolean;
  total: number;
  completed: number;
  currentId: string | null;
  currentTitle: string;
  queue: string[];
  stopRequested: boolean;
  phase: "video" | "comments" | null;
  waitingForSingles: boolean;
};

type FloatingNotice = {
  id: string;
  kind: "success" | "error" | "info";
  title: string;
  details?: string;
  autoDismissMs?: number;
};

const COOKIE_BROWSER_OPTIONS = [
  { value: "chrome", label: "Chrome" },
  { value: "edge", label: "Edge" },
  { value: "firefox", label: "Firefox" },
  { value: "brave", label: "Brave" },
  { value: "chromium", label: "Chromium" },
  { value: "opera", label: "Opera" },
  { value: "vivaldi", label: "Vivaldi" },
];

const VIDEO_STORAGE_KEY = "ytlv_videos";
const DOWNLOAD_DIR_KEY = "ytlv_download_dir";
const COOKIES_FILE_KEY = "ytlv_cookies_file";
const COOKIES_SOURCE_KEY = "ytlv_cookies_source";
const COOKIES_BROWSER_KEY = "ytlv_cookies_browser";
const REMOTE_COMPONENTS_KEY = "ytlv_remote_components";
const YTDLP_PATH_KEY = "ytlv_yt_dlp_path";
const FFMPEG_PATH_KEY = "ytlv_ffmpeg_path";
const FFPROBE_PATH_KEY = "ytlv_ffprobe_path";
const INTEGRITY_CHECK_PENDING_KEY = "ytlv_integrity_check_pending";

const GRID_CARD_WIDTH = 240;
const GRID_GAP = 16;
const GRID_ROW_HEIGHT = 420;

function App() {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [addMode, setAddMode] = useState<"video" | "channel">("video");
  const [videoUrl, setVideoUrl] = useState("");
  const [channelUrl, setChannelUrl] = useState("");
  const [downloadOnAdd, setDownloadOnAdd] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [settingsErrorMessage, setSettingsErrorMessage] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [isChannelFetchOpen, setIsChannelFetchOpen] = useState(false);
  const [channelFetchMessage, setChannelFetchMessage] = useState("");
  const [channelFetchProgress, setChannelFetchProgress] = useState(0);
  const [downloadDir, setDownloadDir] = useState<string>("");
  const [downloadingIds, setDownloadingIds] = useState<string[]>([]);
  const [queuedDownloadIds, setQueuedDownloadIds] = useState<string[]>([]);
  const [videoErrors, setVideoErrors] = useState<Record<string, string>>({});
  const storageKeys = useMemo(
    () => ({
      videoStorageKey: VIDEO_STORAGE_KEY,
      downloadDirKey: DOWNLOAD_DIR_KEY,
      cookiesFileKey: COOKIES_FILE_KEY,
      cookiesSourceKey: COOKIES_SOURCE_KEY,
      cookiesBrowserKey: COOKIES_BROWSER_KEY,
      remoteComponentsKey: REMOTE_COMPONENTS_KEY,
      ytDlpPathKey: YTDLP_PATH_KEY,
      ffmpegPathKey: FFMPEG_PATH_KEY,
      ffprobePathKey: FFPROBE_PATH_KEY,
    }),
    []
  );
  const [cookiesFile, setCookiesFile] = useState<string>("");
  const [cookiesSource, setCookiesSource] = useState<
    "none" | "file" | "browser"
  >("none");
  const [cookiesBrowser, setCookiesBrowser] = useState<string>("");
  const [ytDlpPath, setYtDlpPath] = useState<string>("");
  const [ffmpegPath, setFfmpegPath] = useState<string>("");
  const [ffprobePath, setFfprobePath] = useState<string>("");
  const [progressLines, setProgressLines] = useState<Record<string, string>>({});
  const [commentsDownloadingIds, setCommentsDownloadingIds] = useState<string[]>(
    []
  );
  const [commentErrors, setCommentErrors] = useState<Record<string, string>>({});
  const [commentProgressLines, setCommentProgressLines] = useState<
    Record<string, string>
  >({});
  const [downloadErrorItems, setDownloadErrorItems] = useState<
    FloatingErrorItem[]
  >([]);
  const [floatingNotices, setFloatingNotices] = useState<FloatingNotice[]>([]);
  const [isStateReady, setIsStateReady] = useState(false);
  const [backupMessage, setBackupMessage] = useState("");
  const [isBackupNoticeOpen, setIsBackupNoticeOpen] = useState(false);
  const [backupRestartRequired, setBackupRestartRequired] = useState(false);
  const [backupRestartCountdown, setBackupRestartCountdown] = useState(0);
  const [isIntegrityOpen, setIsIntegrityOpen] = useState(false);
  const [remoteComponents, setRemoteComponents] = useState<
    "none" | "ejs:github" | "ejs:npm"
  >("none");
  const [toolingStatus, setToolingStatus] = useState<ToolingCheckResult | null>(
    null
  );
  const [bulkDownload, setBulkDownload] = useState<BulkDownloadState>({
    active: false,
    total: 0,
    completed: 0,
    currentId: null,
    currentTitle: "",
    queue: [],
    stopRequested: false,
    phase: null,
    waitingForSingles: false,
  });
  const [isBulkLogOpen, setIsBulkLogOpen] = useState(false);
  const [isDownloadLogOpen, setIsDownloadLogOpen] = useState(false);
  const [isDownloadErrorOpen, setIsDownloadErrorOpen] = useState(false);
  const [downloadErrorIndex, setDownloadErrorIndex] = useState(0);
  const [pendingCommentIds, setPendingCommentIds] = useState<string[]>([]);
  const [downloadFilter, setDownloadFilter] = useState<
    "all" | "downloaded" | "undownloaded"
  >("all");
  const [typeFilter, setTypeFilter] = useState<
    "all" | "video" | "live" | "shorts"
  >("all");
  const [publishedSort, setPublishedSort] = useState<
    "published-desc" | "published-asc"
  >("published-desc");
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const videosRef = useRef<VideoItem[]>([]);
  const bulkDownloadRef = useRef<BulkDownloadState>(bulkDownload);
  const onStartFailedRef = useRef<(id: string) => void>(() => {});
  const downloadDirRef = useRef<string>("");
  const checkAndStartMetadataRecoveryRef = useRef<(force?: boolean) => void>(
    () => {}
  );
  const indexedVideosRef = useRef<IndexedVideo[]>([]);
  const sortedVideosRef = useRef<IndexedVideo[]>([]);
  const filteredVideosRef = useRef<IndexedVideo[]>([]);

  const isPlayerWindow = useMemo(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("player") === "1";
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV || !isPlayerWindow) return;
    void invoke("open_devtools_window", { label: "player" });
  }, [isPlayerWindow]);

  const {
    isPlayerOpen,
    setIsPlayerOpen,
    playerTitle,
    setPlayerTitle,
    playerSrc,
    playerError,
    setPlayerError,
    playerLoading,
    playerDebug,
    playerFilePath,
    playerCommentsLoading,
    playerCommentsError,
    playerTimeMs,
    setPlayerTimeMs,
    playerCanPlay,
    setPlayerCanPlay,
    isChatAutoScroll,
    setIsChatAutoScroll,
    playerVideoRef,
    playerChatEndRef,
    mediaInfoById,
    sortedPlayerComments,
    playerVisibleComments,
    openPlayerInWindow,
    closePlayer,
    handlePlayerError,
    openExternalPlayer,
    revealInFolder,
  } = usePlayerState({
    isPlayerWindow,
    downloadDir,
    ffprobePath,
    downloadDirRef,
  });

  usePersistedState({
    setVideos,
    setDownloadDir,
    setCookiesFile,
    setCookiesSource,
    setCookiesBrowser,
    setRemoteComponents,
    setYtDlpPath,
    setFfmpegPath,
    setFfprobePath,
    setIsStateReady,
    isStateReady,
    videos,
    downloadDir,
    cookiesFile,
    cookiesSource,
    cookiesBrowser,
    remoteComponents,
    ytDlpPath,
    ffmpegPath,
    ffprobePath,
    storageKeys,
  });

  useEffect(() => {
    videosRef.current = videos;
  }, [videos]);

  useEffect(() => {
    bulkDownloadRef.current = bulkDownload;
  }, [bulkDownload]);


  useEffect(() => {
    downloadDirRef.current = downloadDir;
  }, [downloadDir]);

  useEffect(() => {
    if (!isStateReady) return;
    let cancelled = false;
    void invoke<ToolingCheckResult>("check_tooling", {
      ytDlpPath: ytDlpPath || null,
      ffmpegPath: ffmpegPath || null,
      ffprobePath: ffprobePath || null,
    })
      .then((result) => {
        if (!cancelled) {
          setToolingStatus(result);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setToolingStatus(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isStateReady, ytDlpPath, ffmpegPath, ffprobePath]);

  const addDownloadErrorItem = useCallback(
    (id: string, phase: "video" | "comments" | "metadata", details: string) => {
      const title = videosRef.current.find((item) => item.id === id)?.title ?? id;
      setDownloadErrorItems((prev) => {
        const nextItem: FloatingErrorItem = {
          id,
          title,
          phase,
          details,
          createdAt: Date.now(),
        };
        const filtered = prev.filter(
          (item) => !(item.id === id && item.phase === phase)
        );
        return [nextItem, ...filtered].slice(0, 5);
      });
    },
    []
  );

  const addFloatingNotice = useCallback(
    (notice: Omit<FloatingNotice, "id">) => {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      setFloatingNotices((prev) => [{ ...notice, id }, ...prev].slice(0, 4));
      if (notice.autoDismissMs && notice.autoDismissMs > 0) {
        window.setTimeout(() => {
          setFloatingNotices((prev) => prev.filter((item) => item.id !== id));
        }, notice.autoDismissMs);
      }
    },
    []
  );

  const dismissFloatingNotice = useCallback((id: string) => {
    setFloatingNotices((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const {
    hasCheckedFiles,
    integrityIssues,
    integritySummary,
    integrityRunning,
    integrityMessage,
    runIntegrityCheck,
    isDataCheckDone,
    setIntegrityMessage,
  } = useIntegrityCheck({
    videos,
    videosRef,
    downloadDir,
    isStateReady,
    setVideos,
    setVideoErrors,
    setCommentErrors,
    videoErrors,
    commentErrors,
    onMetadataRecovery: (force) =>
      checkAndStartMetadataRecoveryRef.current(force),
    setIsIntegrityOpen,
  });

  const { ytDlpNotices, dismissYtDlpNotice, ytDlpUpdateDone } =
    useYtDlpUpdateNotices({
      isStateReady,
      isDataCheckDone,
      ytDlpAvailable: toolingStatus?.ytDlp.ok ?? false,
    });

  const { resolveThumbnailPath, refreshThumbnailsForDir } =
    useThumbnailManager({
      videosRef,
      downloadDirRef,
      setVideos,
    });

  const {
    persistSettings,
    pickDownloadDir,
    relinkLibraryFolder,
    closeSettings,
    updateRemoteComponents,
    updateCookiesSource,
    updateCookiesBrowser,
    pickCookiesFile,
    pickYtDlpPath,
    pickFfmpegPath,
    pickFfprobePath,
    clearCookiesFile,
    clearYtDlpPath,
    clearFfmpegPath,
    clearFfprobePath,
  } = useSettingsActions({
    videosRef,
    downloadDir,
    cookiesFile,
    cookiesSource,
    cookiesBrowser,
    remoteComponents,
    ytDlpPath,
    ffmpegPath,
    ffprobePath,
    setDownloadDir,
    setSettingsErrorMessage,
    setIntegrityMessage,
    setIsSettingsOpen,
    setCookiesFile,
    setCookiesSource,
    setCookiesBrowser,
    setRemoteComponents,
    setYtDlpPath,
    setFfmpegPath,
    setFfprobePath,
    refreshThumbnailsForDir,
    runIntegrityCheck,
    storageKeys,
  });

  const { exportBackup, importBackup } = useBackupActions({
    persistSettings,
    setSettingsErrorMessage,
    setBackupMessage,
    setBackupRestartRequired,
    setIsBackupNoticeOpen,
    setBackupRestartCountdown,
    integrityCheckPendingKey: INTEGRITY_CHECK_PENDING_KEY,
  });

  const {
    metadataFetch,
    metadataPaused,
    metadataPauseReason,
    scheduleBackgroundMetadataFetch,
    checkAndStartMetadataRecovery,
    retryMetadataFetch,
    applyMetadataUpdate,
  } = useMetadataFetch({
    videosRef,
    downloadDirRef,
    cookiesFile,
    cookiesSource,
    cookiesBrowser,
    remoteComponents,
    ytDlpPath,
    ffmpegPath,
    addDownloadErrorItem,
    buildMetadataFields,
    buildThumbnailCandidates,
    resolveThumbnailPath,
    setVideos,
    isStateReady,
    isDataCheckDone,
    ytDlpUpdateDone,
    integritySummaryTotal: integritySummary?.total ?? 0,
    integrityIssuesLength: integrityIssues.length,
  });

  useEffect(() => {
    checkAndStartMetadataRecoveryRef.current = checkAndStartMetadataRecovery;
  }, [checkAndStartMetadataRecovery]);

  useEffect(() => {
    if (!isStateReady) return;
    const pending = localStorage.getItem(INTEGRITY_CHECK_PENDING_KEY);
    if (pending !== "1") return;
    localStorage.removeItem(INTEGRITY_CHECK_PENDING_KEY);
    void runIntegrityCheck(true);
  }, [isStateReady, runIntegrityCheck]);

  const {
    startDownload,
    startCommentsDownload,
    handleVideoDownloadFinished,
    handleCommentsDownloadFinished,
  } = useDownloadActions({
      downloadDirRef,
      cookiesFile,
      cookiesSource,
      cookiesBrowser,
      remoteComponents,
      ytDlpPath,
      ffmpegPath,
      setErrorMessage,
      setIsSettingsOpen,
      setDownloadingIds,
      setCommentsDownloadingIds,
      setPendingCommentIds,
      setVideos,
      setVideoErrors,
      setCommentErrors,
      setProgressLines,
      setCommentProgressLines,
      onStartFailedRef,
      bulkDownloadRef,
      setQueuedDownloadIds,
      addFloatingNotice,
    });

  const { addVideo, addChannelVideos } = useAddVideoActions({
    videos,
    setVideos,
    videoUrl,
    setVideoUrl,
    channelUrl,
    setChannelUrl,
    downloadOnAdd,
    setErrorMessage,
    setIsAdding,
    setIsAddOpen,
    setIsChannelFetchOpen,
    setChannelFetchProgress,
    setChannelFetchMessage,
    scheduleBackgroundMetadataFetch,
    startDownload,
    cookiesFile,
    cookiesSource,
    cookiesBrowser,
    remoteComponents,
    ytDlpPath,
  });

  const {
    startBulkDownload,
    stopBulkDownload,
    handleBulkCompletion,
    maybeStartAutoCommentsDownload,
    maybeStartQueuedBulk,
  } = useBulkDownloadManager({
    bulkDownload,
    setBulkDownload,
    bulkDownloadRef,
    videosRef,
    downloadDirRef,
    downloadingIds,
    commentsDownloadingIds,
    queuedDownloadIds,
    pendingCommentIds,
    setPendingCommentIds,
    setErrorMessage,
    setIsSettingsOpen,
    startDownload,
    startCommentsDownload,
  });

  useEffect(() => {
    onStartFailedRef.current = (id: string) => handleBulkCompletion(id, false);
  }, [handleBulkCompletion]);

  const handleVideoDownloadFinishedWithBulk = useCallback(
    (id: string, waitForComments: boolean) => {
      handleVideoDownloadFinished(id, waitForComments);
    },
    [handleVideoDownloadFinished]
  );

  useEffect(() => {
    maybeStartQueuedBulk();
  }, [
    maybeStartQueuedBulk,
    downloadingIds.length,
    queuedDownloadIds.length,
    commentsDownloadingIds.length,
    pendingCommentIds.length,
  ]);

  useDownloadEvents({
    downloadDirRef,
    videosRef,
    setDownloadingIds,
    setCommentsDownloadingIds,
    setProgressLines,
    setCommentProgressLines,
    setVideos,
    setVideoErrors,
    setCommentErrors,
    setPendingCommentIds,
    bulkDownloadRef,
    handleBulkCompletion,
    maybeStartAutoCommentsDownload,
    addDownloadErrorItem,
    setErrorMessage,
    applyMetadataUpdate,
    onVideoDownloadFinished: handleVideoDownloadFinishedWithBulk,
    onCommentsDownloadFinished: handleCommentsDownloadFinished,
  });

  const {
    isSwitchConfirmOpen,
    switchConfirmMessage,
    closeSwitchConfirm,
    confirmSwitch,
    openPlayer,
  } = usePlayerWindowManager({
    isPlayerWindow,
    isStateReady,
    videosRef,
    downloadDir,
    setErrorMessage,
    setIsSettingsOpen,
    openPlayerInWindow,
    setPlayerTitle,
    setPlayerError,
    setIsPlayerOpen,
  });


  const { sortedVideos, filteredVideos, hasUndownloaded } = useVideoFiltering({
    videos,
    downloadFilter,
    typeFilter,
    publishedSort,
    deferredSearchQuery,
    indexedVideosRef,
    sortedVideosRef,
    filteredVideosRef,
    getVideoSortTime,
  });

  const showAddSkeleton = isAdding && addMode === "video";

  const renderSkeletonCard = () => (
    <VideoSkeletonCard />
  );

  const renderVideoCard = (video: VideoItem) => {
    return (
      <VideoCardItem
        video={video}
        downloadingIds={downloadingIds}
        commentsDownloadingIds={commentsDownloadingIds}
        queuedDownloadIds={queuedDownloadIds}
        onPlay={(target) => {
          if (target.downloadStatus === "downloaded") {
            void openPlayer(target);
          }
        }}
        onDownload={startDownload}
        mediaInfo={mediaInfoById[video.id]}
        formatPublishedAt={formatPublishedAt}
        formatDuration={formatDuration}
      />
    );
  };

  const activeActivityItems = useActiveActivityItems({
    bulkDownloadActive: bulkDownload.active && !bulkDownload.waitingForSingles,
    downloadingIds,
    commentsDownloadingIds,
    queuedDownloadIds,
    pendingCommentIds,
    videos,
    progressLines,
    commentProgressLines,
  });

  const activeDownloadCount = downloadingIds.length;
  const queuedDownloadCount = queuedDownloadIds.length;

  const clearDownloadErrors = useCallback(() => {
    setDownloadErrorItems([]);
    setDownloadErrorIndex(0);
  }, []);

  const { downloadErrorSlides, hasDownloadErrors } = useDownloadErrorSlides({
    downloadErrorItems,
    setDownloadErrorIndex,
  });
  const isCheckingFiles =
    isStateReady && !hasCheckedFiles && !!downloadDir && videos.length > 0;
  const addDisabled =
    !!downloadDir &&
    !(
      toolingStatus?.ytDlp.ok &&
      toolingStatus?.ffmpeg.ok &&
      toolingStatus?.ffprobe.ok
    );

  const handleAddModeChange = useCallback(
    (mode: "video" | "channel") => {
      setAddMode(mode);
      setErrorMessage("");
    },
    []
  );

  const playerContent = (
    <PlayerContent
      title={playerTitle}
      loading={playerLoading}
      error={playerError}
      src={playerSrc}
      canPlay={playerCanPlay}
      videoRef={playerVideoRef}
      onCanPlay={() => {
        setPlayerError("");
        setPlayerCanPlay(true);
      }}
      onTimeUpdate={(timeMs) => setPlayerTimeMs(timeMs)}
      onError={handlePlayerError}
      debug={playerDebug}
      filePath={playerFilePath}
      onOpenExternalPlayer={openExternalPlayer}
      onRevealInFolder={revealInFolder}
      sortedComments={sortedPlayerComments}
      isChatAutoScroll={isChatAutoScroll}
      onToggleChatAutoScroll={() => setIsChatAutoScroll((prev) => !prev)}
      commentsLoading={playerCommentsLoading}
      commentsError={playerCommentsError}
      visibleComments={playerVisibleComments}
      chatEndRef={playerChatEndRef}
      formatClock={formatClock}
      timeMs={playerTimeMs}
    />
  );

  if (isPlayerWindow) {
    return (
      <PlayerWindow title={playerTitle} isOpen={isPlayerOpen}>
        {playerContent}
      </PlayerWindow>
    );
  }

  return (
    <main className="app">
      <LoadingOverlay isOpen={isCheckingFiles} message="データチェック中..." />
      <AppHeader
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenAdd={() => setIsAddOpen(true)}
        addDisabled={addDisabled}
      />

      <div className="app-body">
        <VideoListSection
          sortedCount={sortedVideos.length}
          filteredCount={filteredVideos.length}
          showAddSkeleton={showAddSkeleton}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onClearSearch={() => setSearchQuery("")}
          downloadFilter={downloadFilter}
          onChangeDownloadFilter={setDownloadFilter}
          typeFilter={typeFilter}
          onChangeTypeFilter={setTypeFilter}
          publishedSort={publishedSort}
          onChangePublishedSort={setPublishedSort}
          onStartBulkDownload={startBulkDownload}
          bulkDownloadDisabled={
            bulkDownload.active ||
            !hasUndownloaded ||
            !downloadDirRef.current.trim()
          }
          filteredVideos={filteredVideos}
          renderSkeletonCard={renderSkeletonCard}
          renderVideoCard={renderVideoCard}
          gridCardWidth={GRID_CARD_WIDTH}
          gridGap={GRID_GAP}
          gridRowHeight={GRID_ROW_HEIGHT}
          downloadDir={downloadDir}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenAdd={() => setIsAddOpen(true)}
          addDisabled={addDisabled}
        />
      </div>

      <FloatingStatusStack
        ytDlpNotices={ytDlpNotices}
        onCloseNotice={dismissYtDlpNotice}
        floatingNotices={floatingNotices}
        onCloseFloatingNotice={dismissFloatingNotice}
        metadataFetch={metadataFetch}
        metadataPaused={metadataPaused}
        metadataPauseReason={metadataPauseReason}
        onRetryMetadata={retryMetadataFetch}
        hasDownloadErrors={hasDownloadErrors}
        downloadErrorSlides={downloadErrorSlides}
        isDownloadErrorOpen={isDownloadErrorOpen}
        onToggleDownloadErrorOpen={() =>
          setIsDownloadErrorOpen((prev) => !prev)
        }
        onClearDownloadErrors={clearDownloadErrors}
        downloadErrorIndex={downloadErrorIndex}
        onPrevDownloadError={() =>
          setDownloadErrorIndex((prev) => Math.max(prev - 1, 0))
        }
        onNextDownloadError={() =>
          setDownloadErrorIndex((prev) =>
            Math.min(prev + 1, downloadErrorSlides.length - 1)
          )
        }
        bulkDownload={bulkDownload}
        isBulkLogOpen={isBulkLogOpen}
        onToggleBulkLogOpen={() => setIsBulkLogOpen((prev) => !prev)}
        onStopBulkDownload={() => void stopBulkDownload()}
        progressLines={progressLines}
        commentProgressLines={commentProgressLines}
        activeActivityItems={activeActivityItems}
        activeDownloadCount={activeDownloadCount}
        queuedDownloadCount={queuedDownloadCount}
        isDownloadLogOpen={isDownloadLogOpen}
        onToggleDownloadLogOpen={() => setIsDownloadLogOpen((prev) => !prev)}
      />

      <AppModals
        isAddOpen={isAddOpen}
        addMode={addMode}
        onChangeAddMode={handleAddModeChange}
        videoUrl={videoUrl}
        onChangeVideoUrl={setVideoUrl}
        channelUrl={channelUrl}
        onChangeChannelUrl={setChannelUrl}
        downloadOnAdd={downloadOnAdd}
        onToggleDownloadOnAdd={setDownloadOnAdd}
        addErrorMessage={errorMessage}
        isAdding={isAdding}
        onCloseAdd={() => setIsAddOpen(false)}
        onAddVideo={addVideo}
        onAddChannel={addChannelVideos}
        isSettingsOpen={isSettingsOpen}
        onCloseSettings={() => void closeSettings()}
        downloadDir={downloadDir}
        onPickDownloadDir={pickDownloadDir}
        cookiesSource={cookiesSource}
        onUpdateCookiesSource={updateCookiesSource}
        cookiesFile={cookiesFile}
        onPickCookiesFile={pickCookiesFile}
        onClearCookiesFile={clearCookiesFile}
        cookiesBrowser={cookiesBrowser}
        onUpdateCookiesBrowser={updateCookiesBrowser}
        cookieBrowserOptions={COOKIE_BROWSER_OPTIONS}
        ytDlpPath={ytDlpPath}
        ytDlpStatus={toolingStatus?.ytDlp ?? null}
        onPickYtDlpPath={pickYtDlpPath}
        onClearYtDlpPath={clearYtDlpPath}
        ffmpegPath={ffmpegPath}
        ffmpegStatus={toolingStatus?.ffmpeg ?? null}
        onPickFfmpegPath={pickFfmpegPath}
        onClearFfmpegPath={clearFfmpegPath}
        ffprobePath={ffprobePath}
        ffprobeStatus={toolingStatus?.ffprobe ?? null}
        onPickFfprobePath={pickFfprobePath}
        onClearFfprobePath={clearFfprobePath}
        remoteComponents={remoteComponents}
        onUpdateRemoteComponents={updateRemoteComponents}
        integritySummary={integritySummary}
        integrityRunning={integrityRunning}
        onRunIntegrityCheck={() => void runIntegrityCheck(true)}
        onOpenIntegrity={() => setIsIntegrityOpen(true)}
        onExportBackup={exportBackup}
        onImportBackup={importBackup}
        settingsErrorMessage={settingsErrorMessage}
        isIntegrityOpen={isIntegrityOpen}
        onCloseIntegrity={() => setIsIntegrityOpen(false)}
        integrityMessage={integrityMessage}
        integrityIssues={integrityIssues}
        onRelink={relinkLibraryFolder}
        isBackupNoticeOpen={isBackupNoticeOpen}
        backupMessage={backupMessage}
        backupRestartRequired={backupRestartRequired}
        backupRestartCountdown={backupRestartCountdown}
        onCloseBackupNotice={() => setIsBackupNoticeOpen(false)}
        onRestart={() => window.location.reload()}
        isChannelFetchOpen={isChannelFetchOpen}
        channelFetchMessage={channelFetchMessage}
        channelFetchProgress={channelFetchProgress}
        onCloseChannelFetch={() => setIsChannelFetchOpen(false)}
        isSwitchConfirmOpen={isSwitchConfirmOpen}
        switchConfirmMessage={switchConfirmMessage}
        onCancelSwitch={closeSwitchConfirm}
        onConfirmSwitch={confirmSwitch}
        isPlayerOpen={isPlayerOpen}
        onClosePlayer={closePlayer}
        playerContent={playerContent}
      />
    </main>
  );
}

export default App;
