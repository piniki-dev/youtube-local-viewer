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
  displayStatus: DownloadStatus;
  onPlay: () => void;
  onDownload: () => void;
  hasError: boolean;
  onOpenErrorDetails: () => void;
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
  displayStatus,
  onPlay,
  onDownload,
  hasError,
  onOpenErrorDetails,
  mediaInfo,
  formatPublishedAt,
  formatDuration,
}: VideoCardProps) {
  const isDownloaded = displayStatus === "downloaded";
  const overlayClass = isDownloaded ? "play-overlay" : "download-overlay";
  const overlayIcon = isDownloaded ? (
    <i className="ri-play-large-fill" />
  ) : (
    <i className="ri-download-2-line" />
  );
  const isActionDisabled = isDownloaded ? !isPlayable : isDownloading;

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
          {thumbnailSrc && <img src={thumbnailSrc} alt={video.title} />}
          <span className={`thumbnail-overlay ${overlayClass}`} aria-hidden="true">
            {overlayIcon}
          </span>
        </div>
      </button>
      <div className="video-info">
        <h3>{video.title}</h3>
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
            : displayStatus === "downloading"
              ? "ダウンロード中"
              : displayStatus === "pending"
                ? "未ダウンロード"
                : "失敗"}
        </span>
        {hasError && (
          <button className="ghost tiny" onClick={onOpenErrorDetails}>
            エラー詳細
          </button>
        )}
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
