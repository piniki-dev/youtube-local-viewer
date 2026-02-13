import { useEffect, useRef, useState, memo } from "react";
import { useTranslation } from "react-i18next";

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
  downloadStatus: DownloadStatus;
  commentsStatus: CommentStatus;
};

type MediaInfo = {
  videoCodec?: string | null;
  audioCodec?: string | null;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  container?: string | null;
};

type VideoCardProps = {
  video: VideoItem;
  thumbnailSrc?: string;
  isPlayable: boolean;
  isDownloading: boolean;
  isCommentsDownloading: boolean;
  isQueued: boolean;
  isCurrentlyLive?: boolean;
  displayStatus: DownloadStatus;
  onPlay: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onRefreshMetadata: () => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onOpenInBrowser: () => void;
  onCopyUrl: () => void;
  mediaInfo?: MediaInfo | null;
  formatPublishedAt: (value?: string) => string;
  formatDuration: (value?: number | null) => string;
};

const VideoCardComponent = ({
  video,
  thumbnailSrc,
  isPlayable,
  isDownloading,
  isCommentsDownloading,
  isQueued,
  isCurrentlyLive = false,
  displayStatus,
  onPlay,
  onDownload,
  onDelete,
  onRefreshMetadata,
  isFavorite,
  onToggleFavorite,
  onOpenInBrowser,
  onCopyUrl,
  mediaInfo,
  formatPublishedAt,
  formatDuration,
}: VideoCardProps) => {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isDownloaded = displayStatus === "downloaded";
  const overlayClass = isDownloaded ? "play-overlay" : "download-overlay";
  const overlayIcon = isDownloaded ? (
    <i className="ri-play-large-fill" />
  ) : (
    <i className="ri-download-2-line" />
  );
  const isActionDisabled = isCurrentlyLive || (isDownloaded ? !isPlayable : isDownloading || isQueued);
  const canDownload = !isDownloaded && !isDownloading && !isQueued && !isCurrentlyLive;
  const canDelete = !isDownloading && !isQueued;

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [menuOpen]);

  return (
    <article className="video-card">
      <button
        className="thumbnail-button"
        type="button"
        onClick={isDownloaded ? onPlay : onDownload}
        disabled={isActionDisabled}
        aria-label={
          isDownloaded
            ? `${t("videoCard.play")}: ${video.title}`
            : isDownloading
              ? `${t("videoCard.downloading")}: ${video.title}`
              : `${t("videoCard.downloadStart")}: ${video.title}`
        }
      >
        <div className="thumbnail">
          {thumbnailSrc && <img src={thumbnailSrc} alt={video.title} loading="lazy" />}
          <span className={`thumbnail-overlay ${overlayClass}`} aria-hidden="true">
            {overlayIcon}
          </span>
        </div>
      </button>
      <div className="video-info">
        <div className="video-info-header">
          <h3>{video.title}</h3>
          <button
            className={`video-card-fav-btn${isFavorite ? " active" : ""}`}
            type="button"
            onClick={onToggleFavorite}
            aria-label={isFavorite ? t("videoCard.removeFromFavorites") : t("videoCard.addToFavorites")}
          >
            <i className={isFavorite ? "ri-heart-fill" : "ri-heart-line"} />
          </button>
          <div className="video-card-menu" ref={menuRef}>
            <button
              className="video-card-menu-btn"
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-label={t("videoCard.menu")}
            >
              <i className="ri-menu-line" />
            </button>
            {menuOpen && (
              <div className="video-card-dropdown">
                {canDownload && (
                  <button
                    className="video-card-dropdown-item"
                    type="button"
                    onClick={() => { setMenuOpen(false); onDownload(); }}
                  >
                    <i className="ri-download-2-line" />
                    {t("videoCard.download")}
                  </button>
                )}
                <button
                  className="video-card-dropdown-item"
                  type="button"
                  onClick={() => { setMenuOpen(false); onRefreshMetadata(); }}
                >
                  <i className="ri-refresh-line" />
                  {t("videoCard.refreshMetadata")}
                </button>
                <button
                  className="video-card-dropdown-item"
                  type="button"
                  onClick={() => { setMenuOpen(false); onOpenInBrowser(); }}
                >
                  <i className="ri-external-link-line" />
                  {t("videoCard.openInBrowser")}
                </button>
                <button
                  className="video-card-dropdown-item"
                  type="button"
                  onClick={() => { setMenuOpen(false); onCopyUrl(); }}
                >
                  <i className="ri-file-copy-line" />
                  {t("videoCard.copyUrl")}
                </button>
                {canDelete && (
                  <button
                    className="video-card-dropdown-item danger"
                    type="button"
                    onClick={() => { setMenuOpen(false); onDelete(); }}
                  >
                    <i className="ri-delete-bin-line" />
                    {t("videoCard.delete")}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        <p>{video.channel}</p>
        {video.publishedAt && <p>{t("videoCard.publishedDate")}: {formatPublishedAt(video.publishedAt)}</p>}
        {isCurrentlyLive ? (
          <>
            <span 
              className="badge badge-live"
              title={t("videoCard.liveStreamingTooltip")}
              style={{ cursor: "help" }}
            >
              <i className="ri-live-fill" style={{ marginRight: "0.25rem" }} />
              {t("videoCard.liveStreaming")}
            </span>
            <p style={{ color: "var(--c-text-muted)", fontSize: "0.875rem", marginTop: "0.25rem" }}>
              {t("videoCard.liveStreamingNote")}
            </p>
          </>
        ) : (
          <span
            className={`badge ${
              displayStatus === "downloaded"
                ? "badge-success"
                : displayStatus === "downloading"
                  ? "badge-pending"
                  : displayStatus === "pending"
                    ? "badge-pending"
                    : "badge-muted"
            }`}
          >
            {displayStatus === "downloaded"
              ? t("videoCard.downloaded")
              : displayStatus === "downloading" || isQueued
                ? isQueued
                  ? t("videoCard.queued")
                  : t("videoCard.downloading")
                : displayStatus === "pending"
                  ? t("videoCard.notDownloaded")
                  : t("videoCard.failed")}
          </span>
        )}
        {mediaInfo && (
          <p className="progress-line codec-line">
            {t("videoCard.videoCodec")}: {mediaInfo.videoCodec ?? t("videoCard.unknown")}
            {mediaInfo.width && mediaInfo.height
              ? ` ${mediaInfo.width}x${mediaInfo.height}`
              : ""}
            {mediaInfo.duration ? ` / ${formatDuration(mediaInfo.duration)}` : ""}
            {mediaInfo.container ? ` / ${t("videoCard.container")}: ${mediaInfo.container}` : ""}
            {mediaInfo.audioCodec ? ` / ${t("videoCard.audioCodec")}: ${mediaInfo.audioCodec}` : ""}
          </p>
        )}
        {video.commentsStatus !== "unavailable" && (
          <div className="comment-row">
            <span
              className={`badge ${
                isCommentsDownloading
                  ? "badge-pending"
                  : video.commentsStatus === "downloaded"
                    ? "badge-success"
                    : video.commentsStatus === "pending"
                      ? "badge-pending"
                      : "badge-muted"
              }`}
            >
              {isCommentsDownloading
                ? t("videoCard.commentsDownloading")
                : video.commentsStatus === "downloaded"
                  ? t("videoCard.commentsDownloaded")
                  : video.commentsStatus === "pending"
                    ? t("videoCard.commentsNotDownloaded")
                    : t("videoCard.commentsFailed")}
            </span>
          </div>
        )}
      </div>
    </article>
  );
};

export const VideoCard = memo(VideoCardComponent);

