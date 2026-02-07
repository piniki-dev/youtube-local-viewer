import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

type VideoLike = {
  id: string;
  title: string;
  downloadStatus: "pending" | "downloading" | "downloaded" | "failed";
  commentsStatus: "pending" | "downloading" | "downloaded" | "failed" | "unavailable";
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

type UseBulkDownloadManagerParams<TVideo extends VideoLike> = {
  bulkDownload: BulkDownloadState;
  setBulkDownload: React.Dispatch<React.SetStateAction<BulkDownloadState>>;
  bulkDownloadRef: React.RefObject<BulkDownloadState>;
  videosRef: React.RefObject<TVideo[]>;
  downloadDirRef: React.RefObject<string>;
  downloadingIds: string[];
  commentsDownloadingIds: string[];
  setPendingCommentIds: React.Dispatch<React.SetStateAction<string[]>>;
  setErrorMessage: React.Dispatch<React.SetStateAction<string>>;
  setIsSettingsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  startDownload: (video: TVideo) => Promise<void> | void;
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
      if (bulkDownloadRef.current.active) return;
      const video = videosRef.current.find((item) => item.id === id);
      if (!video) return;
      if (video.commentsStatus === "downloaded") return;
      if (video.commentsStatus === "unavailable") return;
      if (commentsDownloadingIds.includes(id)) return;
      setPendingCommentIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
      void startCommentsDownload(video);
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
      setErrorMessage("保存先フォルダが未設定です。設定から選択してください。");
      setIsSettingsOpen(true);
      return;
    }
    if (bulkDownloadRef.current.active) return;
    if (downloadingIds.length > 0) {
      setErrorMessage(
        "他のダウンロードが進行中です。完了後に一括ダウンロードしてください。"
      );
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
  }, [
    bulkDownloadRef,
    downloadDirRef,
    downloadingIds.length,
    setErrorMessage,
    setIsSettingsOpen,
    setBulkDownload,
    startNextBulkDownload,
    videosRef,
  ]);

  const stopBulkDownload = useCallback(async () => {
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
  }, [bulkDownloadRef, setBulkDownload, setErrorMessage]);

  return {
    bulkDownload,
    startBulkDownload,
    stopBulkDownload,
    handleBulkCompletion,
    maybeStartAutoCommentsDownload,
  };
}
