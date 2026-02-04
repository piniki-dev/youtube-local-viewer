import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import "./App.css";

type DownloadStatus = "pending" | "downloading" | "downloaded" | "failed";
type CommentStatus = "pending" | "downloading" | "downloaded" | "failed";

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
  downloadStatus: DownloadStatus;
  commentsStatus: CommentStatus;
  addedAt: string;
};

type ChannelFeedItem = {
  id: string;
  title: string;
  channel?: string | null;
  thumbnail?: string | null;
  url: string;
  webpageUrl?: string | null;
  durationSec?: number | null;
  uploadDate?: string | null;
  releaseTimestamp?: number | null;
  timestamp?: number | null;
  liveStatus?: string | null;
  isLive?: boolean | null;
  wasLive?: boolean | null;
  viewCount?: number | null;
  likeCount?: number | null;
  commentCount?: number | null;
  tags?: string[] | null;
  categories?: string[] | null;
  description?: string | null;
  channelId?: string | null;
  uploaderId?: string | null;
  channelUrl?: string | null;
  uploaderUrl?: string | null;
  availability?: string | null;
  language?: string | null;
  audioLanguage?: string | null;
  ageLimit?: number | null;
};

type VideoMetadata = {
  id?: string | null;
  title?: string | null;
  channel?: string | null;
  thumbnail?: string | null;
  url?: string | null;
  webpageUrl?: string | null;
  durationSec?: number | null;
  uploadDate?: string | null;
  releaseTimestamp?: number | null;
  timestamp?: number | null;
  liveStatus?: string | null;
  isLive?: boolean | null;
  wasLive?: boolean | null;
  viewCount?: number | null;
  likeCount?: number | null;
  commentCount?: number | null;
  tags?: string[] | null;
  categories?: string[] | null;
  description?: string | null;
  channelId?: string | null;
  uploaderId?: string | null;
  channelUrl?: string | null;
  uploaderUrl?: string | null;
  availability?: string | null;
  language?: string | null;
  audioLanguage?: string | null;
  ageLimit?: number | null;
};

type DownloadFinished = {
  id: string;
  success: boolean;
  stdout: string;
  stderr: string;
  cancelled?: boolean;
};

type CommentFinished = {
  id: string;
  success: boolean;
  stdout: string;
  stderr: string;
};

type CommentItem = {
  author: string;
  text: string;
  likeCount?: number;
  publishedAt?: string;
  offsetMs?: number;
};

type MediaInfo = {
  videoCodec?: string | null;
  audioCodec?: string | null;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  container?: string | null;
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
};

const VIDEO_STORAGE_KEY = "ytlv_videos";
const DOWNLOAD_DIR_KEY = "ytlv_download_dir";
const COOKIES_FILE_KEY = "ytlv_cookies_file";
const REMOTE_COMPONENTS_KEY = "ytlv_remote_components";
const YTDLP_PATH_KEY = "ytlv_yt_dlp_path";
const FFMPEG_PATH_KEY = "ytlv_ffmpeg_path";
const FFPROBE_PATH_KEY = "ytlv_ffprobe_path";

type PersistedState = {
  videos: VideoItem[];
  downloadDir?: string | null;
  cookiesFile?: string | null;
  remoteComponents?: string | null;
  ytDlpPath?: string | null;
  ffmpegPath?: string | null;
  ffprobePath?: string | null;
};

