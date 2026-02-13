import type { ReactNode } from "react";
import { useTranslation } from 'react-i18next';

type PlayerModalProps = {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
};

export function PlayerModal({ isOpen, onClose, children }: PlayerModalProps) {
  const { t } = useTranslation();
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t('player.videoPlayback')}</h2>
          <button className="icon" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-footer">
          <button className="primary" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
