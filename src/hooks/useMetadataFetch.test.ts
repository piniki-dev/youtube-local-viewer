/**
 * B-2. useMetadataFetch テスト
 *
 * metadata-finished イベント処理、applyMetadataUpdate、
 * scheduleBackgroundMetadataFetch、retryMetadataFetch を検証。
 */
import { renderHook, act } from "@testing-library/react";
import { mockInvoke, emitEvent, resetTauriMocks } from "../test/tauriMocks";
import { useMetadataFetch } from "./useMetadataFetch";
import { buildMetadataFields, buildThumbnailCandidates } from "../utils/metadataHelpers";

type Video = {
  id: string;
  title: string;
  channel: string;
  sourceUrl: string;
  thumbnail?: string;
  commentsStatus: "pending" | "downloading" | "downloaded" | "failed" | "unavailable";
  metadataFetched?: boolean;
  isLive?: boolean;
  liveStatus?: string;
  wasLive?: boolean;
  isPrivate?: boolean;
  isDeleted?: boolean;
} & Record<string, unknown>;

const makeVideo = (overrides: Partial<Video> = {}): Video => ({
  id: "v1",
  title: "Test Video",
  channel: "Test Channel",
  sourceUrl: "https://www.youtube.com/watch?v=v1",
  commentsStatus: "pending",
  metadataFetched: false,
  ...overrides,
});

function defaultParams(overrides: Record<string, unknown> = {}) {
  return {
    videosRef: { current: [makeVideo()] as Video[] },
    downloadDirRef: { current: "/output" },
    cookiesFile: "",
    cookiesSource: "none" as const,
    cookiesBrowser: "",
    remoteComponents: "none" as const,
    ytDlpPath: "",
    ffmpegPath: "",
    addDownloadErrorItem: vi.fn(),
    addFloatingNotice: vi.fn(),
    buildMetadataFields: buildMetadataFields as any,
    buildThumbnailCandidates: buildThumbnailCandidates as any,
    resolveThumbnailPath: vi.fn().mockResolvedValue(undefined),
    setVideos: vi.fn(),
    isStateReady: false,
    isDataCheckDone: false,
    ytDlpUpdateDone: false,
    integritySummaryTotal: 0,
    integrityIssuesLength: 0,
    ...overrides,
  };
}

