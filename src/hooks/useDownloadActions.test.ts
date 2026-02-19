/**
 * B-3. useDownloadActions テスト
 *
 * startDownload のガードチェック、キューイング、
 * startCommentsDownload のロジックを検証。
 */
import { renderHook, act } from "@testing-library/react";
import { mockInvoke, resetTauriMocks } from "../test/tauriMocks";
import { useDownloadActions } from "./useDownloadActions";

type Video = {
  id: string;
  sourceUrl: string;
  downloadStatus: "pending" | "downloading" | "downloaded" | "failed";
  commentsStatus: "pending" | "downloading" | "downloaded" | "failed" | "unavailable";
  metadataFetched?: boolean;
  isLive?: boolean;
  liveStatus?: string;
  isPrivate?: boolean;
  isDeleted?: boolean;
};

const makeVideo = (overrides: Partial<Video> = {}): Video => ({
  id: "v1",
  sourceUrl: "https://www.youtube.com/watch?v=v1",
  downloadStatus: "pending",
  commentsStatus: "pending",
  metadataFetched: true,
  ...overrides,
});

function defaultParams() {
  return {
    downloadDirRef: { current: "/output" },
    videosRef: { current: [makeVideo()] as Video[] },
    scheduleBackgroundMetadataFetch: vi.fn(),
    cookiesFile: "",
    cookiesSource: "none" as const,
    cookiesBrowser: "",
    remoteComponents: "none" as const,
    ytDlpPath: "",
    ffmpegPath: "",
    downloadQuality: "",
    toolingStatus: { ytDlp: { ok: true } },
    setErrorMessage: vi.fn(),
    setIsSettingsOpen: vi.fn(),
    setDownloadingIds: vi.fn(),
    setCommentsDownloadingIds: vi.fn(),
    setPendingCommentIds: vi.fn(),
    setVideos: vi.fn(),
    setVideoErrors: vi.fn(),
    setCommentErrors: vi.fn(),
    setProgressLines: vi.fn(),
    setCommentProgressLines: vi.fn(),
    onStartFailedRef: { current: vi.fn() },
    bulkDownloadRef: { current: { active: false, waitingForSingles: false } },
    setQueuedDownloadIds: vi.fn(),
    addFloatingNotice: vi.fn(),
  };
}

beforeEach(() => {
  resetTauriMocks();
  mockInvoke.mockResolvedValue(undefined);
});

// ============================================================
// B-3-1. startDownload ガードチェック
// ============================================================
describe("useDownloadActions — startDownload ガード", () => {
  it("DL先未設定 → エラー + 設定画面表示", async () => {
    const params = { ...defaultParams(), downloadDirRef: { current: "" } };
    const { result } = renderHook(() => useDownloadActions(params));

    await act(async () => {
      await result.current.startDownload(makeVideo());
    });

    // startDownloadNow内でsetErrorMessage呼出
    expect(params.setErrorMessage).toHaveBeenCalled();
    expect(params.setIsSettingsOpen).toHaveBeenCalledWith(true);
  });

  it("yt-dlp未検出 → エラー通知 + 設定画面表示", async () => {
    const params = {
      ...defaultParams(),
      toolingStatus: { ytDlp: { ok: false } },
    };
    const { result } = renderHook(() => useDownloadActions(params));

    await act(async () => {
      await result.current.startDownload(makeVideo());
    });

    expect(params.addFloatingNotice).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "error" })
    );
    expect(params.setIsSettingsOpen).toHaveBeenCalledWith(true);
  });

  it("ライブ配信拒否 (isLive=true)", async () => {
    const params = defaultParams();
    const { result } = renderHook(() => useDownloadActions(params));

    await act(async () => {
      await result.current.startDownload(makeVideo({ isLive: true }));
    });

    expect(params.addFloatingNotice).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "error" })
    );
    expect(mockInvoke).not.toHaveBeenCalledWith("start_download", expect.anything());
  });

  it("配信予定拒否 (liveStatus=is_upcoming)", async () => {
    const params = defaultParams();
    const { result } = renderHook(() => useDownloadActions(params));

    await act(async () => {
      await result.current.startDownload(
        makeVideo({ liveStatus: "is_upcoming" })
      );
    });

    expect(params.addFloatingNotice).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "error" })
    );
  });

  it("非公開動画拒否 (isPrivate=true)", async () => {
    const params = defaultParams();
    const { result } = renderHook(() => useDownloadActions(params));

    await act(async () => {
      await result.current.startDownload(makeVideo({ isPrivate: true }));
    });

    expect(params.addFloatingNotice).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "error" })
    );
  });

  it("削除済み動画拒否 (isDeleted=true)", async () => {
    const params = defaultParams();
    const { result } = renderHook(() => useDownloadActions(params));

    await act(async () => {
      await result.current.startDownload(makeVideo({ isDeleted: true }));
    });

    expect(params.addFloatingNotice).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "error" })
    );
    expect(mockInvoke).not.toHaveBeenCalledWith("start_download", expect.anything());
  });

  it("一括DL中の個別DL拒否 (allowDuringBulk未指定)", async () => {
    const params = {
      ...defaultParams(),
      bulkDownloadRef: { current: { active: true, waitingForSingles: false } },
    };
    const { result } = renderHook(() => useDownloadActions(params));

    await act(async () => {
      await result.current.startDownload(makeVideo());
    });

    expect(params.addFloatingNotice).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "error" })
    );
  });

  it("一括DL中の許可付きDL → 正常実行", async () => {
    const params = {
      ...defaultParams(),
      bulkDownloadRef: { current: { active: true, waitingForSingles: false } },
    };
    const { result } = renderHook(() => useDownloadActions(params));

    await act(async () => {
      await result.current.startDownload(makeVideo(), { allowDuringBulk: true });
    });

    expect(mockInvoke).toHaveBeenCalledWith("start_download", expect.anything());
  });
});

