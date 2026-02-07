type IntegrityIssue = {
  id: string;
  title: string;
  videoMissing: boolean;
  commentsMissing: boolean;
  metadataMissing: boolean;
};

type IntegritySummary = {
  total: number;
  videoMissing: number;
  commentsMissing: number;
  metadataMissing: number;
};

type IntegrityModalProps = {
  isOpen: boolean;
  onClose: () => void;
  integrityMessage: string;
  integritySummary: IntegritySummary | null;
  integrityIssues: IntegrityIssue[];
  integrityRunning: boolean;
  onRunIntegrityCheck: () => void;
  onRelink: () => void;
};

export function IntegrityModal({
  isOpen,
  onClose,
  integrityMessage,
  integritySummary,
  integrityIssues,
  integrityRunning,
  onRunIntegrityCheck,
  onRelink,
}: IntegrityModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>整合性チェック</h2>
          <button className="icon" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          {integrityMessage && <p className="error">{integrityMessage}</p>}
          {integritySummary && (
            <div className="integrity-summary">
              <p>
                欠損合計: {integritySummary.total}件（動画:
                {integritySummary.videoMissing} / コメント:
                {integritySummary.commentsMissing} / メタデータ:
                {integritySummary.metadataMissing}）
              </p>
            </div>
          )}
          {!integrityMessage && integrityIssues.length === 0 && (
            <p className="progress-line">欠損は見つかりませんでした。</p>
          )}
          {integrityIssues.length > 0 && (
            <div className="integrity-list">
              {integrityIssues.map((item) => (
                <div key={item.id} className="integrity-item">
                  <div className="integrity-title">{item.title}</div>
                  <div className="integrity-badges">
                    {item.videoMissing && (
                      <span className="integrity-badge">動画欠損</span>
                    )}
                    {item.commentsMissing && (
                      <span className="integrity-badge">コメント欠損</span>
                    )}
                    {item.metadataMissing && (
                      <span className="integrity-badge">メタデータ欠損</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button
            className="ghost"
            onClick={onRunIntegrityCheck}
            disabled={integrityRunning}
          >
            {integrityRunning ? "チェック中..." : "再チェック"}
          </button>
          <button className="ghost" onClick={onRelink}>
            再リンク
          </button>
          <button className="primary" onClick={onClose}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
