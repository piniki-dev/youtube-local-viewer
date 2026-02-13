import { useTranslation } from "react-i18next";
import type { DownloadState, MissingTool } from "../hooks/useToolSetup";

type SetupDialogProps = {
  isOpen: boolean;
  missingTools: MissingTool[];
  downloadState: DownloadState;
  onStartDownload: () => void;
  onSkip: () => void;
  onClose: () => void;
};

export function SetupDialog({
  isOpen,
  missingTools,
  downloadState,
  onStartDownload,
  onSkip,
  onClose,
}: SetupDialogProps) {
  const { t } = useTranslation();
  if (!isOpen) return null;

  const isDone = downloadState.status === "done";
  const isError = downloadState.status === "error";
  const isActive = downloadState.active;
  const progressPct =
    downloadState.bytesTotal && downloadState.bytesTotal > 0
      ? Math.round(
          (downloadState.bytesDownloaded / downloadState.bytesTotal) * 100
        )
      : null;

  return (
    <div className="modal-backdrop" onClick={isActive ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            <i className="ri-tools-line" style={{ marginRight: 8 }} />
            {t("setup.title")}
          </h2>
          {!isActive && (
            <button className="icon" onClick={onClose} title={t("setup.close")}>
              <i className="ri-close-line" />
            </button>
          )}
        </div>

        <div className="modal-body">
          {!isDone && !isActive && (
            <>
              <p style={{ margin: 0, fontSize: 14 }}>
                {t("setup.description")}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {missingTools.map((tool) => (
                  <div
                    key={tool.name}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 13,
                    }}
                  >
                    <i
                      className="ri-close-circle-line"
                      style={{ color: "#d32f2f" }}
                    />
                    <span>{tool.label}</span>
                    <span style={{ color: "#9aa0ab" }}>— {t("setup.notDetected")}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {isActive && (
            <>
              <div className="loading-row">
                <div className="spinner" />
                <p className="loading-text">{downloadState.message}</p>
              </div>
              {progressPct !== null && (
                <>
                  <div className="progress">
                    <div
                      className="progress-bar"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  <p className="progress-caption">{progressPct}%</p>
                </>
              )}
            </>
          )}

          {isDone && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 14,
              }}
            >
              <i
                className="ri-checkbox-circle-line"
                style={{ color: "#2e7d32", fontSize: 20 }}
              />
              <span>{downloadState.message}</span>
            </div>
          )}

          {isError && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <p className="error">{downloadState.error}</p>
              <p style={{ margin: 0, fontSize: 13, color: "#9aa0ab" }}>
                {t("setup.manualInstall")}
              </p>
            </div>
          )}
        </div>

        <div className="modal-footer">
          {!isDone && !isActive && (
            <>
              <button className="ghost" onClick={onSkip}>
                {t("setup.skip")}
              </button>
              <button className="primary" onClick={onStartDownload}>
                <i className="ri-download-line" style={{ marginRight: 4 }} />
                {t("setup.autoDownload")}
              </button>
            </>
          )}
          {isDone && (
            <button className="primary" onClick={onClose}>
              {t("setup.close")}
            </button>
          )}
          {isError && !isActive && (
            <>
              <button className="ghost" onClick={onSkip}>
                {t("setup.skip")}
              </button>
              <button className="primary" onClick={onStartDownload}>
                {t("setup.retry")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
