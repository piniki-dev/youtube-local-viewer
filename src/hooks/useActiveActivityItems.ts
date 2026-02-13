import { useMemo } from "react";
import i18n from "../i18n";

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
  queuedDownloadIds: string[];
  pendingCommentIds: string[];
  videos: TVideo[];
  progressLines: Record<string, string>;
  commentProgressLines: Record<string, string>;
};

export function useActiveActivityItems<TVideo extends VideoLike>({
  bulkDownloadActive,
  downloadingIds,
  commentsDownloadingIds,
  queuedDownloadIds,
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
      ...queuedDownloadIds,
      ...pendingCommentIds,
    ]);
    return Array.from(ids).map((id) => {
      const video = videos.find((item) => item.id === id);
      const isVideo = downloadingIds.includes(id);
      const isComment = commentsDownloadingIds.includes(id);
      const isQueued = queuedDownloadIds.includes(id);
      const status = isComment
        ? i18n.t('status.liveChatFetching')
        : isVideo
          ? i18n.t('status.videoDownloading')
          : isQueued
            ? i18n.t('status.downloadWaiting')
          : i18n.t('status.liveChatPreparing');
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
    queuedDownloadIds,
    pendingCommentIds,
    videos,
    progressLines,
    commentProgressLines,
  ]);
}
