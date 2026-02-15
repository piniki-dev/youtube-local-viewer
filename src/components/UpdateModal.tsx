import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UpdateInfo, UpdateProgress } from '../hooks/useAppUpdater';
import {
  extractLocalizedNotes,
  changelogMarkdownToHtml,
} from '../utils/changelogParser';

interface UpdateModalProps {
  updateInfo: UpdateInfo | null;
  isUpdating: boolean;
  updateProgress: UpdateProgress | null;
  error: string | null;
  onInstall: () => void;
  onClose: () => void;
  onDownloadManually: () => void;
}

export default function UpdateModal({
  updateInfo,
  isUpdating,
  updateProgress,
  error,
  onInstall,
  onClose,
  onDownloadManually,
}: UpdateModalProps) {
  const { t, i18n } = useTranslation();
  const [changelogExpanded, setChangelogExpanded] = useState(false);

  if (!updateInfo?.available) return null;

  const changelogHtml = useMemo(() => {
    const notes = extractLocalizedNotes(updateInfo.body, i18n.language);
    if (!notes) return '';
    return changelogMarkdownToHtml(notes);
  }, [updateInfo.body, i18n.language]);

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

          {changelogHtml && (
            <div className="update-changelog">
              <button
                className="changelog-toggle"
                onClick={() => setChangelogExpanded((prev) => !prev)}
              >
                <i className={changelogExpanded ? 'ri-arrow-down-s-line' : 'ri-arrow-right-s-line'}></i>
                <h3>{t('update.changelog')}</h3>
              </button>
              {changelogExpanded && (
                <div
                  className="changelog-content"
                  dangerouslySetInnerHTML={{ __html: changelogHtml }}
                />
              )}
            </div>
          )}

          {!isUpdating && (
            <div className="update-warning">
              <i className="ri-information-line"></i>
              <p>{t('update.smartScreenWarning')}</p>
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
              <button className="ghost" onClick={onDownloadManually}>
                <i className="ri-download-line"></i> {t('update.manualDownload')}
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
