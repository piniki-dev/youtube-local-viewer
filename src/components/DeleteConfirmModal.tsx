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
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>動画の削除</h2>
          <button className="icon" onClick={onCancel}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <p>
            「{videoTitle}」を削除します。
          </p>
          <p style={{ color: "var(--c-text-muted)", fontSize: 13 }}>
            ダウンロード済みの動画ファイルやメタデータも削除しますか？
          </p>
        </div>
        <div className="modal-footer">
          <button className="ghost" onClick={onCancel}>
            キャンセル
          </button>
          <button className="ghost" onClick={onDeleteListOnly}>
            リストからのみ削除
          </button>
          <button className="primary danger-btn" onClick={onDeleteWithFiles}>
            ファイルも削除
          </button>
        </div>
      </div>
    </div>
  );
}