beforeEach(() => {
  resetTauriMocks();
  mockInvoke.mockResolvedValue(undefined);
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

// ============================================================
// B-2-1. metadata-finished イベント
// ============================================================
describe("useMetadataFetch — metadata-finished", () => {
  it("成功(通常動画) → applyMetadataUpdate呼出, metadataFetched=true", async () => {
    const params = defaultParams();
    renderHook(() => useMetadataFetch(params));

    // listenが呼ばれるのを待つ
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    act(() => {
      emitEvent("metadata-finished", {
        id: "v1",
        success: true,
        stdout: "",
        stderr: "",
        metadata: {
          title: "Updated Title",
          channel: "Updated Channel",
          availability: "public",
        },
        hasLiveChat: null,
        isPrivate: false,
      });
    });

    // scheduleMetadataFlush のタイマーを進める
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    // setVideos が呼ばれてメタデータが適用される
    expect(params.setVideos).toHaveBeenCalled();
  });

  it("非公開動画検出 → addFloatingNotice(kind:'error', title:privateVideoDetected)", async () => {
    const params = defaultParams();
    renderHook(() => useMetadataFetch(params));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    act(() => {
      emitEvent("metadata-finished", {
        id: "v1",
        success: true,
        stdout: "",
        stderr: "",
        metadata: { title: "Private Video", channel: "Ch" },
        isPrivate: true,
      });
    });

    expect(params.addFloatingNotice).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "error" })
    );
  });

  it("削除済み動画検出 → addFloatingNotice(kind:'error', title:deletedVideoDetected)", async () => {
    const params = defaultParams();
    renderHook(() => useMetadataFetch(params));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    act(() => {
      emitEvent("metadata-finished", {
        id: "v1",
        success: true,
        stdout: "",
        stderr: "",
        metadata: { title: "Deleted Video", channel: "Ch" },
        isDeleted: true,
      });
    });

    expect(params.addFloatingNotice).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "error" })
    );
  });

  it("ライブ配信検出 → addFloatingNotice(kind:'info')", async () => {
    const params = defaultParams();
    renderHook(() => useMetadataFetch(params));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    act(() => {
      emitEvent("metadata-finished", {
        id: "v1",
        success: true,
        stdout: "",
        stderr: "",
        metadata: { isLive: true, title: "Live", channel: "Ch" },
      });
    });

    expect(params.addFloatingNotice).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "info" })
    );
  });

  it("配信予定検出 → addFloatingNotice(kind:'info')", async () => {
    const params = defaultParams();
    renderHook(() => useMetadataFetch(params));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    act(() => {
      emitEvent("metadata-finished", {
        id: "v1",
        success: true,
        stdout: "",
        stderr: "",
        metadata: { liveStatus: "is_upcoming", title: "Upcoming", channel: "Ch" },
      });
    });

    expect(params.addFloatingNotice).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "info" })
    );
  });

  it("失敗 → 一時停止(metadataPaused), addDownloadErrorItem呼出", async () => {
    const params = defaultParams();
    const { result } = renderHook(() => useMetadataFetch(params));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    act(() => {
      emitEvent("metadata-finished", {
        id: "v1",
        success: false,
        stdout: "",
        stderr: "rate limited error",
      });
    });

    expect(params.addDownloadErrorItem).toHaveBeenCalledWith("v1", "metadata", "rate limited error");
    expect(result.current.metadataPaused).toBe(true);
    expect(result.current.metadataPauseReason).toBe("rate limited error");
  });

  it("完了カウント更新", async () => {
    const params = defaultParams();
    const { result } = renderHook(() => useMetadataFetch(params));

    // まずスケジュールして total を設定
    act(() => {
      result.current.scheduleBackgroundMetadataFetch([
        { id: "v1", sourceUrl: "https://www.youtube.com/watch?v=v1" },
      ]);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(result.current.metadataFetch.active).toBe(true);
    expect(result.current.metadataFetch.total).toBe(1);

    act(() => {
      emitEvent("metadata-finished", {
        id: "v1",
        success: true,
        stdout: "",
        stderr: "",
        metadata: { title: "T", channel: "C" },
      });
    });

    expect(result.current.metadataFetch.completed).toBe(1);
    expect(result.current.metadataFetch.active).toBe(false);
  });
});

