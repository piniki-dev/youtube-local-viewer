import { useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import i18n from "../i18n";

type VideoLike = {
  id: string;
  sourceUrl: string;
  downloadStatus: "pending" | "downloading" | "downloaded" | "failed";
  commentsStatus: "pending" | "downloading" | "downloaded" | "failed" | "unavailable";
  metadataFetched?: boolean;
  isLive?: boolean;
  liveStatus?: string;
  isPrivate?: boolean;
  isDeleted?: boolean;
};

type UseDownloadActionsParams<TVideo extends VideoLike> = {
  downloadDirRef: React.RefObject<string>;
  videosRef: React.RefObject<TVideo[]>;
  scheduleBackgroundMetadataFetch: (items: Array<{ id: string; sourceUrl?: string | null }>) => void;
  cookiesFile: string;
  cookiesSource: "none" | "file" | "browser";
  cookiesBrowser: string;
  remoteComponents: "none" | "ejs:github" | "ejs:npm";
  ytDlpPath: string;
  ffmpegPath: string;
  downloadQuality: string;
  toolingStatus: { ytDlp: { ok: boolean } } | null;
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
  videosRef,
  scheduleBackgroundMetadataFetch,
  cookiesFile,
  cookiesSource,
  cookiesBrowser,
  remoteComponents,
  ytDlpPath,
  ffmpegPath,
  downloadQuality,
  toolingStatus,
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
        setErrorMessage(i18n.t('errors.downloadDirNotSet'));
        setIsSettingsOpen(true);
        return;
      }
      if (toolingStatus && !toolingStatus.ytDlp.ok) {
        addFloatingNotice({
          kind: "error",
          title: i18n.t('errors.ytdlpNotFoundShort'),
          details: i18n.t('errors.ytdlpNotFoundDetails'),
        });
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
          quality: downloadQuality || null,
          isLive: null,
        });
      } catch {
        setVideos((prev) =>
          prev.map((v) =>
            v.id === video.id ? { ...v, downloadStatus: "failed" } : v
          )
        );
        setVideoErrors((prev) => ({
          ...prev,
          [video.id]: i18n.t('errors.ytdlpExecFailed'),
        }));
        setProgressLines((prev) => ({
          ...prev,
          [video.id]: i18n.t('errors.ytdlpExecFailed'),
        }));
        setErrorMessage(i18n.t('errors.downloadFailedDetails'));
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
      downloadQuality,
      toolingStatus,
      setErrorMessage,
      setIsSettingsOpen,
      setDownloadingIds,
      setVideos,
      setVideoErrors,
      setProgressLines,
      onStartFailedRef,
      setQueuedDownloadIds,
      addFloatingNotice,
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
      // メタデータ未取得の場合は先に取得
      if (!video.metadataFetched) {
        addFloatingNotice({
          kind: "info",
          title: i18n.t('errors.waitingForMetadata'),
          autoDismissMs: 5000,
        });
        scheduleBackgroundMetadataFetch([{ id: video.id, sourceUrl: video.sourceUrl }]);
        
        // メタデータ取得完了をイベント駆動で待機（最大15秒）
        const maxWaitMs = 15000;
        const updatedVideo = await new Promise<TVideo | null>((resolve) => {
          const checkInterval = window.setInterval(() => {
            const current = videosRef.current.find(v => v.id === video.id);
            if (current?.metadataFetched) {
              window.clearInterval(checkInterval);
              window.clearTimeout(timeoutId);
              resolve(current);
            }
          }, 500);
          const timeoutId = window.setTimeout(() => {
            window.clearInterval(checkInterval);
            resolve(null);
          }, maxWaitMs);
        });
        
        if (!updatedVideo) {
          addFloatingNotice({
            kind: "error",
            title: i18n.t('errors.metadataTimeout'),
            details: i18n.t('errors.downloadFailedDetails'),
          });
          return;
        }
        video = updatedVideo;
      }
      
      // ライブ配信・配信予定チェック
      if (video.isLive || video.liveStatus === "is_live" || video.liveStatus === "is_upcoming") {
        addFloatingNotice({
          kind: "error",
          title: i18n.t('errors.liveStreamCannotDownload'),
          details: i18n.t('errors.liveStreamCannotDownloadDetails'),
          autoDismissMs: 8000,
        });
        return;
      }

      // 非公開動画チェック
      if (video.isPrivate) {
        addFloatingNotice({
          kind: "error",
          title: i18n.t('errors.privateVideoDownloadFailed'),
          autoDismissMs: 8000,
        });
        return;
      }

      // 削除済み動画チェック
      if (video.isDeleted) {
        addFloatingNotice({
          kind: "error",
          title: i18n.t('errors.deletedVideoDownloadFailed'),
          autoDismissMs: 8000,
        });
        return;
      }
      
      if (activeDownloadIdRef.current === video.id) return;
      if (
        bulkDownloadRef?.current.active &&
        !bulkDownloadRef.current.waitingForSingles &&
        !options?.allowDuringBulk
      ) {
        addFloatingNotice({
          kind: "error",
          title: i18n.t('errors.bulkDownloadActive'),
          details: i18n.t('errors.bulkDownloadActiveDetails'),
        });
        return;
      }
      if (activeDownloadIdRef.current && options?.trackSingleQueue !== false) {
        if (enqueueDownload(video)) {
          addFloatingNotice({
            kind: "success",
            title: i18n.t('errors.downloadQueued'),
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
        setErrorMessage(i18n.t('errors.downloadDirNotSet'));
        setIsSettingsOpen(true);
        return;
      }
      if (toolingStatus && !toolingStatus.ytDlp.ok) {
        addFloatingNotice({
          kind: "error",
          title: i18n.t('errors.ytdlpNotFoundShort'),
          details: i18n.t('errors.ytdlpNotFoundDetails'),
        });
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
          [video.id]: i18n.t('errors.ytdlpExecFailed'),
        }));
        setCommentProgressLines((prev) => ({
          ...prev,
          [video.id]: i18n.t('errors.ytdlpExecFailed'),
        }));
        setErrorMessage(i18n.t('errors.commentsFailedDetails'));
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
      toolingStatus,
      setErrorMessage,
      setIsSettingsOpen,
      setPendingCommentIds,
      setCommentsDownloadingIds,
      setVideos,
      setCommentErrors,
      setCommentProgressLines,
      handleCommentsDownloadFinished,
      addFloatingNotice,
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
