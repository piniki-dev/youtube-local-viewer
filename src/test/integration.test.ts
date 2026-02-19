/**
 * E. 統合シナリオテスト
 *
 * 複数フック/イベントの連携フローを検証。
 * E-1: 公開→非公開ライフサイクル
 * E-2: ライブ配信検出→DL拒否
 * E-3: ダウンロード中に非公開化
 * E-4: 一括DL混在キュー
 */
import { renderHook, act } from "@testing-library/react";
import { mockInvoke, resetTauriMocks } from "../test/tauriMocks";
import { useDownloadActions } from "../hooks/useDownloadActions";
import { useBulkDownloadManager } from "../hooks/useBulkDownloadManager";

// === 共通型 ===
type Video = {
  id: string;
  title: string;
  channel: string;
  sourceUrl: string;
  thumbnail?: string;
  downloadStatus: "pending" | "downloading" | "downloaded" | "failed";
  commentsStatus: "pending" | "downloading" | "downloaded" | "failed" | "unavailable";
  addedAt: string;
  metadataFetched?: boolean;
  isLive?: boolean;
  liveStatus?: string;
  isPrivate?: boolean;
  isDeleted?: boolean;
  availability?: string;
} & Record<string, unknown>;

const makeVideo = (overrides: Partial<Video> = {}): Video => ({
  id: "v1",
  title: "Test Video",
  channel: "Test Channel",
  sourceUrl: "https://www.youtube.com/watch?v=v1",
  downloadStatus: "pending",
  commentsStatus: "pending",
  addedAt: new Date().toISOString(),
  metadataFetched: true,
  ...overrides,
});

beforeEach(() => {
  resetTauriMocks();
  mockInvoke.mockResolvedValue(undefined);
});

// ============================================================
// E-1. 公開→非公開ライフサイクル
// ============================================================
describe("E-1: 公開→非公開ライフサイクル", () => {
  it("非公開フラグセット後のDL試行 → ガードで拒否", async () => {
    const video = makeVideo({
      downloadStatus: "downloaded",
      availability: "public",
    });

    // Step 1-3: 既にDL済みの動画がある状態

    // Step 4: 非公開後 — isPrivateフラグをセット
    const privateVideo: Video = {
      ...video,
      isPrivate: true,
      liveStatus: undefined,
      isLive: undefined,
    };

    // Step 5: 非公開動画の再DL試行 → ガードチェック
    const addFloatingNotice = vi.fn();
    const params = {
      downloadDirRef: { current: "/output" },
      videosRef: { current: [privateVideo] },
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
      addFloatingNotice,
    };

    const { result } = renderHook(() => useDownloadActions(params));

    await act(async () => {
      await result.current.startDownload(privateVideo);
    });

    // 非公開ガードでブロック
    expect(addFloatingNotice).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "error" })
    );
    expect(mockInvoke).not.toHaveBeenCalledWith("start_download", expect.anything());
  });
});

// ============================================================
// E-2. ライブ配信検出→DL拒否
// ============================================================
describe("E-2: ライブ配信検出→DL拒否", () => {
  it("ライブ配信動画のDL → ガードで拒否", async () => {
    const liveVideo = makeVideo({
      isLive: true,
      liveStatus: "is_live",
    });

    const addFloatingNotice = vi.fn();
    const params = {
      downloadDirRef: { current: "/output" },
      videosRef: { current: [liveVideo] },
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
      addFloatingNotice,
    };

    const { result } = renderHook(() => useDownloadActions(params));

    await act(async () => {
      await result.current.startDownload(liveVideo);
    });

    expect(addFloatingNotice).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "error" })
    );
    expect(mockInvoke).not.toHaveBeenCalledWith("start_download", expect.anything());
  });

  it("一括DLでライブ動画がスキップされる", () => {
    const videos = [
      makeVideo({ id: "normal", title: "Normal" }),
      makeVideo({ id: "live1", title: "Live", isLive: true }),
    ];

    const startDownload = vi.fn();
    const bulkState = {
      active: false,
      total: 0,
      completed: 0,
      currentId: null,
      currentTitle: "",
      queue: [] as string[],
      stopRequested: false,
      phase: null as "video" | "comments" | null,
      waitingForSingles: false,
    };

    const params = {
      bulkDownload: bulkState,
      setBulkDownload: vi.fn(),
      bulkDownloadRef: { current: bulkState },
      videosRef: { current: videos },
      downloadDirRef: { current: "/output" },
      downloadingIds: [] as string[],
      commentsDownloadingIds: [] as string[],
      queuedDownloadIds: [] as string[],
      pendingCommentIds: [] as string[],
      setPendingCommentIds: vi.fn(),
      setErrorMessage: vi.fn(),
      setIsSettingsOpen: vi.fn(),
      startDownload,
      startCommentsDownload: vi.fn(),
    };

    const { result } = renderHook(() => useBulkDownloadManager(params));

    act(() => {
      result.current.startBulkDownload();
    });

    // 最初のstartDownloadは normal に対して呼ばれる
    expect(startDownload).toHaveBeenCalledWith(
      expect.objectContaining({ id: "normal" }),
      expect.objectContaining({ allowDuringBulk: true })
    );
  });
});