// ============================================================
// B-2-2. applyMetadataUpdate
// ============================================================
describe("useMetadataFetch — applyMetadataUpdate", () => {
  it("タイトル・チャンネル更新", async () => {
    const params = defaultParams();
    const { result } = renderHook(() => useMetadataFetch(params));

    act(() => {
      result.current.applyMetadataUpdate({
        id: "v1",
        metadata: { title: "New Title", channel: "New Ch" },
        currentVideo: makeVideo(),
      });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(params.setVideos).toHaveBeenCalled();
  });

  it("sourceURL優先順位: webpageUrl > url", async () => {
    const params = defaultParams();
    const { result } = renderHook(() => useMetadataFetch(params));

    act(() => {
      result.current.applyMetadataUpdate({
        id: "v1",
        metadata: { webpageUrl: "url1", url: "url2" },
        currentVideo: makeVideo(),
      });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    // setVideos の updater 関数を検証
    const updater = params.setVideos.mock.calls[0][0];
    const result2 = typeof updater === "function" ? updater([makeVideo()]) : [];
    expect(result2[0]?.sourceUrl).toBe("url1");
  });

  it("非公開→ライブステータスクリア, wasLive保持", async () => {
    const params = defaultParams();
    const currentVideo = makeVideo({ wasLive: true, liveStatus: "is_live", isLive: true });
    const { result } = renderHook(() => useMetadataFetch(params));

    act(() => {
      result.current.applyMetadataUpdate({
        id: "v1",
        isPrivate: true,
        currentVideo,
      });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    const updater = params.setVideos.mock.calls[0][0];
    const result2 = typeof updater === "function" ? updater([currentVideo]) : [];
    expect(result2[0]?.isPrivate).toBe(true);
    expect(result2[0]?.liveStatus).toBeNull();
    expect(result2[0]?.isLive).toBeNull();
    expect(result2[0]?.wasLive).toBe(true);
  });

  it("削除済み→ライブステータスクリア, wasLive保持", async () => {
    const params = defaultParams();
    const currentVideo = makeVideo({ wasLive: true, liveStatus: "is_live", isLive: true });
    const { result } = renderHook(() => useMetadataFetch(params));

    act(() => {
      result.current.applyMetadataUpdate({
        id: "v1",
        isDeleted: true,
        currentVideo,
      });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    const updater = params.setVideos.mock.calls[0][0];
    const result2 = typeof updater === "function" ? updater([currentVideo]) : [];
    expect(result2[0]?.isDeleted).toBe(true);
    expect(result2[0]?.liveStatus).toBeNull();
    expect(result2[0]?.isLive).toBeNull();
    expect(result2[0]?.wasLive).toBe(true);
  });

  it("ライブタイトルクリーニング — タイムスタンプ除去", async () => {
    const params = defaultParams();
    const { result } = renderHook(() => useMetadataFetch(params));

    act(() => {
      result.current.applyMetadataUpdate({
        id: "v1",
        metadata: { title: "配信タイトル 2024-01-15 14:00" },
        currentVideo: makeVideo(),
      });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    const updater = params.setVideos.mock.calls[0][0];
    const result2 = typeof updater === "function" ? updater([makeVideo()]) : [];
    expect(result2[0]?.title).toBe("配信タイトル");
  });

  it("タイムスタンプなし → タイトルそのまま", async () => {
    const params = defaultParams();
    const { result } = renderHook(() => useMetadataFetch(params));

    act(() => {
      result.current.applyMetadataUpdate({
        id: "v1",
        metadata: { title: "No timestamp here" },
        currentVideo: makeVideo(),
      });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    const updater = params.setVideos.mock.calls[0][0];
    const result2 = typeof updater === "function" ? updater([makeVideo()]) : [];
    expect(result2[0]?.title).toBe("No timestamp here");
  });

  it("markMetadataFetched=true → metadataFetched=true", async () => {
    const params = defaultParams();
    const { result } = renderHook(() => useMetadataFetch(params));

    act(() => {
      result.current.applyMetadataUpdate({
        id: "v1",
        metadata: { title: "T" },
        currentVideo: makeVideo(),
        markMetadataFetched: true,
      });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    const updater = params.setVideos.mock.calls[0][0];
    const result2 = typeof updater === "function" ? updater([makeVideo()]) : [];
    expect(result2[0]?.metadataFetched).toBe(true);
  });

  it("hasLiveChat=true → commentsStatus=downloaded (既存がdownloaded以外)", async () => {
    const params = defaultParams();
    const currentVideo = makeVideo({ commentsStatus: "pending" });
    const { result } = renderHook(() => useMetadataFetch(params));

    act(() => {
      result.current.applyMetadataUpdate({
        id: "v1",
        hasLiveChat: true,
        currentVideo,
      });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    const updater = params.setVideos.mock.calls[0][0];
    const result2 = typeof updater === "function" ? updater([currentVideo]) : [];
    expect(result2[0]?.commentsStatus).toBe("downloaded");
  });

  it("hasLiveChat=false, pending, 非ライブ → commentsStatus=unavailable", async () => {
    const params = defaultParams();
    const currentVideo = makeVideo({ commentsStatus: "pending" });
    const { result } = renderHook(() => useMetadataFetch(params));

    act(() => {
      result.current.applyMetadataUpdate({
        id: "v1",
        hasLiveChat: false,
        currentVideo,
        metadata: {},
      });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    const updater = params.setVideos.mock.calls[0][0];
    const result2 = typeof updater === "function" ? updater([currentVideo]) : [];
    expect(result2[0]?.commentsStatus).toBe("unavailable");
  });

  it("hasLiveChat=false, pending, ライブ中 → commentsStatus変更なし", async () => {
    const params = defaultParams();
    const currentVideo = makeVideo({ commentsStatus: "pending", isLive: true });
    const { result } = renderHook(() => useMetadataFetch(params));

    act(() => {
      result.current.applyMetadataUpdate({
        id: "v1",
        hasLiveChat: false,
        currentVideo,
        metadata: { isLive: true },
      });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    const updater = params.setVideos.mock.calls[0][0];
    const result2 = typeof updater === "function" ? updater([currentVideo]) : [];
    // commentsStatus should remain "pending" — no "unavailable" set
    expect(result2[0]?.commentsStatus).not.toBe("unavailable");
  });

  it("メタデータなし(null) → タイトル等の変更なし", async () => {
    const params = defaultParams();
    const { result } = renderHook(() => useMetadataFetch(params));

    act(() => {
      result.current.applyMetadataUpdate({
        id: "v1",
        metadata: null,
        currentVideo: makeVideo(),
      });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    // setVideos should not be called since no patch was created
    // (no metadata, no hasLiveChat, no isPrivate, no markMetadataFetched)
    expect(params.setVideos).not.toHaveBeenCalled();
  });
});

// ============================================================
// B-2-3. scheduleBackgroundMetadataFetch
// ============================================================
describe("useMetadataFetch — scheduleBackgroundMetadataFetch", () => {
  it("新規バッチ開始 → active=true, total=N", () => {
    const params = defaultParams();
    const { result } = renderHook(() => useMetadataFetch(params));

    act(() => {
      result.current.scheduleBackgroundMetadataFetch([
        { id: "v1", sourceUrl: "https://www.youtube.com/watch?v=v1" },
        { id: "v2", sourceUrl: "https://www.youtube.com/watch?v=v2" },
      ]);
    });

    expect(result.current.metadataFetch.active).toBe(true);
    expect(result.current.metadataFetch.total).toBe(2);
    expect(result.current.metadataFetch.completed).toBe(0);
  });

  it("重複ID除外", () => {
    const params = defaultParams();
    const { result } = renderHook(() => useMetadataFetch(params));

    act(() => {
      result.current.scheduleBackgroundMetadataFetch([
        { id: "v1" },
      ]);
    });

    act(() => {
      result.current.scheduleBackgroundMetadataFetch([
        { id: "v1" }, // 重複
        { id: "v2" },
      ]);
    });

    // total = 1 (v1) + 1 (v2のみ) = 2
    expect(result.current.metadataFetch.total).toBe(2);
  });

  it("outputDir未設定 → 何もしない", () => {
    const params = defaultParams({ downloadDirRef: { current: "" } });
    const { result } = renderHook(() => useMetadataFetch(params));

    act(() => {
      result.current.scheduleBackgroundMetadataFetch([{ id: "v1" }]);
    });

    expect(result.current.metadataFetch.active).toBe(false);
  });

  it("空配列 → 何もしない", () => {
    const params = defaultParams();
    const { result } = renderHook(() => useMetadataFetch(params));

    act(() => {
      result.current.scheduleBackgroundMetadataFetch([]);
    });

    expect(result.current.metadataFetch.active).toBe(false);
  });
});

// ============================================================
// B-2-5. retryMetadataFetch
// ============================================================
describe("useMetadataFetch — retryMetadataFetch", () => {
  it("一時停止解除 → metadataPaused=false", async () => {
    const params = defaultParams();
    const { result } = renderHook(() => useMetadataFetch(params));

    // まず一時停止状態にする
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    act(() => {
      emitEvent("metadata-finished", {
        id: "v1",
        success: false,
        stdout: "",
        stderr: "error",
      });
    });

    expect(result.current.metadataPaused).toBe(true);

    act(() => {
      result.current.retryMetadataFetch();
    });

    expect(result.current.metadataPaused).toBe(false);
    expect(result.current.metadataPauseReason).toBe("");
  });
});
