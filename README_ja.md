<table>
	<thead>
    	<tr>
      		<th style="text-align:center"><a href="README.md">English</a></th>
      		<th style="text-align:center">日本語</th>
    	</tr>
  	</thead>
</table>

# YouTube Local Viewer

YouTube動画をローカルに保存・管理・再生するためのWindowsデスクトップアプリケーションです。

推しの配信や歌枠のアーカイブが「いつ消えるか分からない」不安を減らして、  
**手元に自分専用のライブラリとして残しておける**ことを目指しています。

とくにこんなVTuberリスナー向けです:

- 推しのアーカイブ削除に備えて、ローカルにバックアップを残しておきたい
- 歌枠・長時間配信を、回線を気にせずオフラインで聞きながら作業したい

Tauri 2 + React 19 + TypeScript で構築されています。

## 主な機能

- YouTube動画のローカルダウンロード（品質選択対応）
  - アーカイブが消えても手元に残せます
- ライブチャット同期再生
  - コメント付きで配信を振り返れます
- チャンネル一括登録・動画メタデータ取得
  - 推し・箱単位で一気にライブラリ化できます
- 動画の検索・フィルタリング（ダウンロード状態、種類、公開日ソート）
  - 歌枠だけ、メン限だけなどの絞り込みがしやすくなります
- ダークモード対応
- バックアップ・リストア機能
- サムネイルのローカルキャッシュ
- 別ウィンドウでの動画再生（プレーヤーウィンドウ）
- ブラウザCookie連携によるダウンロード
- yt-dlp / ffmpeg の初回起動時自動ダウンロード
- エラーログの自動保存

## 動作環境

- Windows 10/11（64bit）
- WebView2ランタイム（通常はプリインストール済み）

## インストール

1. [GitHub Releases](https://github.com/piniki-dev/youtube-local-viewer/releases) から最新の `.exe` インストーラをダウンロード
2. インストーラを実行（管理者権限不要、ユーザー単位でインストール）
3. 初回起動時に yt-dlp と ffmpeg の自動ダウンロードが案内されます

> **注意:** 未署名アプリのため、Windows SmartScreen の警告が表示される場合があります。
> 「詳細情報」→「実行」で起動できます。

## 注意事項

本アプリの利用にあたっては、YouTubeおよび各VTuber事務所・配信者の利用規約を必ず確認し、  
規約に反しない範囲でご利用ください。

ダウンロードした動画や音声ファイルの再配布・再アップロード・公開などは行わず、  
個人での視聴のみにとどめてください。

## 外部ツール

本アプリはダウンロード・メディア処理に以下の外部ツールを使用します。
初回起動時に自動的にダウンロードされます。

| ツール | 用途 | ライセンス |
|--------|------|-----------|
| [yt-dlp](https://github.com/yt-dlp/yt-dlp) | 動画・メタデータのダウンロード | Unlicense |
| [ffmpeg](https://ffmpeg.org/) / ffprobe | メディア処理・コーデック確認 | LGPL 2.1+ / GPL |

## データ保存先

### アプリ設定（ユーザーデータディレクトリ）

- `settings/app.json` — アプリ設定
- `index/videos.json` — 動画インデックス

### 動画データ（ユーザー指定フォルダ）

```
<保存先フォルダ>/
  videos/<youtube_handle>/<タイトル> [video_id].mp4
  metadata/<youtube_handle>/<タイトル> [video_id].info.json
  metadata/<youtube_handle>/<タイトル> [video_id].live_chat.json
  thumbnails/<youtube_handle>/<タイトル> [video_id].png
```

## 開発環境セットアップ

### 必要なツール

- [Node.js](https://nodejs.org/) 20+
- [Rust](https://rustup.rs/)（stable）
- Windows SDK / Visual Studio Build Tools

### 手順

```bash
# 依存パッケージのインストール
npm install

# 開発サーバー起動（Tauri + Vite）
npm run tauri dev

# リリースビルド
npm run tauri build
```

### テスト

```bash
# ユニット/コンポーネントテスト
npm run test

# E2Eテスト（初回は npx playwright install が必要）
npm run test:e2e
```

## 既知の制限事項

- Windows専用（macOS / Linux 未対応）
- コード署名なし（SmartScreen警告あり）
- YouTubeの仕様変更によりダウンロードが失敗する場合があります（yt-dlpの更新で対応）
- アクセシビリティ・キーボード操作は限定的

## ライセンス

[MIT License](LICENSE)

Copyright (c) 2026 piniki
