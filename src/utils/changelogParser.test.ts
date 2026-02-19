import {
  extractLocalizedNotes,
  changelogMarkdownToHtml,
} from "./changelogParser";

// =============================================================
// A-3-1. extractLocalizedNotes
// =============================================================
describe("extractLocalizedNotes", () => {
  it("JSON内の指定言語を返す", () => {
    const body = JSON.stringify({ ja: "修正ログ", en: "Fix log" });
    expect(extractLocalizedNotes(body, "ja")).toBe("修正ログ");
  });

  it("指定言語がなければ en フォールバック", () => {
    const body = JSON.stringify({ en: "English log" });
    expect(extractLocalizedNotes(body, "ja")).toBe("English log");
  });

  it("ベース言語へのフォールバック (ja-JP → ja)", () => {
    const body = JSON.stringify({ ja: "日本語ログ", en: "EN" });
    expect(extractLocalizedNotes(body, "ja-JP")).toBe("日本語ログ");
  });

  it("JSONでない文字列 → そのまま返す", () => {
    expect(extractLocalizedNotes("plain text body", "ja")).toBe(
      "plain text body"
    );
  });

  it("undefined → 空文字列", () => {
    expect(extractLocalizedNotes(undefined, "ja")).toBe("");
  });

  it("空文字列 → 空文字列", () => {
    expect(extractLocalizedNotes("", "ja")).toBe("");
  });
});

// =============================================================
// A-3-2. changelogMarkdownToHtml
// =============================================================
describe("changelogMarkdownToHtml", () => {
  it("### ヘッダー → <h4>", () => {
    const result = changelogMarkdownToHtml("### 修正");
    expect(result).toContain("<h4>");
    expect(result).toContain("修正");
  });

  it("#### サブヘッダー → <h5>", () => {
    const result = changelogMarkdownToHtml("#### 詳細");
    expect(result).toContain("<h5>");
    expect(result).toContain("詳細");
  });

  it("- リストアイテム → <li>", () => {
    const result = changelogMarkdownToHtml("- バグ修正");
    expect(result).toContain("<ul>");
    expect(result).toContain("<li>");
    expect(result).toContain("バグ修正");
    expect(result).toContain("</ul>");
  });

  it("**太字** → <strong>", () => {
    const result = changelogMarkdownToHtml("- **重要** な修正");
    expect(result).toContain("<strong>重要</strong>");
  });

  it("`コード` → <code>", () => {
    const result = changelogMarkdownToHtml("- `formatDuration` の修正");
    expect(result).toContain("<code>formatDuration</code>");
  });

  it("HTMLエスケープ", () => {
    const result = changelogMarkdownToHtml("- <script>alert(1)</script>");
    expect(result).not.toContain("<script>");
    expect(result).toContain("&lt;script&gt;");
  });

  it("複合マークダウン", () => {
    const md = `### 修正
- バグ修正1
- バグ修正2

### 追加
- 新機能1`;
    const result = changelogMarkdownToHtml(md);
    expect(result).toContain("<h4>修正</h4>");
    expect(result).toContain("<h4>追加</h4>");
    expect(result).toContain("バグ修正1");
    expect(result).toContain("新機能1");
  });

  it("プレーンテキスト → <p>", () => {
    const result = changelogMarkdownToHtml("plain paragraph");
    expect(result).toContain("<p>plain paragraph</p>");
  });
});
