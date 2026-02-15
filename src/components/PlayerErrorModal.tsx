import { useTranslation } from "react-i18next";

type PlayerErrorModalProps = {
  isOpen: boolean;
  error: string;
  debug: string;
  onClose: () => void;
  onRevealInFolder: () => void;
  hasFilePath: boolean;
};

export function PlayerErrorModal({
  isOpen,
  error,
  debug,
  onClose,
  onRevealInFolder,
  hasFilePath,
}: PlayerErrorModalProps) {
  const { t } = useTranslation();
  if (!isOpen || !error) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t("player.playbackError")}</h2>
          <button className="icon" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <p className="error" style={{ margin: 0 }}>{error}</p>
          {debug && (
            <p className="progress-line codec-line" style={{ margin: 0 }}>
              {debug}
            </p>
          )}
        </div>
        <div className="modal-footer">
          {hasFilePath && (
            <button className="ghost" onClick={onRevealInFolder}>
              {t("player.revealInFolder")}
            </button>
          )}
          <button className="primary" onClick={onClose}>
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
