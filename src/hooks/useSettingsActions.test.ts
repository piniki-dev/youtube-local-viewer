/**
 * useSettingsActions テスト
 *
 * localStorage連携コールバック（updateCookiesSource, updateRemoteComponents,
 * updateCookiesBrowser, clearCookiesFile, clearYtDlpPath, clearFfmpegPath,
 * clearFfprobePath, closeSettings, persistSettings）を検証。
 * ダイアログ系（pickDownloadDir等）は plugin-dialog モックが必要なためスキップし、
 * 純粋なstate+localStorage操作のみテスト。
 */
import { renderHook, act } from "@testing-library/react";
import { mockInvoke, resetTauriMocks } from "../test/tauriMocks";
import { useSettingsActions } from "./useSettingsActions";

// plugin-dialog と plugin-opener のモック
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openPath: vi.fn(),
  revealItemInDir: vi.fn(),
  openUrl: vi.fn(),
}));

const STORAGE_KEYS = {
  downloadDirKey: "test_downloadDir",
  cookiesFileKey: "test_cookiesFile",
  cookiesSourceKey: "test_cookiesSource",
  cookiesBrowserKey: "test_cookiesBrowser",
  remoteComponentsKey: "test_remoteComponents",
  ytDlpPathKey: "test_ytDlpPath",
  ffmpegPathKey: "test_ffmpegPath",
  ffprobePathKey: "test_ffprobePath",
};

function makeSetters() {
  return {
    setDownloadDir: vi.fn(),
    setSettingsErrorMessage: vi.fn(),
    setIntegrityMessage: vi.fn(),
    setIsSettingsOpen: vi.fn(),
    setCookiesFile: vi.fn(),
    setCookiesSource: vi.fn(),
    setCookiesBrowser: vi.fn(),
    setRemoteComponents: vi.fn(),
    setYtDlpPath: vi.fn(),
    setFfmpegPath: vi.fn(),
    setFfprobePath: vi.fn(),
    refreshThumbnailsForDir: vi.fn().mockResolvedValue(undefined),
    runIntegrityCheck: vi.fn(),
  };
}

function makeParams(overrides: Record<string, unknown> = {}) {
  const setters = makeSetters();
  return {
    params: {
      videosRef: { current: [] as unknown[] },
      downloadDir: "/downloads",
      cookiesFile: "",
      cookiesSource: "none" as const,
      cookiesBrowser: "",
      remoteComponents: "none" as const,
      ytDlpPath: "",
      ffmpegPath: "",
      ffprobePath: "",
      ...setters,
      storageKeys: STORAGE_KEYS,
      ...overrides,
    },
    setters,
  };
}

beforeEach(() => {
  resetTauriMocks();
  // localStorage全クリア
  Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
});

