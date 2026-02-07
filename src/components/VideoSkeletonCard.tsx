export function VideoSkeletonCard() {
  return (
    <article className="video-card skeleton-card" aria-live="polite">
      <div className="thumbnail skeleton thumbnail-skeleton" aria-hidden="true" />
      <div className="video-info">
        <div className="skeleton-line title skeleton" />
        <div className="skeleton-line skeleton" />
        <div className="skeleton-line small skeleton" />
        <div className="skeleton-pill skeleton" />
        <p className="skeleton-text" role="status">
          読み込み中...
        </p>
      </div>
    </article>
  );
}
