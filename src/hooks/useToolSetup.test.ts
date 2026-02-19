/**
 * useToolSetup テスト
 *
 * missingTools導出、ダウンロード状態遷移、dismiss/close制御を検証。
 */
import { renderHook, act } from "@testing-library/react";
import { mockInvoke, emitEvent, resetTauriMocks } from "../test/tauriMocks";
import { useToolSetup } from "./useToolSetup";

type ToolingCheckResult = {
  ytDlp: { ok: boolean; path: string };
  ffmpeg: { ok: boolean; path: string };
  ffprobe: { ok: boolean; path: string };
};

const ALL_OK: ToolingCheckResult = {
  ytDlp: { ok: true, path: "/bin/yt-dlp" },
  ffmpeg: { ok: true, path: "/bin/ffmpeg" },
  ffprobe: { ok: true, path: "/bin/ffprobe" },
};

const YT_DLP_MISSING: ToolingCheckResult = {
  ytDlp: { ok: false, path: "" },
  ffmpeg: { ok: true, path: "/bin/ffmpeg" },
  ffprobe: { ok: true, path: "/bin/ffprobe" },
};

const ALL_MISSING: ToolingCheckResult = {
  ytDlp: { ok: false, path: "" },
  ffmpeg: { ok: false, path: "" },
  ffprobe: { ok: false, path: "" },
};

const refreshTooling = vi.fn();

function makeParams(overrides: Record<string, unknown> = {}) {
  return {
    toolingStatus: ALL_OK as ToolingCheckResult | null,
    isStateReady: true,
    refreshTooling,
    ...overrides,
  };
}

beforeEach(() => {
  resetTauriMocks();
  refreshTooling.mockClear();
});

describe("useToolSetup", () => {
  // ── missingTools ──

  it("全ツールOK → missingTools空", () => {
    const { result } = renderHook(() => useToolSetup(makeParams()));
    expect(result.current.missingTools).toEqual([]);
  });

  it("yt-dlpのみ欠損 → missingToolsに1件", () => {
    const { result } = renderHook(() =>
      useToolSetup(makeParams({ toolingStatus: YT_DLP_MISSING }))
    );
    expect(result.current.missingTools).toHaveLength(1);
    expect(result.current.missingTools[0].name).toBe("yt-dlp");
  });

  it("全ツール欠損 → missingToolsに3件", () => {
    const { result } = renderHook(() =>
      useToolSetup(makeParams({ toolingStatus: ALL_MISSING }))
    );
    expect(result.current.missingTools).toHaveLength(3);
  });

  it("toolingStatus null → missingTools空", () => {
    const { result } = renderHook(() =>
      useToolSetup(makeParams({ toolingStatus: null }))
    );
    expect(result.current.missingTools).toEqual([]);
  });

  // ── isSetupOpen ──

  it("ツール欠損 + isStateReady → isSetupOpen=true", async () => {
    const { result } = renderHook(() =>
      useToolSetup(makeParams({ toolingStatus: ALL_MISSING }))
    );
    // useEffectが走った後
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(result.current.isSetupOpen).toBe(true);
  });

  it("全ツールOK → isSetupOpen=false", async () => {
    const { result } = renderHook(() =>
      useToolSetup(makeParams({ toolingStatus: ALL_OK }))
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(result.current.isSetupOpen).toBe(false);
  });

  it("isStateReady=false → isSetupOpen=false（欠損があっても）", async () => {
    const { result } = renderHook(() =>
      useToolSetup(makeParams({ toolingStatus: ALL_MISSING, isStateReady: false }))
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(result.current.isSetupOpen).toBe(false);
  });

  // ── skipSetup ──

  it("skipSetup → isSetupOpen=false", async () => {
    const { result } = renderHook(() =>
      useToolSetup(makeParams({ toolingStatus: ALL_MISSING }))
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(result.current.isSetupOpen).toBe(true);

    act(() => {
      result.current.skipSetup();
    });
    expect(result.current.isSetupOpen).toBe(false);
  });

  // ── startDownload ──

  it("startDownload → invoke('download_tools')呼出", async () => {
    mockInvoke.mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useToolSetup(makeParams({ toolingStatus: ALL_MISSING }))
    );

    await act(async () => {
      await result.current.startDownload();
    });

    expect(mockInvoke).toHaveBeenCalledWith("download_tools", {
      tools: ["yt-dlp", "ffmpeg"],
    });
    expect(refreshTooling).toHaveBeenCalled();
    expect(result.current.downloadState.status).toBe("done");
  });

  it("startDownload失敗 → status=error", async () => {
    mockInvoke.mockRejectedValue(new Error("download failed"));
    const { result } = renderHook(() =>
      useToolSetup(makeParams({ toolingStatus: ALL_MISSING }))
    );

    await act(async () => {
      await result.current.startDownload();
    });

    expect(result.current.downloadState.status).toBe("error");
    expect(result.current.downloadState.error).toContain("download failed");
  });

  it("全ツールOK → startDownloadは何もしない", async () => {
    mockInvoke.mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useToolSetup(makeParams({ toolingStatus: ALL_OK }))
    );

    await act(async () => {
      await result.current.startDownload();
    });

    expect(mockInvoke).not.toHaveBeenCalledWith(
      "download_tools",
      expect.anything()
    );
  });

  // ── tool-download-progress event ──

  it("tool-download-progressイベント → downloadState更新", async () => {
    const { result } = renderHook(() =>
      useToolSetup(makeParams({ toolingStatus: ALL_MISSING }))
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    act(() => {
      emitEvent("tool-download-progress", {
        tool: "yt-dlp",
        status: "downloading",
        bytesDownloaded: 500,
        bytesTotal: 1000,
        message: "Downloading yt-dlp...",
      });
    });

    expect(result.current.downloadState.active).toBe(true);
    expect(result.current.downloadState.currentTool).toBe("yt-dlp");
    expect(result.current.downloadState.bytesDownloaded).toBe(500);
    expect(result.current.downloadState.bytesTotal).toBe(1000);
  });

  // ── closeSetup ──

  it("closeSetup（DL中でない）→ isSetupOpen=false", async () => {
    const { result } = renderHook(() =>
      useToolSetup(makeParams({ toolingStatus: ALL_MISSING }))
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(result.current.isSetupOpen).toBe(true);

    act(() => {
      result.current.closeSetup();
    });
    expect(result.current.isSetupOpen).toBe(false);
  });
});
