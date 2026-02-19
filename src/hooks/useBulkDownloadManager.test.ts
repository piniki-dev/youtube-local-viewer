/**
 * B-6. useBulkDownloadManager テスト
 *
 * startBulkDownload, startNextBulkDownload, handleBulkCompletion,
 * stopBulkDownload, maybeStartAutoCommentsDownload, maybeStartQueuedBulk を検証。
 */
import { renderHook, act } from "@testing-library/react";
import { mockInvoke, resetTauriMocks } from "../test/tauriMocks";
import { useBulkDownloadManager } from "./useBulkDownloadManager";

type Video = {
  id: string;
  title: string;
  downloadStatus: "pending" | "downloading" | "downloaded" | "failed";
  commentsStatus: "pending" | "downloading" | "downloaded" | "failed" | "unavailable";
  isLive?: boolean;
  liveStatus?: string;
  isPrivate?: boolean;
  isDeleted?: boolean;
};

type BulkState = {
  active: boolean;
  total: number;
  completed: number;
  currentId: string | null;
  currentTitle: string;
  queue: string[];
  stopRequested: boolean;
  phase: "video" | "comments" | null;
  waitingForSingles: boolean;
};

const inactiveBulk: BulkState = {
  active: false,
  total: 0,
  completed: 0,
  currentId: null,
  currentTitle: "",
  queue: [],
  stopRequested: false,
  phase: null,
  waitingForSingles: false,
};

function makeVideo(overrides: Partial<Video> = {}): Video {
  return {
    id: "v1",
    title: "Video 1",
    downloadStatus: "pending",
    commentsStatus: "pending",
    ...overrides,
  };
}

function defaultParams(overrides: Partial<{
  bulkDownload: BulkState;
  setBulkDownload: ReturnType<typeof vi.fn>;
  bulkDownloadRef: { current: BulkState };
  videosRef: { current: Video[] };
  downloadDirRef: { current: string };
  downloadingIds: string[];
  commentsDownloadingIds: string[];
  queuedDownloadIds: string[];
  pendingCommentIds: string[];
  setPendingCommentIds: ReturnType<typeof vi.fn>;
  setErrorMessage: ReturnType<typeof vi.fn>;
  setIsSettingsOpen: ReturnType<typeof vi.fn>;
  startDownload: ReturnType<typeof vi.fn>;
  startCommentsDownload: ReturnType<typeof vi.fn>;
}> = {}) {
  const bulkState = overrides.bulkDownload ?? inactiveBulk;
  return {
    bulkDownload: bulkState,
    setBulkDownload: vi.fn(),
    bulkDownloadRef: { current: bulkState },
    videosRef: { current: [makeVideo(), makeVideo({ id: "v2", title: "Video 2" })] as Video[] },
    downloadDirRef: { current: "/output" },
    downloadingIds: [] as string[],
    commentsDownloadingIds: [] as string[],
    queuedDownloadIds: [] as string[],
    pendingCommentIds: [] as string[],
    setPendingCommentIds: vi.fn(),
    setErrorMessage: vi.fn(),
    setIsSettingsOpen: vi.fn(),
    startDownload: vi.fn(),
    startCommentsDownload: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  resetTauriMocks();
  mockInvoke.mockResolvedValue(undefined);
});

