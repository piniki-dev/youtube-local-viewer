import { useState } from "react";
import { useTranslation } from "react-i18next";

type CookieBrowserOption = { value: string; label: string };

type ToolingCheckStatus = {
  ok: boolean;
  path: string;
};

type IntegritySummary = {
  total: number;
  videoMissing: number;
  commentsMissing: number;
  metadataMissing: number;
};

type SettingsTab = "general" | "tools" | "data";

type SettingsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  downloadDir: string;
  onPickDownloadDir: () => void;
  cookiesSource: "none" | "file" | "browser";
  onUpdateCookiesSource: (value: "none" | "file" | "browser") => void;
  cookiesFile: string;
  onPickCookiesFile: () => void;
  onClearCookiesFile: () => void;
  cookiesBrowser: string;
  onUpdateCookiesBrowser: (value: string) => void;
  cookieBrowserOptions: CookieBrowserOption[];
  ytDlpPath: string;
  ytDlpStatus: ToolingCheckStatus | null;
  onPickYtDlpPath: () => void;
  onClearYtDlpPath: () => void;
  ffmpegPath: string;
  ffmpegStatus: ToolingCheckStatus | null;
  onPickFfmpegPath: () => void;
  onClearFfmpegPath: () => void;
  ffprobePath: string;
  ffprobeStatus: ToolingCheckStatus | null;
  onPickFfprobePath: () => void;
  onClearFfprobePath: () => void;
  remoteComponents: "none" | "ejs:github" | "ejs:npm";
  onUpdateRemoteComponents: (value: "none" | "ejs:github" | "ejs:npm") => void;
  downloadQuality: string;
  onUpdateDownloadQuality: (value: string) => void;
  integritySummary: IntegritySummary | null;
  integrityRunning: boolean;
  onRunIntegrityCheck: () => void;
  onOpenIntegrity: () => void;
  onExportBackup: () => void;
  onImportBackup: () => void;
  settingsErrorMessage: string;
  language: string;
  onUpdateLanguage: (value: string) => void;
  appVersion: string;
};

