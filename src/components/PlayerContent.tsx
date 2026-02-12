import type { RefObject } from "react";

type CommentItem = {
  author: string;
  authorPhotoUrl?: string;
  text: string;
  runs?: CommentRun[];
  likeCount?: number;
  publishedAt?: string;
  offsetMs?: number;
};

type CommentRun = {
  text?: string;
  emoji?: CommentEmoji;
};

type CommentEmoji = {
  id?: string;
  url?: string;
  label?: string;
  isCustom?: boolean;
};

type PlayerContentProps = {
  title: string;
  loading: boolean;
  error: string;
  src: string | null;
  canPlay: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  onCanPlay: () => void;
  onTimeUpdate: (timeMs: number) => void;
  onError: (media: HTMLVideoElement) => void;
  debug: string;
  filePath: string | null;
  onOpenExternalPlayer: () => void;
  onRevealInFolder: () => void;
  sortedComments: CommentItem[];
  isChatAutoScroll: boolean;
  onToggleChatAutoScroll: () => void;
  commentsLoading: boolean;
  commentsError: string;
  visibleComments: CommentItem[];
  chatEndRef: RefObject<HTMLDivElement | null>;
  formatClock: (ms: number) => string;
  timeMs: number;
};

export function PlayerContent({
  title: _title,
  loading,
  error,
  src,
  canPlay,
  videoRef,
  onCanPlay,
  onTimeUpdate,
  onError,
  debug,
  filePath,
  onOpenExternalPlayer,
  onRevealInFolder,
  sortedComments,
  isChatAutoScroll,
  onToggleChatAutoScroll,
  commentsLoading,
  commentsError,
  visibleComments,
  chatEndRef,
  formatClock,
  timeMs,
}: PlayerContentProps) {
  const renderCommentRuns = (comment: CommentItem) => {
    if (!comment.runs || comment.runs.length === 0) return comment.text;
    return comment.runs.map((run, index) => {
      if (run.text) {
        return <span key={`text-${index}`}>{run.text}</span>;
      }
      if (run.emoji) {
        const label = run.emoji.label || run.emoji.id || "";
        if (run.emoji.url) {
          return (
            <img
              key={`emoji-${index}`}
              className="comment-emoji"
              src={run.emoji.url}
              alt={label}
              title={label}
              loading="lazy"
            />
          );
        }
        return <span key={`emoji-${index}`}>{label}</span>;
      }
      return null;
    });
  };

  return (
    <>
      {loading && <p className="progress-line">読み込み中...</p>}
      {error && <p className="error">{error}</p>}
      <div className="player-layout">
        <div className="player-media">
          <div className="player-video-frame">
            {src && !error ? (
              <video
                ref={videoRef}
                className="player-video"
                autoPlay
                controls
                preload="metadata"
                src={src}
                onCanPlay={onCanPlay}
                onTimeUpdate={(event) => {
                  onTimeUpdate(Math.floor(event.currentTarget.currentTime * 1000));
                }}
                onError={(event) => {
                  onError(event.currentTarget);
                }}
              />
            ) : (
              <div className="player-video-placeholder skeleton" />
            )}
            {src && !error && !canPlay && (
              <div className="player-video-overlay">
                <div className="player-video-shimmer" />
                <div className="player-video-label">再生準備中...</div>
              </div>
            )}
          </div>
          {debug && <p className="progress-line codec-line">{debug}</p>}
          {error && filePath && (
            <div className="action-row">
              <button className="ghost small" onClick={onOpenExternalPlayer}>
                外部プレイヤーで開く
              </button>
              <button className="ghost small" onClick={onRevealInFolder}>
                フォルダを開く
              </button>
            </div>
          )}
        </div>
        <aside className="player-chat">
          <div className="player-chat-header">
            <div className="player-chat-title">
              <span className="comment-title">チャット</span>
              <span
                className={`badge ${
                  sortedComments.length > 0 ? "badge-success" : "badge-muted"
                }`}
              >
                {sortedComments.length > 0 ? "同期" : "同期不可"}
              </span>
            </div>
            <div className="player-chat-actions">
              <button className="ghost tiny" onClick={onToggleChatAutoScroll}>
                {isChatAutoScroll ? "自動スクロール: ON" : "自動スクロール: OFF"}
              </button>
            </div>
          </div>
          <div className="player-chat-meta">
            <span>再生位置 {formatClock(timeMs)}</span>
            {commentsLoading && <span>読み込み中...</span>}
          </div>
          {commentsError && <p className="error small">{commentsError}</p>}
          {!commentsLoading && !commentsError && sortedComments.length === 0 && (
            <p className="progress-line">
              同期可能なチャットがありません。ライブチャットリプレイのみ対応しています。
            </p>
          )}
          <div className="player-chat-list">
            {(commentsLoading || !src) &&
              Array.from({ length: 6 }).map((_, index) => (
                <div key={`chat-skeleton-${index}`} className="player-chat-item">
                  <div className="skeleton skeleton-line chat-skeleton-author" />
                  <div className="skeleton skeleton-line chat-skeleton-line" />
                  <div className="skeleton skeleton-line chat-skeleton-line short" />
                </div>
              ))}
            {visibleComments.map((comment, index) => (
              <div
                key={`${comment.author}-${comment.offsetMs ?? index}-${index}`}
                className="player-chat-item"
              >
                <div className="comment-meta">
                  {comment.authorPhotoUrl && (
                    <img
                      className="comment-avatar"
                      src={comment.authorPhotoUrl}
                      alt={comment.author}
                      loading="lazy"
                    />
                  )}
                  <span>{comment.author}</span>
                  {comment.offsetMs !== undefined && (
                    <span>{formatClock(comment.offsetMs)}</span>
                  )}
                </div>
                <div className="comment-text">{renderCommentRuns(comment)}</div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
        </aside>
      </div>
    </>
  );
}
