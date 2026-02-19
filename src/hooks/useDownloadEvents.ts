import { useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import i18n from "../i18n";

function classifyDownloadError(stderr: string, stdout: string): string {
  const combined = (stderr + "\n" + stdout).toLowerCase();

  // yt-dlp実行ファイルが見つからない
  // Rust側: "yt-dlpの起動に失敗しました: {err}" — errにはOS由来メッセージが含まれる
  // Windows英語: "The system cannot find the file specified"
  // Windows日本語: "指定されたファイルが見つかりません"
  // Unix: "No such file or directory"
  if (
    combined.includes("yt-dlpの起動に失敗しました") ||
    combined.includes("yt-dlpの制御に失敗しました") ||
    combined.includes("no such file or directory") ||
    combined.includes("the system cannot find") ||
    combined.includes("指定されたファイルが見つかりません") ||
    combined.includes("cannot find the path") ||
    combined.includes("is not recognized as")
  ) {
    return i18n.t('errors.ytdlpNotFound');
  }

  if (
    combined.includes("unable to connect") ||
    combined.includes("network is unreachable") ||
    combined.includes("connection refused") ||
    combined.includes("connection timed out") ||
    combined.includes("timed out") ||
    combined.includes("no route to host") ||
    combined.includes("name or service not known") ||
    combined.includes("temporary failure in name resolution") ||
    combined.includes("failed to connect") ||
    combined.includes("network error") ||
    combined.includes("getaddrinfo") ||
    combined.includes("nodename nor servname provided")
  ) {
    return i18n.t('errors.networkError');
  }

  if (combined.includes("http error 429") || combined.includes("too many requests")) {
    return i18n.t('errors.rateLimitError');
  }

  if (combined.includes("http error 403") || combined.includes("403 forbidden")) {
    return i18n.t('errors.accessDeniedError');
  }

  return i18n.t('errors.downloadFailed');
}

type DownloadFinished = {
  id: string;
  success: boolean;
  stdout: string;
  stderr: string;
  cancelled?: boolean;
  isPrivate?: boolean;
  isDeleted?: boolean;
};

type VideoMetadata = Record<string, unknown>;

type CommentFinished = {
  id: string;
  success: boolean;
  stdout: string;
  stderr: string;
  metadata?: VideoMetadata | null;
  hasLiveChat?: boolean | null;
};

type VideoLike = {
  id: string;
  title: string;
  downloadStatus: "pending" | "downloading" | "downloaded" | "failed";
  commentsStatus: "pending" | "downloading" | "downloaded" | "failed" | "unavailable";
  isPrivate?: boolean;
  isDeleted?: boolean;
} & Record<string, unknown>;

type BulkDownloadState = {
  active: boolean;
  currentId: string | null;
  phase: "video" | "comments" | null;
};

type UseDownloadEventsParams<TVideo extends VideoLike> = {
  downloadDirRef: React.RefObject<string>;
  videosRef: React.RefObject<TVideo[]>;
  setDownloadingIds: React.Dispatch<React.SetStateAction<string[]>>;
  setCommentsDownloadingIds: React.Dispatch<React.SetStateAction<string[]>>;
  setProgressLines: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setCommentProgressLines: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setVideos: React.Dispatch<React.SetStateAction<TVideo[]>>;
  setVideoErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setCommentErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setPendingCommentIds: React.Dispatch<React.SetStateAction<string[]>>;
  bulkDownloadRef: React.RefObject<BulkDownloadState>;
  handleBulkCompletion: (id: string, cancelled: boolean) => void;
  maybeStartAutoCommentsDownload: (id: string) => boolean;
  addDownloadErrorItem: (
    id: string,
    phase: "video" | "comments" | "metadata",
    details: string
  ) => void;
  addFloatingNotice: (notice: {
    kind: "success" | "error" | "info";
    title: string;
    details?: string;
    autoDismissMs?: number;
  }) => void;
  applyMetadataUpdate?: (params: {
    id: string;
    metadata?: VideoMetadata | null;
    hasLiveChat?: boolean | null;
    currentVideo?: TVideo | null;
    markMetadataFetched?: boolean;
  }) => void;
  onVideoDownloadFinished?: (id: string, waitForComments: boolean) => void;
  onCommentsDownloadFinished?: (id: string) => void;
};

export function useDownloadEvents<TVideo extends VideoLike>({
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
  addFloatingNotice,
  applyMetadataUpdate,
  onVideoDownloadFinished,
  onCommentsDownloadFinished,
}: UseDownloadEventsParams<TVideo>) {
  // Ref-based callbacks to avoid re-registering listeners
  const addDownloadErrorItemRef = useRef(addDownloadErrorItem);
  const addFloatingNoticeRef = useRef(addFloatingNotice);
  const handleBulkCompletionRef = useRef(handleBulkCompletion);
  const maybeStartAutoCommentsDownloadRef = useRef(maybeStartAutoCommentsDownload);
  const onVideoDownloadFinishedRef = useRef(onVideoDownloadFinished);
  const onCommentsDownloadFinishedRef = useRef(onCommentsDownloadFinished);
  const applyMetadataUpdateRef = useRef(applyMetadataUpdate);
  const downloadFinishedListenerSetupRef = useRef(false);
  const commentsFinishedListenerSetupRef = useRef(false);

  useEffect(() => { addDownloadErrorItemRef.current = addDownloadErrorItem; }, [addDownloadErrorItem]);
  useEffect(() => { addFloatingNoticeRef.current = addFloatingNotice; }, [addFloatingNotice]);
  useEffect(() => { handleBulkCompletionRef.current = handleBulkCompletion; }, [handleBulkCompletion]);
  useEffect(() => { maybeStartAutoCommentsDownloadRef.current = maybeStartAutoCommentsDownload; }, [maybeStartAutoCommentsDownload]);
  useEffect(() => { onVideoDownloadFinishedRef.current = onVideoDownloadFinished; }, [onVideoDownloadFinished]);
  useEffect(() => { onCommentsDownloadFinishedRef.current = onCommentsDownloadFinished; }, [onCommentsDownloadFinished]);
  useEffect(() => { applyMetadataUpdateRef.current = applyMetadataUpdate; }, [applyMetadataUpdate]);

  const warmVideoCache = useCallback(
    (id: string) => {
      const outputDir = downloadDirRef.current.trim();
      if (!outputDir) return;
      const video = videosRef.current.find((item) => item.id === id);
      if (!video) return;
      void invoke<string | null>("resolve_video_file", {
        id,
        title: video.title,
        outputDir,
      });
    },
    [downloadDirRef, videosRef]
  );

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    const setup = async () => {
      unlisten = await listen<{ id: string; line: string }>(
        "download-progress",
        (event) => {
          const { id, line } = event.payload;
          setProgressLines((prev: Record<string, string>) => ({
            ...prev,
            [id]: line,
          }));
        }
      );
    };
    void setup();
    return () => {
      if (unlisten) unlisten();
    };
  }, [setProgressLines]);

  useEffect(() => {
    if (downloadFinishedListenerSetupRef.current) return;
    downloadFinishedListenerSetupRef.current = true;

    let unlisten: (() => void) | null = null;
    const setup = async () => {
      unlisten = await listen<DownloadFinished>(
        "download-finished",
        (event) => {
          const { id, success, stderr, stdout, cancelled, isPrivate, isDeleted } = event.payload;
          const wasCancelled = Boolean(cancelled);
          const isBulkCurrent =
            bulkDownloadRef.current.active &&
            bulkDownloadRef.current.currentId === id;
          setDownloadingIds((prev: string[]) =>
            prev.filter((item: string) => item !== id)
          );
          if (wasCancelled) {
            setVideos((prev: TVideo[]) =>
              prev.map((v: TVideo) =>
                v.id === id
                  ? ({ ...v, downloadStatus: "pending" } as TVideo)
                  : v
              )
            );
            setVideoErrors((prev: Record<string, string>) => {
              const next = { ...prev };
              delete next[id];
              return next;
            });
            setProgressLines((prev: Record<string, string>) => {
              const next = { ...prev };
              delete next[id];
              return next;
            });
            onVideoDownloadFinishedRef.current?.(id, false);
          } else if (success) {
            setVideos((prev: TVideo[]) =>
              prev.map((v: TVideo) =>
                v.id === id
                  ? ({ ...v, downloadStatus: "downloaded" } as TVideo)
                  : v
              )
            );
            setVideoErrors((prev: Record<string, string>) => {
              const next = { ...prev };
              delete next[id];
              return next;
            });
            setProgressLines((prev: Record<string, string>) => {
              const next = { ...prev };
              delete next[id];
              return next;
            });
            const commentsStarted = !isBulkCurrent
              ? maybeStartAutoCommentsDownloadRef.current(id)
              : false;
            warmVideoCache(id);
            onVideoDownloadFinishedRef.current?.(id, commentsStarted);
          } else {
            setVideos((prev: TVideo[]) =>
              prev.map((v: TVideo) =>
                v.id === id
                  ? ({ ...v, downloadStatus: "failed", ...(isPrivate ? { isPrivate: true } : {}), ...(isDeleted ? { isDeleted: true } : {}) } as TVideo)
                  : v
              )
            );
            if (isPrivate) {
              const video = videosRef.current.find((v: TVideo) => v.id === id);
              const videoTitle = video?.title || id;
              const videoChannel = (video as Record<string, unknown>)?.channel as string || "";
              const detailLines = [videoTitle, videoChannel].filter(Boolean).join("\n");
              addFloatingNoticeRef.current({
                kind: "error",
                title: i18n.t('errors.privateVideoDownloadFailed'),
                details: detailLines,
              });
            } else if (isDeleted) {
              const video = videosRef.current.find((v: TVideo) => v.id === id);
              const videoTitle = video?.title || id;
              const videoChannel = (video as Record<string, unknown>)?.channel as string || "";
              const detailLines = [videoTitle, videoChannel].filter(Boolean).join("\n");
              addFloatingNoticeRef.current({
                kind: "error",
                title: i18n.t('errors.deletedVideoDownloadFailed'),
                details: detailLines,
              });
            } else {
              const details = stderr || stdout || i18n.t('errors.unknownError');
              setVideoErrors((prev: Record<string, string>) => ({
                ...prev,
                [id]: details,
              }));
              addDownloadErrorItemRef.current(id, "video", details);
              addFloatingNoticeRef.current({ kind: "error", title: classifyDownloadError(stderr, stdout) });
            }
            onVideoDownloadFinishedRef.current?.(id, false);
          }
          if (isBulkCurrent) {
            handleBulkCompletionRef.current(id, wasCancelled);
          }
        }
      );
    };
    void setup();
    return () => {
      if (unlisten) {
        unlisten();
        downloadFinishedListenerSetupRef.current = false;
      }
    };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    const setup = async () => {
      unlisten = await listen<{ id: string; line: string }>(
        "comments-progress",
        (event) => {
          const { id, line } = event.payload;
          setCommentProgressLines((prev: Record<string, string>) => ({
            ...prev,
            [id]: line,
          }));
        }
      );
    };
    void setup();
    return () => {
      if (unlisten) unlisten();
    };
  }, [setCommentProgressLines]);

  useEffect(() => {
    if (commentsFinishedListenerSetupRef.current) return;
    commentsFinishedListenerSetupRef.current = true;

    let unlisten: (() => void) | null = null;
    const setup = async () => {
      unlisten = await listen<CommentFinished>(
        "comments-finished",
        (event) => {
          void (async () => {
            const { id, success, stderr, stdout, metadata, hasLiveChat } = event.payload;
            setCommentsDownloadingIds((prev: string[]) =>
              prev.filter((item: string) => item !== id)
            );
            if (success) {
              let hasComments = true;
              const outputDir = downloadDirRef.current.trim();
              if (outputDir) {
                try {
                  hasComments = await invoke<boolean>("comments_file_exists", {
                    id,
                    outputDir,
                  });
                } catch {
                  // ファイル存在確認が失敗した場合はcommentsStatusを更新せず、エラーのみ通知
                  addFloatingNoticeRef.current({
                    kind: "error",
                    title: i18n.t('errors.commentsFileCheckFailed'),
                    autoDismissMs: 8000,
                  });
                  // メタデータ適用は続行
                  if (applyMetadataUpdateRef.current && (metadata || typeof hasLiveChat === "boolean")) {
                    const currentVideo = videosRef.current.find((v: TVideo) => v.id === id);
                    applyMetadataUpdateRef.current({
                      id,
                      metadata: metadata ?? null,
                      hasLiveChat: typeof hasLiveChat === "boolean" ? hasLiveChat : null,
                      currentVideo,
                      markMetadataFetched: true,
                    });
                  }
                  setCommentProgressLines((prev: Record<string, string>) => {
                    const next = { ...prev };
                    delete next[id];
                    return next;
                  });
                  setPendingCommentIds((prev: string[]) =>
                    prev.filter((item: string) => item !== id)
                  );
                  if (
                    bulkDownloadRef.current.active &&
                    bulkDownloadRef.current.currentId === id &&
                    bulkDownloadRef.current.phase === "comments"
                  ) {
                    handleBulkCompletionRef.current(id, false);
                  }
                  onCommentsDownloadFinishedRef.current?.(id);
                  return;
                }
              }
              setVideos((prev: TVideo[]) =>
                prev.map((v: TVideo) =>
                  v.id === id
                    ? ({
                        ...v,
                        commentsStatus: hasComments
                          ? "downloaded"
                          : "unavailable",
                      } as TVideo)
                    : v
                )
              );
              if (applyMetadataUpdateRef.current && (metadata || typeof hasLiveChat === "boolean")) {
                const currentVideo = videosRef.current.find((v: TVideo) => v.id === id);
                applyMetadataUpdateRef.current({
                  id,
                  metadata: metadata ?? null,
                  hasLiveChat: typeof hasLiveChat === "boolean" ? hasLiveChat : null,
                  currentVideo,
                  markMetadataFetched: true,
                });
              }
              setCommentErrors((prev: Record<string, string>) => {
                const next = { ...prev };
                delete next[id];
                return next;
              });
              setCommentProgressLines((prev: Record<string, string>) => {
                const next = { ...prev };
                delete next[id];
                return next;
              });
            } else {
              setVideos((prev: TVideo[]) =>
                prev.map((v: TVideo) =>
                  v.id === id
                    ? ({ ...v, commentsStatus: "failed" } as TVideo)
                    : v
                )
              );
              const details = stderr || stdout || i18n.t('errors.unknownError');
              setCommentErrors((prev: Record<string, string>) => ({
                ...prev,
                [id]: details,
              }));
              addDownloadErrorItemRef.current(id, "comments", details);
              addFloatingNoticeRef.current({ kind: "error", title: classifyDownloadError(stderr, stdout) });
            }
            setPendingCommentIds((prev: string[]) =>
              prev.filter((item: string) => item !== id)
            );
            if (
              bulkDownloadRef.current.active &&
              bulkDownloadRef.current.currentId === id &&
              bulkDownloadRef.current.phase === "comments"
            ) {
              handleBulkCompletionRef.current(id, false);
            }
            onCommentsDownloadFinishedRef.current?.(id);
          })();
        }
      );
    };
    void setup();
    return () => {
      if (unlisten) {
        unlisten();
        commentsFinishedListenerSetupRef.current = false;
      }
    };
  }, []);
}
