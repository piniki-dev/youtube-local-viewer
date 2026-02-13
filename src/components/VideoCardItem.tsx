import { convertFileSrc } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
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

export function VideoCardItem({
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
}: VideoCardItemProps) {
  const thumbnailSrc = toThumbnailSrc(video.thumbnail);
  const isPlayable = video.downloadStatus === "downloaded";
  const isDownloading = downloadingIds.includes(video.id);
  const isCommentsDownloading = commentsDownloadingIds.includes(video.id);
  const isQueued = queuedDownloadIds.includes(video.id);
  const displayStatus: DownloadStatus = isDownloading
    ? "downloading"
    : video.downloadStatus;

  return (
    <VideoCard
      video={video}
      thumbnailSrc={thumbnailSrc}
      isPlayable={isPlayable}
      isDownloading={isDownloading}
      isCommentsDownloading={isCommentsDownloading}
      isQueued={isQueued}
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