// ============================================================
// E-3. ダウンロード中に非公開化
// ============================================================
describe("E-3: ダウンロード中に非公開化", () => {
  it("非公開検出後の再試行 → ガードでブロック", async () => {
    // Step 1: DL開始してDL中状態
    const video = makeVideo({ downloadStatus: "downloading" });

    // Step 2: download-finished で isPrivate=true
    // → downloadStatus=failed, isPrivate=true にセットされた後

    // Step 3: 再試行しようとした動画
    const failedPrivateVideo: Video = {
      ...video,
      downloadStatus: "failed",
      isPrivate: true,
    };

    const addFloatingNotice = vi.fn();
    const params = {
      downloadDirRef: { current: "/output" },
      videosRef: { current: [failedPrivateVideo] },
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
      addFloatingNotice,
    };

    const { result } = renderHook(() => useDownloadActions(params));

    await act(async () => {
      await result.current.startDownload(failedPrivateVideo);
    });

    // isPrivate ガード
    expect(addFloatingNotice).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "error" })
    );
    expect(mockInvoke).not.toHaveBeenCalledWith("start_download", expect.anything());
  });
});

// ============================================================
// E-3b. ダウンロード中に削除化
// ============================================================
describe("E-3b: ダウンロード中に削除化", () => {
  it("削除検出後の再試行 → ガードでブロック", async () => {
    const video = makeVideo({ downloadStatus: "downloading" });

    const failedDeletedVideo: Video = {
      ...video,
      downloadStatus: "failed",
      isDeleted: true,
    };

    const addFloatingNotice = vi.fn();
    const params = {
      downloadDirRef: { current: "/output" },
      videosRef: { current: [failedDeletedVideo] },
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
      addFloatingNotice,
    };

    const { result } = renderHook(() => useDownloadActions(params));

    await act(async () => {
      await result.current.startDownload(failedDeletedVideo);
    });

    expect(addFloatingNotice).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "error" })
    );
    expect(mockInvoke).not.toHaveBeenCalledWith("start_download", expect.anything());
  });
});

// ============================================================
// E-4. 一括DL: 混在キュー
// ============================================================
describe("E-4: 一括DL混在キュー", () => {
  it("[通常, ライブ, 非公開, 削除済み, 通常2, DL済み] → 通常のみDL、他はスキップ", () => {
    const videos = [
      makeVideo({ id: "normal1", title: "Normal 1" }),
      makeVideo({ id: "live1", title: "Live 1", isLive: true }),
      makeVideo({ id: "private1", title: "Private 1", isPrivate: true }),
      makeVideo({ id: "deleted1", title: "Deleted 1", isDeleted: true }),
      makeVideo({ id: "normal2", title: "Normal 2" }),
      makeVideo({ id: "done1", title: "Done 1", downloadStatus: "downloaded" }),
    ];

    const startDownload = vi.fn();
    const bulkState = {
      active: false,
      total: 0,
      completed: 0,
      currentId: null,
      currentTitle: "",
      queue: [] as string[],
      stopRequested: false,
      phase: null as "video" | "comments" | null,
      waitingForSingles: false,
    };

    const params = {
      bulkDownload: bulkState,
      setBulkDownload: vi.fn(),
      bulkDownloadRef: { current: bulkState },
      videosRef: { current: videos },
      downloadDirRef: { current: "/output" },
      downloadingIds: [] as string[],
      commentsDownloadingIds: [] as string[],
      queuedDownloadIds: [] as string[],
      pendingCommentIds: [] as string[],
      setPendingCommentIds: vi.fn(),
      setErrorMessage: vi.fn(),
      setIsSettingsOpen: vi.fn(),
      startDownload,
      startCommentsDownload: vi.fn(),
    };

    const { result } = renderHook(() => useBulkDownloadManager(params));

    act(() => {
      result.current.startBulkDownload();
    });

    // ライブ・非公開・削除済み・DL済みは除外されてtargetsに入らない
    // normal1, normal2 の2件がtargets
    expect(params.setBulkDownload).toHaveBeenCalledWith(
      expect.objectContaining({
        active: true,
        total: 2,
      })
    );

    // 最初は normal1 に対して startDownload
    expect(startDownload).toHaveBeenCalledWith(
      expect.objectContaining({ id: "normal1" }),
      expect.anything()
    );
  });
});

// ============================================================
// E-6. 公開→削除済みライフサイクル
// ============================================================
describe("E-6: 公開→削除済みライフサイクル", () => {
  it("削除済みフラグセット後のDL試行 → ガードで拒否", async () => {
    const video = makeVideo({
      downloadStatus: "downloaded",
      availability: "public",
    });

    // 削除後 — isDeletedフラグをセット
    const deletedVideo: Video = {
      ...video,
      isDeleted: true,
      liveStatus: undefined,
      isLive: undefined,
    };

    // 削除済み動画の再DL試行 → ガードチェック
    const addFloatingNotice = vi.fn();
    const params = {
      downloadDirRef: { current: "/output" },
      videosRef: { current: [deletedVideo] },
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
      addFloatingNotice,
    };

    const { result } = renderHook(() => useDownloadActions(params));

    await act(async () => {
      await result.current.startDownload(deletedVideo);
    });

    // 削除済みガードでブロック
    expect(addFloatingNotice).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "error" })
    );
    expect(mockInvoke).not.toHaveBeenCalledWith("start_download", expect.anything());
  });
});
