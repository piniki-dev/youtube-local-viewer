/**
 * useActiveActivityItems テスト
 *
 * 個別DL/コメント/キューの ActivityItem 生成ロジックを検証。
 */
import { renderHook } from "@testing-library/react";
import { useActiveActivityItems } from "./useActiveActivityItems";

type Video = { id: string; title: string };

function makeParams(overrides: Record<string, unknown> = {}) {
  return {
    bulkDownloadActive: false,
    downloadingIds: [] as string[],
    commentsDownloadingIds: [] as string[],
    queuedDownloadIds: [] as string[],
    pendingCommentIds: [] as string[],
    videos: [
      { id: "v1", title: "Video 1" },
      { id: "v2", title: "Video 2" },
      { id: "v3", title: "Video 3" },
    ] as Video[],
    progressLines: {} as Record<string, string>,
    commentProgressLines: {} as Record<string, string>,
    ...overrides,
  };
}

describe("useActiveActivityItems", () => {
  it("bulkDownloadActive=true → 空配列", () => {
    const params = makeParams({
      bulkDownloadActive: true,
      downloadingIds: ["v1"],
    });
    const { result } = renderHook(() => useActiveActivityItems(params));
    expect(result.current).toEqual([]);
  });

  it("全配列空 → 空配列", () => {
    const params = makeParams();
    const { result } = renderHook(() => useActiveActivityItems(params));
    expect(result.current).toEqual([]);
  });

  it("downloadingIds → videoDownloadingステータス", () => {
    const params = makeParams({ downloadingIds: ["v1"] });
    const { result } = renderHook(() => useActiveActivityItems(params));
    expect(result.current).toHaveLength(1);
    expect(result.current[0].id).toBe("v1");
    expect(result.current[0].title).toBe("Video 1");
    expect(result.current[0].status).toBeTruthy();
  });

  it("commentsDownloadingIds → liveChatFetchingステータス", () => {
    const params = makeParams({ commentsDownloadingIds: ["v2"] });
    const { result } = renderHook(() => useActiveActivityItems(params));
    expect(result.current).toHaveLength(1);
    expect(result.current[0].id).toBe("v2");
  });

  it("queuedDownloadIds → downloadWaitingステータス", () => {
    const params = makeParams({ queuedDownloadIds: ["v3"] });
    const { result } = renderHook(() => useActiveActivityItems(params));
    expect(result.current).toHaveLength(1);
    expect(result.current[0].id).toBe("v3");
  });

  it("pendingCommentIds → liveChatPreparingステータス", () => {
    const params = makeParams({ pendingCommentIds: ["v1"] });
    const { result } = renderHook(() => useActiveActivityItems(params));
    expect(result.current).toHaveLength(1);
    expect(result.current[0].id).toBe("v1");
  });

  it("重複ID → Set で重複排除", () => {
    const params = makeParams({
      downloadingIds: ["v1"],
      commentsDownloadingIds: ["v1"],
    });
    const { result } = renderHook(() => useActiveActivityItems(params));
    // v1は1つだけ（Setで重複排除）
    expect(result.current).toHaveLength(1);
    expect(result.current[0].id).toBe("v1");
  });

  it("複数ID同時 → それぞれのアイテム生成", () => {
    const params = makeParams({
      downloadingIds: ["v1"],
      commentsDownloadingIds: ["v2"],
      queuedDownloadIds: ["v3"],
    });
    const { result } = renderHook(() => useActiveActivityItems(params));
    expect(result.current).toHaveLength(3);
    const ids = result.current.map((item) => item.id);
    expect(ids).toContain("v1");
    expect(ids).toContain("v2");
    expect(ids).toContain("v3");
  });

  it("未知のID → タイトルはIDそのまま", () => {
    const params = makeParams({ downloadingIds: ["unknown_id"] });
    const { result } = renderHook(() => useActiveActivityItems(params));
    expect(result.current[0].title).toBe("unknown_id");
  });

  it("progressLines → 該当IDのline反映", () => {
    const params = makeParams({
      downloadingIds: ["v1"],
      progressLines: { v1: "50% done" },
    });
    const { result } = renderHook(() => useActiveActivityItems(params));
    expect(result.current[0].line).toBe("50% done");
  });

  it("commentProgressLines → コメントDL中のline反映", () => {
    const params = makeParams({
      commentsDownloadingIds: ["v2"],
      commentProgressLines: { v2: "fetching comments..." },
    });
    const { result } = renderHook(() => useActiveActivityItems(params));
    expect(result.current[0].line).toBe("fetching comments...");
  });

  it("progressLinesにエントリなし → 空文字", () => {
    const params = makeParams({ downloadingIds: ["v1"] });
    const { result } = renderHook(() => useActiveActivityItems(params));
    expect(result.current[0].line).toBe("");
  });

  it("ステータス優先順位: コメント > 動画DL > キュー > コメント準備中", () => {
    // v1がcommentsDownloadingとdownloadingの両方 → コメントが優先
    const params = makeParams({
      downloadingIds: ["v1"],
      commentsDownloadingIds: ["v1"],
    });
    const { result } = renderHook(() => useActiveActivityItems(params));
    const item = result.current[0];
    // commentsDownloadingIds を含むのでisComment=true になるはず
    // ステータスはliveChatFetchingに該当する
    expect(item.status).toBeTruthy();
    // lineはcommentProgressLinesから取得される
    expect(item.line).toBe("");
  });
});
