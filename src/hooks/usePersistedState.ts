import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

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
  downloadQuality?: string | null;
  language?: string | null;
};

type StorageKeys = {
  videoStorageKey: string;
  downloadDirKey: string;
  cookiesFileKey: string;
  cookiesSourceKey: string;
  cookiesBrowserKey: string;
  remoteComponentsKey: string;
  ytDlpPathKey: string;
  ffmpegPathKey: string;
  ffprobePathKey: string;
  downloadQualityKey: string;
  languageKey: string;
};

type UsePersistedStateParams<TVideo> = {
  setVideos: React.Dispatch<React.SetStateAction<TVideo[]>>;
  setDownloadDir: React.Dispatch<React.SetStateAction<string>>;
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
  setDownloadQuality: React.Dispatch<React.SetStateAction<string>>;
  setLanguage: React.Dispatch<React.SetStateAction<string>>;
  setIsStateReady: React.Dispatch<React.SetStateAction<boolean>>;
  isStateReady: boolean;
  videos: TVideo[];
  downloadDir: string;
  cookiesFile: string;
  cookiesSource: "none" | "file" | "browser";
  cookiesBrowser: string;
  remoteComponents: "none" | "ejs:github" | "ejs:npm";
  ytDlpPath: string;
  ffmpegPath: string;
  ffprobePath: string;
  downloadQuality: string;
  language: string;
  storageKeys: StorageKeys;
};

