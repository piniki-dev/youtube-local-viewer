import { useTranslation } from "react-i18next";

type DeleteConfirmModalProps = {
  isOpen: boolean;
  videoTitle: string;
  onCancel: () => void;
  onDeleteListOnly: () => void;
  onDeleteWithFiles: () => void;
};

export function DeleteConfirmModal({
  isOpen,
  videoTitle,
  onCancel,
  onDeleteListOnly,
  onDeleteWithFiles,
}: DeleteConfirmModalProps) {
  const { t } = useTranslation();
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t("deleteConfirm.title")}</h2>
          <button className="icon" onClick={onCancel}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <p>
            {t("deleteConfirm.message", { title: videoTitle })}
          </p>
          <p style={{ color: "var(--c-text-muted)", fontSize: 13 }}>
            {t("deleteConfirm.question")}
          </p>
        </div>
        <div className="modal-footer">
          <button className="ghost" onClick={onCancel}>
            {t("deleteConfirm.cancel")}
          </button>
          <button className="ghost" onClick={onDeleteListOnly}>
            {t("deleteConfirm.deleteListOnly")}
          </button>
          <button className="primary danger-btn" onClick={onDeleteWithFiles}>
            {t("deleteConfirm.deleteWithFiles")}
          </button>
        </div>
      </div>
    </div>
  );
}
