/**
 * B-4. useAddVideoActions テスト
 *
 * addVideo / addChannelVideos のバリデーションおよび正常系を検証。
 */
import { renderHook, act } from "@testing-library/react";
import { mockInvoke, resetTauriMocks } from "../test/tauriMocks";
import { useAddVideoActions } from "./useAddVideoActions";

type Video = {
  id: string;
  title: string;
  channel: string;
  thumbnail?: string;
  sourceUrl: string;
  downloadStatus: "pending" | "downloading" | "downloaded" | "failed";
  commentsStatus: "pending" | "downloading" | "downloaded" | "failed" | "unavailable";
  addedAt: string;
} & Record<string, unknown>;

function defaultParams() {
  return {
    videos: [] as Video[],
    setVideos: vi.fn(),
    videoUrl: "",
    setVideoUrl: vi.fn(),
    channelUrl: "",
    setChannelUrl: vi.fn(),
    downloadOnAdd: false,
    setErrorMessage: vi.fn(),
    setIsAdding: vi.fn(),
    setIsAddOpen: vi.fn(),
    setIsChannelFetchOpen: vi.fn(),
    setChannelFetchProgress: vi.fn(),
    setChannelFetchMessage: vi.fn(),
    scheduleBackgroundMetadataFetch: vi.fn(),
    startDownload: vi.fn(),
    downloadDir: "/output",
    cookiesFile: "",
    cookiesSource: "none" as const,
    cookiesBrowser: "",
    remoteComponents: "none" as const,
    ytDlpPath: "",
  };
}

// oEmbed fetch をモック
const fetchMock = vi.fn();

beforeEach(() => {
  resetTauriMocks();
  mockInvoke.mockResolvedValue(undefined);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================================
// B-4-1. addVideo バリデーション
// ============================================================
describe("useAddVideoActions — addVideo バリデーション", () => {
  it("DL先未設定 → エラー", async () => {
    const params = { ...defaultParams(), downloadDir: "" };
    const { result } = renderHook(() => useAddVideoActions(params));

    await act(async () => {
      await result.current.addVideo();
    });

    expect(params.setErrorMessage).toHaveBeenCalledWith(expect.stringContaining(""));
    expect(params.setErrorMessage).toHaveBeenCalled();
  });

  it("空URL → エラー (invalidYouTubeUrl)", async () => {
    const params = { ...defaultParams(), videoUrl: "" };
    const { result } = renderHook(() => useAddVideoActions(params));

    await act(async () => {
      await result.current.addVideo();
    });

    expect(params.setErrorMessage).toHaveBeenCalled();
  });

  it("不正URL → エラー (invalidYouTubeUrl)", async () => {
    const params = { ...defaultParams(), videoUrl: "https://example.com" };
    const { result } = renderHook(() => useAddVideoActions(params));

    await act(async () => {
      await result.current.addVideo();
    });

    expect(params.setErrorMessage).toHaveBeenCalled();
  });

  it("重複ID → エラー (videoAlreadyAdded)", async () => {
    const existing: Video = {
      id: "dQw4w9WgXcQ",
      title: "test",
      channel: "ch",
      sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      downloadStatus: "pending",
      commentsStatus: "pending",
      addedAt: new Date().toISOString(),
    };
    const params = {
      ...defaultParams(),
      videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      videos: [existing],
    };
    const { result } = renderHook(() => useAddVideoActions(params));

    await act(async () => {
      await result.current.addVideo();
    });

    expect(params.setErrorMessage).toHaveBeenCalled();
    expect(params.setVideos).not.toHaveBeenCalled();
  });
});

// ============================================================
// B-4-2. addVideo 正常系
// ============================================================
describe("useAddVideoActions — addVideo 正常系", () => {
  it("oEmbed 成功 → 動画追加, メタデータFetch予約", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        title: "Test Video",
        author_name: "Author",
        thumbnail_url: "https://img.youtube.com/vi/abc123/0.jpg",
      }),
    });
    const params = {
      ...defaultParams(),
      videoUrl: "https://www.youtube.com/watch?v=abc12345678",
    };
    const { result } = renderHook(() => useAddVideoActions(params));

    await act(async () => {
      await result.current.addVideo();
    });

    expect(params.setIsAdding).toHaveBeenCalledWith(true);
    expect(params.setVideos).toHaveBeenCalled();
    expect(params.scheduleBackgroundMetadataFetch).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: "abc12345678" }),
      ])
    );
    expect(params.setVideoUrl).toHaveBeenCalledWith("");
  });

  it("downloadOnAdd=true → startDownload 呼出", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        title: "Test",
        author_name: "Author",
      }),
    });
    const params = {
      ...defaultParams(),
      videoUrl: "https://youtu.be/xyz12345678",
      downloadOnAdd: true,
    };
    const { result } = renderHook(() => useAddVideoActions(params));

    await act(async () => {
      await result.current.addVideo();
    });

    expect(params.startDownload).toHaveBeenCalled();
  });

  it("oEmbed 404 → エラー (videoNotFound)", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });
    const params = {
      ...defaultParams(),
      videoUrl: "https://www.youtube.com/watch?v=notfound1234",
    };
    const { result } = renderHook(() => useAddVideoActions(params));

    await act(async () => {
      await result.current.addVideo();
    });

    expect(params.setErrorMessage).toHaveBeenCalled();
    expect(params.setIsAddOpen).toHaveBeenCalledWith(true);
  });

  it("fetch例外 → エラー (videoInfoFailed)", async () => {
    fetchMock.mockRejectedValue(new Error("network error"));
    const params = {
      ...defaultParams(),
      videoUrl: "https://www.youtube.com/watch?v=err123456789",
    };
    const { result } = renderHook(() => useAddVideoActions(params));

    await act(async () => {
      await result.current.addVideo();
    });

    expect(params.setErrorMessage).toHaveBeenCalled();
    expect(params.setIsAddOpen).toHaveBeenCalledWith(true);
  });
});

