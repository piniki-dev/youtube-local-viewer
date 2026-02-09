import { useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

type VideoLike = {
  id: string;
  sourceUrl: string;
  downloadStatus: "pending" | "downloading" | "downloaded" | "failed";
  commentsStatus: "pending" | "downloading" | "downloaded" | "failed" | "unavailable";
};

type UseDownloadActionsParams<TVideo extends VideoLike> = {
  downloadDirRef: React.RefObject<string>;
  cookiesFile: string;
  cookiesSource: "none" | "file" | "browser";
  cookiesBrowser: string;
  remoteComponents: "none" | "ejs:github" | "ejs:npm";
  ytDlpPath: string;
  ffmpegPath: string;
  setErrorMessage: React.Dispatch<React.SetStateAction<string>>;
  setIsSettingsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setDownloadingIds: React.Dispatch<React.SetStateAction<string[]>>;
  setCommentsDownloadingIds: React.Dispatch<React.SetStateAction<string[]>>;
  setPendingCommentIds: React.Dispatch<React.SetStateAction<string[]>>;
  setVideos: React.Dispatch<React.SetStateAction<TVideo[]>>;
  setVideoErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setCommentErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setProgressLines: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setCommentProgressLines: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onStartFailedRef: React.RefObject<(id: string) => void>;
  bulkDownloadRef?: React.RefObject<{ active: boolean; waitingForSingles?: boolean }>;
  setQueuedDownloadIds: React.Dispatch<React.SetStateAction<string[]>>;
  addFloatingNotice: (notice: {
    kind: "success" | "error" | "info";
    title: string;
    details?: string;
    autoDismissMs?: number;
  }) => void;
};

export function useDownloadActions<TVideo extends VideoLike>({
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
}: UseDownloadActionsParams<TVideo>) {
  const downloadQueueRef = useRef<TVideo[]>([]);
  const activeDownloadIdRef = useRef<string | null>(null);
  const startNextQueuedDownloadRef = useRef<() => void>(() => {});

  const startDownloadNow = useCallback(
    async (video: TVideo, options?: { trackSingleQueue?: boolean }) => {
      const outputDir = downloadDirRef.current.trim();
      if (!outputDir) {
        setErrorMessage("保存先フォルダが未設定です。設定から選択してください。");
        setIsSettingsOpen(true);
        return;
      }
      const shouldTrackSingle = options?.trackSingleQueue !== false;
      if (shouldTrackSingle) {
        activeDownloadIdRef.current = video.id;
        setQueuedDownloadIds((prev) => prev.filter((id) => id !== video.id));
      }
      setDownloadingIds((prev) =>
        prev.includes(video.id) ? prev : [...prev, video.id]
      );
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
          cookiesSource: cookiesSource || null,
          cookiesBrowser: cookiesSource === "browser" ? cookiesBrowser || null : null,
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
        if (shouldTrackSingle) {
          activeDownloadIdRef.current = null;
        }
        onStartFailedRef.current(video.id);
        startNextQueuedDownloadRef.current();
      }
    },
    [
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
      setVideos,
      setVideoErrors,
      setProgressLines,
      onStartFailedRef,
      setQueuedDownloadIds,
    ]
  );

  const startNextQueuedDownload = useCallback(() => {
    if (activeDownloadIdRef.current) return;
    if (bulkDownloadRef?.current.active && !bulkDownloadRef.current.waitingForSingles) {
      return;
    }
    const nextVideo = downloadQueueRef.current.shift();
    if (!nextVideo) return;
    void startDownloadNow(nextVideo);
  }, [bulkDownloadRef, startDownloadNow]);

  startNextQueuedDownloadRef.current = startNextQueuedDownload;

  const enqueueDownload = useCallback((video: TVideo) => {
    if (downloadQueueRef.current.some((item) => item.id === video.id)) {
      return false;
    }
    downloadQueueRef.current.push(video);
    setQueuedDownloadIds((prev) => (prev.includes(video.id) ? prev : [...prev, video.id]));
    return true;
  }, [setQueuedDownloadIds]);

  const startDownload = useCallback(
    async (
      video: TVideo,
      options?: { allowDuringBulk?: boolean; trackSingleQueue?: boolean }
    ) => {
      if (activeDownloadIdRef.current === video.id) return;
      if (
        bulkDownloadRef?.current.active &&
        !bulkDownloadRef.current.waitingForSingles &&
        !options?.allowDuringBulk
      ) {
        addFloatingNotice({
          kind: "error",
          title: "一括ダウンロード中のため開始できません。",
          details: "一括ダウンロードが完了してから再度お試しください。",
        });
        return;
      }
      if (activeDownloadIdRef.current && options?.trackSingleQueue !== false) {
        if (enqueueDownload(video)) {
          addFloatingNotice({
            kind: "success",
            title: "ダウンロードのキューに追加しました。",
            autoDismissMs: 10000,
          });
        }
        return;
      }
      void startDownloadNow(video, { trackSingleQueue: options?.trackSingleQueue });
    },
    [addFloatingNotice, bulkDownloadRef, enqueueDownload, startDownloadNow]
  );

  const handleCommentsDownloadFinished = useCallback(
    (id: string) => {
      if (
        bulkDownloadRef?.current.active &&
        !bulkDownloadRef.current.waitingForSingles
      ) {
        return;
      }
      if (activeDownloadIdRef.current === id) {
        activeDownloadIdRef.current = null;
        startNextQueuedDownload();
      }
    },
    [bulkDownloadRef, startNextQueuedDownload]
  );

  const startCommentsDownload = useCallback(
    async (video: TVideo) => {
      if (video.commentsStatus === "unavailable") {
        return;
      }
      const outputDir = downloadDirRef.current.trim();
      if (!outputDir) {
        setErrorMessage("保存先フォルダが未設定です。設定から選択してください。");
        setIsSettingsOpen(true);
        return;
      }
      setPendingCommentIds((prev) => prev.filter((id) => id !== video.id));
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
          cookiesSource: cookiesSource || null,
          cookiesBrowser: cookiesSource === "browser" ? cookiesBrowser || null : null,
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
        handleCommentsDownloadFinished(video.id);
      }
    },
    [
      downloadDirRef,
      cookiesFile,
      cookiesSource,
      cookiesBrowser,
      remoteComponents,
      ytDlpPath,
      ffmpegPath,
      setErrorMessage,
      setIsSettingsOpen,
      setPendingCommentIds,
      setCommentsDownloadingIds,
      setVideos,
      setCommentErrors,
      setCommentProgressLines,
      handleCommentsDownloadFinished,
    ]
  );

  const handleVideoDownloadFinished = useCallback(
    (id: string, waitForComments: boolean) => {
      if (
        bulkDownloadRef?.current.active &&
        !bulkDownloadRef.current.waitingForSingles
      ) {
        return;
      }
      if (activeDownloadIdRef.current !== id) return;
      if (waitForComments) return;
      activeDownloadIdRef.current = null;
      startNextQueuedDownload();
    },
    [bulkDownloadRef, startNextQueuedDownload]
  );

  return {
    startDownload,
    startCommentsDownload,
    handleVideoDownloadFinished,
    handleCommentsDownloadFinished,
  };
}