describe("useSettingsActions", () => {
  // ── updateCookiesSource ──

  it("updateCookiesSource('file') → localStorage保存", () => {
    const { params, setters } = makeParams();
    const { result } = renderHook(() => useSettingsActions(params));

    act(() => {
      result.current.updateCookiesSource("file");
    });

    expect(setters.setCookiesSource).toHaveBeenCalledWith("file");
    expect(localStorage.getItem(STORAGE_KEYS.cookiesSourceKey)).toBe("file");
  });

  it("updateCookiesSource('none') → localStorage削除", () => {
    localStorage.setItem(STORAGE_KEYS.cookiesSourceKey, "file");
    const { params, setters } = makeParams();
    const { result } = renderHook(() => useSettingsActions(params));

    act(() => {
      result.current.updateCookiesSource("none");
    });

    expect(setters.setCookiesSource).toHaveBeenCalledWith("none");
    expect(localStorage.getItem(STORAGE_KEYS.cookiesSourceKey)).toBeNull();
  });

  it("updateCookiesSource('browser') + cookiesBrowser空 → chromeをフォールバック", () => {
    const { params, setters } = makeParams({ cookiesBrowser: "" });
    const { result } = renderHook(() => useSettingsActions(params));

    act(() => {
      result.current.updateCookiesSource("browser");
    });

    expect(setters.setCookiesBrowser).toHaveBeenCalledWith("chrome");
    expect(localStorage.getItem(STORAGE_KEYS.cookiesBrowserKey)).toBe("chrome");
  });

  it("updateCookiesSource('browser') + cookiesBrowser設定済み → フォールバックしない", () => {
    const { params, setters } = makeParams({ cookiesBrowser: "firefox" });
    const { result } = renderHook(() => useSettingsActions(params));

    act(() => {
      result.current.updateCookiesSource("browser");
    });

    expect(setters.setCookiesBrowser).not.toHaveBeenCalled();
  });

  // ── updateRemoteComponents ──

  it("updateRemoteComponents('ejs:github') → localStorage保存", () => {
    const { params, setters } = makeParams();
    const { result } = renderHook(() => useSettingsActions(params));

    act(() => {
      result.current.updateRemoteComponents("ejs:github");
    });

    expect(setters.setRemoteComponents).toHaveBeenCalledWith("ejs:github");
    expect(localStorage.getItem(STORAGE_KEYS.remoteComponentsKey)).toBe(
      "ejs:github"
    );
  });

  it("updateRemoteComponents('none') → localStorage削除", () => {
    localStorage.setItem(STORAGE_KEYS.remoteComponentsKey, "ejs:npm");
    const { params } = makeParams();
    const { result } = renderHook(() => useSettingsActions(params));

    act(() => {
      result.current.updateRemoteComponents("none");
    });

    expect(localStorage.getItem(STORAGE_KEYS.remoteComponentsKey)).toBeNull();
  });

  // ── updateCookiesBrowser ──

  it("updateCookiesBrowser('firefox') → localStorage保存", () => {
    const { params, setters } = makeParams();
    const { result } = renderHook(() => useSettingsActions(params));

    act(() => {
      result.current.updateCookiesBrowser("firefox");
    });

    expect(setters.setCookiesBrowser).toHaveBeenCalledWith("firefox");
    expect(localStorage.getItem(STORAGE_KEYS.cookiesBrowserKey)).toBe(
      "firefox"
    );
  });

  it("updateCookiesBrowser('') → localStorage削除", () => {
    localStorage.setItem(STORAGE_KEYS.cookiesBrowserKey, "chrome");
    const { params } = makeParams();
    const { result } = renderHook(() => useSettingsActions(params));

    act(() => {
      result.current.updateCookiesBrowser("");
    });

    expect(localStorage.getItem(STORAGE_KEYS.cookiesBrowserKey)).toBeNull();
  });

  // ── clearCookiesFile ──

  it("clearCookiesFile → setter空 + localStorage削除", () => {
    localStorage.setItem(STORAGE_KEYS.cookiesFileKey, "/path/to/cookies.txt");
    const { params, setters } = makeParams();
    const { result } = renderHook(() => useSettingsActions(params));

    act(() => {
      result.current.clearCookiesFile();
    });

    expect(setters.setCookiesFile).toHaveBeenCalledWith("");
    expect(localStorage.getItem(STORAGE_KEYS.cookiesFileKey)).toBeNull();
  });

  // ── clearYtDlpPath ──

  it("clearYtDlpPath → setter空 + localStorage削除", () => {
    localStorage.setItem(STORAGE_KEYS.ytDlpPathKey, "/usr/bin/yt-dlp");
    const { params, setters } = makeParams();
    const { result } = renderHook(() => useSettingsActions(params));

    act(() => {
      result.current.clearYtDlpPath();
    });

    expect(setters.setYtDlpPath).toHaveBeenCalledWith("");
    expect(localStorage.getItem(STORAGE_KEYS.ytDlpPathKey)).toBeNull();
  });

  // ── clearFfmpegPath ──

  it("clearFfmpegPath → setter空 + localStorage削除", () => {
    localStorage.setItem(STORAGE_KEYS.ffmpegPathKey, "/usr/bin/ffmpeg");
    const { params, setters } = makeParams();
    const { result } = renderHook(() => useSettingsActions(params));

    act(() => {
      result.current.clearFfmpegPath();
    });

    expect(setters.setFfmpegPath).toHaveBeenCalledWith("");
    expect(localStorage.getItem(STORAGE_KEYS.ffmpegPathKey)).toBeNull();
  });

  // ── clearFfprobePath ──

  it("clearFfprobePath → setter空 + localStorage削除", () => {
    localStorage.setItem(STORAGE_KEYS.ffprobePathKey, "/usr/bin/ffprobe");
    const { params, setters } = makeParams();
    const { result } = renderHook(() => useSettingsActions(params));

    act(() => {
      result.current.clearFfprobePath();
    });

    expect(setters.setFfprobePath).toHaveBeenCalledWith("");
    expect(localStorage.getItem(STORAGE_KEYS.ffprobePathKey)).toBeNull();
  });

  // ── persistSettings ──

  it("persistSettings → save_state invoke", async () => {
    mockInvoke.mockResolvedValue(undefined);
    const { params } = makeParams();
    const { result } = renderHook(() => useSettingsActions(params));

    await act(async () => {
      await result.current.persistSettings();
    });

    expect(mockInvoke).toHaveBeenCalledWith("save_state", {
      state: expect.objectContaining({
        videos: [],
        downloadDir: "/downloads",
        cookiesFile: null,
        cookiesSource: "none",
      }),
    });
  });

  it("persistSettings(nextDir) → downloadDirが上書きされる", async () => {
    mockInvoke.mockResolvedValue(undefined);
    const { params } = makeParams();
    const { result } = renderHook(() => useSettingsActions(params));

    await act(async () => {
      await result.current.persistSettings("/new/dir");
    });

    expect(mockInvoke).toHaveBeenCalledWith("save_state", {
      state: expect.objectContaining({
        downloadDir: "/new/dir",
      }),
    });
  });

  // ── closeSettings ──

  it("closeSettings → persistSettings + setIsSettingsOpen(false)", async () => {
    mockInvoke.mockResolvedValue(undefined);
    const { params, setters } = makeParams();
    const { result } = renderHook(() => useSettingsActions(params));

    await act(async () => {
      await result.current.closeSettings();
    });

    expect(mockInvoke).toHaveBeenCalledWith("save_state", expect.anything());
    expect(setters.setIsSettingsOpen).toHaveBeenCalledWith(false);
  });
});
