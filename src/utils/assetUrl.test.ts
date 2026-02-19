/**
 * assetUrl テスト
 *
 * toAssetUrl() の URL再エンコード処理を検証。
 * convertFileSrc のモック値を差し替えてパス部分だけ再エンコードされることを確認。
 */
import { toAssetUrl } from "./assetUrl";

// convertFileSrc をモック（Tauri APIモックは invoke のみなのでここで個別定義）
const mockConvertFileSrc = vi.fn<(path: string) => string>();
vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (...args: unknown[]) => mockConvertFileSrc(...(args as [string])),
}));

beforeEach(() => {
  mockConvertFileSrc.mockReset();
});

describe("toAssetUrl", () => {
  // ── release形式: https://asset.localhost/ ──

  it("ASCII パス → そのままエンコード", () => {
    mockConvertFileSrc.mockReturnValue(
      "https://asset.localhost/C%3A/Videos/test.mp4"
    );
    const result = toAssetUrl("C:\\Videos\\test.mp4");
    expect(result).toBe("https://asset.localhost/C%3A/Videos/test.mp4");
  });

  it("日本語パス → 再エンコード", () => {
    // convertFileSrc が日本語を生のまま返してしまうケース
    mockConvertFileSrc.mockReturnValue(
      "https://asset.localhost/C%3A/動画/テスト.mp4"
    );
    const result = toAssetUrl("C:\\動画\\テスト.mp4");
    expect(result).toBe(
      "https://asset.localhost/C%3A/%E5%8B%95%E7%94%BB/%E3%83%86%E3%82%B9%E3%83%88.mp4"
    );
  });

  it("既にエンコード済みパス → 二重エンコードしない", () => {
    mockConvertFileSrc.mockReturnValue(
      "https://asset.localhost/C%3A/%E5%8B%95%E7%94%BB/test.mp4"
    );
    const result = toAssetUrl("C:\\動画\\test.mp4");
    // decodeしてから再encodeするので二重エンコードにならない
    expect(result).toBe(
      "https://asset.localhost/C%3A/%E5%8B%95%E7%94%BB/test.mp4"
    );
  });

  it("スペース含むパス → %20にエンコード", () => {
    mockConvertFileSrc.mockReturnValue(
      "https://asset.localhost/C%3A/My Videos/file name.mp4"
    );
    const result = toAssetUrl("C:\\My Videos\\file name.mp4");
    expect(result).toBe(
      "https://asset.localhost/C%3A/My%20Videos/file%20name.mp4"
    );
  });

  // ── dev形式: asset://localhost/ ──

  it("asset://localhost → dev環境でも再エンコード", () => {
    mockConvertFileSrc.mockReturnValue(
      "asset://localhost/C%3A/動画/test.mp4"
    );
    const result = toAssetUrl("C:\\動画\\test.mp4");
    expect(result).toBe(
      "asset://localhost/C%3A/%E5%8B%95%E7%94%BB/test.mp4"
    );
  });

  // ── マッチしないURL ──

  it("想定外のURL形式 → そのまま返す", () => {
    mockConvertFileSrc.mockReturnValue("http://localhost:1420/test.mp4");
    const result = toAssetUrl("test.mp4");
    expect(result).toBe("http://localhost:1420/test.mp4");
  });

  it("空パス → convertFileSrcの結果をそのまま返す", () => {
    mockConvertFileSrc.mockReturnValue("");
    const result = toAssetUrl("");
    expect(result).toBe("");
  });

  // ── エッジケース ──

  it("特殊文字 (#, ?, &) → 正しくエンコード", () => {
    mockConvertFileSrc.mockReturnValue(
      "https://asset.localhost/C%3A/a#b/c?d.mp4"
    );
    const result = toAssetUrl("C:\\a#b\\c?d.mp4");
    expect(result).toBe(
      "https://asset.localhost/C%3A/a%23b/c%3Fd.mp4"
    );
  });

  it("深いネスト → 各セグメントを個別にエンコード", () => {
    mockConvertFileSrc.mockReturnValue(
      "https://asset.localhost/C%3A/a/b/c/d/テスト.mp4"
    );
    const result = toAssetUrl("C:\\a\\b\\c\\d\\テスト.mp4");
    expect(result).toContain("%E3%83%86%E3%82%B9%E3%83%88");
    expect(result).toContain("/a/b/c/d/");
  });
});
