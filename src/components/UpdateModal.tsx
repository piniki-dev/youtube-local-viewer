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
            <button className="icon" onClick={onClose}>
              <i className="ri-close-line"></i>
            </button>
          )}
        </div>

        <div className="modal-body">
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
              <div className="progress">
                <div
                  className="progress-bar"
                  style={{
                    width: `${updateProgress.total > 0 ? (updateProgress.downloaded / updateProgress.total) * 100 : 0}%`,
                  }}
                ></div>
              </div>
              <p className="progress-caption">
                {t('update.downloading')}: {formatBytes(updateProgress.downloaded)} /{' '}
                {formatBytes(updateProgress.total)}
              </p>
            </div>
          )}

          {error && (
            <div className="error-row">
              <i className="ri-error-warning-line"></i>
              <p className="error">
                {t('update.error')}: {error}
              </p>
            </div>
          )}
        </div>

        <div className="modal-footer">
          {!isUpdating && (
            <>
              <button className="ghost" onClick={onClose}>
                {t('update.later')}
              </button>
              <button className="primary" onClick={onInstall}>
                {t('update.install')}
              </button>
            </>
          )}
          {isUpdating && (
            <button className="primary" disabled>
              {t('update.installing')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
