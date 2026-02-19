import {
  formatClock,
  formatDuration,
  formatPublishedAt,
  getVideoSortTime,
  parseDateValue,
} from "./formatters";

// =============================================================
// A-1-1. formatDuration
// =============================================================
describe("formatDuration", () => {
  it("秒のみ (45 → 0:45)", () => {
    expect(formatDuration(45)).toBe("0:45");
  });

  it("分+秒 (125 → 2:05) 秒のゼロ埋め確認", () => {
    expect(formatDuration(125)).toBe("2:05");
  });

  it("時+分+秒 (3661 → 1:01:01)", () => {
    expect(formatDuration(3661)).toBe("1:01:01");
  });

  it("ゼロ (0 → 0:00)", () => {
    expect(formatDuration(0)).toBe("0:00");
  });

  it("null → 空文字列", () => {
    expect(formatDuration(null)).toBe("");
  });

  it("undefined → 空文字列", () => {
    expect(formatDuration(undefined)).toBe("");
  });

  it("NaN → 空文字列", () => {
    expect(formatDuration(NaN)).toBe("");
  });

  it("24時間 (86400 → 24:00:00)", () => {
    expect(formatDuration(86400)).toBe("24:00:00");
  });
});

// =============================================================
// A-1-2. formatClock
// =============================================================
describe("formatClock", () => {
  it("通常 (65000ms → 1:05)", () => {
    expect(formatClock(65000)).toBe("1:05");
  });

  it("ゼロ (0 → 0:00)", () => {
    expect(formatClock(0)).toBe("0:00");
  });

  it("null → 空文字列", () => {
    expect(formatClock(null)).toBe("");
  });

  it("負の値 (-1000 → 0:00)", () => {
    expect(formatClock(-1000)).toBe("0:00");
  });

  it("undefined → 空文字列", () => {
    expect(formatClock(undefined)).toBe("");
  });
});

// =============================================================
// A-1-3. parseDateValue
// =============================================================
describe("parseDateValue", () => {
  it("ISO文字列 → ミリ秒数値", () => {
    const result = parseDateValue("2024-01-15T00:00:00Z");
    expect(result).toBe(new Date("2024-01-15T00:00:00Z").getTime());
  });

  it("Unix秒(10桁) → ミリ秒に変換", () => {
    expect(parseDateValue("1705276800")).toBe(1705276800000);
  });

  it("ミリ秒(13桁) → そのまま返却", () => {
    expect(parseDateValue("1705276800000")).toBe(1705276800000);
  });

  it("空文字列 → null", () => {
    expect(parseDateValue("")).toBe(null);
  });

  it("undefined → null", () => {
    expect(parseDateValue(undefined)).toBe(null);
  });

  it("不正文字列 → null", () => {
    expect(parseDateValue("invalid")).toBe(null);
  });

  it("空白のみ → null", () => {
    expect(parseDateValue("  ")).toBe(null);
  });
});

// =============================================================
// A-1-4. getVideoSortTime
// =============================================================
describe("getVideoSortTime", () => {
  it("publishedAt優先", () => {
    const result = getVideoSortTime({
      publishedAt: "2024-01-15T00:00:00Z",
      addedAt: "2024-01-20T00:00:00Z",
    });
    expect(result).toBe(new Date("2024-01-15T00:00:00Z").getTime());
  });

  it("addedAtフォールバック", () => {
    const result = getVideoSortTime({ addedAt: "2024-01-20T00:00:00Z" });
    expect(result).toBe(new Date("2024-01-20T00:00:00Z").getTime());
  });

  it("両方なし → 0", () => {
    expect(getVideoSortTime({ addedAt: "" })).toBe(0);
  });
});

// =============================================================
// A-1-5. formatPublishedAt
// =============================================================
describe("formatPublishedAt", () => {
  it("ISO文字列 → ja-JPロケール文字列", () => {
    const result = formatPublishedAt("2024-01-15T00:00:00Z");
    expect(result).toBeTruthy();
    // Should be a locale-formatted string, not empty
    expect(result.length).toBeGreaterThan(0);
  });

  it("undefined → 空文字列", () => {
    expect(formatPublishedAt(undefined)).toBe("");
  });

  it("空文字列 → 空文字列", () => {
    expect(formatPublishedAt("")).toBe("");
  });
});
