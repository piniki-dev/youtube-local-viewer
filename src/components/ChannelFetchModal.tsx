import { useTranslation } from "react-i18next";

type ChannelFetchModalProps = {
  isOpen: boolean;
  message: string;
  progress: number;
  onClose: () => void;
};

export function ChannelFetchModal({
  isOpen,
  message,
  progress,
  onClose,
}: ChannelFetchModalProps) {
  const { t } = useTranslation();
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t("channelFetch.title")}</h2>
          <button className="icon" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="loading-row">
            <div className="spinner" aria-hidden="true" />
            <p className="loading-text">{message || t("channelFetch.fetching")}</p>
          </div>
          <div className="progress">
            <div
              className="progress-bar"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
          <p className="progress-caption">{progress}%</p>
        </div>
      </div>
    </div>
  );
}
