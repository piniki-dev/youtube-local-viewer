import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type VideoLike = {
  id: string;
  title: string;
  downloadStatus: "pending" | "downloading" | "downloaded" | "failed";
  commentsStatus: "pending" | "downloading" | "downloaded" | "failed" | "unavailable";
  metadataFetched?: boolean;
};

type LocalFileCheckItem = {
  id: string;
  title: string;
  checkVideo: boolean;
  checkComments: boolean;
};

type LocalFileCheckResult = {
  id: string;
  videoOk: boolean;
  commentsOk: boolean;
};

type IntegrityIssue = {
  id: string;
  title: string;
  videoMissing: boolean;
  commentsMissing: boolean;
  metadataMissing: boolean;
};

type IntegritySummary = {
  total: number;
  videoMissing: number;
  commentsMissing: number;
  metadataMissing: number;
};

type UseIntegrityCheckParams<TVideo extends VideoLike> = {
  videos: TVideo[];
  videosRef: React.RefObject<TVideo[]>;
  downloadDir: string;
  isStateReady: boolean;
  setVideos: React.Dispatch<React.SetStateAction<TVideo[]>>;
  setVideoErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setCommentErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  videoErrors: Record<string, string>;
  commentErrors: Record<string, string>;
  onMetadataRecovery: (force?: boolean) => void;
  setIsIntegrityOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

export function useIntegrityCheck<TVideo extends VideoLike>({
  videos,
  videosRef,
  downloadDir,
  isStateReady,
  setVideos,
  setVideoErrors,
  setCommentErrors,
  videoErrors,
  commentErrors,
  onMetadataRecovery,
  setIsIntegrityOpen,
}: UseIntegrityCheckParams<TVideo>) {
  const [hasCheckedFiles, setHasCheckedFiles] = useState(false);
  const [integrityIssues, setIntegrityIssues] = useState<IntegrityIssue[]>([]);
  const [integritySummary, setIntegritySummary] = useState<IntegritySummary | null>(
    null
  );
  const [integrityRunning, setIntegrityRunning] = useState(false);
  const [integrityMessage, setIntegrityMessage] = useState("");

  const hasMissingVideoError = useCallback(
    (id: string) => videoErrors[id]?.includes("動画ファイルが見つかりません") ?? false,
    [videoErrors]
  );

  const hasMissingCommentError = useCallback(
    (id: string) =>
      commentErrors[id]?.includes("コメントファイルが見つかりません") ?? false,
    [commentErrors]
  );

  const shouldCheckComments = useCallback(
    (video: VideoLike) => {
      if (video.commentsStatus === "unavailable") return false;
      if (video.commentsStatus === "downloaded") return true;
      if (video.commentsStatus === "failed") return true;
      return hasMissingCommentError(video.id);
    },
    [hasMissingCommentError]
  );

  const runLocalFileChecks = useCallback(
    async (outputDir: string, items: LocalFileCheckItem[]) => {
      let checks: LocalFileCheckResult[] = [];
      try {
        checks = await invoke<LocalFileCheckResult[]>("verify_local_files", {
          outputDir,
          items,
        });
      } catch {
        checks = await Promise.all(
          items.map(async (item) => {
            let videoOk = !item.checkVideo;
            let commentsOk = !item.checkComments;

            if (item.checkVideo) {
              try {
                videoOk = await invoke<boolean>("video_file_exists", {
                  id: item.id,
                  title: item.title,
                  outputDir,
                });
              } catch {
                videoOk = false;
              }
            }

            if (item.checkComments) {
              try {
                commentsOk = await invoke<boolean>("comments_file_exists", {
                  id: item.id,
                  outputDir,
                });
              } catch {
                commentsOk = false;
              }
            }

            return { id: item.id, videoOk, commentsOk };
          })
        );
      }
      return checks;
    },
    []
  );

  const runStrictFileChecks = useCallback(
    async (outputDir: string, items: LocalFileCheckItem[]) => {
      return Promise.all(
        items.map(async (item) => {
          let videoOk = !item.checkVideo;
          let commentsOk = !item.checkComments;

          if (item.checkVideo) {
            try {
              videoOk = await invoke<boolean>("video_file_exists", {
                id: item.id,
                title: item.title,
                outputDir,
              });
            } catch {
              videoOk = false;
            }
          }

          if (item.checkComments) {
            try {
              commentsOk = await invoke<boolean>("comments_file_exists", {
                id: item.id,
                outputDir,
              });
            } catch {
              commentsOk = false;
            }
          }

          return { id: item.id, videoOk, commentsOk };
        })
      );
    },
    []
  );

  const applyLocalFileCheckResults = useCallback(
    (checks: LocalFileCheckResult[]) => {
      const checkMap = new Map(checks.map((item) => [item.id, item]));

      setVideos((prev) =>
        prev.map((video) => {
          const result = checkMap.get(video.id);
          if (!result) return video;
          return video;
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
    },
    [setVideos, setVideoErrors, setCommentErrors]
  );

  const buildIntegrityReport = useCallback(
    (checks: LocalFileCheckResult[], metadataIds?: Set<string>) => {
      const titleMap = new Map(
        videosRef.current.map((video) => [video.id, video.title])
      );
      const metadataExpectedMap = new Map(
        videosRef.current.map((video) => [video.id, video.metadataFetched === true])
      );
      const issues = checks
        .map((item) => {
          const hasInfo = metadataIds ? metadataIds.has(item.id) : true;
          const expectsMetadata = metadataExpectedMap.get(item.id) ?? false;
          return {
            id: item.id,
            title: titleMap.get(item.id) ?? item.id,
            videoMissing: !item.videoOk,
            commentsMissing: !item.commentsOk,
            metadataMissing: expectsMetadata && !hasInfo,
          };
        })
        .filter(
          (item) =>
            item.videoMissing || item.commentsMissing || item.metadataMissing
        );
      const videoMissing = issues.filter((item) => item.videoMissing).length;
      const commentsMissing = issues.filter((item) => item.commentsMissing).length;
      const metadataMissing = issues.filter((item) => item.metadataMissing).length;
      setIntegrityIssues(issues);
      setIntegritySummary({
        total: issues.length,
        videoMissing,
        commentsMissing,
        metadataMissing,
      });
      return issues;
    },
    [videosRef]
  );

  const runIntegrityCheck = useCallback(
    async (openModal = true, overrideDir?: string) => {
      setIntegrityMessage("");
      const targetDir = overrideDir ?? downloadDir;
      if (!targetDir) {
        setIntegrityIssues([]);
        setIntegritySummary(null);
        setIntegrityMessage(
          "保存先フォルダが未設定です。設定から選択してください。"
        );
        if (openModal) setIsIntegrityOpen(true);
        return;
      }

      const items: LocalFileCheckItem[] = videosRef.current.map((video) => ({
        id: video.id,
        title: video.title,
        checkVideo:
          video.downloadStatus === "downloaded" || hasMissingVideoError(video.id),
        checkComments: shouldCheckComments(video),
      }));

      if (items.length === 0) {
        setIntegrityIssues([]);
        setIntegritySummary({
          total: 0,
          videoMissing: 0,
          commentsMissing: 0,
          metadataMissing: 0,
        });
        if (openModal) setIsIntegrityOpen(true);
        return;
      }

      setIntegrityRunning(true);
      try {
        const checks = await runStrictFileChecks(targetDir, items);
        let infoIds: Set<string> | undefined;
        try {
          const index = await invoke<{ infoIds: string[] }>("get_metadata_index", {
            outputDir: targetDir,
          });
          infoIds = new Set(index?.infoIds ?? []);
        } catch {
          infoIds = undefined;
        }
        applyLocalFileCheckResults(checks);
        const issues = buildIntegrityReport(checks, infoIds);
        setHasCheckedFiles(true);
        if (issues.length === 0) {
          onMetadataRecovery(true);
        }
      } catch {
        setIntegrityMessage("整合性チェックに失敗しました。");
      } finally {
        setIntegrityRunning(false);
        if (openModal) setIsIntegrityOpen(true);
      }
    },
    [
      downloadDir,
      videosRef,
      hasMissingVideoError,
      shouldCheckComments,
      runStrictFileChecks,
      applyLocalFileCheckResults,
      buildIntegrityReport,
      onMetadataRecovery,
      setIsIntegrityOpen,
    ]
  );

  useEffect(() => {
    if (!isStateReady) return;
    setHasCheckedFiles(false);
  }, [downloadDir, isStateReady]);

  useEffect(() => {
    if (!isStateReady || hasCheckedFiles) return;
    if (!downloadDir || videos.length === 0) return;

    const verifyLocalFiles = async () => {
      const items: LocalFileCheckItem[] = videos.map((video) => ({
        id: video.id,
        title: video.title,
        checkVideo:
          video.downloadStatus === "downloaded" || hasMissingVideoError(video.id),
        checkComments: shouldCheckComments(video),
      }));

      try {
        const checks = await runLocalFileChecks(downloadDir, items);
        applyLocalFileCheckResults(checks);
        buildIntegrityReport(checks);
        setHasCheckedFiles(true);
      } catch {
        setHasCheckedFiles(true);
      }
    };

    void verifyLocalFiles();
  }, [
    isStateReady,
    hasCheckedFiles,
    downloadDir,
    videos,
    runLocalFileChecks,
    applyLocalFileCheckResults,
    buildIntegrityReport,
    hasMissingVideoError,
    shouldCheckComments,
  ]);

  const isDataCheckDone = useMemo(() => {
    if (!isStateReady) return false;
    if (!downloadDir || videos.length === 0) return true;
    return hasCheckedFiles;
  }, [isStateReady, downloadDir, videos.length, hasCheckedFiles]);

  return {
    hasCheckedFiles,
    integrityIssues,
    integritySummary,
    integrityRunning,
    integrityMessage,
    runIntegrityCheck,
    isDataCheckDone,
    setIntegrityMessage,
  };
}
