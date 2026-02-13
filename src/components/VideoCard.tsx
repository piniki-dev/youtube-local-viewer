import { useEffect, useRef, useState } from "react";

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
  displayStatus: DownloadStatus;
  onPlay: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onRefreshMetadata: () => void;
  onOpenInBrowser: () => void;
  onCopyUrl: () => void;
  mediaInfo?: MediaInfo | null;
  formatPublishedAt: (value?: string) => string;
  formatDuration: (value?: number | null) => string;
};

export function VideoCard({
  video,
  thumbnailSrc,
  isPlayable,
  isDownloading,
  isCommentsDownloading,
  isQueued,
  displayStatus,
  onPlay,
  onDownload,
  onDelete,
  onRefreshMetadata,
  onOpenInBrowser,
  onCopyUrl,
  mediaInfo,
  formatPublishedAt,
  formatDuration,
}: VideoCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isDownloaded = displayStatus === "downloaded";
  const overlayClass = isDownloaded ? "play-overlay" : "download-overlay";
  const overlayIcon = isDownloaded ? (
    <i className="ri-play-large-fill" />
  ) : (
    <i className="ri-download-2-line" />
  );
  const isActionDisabled = isDownloaded ? !isPlayable : isDownloading || isQueued;
  const canDownload = !isDownloaded && !isDownloading && !isQueued;
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
            ? `再生: ${video.title}`
            : isDownloading
              ? `ダウンロード中: ${video.title}`
              : `ダウンロード開始: ${video.title}`
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
          <div className="video-card-menu" ref={menuRef}>
            <button
              className="video-card-menu-btn"
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-label="メニュー"
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
                    ダウンロード
                  </button>
                )}
                <button
                  className="video-card-dropdown-item"
                  type="button"
                  onClick={() => { setMenuOpen(false); onRefreshMetadata(); }}
                >
                  <i className="ri-refresh-line" />
                  メタデータの再取得
                </button>
                <button
                  className="video-card-dropdown-item"
                  type="button"
                  onClick={() => { setMenuOpen(false); onOpenInBrowser(); }}
                >
                  <i className="ri-external-link-line" />
                  YouTubeで開く
                </button>
                <button
                  className="video-card-dropdown-item"
                  type="button"
                  onClick={() => { setMenuOpen(false); onCopyUrl(); }}
                >
                  <i className="ri-file-copy-line" />
                  URLをコピー
                </button>
                {canDelete && (
                  <button
                    className="video-card-dropdown-item danger"
                    type="button"
                    onClick={() => { setMenuOpen(false); onDelete(); }}
                  >
                    <i className="ri-delete-bin-line" />
                    削除
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        <p>{video.channel}</p>
        {video.publishedAt && <p>配信日: {formatPublishedAt(video.publishedAt)}</p>}
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
            ? "ダウンロード済"
            : displayStatus === "downloading" || isQueued
              ? isQueued
                ? "ダウンロード待機中"
                : "ダウンロード中"
              : displayStatus === "pending"
                ? "未ダウンロード"
                : "失敗"}
        </span>
        {mediaInfo && (
          <p className="progress-line codec-line">
            動画: {mediaInfo.videoCodec ?? "不明"}
            {mediaInfo.width && mediaInfo.height
              ? ` ${mediaInfo.width}x${mediaInfo.height}`
              : ""}
            {mediaInfo.duration ? ` / ${formatDuration(mediaInfo.duration)}` : ""}
            {mediaInfo.container ? ` / 容器: ${mediaInfo.container}` : ""}
            {mediaInfo.audioCodec ? ` / 音声: ${mediaInfo.audioCodec}` : ""}
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
                ? "ライブチャット取得中"
                : video.commentsStatus === "downloaded"
                  ? "ライブチャット取得済"
                  : video.commentsStatus === "pending"
                    ? "ライブチャット未取得"
                    : "ライブチャット失敗"}
            </span>
          </div>
        )}
      </div>
    </article>
  );
}
