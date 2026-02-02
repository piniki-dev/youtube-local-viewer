# YouTube Local Viewer (Tauri)

Tauri + React + TypeScript で作るデスクトップアプリのベースです。

## Scripts

- npm run dev
- npm run build
- npm run tauri dev
- npm run tauri build

## Notes

TauriのビルドにはRustとOS依存のライブラリが必要です。

### Download tools

ダウンロード機能には `yt-dlp` が必要です。

- Windows: `yt-dlp.exe` をPATHに入れるか、`YTDLP_PATH` 環境変数でフルパスを指定してください。

### Codec/Media tools

再生時のコーデック確認には `ffprobe` が必要です。

- Ubuntu/Debian: `sudo apt install ffmpeg`
- Arch: `sudo pacman -S ffmpeg`
- Fedora: `sudo dnf install ffmpeg`
