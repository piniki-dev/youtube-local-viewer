import {
  formatClock,
  formatDuration,
  formatPublishedAt,
  getVideoSortTime,
} from "./formatters";

describe("formatDuration", () => {
  it("formats seconds into mm:ss", () => {
    expect(formatDuration(90)).toBe("1:30");
  });

  it("formats seconds into h:mm:ss", () => {
    expect(formatDuration(3661)).toBe("1:01:01");
  });

  it("returns empty string on invalid input", () => {
    expect(formatDuration(undefined)).toBe("");
    expect(formatDuration(NaN)).toBe("");
  });
});

describe("formatClock", () => {
  it("formats milliseconds into mm:ss", () => {
    expect(formatClock(61000)).toBe("1:01");
  });

  it("clamps negative values to 0", () => {
    expect(formatClock(-1000)).toBe("0:00");
  });
});

describe("getVideoSortTime", () => {
  it("prefers published date when available", () => {
    expect(
      getVideoSortTime({ publishedAt: "2024-01-02T00:00:00Z", addedAt: "1" })
    ).toBe(1704153600000);
  });

  it("falls back to added date", () => {
    expect(getVideoSortTime({ addedAt: "1710000000" })).toBe(1710000000000);
  });
});

describe("formatPublishedAt", () => {
  it("returns trimmed fallback on invalid input", () => {
    expect(formatPublishedAt("  not-a-date  ")).toBe("not-a-date");
  });
});
