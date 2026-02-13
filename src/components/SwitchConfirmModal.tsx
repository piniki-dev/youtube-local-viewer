import { useTranslation } from "react-i18next";

type SwitchConfirmModalProps = {
  isOpen: boolean;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function SwitchConfirmModal({
  isOpen,
  message,
  onCancel,
  onConfirm,
}: SwitchConfirmModalProps) {
  const { t } = useTranslation();
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t("switchConfirm.title")}</h2>
          <button className="icon" onClick={onCancel}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <p>{message}</p>
        </div>
        <div className="modal-footer">
          <button className="ghost" onClick={onCancel}>
            {t("switchConfirm.cancel")}
          </button>
          <button className="primary" onClick={onConfirm}>
            {t("switchConfirm.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
