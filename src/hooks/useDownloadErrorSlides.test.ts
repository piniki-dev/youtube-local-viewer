/**
 * useDownloadErrorSlides テスト
 *
 * エラーのタイトル別集約、フェーズマージ、ソート、インデックスclampを検証。
 */
import { renderHook } from "@testing-library/react";
import { useDownloadErrorSlides } from "./useDownloadErrorSlides";

type FloatingErrorItem = {
  id: string;
  title: string;
  phase: "video" | "comments" | "metadata";
  details: string;
  createdAt: number;
};

function makeItem(overrides: Partial<FloatingErrorItem> = {}): FloatingErrorItem {
  return {
    id: "e1",
    title: "Video 1",
    phase: "video",
    details: "error detail",
    createdAt: 1000,
    ...overrides,
  };
}

describe("useDownloadErrorSlides", () => {
  it("空配列 → slides空, hasDownloadErrors=false", () => {
    const setIndex = vi.fn();
    const { result } = renderHook(() =>
      useDownloadErrorSlides({
        downloadErrorItems: [],
        setDownloadErrorIndex: setIndex,
      })
    );
    expect(result.current.downloadErrorSlides).toEqual([]);
    expect(result.current.hasDownloadErrors).toBe(false);
  });

  it("1件 → 1スライド, hasDownloadErrors=true", () => {
    const setIndex = vi.fn();
    const items = [makeItem()];
    const { result } = renderHook(() =>
      useDownloadErrorSlides({
        downloadErrorItems: items,
        setDownloadErrorIndex: setIndex,
      })
    );
    expect(result.current.downloadErrorSlides).toHaveLength(1);
    expect(result.current.downloadErrorSlides[0].title).toBe("Video 1");
    expect(result.current.downloadErrorSlides[0].video).toBeDefined();
    expect(result.current.hasDownloadErrors).toBe(true);
  });

  it("同一タイトルの複数フェーズ → 1スライドにマージ", () => {
    const setIndex = vi.fn();
    const items = [
      makeItem({ id: "e1", phase: "video", createdAt: 1000 }),
      makeItem({ id: "e2", phase: "comments", createdAt: 2000 }),
      makeItem({ id: "e3", phase: "metadata", createdAt: 3000 }),
    ];
    const { result } = renderHook(() =>
      useDownloadErrorSlides({
        downloadErrorItems: items,
        setDownloadErrorIndex: setIndex,
      })
    );
    expect(result.current.downloadErrorSlides).toHaveLength(1);
    const slide = result.current.downloadErrorSlides[0];
    expect(slide.video).toBeDefined();
    expect(slide.comments).toBeDefined();
    expect(slide.metadata).toBeDefined();
    expect(slide.createdAt).toBe(3000); // 最新のcreatedAt
  });

  it("異なるタイトル → 別スライド", () => {
    const setIndex = vi.fn();
    const items = [
      makeItem({ id: "e1", title: "A", createdAt: 2000 }),
      makeItem({ id: "e2", title: "B", createdAt: 1000 }),
    ];
    const { result } = renderHook(() =>
      useDownloadErrorSlides({
        downloadErrorItems: items,
        setDownloadErrorIndex: setIndex,
      })
    );
    expect(result.current.downloadErrorSlides).toHaveLength(2);
  });

  it("createdAt降順でソート", () => {
    const setIndex = vi.fn();
    const items = [
      makeItem({ id: "e1", title: "Old", createdAt: 1000 }),
      makeItem({ id: "e2", title: "New", createdAt: 5000 }),
      makeItem({ id: "e3", title: "Mid", createdAt: 3000 }),
    ];
    const { result } = renderHook(() =>
      useDownloadErrorSlides({
        downloadErrorItems: items,
        setDownloadErrorIndex: setIndex,
      })
    );
    expect(result.current.downloadErrorSlides[0].title).toBe("New");
    expect(result.current.downloadErrorSlides[1].title).toBe("Mid");
    expect(result.current.downloadErrorSlides[2].title).toBe("Old");
  });

  it("同一フェーズの更新 → 新しいcreatedAtで上書き", () => {
    const setIndex = vi.fn();
    const items = [
      makeItem({ id: "e1", phase: "video", createdAt: 1000, details: "old" }),
      makeItem({ id: "e2", phase: "video", createdAt: 5000, details: "new" }),
    ];
    const { result } = renderHook(() =>
      useDownloadErrorSlides({
        downloadErrorItems: items,
        setDownloadErrorIndex: setIndex,
      })
    );
    expect(result.current.downloadErrorSlides).toHaveLength(1);
    expect(result.current.downloadErrorSlides[0].video!.details).toBe("new");
  });

  it("空配列→setDownloadErrorIndex(0)呼出", () => {
    const setIndex = vi.fn();
    renderHook(() =>
      useDownloadErrorSlides({
        downloadErrorItems: [],
        setDownloadErrorIndex: setIndex,
      })
    );
    expect(setIndex).toHaveBeenCalledWith(0);
  });

  it("スライド数減少→インデックスをclamp", () => {
    const setIndex = vi.fn();
    const items = [
      makeItem({ id: "e1", title: "A", createdAt: 1000 }),
      makeItem({ id: "e2", title: "B", createdAt: 2000 }),
    ];
    renderHook(() =>
      useDownloadErrorSlides({
        downloadErrorItems: items,
        setDownloadErrorIndex: setIndex,
      })
    );
    // effect内のsetDownloadErrorIndexはprev=>clampのコールバック呼出
    const lastCall = setIndex.mock.calls[setIndex.mock.calls.length - 1][0];
    if (typeof lastCall === "function") {
      // prev=10 → clamp to slides.length-1 = 1
      expect(lastCall(10)).toBe(1);
      // prev=0 → stays 0
      expect(lastCall(0)).toBe(0);
    }
  });
});
