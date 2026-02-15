import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type DevResetModalProps = {
  isOpen: boolean;
  downloadDir: string;
  onCancel: () => void;
};

export function DevResetModal({
  isOpen,
  downloadDir,
  onCancel,
}: DevResetModalProps) {
  const [isResetting, setIsResetting] = useState(false);

  if (!isOpen) return null;

  const handleReset = async (keepSettings: boolean) => {
    setIsResetting(true);
    try {
      const log = await invoke<string>("dev_reset", {
        outputDir: downloadDir,
        keepSettings,
      });
      console.log("[dev_reset]", log);

      // ローカルストレージをクリア
      localStorage.clear();
      console.log("[dev_reset] localStorage cleared");

      // アプリを再起動
      window.location.reload();
    } catch (e) {
      console.error("[dev_reset] failed:", e);
      setIsResetting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>🔧 開発環境リセット</h2>
          <button className="icon" onClick={onCancel} disabled={isResetting}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <p>開発環境のデータを初期化します。</p>
          <div style={{ margin: "1rem 0", padding: "0.75rem", background: "var(--c-surface-alt)", borderRadius: 8, fontSize: 13 }}>
            <p style={{ fontWeight: 600, marginBottom: "0.5rem" }}>「設定を残す」の場合:</p>
            <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
              <li>ダウンロード済みファイル削除</li>
              <li>videos.json 削除</li>
              <li>エラーログ削除</li>
              <li>ローカルストレージクリア</li>
            </ul>
            <p style={{ fontWeight: 600, marginBottom: "0.5rem", marginTop: "0.75rem" }}>「全部初期化」の場合:</p>
            <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
              <li>上記すべて + 設定ファイル（app.json）削除</li>
            </ul>
          </div>
          {downloadDir && (
            <p style={{ color: "var(--c-text-muted)", fontSize: 12, wordBreak: "break-all" }}>
              対象: {downloadDir}
            </p>
          )}
        </div>
        <div className="modal-footer">
          <button className="ghost" onClick={onCancel} disabled={isResetting}>
            キャンセル
          </button>
          <button
            className="ghost"
            onClick={() => void handleReset(true)}
            disabled={isResetting}
          >
            {isResetting ? "リセット中..." : "設定を残す"}
          </button>
          <button
            className="primary danger-btn"
            onClick={() => void handleReset(false)}
            disabled={isResetting}
          >
            {isResetting ? "リセット中..." : "全部初期化"}
          </button>
        </div>
      </div>
    </div>
  );
}
