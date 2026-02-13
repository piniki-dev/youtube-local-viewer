import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import i18n from "../i18n";

type StorageKeys = {
  downloadDirKey: string;
  cookiesFileKey: string;
  cookiesSourceKey: string;
  cookiesBrowserKey: string;
  remoteComponentsKey: string;
  ytDlpPathKey: string;
  ffmpegPathKey: string;
  ffprobePathKey: string;
};

type UseSettingsActionsParams<TVideo> = {
  videosRef: React.RefObject<TVideo[]>;
  downloadDir: string;
  cookiesFile: string;
  cookiesSource: "none" | "file" | "browser";
  cookiesBrowser: string;
  remoteComponents: "none" | "ejs:github" | "ejs:npm";
  ytDlpPath: string;
  ffmpegPath: string;
  ffprobePath: string;
  setDownloadDir: React.Dispatch<React.SetStateAction<string>>;
  setSettingsErrorMessage: React.Dispatch<React.SetStateAction<string>>;
  setIntegrityMessage: React.Dispatch<React.SetStateAction<string>>;
  setIsSettingsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setCookiesFile: React.Dispatch<React.SetStateAction<string>>;
  setCookiesSource: React.Dispatch<React.SetStateAction<
    "none" | "file" | "browser"
  >>;
  setCookiesBrowser: React.Dispatch<React.SetStateAction<string>>;
  setRemoteComponents: React.Dispatch<React.SetStateAction<
    "none" | "ejs:github" | "ejs:npm"
  >>;
  setYtDlpPath: React.Dispatch<React.SetStateAction<string>>;
  setFfmpegPath: React.Dispatch<React.SetStateAction<string>>;
  setFfprobePath: React.Dispatch<React.SetStateAction<string>>;
  refreshThumbnailsForDir: (dir: string) => Promise<void>;
  runIntegrityCheck: (openModal?: boolean, overrideDir?: string) => Promise<void> | void;
  storageKeys: StorageKeys;
};

type PersistedState<TVideo> = {
  videos: TVideo[];
  downloadDir?: string | null;
  cookiesFile?: string | null;
  cookiesSource?: string | null;
  cookiesBrowser?: string | null;
  remoteComponents?: string | null;
  ytDlpPath?: string | null;
  ffmpegPath?: string | null;
  ffprobePath?: string | null;
};

