import { useTranslation } from 'react-i18next';

type YtDlpNotice = {
  id: string;
  kind: "success" | "error";
  title: string;
  details?: string;
};

type FloatingNotice = {
  id: string;
  kind: "success" | "error" | "info";
  title: string;
  details?: string;
  autoDismissMs?: number;
};

type MetadataFetchState = {
  active: boolean;
  total: number;
  completed: number;
};

type DownloadErrorSlide = {
  title: string;
  video?: { details: string };
  comments?: { details: string };
  metadata?: { details: string };
  createdAt: number;
};

type BulkDownloadState = {
  active: boolean;
  total: number;
  completed: number;
  currentId: string | null;
  currentTitle: string;
  stopRequested: boolean;
  phase: "video" | "comments" | null;
  waitingForSingles: boolean;
};

type ActiveActivityItem = {
  id: string;
  title: string;
  status: string;
  line: string;
};

type FloatingStatusStackProps = {
  ytDlpNotices: YtDlpNotice[];
  onCloseNotice: (id: string) => void;
  floatingNotices: FloatingNotice[];
  onCloseFloatingNotice: (id: string) => void;
  metadataFetch: MetadataFetchState;
  metadataPaused: boolean;
  metadataPauseReason: string;
  onRetryMetadata: () => void;
  hasDownloadErrors: boolean;
  downloadErrorSlides: DownloadErrorSlide[];
  isDownloadErrorOpen: boolean;
  onToggleDownloadErrorOpen: () => void;
  onClearDownloadErrors: () => void;
  downloadErrorIndex: number;
  onPrevDownloadError: () => void;
  onNextDownloadError: () => void;
  bulkDownload: BulkDownloadState;
  isBulkLogOpen: boolean;
  onToggleBulkLogOpen: () => void;
  onStopBulkDownload: () => void;
  progressLines: Record<string, string>;
  commentProgressLines: Record<string, string>;
  activeActivityItems: ActiveActivityItem[];
  activeDownloadCount: number;
  queuedDownloadCount: number;
  isDownloadLogOpen: boolean;
  onToggleDownloadLogOpen: () => void;
};

