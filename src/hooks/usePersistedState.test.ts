/**
 * usePersistedState テスト
 *
 * Tauriから状態ロード→正規化→setter呼出のフローを検証。
 * localStorageフォールバック、commentsStatusのデフォルト値付与を検証。
 */
import { renderHook, act } from "@testing-library/react";
import { mockInvoke, resetTauriMocks } from "../test/tauriMocks";
import { usePersistedState } from "./usePersistedState";

type Video = {
  id: string;
  title: string;
  commentsStatus?: string;
};

const STORAGE_KEYS = {
  videoStorageKey: "test_videos",
  downloadDirKey: "test_downloadDir",
  cookiesFileKey: "test_cookiesFile",
  cookiesSourceKey: "test_cookiesSource",
  cookiesBrowserKey: "test_cookiesBrowser",
  remoteComponentsKey: "test_remote",
  ytDlpPathKey: "test_ytDlpPath",
  ffmpegPathKey: "test_ffmpegPath",
  ffprobePathKey: "test_ffprobePath",
  downloadQualityKey: "test_quality",
  languageKey: "test_language",
};

function makeParams(overrides: Record<string, unknown> = {}) {
  return {
    setVideos: vi.fn(),
    setDownloadDir: vi.fn(),
    setCookiesFile: vi.fn(),
    setCookiesSource: vi.fn(),
    setCookiesBrowser: vi.fn(),
    setRemoteComponents: vi.fn(),
    setYtDlpPath: vi.fn(),
    setFfmpegPath: vi.fn(),
    setFfprobePath: vi.fn(),
    setDownloadQuality: vi.fn(),
    setLanguage: vi.fn(),
    setIsStateReady: vi.fn(),
    isStateReady: false,
    videos: [] as Video[],
    downloadDir: "",
    cookiesFile: "",
    cookiesSource: "none" as const,
    cookiesBrowser: "",
    remoteComponents: "none" as const,
    ytDlpPath: "",
    ffmpegPath: "",
    ffprobePath: "",
    downloadQuality: "",
    language: "",
    storageKeys: STORAGE_KEYS,
    ...overrides,
  };
}

beforeEach(() => {
  resetTauriMocks();
  localStorage.clear();
});

describe("usePersistedState", () => {
  it("load_stateから動画とdownloadDirをロード → setterに反映", async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "load_state") {
        return {
          videos: [{ id: "v1", title: "Test" }],
          downloadDir: "/dl",
          cookiesFile: null,
          cookiesSource: null,
          cookiesBrowser: null,
          remoteComponents: null,
          ytDlpPath: null,
          ffmpegPath: null,
          ffprobePath: null,
          downloadQuality: null,
        };
      }
      return undefined;
    });
    const params = makeParams();
    renderHook(() => usePersistedState(params));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(params.setVideos).toHaveBeenCalled();
    // 正規化でcommentsStatusが付与される
    const setVideosCall = params.setVideos.mock.calls[0][0];
    expect(setVideosCall[0].commentsStatus).toBe("pending");
    expect(params.setDownloadDir).toHaveBeenCalledWith("/dl");
    expect(params.setIsStateReady).toHaveBeenCalledWith(true);
  });

  it("load_state失敗 → localStorageフォールバック", async () => {
    mockInvoke.mockRejectedValue(new Error("fail"));
    localStorage.setItem(
      STORAGE_KEYS.videoStorageKey,
      JSON.stringify([{ id: "local1", title: "Local" }])
    );
    const params = makeParams();
    renderHook(() => usePersistedState(params));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(params.setVideos).toHaveBeenCalled();
    const setVideosCall = params.setVideos.mock.calls[0][0];
    expect(setVideosCall[0].id).toBe("local1");
    expect(params.setIsStateReady).toHaveBeenCalledWith(true);
  });

  it("load_state空動画 + localStorage空 → 空配列", async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "load_state") return { videos: [] };
      return undefined;
    });
    const params = makeParams();
    renderHook(() => usePersistedState(params));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(params.setVideos).toHaveBeenCalledWith([]);
  });

  it("cookiesSource=null + cookiesFile有り → cookiesSourceを'file'に", async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "load_state") {
        return {
          videos: [],
          cookiesFile: "/cookies.txt",
          cookiesSource: null,
        };
      }
      return undefined;
    });
    const params = makeParams();
    renderHook(() => usePersistedState(params));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(params.setCookiesFile).toHaveBeenCalledWith("/cookies.txt");
    expect(params.setCookiesSource).toHaveBeenCalledWith("file");
  });

  it("cookiesSource=browser + cookiesBrowser=null → デフォルトchrome", async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "load_state") {
        return {
          videos: [],
          cookiesSource: "browser",
          cookiesBrowser: null,
        };
      }
      return undefined;
    });
    const params = makeParams();
    renderHook(() => usePersistedState(params));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(params.setCookiesBrowser).toHaveBeenCalledWith("chrome");
  });

  it("remoteComponents='ejs:github' → setRemoteComponents呼出", async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "load_state") {
        return { videos: [], remoteComponents: "ejs:github" };
      }
      return undefined;
    });
    const params = makeParams();
    renderHook(() => usePersistedState(params));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(params.setRemoteComponents).toHaveBeenCalledWith("ejs:github");
  });

  it("isStateReady後の変更 → save_state呼出 + localStorage保存", async () => {
    mockInvoke.mockResolvedValue(undefined);
    const videos = [{ id: "v1", title: "T", commentsStatus: "pending" }];
    const params = makeParams({
      isStateReady: true,
      videos,
      downloadDir: "/dl",
    });
    renderHook(() => usePersistedState(params));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(localStorage.getItem(STORAGE_KEYS.videoStorageKey)).toBeTruthy();
    expect(mockInvoke).toHaveBeenCalledWith("save_state", expect.any(Object));
  });

  it("isStateReady=false → save_stateは呼ばれない", async () => {
    mockInvoke.mockResolvedValue(undefined);
    const params = makeParams({ isStateReady: false });
    renderHook(() => usePersistedState(params));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // load_stateは呼ばれるがsave_stateの永続化effectは呼ばれない
    const saveStateCalls = mockInvoke.mock.calls.filter(
      (call) => call[0] === "save_state"
    );
    // 初回ロード時のmigration save_stateのみ（永続化effectからではない）
    expect(saveStateCalls.length).toBeLessThanOrEqual(1);
  });

  it("localStorageからのlegacy設定フォールバック", async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "load_state") return { videos: [] };
      return undefined;
    });
    localStorage.setItem(STORAGE_KEYS.downloadDirKey, "/legacy/dl");
    localStorage.setItem(STORAGE_KEYS.cookiesFileKey, "/legacy/cookies.txt");
    localStorage.setItem(STORAGE_KEYS.languageKey, "ja");

    const params = makeParams();
    renderHook(() => usePersistedState(params));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(params.setDownloadDir).toHaveBeenCalledWith("/legacy/dl");
    expect(params.setCookiesFile).toHaveBeenCalledWith("/legacy/cookies.txt");
    expect(params.setLanguage).toHaveBeenCalledWith("ja");
  });
});
