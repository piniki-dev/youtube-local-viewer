import { useMemo } from "react";

type VideoLike = {
  id: string;
  title: string;
};

type ActivityItem = {
  id: string;
  title: string;
  status: string;
  line: string;
};

type UseActiveActivityItemsParams<TVideo extends VideoLike> = {
  bulkDownloadActive: boolean;
  downloadingIds: string[];
  commentsDownloadingIds: string[];
  pendingCommentIds: string[];
  videos: TVideo[];
  progressLines: Record<string, string>;
  commentProgressLines: Record<string, string>;
};

export function useActiveActivityItems<TVideo extends VideoLike>({
  bulkDownloadActive,
  downloadingIds,
  commentsDownloadingIds,
  pendingCommentIds,
  videos,
  progressLines,
  commentProgressLines,
}: UseActiveActivityItemsParams<TVideo>) {
  return useMemo<ActivityItem[]>(() => {
    if (bulkDownloadActive) return [];
    const ids = new Set([
      ...downloadingIds,
      ...commentsDownloadingIds,
      ...pendingCommentIds,
    ]);
    return Array.from(ids).map((id) => {
      const video = videos.find((item) => item.id === id);
      const isVideo = downloadingIds.includes(id);
      const isComment = commentsDownloadingIds.includes(id);
      const status = isComment
        ? "ライブチャット取得中"
        : isVideo
          ? "動画ダウンロード中"
          : "ライブチャット準備中";
      const line = isComment
        ? commentProgressLines[id] ?? ""
        : progressLines[id] ?? "";
      return {
        id,
        title: video?.title ?? id,
        status,
        line,
      };
    });
  }, [
    bulkDownloadActive,
    downloadingIds,
    commentsDownloadingIds,
    pendingCommentIds,
    videos,
    progressLines,
    commentProgressLines,
  ]);
}
