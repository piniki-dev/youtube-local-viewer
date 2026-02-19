import {
  parseVideoId,
  parseUploadDate,
  parseTimestamp,
  deriveContentType,
  isCurrentlyLive,
  buildMetadataFields,
  guessThumbnailExtension,
  deriveUploaderHandle,
  buildThumbnailCandidates,
} from "./metadataHelpers";

// =============================================================
// A-2-1. parseVideoId
// =============================================================
describe("parseVideoId", () => {
  it("標準watch URL", () => {
    expect(parseVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ"
    );
  });

  it("短縮URL (youtu.be)", () => {
    expect(parseVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("shorts URL", () => {
    expect(parseVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ"
    );
  });

  it("live URL", () => {
    expect(parseVideoId("https://www.youtube.com/live/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ"
    );
  });

  it("embed URL", () => {
    expect(parseVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ"
    );
  });

  it("youtube-nocookie embed", () => {
    expect(
      parseVideoId("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ")
    ).toBe("dQw4w9WgXcQ");
  });

  it("パラメータ付きURL", () => {
    expect(
      parseVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120")
    ).toBe("dQw4w9WgXcQ");
  });

  it("モバイルURL (m.youtube.com)", () => {
    expect(parseVideoId("https://m.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ"
    );
  });

  it("非YouTubeホスト → null", () => {
    expect(parseVideoId("https://example.com/watch?v=abc")).toBe(null);
  });

  it("空文字列 → null", () => {
    expect(parseVideoId("")).toBe(null);
  });

  it("URLでない文字列 → null", () => {
    expect(parseVideoId("dQw4w9WgXcQ")).toBe(null);
  });

  it("youtu.beサブドメイン (www.youtu.be)", () => {
    expect(parseVideoId("https://www.youtu.be/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ"
    );
  });
});

// =============================================================
// A-2-2. parseUploadDate
// =============================================================
describe("parseUploadDate", () => {
  it("8桁日付 → ISO文字列", () => {
    expect(parseUploadDate("20240115")).toBe("2024-01-15T00:00:00.000Z");
  });

  it("null → undefined", () => {
    expect(parseUploadDate(null)).toBeUndefined();
  });

  it("空文字列 → undefined", () => {
    expect(parseUploadDate("")).toBeUndefined();
  });

  it("不正形式 → undefined", () => {
    expect(parseUploadDate("2024-01")).toBeUndefined();
  });

  it("空白のみ → undefined", () => {
    expect(parseUploadDate("  ")).toBeUndefined();
  });
});

// =============================================================
// A-2-3. parseTimestamp
// =============================================================
describe("parseTimestamp", () => {
  it("有効なUnix秒 → ISO文字列", () => {
    const result = parseTimestamp(1705276800);
    expect(result).toBe(new Date(1705276800 * 1000).toISOString());
  });

  it("null → undefined", () => {
    expect(parseTimestamp(null)).toBeUndefined();
  });

  it("Infinity → undefined", () => {
    expect(parseTimestamp(Infinity)).toBeUndefined();
  });

  it("NaN → undefined", () => {
    expect(parseTimestamp(NaN)).toBeUndefined();
  });
});

// =============================================================
// A-2-4. deriveContentType
// =============================================================
describe("deriveContentType", () => {
  it('isLive=true → "live"', () => {
    expect(deriveContentType({ isLive: true })).toBe("live");
  });

  it('liveStatus="is_live" → "live"', () => {
    expect(deriveContentType({ liveStatus: "is_live" })).toBe("live");
  });

  it('liveStatus="is_upcoming" → "live"', () => {
    expect(deriveContentType({ liveStatus: "is_upcoming" })).toBe("live");
  });

  it('liveStatus="was_live" → "live"', () => {
    expect(deriveContentType({ liveStatus: "was_live" })).toBe("live");
  });

  it('liveStatus="post_live" → "live"', () => {
    expect(deriveContentType({ liveStatus: "post_live" })).toBe("live");
  });

  it('shorts URL → "shorts"', () => {
    expect(
      deriveContentType({
        webpageUrl: "https://youtube.com/shorts/abc",
      })
    ).toBe("shorts");
  });

  it('60秒以下 → "shorts"', () => {
    expect(deriveContentType({ durationSec: 30 })).toBe("shorts");
  });

  it('61秒 → "video" (境界値)', () => {
    expect(deriveContentType({ durationSec: 61 })).toBe("video");
  });

  it('条件なし → "video"', () => {
    expect(deriveContentType({})).toBe("video");
  });

  it("大文字小文字混在 (IS_LIVE) → live", () => {
    expect(deriveContentType({ liveStatus: "IS_LIVE" })).toBe("live");
  });
});

// =============================================================
// A-2-5. isCurrentlyLive
// =============================================================
describe("isCurrentlyLive", () => {
  it("isLive=true → true", () => {
    expect(isCurrentlyLive({ isLive: true })).toBe(true);
  });

  it('is_live → true', () => {
    expect(isCurrentlyLive({ liveStatus: "is_live" })).toBe(true);
  });

  it('is_upcoming → true', () => {
    expect(isCurrentlyLive({ liveStatus: "is_upcoming" })).toBe(true);
  });

  it('was_live → false', () => {
    expect(isCurrentlyLive({ liveStatus: "was_live" })).toBe(false);
  });

  it("何もなし → false", () => {
    expect(isCurrentlyLive({})).toBe(false);
  });
});

// =============================================================
// A-2-6. buildMetadataFields
// =============================================================
describe("buildMetadataFields", () => {
  it("全フィールド入力 → 正しくマッピング", () => {
    const result = buildMetadataFields({
      webpageUrl: "https://youtube.com/watch?v=abc",
      durationSec: 120,
      uploadDate: "20240115",
      releaseTimestamp: 1705276800,
      timestamp: 1705276000,
      liveStatus: null,
      isLive: false,
      wasLive: false,
      viewCount: 1000,
      likeCount: 50,
      commentCount: 10,
      tags: ["music", "pop"],
      categories: ["Music"],
      description: "Test description",
      channelId: "UC123",
      uploaderId: "@user",
      channelUrl: "https://youtube.com/@channel",
      uploaderUrl: "https://youtube.com/@user",
      availability: "public",
      language: "ja",
      audioLanguage: "ja",
      ageLimit: 0,
    });
    expect(result.contentType).toBe("video");
    expect(result.durationSec).toBe(120);
    expect(result.viewCount).toBe(1000);
    expect(result.likeCount).toBe(50);
    expect(result.tags).toEqual(["music", "pop"]);
    expect(result.categories).toEqual(["Music"]);
    expect(result.description).toBe("Test description");
    expect(result.channelId).toBe("UC123");
    expect(result.availability).toBe("public");
  });

  it("全null入力 → contentType=video, undefinedフィールド", () => {
    const result = buildMetadataFields({});
    expect(result.contentType).toBe("video");
    expect(result.publishedAt).toBeUndefined();
    expect(result.durationSec).toBeUndefined();
    expect(result.tags).toBeUndefined();
  });

  it("publishedAt優先順位: releaseTimestamp > timestamp > uploadDate", () => {
    const result = buildMetadataFields({
      releaseTimestamp: 1705276800,
      timestamp: 1705276000,
      uploadDate: "20240114",
    });
    expect(result.publishedAt).toBe(new Date(1705276800 * 1000).toISOString());
  });

  it("releaseTimestampのみ → publishedAt生成", () => {
    const result = buildMetadataFields({ releaseTimestamp: 1705276800 });
    expect(result.publishedAt).toBe(new Date(1705276800 * 1000).toISOString());
  });

  it("timestampのみ → publishedAt生成", () => {
    const result = buildMetadataFields({ timestamp: 1705276000 });
    expect(result.publishedAt).toBe(new Date(1705276000 * 1000).toISOString());
  });

  it("uploadDateのみ → publishedAt生成", () => {
    const result = buildMetadataFields({ uploadDate: "20240115" });
    expect(result.publishedAt).toBe("2024-01-15T00:00:00.000Z");
  });

  it("ライブ配信メタデータ → contentType=live", () => {
    const result = buildMetadataFields({ isLive: true });
    expect(result.contentType).toBe("live");
  });

  it("Shortsメタデータ → contentType=shorts", () => {
    const result = buildMetadataFields({
      webpageUrl: "https://youtube.com/shorts/abc",
    });
    expect(result.contentType).toBe("shorts");
  });
});

// =============================================================
// A-2-7. guessThumbnailExtension
// =============================================================
describe("guessThumbnailExtension", () => {
  it("Content-Type: image/jpeg → jpg", () => {
    expect(guessThumbnailExtension("url", "image/jpeg")).toBe("jpg");
  });

  it("Content-Type: image/png → png", () => {
    expect(guessThumbnailExtension("url", "image/png")).toBe("png");
  });

  it("Content-Type: image/webp → webp", () => {
    expect(guessThumbnailExtension("url", "image/webp")).toBe("webp");
  });

  it("Content-Type: image/gif → gif", () => {
    expect(guessThumbnailExtension("url", "image/gif")).toBe("gif");
  });

  it("URLの拡張子から推測", () => {
    expect(guessThumbnailExtension("thumb.png?v=1", null)).toBe("png");
  });

  it("jpeg → jpg 変換", () => {
    expect(guessThumbnailExtension("thumb.jpeg", null)).toBe("jpg");
  });

  it("デフォルト → jpg", () => {
    expect(guessThumbnailExtension("thumb", null)).toBe("jpg");
  });
});

// =============================================================
// A-2-8. deriveUploaderHandle
// =============================================================
describe("deriveUploaderHandle", () => {
  it("@始まりID → そのまま返す", () => {
    expect(deriveUploaderHandle("@user", null, null)).toBe("@user");
  });

  it("uploaderURLからハンドル抽出", () => {
    expect(
      deriveUploaderHandle(null, "https://youtube.com/@handle", null)
    ).toBe("@handle");
  });

  it("channelURLフォールバック", () => {
    expect(
      deriveUploaderHandle(null, null, "https://youtube.com/@ch")
    ).toBe("@ch");
  });

  it("すべてnull → null", () => {
    expect(deriveUploaderHandle(null, null, null)).toBeNull();
  });

  it("空文字列のID → uploaderURLフォールバック", () => {
    expect(
      deriveUploaderHandle("", "https://youtube.com/@h", null)
    ).toBe("@h");
  });
});

// =============================================================
// A-2-9. buildThumbnailCandidates
// =============================================================
describe("buildThumbnailCandidates", () => {
  it("primary指定あり → 4要素", () => {
    const result = buildThumbnailCandidates("abc", "https://example.com/thumb.jpg");
    expect(result).toHaveLength(4);
    expect(result[0]).toBe("https://i.ytimg.com/vi/abc/maxresdefault.jpg");
    expect(result[1]).toBe("https://i.ytimg.com/vi/abc/sddefault.jpg");
    expect(result[2]).toBe("https://example.com/thumb.jpg");
    expect(result[3]).toBe("https://i.ytimg.com/vi/abc/hqdefault.jpg");
  });

  it("primary=null → 3番目がnull", () => {
    const result = buildThumbnailCandidates("abc", null);
    expect(result[2]).toBeNull();
  });

  it("IDがURLに反映される", () => {
    const result = buildThumbnailCandidates("xyz123");
    expect(result[0]).toContain("xyz123");
    expect(result[1]).toContain("xyz123");
    expect(result[3]).toContain("xyz123");
  });
});
