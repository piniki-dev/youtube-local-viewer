import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { join } from "@tauri-apps/api/path";

type UseBackupActionsParams = {
  persistSettings: () => Promise<void>;
  setSettingsErrorMessage: React.Dispatch<React.SetStateAction<string>>;
  setBackupMessage: React.Dispatch<React.SetStateAction<string>>;
  setBackupRestartRequired: React.Dispatch<React.SetStateAction<boolean>>;
  setIsBackupNoticeOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setBackupRestartCountdown: React.Dispatch<React.SetStateAction<number>>;
  integrityCheckPendingKey: string;
};

export function useBackupActions({
  persistSettings,
  setSettingsErrorMessage,
  setBackupMessage,
  setBackupRestartRequired,
  setIsBackupNoticeOpen,
  setBackupRestartCountdown,
  integrityCheckPendingKey,
}: UseBackupActionsParams) {
  const exportBackup = useCallback(async () => {
    setSettingsErrorMessage("");
    setBackupMessage("");
    setBackupRestartRequired(false);
    try {
      await persistSettings();
      const dir = await openDialog({
        directory: true,
        multiple: false,
        title: "バックアップ保存先フォルダを選択",
      });
      if (typeof dir !== "string" || !dir) return;
      const target = await join(dir, "ytlv-backup.zip");
      await invoke("export_state", { outputPath: target });
      setBackupMessage("バックアップのエクスポートが完了しました。");
      setIsBackupNoticeOpen(true);
    } catch {
      setSettingsErrorMessage("バックアップの作成に失敗しました。");
    }
  }, [
    persistSettings,
    setSettingsErrorMessage,
    setBackupMessage,
    setBackupRestartRequired,
    setIsBackupNoticeOpen,
  ]);

  const importBackup = useCallback(async () => {
    setSettingsErrorMessage("");
    setBackupMessage("");
    setBackupRestartRequired(false);
    try {
      const selected = await openDialog({
        directory: false,
        multiple: false,
        title: "バックアップを選択",
      });
      if (typeof selected !== "string" || !selected) return;
      await invoke("import_state", { inputPath: selected });
      localStorage.setItem(integrityCheckPendingKey, "1");
      setBackupMessage("バックアップのインポートが完了しました。再起動してください。");
      setIsBackupNoticeOpen(true);
      setBackupRestartRequired(true);
      setBackupRestartCountdown(10);
      const intervalId = window.setInterval(() => {
        setBackupRestartCountdown((prev) => {
          if (prev <= 1) {
            window.clearInterval(intervalId);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      window.setTimeout(() => {
        window.location.reload();
      }, 10_000);
    } catch {
      setSettingsErrorMessage("バックアップの復元に失敗しました。");
    }
  }, [
    setSettingsErrorMessage,
    setBackupMessage,
    setBackupRestartRequired,
    setIsBackupNoticeOpen,
    setBackupRestartCountdown,
    integrityCheckPendingKey,
  ]);

  return { exportBackup, importBackup };
}