export function useSettingsActions<TVideo>({
  videosRef,
  downloadDir,
  cookiesFile,
  cookiesSource,
  cookiesBrowser,
  remoteComponents,
  ytDlpPath,
  ffmpegPath,
  ffprobePath,
  setDownloadDir,
  setSettingsErrorMessage,
  setIntegrityMessage,
  setIsSettingsOpen,
  setCookiesFile,
  setCookiesSource,
  setCookiesBrowser,
  setRemoteComponents,
  setYtDlpPath,
  setFfmpegPath,
  setFfprobePath,
  refreshThumbnailsForDir,
  runIntegrityCheck,
  storageKeys,
}: UseSettingsActionsParams<TVideo>) {
  const persistSettings = useCallback(
    async (nextDownloadDir?: string) => {
      try {
        await invoke("save_state", {
          state: {
            videos: videosRef.current,
            downloadDir: (nextDownloadDir ?? downloadDir) || null,
            cookiesFile: cookiesFile || null,
            cookiesSource: cookiesSource || null,
            cookiesBrowser: cookiesBrowser || null,
            remoteComponents: remoteComponents || null,
            ytDlpPath: ytDlpPath || null,
            ffmpegPath: ffmpegPath || null,
            ffprobePath: ffprobePath || null,
          } satisfies PersistedState<TVideo>,
        });
      } catch {
        // ignore store errors to avoid blocking UI
      }
    },
    [
      videosRef,
      downloadDir,
      cookiesFile,
      cookiesSource,
      cookiesBrowser,
      remoteComponents,
      ytDlpPath,
      ffmpegPath,
      ffprobePath,
    ]
  );

  const pickDownloadDir = useCallback(async () => {
    setSettingsErrorMessage("");
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: "保存先フォルダを選択",
      });
      if (typeof selected === "string" && selected) {
        setDownloadDir(selected);
        localStorage.setItem(storageKeys.downloadDirKey, selected);
        await persistSettings(selected);
      }
    } catch {
      setSettingsErrorMessage(i18n.t('errors.downloadDirFailed'));
    }
  }, [setSettingsErrorMessage, setDownloadDir, storageKeys.downloadDirKey, persistSettings]);

  const relinkLibraryFolder = useCallback(async () => {
    setIntegrityMessage("");
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: "再リンク先のライブラリフォルダを選択",
      });
      if (typeof selected !== "string" || !selected) return;
      setDownloadDir(selected);
      localStorage.setItem(storageKeys.downloadDirKey, selected);
      await persistSettings(selected);
      await refreshThumbnailsForDir(selected);
      await runIntegrityCheck(true, selected);
    } catch {
      setIntegrityMessage(i18n.t('errors.relinkFailed'));
    }
  }, [
    setIntegrityMessage,
    setDownloadDir,
    storageKeys.downloadDirKey,
    persistSettings,
    refreshThumbnailsForDir,
    runIntegrityCheck,
  ]);

  const closeSettings = useCallback(async () => {
    await persistSettings();
    setIsSettingsOpen(false);
  }, [persistSettings, setIsSettingsOpen]);

  const updateRemoteComponents = useCallback(
    (value: "none" | "ejs:github" | "ejs:npm") => {
      setRemoteComponents(value);
      if (value === "none") {
        localStorage.removeItem(storageKeys.remoteComponentsKey);
      } else {
        localStorage.setItem(storageKeys.remoteComponentsKey, value);
      }
    },
    [setRemoteComponents, storageKeys.remoteComponentsKey]
  );

  const updateCookiesSource = useCallback(
    (value: "none" | "file" | "browser") => {
      setCookiesSource(value);
      if (value === "none") {
        localStorage.removeItem(storageKeys.cookiesSourceKey);
        return;
      }
      localStorage.setItem(storageKeys.cookiesSourceKey, value);
      if (value === "browser" && !cookiesBrowser) {
        const fallback = "chrome";
        setCookiesBrowser(fallback);
        localStorage.setItem(storageKeys.cookiesBrowserKey, fallback);
      }
    },
    [
      setCookiesSource,
      storageKeys.cookiesSourceKey,
      cookiesBrowser,
      setCookiesBrowser,
      storageKeys.cookiesBrowserKey,
    ]
  );

  const updateCookiesBrowser = useCallback(
    (value: string) => {
      setCookiesBrowser(value);
      if (!value) {
        localStorage.removeItem(storageKeys.cookiesBrowserKey);
      } else {
        localStorage.setItem(storageKeys.cookiesBrowserKey, value);
      }
    },
    [setCookiesBrowser, storageKeys.cookiesBrowserKey]
  );

  const pickCookiesFile = useCallback(async () => {
    setSettingsErrorMessage("");
    try {
      const selected = await openDialog({
        directory: false,
        multiple: false,
        title: "Cookieファイルを選択",
      });
      if (typeof selected === "string" && selected) {
        setCookiesFile(selected);
        localStorage.setItem(storageKeys.cookiesFileKey, selected);
        setCookiesSource("file");
        localStorage.setItem(storageKeys.cookiesSourceKey, "file");
      }
    } catch {
      setSettingsErrorMessage(i18n.t('errors.cookiesFileFailed'));
    }
  }, [
    setSettingsErrorMessage,
    setCookiesFile,
    setCookiesSource,
    storageKeys.cookiesFileKey,
    storageKeys.cookiesSourceKey,
  ]);

  const pickYtDlpPath = useCallback(async () => {
    setSettingsErrorMessage("");
    try {
      const selected = await openDialog({
        directory: false,
        multiple: false,
        title: "yt-dlpの実行ファイルを選択",
      });
      if (typeof selected === "string" && selected) {
        setYtDlpPath(selected);
        localStorage.setItem(storageKeys.ytDlpPathKey, selected);
      }
    } catch {
      setSettingsErrorMessage(i18n.t('errors.ytdlpPathFailed'));
    }
  }, [setSettingsErrorMessage, setYtDlpPath, storageKeys.ytDlpPathKey]);

  const pickFfmpegPath = useCallback(async () => {
    setSettingsErrorMessage("");
    try {
      const selected = await openDialog({
        directory: false,
        multiple: false,
        title: "ffmpegの実行ファイルを選択",
      });
      if (typeof selected === "string" && selected) {
        setFfmpegPath(selected);
        localStorage.setItem(storageKeys.ffmpegPathKey, selected);
      }
    } catch {
      setSettingsErrorMessage(i18n.t('errors.ffmpegPathFailed'));
    }
  }, [setSettingsErrorMessage, setFfmpegPath, storageKeys.ffmpegPathKey]);

  const pickFfprobePath = useCallback(async () => {
    setSettingsErrorMessage("");
    try {
      const selected = await openDialog({
        directory: false,
        multiple: false,
        title: "ffprobeの実行ファイルを選択",
      });
      if (typeof selected === "string" && selected) {
        setFfprobePath(selected);
        localStorage.setItem(storageKeys.ffprobePathKey, selected);
      }
    } catch {
      setSettingsErrorMessage(i18n.t('errors.ffprobePathFailed'));
    }
  }, [setSettingsErrorMessage, setFfprobePath, storageKeys.ffprobePathKey]);

  const clearCookiesFile = useCallback(() => {
    setCookiesFile("");
    localStorage.removeItem(storageKeys.cookiesFileKey);
  }, [setCookiesFile, storageKeys.cookiesFileKey]);

  const clearYtDlpPath = useCallback(() => {
    setYtDlpPath("");
    localStorage.removeItem(storageKeys.ytDlpPathKey);
  }, [setYtDlpPath, storageKeys.ytDlpPathKey]);

  const clearFfmpegPath = useCallback(() => {
    setFfmpegPath("");
    localStorage.removeItem(storageKeys.ffmpegPathKey);
  }, [setFfmpegPath, storageKeys.ffmpegPathKey]);

  const clearFfprobePath = useCallback(() => {
    setFfprobePath("");
    localStorage.removeItem(storageKeys.ffprobePathKey);
  }, [setFfprobePath, storageKeys.ffprobePathKey]);

  return {
    persistSettings,
    pickDownloadDir,
    relinkLibraryFolder,
    closeSettings,
    updateRemoteComponents,
    updateCookiesSource,
    updateCookiesBrowser,
    pickCookiesFile,
    pickYtDlpPath,
    pickFfmpegPath,
    pickFfprobePath,
    clearCookiesFile,
    clearYtDlpPath,
    clearFfmpegPath,
    clearFfprobePath,
  };
}