// ============================================================
// B-3-3. startDownloadNow — ダウンロード実行
// ============================================================
describe("useDownloadActions — startDownloadNow", () => {
  it("正常開始 → downloadStatus=downloading, invoke呼出", async () => {
    const params = defaultParams();
    const { result } = renderHook(() => useDownloadActions(params));

    await act(async () => {
      await result.current.startDownload(makeVideo());
    });

    expect(params.setDownloadingIds).toHaveBeenCalled();
    expect(params.setVideos).toHaveBeenCalled();
    expect(mockInvoke).toHaveBeenCalledWith("start_download", expect.objectContaining({
      id: "v1",
    }));
  });

  it("invoke失敗 → downloadStatus=failed, エラーセット", async () => {
    mockInvoke.mockRejectedValue(new Error("yt-dlp failed"));
    const params = defaultParams();
    const { result } = renderHook(() => useDownloadActions(params));

    await act(async () => {
      await result.current.startDownload(makeVideo());
    });

    expect(params.setVideoErrors).toHaveBeenCalled();
    expect(params.onStartFailedRef.current).toHaveBeenCalledWith("v1");
  });
});

// ============================================================
// B-3-4. startCommentsDownload
// ============================================================
describe("useDownloadActions — startCommentsDownload", () => {
  it("正常開始 → commentsStatus=downloading", async () => {
    const params = defaultParams();
    const { result } = renderHook(() => useDownloadActions(params));

    await act(async () => {
      await result.current.startCommentsDownload(makeVideo());
    });

    expect(params.setCommentsDownloadingIds).toHaveBeenCalled();
    expect(params.setVideos).toHaveBeenCalled();
    expect(mockInvoke).toHaveBeenCalledWith("start_comments_download", expect.anything());
  });

  it("unavailable → スキップ", async () => {
    const params = defaultParams();
    const { result } = renderHook(() => useDownloadActions(params));

    await act(async () => {
      await result.current.startCommentsDownload(
        makeVideo({ commentsStatus: "unavailable" })
      );
    });

    expect(mockInvoke).not.toHaveBeenCalledWith("start_comments_download", expect.anything());
  });

  it("DL先未設定 → エラー + 設定画面表示", async () => {
    const params = { ...defaultParams(), downloadDirRef: { current: "" } };
    const { result } = renderHook(() => useDownloadActions(params));

    await act(async () => {
      await result.current.startCommentsDownload(makeVideo());
    });

    expect(params.setErrorMessage).toHaveBeenCalled();
    expect(params.setIsSettingsOpen).toHaveBeenCalledWith(true);
  });

  it("invoke失敗 → commentsStatus=failed, エラーセット", async () => {
    mockInvoke.mockRejectedValue(new Error("failed"));
    const params = defaultParams();
    const { result } = renderHook(() => useDownloadActions(params));

    await act(async () => {
      await result.current.startCommentsDownload(makeVideo());
    });

    expect(params.setCommentErrors).toHaveBeenCalled();
  });
});