// ============================================================
// B-6-1. startBulkDownload
// ============================================================
describe("useBulkDownloadManager — startBulkDownload", () => {
  it("DL先未設定 → エラー + 設定画面表示", () => {
    const params = defaultParams({ downloadDirRef: { current: "" } });
    const { result } = renderHook(() => useBulkDownloadManager(params));

    act(() => {
      result.current.startBulkDownload();
    });

    expect(params.setErrorMessage).toHaveBeenCalled();
    expect(params.setIsSettingsOpen).toHaveBeenCalledWith(true);
  });

  it("既に一括DL中 → 何もしない", () => {
    const activeBulk: BulkState = { ...inactiveBulk, active: true };
    const params = defaultParams({
      bulkDownload: activeBulk,
      bulkDownloadRef: { current: activeBulk },
    });
    const { result } = renderHook(() => useBulkDownloadManager(params));

    act(() => {
      result.current.startBulkDownload();
    });

    expect(params.setBulkDownload).not.toHaveBeenCalled();
  });

  it("DL対象なし → エラー (noVideosToDownload)", () => {
    const params = defaultParams({
      videosRef: {
        current: [makeVideo({ downloadStatus: "downloaded" })],
      },
    });
    const { result } = renderHook(() => useBulkDownloadManager(params));

    act(() => {
      result.current.startBulkDownload();
    });

    expect(params.setErrorMessage).toHaveBeenCalled();
  });

  it("個別DL中 → waitingForSingles=true", () => {
    const params = defaultParams({
      downloadingIds: ["v1"],
    });
    const { result } = renderHook(() => useBulkDownloadManager(params));

    act(() => {
      result.current.startBulkDownload();
    });

    expect(params.setBulkDownload).toHaveBeenCalledWith(
      expect.objectContaining({
        active: true,
        waitingForSingles: true,
      })
    );
  });

  it("正常開始 → startDownload 呼出", () => {
    const params = defaultParams();
    const { result } = renderHook(() => useBulkDownloadManager(params));

    act(() => {
      result.current.startBulkDownload();
    });

    expect(params.setBulkDownload).toHaveBeenCalledWith(
      expect.objectContaining({ active: true })
    );
    // startNextBulkDownload が内部呼出されて startDownload が呼ばれる
    expect(params.startDownload).toHaveBeenCalledWith(
      expect.objectContaining({ id: "v1" }),
      expect.objectContaining({ allowDuringBulk: true })
    );
  });

  it("ライブ動画・非公開・削除済みは一括DL対象外", () => {
    const params = defaultParams({
      videosRef: {
        current: [
          makeVideo({ id: "live1", isLive: true }),
          makeVideo({ id: "private1", isPrivate: true }),
          makeVideo({ id: "deleted1", isDeleted: true }),
          makeVideo({ id: "upcoming1", liveStatus: "is_upcoming" }),
        ],
      },
    });
    const { result } = renderHook(() => useBulkDownloadManager(params));

    act(() => {
      result.current.startBulkDownload();
    });

    expect(params.setErrorMessage).toHaveBeenCalled(); // 対象なし
  });
});

// ============================================================
// B-6-2. handleBulkCompletion
// ============================================================
describe("useBulkDownloadManager — handleBulkCompletion", () => {
  it("currentId不一致 → 何もしない", () => {
    const activeBulk: BulkState = {
      ...inactiveBulk,
      active: true,
      currentId: "v1",
      queue: ["v2"],
    };
    const params = defaultParams({
      bulkDownload: activeBulk,
      bulkDownloadRef: { current: activeBulk },
    });
    const { result } = renderHook(() => useBulkDownloadManager(params));

    act(() => {
      result.current.handleBulkCompletion("unknown", false);
    });

    expect(params.setBulkDownload).not.toHaveBeenCalled();
  });

  it("正常完了 → 次の動画へ進む", () => {
    const activeBulk: BulkState = {
      ...inactiveBulk,
      active: true,
      currentId: "v1",
      currentTitle: "Video 1",
      queue: ["v2"],
      total: 2,
      completed: 0,
    };
    const params = defaultParams({
      bulkDownload: activeBulk,
      bulkDownloadRef: { current: activeBulk },
    });
    const { result } = renderHook(() => useBulkDownloadManager(params));

    act(() => {
      result.current.handleBulkCompletion("v1", false);
    });

    // completed + 1 で setBulkDownload 呼出
    expect(params.setBulkDownload).toHaveBeenCalled();
    // startDownload for next video
    expect(params.startDownload).toHaveBeenCalled();
  });

  it("stopRequested → active=false, キュークリア", () => {
    const activeBulk: BulkState = {
      ...inactiveBulk,
      active: true,
      currentId: "v1",
      stopRequested: true,
      queue: ["v2"],
    };
    const params = defaultParams({
      bulkDownload: activeBulk,
      bulkDownloadRef: { current: activeBulk },
    });
    const { result } = renderHook(() => useBulkDownloadManager(params));

    act(() => {
      result.current.handleBulkCompletion("v1", false);
    });

    expect(params.setBulkDownload).toHaveBeenCalledWith(
      expect.objectContaining({ active: false, queue: [] })
    );
  });

  it("cancelled=true → active=false", () => {
    const activeBulk: BulkState = {
      ...inactiveBulk,
      active: true,
      currentId: "v1",
      queue: ["v2"],
    };
    const params = defaultParams({
      bulkDownload: activeBulk,
      bulkDownloadRef: { current: activeBulk },
    });
    const { result } = renderHook(() => useBulkDownloadManager(params));

    act(() => {
      result.current.handleBulkCompletion("v1", true);
    });

    expect(params.setBulkDownload).toHaveBeenCalledWith(
      expect.objectContaining({ active: false })
    );
  });
});