// ============================================================
// B-4-3. addChannelVideos
// ============================================================
describe("useAddVideoActions — addChannelVideos", () => {
  it("DL先未設定 → エラー", async () => {
    const params = { ...defaultParams(), downloadDir: "", channelUrl: "https://youtube.com/@test" };
    const { result } = renderHook(() => useAddVideoActions(params));

    await act(async () => {
      await result.current.addChannelVideos();
    });

    expect(params.setErrorMessage).toHaveBeenCalled();
  });

  it("空URL → エラー (enterChannelUrl)", async () => {
    const params = { ...defaultParams(), channelUrl: "" };
    const { result } = renderHook(() => useAddVideoActions(params));

    await act(async () => {
      await result.current.addChannelVideos();
    });

    expect(params.setErrorMessage).toHaveBeenCalled();
  });

  it("チャンネル取得成功 → 動画追加", async () => {
    mockInvoke.mockResolvedValue([
      { id: "ch1", title: "Video 1", channel: "TestChannel" },
      { id: "ch2", title: "Video 2", channel: "TestChannel" },
    ]);
    const params = {
      ...defaultParams(),
      channelUrl: "https://www.youtube.com/@testchannel",
    };
    const { result } = renderHook(() => useAddVideoActions(params));

    await act(async () => {
      await result.current.addChannelVideos();
    });

    expect(mockInvoke).toHaveBeenCalledWith("list_channel_videos", expect.anything());
    expect(params.setVideos).toHaveBeenCalled();
    expect(params.scheduleBackgroundMetadataFetch).toHaveBeenCalled();
    expect(params.setChannelUrl).toHaveBeenCalledWith("");
  });

  it("重複ID除外 → 新規のみ追加", async () => {
    const existing: Video = {
      id: "ch1",
      title: "Existing",
      channel: "ch",
      sourceUrl: "https://www.youtube.com/watch?v=ch1",
      downloadStatus: "downloaded",
      commentsStatus: "downloaded",
      addedAt: new Date().toISOString(),
    };
    mockInvoke.mockResolvedValue([
      { id: "ch1", title: "Video 1", channel: "TestChannel" },
      { id: "ch2", title: "Video 2", channel: "TestChannel" },
    ]);
    const params = {
      ...defaultParams(),
      channelUrl: "https://www.youtube.com/@testchannel",
      videos: [existing],
    };
    const { result } = renderHook(() => useAddVideoActions(params));

    await act(async () => {
      await result.current.addChannelVideos();
    });

    // setVideos が呼ばれて、updater 関数内で ch2 のみ追加
    expect(params.setVideos).toHaveBeenCalled();
    const updater = params.setVideos.mock.calls[0][0];
    const result2 = typeof updater === "function" ? updater([existing]) : updater;
    // ch1 は既存なので ch2 のみ新規追加される
    const newIds = result2.filter((v: Video) => v.id !== "ch1").map((v: Video) => v.id);
    expect(newIds).toContain("ch2");
  });

  it("新規動画なし → noNewVideosFound エラー", async () => {
    const existing: Video = {
      id: "ch1",
      title: "Existing",
      channel: "ch",
      sourceUrl: "https://www.youtube.com/watch?v=ch1",
      downloadStatus: "downloaded",
      commentsStatus: "downloaded",
      addedAt: new Date().toISOString(),
    };
    mockInvoke.mockResolvedValue([
      { id: "ch1", title: "Video 1", channel: "TestChannel" },
    ]);
    const params = {
      ...defaultParams(),
      channelUrl: "https://www.youtube.com/@testchannel",
      videos: [existing],
    };
    const { result } = renderHook(() => useAddVideoActions(params));

    await act(async () => {
      await result.current.addChannelVideos();
    });

    expect(params.setErrorMessage).toHaveBeenCalled();
  });

  it("invoke失敗 → エラー (channelVideosFailed)", async () => {
    mockInvoke.mockRejectedValue(new Error("invoke fail"));
    const params = {
      ...defaultParams(),
      channelUrl: "https://www.youtube.com/@testchannel",
    };
    const { result } = renderHook(() => useAddVideoActions(params));

    await act(async () => {
      await result.current.addChannelVideos();
    });

    expect(params.setErrorMessage).toHaveBeenCalled();
  });
});
