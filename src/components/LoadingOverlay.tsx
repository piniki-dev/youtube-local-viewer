type LoadingOverlayProps = {
  isOpen: boolean;
  message?: string;
};

export function LoadingOverlay({ isOpen, message }: LoadingOverlayProps) {
  if (!isOpen) return null;

  return (
    <div className="loading-overlay" role="status" aria-live="polite">
      <div className="loading-panel">
        <span className="loading-spinner" aria-hidden="true" />
        <p>{message ?? "読み込み中..."}</p>
      </div>
    </div>
  );
}
