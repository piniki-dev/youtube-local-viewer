import { renderHook } from "@testing-library/react";
import { useVideoFiltering } from "./useVideoFiltering";
import { getVideoSortTime } from "../utils/formatters";

type VideoLike = {
  id: string;
  title: string;
  channel: string;
  description?: string;
  tags?: string[];
  categories?: string[];
  publishedAt?: string;
  addedAt: string;
  contentType?: "video" | "live" | "shorts";
  favorite?: boolean;
  downloadStatus: "pending" | "downloading" | "downloaded" | "failed";
};

const makeVideo = (overrides: Partial<VideoLike> & { id: string }): VideoLike => ({
  title: "Default Title",
  channel: "Default Channel",
  addedAt: "2024-01-01T00:00:00Z",
  downloadStatus: "pending",
  ...overrides,
});

type IndexedVideo = VideoLike & { searchText: string; sortTime: number };

const defaultParams = (
  videos: VideoLike[],
  overrides: Partial<Parameters<typeof useVideoFiltering<VideoLike>>[0]> = {}
) => ({
  videos,
  downloadFilter: "all" as const,
  typeFilter: "all" as const,
  publishedSort: "published-desc" as const,
  favoriteFilter: "all" as const,
  deferredSearchQuery: "",
  indexedVideosRef: { current: [] as IndexedVideo[] },
  sortedVideosRef: { current: [] as IndexedVideo[] },
  filteredVideosRef: { current: [] as IndexedVideo[] },
  getVideoSortTime,
  ...overrides,
});