function App() {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [addMode, setAddMode] = useState<"video" | "channel">("video");
  const [videoUrl, setVideoUrl] = useState("");
  const [channelUrl, setChannelUrl] = useState("");
  const [downloadOnAdd, setDownloadOnAdd] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [isChannelFetchOpen, setIsChannelFetchOpen] = useState(false);
  const [channelFetchMessage, setChannelFetchMessage] = useState("");
  const [channelFetchProgress, setChannelFetchProgress] = useState(0);
  const [downloadDir, setDownloadDir] = useState<string>("");
  const [downloadingIds, setDownloadingIds] = useState<string[]>([]);
  const [videoErrors, setVideoErrors] = useState<Record<string, string>>({});
  const [isErrorOpen, setIsErrorOpen] = useState(false);
  const [errorTargetId, setErrorTargetId] = useState<string | null>(null);
  const [cookiesFile, setCookiesFile] = useState<string>("");
  const [ytDlpPath, setYtDlpPath] = useState<string>("");
  const [ffmpegPath, setFfmpegPath] = useState<string>("");
  const [ffprobePath, setFfprobePath] = useState<string>("");
  const [progressLines, setProgressLines] = useState<Record<string, string>>({});
  const [commentsDownloadingIds, setCommentsDownloadingIds] = useState<string[]>([]);
  const [commentErrors, setCommentErrors] = useState<Record<string, string>>({});
  const [commentProgressLines, setCommentProgressLines] = useState<Record<string, string>>({});
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsTitle, setCommentsTitle] = useState("");
  const [commentsList, setCommentsList] = useState<CommentItem[]>([]);
  const [commentsError, setCommentsError] = useState("");
  const [isStateReady, setIsStateReady] = useState(false);
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const [playerTitle, setPlayerTitle] = useState("");
  const [playerSrc, setPlayerSrc] = useState<string | null>(null);
  const [playerError, setPlayerError] = useState("");
  const [playerLoading, setPlayerLoading] = useState(false);
  const [playerVideoId, setPlayerVideoId] = useState<string | null>(null);
  const [playerDebug, setPlayerDebug] = useState<string>("");
  const [playerFilePath, setPlayerFilePath] = useState<string | null>(null);
  const [playerComments, setPlayerComments] = useState<CommentItem[]>([]);
  const [playerCommentsLoading, setPlayerCommentsLoading] = useState(false);
  const [playerCommentsError, setPlayerCommentsError] = useState("");
  const [playerTimeMs, setPlayerTimeMs] = useState(0);
  const [isChatAutoScroll, setIsChatAutoScroll] = useState(true);
  const [playerWindowActiveId, setPlayerWindowActiveId] = useState<string | null>(
    null
  );
  const [playerWindowActiveTitle, setPlayerWindowActiveTitle] = useState("");
  const [isSwitchConfirmOpen, setIsSwitchConfirmOpen] = useState(false);
  const [switchConfirmMessage, setSwitchConfirmMessage] = useState("");
  const [pendingSwitchVideo, setPendingSwitchVideo] = useState<VideoItem | null>(
    null
  );
  const [mediaInfoById, setMediaInfoById] = useState<Record<string, MediaInfo | null>>({});
  const [mediaInfoErrors, setMediaInfoErrors] = useState<Record<string, string>>({});
  const [mediaInfoLoadingIds, setMediaInfoLoadingIds] = useState<string[]>([]);
  const [hasCheckedFiles, setHasCheckedFiles] = useState(false);
  const [remoteComponents, setRemoteComponents] = useState<
    "none" | "ejs:github" | "ejs:npm"
  >("none");
  const [pendingPlayerId, setPendingPlayerId] = useState<string | null>(null);
  const [bulkDownload, setBulkDownload] = useState<BulkDownloadState>({
    active: false,
    total: 0,
    completed: 0,
    currentId: null,
    currentTitle: "",
    queue: [],
    stopRequested: false,
    phase: null,
  });
  const [isBulkLogOpen, setIsBulkLogOpen] = useState(false);
  const [isDownloadLogOpen, setIsDownloadLogOpen] = useState(false);
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
  const playerVideoRef = useRef<HTMLVideoElement | null>(null);
  const playerChatEndRef = useRef<HTMLDivElement | null>(null);
  const videosRef = useRef<VideoItem[]>([]);
  const bulkDownloadRef = useRef<BulkDownloadState>(bulkDownload);
  const downloadDirRef = useRef<string>("");
  const isPlayerWindow = useMemo(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("player") === "1";
  }, []);
  const requestAutoPlay = useCallback(() => {
    if (!isPlayerWindow) return;
    const video = playerVideoRef.current;
    if (!video || !playerSrc || playerError) return;
    if (Number.isFinite(video.currentTime) && video.currentTime > 0) {
      try {
        video.currentTime = 0;
      } catch {
        // ignore seek errors
      }
    }
    const result = video.play();
    if (result && typeof result.catch === "function") {
      result.catch(() => {
        // ignore autoplay errors
      });
    }
  }, [isPlayerWindow, playerSrc, playerError]);

  useEffect(() => {
    const load = async () => {
      let loadedVideos: VideoItem[] = [];
      let loadedDownloadDir: string | null = null;
      let loadedCookiesFile: string | null = null;
      let loadedRemote: string | null = null;
      let loadedYtDlpPath: string | null = null;
      let loadedFfmpegPath: string | null = null;
      let loadedFfprobePath: string | null = null;
      try {
        const state = await invoke<PersistedState>("load_state");
        if (Array.isArray(state?.videos) && state.videos.length > 0) {
          loadedVideos = state.videos;
        }
        loadedDownloadDir = state?.downloadDir ?? null;
        loadedCookiesFile = state?.cookiesFile ?? null;
        loadedRemote = state?.remoteComponents ?? null;
        loadedYtDlpPath = state?.ytDlpPath ?? null;
        loadedFfmpegPath = state?.ffmpegPath ?? null;
        loadedFfprobePath = state?.ffprobePath ?? null;
      } catch {
        loadedVideos = [];
      }

      if (loadedVideos.length === 0) {
        const raw = localStorage.getItem(VIDEO_STORAGE_KEY);
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as VideoItem[];
            if (Array.isArray(parsed)) {
              loadedVideos = parsed;
            }
          } catch {
            loadedVideos = [];
          }
        }
      }

      const normalizedVideos = loadedVideos.map((item) => ({
        ...item,
        commentsStatus: item.commentsStatus ?? "pending",
      }));
      setVideos(normalizedVideos);

      if (!loadedDownloadDir) {
        const legacyDir = localStorage.getItem(DOWNLOAD_DIR_KEY);
        if (legacyDir) loadedDownloadDir = legacyDir;
      }
      if (!loadedCookiesFile) {
        const legacyCookies = localStorage.getItem(COOKIES_FILE_KEY);
        if (legacyCookies) loadedCookiesFile = legacyCookies;
      }
      if (!loadedRemote) {
        const legacyRemote = localStorage.getItem(REMOTE_COMPONENTS_KEY);
        if (legacyRemote) loadedRemote = legacyRemote;
      }
      if (!loadedYtDlpPath) {
        const legacyYtDlp = localStorage.getItem(YTDLP_PATH_KEY);
        if (legacyYtDlp) loadedYtDlpPath = legacyYtDlp;
      }
      if (!loadedFfmpegPath) {
        const legacyFfmpeg = localStorage.getItem(FFMPEG_PATH_KEY);
        if (legacyFfmpeg) loadedFfmpegPath = legacyFfmpeg;
      }
      if (!loadedFfprobePath) {
        const legacyFfprobe = localStorage.getItem(FFPROBE_PATH_KEY);
        if (legacyFfprobe) loadedFfprobePath = legacyFfprobe;
      }

      if (loadedDownloadDir) setDownloadDir(loadedDownloadDir);
      if (loadedCookiesFile) setCookiesFile(loadedCookiesFile);
      if (loadedRemote === "ejs:github" || loadedRemote === "ejs:npm") {
        setRemoteComponents(loadedRemote);
      }
      if (loadedYtDlpPath) setYtDlpPath(loadedYtDlpPath);
      if (loadedFfmpegPath) setFfmpegPath(loadedFfmpegPath);
      if (loadedFfprobePath) setFfprobePath(loadedFfprobePath);

      try {
        await invoke("save_state", {
          state: {
            videos: normalizedVideos,
            downloadDir: loadedDownloadDir,
            cookiesFile: loadedCookiesFile,
            remoteComponents: loadedRemote,
            ytDlpPath: loadedYtDlpPath,
            ffmpegPath: loadedFfmpegPath,
            ffprobePath: loadedFfprobePath,
          } satisfies PersistedState,
        });
      } catch {
        // ignore migration errors
      }

      setIsStateReady(true);
    };

    void load();
  }, []);

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
    if (!isPlayerWindow) return;
    let unlisten: (() => void) | null = null;
    const setup = async () => {
      unlisten = await listen<{ id: string }>("player-open", (event) => {
        setPendingPlayerId(event.payload.id);
      });
    };
    void setup();
    return () => {
      if (unlisten) unlisten();
    };
  }, [isPlayerWindow]);

  useEffect(() => {
    if (isPlayerWindow) return;
    let unlisten: (() => void) | null = null;
    const setup = async () => {
      unlisten = await listen<{ id: string; title: string }>(
        "player-active",
        (event) => {
          setPlayerWindowActiveId(event.payload.id);
          setPlayerWindowActiveTitle(event.payload.title);
        }
      );
    };
    void setup();
    return () => {
      if (unlisten) unlisten();
    };
  }, [isPlayerWindow]);

  useEffect(() => {
    if (!isPlayerWindow) return;
    const params = new URLSearchParams(window.location.search);
    const initialId = params.get("videoId");
    if (initialId) setPendingPlayerId(initialId);
  }, [isPlayerWindow]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    const setup = async () => {
      unlisten = await listen<{ id: string; line: string }>(
        "download-progress",
        (event) => {
          const { id, line } = event.payload;
          setProgressLines((prev) => ({ ...prev, [id]: line }));
        }
      );
    };
    void setup();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    const setup = async () => {
      unlisten = await listen<DownloadFinished>(
        "download-finished",
        (event) => {
          const { id, success, stderr, stdout, cancelled } = event.payload;
          const wasCancelled = Boolean(cancelled);
          setDownloadingIds((prev) => prev.filter((item) => item !== id));
          if (wasCancelled) {
            setVideos((prev) =>
              prev.map((v) =>
                v.id === id ? { ...v, downloadStatus: "pending" } : v
              )
            );
            setVideoErrors((prev) => {
              const next = { ...prev };
              delete next[id];
              return next;
            });
            setProgressLines((prev) => {
              const next = { ...prev };
              delete next[id];
              return next;
            });
          } else if (success) {
            setVideos((prev) =>
              prev.map((v) =>
                v.id === id ? { ...v, downloadStatus: "downloaded" } : v
              )
            );
            setVideoErrors((prev) => {
              const next = { ...prev };
              delete next[id];
              return next;
            });
            setProgressLines((prev) => {
              const next = { ...prev };
              delete next[id];
              return next;
            });
            maybeStartAutoCommentsDownload(id);
          } else {
            setVideos((prev) =>
              prev.map((v) =>
                v.id === id ? { ...v, downloadStatus: "failed" } : v
              )
            );
            const details = stderr || stdout || "不明なエラー";
            setVideoErrors((prev) => ({ ...prev, [id]: details }));
            setErrorMessage("ダウンロードに失敗しました。詳細を確認してください。");
          }
          if (bulkDownloadRef.current.active && bulkDownloadRef.current.currentId === id) {
            if (wasCancelled || !success) {
              handleBulkCompletion(id, wasCancelled);
            }
          } else {
            if (wasCancelled) return;
          }
        }
      );
    };
    void setup();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    const setup = async () => {
      unlisten = await listen<{ id: string; line: string }>(
        "comments-progress",
        (event) => {
          const { id, line } = event.payload;
          setCommentProgressLines((prev) => ({ ...prev, [id]: line }));
        }
      );
    };
    void setup();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    const setup = async () => {
      unlisten = await listen<CommentFinished>(
        "comments-finished",
        (event) => {
          const { id, success, stderr, stdout } = event.payload;
          setCommentsDownloadingIds((prev) => prev.filter((item) => item !== id));
          if (success) {
            setVideos((prev) =>
              prev.map((v) =>
                v.id === id ? { ...v, commentsStatus: "downloaded" } : v
              )
            );
            setCommentErrors((prev) => {
              const next = { ...prev };
              delete next[id];
              return next;
            });
            setCommentProgressLines((prev) => {
              const next = { ...prev };
              delete next[id];
              return next;
            });
          } else {
            setVideos((prev) =>
              prev.map((v) =>
                v.id === id ? { ...v, commentsStatus: "failed" } : v
              )
            );
            const details = stderr || stdout || "不明なエラー";
            setCommentErrors((prev) => ({ ...prev, [id]: details }));
            setErrorMessage("ライブチャット取得に失敗しました。詳細を確認してください。");
          }
          setPendingCommentIds((prev) => prev.filter((item) => item !== id));
          if (
            bulkDownloadRef.current.active &&
            bulkDownloadRef.current.currentId === id &&
            bulkDownloadRef.current.phase === "comments"
          ) {
            handleBulkCompletion(id, false);
          }
        }
      );
    };
    void setup();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  useEffect(() => {
    if (!isStateReady) return;
    localStorage.setItem(VIDEO_STORAGE_KEY, JSON.stringify(videos));
    const persist = async () => {
      try {
        await invoke("save_state", {
          state: {
            videos,
            downloadDir: downloadDir || null,
            cookiesFile: cookiesFile || null,
            remoteComponents: remoteComponents || null,
            ytDlpPath: ytDlpPath || null,
            ffmpegPath: ffmpegPath || null,
            ffprobePath: ffprobePath || null,
          } satisfies PersistedState,
        });
      } catch {
        // ignore store errors to avoid blocking UI
      }
    };
    void persist();
  }, [videos, downloadDir, cookiesFile, remoteComponents, ytDlpPath, ffmpegPath, ffprobePath, isStateReady]);

  useEffect(() => {
    if (!isStateReady) return;
    setHasCheckedFiles(false);
  }, [downloadDir, isStateReady]);

  useEffect(() => {
    if (!isStateReady || hasCheckedFiles) return;
    if (!downloadDir || videos.length === 0) return;

    const verifyLocalFiles = async () => {
      const checks = await Promise.all(
        videos.map(async (video) => {
          let videoOk = true;
          let commentsOk = true;

          if (video.downloadStatus === "downloaded") {
            try {
              videoOk = await invoke<boolean>("video_file_exists", {
                id: video.id,
                title: video.title,
                outputDir: downloadDir,
              });
            } catch {
              videoOk = false;
            }
          }

          if (video.commentsStatus === "downloaded") {
            try {
              commentsOk = await invoke<boolean>("comments_file_exists", {
                id: video.id,
                outputDir: downloadDir,
              });
            } catch {
              commentsOk = false;
            }
          }

          return { id: video.id, videoOk, commentsOk };
        })
      );

      const checkMap = new Map(checks.map((item) => [item.id, item]));

      setVideos((prev) =>
        prev.map((video) => {
          const result = checkMap.get(video.id);
          if (!result) return video;
          let next = video;
          if (video.downloadStatus === "downloaded" && !result.videoOk) {
            next = { ...next, downloadStatus: "failed" };
          }
          if (video.commentsStatus === "downloaded" && !result.commentsOk) {
            next = { ...next, commentsStatus: "failed" };
          }
          return next;
        })
      );

      setVideoErrors((prev) => {
        const next = { ...prev };
        for (const item of checks) {
          if (!item.videoOk) {
            next[item.id] = "動画ファイルが見つかりません。再ダウンロードしてください。";
          } else if (next[item.id]?.includes("動画ファイルが見つかりません")) {
            delete next[item.id];
          }
        }
        return next;
      });

      setCommentErrors((prev) => {
        const next = { ...prev };
        for (const item of checks) {
          if (!item.commentsOk) {
            next[item.id] = "コメントファイルが見つかりません。再取得してください。";
          } else if (next[item.id]?.includes("コメントファイルが見つかりません")) {
            delete next[item.id];
          }
        }
        return next;
      });

      setHasCheckedFiles(true);
    };

    void verifyLocalFiles();
  }, [isStateReady, hasCheckedFiles, downloadDir, videos]);

  const parseVideoId = (url: string) => {
    try {
      const u = new URL(url);
      if (u.hostname.includes("youtu.be")) {
        return u.pathname.replace("/", "");
      }
      if (u.pathname.startsWith("/shorts/")) {
        return u.pathname.split("/shorts/")[1]?.split("/")[0] ?? null;
      }
      if (u.pathname.startsWith("/embed/")) {
        return u.pathname.split("/embed/")[1]?.split("/")[0] ?? null;
      }
      return u.searchParams.get("v");
    } catch {
      return null;
    }
  };

  const parseUploadDate = (value?: string | null) => {
    if (!value) return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (/^\d{8}$/.test(trimmed)) {
      const y = trimmed.slice(0, 4);
      const m = trimmed.slice(4, 6);
      const d = trimmed.slice(6, 8);
      const iso = new Date(`${y}-${m}-${d}T00:00:00Z`);
      if (!Number.isNaN(iso.getTime())) return iso.toISOString();
    }
    return undefined;
  };

  const parseTimestamp = (value?: number | null) => {
    if (typeof value === "number" && Number.isFinite(value)) {
      return new Date(value * 1000).toISOString();
    }
    return undefined;
  };

  const deriveContentType = (input: {
    webpageUrl?: string | null;
    durationSec?: number | null;
    liveStatus?: string | null;
    isLive?: boolean | null;
  }) => {
    const liveStatus = input.liveStatus?.toLowerCase();
    if (input.isLive || liveStatus === "is_live" || liveStatus === "upcoming") {
      return "live" as const;
    }
    if (liveStatus === "post_live" || liveStatus === "was_live") {
      return "live" as const;
    }
    if (input.webpageUrl?.includes("/shorts/")) {
      return "shorts" as const;
    }
    if (typeof input.durationSec === "number" && input.durationSec <= 60) {
      return "shorts" as const;
    }
    return "video" as const;
  };

  const buildMetadataFields = (input: {
    webpageUrl?: string | null;
    durationSec?: number | null;
    uploadDate?: string | null;
    releaseTimestamp?: number | null;
    timestamp?: number | null;
    liveStatus?: string | null;
    isLive?: boolean | null;
    wasLive?: boolean | null;
    viewCount?: number | null;
    likeCount?: number | null;
    commentCount?: number | null;
    tags?: string[] | null;
    categories?: string[] | null;
    description?: string | null;
    channelId?: string | null;
    uploaderId?: string | null;
    channelUrl?: string | null;
    uploaderUrl?: string | null;
    availability?: string | null;
    language?: string | null;
    audioLanguage?: string | null;
    ageLimit?: number | null;
  }) => {
    const publishedAt =
      parseTimestamp(input.releaseTimestamp) ??
      parseTimestamp(input.timestamp) ??
      parseUploadDate(input.uploadDate);
    return {
      publishedAt,
      contentType: deriveContentType(input),
      durationSec:
        typeof input.durationSec === "number" ? input.durationSec : undefined,
      liveStatus: input.liveStatus ?? undefined,
      isLive: input.isLive ?? undefined,
      wasLive: input.wasLive ?? undefined,
      viewCount:
        typeof input.viewCount === "number" ? input.viewCount : undefined,
      likeCount:
        typeof input.likeCount === "number" ? input.likeCount : undefined,
      commentCount:
        typeof input.commentCount === "number" ? input.commentCount : undefined,
      tags: Array.isArray(input.tags) ? input.tags : undefined,
      categories: Array.isArray(input.categories) ? input.categories : undefined,
      description: input.description ?? undefined,
      channelId: input.channelId ?? undefined,
      uploaderId: input.uploaderId ?? undefined,
      channelUrl: input.channelUrl ?? undefined,
      uploaderUrl: input.uploaderUrl ?? undefined,
      availability: input.availability ?? undefined,
      language: input.language ?? undefined,
      audioLanguage: input.audioLanguage ?? undefined,
      ageLimit:
        typeof input.ageLimit === "number" ? input.ageLimit : undefined,
    } satisfies Pick<
      VideoItem,
      | "publishedAt"
      | "contentType"
      | "durationSec"
      | "liveStatus"
      | "isLive"
      | "wasLive"
      | "viewCount"
      | "likeCount"
      | "commentCount"
      | "tags"
      | "categories"
      | "description"
      | "channelId"
      | "uploaderId"
      | "channelUrl"
      | "uploaderUrl"
      | "availability"
      | "language"
      | "audioLanguage"
      | "ageLimit"
    >;
  };

  const guessThumbnailExtension = (
    url: string,
    contentType: string | null
  ) => {
    const normalized = contentType?.toLowerCase() || "";
    if (normalized.includes("image/jpeg") || normalized.includes("image/jpg")) return "jpg";
    if (normalized.includes("image/png")) return "png";
    if (normalized.includes("image/webp")) return "webp";
    if (normalized.includes("image/gif")) return "gif";

    const match = url.toLowerCase().match(/\.([a-z0-9]+)(?:\?|#|$)/);
    if (match?.[1]) {
      const ext = match[1];
      if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) {
        return ext === "jpeg" ? "jpg" : ext;
      }
    }
    return "jpg";
  };

  const resolveThumbnailPath = async (
    videoId: string,
    thumbnailUrls: Array<string | null | undefined>
  ) => {
    const candidates = thumbnailUrls
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter((item) => item.length > 0);
    if (candidates.length === 0) return undefined;
    try {
      for (const url of candidates) {
        try {
          const response = await fetch(url);
          if (!response.ok) {
            continue;
          }
          const contentType = response.headers.get("content-type");
          const extension = guessThumbnailExtension(url, contentType);
          const buffer = await response.arrayBuffer();
          const data = Array.from(new Uint8Array(buffer));
          const savedPath = await invoke<string>("save_thumbnail", {
            videoId,
            data,
            extension,
          });
          return savedPath || url;
        } catch {
          // try next candidate
        }
      }
      return candidates[0];
    } catch {
      return candidates[0];
    }
  };

  const buildThumbnailCandidates = (id: string, primary?: string | null) => [
    `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
    `https://i.ytimg.com/vi/${id}/sddefault.jpg`,
    primary,
    `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  ];

  const toThumbnailSrc = (thumbnail?: string) => {
    if (!thumbnail) return undefined;
    if (
      thumbnail.startsWith("http://") ||
      thumbnail.startsWith("https://") ||
      thumbnail.startsWith("asset://") ||
      thumbnail.startsWith("data:")
    ) {
      return thumbnail;
    }
    return convertFileSrc(thumbnail);
  };


  const addVideo = async () => {
    setErrorMessage("");
    const trimmed = videoUrl.trim();
    const id = parseVideoId(trimmed);
    if (!id) {
      setErrorMessage("YouTubeの動画URLを正しく入力してください。");
      return;
    }

    if (videos.some((v) => v.id === id)) {
      setErrorMessage("同じ動画がすでに追加されています。");
      return;
    }

    setIsAdding(true);
    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`;
      const [oembedRes, metadata] = await Promise.all([
        fetch(oembedUrl),
        invoke<VideoMetadata>("get_video_metadata", {
          url: trimmed,
          cookiesFile: cookiesFile || null,
          remoteComponents: remoteComponents === "none" ? null : remoteComponents,
          ytDlpPath: ytDlpPath || null,
        }).catch(() => null),
      ]);
      const data = oembedRes.ok ? await oembedRes.json() : null;
      const metaFields = buildMetadataFields({
        webpageUrl: metadata?.webpageUrl ?? null,
        durationSec: metadata?.durationSec ?? null,
        uploadDate: metadata?.uploadDate ?? null,
        releaseTimestamp: metadata?.releaseTimestamp ?? null,
        timestamp: metadata?.timestamp ?? null,
        liveStatus: metadata?.liveStatus ?? null,
        isLive: metadata?.isLive ?? null,
        wasLive: metadata?.wasLive ?? null,
        viewCount: metadata?.viewCount ?? null,
        likeCount: metadata?.likeCount ?? null,
        commentCount: metadata?.commentCount ?? null,
        tags: metadata?.tags ?? null,
        categories: metadata?.categories ?? null,
        description: metadata?.description ?? null,
        channelId: metadata?.channelId ?? null,
        uploaderId: metadata?.uploaderId ?? null,
        channelUrl: metadata?.channelUrl ?? null,
        uploaderUrl: metadata?.uploaderUrl ?? null,
        availability: metadata?.availability ?? null,
        language: metadata?.language ?? null,
        audioLanguage: metadata?.audioLanguage ?? null,
        ageLimit: metadata?.ageLimit ?? null,
      });
      const primaryThumbnail = data?.thumbnail_url ?? metadata?.thumbnail ?? null;
      const resolvedThumbnail = await resolveThumbnailPath(
        id,
        buildThumbnailCandidates(id, primaryThumbnail)
      );
      const newVideo: VideoItem = {
        id,
        title: data?.title ?? metadata?.title ?? "Untitled",
        channel: data?.author_name ?? metadata?.channel ?? "YouTube",
        thumbnail:
          resolvedThumbnail ??
          primaryThumbnail ??
          `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        sourceUrl: trimmed,
        ...metaFields,
        downloadStatus: "pending",
        commentsStatus: "pending",
        addedAt: new Date().toISOString(),
      };
      setVideos((prev) => [newVideo, ...prev]);
      if (downloadOnAdd) {
        void startDownload(newVideo);
      }
      setVideoUrl("");
      setIsAddOpen(false);
    } catch {
      setErrorMessage("動画情報の取得に失敗しました。");
    } finally {
      setIsAdding(false);
    }
  };

  const addChannelVideos = async () => {
    setErrorMessage("");
    const trimmed = channelUrl.trim();
    if (!trimmed) {
      setErrorMessage("チャンネルURLを入力してください。");
      return;
    }

    setIsAdding(true);
    setIsChannelFetchOpen(true);
    setChannelFetchProgress(0);
    setChannelFetchMessage("チャンネル情報を取得中...");
    try {
      setChannelFetchProgress(35);
      setChannelFetchMessage("動画一覧を取得中...");
      const result = await invoke<ChannelFeedItem[]>("list_channel_videos", {
        url: trimmed,
        cookiesFile: cookiesFile || null,
        remoteComponents: remoteComponents === "none" ? null : remoteComponents,
        ytDlpPath: ytDlpPath || null,
        limit: null,
      });
      setChannelFetchProgress(70);
      setChannelFetchMessage("動画リストを整理中...");

      const existingIds = new Set(videos.map((v) => v.id));
      const baseTime = Date.now();
      const total = result?.length ?? 0;
      const newItems = await Promise.all(
        (result ?? [])
          .filter((item) => item?.id && !existingIds.has(item.id))
          .map(async (item, index) => {
            const addedAt = new Date(baseTime + (total - index)).toISOString();
            const metaFields = buildMetadataFields({
              webpageUrl: item.webpageUrl ?? item.url ?? null,
              durationSec: item.durationSec ?? null,
              uploadDate: item.uploadDate ?? null,
              releaseTimestamp: item.releaseTimestamp ?? null,
              timestamp: item.timestamp ?? null,
              liveStatus: item.liveStatus ?? null,
              isLive: item.isLive ?? null,
              wasLive: item.wasLive ?? null,
              viewCount: item.viewCount ?? null,
              likeCount: item.likeCount ?? null,
              commentCount: item.commentCount ?? null,
              tags: item.tags ?? null,
              categories: item.categories ?? null,
              description: item.description ?? null,
              channelId: item.channelId ?? null,
              uploaderId: item.uploaderId ?? null,
              channelUrl: item.channelUrl ?? null,
              uploaderUrl: item.uploaderUrl ?? null,
              availability: item.availability ?? null,
              language: item.language ?? null,
              audioLanguage: item.audioLanguage ?? null,
              ageLimit: item.ageLimit ?? null,
            });
            const primaryThumbnail = item.thumbnail || null;
            const fallbackThumbnail = `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`;
            const resolvedThumbnail = await resolveThumbnailPath(
              item.id,
              buildThumbnailCandidates(item.id, primaryThumbnail)
            );
            return {
              id: item.id,
              title: item.title || "Untitled",
              channel: item.channel?.trim() || "YouTube",
              thumbnail: resolvedThumbnail ?? primaryThumbnail ?? fallbackThumbnail,
              sourceUrl: item.url || `https://www.youtube.com/watch?v=${item.id}`,
              ...metaFields,
              downloadStatus: "pending" as const,
              commentsStatus: "pending" as const,
              addedAt,
            } satisfies VideoItem;
          })
      );

      if (newItems.length === 0) {
        setErrorMessage("追加できる新しい動画が見つかりませんでした。");
        return;
      }

      setChannelFetchProgress(90);
      setChannelFetchMessage(`追加確認中... (${newItems.length}件)`);

      const confirmed = window.confirm(
        `${newItems.length}件の動画を追加してもいいですか？`
      );
      if (!confirmed) {
        setChannelFetchMessage("キャンセルしました");
        return;
      }

      setChannelFetchMessage(`追加中... (${newItems.length}件)`);
      setVideos((prev) => [...newItems, ...prev]);
      setChannelUrl("");
      setIsAddOpen(false);
      setChannelFetchProgress(100);
      setChannelFetchMessage("完了しました");
    } catch (err) {
      const detail =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : "";
      setErrorMessage(
        detail
          ? `チャンネルの動画取得に失敗しました。${detail}`
          : "チャンネルの動画取得に失敗しました。"
      );
    } finally {
      setIsAdding(false);
      setTimeout(() => {
        setIsChannelFetchOpen(false);
        setChannelFetchProgress(0);
        setChannelFetchMessage("");
      }, 400);
    }
  };

  const startNextBulkDownload = (stateOverride?: BulkDownloadState) => {
    const state = stateOverride ?? bulkDownloadRef.current;
    if (!state.active) return;

    const queue = [...state.queue];
    let completed = state.completed;
    let nextVideo: VideoItem | undefined;
    let nextId: string | undefined;

    while (queue.length > 0) {
      const candidateId = queue.shift();
      if (!candidateId) continue;
      const candidate = videosRef.current.find((v) => v.id === candidateId);
      if (!candidate || candidate.downloadStatus === "downloaded") {
        completed += 1;
        continue;
      }
      nextVideo = candidate;
      nextId = candidateId;
      break;
    }

    if (!nextVideo || !nextId) {
      const doneState: BulkDownloadState = {
        ...state,
        active: false,
        queue: [],
        completed,
        currentId: null,
        currentTitle: "",
        stopRequested: false,
      };
      setBulkDownload(doneState);
      bulkDownloadRef.current = doneState;
      return;
    }

    const nextState: BulkDownloadState = {
      ...state,
      queue,
      completed,
      currentId: nextId,
      currentTitle: nextVideo.title,
      phase: "video",
    };
    setBulkDownload(nextState);
    bulkDownloadRef.current = nextState;
    void startDownload(nextVideo);
  };

  const handleBulkCompletion = (id: string, cancelled: boolean) => {
    const state = bulkDownloadRef.current;
    if (!state.active || state.currentId !== id) return;
    setPendingCommentIds((prev) => prev.filter((item) => item !== id));

    const nextState: BulkDownloadState = {
      ...state,
      completed: state.completed + 1,
      currentId: null,
      currentTitle: "",
      phase: null,
    };

    if (state.stopRequested || cancelled) {
      const finalState: BulkDownloadState = {
        ...nextState,
        active: false,
        queue: [],
        stopRequested: false,
      };
      setBulkDownload(finalState);
      bulkDownloadRef.current = finalState;
      return;
    }

    setBulkDownload(nextState);
    bulkDownloadRef.current = nextState;
    startNextBulkDownload(nextState);
  };

  const maybeStartAutoCommentsDownload = (id: string) => {
    const video = videosRef.current.find((item) => item.id === id);
    if (!video) return;
    if (video.commentsStatus === "downloaded") return;
    if (commentsDownloadingIds.includes(id)) return;
    setPendingCommentIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    if (bulkDownloadRef.current.active && bulkDownloadRef.current.currentId === id) {
      const nextState: BulkDownloadState = {
        ...bulkDownloadRef.current,
        phase: "comments",
      };
      setBulkDownload(nextState);
      bulkDownloadRef.current = nextState;
    }
    void startCommentsDownload(video);
  };

  const startBulkDownload = () => {
    const outputDir = downloadDirRef.current.trim();
    if (!outputDir) {
      setErrorMessage("保存先フォルダが未設定です。設定から選択してください。");
      setIsSettingsOpen(true);
      return;
    }
    if (bulkDownloadRef.current.active) return;
    if (downloadingIds.length > 0) {
      setErrorMessage("他のダウンロードが進行中です。完了後に一括ダウンロードしてください。");
      return;
    }
    const targets = videosRef.current.filter(
      (video) => video.downloadStatus !== "downloaded"
    );
    if (targets.length === 0) {
      setErrorMessage("未ダウンロードの動画がありません。");
      return;
    }

    const nextState: BulkDownloadState = {
      active: true,
      total: targets.length,
      completed: 0,
      currentId: null,
      currentTitle: "",
      queue: targets.map((video) => video.id),
      stopRequested: false,
      phase: null,
    };
    setBulkDownload(nextState);
    bulkDownloadRef.current = nextState;
    startNextBulkDownload(nextState);
  };

  const stopBulkDownload = async () => {
    const state = bulkDownloadRef.current;
    if (!state.active || !state.currentId) return;

    const nextState: BulkDownloadState = { ...state, stopRequested: true };
    setBulkDownload(nextState);
    bulkDownloadRef.current = nextState;

    try {
      await invoke("stop_download", { id: state.currentId });
    } catch {
      setErrorMessage("ダウンロード停止に失敗しました。");
      const recoverState = { ...nextState, stopRequested: false };
      setBulkDownload(recoverState);
      bulkDownloadRef.current = recoverState;
    }
  };

  const startDownload = async (video: VideoItem) => {
    const outputDir = downloadDirRef.current.trim();
    if (!outputDir) {
      setErrorMessage("保存先フォルダが未設定です。設定から選択してください。");
      setIsSettingsOpen(true);
      return;
    }
    setDownloadingIds((prev) => (prev.includes(video.id) ? prev : [...prev, video.id]));
    setVideos((prev) =>
      prev.map((v) =>
        v.id === video.id ? { ...v, downloadStatus: "downloading" } : v
      )
    );
    try {
      await invoke("start_download", {
        id: video.id,
        url: video.sourceUrl,
        outputDir,
        cookiesFile: cookiesFile || null,
        remoteComponents: remoteComponents === "none" ? null : remoteComponents,
        ytDlpPath: ytDlpPath || null,
        ffmpegPath: ffmpegPath || null,
      });
    } catch {
      setVideos((prev) =>
        prev.map((v) =>
          v.id === video.id ? { ...v, downloadStatus: "failed" } : v
        )
      );
      setVideoErrors((prev) => ({
        ...prev,
        [video.id]: "yt-dlpの実行に失敗しました。",
      }));
      setProgressLines((prev) => ({
        ...prev,
        [video.id]: "yt-dlpの実行に失敗しました。",
      }));
      setErrorMessage("ダウンロードに失敗しました。詳細を確認してください。");
      setDownloadingIds((prev) => prev.filter((id) => id !== video.id));
      handleBulkCompletion(video.id, false);
    }
  };

  const startCommentsDownload = async (video: VideoItem) => {
    const outputDir = downloadDirRef.current.trim();
    if (!outputDir) {
      setErrorMessage("保存先フォルダが未設定です。設定から選択してください。");
      setIsSettingsOpen(true);
      return;
    }
    setPendingCommentIds((prev) => prev.filter((id) => id !== video.id));
    if (bulkDownloadRef.current.active && bulkDownloadRef.current.currentId === video.id) {
      const nextState: BulkDownloadState = {
        ...bulkDownloadRef.current,
        phase: "comments",
      };
      setBulkDownload(nextState);
      bulkDownloadRef.current = nextState;
    }
    setCommentsDownloadingIds((prev) =>
      prev.includes(video.id) ? prev : [...prev, video.id]
    );
    setVideos((prev) =>
      prev.map((v) =>
        v.id === video.id ? { ...v, commentsStatus: "downloading" } : v
      )
    );
    try {
      await invoke("start_comments_download", {
        id: video.id,
        url: video.sourceUrl,
        outputDir,
        cookiesFile: cookiesFile || null,
        remoteComponents: remoteComponents === "none" ? null : remoteComponents,
        ytDlpPath: ytDlpPath || null,
        ffmpegPath: ffmpegPath || null,
      });
    } catch {
      setVideos((prev) =>
        prev.map((v) =>
          v.id === video.id ? { ...v, commentsStatus: "failed" } : v
        )
      );
      setCommentErrors((prev) => ({
        ...prev,
        [video.id]: "yt-dlpの実行に失敗しました。",
      }));
      setCommentProgressLines((prev) => ({
        ...prev,
        [video.id]: "yt-dlpの実行に失敗しました。",
      }));
      setErrorMessage("ライブチャット取得に失敗しました。詳細を確認してください。");
      setCommentsDownloadingIds((prev) => prev.filter((id) => id !== video.id));
    }
  };

  const openComments = async (video: VideoItem) => {
    if (!downloadDir) {
      setErrorMessage("保存先フォルダが未設定です。設定から選択してください。");
      setIsSettingsOpen(true);
      return;
    }
    setCommentsLoading(true);
    setCommentsError("");
    setCommentsTitle(video.title);
    setIsCommentsOpen(true);
    try {
      const result = await invoke<CommentItem[]>("get_comments", {
        id: video.id,
        outputDir: downloadDir,
      });
      setCommentsList(result ?? []);
    } catch {
      setCommentsError("ライブチャットの読み込みに失敗しました。");
    } finally {
      setCommentsLoading(false);
    }
  };

  const loadPlayerComments = async (video: VideoItem) => {
    setPlayerCommentsLoading(true);
    setPlayerCommentsError("");
    setPlayerComments([]);
    if (video.commentsStatus !== "downloaded") {
      setPlayerCommentsLoading(false);
      setPlayerCommentsError("ライブチャット未取得のため同期表示できません。");
      return;
    }
    try {
      const result = await invoke<CommentItem[]>("get_comments", {
        id: video.id,
        outputDir: downloadDir,
      });
      setPlayerComments(result ?? []);
    } catch {
      setPlayerCommentsError("ライブチャットの読み込みに失敗しました。");
    } finally {
      setPlayerCommentsLoading(false);
    }
  };

  const openPlayerWindow = async (
    video: VideoItem,
    options?: { skipConfirm?: boolean }
  ) => {
    const label = "player";
    const existing = await WebviewWindow.getByLabel(label);
    if (existing) {
      try {
        const isDifferentVideo =
          playerWindowActiveId !== null
            ? playerWindowActiveId !== video.id
            : true;
        if (isDifferentVideo && !options?.skipConfirm) {
          const currentTitle = playerWindowActiveTitle || "再生中の動画";
          setSwitchConfirmMessage(
            `${currentTitle}を再生中ですが切り替えますか？`
          );
          setPendingSwitchVideo(video);
          setIsSwitchConfirmOpen(true);
          return;
        }
        await emitTo(label, "player-open", { id: video.id });
        try {
          await existing.setTitle(video.title);
        } catch {
          // ignore title errors
        }
        await existing.setFocus();
        existing.once("tauri://destroyed", () => {
          setPlayerWindowActiveId(null);
          setPlayerWindowActiveTitle("");
        });
        setPlayerWindowActiveId(video.id);
        setPlayerWindowActiveTitle(video.title);
      } catch {
        setErrorMessage("プレイヤーウィンドウの起動に失敗しました。");
      }
      return;
    }

    const url = `index.html?player=1&videoId=${encodeURIComponent(video.id)}`;
    const playerWindow = new WebviewWindow(label, {
      title: video.title,
      url,
      width: 1200,
      height: 800,
      resizable: true,
    });
    playerWindow.once("tauri://created", () => {
      void emitTo(label, "player-open", { id: video.id });
    });
    playerWindow.once("tauri://error", () => {
      setErrorMessage("プレイヤーウィンドウの作成に失敗しました。");
    });
    playerWindow.once("tauri://destroyed", () => {
      setPlayerWindowActiveId(null);
      setPlayerWindowActiveTitle("");
    });
    setPlayerWindowActiveId(video.id);
    setPlayerWindowActiveTitle(video.title);
  };

  const closeSwitchConfirm = () => {
    setIsSwitchConfirmOpen(false);
    setSwitchConfirmMessage("");
    setPendingSwitchVideo(null);
  };

  const confirmSwitch = async () => {
    const target = pendingSwitchVideo;
    closeSwitchConfirm();
    if (!target) return;
    await openPlayerWindow(target, { skipConfirm: true });
  };

  const openPlayer = async (video: VideoItem) => {
    if (!isPlayerWindow) {
      if (!downloadDir) {
        setErrorMessage("保存先フォルダが未設定です。設定から選択してください。");
        setIsSettingsOpen(true);
        return;
      }
      await openPlayerWindow(video);
      return;
    }

    if (!downloadDir) {
      setPlayerError("保存先フォルダが未設定のため再生できません。");
      setIsPlayerOpen(true);
      return;
    }

    setPlayerLoading(true);
    setPlayerError("");
    setPlayerTitle(video.title);
    try {
      await getCurrentWindow().setTitle(video.title);
    } catch {
      // ignore title errors
    }
    if (isPlayerWindow) {
      try {
        await emitTo("main", "player-active", {
          id: video.id,
          title: video.title,
        });
      } catch {
        // ignore event errors
      }
    }
    setPlayerSrc(null);
    setPlayerVideoId(video.id);
    setPlayerDebug("");
    setPlayerFilePath(null);
    setPlayerTimeMs(0);
    setIsChatAutoScroll(true);
    setIsPlayerOpen(true);
    void loadPlayerComments(video);

    try {
      const filePath = await invoke<string | null>("resolve_video_file", {
        id: video.id,
        title: video.title,
        outputDir: downloadDir,
      });
      if (!filePath) {
        setPlayerError("動画ファイルが見つかりませんでした。");
        return;
      }
      setPlayerFilePath(filePath);
      try {
        const info = await invoke<{
          videoCodec?: string | null;
          audioCodec?: string | null;
          width?: number | null;
          height?: number | null;
          duration?: number | null;
          container?: string | null;
        }>("probe_media", { filePath, ffprobePath: ffprobePath || null });
        setMediaInfoById((prev) => ({ ...prev, [video.id]: info }));
      } catch {
        // ignore probe errors here; user can run manual check
      }
      const src = convertFileSrc(filePath);
      setPlayerSrc(src);
    } catch {
      setPlayerError("動画ファイルの読み込みに失敗しました。");
    } finally {
      setPlayerLoading(false);
    }
  };

  useEffect(() => {
    if (!isPlayerWindow || !isStateReady || !pendingPlayerId) return;
    const target = videosRef.current.find((item) => item.id === pendingPlayerId);
    if (!target) {
      setPlayerTitle("動画が見つかりませんでした。");
      setPlayerError("ライブラリに該当する動画が見つかりませんでした。");
      setIsPlayerOpen(true);
      return;
    }
    void openPlayer(target);
  }, [isPlayerWindow, isStateReady, pendingPlayerId]);

  useEffect(() => {
    if (!isPlayerWindow || !isPlayerOpen) return;
    const video = playerVideoRef.current;
    if (!video || !playerSrc || playerError) return;
    if (video.readyState >= 2) {
      requestAutoPlay();
      return;
    }
    const handleCanPlay = () => {
      requestAutoPlay();
    };
    video.addEventListener("canplay", handleCanPlay, { once: true });
    return () => {
      video.removeEventListener("canplay", handleCanPlay);
    };
  }, [isPlayerWindow, isPlayerOpen, playerSrc, playerError, requestAutoPlay]);

  const closePlayer = () => {
    setIsPlayerOpen(false);
    setPlayerSrc(null);
    setPlayerError("");
    setPlayerTitle("");
    setPlayerVideoId(null);
    setPlayerDebug("");
    setPlayerFilePath(null);
    setPlayerComments([]);
    setPlayerCommentsError("");
    setPlayerCommentsLoading(false);
    setPlayerTimeMs(0);
    setIsChatAutoScroll(true);
  };

  const openExternalPlayer = async () => {
    if (!playerFilePath) return;
    try {
      await openPath(playerFilePath);
    } catch {
      setPlayerError("外部プレイヤーの起動に失敗しました。");
    }
  };

  const revealInFolder = async () => {
    if (!playerFilePath) return;
    try {
      await revealItemInDir(playerFilePath);
    } catch {
      setPlayerError("フォルダの表示に失敗しました。");
    }
  };

  const formatDuration = (value?: number | null) => {
    if (!value || Number.isNaN(value)) return "";
    const total = Math.floor(value);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  };

  const formatClock = (ms?: number | null) => {
    if (ms === undefined || ms === null || Number.isNaN(ms)) return "";
    const total = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  };

  const sortedPlayerComments = useMemo(() => {
    return [...playerComments]
      .filter((item) => typeof item.offsetMs === "number")
      .sort((a, b) => (a.offsetMs ?? 0) - (b.offsetMs ?? 0));
  }, [playerComments]);

  const findLastCommentIndex = (list: CommentItem[], timeMs: number) => {
    let lo = 0;
    let hi = list.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const value = list[mid].offsetMs ?? 0;
      if (value <= timeMs) {
        ans = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return ans;
  };

  const playerVisibleComments = useMemo(() => {
    if (sortedPlayerComments.length === 0) return [];
    const idx = findLastCommentIndex(sortedPlayerComments, playerTimeMs);
    if (idx < 0) return [];
    const start = Math.max(0, idx - 49);
    return sortedPlayerComments.slice(start, idx + 1);
  }, [sortedPlayerComments, playerTimeMs]);

  useEffect(() => {
    if (!isChatAutoScroll) return;
    playerChatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [playerVisibleComments, isChatAutoScroll]);

  const checkMediaInfo = async (video: VideoItem) => {
    if (!downloadDir) {
      setErrorMessage("保存先フォルダが未設定です。設定から選択してください。");
      setIsSettingsOpen(true);
      return;
    }

    setMediaInfoLoadingIds((prev) => (prev.includes(video.id) ? prev : [...prev, video.id]));
    setMediaInfoErrors((prev) => {
      const next = { ...prev };
      delete next[video.id];
      return next;
    });
    setMediaInfoById((prev) => ({ ...prev, [video.id]: null }));

    try {
      const filePath = await invoke<string | null>("resolve_video_file", {
        id: video.id,
        title: video.title,
        outputDir: downloadDir,
      });
      if (!filePath) {
        setMediaInfoErrors((prev) => ({
          ...prev,
          [video.id]: "動画ファイルが見つかりません。",
        }));
        return;
      }

      const info = await invoke<{
        videoCodec?: string | null;
        audioCodec?: string | null;
        width?: number | null;
        height?: number | null;
        duration?: number | null;
        container?: string | null;
      }>("probe_media", { filePath, ffprobePath: ffprobePath || null });

      setMediaInfoById((prev) => ({ ...prev, [video.id]: info }));
    } catch {
      setMediaInfoErrors((prev) => ({
        ...prev,
        [video.id]: "コーデック情報の取得に失敗しました。ffprobeが必要です。",
      }));
    } finally {
      setMediaInfoLoadingIds((prev) => prev.filter((id) => id !== video.id));
    }
  };

  const pickDownloadDir = async () => {
    setErrorMessage("");
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: "保存先フォルダを選択",
      });
      if (typeof selected === "string" && selected) {
        setDownloadDir(selected);
        localStorage.setItem(DOWNLOAD_DIR_KEY, selected);
      }
    } catch {
      setErrorMessage("保存先の設定に失敗しました。");
    }
  };

  const pickCookiesFile = async () => {
    setErrorMessage("");
    try {
      const selected = await openDialog({
        directory: false,
        multiple: false,
        title: "YouTube Cookieファイルを選択",
      });
      if (typeof selected === "string" && selected) {
        setCookiesFile(selected);
        localStorage.setItem(COOKIES_FILE_KEY, selected);
      }
    } catch {
      setErrorMessage("Cookieファイルの設定に失敗しました。");
    }
  };

  const pickYtDlpPath = async () => {
    setErrorMessage("");
    try {
      const selected = await openDialog({
        directory: false,
        multiple: false,
        title: "yt-dlpの実行ファイルを選択",
      });
      if (typeof selected === "string" && selected) {
        setYtDlpPath(selected);
        localStorage.setItem(YTDLP_PATH_KEY, selected);
      }
    } catch {
      setErrorMessage("yt-dlpの設定に失敗しました。");
    }
  };

  const pickFfmpegPath = async () => {
    setErrorMessage("");
    try {
      const selected = await openDialog({
        directory: false,
        multiple: false,
        title: "ffmpegの実行ファイルを選択",
      });
      if (typeof selected === "string" && selected) {
        setFfmpegPath(selected);
        localStorage.setItem(FFMPEG_PATH_KEY, selected);
      }
    } catch {
      setErrorMessage("ffmpegの設定に失敗しました。");
    }
  };

  const pickFfprobePath = async () => {
    setErrorMessage("");
    try {
      const selected = await openDialog({
        directory: false,
        multiple: false,
        title: "ffprobeの実行ファイルを選択",
      });
      if (typeof selected === "string" && selected) {
        setFfprobePath(selected);
        localStorage.setItem(FFPROBE_PATH_KEY, selected);
      }
    } catch {
      setErrorMessage("ffprobeの設定に失敗しました。");
    }
  };

  const updateRemoteComponents = (value: "none" | "ejs:github" | "ejs:npm") => {
    setRemoteComponents(value);
    if (value === "none") {
      localStorage.removeItem(REMOTE_COMPONENTS_KEY);
    } else {
      localStorage.setItem(REMOTE_COMPONENTS_KEY, value);
    }
  };

  const parseDateValue = (value?: string) => {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d{10,13}$/.test(trimmed)) {
      const num = Number(trimmed);
      if (!Number.isNaN(num)) {
        return trimmed.length === 13 ? num : num * 1000;
      }
    }
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.getTime();
    }
    return null;
  };

  const getVideoSortTime = (video: VideoItem) => {
    const published = parseDateValue(video.publishedAt);
    if (published !== null) return published;
    const added = parseDateValue(video.addedAt);
    return added ?? 0;
  };

  const sortedVideos = useMemo(() => {
    const sorted = [...videos].sort((a, b) => {
      const timeA = getVideoSortTime(a);
      const timeB = getVideoSortTime(b);
      if (timeA === timeB) {
        return b.addedAt.localeCompare(a.addedAt);
      }
      return publishedSort === "published-desc"
        ? timeB - timeA
        : timeA - timeB;
    });
    return sorted;
  }, [videos, publishedSort]);

  const filteredVideos = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const tokens = normalizedQuery ? normalizedQuery.split(/\s+/) : [];
    return sortedVideos.filter((video) => {
      const matchesDownload =
        downloadFilter === "all"
          ? true
          : downloadFilter === "downloaded"
            ? video.downloadStatus === "downloaded"
            : video.downloadStatus !== "downloaded";
      const type = video.contentType ?? "video";
      const matchesType = typeFilter === "all" ? true : type === typeFilter;
      const haystack = [
        video.title,
        video.channel,
        video.description,
        video.id,
        video.tags?.join(" "),
        video.categories?.join(" "),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const matchesQuery =
        tokens.length === 0
          ? true
          : tokens.every((token) => haystack.includes(token));
      return matchesDownload && matchesType && matchesQuery;
    });
  }, [sortedVideos, downloadFilter, typeFilter, searchQuery]);

  const hasUndownloaded = useMemo(
    () => videos.some((video) => video.downloadStatus !== "downloaded"),
    [videos]
  );

  const activeActivityItems = useMemo(() => {
    const ids = new Set([
      ...downloadingIds,
      ...commentsDownloadingIds,
      ...pendingCommentIds,
    ]);
    return Array.from(ids).map((id) => {
      const video = videos.find((item) => item.id === id);
      const isVideo = downloadingIds.includes(id);
      const isComment = commentsDownloadingIds.includes(id);
      const status = isComment
        ? "ライブチャット取得中"
        : isVideo
          ? "動画ダウンロード中"
          : "ライブチャット準備中";
      const line = isComment
        ? commentProgressLines[id] ?? ""
        : progressLines[id] ?? "";
      return {
        id,
        title: video?.title ?? id,
        status,
        line,
      };
    });
  }, [
    downloadingIds,
    commentsDownloadingIds,
    pendingCommentIds,
    videos,
    progressLines,
    commentProgressLines,
  ]);

  const formatPublishedAt = (value?: string) => {
    const parsedMs = parseDateValue(value);
    if (parsedMs !== null) {
      return new Date(parsedMs).toLocaleString("ja-JP");
    }
    return value?.trim() ?? "";
  };

  const playerContent = (
    <>
      <div className="comment-title">{playerTitle}</div>
      {playerLoading && <p className="progress-line">読み込み中...</p>}
      {playerError && <p className="error">{playerError}</p>}
      <div className="player-layout">
        <div className="player-media">
          {playerSrc && !playerError && (
            <video
              ref={playerVideoRef}
              className="player-video"
              autoPlay
              controls
              preload="metadata"
              src={playerSrc}
              onCanPlay={() => setPlayerError("")}
              onTimeUpdate={(event) => {
                setPlayerTimeMs(Math.floor(event.currentTarget.currentTime * 1000));
              }}
              onError={(event) => {
                const media = event.currentTarget;
                const err = media.error;
                const debug = `code=${err?.code ?? "none"} network=${media.networkState} ready=${media.readyState} src=${media.currentSrc}`;
                setPlayerDebug(debug);
                const info = playerVideoId ? mediaInfoById[playerVideoId] : null;
                const v = info?.videoCodec?.toLowerCase();
                const a = info?.audioCodec?.toLowerCase();
                if (v && !a) {
                  setPlayerError(
                    "音声トラックが含まれていません。ffmpegを用意して再ダウンロードしてください。"
                  );
                } else if (a && !v) {
                  setPlayerError(
                    "映像トラックが含まれていません。再ダウンロードしてください。"
                  );
                } else if (v && a && v.includes("h264") && a.includes("aac")) {
                  setPlayerError(
                    "この動画は再生できません。Linux側のコーデック(GStreamer)が未導入の可能性があります。"
                  );
                } else if (v || a) {
                  setPlayerError(
                    "この動画は再生できません。H.264/AACで再ダウンロードしてください。"
                  );
                } else {
                  setPlayerError(
                    "この動画は再生できません。コーデック未確認のため、先に『コーデック確認』を実行してください。"
                  );
                }
              }}
            />
          )}
          {playerDebug && <p className="progress-line codec-line">{playerDebug}</p>}
          {playerError && playerFilePath && (
            <div className="action-row">
              <button className="ghost small" onClick={openExternalPlayer}>
                外部プレイヤーで開く
              </button>
              <button className="ghost small" onClick={revealInFolder}>
                フォルダを開く
              </button>
            </div>
          )}
        </div>
        <aside className="player-chat">
          <div className="player-chat-header">
            <div className="player-chat-title">
              <span className="comment-title">チャット</span>
              <span
                className={`badge ${
                  sortedPlayerComments.length > 0 ? "badge-success" : "badge-muted"
                }`}
              >
                {sortedPlayerComments.length > 0 ? "同期" : "同期不可"}
              </span>
            </div>
            <div className="player-chat-actions">
              <button
                className="ghost tiny"
                onClick={() => setIsChatAutoScroll((prev) => !prev)}
              >
                {isChatAutoScroll ? "自動スクロール: ON" : "自動スクロール: OFF"}
              </button>
            </div>
          </div>
          <div className="player-chat-meta">
            <span>再生位置 {formatClock(playerTimeMs)}</span>
            {playerCommentsLoading && <span>読み込み中...</span>}
          </div>
          {playerCommentsError && <p className="error small">{playerCommentsError}</p>}
          {!playerCommentsLoading &&
            !playerCommentsError &&
            sortedPlayerComments.length === 0 && (
              <p className="progress-line">
                同期可能なチャットがありません。ライブチャットリプレイのみ対応しています。
              </p>
            )}
          <div className="player-chat-list">
            {playerVisibleComments.map((comment, index) => (
              <div
                key={`${comment.author}-${comment.offsetMs ?? index}-${index}`}
                className="player-chat-item"
              >
                <div className="comment-meta">
                  <span>{comment.author}</span>
                  {comment.offsetMs !== undefined && (
                    <span>{formatClock(comment.offsetMs)}</span>
                  )}
                </div>
                <div className="comment-text">{comment.text}</div>
              </div>
            ))}
            <div ref={playerChatEndRef} />
          </div>
        </aside>
      </div>
    </>
  );

  if (isPlayerWindow) {
    return (
      <main className="app player-window">
        <header className="app-header">
          <div>
            <h1>{playerTitle || "再生"}</h1>
          </div>
        </header>
        {isPlayerOpen ? (
          <section className="player-window-body">{playerContent}</section>
        ) : (
          <section className="empty">
            再生する動画が選択されていません。メインウィンドウから動画を再生してください。
          </section>
        )}
      </main>
    );
  }

  return (
    <main className="app">
      <header className="app-header">
        <div>
          <h1>YouTube Local Viewer</h1>
          <p className="subtitle">ローカル保存と再生のためのデスクトップアプリ</p>
        </div>
        <div className="header-actions">
          <button className="ghost" onClick={() => setIsSettingsOpen(true)}>
            設定
          </button>
          <button className="primary" onClick={() => setIsAddOpen(true)}>
            ＋ 動画を追加
          </button>
        </div>
      </header>

      {sortedVideos.length === 0 ? (
        <section className="empty">
          まだ動画がありません。右上の「＋ 動画を追加」から登録してください。
        </section>
      ) : (
        <>
          <section className="filter-bar">
            <div className="filter-group filter-search">
              <span className="filter-label">検索</span>
              <div className="search-field">
                <input
                  className="search-input"
                  type="search"
                  placeholder="タイトル・チャンネル・タグで検索"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button
                    className="ghost tiny"
                    type="button"
                    onClick={() => setSearchQuery("")}
                  >
                    クリア
                  </button>
                )}
              </div>
            </div>
            <div className="filter-group">
              <span className="filter-label">ダウンロード</span>
              <div className="segmented">
                <button
                  className={downloadFilter === "all" ? "active" : ""}
                  onClick={() => setDownloadFilter("all")}
                  type="button"
                >
                  すべて
                </button>
                <button
                  className={downloadFilter === "downloaded" ? "active" : ""}
                  onClick={() => setDownloadFilter("downloaded")}
                  type="button"
                >
                  ダウンロード済み
                </button>
                <button
                  className={downloadFilter === "undownloaded" ? "active" : ""}
                  onClick={() => setDownloadFilter("undownloaded")}
                  type="button"
                >
                  未ダウンロード
                </button>
              </div>
            </div>
            <div className="filter-group">
              <span className="filter-label">種別</span>
              <div className="segmented">
                <button
                  className={typeFilter === "all" ? "active" : ""}
                  onClick={() => setTypeFilter("all")}
                  type="button"
                >
                  すべて
                </button>
                <button
                  className={typeFilter === "video" ? "active" : ""}
                  onClick={() => setTypeFilter("video")}
                  type="button"
                >
                  動画
                </button>
                <button
                  className={typeFilter === "live" ? "active" : ""}
                  onClick={() => setTypeFilter("live")}
                  type="button"
                >
                  配信
                </button>
                <button
                  className={typeFilter === "shorts" ? "active" : ""}
                  onClick={() => setTypeFilter("shorts")}
                  type="button"
                >
                  ショート
                </button>
              </div>
            </div>
            <div className="filter-group">
              <span className="filter-label">配信日</span>
              <div className="segmented">
                <button
                  className={
                    publishedSort === "published-desc" ? "active" : ""
                  }
                  onClick={() => setPublishedSort("published-desc")}
                  type="button"
                >
                  新しい順
                </button>
                <button
                  className={
                    publishedSort === "published-asc" ? "active" : ""
                  }
                  onClick={() => setPublishedSort("published-asc")}
                  type="button"
                >
                  古い順
                </button>
              </div>
            </div>
            <div className="filter-actions">
              <div className="filter-summary">
                表示: {filteredVideos.length} / {sortedVideos.length}
              </div>
              <div className="bulk-download-group">
                <button
                  className="primary small"
                  type="button"
                  onClick={startBulkDownload}
                  disabled={
                    bulkDownload.active ||
                    downloadingIds.length > 0 ||
                    !hasUndownloaded ||
                    !downloadDirRef.current.trim()
                  }
                >
                  未ダウンロードを一括DL
                </button>
              </div>
            </div>
          </section>

          {filteredVideos.length === 0 ? (
            <section className="empty">
              条件に一致する動画がありません。
            </section>
          ) : (
            <section className="grid">
              {filteredVideos.map((video) => {
                const thumbnailSrc = toThumbnailSrc(video.thumbnail);
                const isPlayable = video.downloadStatus === "downloaded";
                return (
                  <article key={video.id} className="video-card">
                    <button
                      className={`thumbnail-button ${
                        isPlayable ? "is-playable" : "is-disabled"
                      }`}
                      type="button"
                      onClick={() => {
                        if (isPlayable) {
                          void openPlayer(video);
                        }
                      }}
                      disabled={!isPlayable}
                      aria-label={
                        isPlayable
                          ? `再生: ${video.title}`
                          : `未ダウンロードのため再生不可: ${video.title}`
                      }
                    >
                      <div className="thumbnail">
                        {thumbnailSrc && (
                          <img src={thumbnailSrc} alt={video.title} />
                        )}
                        <span className="play-overlay" aria-hidden="true">
                          ▶
                        </span>
                      </div>
                    </button>
                    <div className="video-info">
                      {(() => {
                        const isDownloading = downloadingIds.includes(video.id);
                        const isCommentsDownloading = commentsDownloadingIds.includes(
                          video.id
                        );
                        const displayStatus = isDownloading
                          ? "downloading"
                          : video.downloadStatus;
                        return (
                          <>
                      <h3>{video.title}</h3>
                      <p>{video.channel}</p>
                      {video.publishedAt && (
                        <p>配信日: {formatPublishedAt(video.publishedAt)}</p>
                      )}
                      <span
                        className={`badge ${
                          displayStatus === "downloaded"
                            ? "badge-success"
                            : displayStatus === "downloading"
                              ? "badge-pending"
                            : displayStatus === "pending"
                              ? "badge-pending"
                              : "badge-muted"
                        }`}
                      >
                      {displayStatus === "downloaded"
                        ? "ダウンロード済"
                        : displayStatus === "downloading"
                          ? "ダウンロード中"
                          : displayStatus === "pending"
                            ? "未ダウンロード"
                            : "失敗"}
                    </span>
                    {video.downloadStatus === "failed" && videoErrors[video.id] && (
                      <div className="error-row">
                        <p className="error small">
                          {videoErrors[video.id].slice(0, 140)}
                        </p>
                        <button
                          className="ghost tiny"
                          onClick={() => {
                            setErrorTargetId(video.id);
                            setIsErrorOpen(true);
                          }}
                        >
                          詳細
                        </button>
                      </div>
                    )}
                    {displayStatus !== "downloaded" && (
                      <button
                        className="ghost small"
                        onClick={() => startDownload(video)}
                        disabled={isDownloading}
                      >
                        {isDownloading ? "ダウンロード中..." : "ダウンロード"}
                      </button>
                    )}
                    {displayStatus === "downloaded" && (
                      <div className="action-row">
                        <button
                          className="ghost small"
                          onClick={() => checkMediaInfo(video)}
                          disabled={mediaInfoLoadingIds.includes(video.id)}
                        >
                          {mediaInfoLoadingIds.includes(video.id)
                            ? "確認中..."
                            : "コーデック確認"}
                        </button>
                      </div>
                    )}
                    {mediaInfoErrors[video.id] && (
                      <p className="error small">{mediaInfoErrors[video.id]}</p>
                    )}
                    {mediaInfoById[video.id] && (
                      <p className="progress-line codec-line">
                        動画: {mediaInfoById[video.id]?.videoCodec ?? "不明"}
                        {mediaInfoById[video.id]?.width &&
                        mediaInfoById[video.id]?.height
                          ? ` ${mediaInfoById[video.id]?.width}x${
                              mediaInfoById[video.id]?.height
                            }`
                          : ""}
                        {mediaInfoById[video.id]?.duration
                          ? ` / ${formatDuration(mediaInfoById[video.id]?.duration)}`
                          : ""}
                        {mediaInfoById[video.id]?.container
                          ? ` / 容器: ${mediaInfoById[video.id]?.container}`
                          : ""}
                        {mediaInfoById[video.id]?.audioCodec
                          ? ` / 音声: ${mediaInfoById[video.id]?.audioCodec}`
                          : ""}
                      </p>
                    )}
                    <div className="comment-row">
                      <span
                        className={`badge ${
                          isCommentsDownloading
                            ? "badge-pending"
                            : video.commentsStatus === "downloaded"
                              ? "badge-success"
                              : video.commentsStatus === "pending"
                                ? "badge-pending"
                                : "badge-muted"
                        }`}
                      >
                        {isCommentsDownloading
                          ? "ライブチャット取得中"
                          : video.commentsStatus === "downloaded"
                            ? "ライブチャット取得済"
                            : video.commentsStatus === "pending"
                              ? "ライブチャット未取得"
                              : "ライブチャット失敗"}
                      </span>
                      <button
                        className="ghost small"
                        onClick={() => startCommentsDownload(video)}
                        disabled={isCommentsDownloading}
                      >
                        {isCommentsDownloading ? "取得中..." : "ライブチャット取得"}
                      </button>
                      <button
                        className="ghost small"
                        onClick={() => openComments(video)}
                        disabled={video.commentsStatus !== "downloaded"}
                      >
                        チャットを見る
                      </button>
                    </div>
                    {video.commentsStatus === "failed" &&
                      commentErrors[video.id] && (
                        <p className="error small">
                          {commentErrors[video.id].slice(0, 140)}
                        </p>
                      )}
                        </>
                      );
                    })()}
                  </div>
                </article>
                );
              })}
            </section>
          )}
        </>
      )}

      {isAddOpen && (
        <div className="modal-backdrop" onClick={() => setIsAddOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>動画を追加</h2>
              <button className="icon" onClick={() => setIsAddOpen(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="segmented">
                <button
                  className={addMode === "video" ? "active" : ""}
                  onClick={() => {
                    setAddMode("video");
                    setErrorMessage("");
                  }}
                  type="button"
                >
                  動画
                </button>
                <button
                  className={addMode === "channel" ? "active" : ""}
                  onClick={() => {
                    setAddMode("channel");
                    setErrorMessage("");
                  }}
                  type="button"
                >
                  チャンネル
                </button>
              </div>
              {addMode === "video" ? (
                <label>
                  動画URL
                  <input
                    type="url"
                    placeholder="https://www.youtube.com/watch?v=..."
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                  />
                </label>
              ) : (
                <>
                  <label>
                    チャンネルURL
                    <input
                      type="url"
                      placeholder="https://www.youtube.com/@channel"
                      value={channelUrl}
                      onChange={(e) => setChannelUrl(e.target.value)}
                    />
                  </label>
                </>
              )}
              {addMode === "video" && (
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={downloadOnAdd}
                    onChange={(e) => setDownloadOnAdd(e.target.checked)}
                  />
                  追加と同時にダウンロードする
                </label>
              )}
              {errorMessage && <p className="error">{errorMessage}</p>}
            </div>
            <div className="modal-footer">
              <button className="ghost" onClick={() => setIsAddOpen(false)}>
                キャンセル
              </button>
              <button
                className="primary"
                onClick={addMode === "video" ? addVideo : addChannelVideos}
                disabled={
                  isAdding ||
                  (addMode === "video" ? !videoUrl.trim() : !channelUrl.trim())
                }
              >
                {addMode === "video" ? "追加" : "まとめて追加"}
              </button>
            </div>
          </div>
        </div>
      )}

      {(bulkDownload.active || activeActivityItems.length > 0) && (
        <div className="floating-stack">
          {bulkDownload.active && (
            <div
              className={`floating-panel bulk-status ${
                isBulkLogOpen ? "open" : ""
              }`}
              role="button"
              tabIndex={0}
              onClick={() => setIsBulkLogOpen((prev) => !prev)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setIsBulkLogOpen((prev) => !prev);
                }
              }}
            >
              <div className="bulk-status-header">
                <div className="bulk-status-title">
                  <div className="spinner" />
                  <span>
                    ダウンロード中 ({bulkDownload.completed}/
                    {bulkDownload.total})
                  </span>
                </div>
                <button
                  className="ghost tiny"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    void stopBulkDownload();
                  }}
                  disabled={!bulkDownload.currentId || bulkDownload.stopRequested}
                >
                  {bulkDownload.stopRequested ? "停止中..." : "停止"}
                </button>
              </div>
              {isBulkLogOpen && (
                <div className="bulk-status-body">
                  {bulkDownload.currentTitle && (
                    <p className="bulk-status-title-line">
                      現在: {bulkDownload.currentTitle}
                    </p>
                  )}
                  {bulkDownload.phase && (
                    <p className="bulk-status-title-line">
                      状態: {bulkDownload.phase === "comments" ? "ライブチャット取得中" : "動画ダウンロード中"}
                    </p>
                  )}
                  <pre className="bulk-status-log">
                    {bulkDownload.currentId &&
                    (bulkDownload.phase === "comments"
                      ? commentProgressLines[bulkDownload.currentId]
                      : progressLines[bulkDownload.currentId])
                      ? (bulkDownload.phase === "comments"
                          ? commentProgressLines[bulkDownload.currentId]
                          : progressLines[bulkDownload.currentId])
                      : "ログ待機中..."}
                  </pre>
                </div>
              )}
            </div>
          )}

          {activeActivityItems.length > 0 && !bulkDownload.active && (
            <div
              className={`floating-panel download-status ${
                isDownloadLogOpen ? "open" : ""
              }`}
              role="button"
              tabIndex={0}
              onClick={() => setIsDownloadLogOpen((prev) => !prev)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setIsDownloadLogOpen((prev) => !prev);
                }
              }}
            >
              <div className="bulk-status-header">
                <div className="bulk-status-title">
                  <div className="spinner" />
                  <span>ダウンロード中 ({activeActivityItems.length}件)</span>
                </div>
              </div>
              {isDownloadLogOpen && (
                <div className="bulk-status-body">
                  {activeActivityItems.map((item) => (
                    <div key={item.id} className="download-status-item">
                      <p className="bulk-status-title-line">{item.title}</p>
                      <p className="bulk-status-title-line">{item.status}</p>
                      <pre className="bulk-status-log">
                        {item.line || "ログ待機中..."}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {isSettingsOpen && (
        <div className="modal-backdrop" onClick={() => setIsSettingsOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>設定</h2>
              <button className="icon" onClick={() => setIsSettingsOpen(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="setting-row">
                <div>
                  <p className="setting-label">保存先フォルダ</p>
                  <p className="setting-value">
                    {downloadDir ? downloadDir : "未設定"}
                  </p>
                </div>
                <button className="ghost" onClick={pickDownloadDir}>
                  フォルダを選択
                </button>
              </div>
              <div className="setting-row">
                <div>
                  <p className="setting-label">YouTube Cookieファイル</p>
                  <p className="setting-value">
                    {cookiesFile ? cookiesFile : "未設定"}
                  </p>
                </div>
                <button className="ghost" onClick={pickCookiesFile}>
                  ファイルを選択
                </button>
              </div>
              <div className="setting-row">
                <div>
                  <p className="setting-label">yt-dlp</p>
                  <p className="setting-value">
                    {ytDlpPath ? ytDlpPath : "未設定（同梱/パス指定なら空でもOK）"}
                  </p>
                </div>
                <div className="action-row">
                  <button className="ghost" onClick={pickYtDlpPath}>
                    ファイルを選択
                  </button>
                  {ytDlpPath && (
                    <button
                      className="ghost"
                      onClick={() => {
                        setYtDlpPath("");
                        localStorage.removeItem(YTDLP_PATH_KEY);
                      }}
                    >
                      クリア
                    </button>
                  )}
                </div>
              </div>
              <div className="setting-row">
                <div>
                  <p className="setting-label">ffmpeg</p>
                  <p className="setting-value">
                    {ffmpegPath ? ffmpegPath : "未設定（同梱/パス指定なら空でもOK）"}
                  </p>
                </div>
                <div className="action-row">
                  <button className="ghost" onClick={pickFfmpegPath}>
                    ファイルを選択
                  </button>
                  {ffmpegPath && (
                    <button
                      className="ghost"
                      onClick={() => {
                        setFfmpegPath("");
                        localStorage.removeItem(FFMPEG_PATH_KEY);
                      }}
                    >
                      クリア
                    </button>
                  )}
                </div>
              </div>
              <div className="setting-row">
                <div>
                  <p className="setting-label">ffprobe</p>
                  <p className="setting-value">
                    {ffprobePath ? ffprobePath : "未設定（同梱/パス指定なら空でもOK）"}
                  </p>
                </div>
                <div className="action-row">
                  <button className="ghost" onClick={pickFfprobePath}>
                    ファイルを選択
                  </button>
                  {ffprobePath && (
                    <button
                      className="ghost"
                      onClick={() => {
                        setFfprobePath("");
                        localStorage.removeItem(FFPROBE_PATH_KEY);
                      }}
                    >
                      クリア
                    </button>
                  )}
                </div>
              </div>
              <div className="setting-row">
                <div>
                  <p className="setting-label">Remote components (EJS)</p>
                  <p className="setting-value">
                    {remoteComponents === "none" ? "無効" : remoteComponents}
                  </p>
                </div>
                <div className="select-wrap">
                  <select
                    value={remoteComponents}
                    onChange={(e) =>
                      updateRemoteComponents(
                        e.target.value as "none" | "ejs:github" | "ejs:npm"
                      )
                    }
                  >
                    <option value="none">無効</option>
                    <option value="ejs:github">ejs:github（推奨）</option>
                    <option value="ejs:npm">ejs:npm</option>
                  </select>
                </div>
              </div>
              {errorMessage && <p className="error">{errorMessage}</p>}
            </div>
          </div>
        </div>
      )}

      {isChannelFetchOpen && (
        <div className="modal-backdrop" onClick={() => setIsChannelFetchOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>チャンネル動画を取得中</h2>
              <button className="icon" onClick={() => setIsChannelFetchOpen(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="loading-row">
                <div className="spinner" aria-hidden="true" />
                <p className="loading-text">{channelFetchMessage || "取得中..."}</p>
              </div>
              <div className="progress">
                <div
                  className="progress-bar"
                  style={{ width: `${Math.min(channelFetchProgress, 100)}%` }}
                />
              </div>
              <p className="progress-caption">{channelFetchProgress}%</p>
            </div>
          </div>
        </div>
      )}

      {isErrorOpen && errorTargetId && (
        <div className="modal-backdrop" onClick={() => setIsErrorOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>エラー詳細</h2>
              <button className="icon" onClick={() => setIsErrorOpen(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <pre className="error-details">
                {videoErrors[errorTargetId] ?? "詳細がありません。"}
              </pre>
            </div>
            <div className="modal-footer">
              <button className="primary" onClick={() => setIsErrorOpen(false)}>
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {isCommentsOpen && (
        <div className="modal-backdrop" onClick={() => setIsCommentsOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>ライブチャット一覧</h2>
              <button className="icon" onClick={() => setIsCommentsOpen(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="comment-title">{commentsTitle}</div>
              {commentsLoading && <p className="progress-line">読み込み中...</p>}
              {commentsError && <p className="error">{commentsError}</p>}
              {!commentsLoading && !commentsError && commentsList.length === 0 && (
                <p className="progress-line">チャットが見つかりませんでした。</p>
              )}
              <div className="comment-list">
                {commentsList.map((comment, index) => (
                  <div key={`${comment.author}-${index}`} className="comment-item">
                    <div className="comment-meta">
                      <span>{comment.author}</span>
                      {comment.likeCount !== undefined && (
                        <span>👍 {comment.likeCount}</span>
                      )}
                      {comment.publishedAt && (
                        <span>{formatPublishedAt(comment.publishedAt)}</span>
                      )}
                    </div>
                    <div className="comment-text">{comment.text}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="primary" onClick={() => setIsCommentsOpen(false)}>
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {isSwitchConfirmOpen && (
        <div className="modal-backdrop" onClick={closeSwitchConfirm}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>再生切替</h2>
              <button className="icon" onClick={closeSwitchConfirm}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <p>{switchConfirmMessage}</p>
            </div>
            <div className="modal-footer">
              <button className="ghost" onClick={closeSwitchConfirm}>
                キャンセル
              </button>
              <button className="primary" onClick={confirmSwitch}>
                切り替える
              </button>
            </div>
          </div>
        </div>
      )}

      {isPlayerOpen && (
        <div className="modal-backdrop" onClick={closePlayer}>
          <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>動画再生</h2>
              <button className="icon" onClick={closePlayer}>
                ×
              </button>
            </div>
            <div className="modal-body">{playerContent}</div>
            <div className="modal-footer">
              <button className="primary" onClick={closePlayer}>
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default App;
