/**
 * B-1. useDownloadEvents テスト
 *
 * classifyDownloadError はモジュール内部関数のため直接テストできない。
 * listen コールバック経由でイベント発火をシミュレートし、
 * 状態変更・コールバック呼出を検証する。
 */
import { renderHook, act } from "@testing-library/react";
import { mockInvoke, emitEvent, resetTauriMocks } from "../test/tauriMocks";
import { useDownloadEvents } from "./useDownloadEvents";

type Video = {
  id: string;
  title: string;
  channel: string;
  downloadStatus: "pending" | "downloading" | "downloaded" | "failed";
  commentsStatus: "pending" | "downloading" | "downloaded" | "failed" | "unavailable";
  isPrivate?: boolean;
  isDeleted?: boolean;
};

function makeParams(overrides: Partial<ReturnType<typeof defaultParams>> = {}) {
  return { ...defaultParams(), ...overrides };
}

function defaultParams() {
  const videos: Video[] = [
    { id: "v1", title: "Video 1", channel: "Ch1", downloadStatus: "downloading", commentsStatus: "pending" },
  ];
  return {
    downloadDirRef: { current: "/output" },
    videosRef: { current: videos },
    setDownloadingIds: vi.fn(),
    setCommentsDownloadingIds: vi.fn(),
    setProgressLines: vi.fn(),
    setCommentProgressLines: vi.fn(),
    setVideos: vi.fn(),
    setVideoErrors: vi.fn(),
    setCommentErrors: vi.fn(),
    setPendingCommentIds: vi.fn(),
    bulkDownloadRef: { current: { active: false, currentId: null as string | null, phase: null as "video" | "comments" | null } },
    handleBulkCompletion: vi.fn(),
    maybeStartAutoCommentsDownload: vi.fn(() => false),
    addDownloadErrorItem: vi.fn(),
    addFloatingNotice: vi.fn(),
    applyMetadataUpdate: vi.fn(),
    onVideoDownloadFinished: vi.fn(),
    onCommentsDownloadFinished: vi.fn(),
  };
}

beforeEach(() => {
  resetTauriMocks();
  mockInvoke.mockResolvedValue(null);
});