// =============================================================
// B-5-1. フィルタリング
// =============================================================
describe("useVideoFiltering — フィルタリング", () => {
  const downloaded = makeVideo({ id: "v1", downloadStatus: "downloaded" });
  const pending = makeVideo({ id: "v2", downloadStatus: "pending" });
  const failed = makeVideo({ id: "v3", downloadStatus: "failed" });

  it('downloadFilter="all" → 全て表示', () => {
    const { result } = renderHook(() =>
      useVideoFiltering(defaultParams([downloaded, pending, failed]))
    );
    expect(result.current.filteredVideos).toHaveLength(3);
  });

  it('downloadFilter="downloaded" → downloadedのみ', () => {
    const { result } = renderHook(() =>
      useVideoFiltering(
        defaultParams([downloaded, pending, failed], {
          downloadFilter: "downloaded",
        })
      )
    );
    expect(result.current.filteredVideos).toHaveLength(1);
    expect(result.current.filteredVideos[0].id).toBe("v1");
  });

  it('downloadFilter="undownloaded" → downloaded以外', () => {
    const { result } = renderHook(() =>
      useVideoFiltering(
        defaultParams([downloaded, pending, failed], {
          downloadFilter: "undownloaded",
        })
      )
    );
    expect(result.current.filteredVideos).toHaveLength(2);
    expect(result.current.filteredVideos.map((v) => v.id)).toEqual(
      expect.arrayContaining(["v2", "v3"])
    );
  });

  it('typeFilter="video" → videoのみ', () => {
    const videos = [
      makeVideo({ id: "v1", contentType: "video" }),
      makeVideo({ id: "v2", contentType: "live" }),
      makeVideo({ id: "v3", contentType: "shorts" }),
    ];
    const { result } = renderHook(() =>
      useVideoFiltering(defaultParams(videos, { typeFilter: "video" }))
    );
    expect(result.current.filteredVideos).toHaveLength(1);
    expect(result.current.filteredVideos[0].id).toBe("v1");
  });

  it('typeFilter="live" → liveのみ', () => {
    const videos = [
      makeVideo({ id: "v1", contentType: "video" }),
      makeVideo({ id: "v2", contentType: "live" }),
      makeVideo({ id: "v3", contentType: "shorts" }),
    ];
    const { result } = renderHook(() =>
      useVideoFiltering(defaultParams(videos, { typeFilter: "live" }))
    );
    expect(result.current.filteredVideos).toHaveLength(1);
    expect(result.current.filteredVideos[0].id).toBe("v2");
  });

  it('typeFilter="shorts" → shortsのみ', () => {
    const videos = [
      makeVideo({ id: "v1", contentType: "video" }),
      makeVideo({ id: "v2", contentType: "live" }),
      makeVideo({ id: "v3", contentType: "shorts" }),
    ];
    const { result } = renderHook(() =>
      useVideoFiltering(defaultParams(videos, { typeFilter: "shorts" }))
    );
    expect(result.current.filteredVideos).toHaveLength(1);
    expect(result.current.filteredVideos[0].id).toBe("v3");
  });

  it('favoriteFilter="favorite" → お気に入りのみ', () => {
    const videos = [
      makeVideo({ id: "v1", favorite: true }),
      makeVideo({ id: "v2", favorite: false }),
    ];
    const { result } = renderHook(() =>
      useVideoFiltering(
        defaultParams(videos, { favoriteFilter: "favorite" })
      )
    );
    expect(result.current.filteredVideos).toHaveLength(1);
    expect(result.current.filteredVideos[0].id).toBe("v1");
  });

  it('favoriteFilter="all" → 全て', () => {
    const videos = [
      makeVideo({ id: "v1", favorite: true }),
      makeVideo({ id: "v2", favorite: false }),
    ];
    const { result } = renderHook(() =>
      useVideoFiltering(defaultParams(videos, { favoriteFilter: "all" }))
    );
    expect(result.current.filteredVideos).toHaveLength(2);
  });

  it("検索: 単一トークン（タイトル一致）", () => {
    const videos = [
      makeVideo({ id: "v1", title: "React Tutorial" }),
      makeVideo({ id: "v2", title: "Vue Guide" }),
    ];
    const { result } = renderHook(() =>
      useVideoFiltering(
        defaultParams(videos, { deferredSearchQuery: "react" })
      )
    );
    expect(result.current.filteredVideos).toHaveLength(1);
    expect(result.current.filteredVideos[0].id).toBe("v1");
  });

  it("検索: 複数トークン（AND検索）", () => {
    const videos = [
      makeVideo({ id: "v1", title: "React Music Tutorial" }),
      makeVideo({ id: "v2", title: "React Guide" }),
    ];
    const { result } = renderHook(() =>
      useVideoFiltering(
        defaultParams(videos, { deferredSearchQuery: "react music" })
      )
    );
    expect(result.current.filteredVideos).toHaveLength(1);
    expect(result.current.filteredVideos[0].id).toBe("v1");
  });

  it("検索: チャンネル名一致", () => {
    const videos = [
      makeVideo({ id: "v1", channel: "TechChannel", title: "Video A" }),
      makeVideo({ id: "v2", channel: "MusicChannel", title: "Video B" }),
    ];
    const { result } = renderHook(() =>
      useVideoFiltering(
        defaultParams(videos, { deferredSearchQuery: "techchannel" })
      )
    );
    expect(result.current.filteredVideos).toHaveLength(1);
    expect(result.current.filteredVideos[0].id).toBe("v1");
  });

  it("検索: 動画ID一致", () => {
    const videos = [
      makeVideo({ id: "abc123", title: "Some Video" }),
      makeVideo({ id: "xyz789", title: "Other Video" }),
    ];
    const { result } = renderHook(() =>
      useVideoFiltering(
        defaultParams(videos, { deferredSearchQuery: "abc123" })
      )
    );
    expect(result.current.filteredVideos).toHaveLength(1);
    expect(result.current.filteredVideos[0].id).toBe("abc123");
  });

  it("検索: タグ一致", () => {
    const videos = [
      makeVideo({ id: "v1", title: "A", tags: ["music", "pop"] }),
      makeVideo({ id: "v2", title: "B", tags: ["cooking"] }),
    ];
    const { result } = renderHook(() =>
      useVideoFiltering(
        defaultParams(videos, { deferredSearchQuery: "pop" })
      )
    );
    expect(result.current.filteredVideos).toHaveLength(1);
    expect(result.current.filteredVideos[0].id).toBe("v1");
  });

  it("検索: 大文字小文字を区別しない", () => {
    const videos = [
      makeVideo({ id: "v1", title: "test video" }),
      makeVideo({ id: "v2", title: "other" }),
    ];
    const { result } = renderHook(() =>
      useVideoFiltering(
        defaultParams(videos, { deferredSearchQuery: "TEST" })
      )
    );
    expect(result.current.filteredVideos).toHaveLength(1);
    expect(result.current.filteredVideos[0].id).toBe("v1");
  });

  it("複合フィルタ (downloaded + live + keyword)", () => {
    const videos = [
      makeVideo({
        id: "v1",
        downloadStatus: "downloaded",
        contentType: "live",
        title: "Live Stream Match",
      }),
      makeVideo({
        id: "v2",
        downloadStatus: "downloaded",
        contentType: "video",
        title: "Live in title",
      }),
      makeVideo({
        id: "v3",
        downloadStatus: "pending",
        contentType: "live",
        title: "Live Stream Other",
      }),
    ];
    const { result } = renderHook(() =>
      useVideoFiltering(
        defaultParams(videos, {
          downloadFilter: "downloaded",
          typeFilter: "live",
          deferredSearchQuery: "match",
        })
      )
    );
    expect(result.current.filteredVideos).toHaveLength(1);
    expect(result.current.filteredVideos[0].id).toBe("v1");
  });
});

