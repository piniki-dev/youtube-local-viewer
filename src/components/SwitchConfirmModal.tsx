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
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>再生切替</h2>
          <button className="icon" onClick={onCancel}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <p>{message}</p>
        </div>
        <div className="modal-footer">
          <button className="ghost" onClick={onCancel}>
            キャンセル
          </button>
          <button className="primary" onClick={onConfirm}>
            切り替える
          </button>
        </div>
      </div>
    </div>
  );
}
