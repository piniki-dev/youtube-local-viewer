import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import i18n from "../i18n";

type VideoLike = {
  id: string;
  title: string;
  downloadStatus: "pending" | "downloading" | "downloaded" | "failed";
  commentsStatus: "pending" | "downloading" | "downloaded" | "failed" | "unavailable";
  isLive?: boolean;
  liveStatus?: string;
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

type UseBulkDownloadManagerParams<TVideo extends VideoLike> = {
  bulkDownload: BulkDownloadState;
  setBulkDownload: React.Dispatch<React.SetStateAction<BulkDownloadState>>;
  bulkDownloadRef: React.RefObject<BulkDownloadState>;
  videosRef: React.RefObject<TVideo[]>;
  downloadDirRef: React.RefObject<string>;
  downloadingIds: string[];
  commentsDownloadingIds: string[];
  queuedDownloadIds: string[];
  pendingCommentIds: string[];
  setPendingCommentIds: React.Dispatch<React.SetStateAction<string[]>>;
  setErrorMessage: React.Dispatch<React.SetStateAction<string>>;
  setIsSettingsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  startDownload: (video: TVideo, options?: { allowDuringBulk?: boolean; trackSingleQueue?: boolean }) => Promise<void> | void;
  startCommentsDownload: (video: TVideo) => Promise<void> | void;
};

export function useBulkDownloadManager<TVideo extends VideoLike>({
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
}: UseBulkDownloadManagerParams<TVideo>) {
  const startNextBulkDownload = useCallback(
    (stateOverride?: BulkDownloadState) => {
      const state = stateOverride ?? bulkDownloadRef.current;
      if (!state.active) return;

      const queue = [...state.queue];
      let completed = state.completed;
      let nextVideo: TVideo | undefined;
      let nextId: string | undefined;

      while (queue.length > 0) {
        const candidateId = queue.shift();
        if (!candidateId) continue;
        const candidate = videosRef.current.find((v) => v.id === candidateId);
        if (!candidate || candidate.downloadStatus === "downloaded") {
          completed += 1;
          continue;
        }
        // 配信中・配信予定はスキップ
        if (candidate.isLive || candidate.liveStatus === "is_live" || candidate.liveStatus === "is_upcoming") {
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
        waitingForSingles: false,
      };
      setBulkDownload(nextState);
      bulkDownloadRef.current = nextState;
      void startDownload(nextVideo, { allowDuringBulk: true, trackSingleQueue: false });
    },
    [bulkDownloadRef, setBulkDownload, startDownload, videosRef]
  );

  const handleBulkCompletion = useCallback(
    (id: string, cancelled: boolean) => {
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
    },
    [bulkDownloadRef, setBulkDownload, setPendingCommentIds, startNextBulkDownload]
  );

  const maybeStartAutoCommentsDownload = useCallback(
    (id: string) => {
      if (bulkDownloadRef.current.active) return false;
      const video = videosRef.current.find((item) => item.id === id);
      if (!video) return false;
      if (video.commentsStatus === "downloaded") return false;
      if (video.commentsStatus === "unavailable") return false;
      if (commentsDownloadingIds.includes(id)) return true;
      setPendingCommentIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
      void startCommentsDownload(video);
      return true;
    },
    [
      bulkDownloadRef,
      videosRef,
      commentsDownloadingIds,
      setPendingCommentIds,
      startCommentsDownload,
    ]
  );

  const startBulkDownload = useCallback(() => {
    const outputDir = downloadDirRef.current.trim();
    if (!outputDir) {
      setErrorMessage(i18n.t('errors.downloadDirNotSet'));
      setIsSettingsOpen(true);
      return;
    }
    if (bulkDownloadRef.current.active) return;
    const targets = videosRef.current.filter(
      (video) =>
        video.downloadStatus !== "downloaded" &&
        !video.isLive &&
        video.liveStatus !== "is_live" &&
        video.liveStatus !== "is_upcoming"
    );
    if (targets.length === 0) {
      setErrorMessage(i18n.t('errors.noVideosToDownload'));
      return;
    }

    if (downloadingIds.length > 0 || queuedDownloadIds.length > 0) {
      const waitingState: BulkDownloadState = {
        active: true,
        total: targets.length,
        completed: 0,
        currentId: null,
        currentTitle: "",
        queue: targets.map((video) => video.id),
        stopRequested: false,
        phase: null,
        waitingForSingles: true,
      };
      setBulkDownload(waitingState);
      bulkDownloadRef.current = waitingState;
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
      waitingForSingles: false,
    };
    setBulkDownload(nextState);
    bulkDownloadRef.current = nextState;
    startNextBulkDownload(nextState);
  }, [
    bulkDownloadRef,
    downloadDirRef,
    downloadingIds.length,
    queuedDownloadIds.length,
    setErrorMessage,
    setIsSettingsOpen,
    setBulkDownload,
    startNextBulkDownload,
    videosRef,
  ]);

  const stopBulkDownload = useCallback(async () => {
    const state = bulkDownloadRef.current;
    if (!state.active) return;
    if (state.waitingForSingles && !state.currentId) {
      const clearedState: BulkDownloadState = {
        ...state,
        active: false,
        queue: [],
        waitingForSingles: false,
        stopRequested: false,
      };
      setBulkDownload(clearedState);
      bulkDownloadRef.current = clearedState;
      return;
    }
    if (!state.currentId) return;

    const nextState: BulkDownloadState = { ...state, stopRequested: true };
    setBulkDownload(nextState);
    bulkDownloadRef.current = nextState;

    try {
      await invoke("stop_download", { id: state.currentId });
    } catch {
      setErrorMessage(i18n.t('errors.stopDownloadFailed'));
      const recoverState = { ...nextState, stopRequested: false };
      setBulkDownload(recoverState);
      bulkDownloadRef.current = recoverState;
    }
  }, [bulkDownloadRef, setBulkDownload, setErrorMessage]);

  const maybeStartQueuedBulk = useCallback(() => {
    const state = bulkDownloadRef.current;
    if (!state.active || !state.waitingForSingles) return;
    if (
      downloadingIds.length > 0 ||
      queuedDownloadIds.length > 0 ||
      commentsDownloadingIds.length > 0 ||
      pendingCommentIds.length > 0
    ) {
      return;
    }
    const nextState: BulkDownloadState = { ...state, waitingForSingles: false };
    setBulkDownload(nextState);
    bulkDownloadRef.current = nextState;
    startNextBulkDownload(nextState);
  }, [
    bulkDownloadRef,
    commentsDownloadingIds.length,
    downloadingIds.length,
    pendingCommentIds.length,
    queuedDownloadIds.length,
    setBulkDownload,
    startNextBulkDownload,
  ]);

  return {
    bulkDownload,
    startBulkDownload,
    stopBulkDownload,
    handleBulkCompletion,
    maybeStartAutoCommentsDownload,
    maybeStartQueuedBulk,
  };
}
