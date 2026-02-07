import { useCallback } from "react";
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
}: UseDownloadActionsParams<TVideo>) {
  const startDownload = useCallback(
    async (video: TVideo) => {
      const outputDir = downloadDirRef.current.trim();
      if (!outputDir) {
        setErrorMessage("保存先フォルダが未設定です。設定から選択してください。");
        setIsSettingsOpen(true);
        return;
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
        onStartFailedRef.current(video.id);
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
    ]
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
    ]
  );

  return { startDownload, startCommentsDownload };
}