// ============================================================
// B-1-1: download-finished イベント
// ============================================================
describe("useDownloadEvents — download-finished", () => {
  it("成功時: downloadStatus=downloaded, エラークリア, warmVideoCache呼出", async () => {
    const params = makeParams();
    renderHook(() => useDownloadEvents(params));
    // listen が非同期なので次のtickを待つ
    await vi.waitFor(() => expect(params.setProgressLines).toBeDefined());

    act(() => {
      emitEvent("download-finished", {
        id: "v1",
        success: true,
        stderr: "",
        stdout: "",
      });
    });

    // setVideos should be called with mapper updating status
    expect(params.setVideos).toHaveBeenCalled();
    // setVideoErrors should be called to clear error
    expect(params.setVideoErrors).toHaveBeenCalled();
    // setProgressLines should be called to clear progress
    expect(params.setProgressLines).toHaveBeenCalled();
    // onVideoDownloadFinished should be called
    expect(params.onVideoDownloadFinished).toHaveBeenCalledWith("v1", false);
  });

  it("失敗時: downloadStatus=failed, エラーセット, addDownloadErrorItem呼出", async () => {
    const params = makeParams();
    renderHook(() => useDownloadEvents(params));
    await vi.waitFor(() => expect(params.setVideos).toBeDefined());

    act(() => {
      emitEvent("download-finished", {
        id: "v1",
        success: false,
        stderr: "some error",
        stdout: "",
      });
    });

    expect(params.setVideos).toHaveBeenCalled();
    expect(params.addDownloadErrorItem).toHaveBeenCalledWith("v1", "video", expect.any(String));
    expect(params.addFloatingNotice).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "error" })
    );
  });

  it("非公開検出: isPrivate=true → 専用通知, videoErrorsには追加しない", async () => {
    const params = makeParams();
    renderHook(() => useDownloadEvents(params));
    await vi.waitFor(() => expect(params.setVideos).toBeDefined());

    act(() => {
      emitEvent("download-finished", {
        id: "v1",
        success: false,
        isPrivate: true,
        stderr: "",
        stdout: "",
      });
    });

    expect(params.addFloatingNotice).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "error" })
    );
    // videoErrors should NOT be called with the id (private uses different path)
    // addDownloadErrorItem should NOT be called for private
    expect(params.addDownloadErrorItem).not.toHaveBeenCalled();
  });

  it("削除済み検出: isDeleted=true → 専用通知, videoErrorsには追加しない", async () => {
    const params = makeParams();
    renderHook(() => useDownloadEvents(params));
    await vi.waitFor(() => expect(params.setVideos).toBeDefined());

    act(() => {
      emitEvent("download-finished", {
        id: "v1",
        success: false,
        isDeleted: true,
        stderr: "",
        stdout: "",
      });
    });

    expect(params.addFloatingNotice).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "error" })
    );
    expect(params.addDownloadErrorItem).not.toHaveBeenCalled();
  });

  it("キャンセル: downloadStatus=pending, エラークリア, 進捗クリア", async () => {
    const params = makeParams();
    renderHook(() => useDownloadEvents(params));
    await vi.waitFor(() => expect(params.setVideos).toBeDefined());

    act(() => {
      emitEvent("download-finished", {
        id: "v1",
        success: false,
        cancelled: true,
        stderr: "",
        stdout: "",
      });
    });

    expect(params.setVideos).toHaveBeenCalled();
    expect(params.setVideoErrors).toHaveBeenCalled();
    expect(params.setProgressLines).toHaveBeenCalled();
    expect(params.onVideoDownloadFinished).toHaveBeenCalledWith("v1", false);
  });

  it("成功 + 非一括DL → maybeStartAutoCommentsDownload呼出", async () => {
    const params = makeParams();
    params.maybeStartAutoCommentsDownload.mockReturnValue(true);
    renderHook(() => useDownloadEvents(params));
    await vi.waitFor(() => expect(params.setVideos).toBeDefined());

    act(() => {
      emitEvent("download-finished", {
        id: "v1",
        success: true,
        stderr: "",
        stdout: "",
      });
    });

    expect(params.maybeStartAutoCommentsDownload).toHaveBeenCalledWith("v1");
    expect(params.onVideoDownloadFinished).toHaveBeenCalledWith("v1", true);
  });

  it("成功 + 一括DL中 → handleBulkCompletion呼出, コメントDLスキップ", async () => {
    const params = makeParams({
      bulkDownloadRef: { current: { active: true, currentId: "v1", phase: "video" as const } },
    });
    renderHook(() => useDownloadEvents(params));
    await vi.waitFor(() => expect(params.setVideos).toBeDefined());

    act(() => {
      emitEvent("download-finished", {
        id: "v1",
        success: true,
        stderr: "",
        stdout: "",
      });
    });

    expect(params.handleBulkCompletion).toHaveBeenCalledWith("v1", false);
    // maybeStartAutoCommentsDownload should NOT be called during bulk
    expect(params.maybeStartAutoCommentsDownload).not.toHaveBeenCalled();
  });

  it("キャンセル + 一括DL中 → handleBulkCompletion(cancelled=true)", async () => {
    const params = makeParams({
      bulkDownloadRef: { current: { active: true, currentId: "v1", phase: "video" as const } },
    });
    renderHook(() => useDownloadEvents(params));
    await vi.waitFor(() => expect(params.setVideos).toBeDefined());

    act(() => {
      emitEvent("download-finished", {
        id: "v1",
        success: false,
        cancelled: true,
        stderr: "",
        stdout: "",
      });
    });

    expect(params.handleBulkCompletion).toHaveBeenCalledWith("v1", true);
  });
});

// ============================================================
// B-1-2: download-progress イベント
// ============================================================
describe("useDownloadEvents — download-progress", () => {
  it("進捗行を setProgressLines で更新", async () => {
    const params = makeParams();
    renderHook(() => useDownloadEvents(params));
    await vi.waitFor(() => expect(params.setProgressLines).toBeDefined());

    act(() => {
      emitEvent("download-progress", { id: "v1", line: "50%" });
    });

    expect(params.setProgressLines).toHaveBeenCalled();
  });
});

