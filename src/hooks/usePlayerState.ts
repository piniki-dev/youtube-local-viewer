import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toAssetUrl } from "../utils/assetUrl";
import { emitTo } from "@tauri-apps/api/event";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import i18n from "../i18n";

type CommentItem = {
  author: string;
  authorPhotoUrl?: string;
  text: string;
  runs?: CommentRun[];
  likeCount?: number;
  publishedAt?: string;
  offsetMs?: number;
};

type CommentRun = {
  text?: string;
  emoji?: CommentEmoji;
};

type CommentEmoji = {
  id?: string;
  url?: string;
  label?: string;
  isCustom?: boolean;
};

type MediaInfo = {
  videoCodec?: string | null;
  audioCodec?: string | null;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  container?: string | null;
};

type VideoItem = {
  id: string;
  title: string;
  sourceUrl: string;
  commentsStatus: "pending" | "downloading" | "downloaded" | "failed" | "unavailable";
};

type UsePlayerStateParams = {
  isPlayerWindow: boolean;
  downloadDir: string;
  ffprobePath: string;
  downloadDirRef?: React.RefObject<string>;
};

export function usePlayerState({
  isPlayerWindow,
  downloadDir,
  ffprobePath,
  downloadDirRef,
}: UsePlayerStateParams) {
  const isDev = import.meta.env.DEV;
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
  const [isInitialCommentsReady, setIsInitialCommentsReady] = useState(true);
  const [playerCanPlay, setPlayerCanPlay] = useState(false);
  const [playerTimeMs, setPlayerTimeMs] = useState(0);
  const [isChatAutoScroll, setIsChatAutoScroll] = useState(true);
  const [mediaInfoById, setMediaInfoById] = useState<
    Record<string, MediaInfo | null>
  >({});

  const playerVideoRef = useRef<HTMLVideoElement | null>(null);
  const playerChatEndRef = useRef<HTMLDivElement | null>(null);
  const playerTraceIdRef = useRef<string | null>(null);
  const playerVideoRefInfo = useRef<VideoItem | null>(null);
  const playerCommentsRequestedRef = useRef<string | null>(null);
  const autoPlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAutoPlayRef = useRef(false);

  const requestAutoPlay = useCallback(() => {
    if (!isPlayerWindow) return;
    const video = playerVideoRef.current;
    if (!video || !playerSrc || playerError) return;
    const currentVideo = playerVideoRefInfo.current;
    if (!isInitialCommentsReady && currentVideo?.commentsStatus === "downloaded") {
      pendingAutoPlayRef.current = true;
      return;
    }
    if (autoPlayTimerRef.current) {
      window.clearTimeout(autoPlayTimerRef.current);
      autoPlayTimerRef.current = null;
    }
    if (Number.isFinite(video.currentTime) && video.currentTime > 0) {
      try {
        video.currentTime = 0;
      } catch {
        // ignore seek errors
      }
    }
    autoPlayTimerRef.current = window.setTimeout(() => {
      const result = video.play();
      if (result && typeof result.catch === "function") {
        result.catch(() => {
          // ignore autoplay errors
        });
      }
      autoPlayTimerRef.current = null;
    }, 250);
  }, [isPlayerWindow, playerSrc, playerError, isInitialCommentsReady]);

  const getOutputDir = useCallback(
    () => downloadDirRef?.current.trim() || downloadDir,
    [downloadDir, downloadDirRef]
  );

  const loadPlayerComments = useCallback(
    async (video: VideoItem) => {
      setPlayerCommentsLoading(true);
      setPlayerCommentsError("");
      setPlayerComments([]);
      if (video.commentsStatus !== "downloaded") {
        setPlayerCommentsLoading(false);
        setPlayerCommentsError("ライブチャット未取得のため同期表示できません。");
        setIsInitialCommentsReady(true);
        return;
      }
      try {
        const outputDir = getOutputDir();
        if (!outputDir) {
          setPlayerCommentsError("保存先フォルダが未設定のため読み込めません。");
          setIsInitialCommentsReady(true);
          return;
        }
        const initialLimit = 200;
        const initial = await invoke<CommentItem[]>("get_comments", {
          id: video.id,
          outputDir,
          limit: initialLimit,
        });
        setPlayerComments(initial ?? []);
        setIsInitialCommentsReady(true);
        setPlayerCommentsLoading(false);
        void (async () => {
          try {
            const full = await invoke<CommentItem[]>("get_comments", {
              id: video.id,
              outputDir,
            });
            if (full && full.length > (initial?.length ?? 0)) {
              setPlayerComments(full);
            }
          } catch {
            // ignore hydrate errors
          }
        })();
      } catch {
        setPlayerCommentsError(i18n.t('errors.liveChatLoadFailed'));
        setIsInitialCommentsReady(true);
      } finally {
        // keep loading state managed in the initial load path
      }
    },
    [getOutputDir]
  );


  const requestPlayerComments = useCallback(() => {
    const video = playerVideoRefInfo.current;
    if (!video) return;
    if (playerCommentsRequestedRef.current === video.id) return;
    playerCommentsRequestedRef.current = video.id;
    void loadPlayerComments(video);
  }, [loadPlayerComments]);

  const openPlayerInWindow = useCallback(
    async (video: VideoItem, options?: { filePath?: string | null }) => {
      const traceId = `${video.id}-${Date.now()}`;
      playerTraceIdRef.current = traceId;
      console.time(`player-open:${traceId}`);
      const outputDir = getOutputDir();
      if (!outputDir) {
        setPlayerError("保存先フォルダが未設定のため再生できません。");
        setIsPlayerOpen(true);
        console.timeEnd(`player-open:${traceId}`);
        return;
      }

      setPlayerLoading(true);
      setPlayerError("");
      setPlayerTitle(video.title);
      if (isPlayerWindow) {
        try {
          console.time(`player-emit:${traceId}`);
          void emitTo("main", "player-active", {
            id: video.id,
            title: video.title,
          })
            .then(() => {
              console.timeEnd(`player-emit:${traceId}`);
            })
            .catch(() => {
              console.timeEnd(`player-emit:${traceId}`);
            });
        } catch {
          console.timeEnd(`player-emit:${traceId}`);
          // ignore event errors
        }
      }
      setPlayerSrc(null);
      setPlayerVideoId(video.id);
      playerVideoRefInfo.current = video;
      playerCommentsRequestedRef.current = null;
      setPlayerDebug("");
      setPlayerFilePath(null);
      setIsInitialCommentsReady(video.commentsStatus !== "downloaded");
      setPlayerTimeMs(0);
      setPlayerCanPlay(false);
      setIsChatAutoScroll(true);
      setIsPlayerOpen(true);

      try {
        let resolvedPath = options?.filePath ?? null;
        console.time(`player-resolve:${traceId}`);
        if (resolvedPath) {
          if (isDev) {
            console.log(
              `[player-resolve] trace=${traceId} using pre-resolved filePath`
            );
          }
        } else {
          if (isDev) {
            console.log(
              `[player-resolve] trace=${traceId} invoking resolve_video_file`
            );
          }
          resolvedPath = await invoke<string | null>("resolve_video_file", {
            id: video.id,
            title: video.title,
            outputDir,
            traceId: traceId,
          });
        }
        console.timeEnd(`player-resolve:${traceId}`);
        if (!resolvedPath) {
          setPlayerError("動画ファイルが見つかりませんでした。");
          console.timeEnd(`player-open:${traceId}`);
          return;
        }
        setPlayerFilePath(resolvedPath);
        const src = toAssetUrl(resolvedPath);
        setPlayerSrc(src);
        console.time(`player-canplay:${traceId}`);
      } catch {
        setPlayerError(i18n.t('errors.videoFileLoadFailed'));
      } finally {
        setPlayerLoading(false);
        console.timeEnd(`player-open:${traceId}`);
      }
    },
    [ffprobePath, getOutputDir, isPlayerWindow, loadPlayerComments]
  );

  const closePlayer = useCallback(() => {
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
    setIsInitialCommentsReady(true);
    setPlayerCanPlay(false);
    setPlayerTimeMs(0);
    setIsChatAutoScroll(true);
    playerVideoRefInfo.current = null;
    playerCommentsRequestedRef.current = null;
    pendingAutoPlayRef.current = false;
    if (autoPlayTimerRef.current) {
      window.clearTimeout(autoPlayTimerRef.current);
      autoPlayTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isInitialCommentsReady) return;
    if (!pendingAutoPlayRef.current) return;
    pendingAutoPlayRef.current = false;
    requestAutoPlay();
  }, [isInitialCommentsReady, requestAutoPlay]);

  const handlePlayerError = useCallback(
    (media: HTMLVideoElement) => {
      const err = media.error;
      const debug = `code=${err?.code ?? "none"} network=${media.networkState} ready=${media.readyState} src=${media.currentSrc}`;
      setPlayerDebug(debug);

      // Check cached media info first
      const cachedInfo = playerVideoId ? mediaInfoById[playerVideoId] : null;
      if (cachedInfo) {
        const v = cachedInfo.videoCodec?.toLowerCase();
        const a = cachedInfo.audioCodec?.toLowerCase();
        if (v && !a) {
          setPlayerError("音声トラックが含まれていません。再ダウンロードしてください。");
        } else if (a && !v) {
          setPlayerError("映像トラックが含まれていません。再ダウンロードしてください。");
        } else {
          setPlayerError("この動画は再生できません。");
        }
        return;
      }

      // Set generic error, then probe on-demand for better diagnostics
      setPlayerError("この動画は再生できません。");

      if (playerFilePath) {
        void (async () => {
          try {
            const info = await invoke<MediaInfo>("probe_media", {
              filePath: playerFilePath,
              ffprobePath: ffprobePath || null,
            });
            if (playerVideoId) {
              setMediaInfoById((prev) => ({ ...prev, [playerVideoId]: info }));
            }
            const v = info?.videoCodec?.toLowerCase();
            const a = info?.audioCodec?.toLowerCase();
            if (v && !a) {
              setPlayerError("音声トラックが含まれていません。再ダウンロードしてください。");
            } else if (a && !v) {
              setPlayerError("映像トラックが含まれていません。再ダウンロードしてください。");
            }
          } catch {
            // probe failed, keep generic error
          }
        })();
      }
    },
    [mediaInfoById, playerVideoId, playerFilePath, ffprobePath]
  );

  const openExternalPlayer = useCallback(async () => {
    if (!playerFilePath) return;
    try {
      await openPath(playerFilePath);
    } catch {
      setPlayerError(i18n.t('errors.externalPlayerLaunchFailed'));
    }
  }, [playerFilePath]);

  const revealInFolder = useCallback(async () => {
    if (!playerFilePath) return;
    try {
      await revealItemInDir(playerFilePath);
    } catch {
      setPlayerError(i18n.t('errors.folderOpenFailed'));
    }
  }, [playerFilePath]);

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

  useEffect(() => {
    if (!isPlayerWindow || !isPlayerOpen) return;
    const video = playerVideoRef.current;
    if (!video || !playerSrc || playerError) return;
    const traceId = playerTraceIdRef.current ?? "unknown";
    if (video.readyState >= 2) {
      requestAutoPlay();
      requestPlayerComments();
      console.timeEnd(`player-canplay:${traceId}`);
      return;
    }
    const handleCanPlay = () => {
      requestAutoPlay();
      requestPlayerComments();
      console.timeEnd(`player-canplay:${traceId}`);
    };
    video.addEventListener("canplay", handleCanPlay, { once: true });
    return () => {
      video.removeEventListener("canplay", handleCanPlay);
    };
  }, [isPlayerWindow, isPlayerOpen, playerSrc, playerError, requestAutoPlay, requestPlayerComments]);

  return {
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
  };
}
