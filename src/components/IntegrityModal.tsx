import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t("integrity.title")}</h2>
          <button className="icon" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          {integrityMessage && <p className="error">{integrityMessage}</p>}
          {integritySummary && (
            <div className="integrity-summary">
              <p>
                {t("integrity.summary", {
                  total: integritySummary.total,
                  video: integritySummary.videoMissing,
                  comments: integritySummary.commentsMissing,
                  metadata: integritySummary.metadataMissing
                })}
              </p>
            </div>
          )}
          {!integrityMessage && integrityIssues.length === 0 && (
            <p className="progress-line">{t("integrity.noIssues")}</p>
          )}
          {integrityIssues.length > 0 && (
            <div className="integrity-list">
              {integrityIssues.map((item) => (
                <div key={item.id} className="integrity-item">
                  <div className="integrity-title">{item.title}</div>
                  <div className="integrity-badges">
                    {item.videoMissing && (
                      <span className="integrity-badge">{t("integrity.videoMissing")}</span>
                    )}
                    {item.commentsMissing && (
                      <span className="integrity-badge">{t("integrity.commentsMissing")}</span>
                    )}
                    {item.metadataMissing && (
                      <span className="integrity-badge">{t("integrity.metadataMissing")}</span>
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
            {integrityRunning ? t("integrity.checking") : t("integrity.recheck")}
          </button>
          <button className="ghost" onClick={onRelink}>
            {t("integrity.relink")}
          </button>
          <button className="primary" onClick={onClose}>
            {t("integrity.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