export function usePersistedState<TVideo>({
  setVideos,
  setDownloadDir,
  setCookiesFile,
  setCookiesSource,
  setCookiesBrowser,
  setRemoteComponents,
  setYtDlpPath,
  setFfmpegPath,
  setFfprobePath,
  setDownloadQuality,
  setLanguage,
  setIsStateReady,
  isStateReady,
  videos,
  downloadDir,
  cookiesFile,
  cookiesSource,
  cookiesBrowser,
  remoteComponents,
  ytDlpPath,
  ffmpegPath,
  ffprobePath,
  downloadQuality,
  language,
  storageKeys,
}: UsePersistedStateParams<TVideo>) {
  useEffect(() => {
    const load = async () => {
      let loadedVideos: TVideo[] = [];
      let loadedDownloadDir: string | null = null;
      let loadedCookiesFile: string | null = null;
      let loadedCookiesSource: string | null = null;
      let loadedCookiesBrowser: string | null = null;
      let loadedRemote: string | null = null;
      let loadedYtDlpPath: string | null = null;
      let loadedFfmpegPath: string | null = null;
      let loadedFfprobePath: string | null = null;
      let loadedDownloadQuality: string | null = null;
      let loadedLanguage: string | null = null;
      try {
        const state = await invoke<PersistedState<TVideo>>("load_state");
        if (Array.isArray(state?.videos) && state.videos.length > 0) {
          loadedVideos = state.videos;
        }
        loadedDownloadDir = state?.downloadDir ?? null;
        loadedCookiesFile = state?.cookiesFile ?? null;
        loadedCookiesSource = state?.cookiesSource ?? null;
        loadedCookiesBrowser = state?.cookiesBrowser ?? null;
        loadedRemote = state?.remoteComponents ?? null;
        loadedYtDlpPath = state?.ytDlpPath ?? null;
        loadedFfmpegPath = state?.ffmpegPath ?? null;
        loadedFfprobePath = state?.ffprobePath ?? null;
        loadedDownloadQuality = state?.downloadQuality ?? null;
        loadedLanguage = state?.language ?? null;
      } catch {
        loadedVideos = [];
      }

      if (loadedVideos.length === 0) {
        const raw = localStorage.getItem(storageKeys.videoStorageKey);
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as TVideo[];
            if (Array.isArray(parsed)) {
              loadedVideos = parsed;
            }
          } catch {
            loadedVideos = [];
          }
        }
      }

      const normalizedVideos = loadedVideos.map((item) => ({
        ...item,
        commentsStatus: (item as { commentsStatus?: string }).commentsStatus ??
          "pending",
      }));
      setVideos(normalizedVideos);

      if (!loadedDownloadDir) {
        const legacyDir = localStorage.getItem(storageKeys.downloadDirKey);
        if (legacyDir) loadedDownloadDir = legacyDir;
      }
      if (!loadedCookiesFile) {
        const legacyCookies = localStorage.getItem(storageKeys.cookiesFileKey);
        if (legacyCookies) loadedCookiesFile = legacyCookies;
      }
      if (!loadedCookiesSource) {
        const legacySource = localStorage.getItem(storageKeys.cookiesSourceKey);
        if (legacySource) loadedCookiesSource = legacySource;
      }
      if (!loadedCookiesBrowser) {
        const legacyBrowser = localStorage.getItem(storageKeys.cookiesBrowserKey);
        if (legacyBrowser) loadedCookiesBrowser = legacyBrowser;
      }
      if (!loadedRemote) {
        const legacyRemote = localStorage.getItem(storageKeys.remoteComponentsKey);
        if (legacyRemote) loadedRemote = legacyRemote;
      }
      if (!loadedYtDlpPath) {
        const legacyYtDlp = localStorage.getItem(storageKeys.ytDlpPathKey);
        if (legacyYtDlp) loadedYtDlpPath = legacyYtDlp;
      }
      if (!loadedFfmpegPath) {
        const legacyFfmpeg = localStorage.getItem(storageKeys.ffmpegPathKey);
        if (legacyFfmpeg) loadedFfmpegPath = legacyFfmpeg;
      }
      if (!loadedFfprobePath) {
        const legacyFfprobe = localStorage.getItem(storageKeys.ffprobePathKey);
        if (legacyFfprobe) loadedFfprobePath = legacyFfprobe;
      }
      if (!loadedLanguage) {
        const legacyLanguage = localStorage.getItem(storageKeys.languageKey);
        if (legacyLanguage) loadedLanguage = legacyLanguage;
      }

      if (loadedDownloadDir) setDownloadDir(loadedDownloadDir);
      if (loadedCookiesFile) setCookiesFile(loadedCookiesFile);
      if (!loadedCookiesSource && loadedCookiesFile) {
        loadedCookiesSource = "file";
      }
      if (loadedCookiesSource === "file" || loadedCookiesSource === "browser") {
        setCookiesSource(loadedCookiesSource as "file" | "browser");
      }
      if (loadedCookiesBrowser) {
        setCookiesBrowser(loadedCookiesBrowser);
      } else if (loadedCookiesSource === "browser") {
        setCookiesBrowser("chrome");
      }
      if (loadedRemote === "ejs:github" || loadedRemote === "ejs:npm") {
        setRemoteComponents(loadedRemote);
      }
      if (loadedYtDlpPath) setYtDlpPath(loadedYtDlpPath);
      if (loadedFfmpegPath) setFfmpegPath(loadedFfmpegPath);
      if (loadedFfprobePath) setFfprobePath(loadedFfprobePath);
      if (loadedDownloadQuality) setDownloadQuality(loadedDownloadQuality);
      if (loadedLanguage) setLanguage(loadedLanguage);

      try {
        await invoke("save_state", {
          state: {
            videos: normalizedVideos,
            downloadDir: loadedDownloadDir,
            cookiesFile: loadedCookiesFile,
            cookiesSource: loadedCookiesSource,
            cookiesBrowser: loadedCookiesBrowser,
            remoteComponents: loadedRemote,
            ytDlpPath: loadedYtDlpPath,
            ffmpegPath: loadedFfmpegPath,
            ffprobePath: loadedFfprobePath,
            downloadQuality: loadedDownloadQuality,
            language: loadedLanguage,
          } satisfies PersistedState<TVideo>,
        });
      } catch {
        // ignore migration errors
      }

      setIsStateReady(true);
    };

    void load();
  }, [
    setVideos,
    setDownloadDir,
    setCookiesFile,
    setCookiesSource,
    setCookiesBrowser,
    setRemoteComponents,
    setYtDlpPath,
    setFfmpegPath,
    setFfprobePath,
    setDownloadQuality,
    setLanguage,
    setIsStateReady,
    storageKeys,
  ]);

  useEffect(() => {
    if (!isStateReady) return;
    localStorage.setItem(storageKeys.videoStorageKey, JSON.stringify(videos));
    const persist = async () => {
      try {
        await invoke("save_state", {
          state: {
            videos,
            downloadDir: downloadDir || null,
            cookiesFile: cookiesFile || null,
            cookiesSource: cookiesSource || null,
            cookiesBrowser: cookiesBrowser || null,
            remoteComponents: remoteComponents || null,
            ytDlpPath: ytDlpPath || null,
            ffmpegPath: ffmpegPath || null,
            ffprobePath: ffprobePath || null,
            downloadQuality: downloadQuality || null,
            language: language || null,
          } satisfies PersistedState<TVideo>,
        });
      } catch {
        // ignore store errors to avoid blocking UI
      }
    };
    void persist();
  }, [
    videos,
    downloadDir,
    cookiesFile,
    cookiesSource,
    cookiesBrowser,
    remoteComponents,
    ytDlpPath,
    ffmpegPath,
    ffprobePath,
    downloadQuality,
    language,
    isStateReady,
    storageKeys.videoStorageKey,
  ]);
}
