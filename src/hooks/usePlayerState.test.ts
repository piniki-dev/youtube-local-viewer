/**
 * findLastCommentIndexFn テスト
 *
 * 二分探索による「指定時刻以下の最後のコメント」検索を検証。
 */
import { findLastCommentIndexFn } from "./usePlayerState";

type Item = { offsetMs?: number };

function makeList(...offsets: (number | undefined)[]): Item[] {
  return offsets.map((offsetMs) => ({ offsetMs }));
}

describe("findLastCommentIndexFn", () => {
  it("空リスト → -1", () => {
    expect(findLastCommentIndexFn([], 1000)).toBe(-1);
  });

  it("全コメントが未来 → -1", () => {
    const list = makeList(5000, 10000, 20000);
    expect(findLastCommentIndexFn(list, 3000)).toBe(-1);
  });

  it("全コメントが過去 → 最後のインデックス", () => {
    const list = makeList(1000, 2000, 3000);
    expect(findLastCommentIndexFn(list, 5000)).toBe(2);
  });

  it("ちょうど一致 → そのインデックス", () => {
    const list = makeList(1000, 2000, 3000, 4000);
    expect(findLastCommentIndexFn(list, 3000)).toBe(2);
  });

  it("中間の時刻 → 直前のインデックス", () => {
    const list = makeList(1000, 2000, 3000, 4000);
    expect(findLastCommentIndexFn(list, 2500)).toBe(1);
  });

  it("1件のみ・時刻以下 → 0", () => {
    const list = makeList(500);
    expect(findLastCommentIndexFn(list, 1000)).toBe(0);
  });

  it("1件のみ・未来 → -1", () => {
    const list = makeList(5000);
    expect(findLastCommentIndexFn(list, 1000)).toBe(-1);
  });

  it("offsetMs=undefined → 0として扱われる", () => {
    const list = makeList(undefined, 2000, 4000);
    // undefined→0、timeMs=1000なので 0番目(0ms)はマッチ
    expect(findLastCommentIndexFn(list, 1000)).toBe(0);
  });

  it("timeMs=0 → offsetMs=0(undefined)のコメントがマッチ", () => {
    const list = makeList(undefined, 1000, 2000);
    expect(findLastCommentIndexFn(list, 0)).toBe(0);
  });

  it("大量データ → 正しい結果（性能確認も兼ねる）", () => {
    const list = Array.from({ length: 10000 }, (_, i) => ({
      offsetMs: i * 100,
    }));
    // 550ms → offsetMs=500のインデックス5
    expect(findLastCommentIndexFn(list, 550)).toBe(5);
    // 最後と一致
    expect(findLastCommentIndexFn(list, 999900)).toBe(9999);
    // 先頭より前
    expect(findLastCommentIndexFn(list, -1)).toBe(-1);
  });

  it("同じoffsetMs複数 → 最後のインデックスを返す", () => {
    const list = makeList(1000, 2000, 2000, 2000, 3000);
    expect(findLastCommentIndexFn(list, 2000)).toBe(3);
  });

  it("timeMs == 先頭 → 0", () => {
    const list = makeList(1000, 2000, 3000);
    expect(findLastCommentIndexFn(list, 1000)).toBe(0);
  });
});