// ============================================================
// B-6-3. stopBulkDownload
// ============================================================
describe("useBulkDownloadManager — stopBulkDownload", () => {
  it("非アクティブ → 何もしない", async () => {
    const params = defaultParams();
    const { result } = renderHook(() => useBulkDownloadManager(params));

    await act(async () => {
      await result.current.stopBulkDownload();
    });

    expect(params.setBulkDownload).not.toHaveBeenCalled();
  });

  it("waitingForSingles中でcurrentIdなし → 即停止", async () => {
    const waitingBulk: BulkState = {
      ...inactiveBulk,
      active: true,
      waitingForSingles: true,
      queue: ["v1", "v2"],
    };
    const params = defaultParams({
      bulkDownload: waitingBulk,
      bulkDownloadRef: { current: waitingBulk },
    });
    const { result } = renderHook(() => useBulkDownloadManager(params));

    await act(async () => {
      await result.current.stopBulkDownload();
    });

    expect(params.setBulkDownload).toHaveBeenCalledWith(
      expect.objectContaining({ active: false, queue: [] })
    );
  });

  it("currentIdあり → stopRequested=true, invoke('stop_download')", async () => {
    const activeBulk: BulkState = {
      ...inactiveBulk,
      active: true,
      currentId: "v1",
    };
    const params = defaultParams({
      bulkDownload: activeBulk,
      bulkDownloadRef: { current: activeBulk },
    });
    const { result } = renderHook(() => useBulkDownloadManager(params));

    await act(async () => {
      await result.current.stopBulkDownload();
    });

    expect(params.setBulkDownload).toHaveBeenCalledWith(
      expect.objectContaining({ stopRequested: true })
    );
    expect(mockInvoke).toHaveBeenCalledWith("stop_download", { id: "v1" });
  });

  it("invoke失敗 → エラーメッセージ, stopRequested リセット", async () => {
    mockInvoke.mockRejectedValue(new Error("fail"));
    const activeBulk: BulkState = {
      ...inactiveBulk,
      active: true,
      currentId: "v1",
    };
    const params = defaultParams({
      bulkDownload: activeBulk,
      bulkDownloadRef: { current: activeBulk },
    });
    const { result } = renderHook(() => useBulkDownloadManager(params));

    await act(async () => {
      await result.current.stopBulkDownload();
    });

    expect(params.setErrorMessage).toHaveBeenCalled();
    // stopRequested を false に戻す
    const calls = params.setBulkDownload.mock.calls;
    const lastCall = calls[calls.length - 1]?.[0];
    expect(lastCall).toEqual(expect.objectContaining({ stopRequested: false }));
  });
});