export function FloatingStatusStack({
  ytDlpNotices,
  onCloseNotice,
  floatingNotices,
  onCloseFloatingNotice,
  metadataFetch,
  metadataPaused,
  metadataPauseReason,
  onRetryMetadata,
  hasDownloadErrors,
  downloadErrorSlides,
  isDownloadErrorOpen,
  onToggleDownloadErrorOpen,
  onClearDownloadErrors,
  downloadErrorIndex,
  onPrevDownloadError,
  onNextDownloadError,
  bulkDownload,
  isBulkLogOpen,
  onToggleBulkLogOpen,
  onStopBulkDownload,
  progressLines,
  commentProgressLines,
  activeActivityItems,
  activeDownloadCount,
  queuedDownloadCount,
  isDownloadLogOpen,
  onToggleDownloadLogOpen,
}: FloatingStatusStackProps) {
  const { t } = useTranslation();
  const totalDownloadCount = activeDownloadCount + queuedDownloadCount;
  const displayTotalCount =
    totalDownloadCount > 0 ? totalDownloadCount : activeActivityItems.length;
  const hasPanels =
    bulkDownload.active ||
    activeActivityItems.length > 0 ||
    hasDownloadErrors ||
    metadataFetch.active ||
    ytDlpNotices.length > 0 ||
    floatingNotices.length > 0;

  if (!hasPanels) return null;

  return (
    <div className="floating-stack">
      {floatingNotices.map((notice) => (
        <div
          key={notice.id}
          className={`floating-panel generic-notice ${
            notice.kind === "error"
              ? "is-error"
              : notice.kind === "success"
                ? "is-success"
                : ""
          }`}
        >
          <div className="bulk-status-header">
            <div className="bulk-status-title">
              <span>{notice.title}</span>
            </div>
            <button
              className="ghost tiny"
              type="button"
              onClick={() => onCloseFloatingNotice(notice.id)}
            >
              {t('floating.close')}
            </button>
          </div>
          {notice.details && (
            <div className="bulk-status-body">
              <pre className="bulk-status-log">{notice.details}</pre>
            </div>
          )}
        </div>
      ))}

      {ytDlpNotices.map((notice) => (
        <div
          key={notice.id}
          className={`floating-panel yt-dlp-update ${
            notice.kind === "error" ? "is-error" : "is-success"
          }`}
        >
          <div className="bulk-status-header">
            <div className="bulk-status-title">
              <span>{notice.title}</span>
            </div>
            <button
              className="ghost tiny"
              type="button"
              onClick={() => onCloseNotice(notice.id)}
            >
              {t('floating.close')}
            </button>
          </div>
          {notice.details && (
            <div className="bulk-status-body">
              <pre className="bulk-status-log">{notice.details}</pre>
            </div>
          )}
        </div>
      ))}

      {metadataFetch.active && (
        <div className="floating-panel bulk-status">
          <div className="bulk-status-header">
            <div className="bulk-status-title">
              <div className="spinner" />
              <span>
                {t('floating.metadataFetch')} ({metadataFetch.completed}/{metadataFetch.total})
              </span>
            </div>
          </div>
          <div className="bulk-status-body">
            {metadataPaused ? (
              <div className="bulk-status-paused">
                <p className="bulk-status-title-line">
                  {t('floating.metadataPaused')}
                </p>
                {metadataPauseReason && (
                  <pre className="bulk-status-log">{metadataPauseReason}</pre>
                )}
                <button className="ghost small" type="button" onClick={onRetryMetadata}>
                  {t('floating.retry')}
                </button>
              </div>
            ) : (
              <pre className="bulk-status-log">{t('floating.metadataBackground')}</pre>
            )}
          </div>
        </div>
      )}

      {hasDownloadErrors && (
        <div
          className={`floating-panel download-errors ${
            isDownloadErrorOpen ? "open" : ""
          } is-error`}
          role="button"
          tabIndex={0}
          onClick={onToggleDownloadErrorOpen}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onToggleDownloadErrorOpen();
            }
          }}
        >
          <div className="bulk-status-header">
            <div className="bulk-status-title">
              <span>{t('floating.downloadErrors', { count: downloadErrorSlides.length })}</span>
            </div>
            <button
              className="ghost tiny"
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onClearDownloadErrors();
              }}
            >
              {t('floating.clear')}
            </button>
          </div>
          {isDownloadErrorOpen && (
            <div
              className="bulk-status-body"
              onClick={(event) => event.stopPropagation()}
            >
              {downloadErrorSlides.length > 0 && (
                <div className="download-error-carousel">
                  <div className="download-error-track">
                    <div
                      className="download-error-slide"
                      style={{
                        transform: `translateX(-${downloadErrorIndex * 100}%)`,
                      }}
                    >
                      {downloadErrorSlides.map((item) => (
                        <div key={item.title} className="download-error-card">
                          <p className="bulk-status-title-line">{item.title}</p>
                          {item.video && (
                            <div className="download-error-section">
                              <p className="bulk-status-title-line">{t('floating.video')}</p>
                              <pre className="bulk-status-log">
                                {item.video.details}
                              </pre>
                            </div>
                          )}
                          {item.comments && (
                            <div className="download-error-section">
                              <p className="bulk-status-title-line">
                                {t('floating.liveChat')}
                              </p>
                              <pre className="bulk-status-log">
                                {item.comments.details}
                              </pre>
                            </div>
                          )}
                          {item.metadata && (
                            <div className="download-error-section">
                              <p className="bulk-status-title-line">{t('floating.detailedInfo')}</p>
                              <pre className="bulk-status-log">
                                {item.metadata.details}
                              </pre>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="download-error-controls">
                    <button
                      className="ghost tiny"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onPrevDownloadError();
                      }}
                      disabled={downloadErrorIndex === 0}
                    >
                      {t('floating.prev')}
                    </button>
                    <span className="download-error-index">
                      {downloadErrorIndex + 1}/{downloadErrorSlides.length}
                    </span>
                    <button
                      className="ghost tiny"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onNextDownloadError();
                      }}
                      disabled={
                        downloadErrorIndex >= downloadErrorSlides.length - 1
                      }
                    >
                      {t('floating.next')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {bulkDownload.active && (
        <div
          className={`floating-panel bulk-status ${isBulkLogOpen ? "open" : ""}`}
          role="button"
          tabIndex={0}
          onClick={onToggleBulkLogOpen}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onToggleBulkLogOpen();
            }
          }}
        >
          <div className="bulk-status-header">
            <div className="bulk-status-title">
              <div className="spinner" />
              <span>
                {bulkDownload.waitingForSingles
                  ? t('floating.bulkDownloadWaiting', { completed: bulkDownload.completed, total: bulkDownload.total })
                  : t('floating.downloading', { completed: bulkDownload.completed, total: bulkDownload.total })}
              </span>
            </div>
            <button
              className="ghost tiny"
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onStopBulkDownload();
              }}
              disabled={
                bulkDownload.waitingForSingles ||
                !bulkDownload.currentId ||
                bulkDownload.stopRequested
              }
            >
              {bulkDownload.stopRequested ? t('floating.stopping') : t('floating.stop')}
            </button>
          </div>
          {isBulkLogOpen && (
            <div className="bulk-status-body">
              {bulkDownload.waitingForSingles ? (
                <p className="bulk-status-title-line">
                  {t('floating.waitingForSingles')}
                </p>
              ) : (
                <>
                  {bulkDownload.currentTitle && (
                    <p className="bulk-status-title-line">
                      {t('floating.current')}: {bulkDownload.currentTitle}
                    </p>
                  )}
                  {bulkDownload.phase && (
                    <p className="bulk-status-title-line">
                      {t('floating.status')}: {bulkDownload.phase === "comments" ? t('floating.liveChatFetching') : t('floating.videoDownloading')}
                    </p>
                  )}
                  <pre className="bulk-status-log">
                    {bulkDownload.currentId &&
                    (bulkDownload.phase === "comments"
                      ? commentProgressLines[bulkDownload.currentId]
                      : progressLines[bulkDownload.currentId])
                      ? bulkDownload.phase === "comments"
                        ? commentProgressLines[bulkDownload.currentId]
                        : progressLines[bulkDownload.currentId]
                      : t('floating.logWaiting')}
                  </pre>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {activeActivityItems.length > 0 && (
        <div
          className={`floating-panel download-status ${
            isDownloadLogOpen ? "open" : ""
          }`}
          role="button"
          tabIndex={0}
          onClick={onToggleDownloadLogOpen}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onToggleDownloadLogOpen();
            }
          }}
        >
          <div className="bulk-status-header">
            <div className="bulk-status-title">
              {activeActivityItems.length > 0 && <div className="spinner" />}
              <span>
                {t('floating.downloadingCount', { active: activeDownloadCount, total: displayTotalCount })}
              </span>
            </div>
          </div>
          {isDownloadLogOpen && (
            <div className="bulk-status-body">
              {activeActivityItems.map((item) => (
                <div key={item.id} className="download-status-item">
                  <p className="bulk-status-title-line">{item.title}</p>
                  <p className="bulk-status-title-line">{item.status}</p>
                  <pre className="bulk-status-log">{item.line || t('floating.logWaiting')}</pre>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
