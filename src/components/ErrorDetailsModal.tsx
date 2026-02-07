type ErrorDetailsModalProps = {
  isOpen: boolean;
  details: string;
  onClose: () => void;
};

export function ErrorDetailsModal({
  isOpen,
  details,
  onClose,
}: ErrorDetailsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>エラー詳細</h2>
          <button className="icon" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <pre className="error-details">{details}</pre>
        </div>
        <div className="modal-footer">
          <button className="primary" onClick={onClose}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