// ============================================================
// B-6-4. maybeStartAutoCommentsDownload
// ============================================================
describe("useBulkDownloadManager — maybeStartAutoCommentsDownload", () => {
  it("一括DL中 → false", () => {
    const activeBulk: BulkState = { ...inactiveBulk, active: true };
    const params = defaultParams({
      bulkDownload: activeBulk,
      bulkDownloadRef: { current: activeBulk },
    });
    const { result } = renderHook(() => useBulkDownloadManager(params));

    let returned: boolean;
    act(() => {
      returned = result.current.maybeStartAutoCommentsDownload("v1");
    });
    expect(returned!).toBe(false);
  });

  it("コメント済み → false", () => {
    const params = defaultParams({
      videosRef: {
        current: [makeVideo({ commentsStatus: "downloaded" })],
      },
    });
    const { result } = renderHook(() => useBulkDownloadManager(params));

    let returned: boolean;
    act(() => {
      returned = result.current.maybeStartAutoCommentsDownload("v1");
    });
    expect(returned!).toBe(false);
  });

  it("unavailable → false", () => {
    const params = defaultParams({
      videosRef: {
        current: [makeVideo({ commentsStatus: "unavailable" })],
      },
    });
    const { result } = renderHook(() => useBulkDownloadManager(params));

    let returned: boolean;
    act(() => {
      returned = result.current.maybeStartAutoCommentsDownload("v1");
    });
    expect(returned!).toBe(false);
  });

  it("コメント未DL → startCommentsDownload 呼出, true 返却", () => {
    const params = defaultParams();
    const { result } = renderHook(() => useBulkDownloadManager(params));

    let returned: boolean;
    act(() => {
      returned = result.current.maybeStartAutoCommentsDownload("v1");
    });
    expect(returned!).toBe(true);
    expect(params.startCommentsDownload).toHaveBeenCalled();
    expect(params.setPendingCommentIds).toHaveBeenCalled();
  });
});

// ============================================================
// B-6-5. maybeStartQueuedBulk
// ============================================================
describe("useBulkDownloadManager — maybeStartQueuedBulk", () => {
  it("非アクティブ → 何もしない", () => {
    const params = defaultParams();
    const { result } = renderHook(() => useBulkDownloadManager(params));

    act(() => {
      result.current.maybeStartQueuedBulk();
    });

    expect(params.setBulkDownload).not.toHaveBeenCalled();
  });

  it("waitingForSingles でなければ → 何もしない", () => {
    const activeBulk: BulkState = { ...inactiveBulk, active: true, waitingForSingles: false };
    const params = defaultParams({
      bulkDownload: activeBulk,
      bulkDownloadRef: { current: activeBulk },
    });
    const { result } = renderHook(() => useBulkDownloadManager(params));

    act(() => {
      result.current.maybeStartQueuedBulk();
    });

    expect(params.setBulkDownload).not.toHaveBeenCalled();
  });

  it("個別DLがまだ残っている → 何もしない", () => {
    const waitingBulk: BulkState = { ...inactiveBulk, active: true, waitingForSingles: true, queue: ["v1"] };
    const params = defaultParams({
      bulkDownload: waitingBulk,
      bulkDownloadRef: { current: waitingBulk },
      downloadingIds: ["some"],
    });
    const { result } = renderHook(() => useBulkDownloadManager(params));

    act(() => {
      result.current.maybeStartQueuedBulk();
    });

    expect(params.setBulkDownload).not.toHaveBeenCalled();
  });

  it("個別DL完了 → waitingForSingles=false で開始", () => {
    const waitingBulk: BulkState = {
      ...inactiveBulk,
      active: true,
      waitingForSingles: true,
      queue: ["v1"],
      total: 1,
    };
    const params = defaultParams({
      bulkDownload: waitingBulk,
      bulkDownloadRef: { current: waitingBulk },
    });
    const { result } = renderHook(() => useBulkDownloadManager(params));

    act(() => {
      result.current.maybeStartQueuedBulk();
    });

    expect(params.setBulkDownload).toHaveBeenCalledWith(
      expect.objectContaining({ waitingForSingles: false })
    );
    expect(params.startDownload).toHaveBeenCalled();
  });
});