export function SettingsModal({
  isOpen,
  onClose,
  downloadDir,
  onPickDownloadDir,
  cookiesSource,
  onUpdateCookiesSource,
  cookiesFile,
  onPickCookiesFile,
  onClearCookiesFile,
  cookiesBrowser,
  onUpdateCookiesBrowser,
  cookieBrowserOptions,
  ytDlpPath,
  ytDlpStatus,
  onPickYtDlpPath,
  onClearYtDlpPath,
  ffmpegPath,
  ffmpegStatus,
  onPickFfmpegPath,
  onClearFfmpegPath,
  ffprobePath,
  ffprobeStatus,
  onPickFfprobePath,
  onClearFfprobePath,
  remoteComponents,
  onUpdateRemoteComponents,
  downloadQuality,
  onUpdateDownloadQuality,
  integritySummary,
  integrityRunning,
  onRunIntegrityCheck,
  onOpenIntegrity,
  onExportBackup,
  onImportBackup,
  settingsErrorMessage,
  language,
  onUpdateLanguage,
  appVersion,
}: SettingsModalProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

  if (!isOpen) return null;

  const renderToolingStatus = (status: ToolingCheckStatus | null) => {
    if (!status) {
      return (
        <div className="setting-meta">
          <span className="status-pill unknown">{t("settings.tools.statusUnknown")}</span>
        </div>
      );
    }

    return (
      <div className="setting-meta">
        <span className={`status-pill ${status.ok ? "ok" : "missing"}`}>
          {status.ok ? t("settings.tools.statusDetected") : t("settings.tools.statusMissing")}
        </span>
        <span className="setting-hint">{t("settings.tools.detected")}: {status.path}</span>
      </div>
    );
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t("settings.title")}</h2>
          <button className="icon" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="settings-tabs">
          <button
            className={activeTab === "general" ? "active" : ""}
            onClick={() => setActiveTab("general")}
          >
            {t("settings.tabs.general")}
          </button>
          <button
            className={activeTab === "tools" ? "active" : ""}
            onClick={() => setActiveTab("tools")}
          >
            {t("settings.tabs.tools")}
          </button>
          <button
            className={activeTab === "data" ? "active" : ""}
            onClick={() => setActiveTab("data")}
          >
            {t("settings.tabs.data")}
          </button>
        </div>
        <div className="modal-body">
          {activeTab === "general" && (
            <>
              <div className="setting-row">
                <div>
                  <p className="setting-label">{t("settings.general.downloadDir")}</p>
                  <p className="setting-value">{downloadDir ? downloadDir : t("settings.general.notSet")}</p>
                </div>
                <button className="ghost" onClick={onPickDownloadDir}>
                  {t("settings.general.selectFolder")}
                </button>
              </div>
              <div className="setting-row">
                <div>
                  <p className="setting-label">{t("settings.general.downloadQuality")}</p>
                  <p className="setting-value">
                    {downloadQuality === "1080p" ? t("settings.general.quality1080p")
                      : downloadQuality === "720p" ? t("settings.general.quality720p")
                      : downloadQuality === "480p" ? t("settings.general.quality480p")
                      : downloadQuality === "360p" ? t("settings.general.quality360p")
                      : downloadQuality === "audio" ? t("settings.general.qualityAudio")
                      : t("settings.general.qualityBest")}
                  </p>
                </div>
                <div className="select-wrap">
                  <select
                    value={downloadQuality || "best"}
                    onChange={(e) => onUpdateDownloadQuality(e.target.value)}
                  >
                    <option value="best">{t("settings.general.qualityBest")}</option>
                    <option value="1080p">{t("settings.general.quality1080p")}</option>
                    <option value="720p">{t("settings.general.quality720p")}</option>
                    <option value="480p">{t("settings.general.quality480p")}</option>
                    <option value="360p">{t("settings.general.quality360p")}</option>
                    <option value="audio">{t("settings.general.qualityAudio")}</option>
                  </select>
                </div>
              </div>
              <div className="setting-row">
                <div>
                  <p className="setting-label">{t("settings.general.language")}</p>
                  <p className="setting-value">
                    {language === "en" ? "English" : "日本語"}
                  </p>
                </div>
                <div className="select-wrap">
                  <select
                    value={language}
                    onChange={(e) => onUpdateLanguage(e.target.value)}
                  >
                    <option value="ja">日本語</option>
                    <option value="en">English</option>
                  </select>
                </div>
              </div>
              <div className="setting-row">
                <div>
                  <p className="setting-label">{t("settings.general.version")}</p>
                  <p className="setting-value">{appVersion}</p>
                </div>
              </div>
            </>
          )}
          {activeTab === "tools" && (
            <>
              <div className="setting-row">
                <div>
                  <p className="setting-label">{t("settings.general.cookiesSource")}</p>
                  <p className="setting-value">
                    {cookiesSource === "browser"
                      ? t("settings.general.cookiesBrowser")
                      : cookiesSource === "file"
                        ? t("settings.general.cookiesFile")
                        : t("settings.general.cookiesNone")}
                  </p>
                </div>
                <div className="select-wrap">
                  <select
                    value={cookiesSource}
                    onChange={(e) =>
                      onUpdateCookiesSource(
                        e.target.value as "none" | "file" | "browser"
                      )
                    }
                  >
                    <option value="none">{t("settings.general.cookiesNone")}</option>
                    <option value="file">{t("settings.general.cookiesFile")}</option>
                    <option value="browser">{t("settings.general.cookiesBrowser")}</option>
                  </select>
                </div>
              </div>
              {cookiesSource === "file" && (
                <div className="setting-row">
                  <div>
                    <p className="setting-label">{t("settings.general.cookiesFileLabel")}</p>
                    <p className="setting-value">{cookiesFile ? cookiesFile : t("settings.general.notSet")}</p>
                  </div>
                  <div className="action-row">
                    <button className="ghost" onClick={onPickCookiesFile}>
                      {t("settings.general.selectFile")}
                    </button>
                    {cookiesFile && (
                      <button className="ghost" onClick={onClearCookiesFile}>
                        {t("settings.general.clear")}
                      </button>
                    )}
                  </div>
                </div>
              )}
              {cookiesSource === "browser" && (
                <div className="setting-row">
                  <div>
                    <p className="setting-label">{t("settings.general.browserSelect")}</p>
                    <p className="setting-value">
                      {cookiesBrowser
                        ? cookieBrowserOptions.find(
                            (option) => option.value === cookiesBrowser
                          )?.label ?? cookiesBrowser
                        : t("settings.general.notSet")}
                    </p>
                  </div>
                  <div className="select-wrap">
                    <select
                      value={cookiesBrowser}
                      onChange={(e) => onUpdateCookiesBrowser(e.target.value)}
                    >
                      <option value="">{t("settings.general.notSet")}</option>
                      {cookieBrowserOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
              <div className="setting-row">
                <div>
                  <p className="setting-label">{t("settings.tools.ytDlp")}</p>
                  <p className="setting-value">
                    {ytDlpPath ? ytDlpPath : t("settings.tools.notSetOptional")}
                  </p>
                  {renderToolingStatus(ytDlpStatus)}
                </div>
                <div className="action-row">
                  <button className="ghost" onClick={onPickYtDlpPath}>
                    {t("settings.tools.selectPath")}
                  </button>
                  {ytDlpPath && (
                    <button className="ghost" onClick={onClearYtDlpPath}>
                      {t("settings.general.clear")}
                    </button>
                  )}
                </div>
              </div>
              <div className="setting-row">
                <div>
                  <p className="setting-label">{t("settings.tools.ffmpeg")}</p>
                  <p className="setting-value">
                    {ffmpegPath ? ffmpegPath : t("settings.tools.notSetOptional")}
                  </p>
                  {renderToolingStatus(ffmpegStatus)}
                </div>
                <div className="action-row">
                  <button className="ghost" onClick={onPickFfmpegPath}>
                    {t("settings.tools.selectPath")}
                  </button>
                  {ffmpegPath && (
                    <button className="ghost" onClick={onClearFfmpegPath}>
                      {t("settings.general.clear")}
                    </button>
                  )}
                </div>
              </div>
              <div className="setting-row">
                <div>
                  <p className="setting-label">{t("settings.tools.ffprobe")}</p>
                  <p className="setting-value">
                    {ffprobePath ? ffprobePath : t("settings.tools.notSetOptional")}
                  </p>
                  {renderToolingStatus(ffprobeStatus)}
                </div>
                <div className="action-row">
                  <button className="ghost" onClick={onPickFfprobePath}>
                    {t("settings.tools.selectPath")}
                  </button>
                  {ffprobePath && (
                    <button className="ghost" onClick={onClearFfprobePath}>
                      {t("settings.general.clear")}
                    </button>
                  )}
                </div>
              </div>
              <div className="setting-row">
                <div>
                  <p className="setting-label">{t("settings.general.remoteComponents")}</p>
                  <p className="setting-value">
                    {remoteComponents === "none" ? t("settings.general.remoteNone") : remoteComponents}
                  </p>
                </div>
                <div className="select-wrap">
                  <select
                    value={remoteComponents}
                    onChange={(e) =>
                      onUpdateRemoteComponents(
                        e.target.value as "none" | "ejs:github" | "ejs:npm"
                      )
                    }
                  >
                    <option value="none">{t("settings.general.remoteNone")}</option>
                    <option value="ejs:github">{t("settings.general.remoteGithub")}</option>
                    <option value="ejs:npm">{t("settings.general.remoteNpm")}</option>
                  </select>
                </div>
              </div>
            </>
          )}
          {activeTab === "data" && (
            <>
              <div className="setting-row">
                <div>
                  <p className="setting-label">{t("settings.data.integrityCheck")}</p>
                  <p className="setting-value">
                    {integritySummary
                      ? t("settings.data.missingCount", {
                          total: integritySummary.total,
                          video: integritySummary.videoMissing,
                          comments: integritySummary.commentsMissing,
                          metadata: integritySummary.metadataMissing
                        })
                      : t("settings.data.integrityDesc")}
                  </p>
                </div>
                <div className="action-row">
                  <button
                    className="ghost"
                    onClick={onRunIntegrityCheck}
                    disabled={integrityRunning}
                  >
                    {integrityRunning ? t("settings.data.running") : t("settings.data.runCheck")}
                  </button>
                  {integritySummary && (
                    <button className="ghost" onClick={onOpenIntegrity}>
                      {t("settings.data.viewDetails")}
                    </button>
                  )}
                </div>
              </div>
              <div className="setting-row">
                <div>
                  <p className="setting-label">{t("settings.data.backup")}</p>
                  <p className="setting-value">{t("settings.data.backupDesc")}</p>
                </div>
                <div className="action-row">
                  <button className="ghost" onClick={onExportBackup}>
                    {t("settings.data.export")}
                  </button>
                  <button className="ghost" onClick={onImportBackup}>
                    {t("settings.data.import")}
                  </button>
                </div>
              </div>
            </>
          )}
          {settingsErrorMessage && (
            <p className="error">{settingsErrorMessage}</p>
          )}
        </div>
      </div>
    </div>
  );
}
