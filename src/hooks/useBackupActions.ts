import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { join } from "@tauri-apps/api/path";
import i18n from "../i18n";

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
        title: i18n.t('errors.selectBackupFolder'),
      });
      if (typeof dir !== "string" || !dir) return;
      const target = await join(dir, "ytlv-backup.zip");
      await invoke("export_state", { outputPath: target });
      setBackupMessage(i18n.t('errors.backupExportSuccess'));
      setIsBackupNoticeOpen(true);
    } catch {
      setSettingsErrorMessage(i18n.t('errors.backupExportFailed'));
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
        title: i18n.t('errors.selectBackupFile'),
      });
      if (typeof selected !== "string" || !selected) return;
      await invoke("import_state", { inputPath: selected });
      localStorage.setItem(integrityCheckPendingKey, "1");
      setBackupMessage(i18n.t('errors.backupImportSuccess'));
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
      setSettingsErrorMessage(i18n.t('errors.backupImportFailed'));
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
