import { useTranslation } from 'react-i18next';

type LoadingOverlayProps = {
  isOpen: boolean;
  message?: string;
};

export function LoadingOverlay({ isOpen, message }: LoadingOverlayProps) {
  const { t } = useTranslation();
  if (!isOpen) return null;

  return (
    <div className="loading-overlay" role="status" aria-live="polite">
      <div className="loading-panel">
        <span className="loading-spinner" aria-hidden="true" />
        <p>{message ?? t('player.loading')}</p>
      </div>
    </div>
  );
}
