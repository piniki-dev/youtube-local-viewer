import type { RefObject } from "react";

type CommentItem = {
  author: string;
  text: string;
  likeCount?: number;
  publishedAt?: string;
  offsetMs?: number;
};

type PlayerContentProps = {
  title: string;
  loading: boolean;
  error: string;
  src: string | null;
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
  title,
  loading,
  error,
  src,
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
  return (
    <>
      <div className="comment-title">{title}</div>
      {loading && <p className="progress-line">読み込み中...</p>}
      {error && <p className="error">{error}</p>}
      <div className="player-layout">
        <div className="player-media">
          {src && !error && (
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
          )}
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
            {visibleComments.map((comment, index) => (
              <div
                key={`${comment.author}-${comment.offsetMs ?? index}-${index}`}
                className="player-chat-item"
              >
                <div className="comment-meta">
                  <span>{comment.author}</span>
                  {comment.offsetMs !== undefined && (
                    <span>{formatClock(comment.offsetMs)}</span>
                  )}
                </div>
                <div className="comment-text">{comment.text}</div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
        </aside>
      </div>
    </>
  );
}
