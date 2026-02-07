import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

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

type VideoLike = {
  id: string;
  downloadStatus: "pending" | "downloading" | "downloaded" | "failed";
  commentsStatus: "pending" | "downloading" | "downloaded" | "failed" | "unavailable";
} & Record<string, unknown>;

type BulkDownloadState = {
  active: boolean;
  currentId: string | null;
  phase: "video" | "comments" | null;
};

type UseDownloadEventsParams<TVideo extends VideoLike> = {
  downloadDirRef: React.RefObject<string>;
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
  maybeStartAutoCommentsDownload: (id: string) => void;
  addDownloadErrorItem: (
    id: string,
    phase: "video" | "comments" | "metadata",
    details: string
  ) => void;
  setErrorMessage: React.Dispatch<React.SetStateAction<string>>;
};

export function useDownloadEvents<TVideo extends VideoLike>({
  downloadDirRef,
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
}: UseDownloadEventsParams<TVideo>) {
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
    let unlisten: (() => void) | null = null;
    const setup = async () => {
      unlisten = await listen<DownloadFinished>(
        "download-finished",
        (event) => {
          const { id, success, stderr, stdout, cancelled } = event.payload;
          const wasCancelled = Boolean(cancelled);
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
            if (
              bulkDownloadRef.current.active &&
              bulkDownloadRef.current.currentId === id
            ) {
              handleBulkCompletion(id, false);
            } else {
              maybeStartAutoCommentsDownload(id);
            }
          } else {
            setVideos((prev: TVideo[]) =>
              prev.map((v: TVideo) =>
                v.id === id
                  ? ({ ...v, downloadStatus: "failed" } as TVideo)
                  : v
              )
            );
            const details = stderr || stdout || "不明なエラー";
            setVideoErrors((prev: Record<string, string>) => ({
              ...prev,
              [id]: details,
            }));
            addDownloadErrorItem(id, "video", details);
            setErrorMessage("ダウンロードに失敗しました。詳細を確認してください。");
          }
          if (
            bulkDownloadRef.current.active &&
            bulkDownloadRef.current.currentId === id
          ) {
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
  }, [
    addDownloadErrorItem,
    bulkDownloadRef,
    handleBulkCompletion,
    maybeStartAutoCommentsDownload,
    setDownloadingIds,
    setErrorMessage,
    setProgressLines,
    setVideoErrors,
    setVideos,
  ]);

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
    let unlisten: (() => void) | null = null;
    const setup = async () => {
      unlisten = await listen<CommentFinished>(
        "comments-finished",
        (event) => {
          void (async () => {
            const { id, success, stderr, stdout } = event.payload;
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
                  hasComments = true;
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
              const details = stderr || stdout || "不明なエラー";
              setCommentErrors((prev: Record<string, string>) => ({
                ...prev,
                [id]: details,
              }));
              addDownloadErrorItem(id, "comments", details);
              setErrorMessage(
                "ライブチャット取得に失敗しました。詳細を確認してください。"
              );
            }
            setPendingCommentIds((prev: string[]) =>
              prev.filter((item: string) => item !== id)
            );
            if (
              bulkDownloadRef.current.active &&
              bulkDownloadRef.current.currentId === id &&
              bulkDownloadRef.current.phase === "comments"
            ) {
              handleBulkCompletion(id, false);
            }
          })();
        }
      );
    };
    void setup();
    return () => {
      if (unlisten) unlisten();
    };
  }, [
    addDownloadErrorItem,
    bulkDownloadRef,
    downloadDirRef,
    handleBulkCompletion,
    setCommentErrors,
    setCommentProgressLines,
    setCommentsDownloadingIds,
    setErrorMessage,
    setPendingCommentIds,
    setVideos,
  ]);
}