// =============================================================
// B-5-2. ソート
// =============================================================
describe("useVideoFiltering — ソート", () => {
  it("published-desc → 新しい順", () => {
    const videos = [
      makeVideo({
        id: "v1",
        publishedAt: "2024-01-01T00:00:00Z",
        addedAt: "2024-01-01T00:00:00Z",
      }),
      makeVideo({
        id: "v2",
        publishedAt: "2024-06-01T00:00:00Z",
        addedAt: "2024-06-01T00:00:00Z",
      }),
    ];
    const { result } = renderHook(() =>
      useVideoFiltering(
        defaultParams(videos, { publishedSort: "published-desc" })
      )
    );
    expect(result.current.sortedVideos[0].id).toBe("v2");
    expect(result.current.sortedVideos[1].id).toBe("v1");
  });

  it("published-asc → 古い順", () => {
    const videos = [
      makeVideo({
        id: "v1",
        publishedAt: "2024-01-01T00:00:00Z",
        addedAt: "2024-01-01T00:00:00Z",
      }),
      makeVideo({
        id: "v2",
        publishedAt: "2024-06-01T00:00:00Z",
        addedAt: "2024-06-01T00:00:00Z",
      }),
    ];
    const { result } = renderHook(() =>
      useVideoFiltering(
        defaultParams(videos, { publishedSort: "published-asc" })
      )
    );
    expect(result.current.sortedVideos[0].id).toBe("v1");
    expect(result.current.sortedVideos[1].id).toBe("v2");
  });

  it("同一publishedAt → addedAt降順で2次ソート", () => {
    const videos = [
      makeVideo({
        id: "v1",
        publishedAt: "2024-01-01T00:00:00Z",
        addedAt: "2024-01-01T00:00:00Z",
      }),
      makeVideo({
        id: "v2",
        publishedAt: "2024-01-01T00:00:00Z",
        addedAt: "2024-01-02T00:00:00Z",
      }),
    ];
    const { result } = renderHook(() =>
      useVideoFiltering(
        defaultParams(videos, { publishedSort: "published-desc" })
      )
    );
    // v2 has later addedAt → should come first
    expect(result.current.sortedVideos[0].id).toBe("v2");
    expect(result.current.sortedVideos[1].id).toBe("v1");
  });
});

// =============================================================
// B-5-3. hasUndownloaded
// =============================================================
describe("useVideoFiltering — hasUndownloaded", () => {
  it("全downloaded → false", () => {
    const videos = [
      makeVideo({ id: "v1", downloadStatus: "downloaded" }),
      makeVideo({ id: "v2", downloadStatus: "downloaded" }),
    ];
    const { result } = renderHook(() =>
      useVideoFiltering(defaultParams(videos))
    );
    expect(result.current.hasUndownloaded).toBe(false);
  });

  it("1つpending → true", () => {
    const videos = [
      makeVideo({ id: "v1", downloadStatus: "downloaded" }),
      makeVideo({ id: "v2", downloadStatus: "pending" }),
    ];
    const { result } = renderHook(() =>
      useVideoFiltering(defaultParams(videos))
    );
    expect(result.current.hasUndownloaded).toBe(true);
  });

  it("空配列 → false", () => {
    const { result } = renderHook(() =>
      useVideoFiltering(defaultParams([]))
    );
    expect(result.current.hasUndownloaded).toBe(false);
  });
});

// =============================================================
// B-5-4. searchText構築
// =============================================================
describe("useVideoFiltering — searchText構築", () => {
  it("全フィールドが結合される", () => {
    const videos = [
      makeVideo({
        id: "v1",
        title: "MyTitle",
        channel: "MyChannel",
        description: "MyDescription",
        tags: ["tag1", "tag2"],
        categories: ["cat1"],
      }),
    ];
    const { result } = renderHook(() =>
      useVideoFiltering(defaultParams(videos))
    );
    const searchText = result.current.indexedVideos[0].searchText;
    expect(searchText).toContain("mytitle");
    expect(searchText).toContain("mychannel");
    expect(searchText).toContain("mydescription");
    expect(searchText).toContain("v1");
    expect(searchText).toContain("tag1");
    expect(searchText).toContain("tag2");
    expect(searchText).toContain("cat1");
  });

  it("nullフィールドは除外される", () => {
    const videos = [
      makeVideo({
        id: "v1",
        title: "Title",
        channel: "Channel",
        description: undefined,
        tags: undefined,
      }),
    ];
    const { result } = renderHook(() =>
      useVideoFiltering(defaultParams(videos))
    );
    const searchText = result.current.indexedVideos[0].searchText;
    expect(searchText).toContain("title");
    expect(searchText).toContain("channel");
    expect(searchText).not.toContain("undefined");
  });

  it("すべて小文字化される", () => {
    const videos = [
      makeVideo({
        id: "V1",
        title: "UPPER CASE",
        channel: "MiXeD",
      }),
    ];
    const { result } = renderHook(() =>
      useVideoFiltering(defaultParams(videos))
    );
    const searchText = result.current.indexedVideos[0].searchText;
    expect(searchText).toBe(searchText.toLowerCase());
  });
});
