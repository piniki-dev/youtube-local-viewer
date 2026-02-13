import { convertFileSrc } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { memo } from "react";
import { VideoCard } from "./VideoCard";

type DownloadStatus = "pending" | "downloading" | "downloaded" | "failed";

type CommentStatus =
  | "pending"
  | "downloading"
  | "downloaded"
  | "failed"
  | "unavailable";

type VideoItem = {
  id: string;
  title: string;
  channel: string;
  thumbnail?: string;
  publishedAt?: string;
  sourceUrl: string;
  favorite?: boolean;
  liveStatus?: string;
  isLive?: boolean;
  downloadStatus: DownloadStatus;
  commentsStatus: CommentStatus;
  addedAt: string;
};

type MediaInfo = {
  videoCodec?: string | null;
  audioCodec?: string | null;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  container?: string | null;
};

type VideoCardItemProps = {
  video: VideoItem;
  downloadingIds: string[];
  commentsDownloadingIds: string[];
  queuedDownloadIds: string[];
  onPlay: (video: VideoItem) => void;
  onDownload: (video: VideoItem) => Promise<void> | void;
  onDelete: (video: VideoItem) => void;
  onRefreshMetadata: (video: VideoItem) => void;
  onToggleFavorite: (id: string) => void;
  mediaInfo?: MediaInfo | null;
  formatPublishedAt: (value?: string) => string;
  formatDuration: (value?: number | null) => string;
};

const VideoCardItemComponent = ({
  video,
  downloadingIds,
  commentsDownloadingIds,
  queuedDownloadIds,
  onPlay,
  onDownload,
  onDelete,
  onRefreshMetadata,
  onToggleFavorite,
  mediaInfo,
  formatPublishedAt,
  formatDuration,
}: VideoCardItemProps) => {
  const thumbnailSrc = toThumbnailSrc(video.thumbnail);
  const isPlayable = video.downloadStatus === "downloaded";
  const isDownloading = downloadingIds.includes(video.id);
  const isCommentsDownloading = commentsDownloadingIds.includes(video.id);
  const isQueued = queuedDownloadIds.includes(video.id);
  const displayStatus: DownloadStatus = isDownloading
    ? "downloading"
    : video.downloadStatus;
  
  // Check if this is currently live streaming (not recording, but actual live stream)
  const isCurrentlyLive = 
    video.isLive === true || 
    video.liveStatus?.toLowerCase() === "is_live" ||
    video.liveStatus?.toLowerCase() === "upcoming";

  return (
    <VideoCard
      video={video}
      thumbnailSrc={thumbnailSrc}
      isPlayable={isPlayable}
      isDownloading={isDownloading}
      isCommentsDownloading={isCommentsDownloading}
      isQueued={isQueued}
      isCurrentlyLive={isCurrentlyLive}
      displayStatus={displayStatus}
      onPlay={() => onPlay(video)}
      onDownload={() => onDownload(video)}
      onDelete={() => onDelete(video)}
      onRefreshMetadata={() => onRefreshMetadata(video)}
      isFavorite={!!video.favorite}
      onToggleFavorite={() => onToggleFavorite(video.id)}
      onOpenInBrowser={() => void openUrl(video.sourceUrl)}
      onCopyUrl={() => void navigator.clipboard.writeText(video.sourceUrl)}
      mediaInfo={mediaInfo}
      formatPublishedAt={formatPublishedAt}
      formatDuration={formatDuration}
    />
  );
}

const toThumbnailSrc = (thumbnail?: string) => {
  if (!thumbnail) return undefined;
  if (
    thumbnail.startsWith("http://") ||
    thumbnail.startsWith("https://") ||
    thumbnail.startsWith("asset://") ||
    thumbnail.startsWith("data:")
  ) {
    return thumbnail;
  }
  return convertFileSrc(thumbnail);
};

// 不要な再レンダリングを防ぐため、表示に影響するpropsのみを比較
function arePropsEqual(
  prev: VideoCardItemProps,
  next: VideoCardItemProps
): boolean {
  // videoオブジェクトの主要なプロパティを比較
  if (
    prev.video.id !== next.video.id ||
    prev.video.title !== next.video.title ||
    prev.video.channel !== next.video.channel ||
    prev.video.thumbnail !== next.video.thumbnail ||
    prev.video.publishedAt !== next.video.publishedAt ||
    prev.video.sourceUrl !== next.video.sourceUrl ||
    prev.video.favorite !== next.video.favorite ||
    prev.video.downloadStatus !== next.video.downloadStatus ||
    prev.video.commentsStatus !== next.video.commentsStatus ||
    prev.video.addedAt !== next.video.addedAt
  ) {
    console.log(`[VideoCardItem ${prev.video.id}] Video props changed`);
    return false;
  }

  // このビデオに関するダウンロード状態を比較
  const prevIsDownloading = prev.downloadingIds.includes(prev.video.id);
  const nextIsDownloading = next.downloadingIds.includes(next.video.id);
  const prevIsCommentsDownloading = prev.commentsDownloadingIds.includes(prev.video.id);
  const nextIsCommentsDownloading = next.commentsDownloadingIds.includes(next.video.id);
  const prevIsQueued = prev.queuedDownloadIds.includes(prev.video.id);
  const nextIsQueued = next.queuedDownloadIds.includes(next.video.id);

  if (
    prevIsDownloading !== nextIsDownloading ||
    prevIsCommentsDownloading !== nextIsCommentsDownloading ||
    prevIsQueued !== nextIsQueued
  ) {
    console.log(`[VideoCardItem ${prev.video.id}] Download status changed`, {
      downloading: [prevIsDownloading, nextIsDownloading],
      comments: [prevIsCommentsDownloading, nextIsCommentsDownloading],
      queued: [prevIsQueued, nextIsQueued],
    });
    return false;
  }

  // mediaInfoの深い比較
  if (prev.mediaInfo !== next.mediaInfo) {
    if (!prev.mediaInfo || !next.mediaInfo) {
      console.log(`[VideoCardItem ${prev.video.id}] MediaInfo null/undefined changed`);
      return false;
    }
    if (
      prev.mediaInfo.videoCodec !== next.mediaInfo.videoCodec ||
      prev.mediaInfo.audioCodec !== next.mediaInfo.audioCodec ||
      prev.mediaInfo.width !== next.mediaInfo.width ||
      prev.mediaInfo.height !== next.mediaInfo.height ||
      prev.mediaInfo.duration !== next.mediaInfo.duration ||
      prev.mediaInfo.container !== next.mediaInfo.container
    ) {
      console.log(`[VideoCardItem ${prev.video.id}] MediaInfo content changed`);
      return false;
    }
  }

  // 関数の参照比較は不要 - 表示には影響せず、変更されても動作には問題ない
  // これにより、save_state等で親が再レンダリングされてもこのカードは再レンダリングされない

  return true;
}

export const VideoCardItem = memo(VideoCardItemComponent, arePropsEqual);