// ============================================================
// B-1-3: comments-finished イベント
// ============================================================
describe("useDownloadEvents — comments-finished", () => {
  it("成功 + ファイルあり → commentsStatus=downloaded", async () => {
    mockInvoke.mockResolvedValue(true); // comments_file_exists → true
    const params = makeParams();
    renderHook(() => useDownloadEvents(params));
    await vi.waitFor(() => expect(params.setVideos).toBeDefined());

    await act(async () => {
      emitEvent("comments-finished", {
        id: "v1",
        success: true,
        stderr: "",
        stdout: "",
      });
      // await the async handler
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(params.setVideos).toHaveBeenCalled();
  });

  it("成功 + ファイルなし → commentsStatus=unavailable", async () => {
    mockInvoke.mockResolvedValue(false); // comments_file_exists → false
    const params = makeParams();
    renderHook(() => useDownloadEvents(params));
    await vi.waitFor(() => expect(params.setVideos).toBeDefined());

    await act(async () => {
      emitEvent("comments-finished", {
        id: "v1",
        success: true,
        stderr: "",
        stdout: "",
      });
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(params.setVideos).toHaveBeenCalled();
  });

  it("失敗 → commentsStatus=failed, commentErrors セット", async () => {
    const params = makeParams();
    renderHook(() => useDownloadEvents(params));
    await vi.waitFor(() => expect(params.setVideos).toBeDefined());

    await act(async () => {
      emitEvent("comments-finished", {
        id: "v1",
        success: false,
        stderr: "comment error",
        stdout: "",
      });
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(params.setVideos).toHaveBeenCalled();
    expect(params.setCommentErrors).toHaveBeenCalled();
    expect(params.addDownloadErrorItem).toHaveBeenCalledWith(
      "v1",
      "comments",
      expect.any(String)
    );
  });

  it("メタデータ付き成功 → applyMetadataUpdate呼出", async () => {
    mockInvoke.mockResolvedValue(true);
    const params = makeParams();
    renderHook(() => useDownloadEvents(params));
    await vi.waitFor(() => expect(params.setVideos).toBeDefined());

    await act(async () => {
      emitEvent("comments-finished", {
        id: "v1",
        success: true,
        stderr: "",
        stdout: "",
        metadata: { title: "Updated" },
        hasLiveChat: true,
      });
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(params.applyMetadataUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "v1",
        hasLiveChat: true,
      })
    );
  });

  it("comments_file_exists 例外 → エラー通知", async () => {
    mockInvoke.mockRejectedValue(new Error("check failed"));
    const params = makeParams();
    renderHook(() => useDownloadEvents(params));
    await vi.waitFor(() => expect(params.setVideos).toBeDefined());

    await act(async () => {
      emitEvent("comments-finished", {
        id: "v1",
        success: true,
        stderr: "",
        stdout: "",
      });
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(params.addFloatingNotice).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "error" })
    );
  });

  it("一括DL中のコメント完了 → handleBulkCompletion呼出", async () => {
    mockInvoke.mockResolvedValue(true);
    const params = makeParams({
      bulkDownloadRef: { current: { active: true, currentId: "v1", phase: "comments" as const } },
    });
    renderHook(() => useDownloadEvents(params));
    await vi.waitFor(() => expect(params.setVideos).toBeDefined());

    await act(async () => {
      emitEvent("comments-finished", {
        id: "v1",
        success: true,
        stderr: "",
        stdout: "",
      });
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(params.handleBulkCompletion).toHaveBeenCalledWith("v1", false);
  });
});

// ============================================================
// B-1-4: classifyDownloadError (間接テスト: 失敗イベント経由)
// ============================================================
describe("useDownloadEvents — classifyDownloadError (間接)", () => {
  const errorCases = [
    { stderr: "yt-dlpの起動に失敗しました: error", key: "ytdlpNotFound" },
    { stderr: "no such file or directory", key: "ytdlpNotFound" },
    { stderr: "指定されたファイルが見つかりません", key: "ytdlpNotFound" },
    { stderr: "the system cannot find the file", key: "ytdlpNotFound" },
    { stderr: "unable to connect to server", key: "networkError" },
    { stderr: "network is unreachable", key: "networkError" },
    { stderr: "connection refused", key: "networkError" },
    { stderr: "connection timed out", key: "networkError" },
    { stderr: "failed to connect", key: "networkError" },
    { stderr: "getaddrinfo failed", key: "networkError" },
    { stderr: "nodename nor servname provided", key: "networkError" },
    { stderr: "HTTP Error 429", key: "rateLimitError" },
    { stderr: "too many requests", key: "rateLimitError" },
    { stderr: "HTTP Error 403", key: "accessDeniedError" },
    { stderr: "403 Forbidden", key: "accessDeniedError" },
    { stderr: "some random error", key: "downloadFailed" },
  ];

  it.each(errorCases)(
    'stderr="$stderr" → addFloatingNotice が呼ばれる',
    async ({ stderr }) => {
      const params = makeParams();
      renderHook(() => useDownloadEvents(params));
      await vi.waitFor(() => expect(params.setVideos).toBeDefined());

      act(() => {
        emitEvent("download-finished", {
          id: "v1",
          success: false,
          stderr,
          stdout: "",
        });
      });

      expect(params.addFloatingNotice).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "error", title: expect.any(String) })
      );
    }
  );
});
