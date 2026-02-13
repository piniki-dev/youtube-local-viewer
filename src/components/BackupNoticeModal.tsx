import { useTranslation } from "react-i18next";

type BackupNoticeModalProps = {
  isOpen: boolean;
  message: string;
  restartRequired: boolean;
  countdown: number;
  onClose: () => void;
  onRestart: () => void;
};

export function BackupNoticeModal({
  isOpen,
  message,
  restartRequired,
  countdown,
  onClose,
  onRestart,
}: BackupNoticeModalProps) {
  const { t } = useTranslation();
  if (!isOpen || !message) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t("backup.title")}</h2>
          <button className="icon" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <p>{message}</p>
          {restartRequired && countdown > 0 && (
            <p className="progress-line backup-countdown">
              {t("backup.countdownMessage", { seconds: countdown })}
            </p>
          )}
        </div>
        <div className="modal-footer">
          {restartRequired ? (
            <button className="primary" onClick={onRestart}>
              {t("backup.restart")}
            </button>
          ) : (
            <button className="primary" onClick={onClose}>
              {t("backup.close")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
