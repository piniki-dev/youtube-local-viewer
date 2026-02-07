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
  if (!isOpen || !message) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>完了</h2>
          <button className="icon" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <p>{message}</p>
          {restartRequired && countdown > 0 && (
            <p className="progress-line backup-countdown">
              {countdown}秒後に自動で再起動します。
            </p>
          )}
        </div>
        <div className="modal-footer">
          {restartRequired ? (
            <button className="primary" onClick={onRestart}>
              再起動
            </button>
          ) : (
            <button className="primary" onClick={onClose}>
              閉じる
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
