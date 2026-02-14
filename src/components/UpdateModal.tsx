import { useTranslation } from 'react-i18next';
import { UpdateInfo, UpdateProgress } from '../hooks/useAppUpdater';

interface UpdateModalProps {
  updateInfo: UpdateInfo | null;
  isUpdating: boolean;
  updateProgress: UpdateProgress | null;
  error: string | null;
  onInstall: () => void;
  onClose: () => void;
}

export default function UpdateModal({
  updateInfo,
  isUpdating,
  updateProgress,
  error,
  onInstall,
  onClose,
}: UpdateModalProps) {
  const { t } = useTranslation();

  if (!updateInfo?.available) return null;

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Math.round(bytes / Math.pow(k, i) * 100) / 100} ${sizes[i]}`;
  };

  return (
    <div className="modal-backdrop" onClick={isUpdating ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t('update.title')}</h2>
          {!isUpdating && (
            <button className="close-button" onClick={onClose}>
              <i className="ri-close-line"></i>
            </button>
          )}
        </div>

        <div className="modal-content">
          <div className="update-info">
            <p>
              <strong>{t('update.currentVersion')}:</strong> {updateInfo.currentVersion}
            </p>
            <p>
              <strong>{t('update.latestVersion')}:</strong> {updateInfo.latestVersion}
            </p>
          </div>

          {updateInfo.body && (
            <div className="update-changelog">
              <h3>{t('update.changelog')}</h3>
              <div className="changelog-content">{updateInfo.body}</div>
            </div>
          )}

          {isUpdating && updateProgress && (
            <div className="update-progress">
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{
                    width: `${updateProgress.total > 0 ? (updateProgress.downloaded / updateProgress.total) * 100 : 0}%`,
                  }}
                ></div>
              </div>
              <p className="progress-text">
                {t('update.downloading')}: {formatBytes(updateProgress.downloaded)} /{' '}
                {formatBytes(updateProgress.total)}
              </p>
            </div>
          )}

          {error && (
            <div className="error-message">
              <i className="ri-error-warning-line"></i>
              {t('update.error')}: {error}
            </div>
          )}
        </div>

        <div className="modal-footer">
          {!isUpdating && (
            <>
              <button className="button-secondary" onClick={onClose}>
                {t('update.later')}
              </button>
              <button className="button-primary" onClick={onInstall}>
                {t('update.install')}
              </button>
            </>
          )}
          {isUpdating && (
            <button className="button-primary" disabled>
              {t('update.installing')}
            </button>
          )}
        </div>
      </div>

      <style>{`
        .update-info {
          margin-bottom: 1rem;
        }

        .update-info p {
          margin: 0.5rem 0;
        }

        .update-changelog {
          margin: 1rem 0;
          padding: 1rem;
          background: rgba(0, 0, 0, 0.05);
          border-radius: 4px;
          max-height: 200px;
          overflow-y: auto;
        }

        .update-changelog h3 {
          margin: 0 0 0.5rem 0;
          font-size: 1rem;
        }

        .changelog-content {
          white-space: pre-wrap;
          font-size: 0.9rem;
        }

        .update-progress {
          margin: 1rem 0;
        }

        .progress-bar {
          width: 100%;
          height: 8px;
          background: rgba(0, 0, 0, 0.1);
          border-radius: 4px;
          overflow: hidden;
          margin-bottom: 0.5rem;
        }

        .progress-fill {
          height: 100%;
          background: #007bff;
          transition: width 0.3s ease;
        }

        .progress-text {
          text-align: center;
          font-size: 0.9rem;
          margin: 0;
        }

        .error-message {
          padding: 0.75rem;
          background: #fee;
          border: 1px solid #fcc;
          border-radius: 4px;
          color: #c33;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin: 1rem 0;
        }

        .modal-footer {
          display: flex;
          gap: 0.5rem;
          justify-content: flex-end;
        }

        .button-primary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
