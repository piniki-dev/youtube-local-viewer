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
  integritySummary: IntegritySummary | null;
  integrityRunning: boolean;
  onRunIntegrityCheck: () => void;
  onOpenIntegrity: () => void;
  onExportBackup: () => void;
  onImportBackup: () => void;
  settingsErrorMessage: string;
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
  integritySummary,
  integrityRunning,
  onRunIntegrityCheck,
  onOpenIntegrity,
  onExportBackup,
  onImportBackup,
  settingsErrorMessage,
}: SettingsModalProps) {
  if (!isOpen) return null;

  const renderToolingStatus = (status: ToolingCheckStatus | null) => {
    if (!status) {
      return (
        <div className="setting-meta">
          <span className="status-pill unknown">未確認</span>
        </div>
      );
    }

    return (
      <div className="setting-meta">
        <span className={`status-pill ${status.ok ? "ok" : "missing"}`}>
          {status.ok ? "検出済み" : "未検出"}
        </span>
        <span className="setting-hint">検出: {status.path}</span>
      </div>
    );
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>設定</h2>
          <button className="icon" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="setting-row">
            <div>
              <p className="setting-label">保存先フォルダ</p>
              <p className="setting-value">{downloadDir ? downloadDir : "未設定"}</p>
            </div>
            <button className="ghost" onClick={onPickDownloadDir}>
              フォルダを選択
            </button>
          </div>
          <div className="setting-row">
            <div>
              <p className="setting-label">Cookieの取得元</p>
              <p className="setting-value">
                {cookiesSource === "browser"
                  ? "ブラウザ"
                  : cookiesSource === "file"
                    ? "ファイル"
                    : "未使用"}
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
                <option value="none">使用しない</option>
                <option value="file">Cookieファイル（推奨）</option>
                <option value="browser">ブラウザ（非推奨）</option>
              </select>
            </div>
          </div>
          {cookiesSource === "file" && (
            <div className="setting-row">
              <div>
                <p className="setting-label">YouTube Cookieファイル</p>
                <p className="setting-value">{cookiesFile ? cookiesFile : "未設定"}</p>
              </div>
              <div className="action-row">
                <button className="ghost" onClick={onPickCookiesFile}>
                  ファイルを選択
                </button>
                {cookiesFile && (
                  <button className="ghost" onClick={onClearCookiesFile}>
                    クリア
                  </button>
                )}
              </div>
            </div>
          )}
          {cookiesSource === "browser" && (
            <div className="setting-row">
              <div>
                <p className="setting-label">ブラウザ</p>
                <p className="setting-value">
                  {cookiesBrowser
                    ? cookieBrowserOptions.find(
                        (option) => option.value === cookiesBrowser
                      )?.label ?? cookiesBrowser
                    : "未設定"}
                </p>
              </div>
              <div className="select-wrap">
                <select
                  value={cookiesBrowser}
                  onChange={(e) => onUpdateCookiesBrowser(e.target.value)}
                >
                  <option value="">選択してください</option>
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
              <p className="setting-label">yt-dlp</p>
              <p className="setting-value">
                {ytDlpPath ? ytDlpPath : "未設定（同梱/パス指定なら空でもOK）"}
              </p>
              {renderToolingStatus(ytDlpStatus)}
            </div>
            <div className="action-row">
              <button className="ghost" onClick={onPickYtDlpPath}>
                ファイルを選択
              </button>
              {ytDlpPath && (
                <button className="ghost" onClick={onClearYtDlpPath}>
                  クリア
                </button>
              )}
            </div>
          </div>
          <div className="setting-row">
            <div>
              <p className="setting-label">ffmpeg</p>
              <p className="setting-value">
                {ffmpegPath ? ffmpegPath : "未設定（同梱/パス指定なら空でもOK）"}
              </p>
              {renderToolingStatus(ffmpegStatus)}
            </div>
            <div className="action-row">
              <button className="ghost" onClick={onPickFfmpegPath}>
                ファイルを選択
              </button>
              {ffmpegPath && (
                <button className="ghost" onClick={onClearFfmpegPath}>
                  クリア
                </button>
              )}
            </div>
          </div>
          <div className="setting-row">
            <div>
              <p className="setting-label">ffprobe</p>
              <p className="setting-value">
                {ffprobePath ? ffprobePath : "未設定（同梱/パス指定なら空でもOK）"}
              </p>
              {renderToolingStatus(ffprobeStatus)}
            </div>
            <div className="action-row">
              <button className="ghost" onClick={onPickFfprobePath}>
                ファイルを選択
              </button>
              {ffprobePath && (
                <button className="ghost" onClick={onClearFfprobePath}>
                  クリア
                </button>
              )}
            </div>
          </div>
          <div className="setting-row">
            <div>
              <p className="setting-label">Remote components (EJS)</p>
              <p className="setting-value">
                {remoteComponents === "none" ? "無効" : remoteComponents}
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
                <option value="none">無効</option>
                <option value="ejs:github">ejs:github</option>
                <option value="ejs:npm">ejs:npm</option>
              </select>
            </div>
          </div>
          <div className="setting-row">
            <div>
              <p className="setting-label">整合性チェック</p>
              <p className="setting-value">
                {integritySummary
                  ? `欠損 ${integritySummary.total}件（動画:${integritySummary.videoMissing} / コメント:${integritySummary.commentsMissing} / メタデータ:${integritySummary.metadataMissing}）`
                  : "ライブラリ内の欠損を検査"}
              </p>
            </div>
            <div className="action-row">
              <button
                className="ghost"
                onClick={onRunIntegrityCheck}
                disabled={integrityRunning}
              >
                {integrityRunning ? "チェック中..." : "チェック"}
              </button>
              {integritySummary && (
                <button className="ghost" onClick={onOpenIntegrity}>
                  結果
                </button>
              )}
            </div>
          </div>
          <div className="setting-row">
            <div>
              <p className="setting-label">バックアップ</p>
              <p className="setting-value">設定とインデックスをzipで保存/復元</p>
            </div>
            <div className="action-row">
              <button className="ghost" onClick={onExportBackup}>
                エクスポート
              </button>
              <button className="ghost" onClick={onImportBackup}>
                インポート
              </button>
            </div>
          </div>
          {settingsErrorMessage && (
            <p className="error">{settingsErrorMessage}</p>
          )}
        </div>
      </div>
    </div>
  );
}
