import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { emitTo } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";

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
  const [mediaInfoById, setMediaInfoById] = useState<
    Record<string, MediaInfo | null>
  >({});

  const playerVideoRef = useRef<HTMLVideoElement | null>(null);
  const playerChatEndRef = useRef<HTMLDivElement | null>(null);

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
        return;
      }
      try {
        const outputDir = getOutputDir();
        if (!outputDir) {
          setPlayerCommentsError("保存先フォルダが未設定のため読み込めません。");
          return;
        }
        const result = await invoke<CommentItem[]>("get_comments", {
          id: video.id,
          outputDir,
        });
        setPlayerComments(result ?? []);
      } catch {
        setPlayerCommentsError("ライブチャットの読み込みに失敗しました。");
      } finally {
        setPlayerCommentsLoading(false);
      }
    },
    [getOutputDir]
  );

  const openPlayerInWindow = useCallback(
    async (video: VideoItem) => {
      const outputDir = getOutputDir();
      if (!outputDir) {
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
          outputDir,
        });
        if (!filePath) {
          setPlayerError("動画ファイルが見つかりませんでした。");
          return;
        }
        setPlayerFilePath(filePath);
        try {
          const info = await invoke<MediaInfo>("probe_media", {
            filePath,
            ffprobePath: ffprobePath || null,
          });
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
    setPlayerTimeMs(0);
    setIsChatAutoScroll(true);
  }, []);

  const handlePlayerError = useCallback(
    (media: HTMLVideoElement) => {
      const err = media.error;
      const debug = `code=${err?.code ?? "none"} network=${media.networkState} ready=${media.readyState} src=${media.currentSrc}`;
      setPlayerDebug(debug);
      const info = playerVideoId ? mediaInfoById[playerVideoId] : null;
      const v = info?.videoCodec?.toLowerCase();
      const a = info?.audioCodec?.toLowerCase();
      if (v && !a) {
        setPlayerError(
          "音声トラックが含まれていません。再ダウンロードしてください。"
        );
      } else if (a && !v) {
        setPlayerError(
          "映像トラックが含まれていません。再ダウンロードしてください。"
        );
      } else {
        setPlayerError(
          "この動画は再生できません。"
        );
      }
    },
    [mediaInfoById, playerVideoId]
  );

  const openExternalPlayer = useCallback(async () => {
    if (!playerFilePath) return;
    try {
      await openPath(playerFilePath);
    } catch {
      setPlayerError("外部プレイヤーの起動に失敗しました。");
    }
  }, [playerFilePath]);

  const revealInFolder = useCallback(async () => {
    if (!playerFilePath) return;
    try {
      await revealItemInDir(playerFilePath);
    } catch {
      setPlayerError("フォルダの表示に失敗しました。");
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
