/**
 * B-7. useIntegrityCheck テスト
 *
 * runIntegrityCheck, buildIntegrityReport, applyLocalFileCheckResults,
 * isDataCheckDone を検証。
 */
import { renderHook, act } from "@testing-library/react";
import { mockInvoke, resetTauriMocks } from "../test/tauriMocks";
import { useIntegrityCheck } from "./useIntegrityCheck";

type Video = {
  id: string;
  title: string;
  downloadStatus: "pending" | "downloading" | "downloaded" | "failed";
  commentsStatus: "pending" | "downloading" | "downloaded" | "failed" | "unavailable";
  metadataFetched?: boolean;
};

const makeVideo = (overrides: Partial<Video> = {}): Video => ({
  id: "v1",
  title: "Video 1",
  downloadStatus: "downloaded",
  commentsStatus: "downloaded",
  metadataFetched: true,
  ...overrides,
});

function defaultParams(overrides: Record<string, unknown> = {}) {
  const videos = [makeVideo()];
  return {
    videos,
    videosRef: { current: videos },
    downloadDir: "/output",
    isStateReady: true,
    setVideos: vi.fn(),
    setVideoErrors: vi.fn(),
    setCommentErrors: vi.fn(),
    videoErrors: {} as Record<string, string>,
    commentErrors: {} as Record<string, string>,
    onMetadataRecovery: vi.fn(),
    setIsIntegrityOpen: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  resetTauriMocks();
  mockInvoke.mockResolvedValue(undefined);
});

// ============================================================
// B-7-1. runIntegrityCheck
// ============================================================
describe("useIntegrityCheck — runIntegrityCheck", () => {
  it("全ファイル正常 → issues空, 問題なしサマリ", async () => {
    // verify_local_files → strict checks → all ok
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "video_file_exists") return true;
      if (cmd === "comments_file_exists") return true;
      if (cmd === "get_metadata_index") return { infoIds: ["v1"], chatIds: [] };
      return undefined;
    });
    const params = defaultParams();
    const { result } = renderHook(() => useIntegrityCheck(params));

    // 初回自動チェックを待つ
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    await act(async () => {
      await result.current.runIntegrityCheck(false);
    });

    expect(result.current.integrityIssues.length).toBe(0);
  });

  it("DL先未設定 → issues空, メッセージ表示", async () => {
    const params = defaultParams({ downloadDir: "" });
    const { result } = renderHook(() => useIntegrityCheck(params));

    await act(async () => {
      await result.current.runIntegrityCheck(true);
    });

    expect(result.current.integrityIssues).toEqual([]);
    expect(result.current.integrityMessage).toBeTruthy();
    expect(params.setIsIntegrityOpen).toHaveBeenCalledWith(true);
  });

  it("動画ファイル欠損 → videoMissing=true", async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "video_file_exists") return false;
      if (cmd === "comments_file_exists") return true;
      if (cmd === "get_metadata_index") return { infoIds: ["v1"], chatIds: [] };
      return undefined;
    });
    const params = defaultParams();
    const { result } = renderHook(() => useIntegrityCheck(params));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    await act(async () => {
      await result.current.runIntegrityCheck(false);
    });

    expect(result.current.integrityIssues.some((i) => i.videoMissing)).toBe(true);
  });

  it("コメントファイル欠損 → commentsMissing=true", async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "video_file_exists") return true;
      if (cmd === "comments_file_exists") return false;
      if (cmd === "get_metadata_index") return { infoIds: ["v1"], chatIds: [] };
      return undefined;
    });
    const params = defaultParams();
    const { result } = renderHook(() => useIntegrityCheck(params));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    await act(async () => {
      await result.current.runIntegrityCheck(false);
    });

    expect(result.current.integrityIssues.some((i) => i.commentsMissing)).toBe(true);
  });

  it("verify_local_files例外 → 個別チェックにフォールバック", async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "verify_local_files") throw new Error("not supported");
      if (cmd === "video_file_exists") return true;
      if (cmd === "comments_file_exists") return true;
      if (cmd === "get_metadata_index") return { infoIds: ["v1"], chatIds: [] };
      return undefined;
    });
    const params = defaultParams();
    const { result } = renderHook(() => useIntegrityCheck(params));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // フォールバックした結果、個別チェックが使われる
    expect(result.current.hasCheckedFiles).toBe(true);
  });

  it("動画ゼロ → 空サマリ", async () => {
    const params = defaultParams({ videos: [], videosRef: { current: [] } });
    const { result } = renderHook(() => useIntegrityCheck(params));

    await act(async () => {
      await result.current.runIntegrityCheck(false);
    });

    expect(result.current.integrityIssues).toEqual([]);
    expect(result.current.integritySummary).toEqual({
      total: 0,
      videoMissing: 0,
      commentsMissing: 0,
      metadataMissing: 0,
    });
  });
});

// ============================================================
// B-7-2. isDataCheckDone
// ============================================================
describe("useIntegrityCheck — isDataCheckDone", () => {
  it("isStateReady=false → false", () => {
    const params = defaultParams({ isStateReady: false });
    const { result } = renderHook(() => useIntegrityCheck(params));
    expect(result.current.isDataCheckDone).toBe(false);
  });

  it("downloadDir空 → true", () => {
    const params = defaultParams({ downloadDir: "" });
    const { result } = renderHook(() => useIntegrityCheck(params));
    expect(result.current.isDataCheckDone).toBe(true);
  });

  it("動画なし → true", () => {
    const params = defaultParams({ videos: [] });
    const { result } = renderHook(() => useIntegrityCheck(params));
    expect(result.current.isDataCheckDone).toBe(true);
  });
});

// ============================================================
// B-7-3. applyLocalFileCheckResults — エラーセット
// ============================================================
describe("useIntegrityCheck — applyLocalFileCheckResults", () => {
  it("videoMissing → setVideoErrors に i18n メッセージ", async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "verify_local_files") throw new Error("not available");
      if (cmd === "video_file_exists") return false;
      if (cmd === "comments_file_exists") return true;
      if (cmd === "get_metadata_index") return { infoIds: ["v1"], chatIds: [] };
      return undefined;
    });
    const params = defaultParams();
    renderHook(() => useIntegrityCheck(params));

    // 自動チェック（verify_local_files失敗→個別フォールバック）を待つ
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    expect(params.setVideoErrors).toHaveBeenCalled();
  });

  it("commentsMissing → setCommentErrors に i18n メッセージ", async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "verify_local_files") throw new Error("not available");
      if (cmd === "video_file_exists") return true;
      if (cmd === "comments_file_exists") return false;
      if (cmd === "get_metadata_index") return { infoIds: ["v1"], chatIds: [] };
      return undefined;
    });
    const params = defaultParams();
    renderHook(() => useIntegrityCheck(params));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    expect(params.setCommentErrors).toHaveBeenCalled();
  });
});
