import { convertFileSrc } from "@tauri-apps/api/core";

/**
 * ローカルファイルパスをTauriアセットプロトコルURLに変換する。
 *
 * Tauriの `convertFileSrc` はWindowsパスをURLに変換する際、
 * Unicode文字（日本語、特殊記号等）を正しくパーセントエンコードしない場合がある。
 * リリース版（`https://asset.localhost/`）ではこれが原因で
 * 画像や動画が読み込めなくなる。
 *
 * この関数は変換後のURLパス部分を再エンコードして問題を解消する。
 */
export function toAssetUrl(filePath: string): string {
  const raw = convertFileSrc(filePath);

  // dev環境の asset://localhost/ と release環境の https://asset.localhost/ の両方に対応
  // origin 部分はそのまま残し、パス部分だけ再エンコードする
  const match = raw.match(/^(https?:\/\/asset\.localhost|asset:\/\/localhost)(\/.*)/);
  if (!match) {
    return raw;
  }
  const origin = match[1];
  const pathPart = match[2];

  // デコードしてから再エンコード（二重エンコード防止）
  const decoded = decodeURIComponent(pathPart);
  const encoded = decoded
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `${origin}${encoded}`;
}
