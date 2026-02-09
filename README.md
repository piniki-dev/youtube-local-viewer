# YouTube Local Viewer (Tauri)

Tauri + React + TypeScript で作るデスクトップアプリのベースです。

## Scripts

- npm run dev
- npm run build
- npm run tauri dev
- npm run tauri build
- npm run test
- npm run test:watch
- npm run test:e2e

## Testing

Unit/Component tests:

```
npm run test
```

E2E smoke test (Vite dev + Playwright):

```
npm run test:e2e
```

Playwright runs against the Vite dev server (`npm run dev`).
If this is the first time, install browsers:

```
npx playwright install
```

## Notes

TauriのビルドにはRustとOS依存のライブラリが必要です。

## Data storage

アプリ設定やインデックスはユーザーデータ配下に保存されます。

- settings/app.json
- index/videos.json

動画/コメント/メタ情報は、設定で選択した「保存先フォルダ」の直下に
videos/comments/metadata を作成して保存します。

例:

```
<保存先フォルダ>/
	videos/
		youtube_handle/
			title [video_id].mp4
	metadata/
		youtube_handle/
			title [video_id].info.json
            title [video_id].live_chat.json
	thumbnails/
		youtube_handle/
			title [video_id].png
```

### Download tools

ダウンロード機能には `yt-dlp` が必要です。

- Windows: `yt-dlp.exe` をPATHに入れるか、`YTDLP_PATH` 環境変数でフルパスを指定してください。

### Codec/Media tools

再生時のコーデック確認には `ffprobe` が必要です。

- Ubuntu/Debian: `sudo apt install ffmpeg`
- Arch: `sudo pacman -S ffmpeg`
- Fedora: `sudo dnf install ffmpeg`
