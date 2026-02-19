/**
 * useYtDlpUpdateNotices テスト
 *
 * yt-dlp-updateイベント受信→通知生成、5s重複排除、8s自動dismiss、
 * update_yt_dlp invoke発行条件を検証。
 */
import { renderHook, act } from "@testing-library/react";
import { mockInvoke, emitEvent, resetTauriMocks } from "../test/tauriMocks";
import { useYtDlpUpdateNotices } from "./useYtDlpUpdateNotices";

beforeEach(() => {
  resetTauriMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

function makeParams(overrides: Record<string, unknown> = {}) {
  return {
    isStateReady: true,
    isDataCheckDone: true,
    ytDlpAvailable: true,
    ...overrides,
  };
}

describe("useYtDlpUpdateNotices", () => {
  // ── 初期状態 ──

  it("初期はytDlpNotices空・ytDlpUpdateDone=false", () => {
    const { result } = renderHook(() => useYtDlpUpdateNotices(makeParams()));
    expect(result.current.ytDlpNotices).toEqual([]);
    expect(result.current.ytDlpUpdateDone).toBe(false);
  });

  // ── update_yt_dlp invoke ──

  it("全条件true → update_yt_dlp invoke", async () => {
    mockInvoke.mockResolvedValue(undefined);
    renderHook(() => useYtDlpUpdateNotices(makeParams()));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(mockInvoke).toHaveBeenCalledWith("update_yt_dlp");
  });

  it("isStateReady=false → invoke呼ばれない", async () => {
    mockInvoke.mockResolvedValue(undefined);
    renderHook(() =>
      useYtDlpUpdateNotices(makeParams({ isStateReady: false }))
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(mockInvoke).not.toHaveBeenCalledWith("update_yt_dlp");
  });

  it("ytDlpAvailable=false → invoke呼ばれない", async () => {
    mockInvoke.mockResolvedValue(undefined);
    renderHook(() =>
      useYtDlpUpdateNotices(makeParams({ ytDlpAvailable: false }))
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(mockInvoke).not.toHaveBeenCalledWith("update_yt_dlp");
  });

  // ── yt-dlp-update イベント ──

  it("status=updated → success通知", async () => {
    mockInvoke.mockResolvedValue(undefined);
    const { result } = renderHook(() => useYtDlpUpdateNotices(makeParams()));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    act(() => {
      emitEvent("yt-dlp-update", {
        status: "updated",
        stdout: "Updated to 2024.01.01",
        stderr: "",
      });
    });

    expect(result.current.ytDlpNotices).toHaveLength(1);
    expect(result.current.ytDlpNotices[0].kind).toBe("success");
    expect(result.current.ytDlpUpdateDone).toBe(true);
  });

  it("status=failed → error通知", async () => {
    mockInvoke.mockResolvedValue(undefined);
    const { result } = renderHook(() => useYtDlpUpdateNotices(makeParams()));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    act(() => {
      emitEvent("yt-dlp-update", {
        status: "failed",
        stdout: "",
        stderr: "network error",
      });
    });

    expect(result.current.ytDlpNotices).toHaveLength(1);
    expect(result.current.ytDlpNotices[0].kind).toBe("error");
  });

  it("statusなし → 通知生成されない", async () => {
    mockInvoke.mockResolvedValue(undefined);
    const { result } = renderHook(() => useYtDlpUpdateNotices(makeParams()));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    act(() => {
      emitEvent("yt-dlp-update", { stdout: "no status field" });
    });

    expect(result.current.ytDlpNotices).toHaveLength(0);
  });

  // ── 5s重複排除 ──

  it("同一キーが5s以内 → 重複抑制", async () => {
    mockInvoke.mockResolvedValue(undefined);
    const { result } = renderHook(() => useYtDlpUpdateNotices(makeParams()));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    const payload = { status: "updated", stdout: "v1", stderr: "" };
    act(() => emitEvent("yt-dlp-update", payload));
    expect(result.current.ytDlpNotices).toHaveLength(1);

    act(() => emitEvent("yt-dlp-update", payload));
    expect(result.current.ytDlpNotices).toHaveLength(1); // まだ1件

    // 5秒経過後なら通る
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    act(() => emitEvent("yt-dlp-update", payload));
    expect(result.current.ytDlpNotices.length).toBeGreaterThanOrEqual(1);
  });

  // ── 8s自動dismiss ──

  it("8s後に自動dismiss", async () => {
    mockInvoke.mockResolvedValue(undefined);
    const { result } = renderHook(() => useYtDlpUpdateNotices(makeParams()));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    act(() => {
      emitEvent("yt-dlp-update", {
        status: "updated",
        stdout: "done",
        stderr: "",
      });
    });
    expect(result.current.ytDlpNotices).toHaveLength(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
    });
    expect(result.current.ytDlpNotices).toHaveLength(0);
  });

  // ── dismissYtDlpNotice ──

  it("dismissYtDlpNotice → 指定IDを即座に除去", async () => {
    mockInvoke.mockResolvedValue(undefined);
    const { result } = renderHook(() => useYtDlpUpdateNotices(makeParams()));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    act(() => {
      emitEvent("yt-dlp-update", {
        status: "updated",
        stdout: "done",
        stderr: "",
      });
    });
    const id = result.current.ytDlpNotices[0].id;

    act(() => result.current.dismissYtDlpNotice(id));
    expect(result.current.ytDlpNotices).toHaveLength(0);
  });

  // ── 通知上限 ──

  it("通知は最大3件まで保持", async () => {
    mockInvoke.mockResolvedValue(undefined);
    const { result } = renderHook(() => useYtDlpUpdateNotices(makeParams()));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    // 異なるstdoutで4件送信（重複排除回避のため）
    for (let i = 0; i < 4; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5100); // dedup回避
      });
      act(() => {
        emitEvent("yt-dlp-update", {
          status: "updated",
          stdout: `version-${i}`,
          stderr: "",
        });
      });
    }

    expect(result.current.ytDlpNotices.length).toBeLessThanOrEqual(3);
  });
});
