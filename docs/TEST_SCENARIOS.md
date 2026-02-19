# YouTube Local Viewer — 包括的テストシナリオ

## 目次

1. [状態遷移マップ](#1-状態遷移マップ)
2. [動画ダウンロード](#2-動画ダウンロード)
3. [コメント/ライブチャットダウンロード](#3-コメントライブチャットダウンロード)
4. [メタデータ取得](#4-メタデータ取得)
5. [動画追加](#5-動画追加)
6. [チャンネル一括取得](#6-チャンネル一括取得)
7. [一括ダウンロード](#7-一括ダウンロード)
8. [動画再生（プレイヤー）](#8-動画再生プレイヤー)
9. [プレイヤーウィンドウ管理](#9-プレイヤーウィンドウ管理)
10. [フィルタリング・検索・ソート](#10-フィルタリング検索ソート)
11. [設定管理](#11-設定管理)
12. [バックアップ・復元](#12-バックアップ復元)
13. [整合性チェック](#13-整合性チェック)
14. [ツールセットアップ](#14-ツールセットアップ)
15. [アプリアップデート](#15-アプリアップデート)
16. [テーマ管理](#16-テーマ管理)
17. [サムネイル管理](#17-サムネイル管理)
18. [永続化状態管理](#18-永続化状態管理)
19. [yt-dlp自動更新](#19-yt-dlp自動更新)
20. [ダウンロードエラースライド](#20-ダウンロードエラースライド)
21. [アクティブアクティビティ表示](#21-アクティブアクティビティ表示)
22. [ユーティリティ関数](#22-ユーティリティ関数)
23. [Rustバックエンド](#23-rustバックエンド)
24. [UIコンポーネント](#24-uiコンポーネント)
25. [i18n（国際化）](#25-i18n国際化)
26. [エッジケース・統合テスト](#26-エッジケース統合テスト)

---

## 1. 状態遷移マップ

### 1.1 動画ダウンロードステータス (`downloadStatus`)

```
pending ──→ downloading ──→ downloaded
  │              │
  │              └──→ failed
  │              │
  │              └──→ pending (キャンセル時)
  │
  └──→ downloading (再ダウンロード)
  
failed ──→ downloading (リトライ)
downloaded ──→ (再ダウンロード不可、ファイル不在時はエラー表示)
```

**状態定義:**
- `pending`: 未ダウンロード（初期状態）
- `downloading`: ダウンロード中
- `downloaded`: ダウンロード完了
- `failed`: ダウンロード失敗

**動画フラグ:**
- `isPrivate`: 非公開動画（yt-dlp stderr に "video is private" / "private video" を含む）
- `isDeleted`: 削除済み動画（yt-dlp stderr に "has been removed by the uploader" を含む）

### 1.2 コメントステータス (`commentsStatus`)

```
pending ──→ downloading ──→ downloaded
  │              │
  │              └──→ failed
  │
  └──→ unavailable (メタデータでライブチャット無しと判明)
  └──→ downloaded (メタデータでライブチャット有りと判明)

unavailable ──→ (ダウンロード不可)
failed ──→ downloading (リトライ)
```

**状態定義:**
- `pending`: 未取得
- `downloading`: 取得中
- `downloaded`: 取得済み
- `failed`: 取得失敗
- `unavailable`: ライブチャットなし（ダウンロード対象外）

### 1.3 メタデータ取得状態 (`metadataFetch`)

```
{ active: false } ──→ { active: true, total: N, completed: 0 }
                           │
                           ├──→ 一時停止 (metadataPaused = true)
                           │         └──→ 再開 (retryMetadata)
                           │
                           └──→ { active: true, completed: N } ──→ { active: false }
```

### 1.4 一括ダウンロード状態 (`BulkDownloadState`)

```
inactive ──→ active (waitingForSingles: true) ──→ active (waitingForSingles: false)
                │                                        │
                │                                        ├──→ phase: "video" ──→ phase: "comments"
                │                                        │         │
                │                                        │         └──→ 次の動画へ
                │                                        │
                │                                        └──→ stopRequested: true ──→ inactive
                │
                └──→ inactive (個別ダウンロードなし/なくなった時点で即開始)
```

### 1.5 ツールダウンロード状態 (`DownloadState`)

```
idle ──→ downloading ──→ extracting ──→ done
                │
                └──→ error ──→ downloading (リトライ)
```

### 1.6 アプリアップデート状態

```
未チェック ──→ checking ──→ available / not-available
                                │
                            available ──→ downloading (installUpdate)
                                │             │
                                │             └──→ finished ──→ relaunch
                                │             │
                                │             └──→ error
                                │
                                └──→ dismissed
```

---

## 2. 動画ダウンロード

### 2.1 正常系テスト

| # | シナリオ | 前提条件 | 期待結果 |
|---|---------|---------|---------|
| D-01 | 単一動画ダウンロード開始 | 保存先設定済み, yt-dlp利用可能 | `downloadStatus` → `downloading`, `downloadingIds`に追加 |
| D-02 | ダウンロード成功 | `download-finished`イベント(success=true) | `downloadStatus` → `downloaded`, progressLines削除, videoErrors削除 |
| D-03 | ダウンロードキャンセル | `download-finished`イベント(cancelled=true) | `downloadStatus` → `pending`, progressLines削除, videoErrors削除 |
| D-04 | キュー経由ダウンロード | 別動画ダウンロード中に新規開始 | キューに追加, 完了後に次が自動開始 |
| D-05 | ダウンロード完了後の自動コメントDL | 動画DL成功, 一括DLでない | `maybeStartAutoCommentsDownload`が呼ばれコメントDL開始 |
| D-06 | ダウンロード完了後のキャッシュウォーム | 動画DL成功 | `resolve_video_file`が呼ばれファイルパスキャッシュ更新 |

### 2.2 異常系テスト

| # | シナリオ | 前提条件 | 期待結果 |
|---|---------|---------|---------|
| D-07 | 保存先未設定 | `downloadDir`が空 | エラーメッセージ表示, 設定画面オープン |
| D-08 | yt-dlp未検出 | `toolingStatus.ytDlp.ok` = false | フローティング通知(error), 設定画面オープン |
| D-09 | yt-dlp起動失敗 | yt-dlpバイナリが存在しない | `classifyDownloadError` → "yt-dlpが見つかりません", `downloadStatus` → `failed` |
| D-10 | ネットワークエラー | stderr含む: "unable to connect" etc. | `classifyDownloadError` → "ネットワーク接続エラー" |
| D-11 | レート制限 (HTTP 429) | stderr含む: "http error 429" | `classifyDownloadError` → "リクエスト制限エラー" |
| D-12 | アクセス拒否 (HTTP 403) | stderr含む: "403 forbidden" | `classifyDownloadError` → "アクセス拒否エラー" |
| D-13 | 非公開動画DL失敗 | stderr: "This video is private" | `downloadStatus` → `failed`, `isPrivate`フラグ設定, 専用エラー通知 |
| D-13b | 削除済み動画DL失敗 | stderr: "has been removed by the uploader" | `downloadStatus` → `failed`, `isDeleted`フラグ設定, 専用エラー通知 |
| D-14 | invoke失敗 | `start_download`がthrow | `downloadStatus` → `failed`, videoErrors設定, onStartFailed呼出 |
| D-15 | ライブ配信中の動画DL試行 | `isLive` = true or `liveStatus` = "is_live" | フローティング通知(error), DL開始されない |
| D-16 | 配信予定の動画DL試行 | `liveStatus` = "is_upcoming" | フローティング通知(error), DL開始されない |
| D-17 | メタデータ未取得での先行DL | `metadataFetched` = false | メタデータ取得をスケジュール, 最大15秒待機, タイムアウト時エラー |
| D-18 | 一括DL中の個別DL試行 | `bulkDownload.active` = true | フローティング通知(error), "一括ダウンロード中" |

### 2.3 エラー分類ロジック (`classifyDownloadError`)

| # | stderrパターン | 期待する分類結果 |
|---|---------------|-----------------|
| DE-01 | "yt-dlpの起動に失敗しました" | `errors.ytdlpNotFound` |
| DE-02 | "no such file or directory" | `errors.ytdlpNotFound` |
| DE-03 | "the system cannot find" | `errors.ytdlpNotFound` |
| DE-04 | "unable to connect" | `errors.networkError` |
| DE-05 | "connection refused" | `errors.networkError` |
| DE-06 | "connection timed out" | `errors.networkError` |
| DE-07 | "name or service not known" | `errors.networkError` |
| DE-08 | "failed to connect" | `errors.networkError` |
| DE-09 | "getaddrinfo" | `errors.networkError` |
| DE-10 | "http error 429" / "too many requests" | `errors.rateLimitError` |
| DE-11 | "http error 403" / "403 forbidden" | `errors.accessDeniedError` |
| DE-12 | その他の不明エラー | `errors.downloadFailed` |

### 2.4 品質設定テスト

| # | quality値 | 期待するformat文字列 |
|---|----------|-------------------|
| DQ-01 | "1080p" | `bestvideo[height<=1080][ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]/...` |
| DQ-02 | "720p" | `bestvideo[height<=720]...` |
| DQ-03 | "480p" | `bestvideo[height<=480]...` |
| DQ-04 | "360p" | `bestvideo[height<=360]...` |
| DQ-05 | "audio" | `bestaudio[ext=m4a]/bestaudio` |
| DQ-06 | null/undefined | デフォルト: `bestvideo[ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]/...` |

---

## 3. コメント/ライブチャットダウンロード

### 3.1 正常系テスト

| # | シナリオ | 前提条件 | 期待結果 |
|---|---------|---------|---------|
| C-01 | コメントDL開始 | `commentsStatus` ≠ `unavailable` | `commentsStatus` → `downloading`, `commentsDownloadingIds`に追加 |
| C-02 | コメントDL成功(ファイル有) | `comments-finished`(success=true), ファイル存在 | `commentsStatus` → `downloaded` |
| C-03 | コメントDL成功(ファイル無) | `comments-finished`(success=true), ファイル不在 | `commentsStatus` → `unavailable` |
| C-04 | コメントDL成功+メタデータ付き | `metadata`がpayloadに含まれる | `applyMetadataUpdate`が呼ばれメタデータ更新 |
| C-05 | 自動コメントDL | 動画DL完了, `commentsStatus` ≠ `downloaded`/`unavailable` | `maybeStartAutoCommentsDownload`でDL開始 |

### 3.2 異常系テスト

| # | シナリオ | 前提条件 | 期待結果 |
|---|---------|---------|---------|
| C-06 | unavailableの動画にDL試行 | `commentsStatus` = `unavailable` | 何もせずreturn |
| C-07 | コメントDL失敗 | `comments-finished`(success=false) | `commentsStatus` → `failed`, commentErrors設定 |
| C-08 | invoke失敗 | `start_comments_download`がthrow | `commentsStatus` → `failed`, `handleCommentsDownloadFinished`呼出 |
| C-09 | 一括DL中のコメントDL完了 | `bulkDownload.active` = true, phase = "comments" | `handleBulkCompletion`呼出 |

---

## 4. メタデータ取得

### 4.1 正常系テスト

| # | シナリオ | 前提条件 | 期待結果 |
|---|---------|---------|---------|
| M-01 | メタデータ取得開始 | キューに動画追加 | `metadataFetch.active` = true, 1件ずつ順次処理 |
| M-02 | メタデータ取得成功 | `metadata-finished`(success=true) | title/channel/thumbnail更新, `metadataFetched` = true |
| M-03 | ライブチャット有り判定 | `hasLiveChat` = true | `commentsStatus` → `downloaded` |
| M-04 | ライブチャット無し判定(通常動画) | `hasLiveChat` = false, `liveStatus` ≠ live | `commentsStatus` → `unavailable` |
| M-05 | ライブチャット無し判定(ライブ配信中) | `hasLiveChat` = false, `isLive` = true | `commentsStatus`はpendingのまま維持 |
| M-06 | バッチ更新 (debounce) | 複数メタデータ更新 | 300msのdebounceでバッチ更新 |
| M-07 | サムネイル解決 | メタデータにthumbnail含む | `resolveThumbnailPath`で保存、パス更新 |
| M-08 | 自動メタデータ取得 | 状態準備完了 + データチェック完了 + yt-dlp更新完了 | 未取得動画のメタデータ取得自動開始 |
| M-09 | ローカルメタデータ優先 | `.info.json`がローカルに存在 | ローカルファイルから読み込み、リモート取得スキップ |
| M-10 | ライブ配信タイトルのタイムスタンプ除去 | タイトル末尾に " YYYY-MM-DD HH:MM" | タイムスタンプ部分を除去して保存 |

### 4.2 異常系テスト

| # | シナリオ | 前提条件 | 期待結果 |
|---|---------|---------|---------|
| M-11 | メタデータ取得失敗 | `metadata-finished`(success=false) | エラー通知, 次の動画へ進行 |
| M-12 | 非公開動画検出 | `isPrivate` = true | `isPrivate`フラグ設定, `liveStatus`/`isLive`クリア |
| M-12b | 削除済み動画検出 | stderr: "has been removed by the uploader" | `isDeleted`フラグ設定, 専用通知(error), `liveStatus`/`isLive`クリア |
| M-13 | 一時停止・再開 | rate limit等でpause | `metadataPaused` = true, UIに一時停止理由表示, 再開ボタン |
| M-14 | invoke失敗 | `start_metadata_download`がthrow | completed++, 次の動画へ進行 |
| M-15 | 保存先未設定 | `downloadDir`が空 | 対象スキップ, completed++ |

### 4.3 メタデータフィールドのマッピング

| 入力フィールド | VideoItemフィールド | テストすべき変換 |
|--------------|-------------------|-----------------|
| `releaseTimestamp` | `publishedAt` | Unix timestamp → ISO文字列 |
| `timestamp` | `publishedAt` (fallback) | Unix timestamp → ISO文字列 |
| `uploadDate` | `publishedAt` (fallback) | "YYYYMMDD" → ISO文字列 |
| `liveStatus` = "is_live"/"upcoming" + `isLive` | `contentType` → "live" | ライブ判定 |
| `webpageUrl`に"/shorts/" | `contentType` → "shorts" | ショート判定 |
| `durationSec` ≤ 60 | `contentType` → "shorts" | 60秒以下はショート |
| それ以外 | `contentType` → "video" | 通常動画 |

---

## 5. 動画追加

### 5.1 正常系テスト

| # | シナリオ | 前提条件 | 期待結果 |
|---|---------|---------|---------|
| A-01 | URL入力による動画追加 | 有効なYouTube URL | oEmbed APIでtitle/channel取得, videos先頭に追加 |
| A-02 | 追加時自動ダウンロード | `downloadOnAdd` = true | 追加後に`startDownload`呼出 |
| A-03 | 追加後メタデータ取得 | 動画追加成功 | `scheduleBackgroundMetadataFetch`呼出 |
| A-04 | URL入力クリア | 追加成功 | `videoUrl` = "" |

### 5.2 URL解析テスト (`parseVideoId`)

| # | URL | 期待するID |
|---|-----|-----------|
| AV-01 | `https://www.youtube.com/watch?v=dQw4w9WgXcQ` | `dQw4w9WgXcQ` |
| AV-02 | `https://youtu.be/dQw4w9WgXcQ` | `dQw4w9WgXcQ` |
| AV-03 | `https://www.youtube.com/shorts/abcdefghijk` | `abcdefghijk` |
| AV-04 | `https://www.youtube.com/live/abcdefghijk` | `abcdefghijk` |
| AV-05 | `https://www.youtube.com/embed/abcdefghijk` | `abcdefghijk` |
| AV-06 | `https://m.youtube.com/watch?v=dQw4w9WgXcQ` | `dQw4w9WgXcQ` |
| AV-07 | `https://youtube-nocookie.com/embed/abc` | `abc` |
| AV-08 | `https://www.example.com/watch?v=abc` | `null` (非YouTube) |
| AV-09 | `invalid-url` | `null` |
| AV-10 | `https://www.youtube.com/watch` (v無し) | `null` |

### 5.3 異常系テスト

| # | シナリオ | 前提条件 | 期待結果 |
|---|---------|---------|---------|
| A-05 | 保存先未設定 | `downloadDir`が空 | エラーメッセージ: "保存先フォルダが未設定" |
| A-06 | 無効なURL | 解析不可能なURL | エラーメッセージ: "無効なYouTube URL" |
| A-07 | 重複追加 | 同一IDの動画が既に存在 | エラーメッセージ: "既に追加済み" |
| A-08 | oEmbed API エラー | HTTPステータス非200 | エラーメッセージ: "動画情報を取得できません" |
| A-09 | Fetch例外 | ネットワークエラー | エラーメッセージ(詳細付き) |

---

## 6. チャンネル一括取得

### 6.1 正常系テスト

| # | シナリオ | 前提条件 | 期待結果 |
|---|---------|---------|---------|
| CH-01 | チャンネルURL指定で動画一覧取得 | 有効なチャンネルURL | `list_channel_videos`呼出, 重複除外して追加 |
| CH-02 | 進捗表示 | 取得中 | プログレス5%→10%→95%→100%, メッセージ更新 |
| CH-03 | 新規動画のみ追加 | 一部動画が既存 | `existingIds`にないもののみ追加 |
| CH-04 | メタデータフィールド反映 | チャンネル取得結果にメタデータ含む | 各フィールド(duration, uploadDate等)が反映 |
| CH-05 | 追加順序 | 複数動画追加 | `baseTime`ベースのaddedAtで時系列順 |

### 6.2 異常系テスト

| # | シナリオ | 前提条件 | 期待結果 |
|---|---------|---------|---------|
| CH-06 | 保存先未設定 | `downloadDir`が空 | エラーメッセージ表示 |
| CH-07 | 空のチャンネルURL | `channelUrl`が空 | エラーメッセージ: "チャンネルURLを入力" |
| CH-08 | 新規動画なし | 全動画が既に存在 | エラーメッセージ: "新しい動画がありません" |
| CH-09 | invoke失敗 | `list_channel_videos`がthrow | エラーメッセージ(詳細付き) |

### 6.3 チャンネルURL正規化 (Rust側)

| # | 入力URL | 正規化結果 |
|---|--------|----------|
| CU-01 | `https://youtube.com/@channel/videos` | `https://youtube.com/@channel` |
| CU-02 | `https://youtube.com/@channel/streams` | `https://youtube.com/@channel` |
| CU-03 | `https://youtube.com/@channel/live` | `https://youtube.com/@channel` |
| CU-04 | `https://youtube.com/@channel/shorts` | `https://youtube.com/@channel` |
| CU-05 | `https://youtube.com/@channel/` | `https://youtube.com/@channel` |

---

## 7. 一括ダウンロード

### 7.1 正常系テスト

| # | シナリオ | 前提条件 | 期待結果 |
|---|---------|---------|---------|
| B-01 | 一括DL開始 | 未DL動画あり, 個別DLなし | DL対象のみキューに追加(downloaded/isLive/is_upcoming/isPrivate/isDeleted除外), `bulkDownload.active` = true, 1件ずつ順次DL |
| B-02 | 一括DL中の次動画遷移 | 1件完了 | `completed++`, 次動画のDL開始 |
| B-03 | 一括DL停止 | 停止リクエスト | `stopRequested` = true, 現在のDL停止後にinactive |
| B-04 | 全件完了 | キュー空 | `bulkDownload.active` = false |
| B-05 | 個別DL進行中に一括開始 | `downloadingIds.length > 0` | `waitingForSingles` = true, 個別完了後に開始 |

### 7.2 異常系テスト

| # | シナリオ | 前提条件 | 期待結果 |
|---|---------|---------|---------|
| B-08 | 保存先未設定 | `downloadDir`が空 | エラーメッセージ, 設定画面オープン |
| B-09 | DL対象なし | 全動画がdownloaded/isLive/isPrivate/isDeleted等 | エラーメッセージ: "ダウンロード対象がありません" |
| B-10 | 既にアクティブ | `bulkDownload.active` = true | 何もしない(重複防止) |
| B-11 | 停止失敗 | `stop_download` invoke失敗 | エラーメッセージ, `stopRequested`リセット |
| B-12 | waitingForSingles中の停止 | `waitingForSingles` = true, `currentId` = null | 即座にinactive化 |

---

## 8. 動画再生（プレイヤー）

### 8.1 正常系テスト

| # | シナリオ | 前提条件 | 期待結果 |
|---|---------|---------|---------|
| P-01 | 動画再生開始 | 動画ファイル存在 | `resolve_video_file`でパス解決, `toAssetUrl`でURL変換, video要素にsrc設定 |
| P-02 | 自動再生 (PlayerWindow) | `isPlayerWindow` = true, `canplay`イベント | 250ms後に`video.play()`呼出 |
| P-03 | コメント読み込み(初期200件) | `commentsStatus` = "downloaded" | 初期200件取得後、全件取得(バックグラウンド) |
| P-04 | ライブチャット同期表示 | `offsetMs`付きコメント | `playerTimeMs`に基づいて表示範囲計算(バイナリサーチ) |
| P-05 | チャット自動スクロール | `isChatAutoScroll` = true | 新コメント追加時に`scrollIntoView` |
| P-06 | 外部プレイヤーで開く | ファイルパス存在 | `openPath`呼出 |
| P-07 | フォルダを開く | ファイルパス存在 | `revealItemInDir`呼出 |
| P-08 | プレイヤーを閉じる | プレイヤーオープン中 | 全状態リセット(src, error, title, comments等) |
| P-09 | 事前解決パスの活用 | `options.filePath`が提供済み | `resolve_video_file`スキップ |

### 8.2 異常系テスト

| # | シナリオ | 前提条件 | 期待結果 |
|---|---------|---------|---------|
| P-10 | 保存先未設定 | `downloadDir`空 | エラーメッセージ: "保存先フォルダが未設定" |
| P-11 | 動画ファイル不在 | `resolve_video_file` → null | エラーメッセージ: "動画ファイルが見つかりません" |
| P-12 | 動画再生エラー(音声のみ) | MediaInfo: videoCodecあり, audioCodecなし | エラー: "音声トラックが含まれていません" |
| P-13 | 動画再生エラー(映像のみ) | MediaInfo: audioCodecあり, videoCodecなし | エラー: "映像トラックが含まれていません" |
| P-14 | 動画再生エラー(汎用) | MediaInfo取得失敗 or 両方あり | エラー: "この動画は再生できません" |
| P-15 | ffprobe失敗 | `probe_media`がthrow | 汎用エラーメッセージのまま |
| P-16 | コメント読み込み失敗 | `get_comments`がthrow | エラーメッセージ表示 |
| P-17 | コメント未取得 | `commentsStatus` ≠ "downloaded" | "ライブチャット未取得のため同期表示できません" |
| P-18 | 外部プレイヤー起動失敗 | `openPath`がthrow | エラーメッセージ表示 |

### 8.3 コメント表示ロジック

| # | テストケース | 期待結果 |
|---|------------|---------|
| PC-01 | `playerTimeMs` = 0, コメントあり | 空配列 |
| PC-02 | `playerTimeMs` = 5000, offset=[1000,3000,6000] | offset≤5000の直近50件 |
| PC-03 | コメントなし | 空配列 |
| PC-04 | `offsetMs`がundefinedのコメント | ソート対象から除外 |

---

## 9. プレイヤーウィンドウ管理

### 9.1 正常系テスト

| # | シナリオ | 前提条件 | 期待結果 |
|---|---------|---------|---------|
| PW-01 | 新規プレイヤーウィンドウ作成 | 既存ウィンドウなし | WebviewWindow作成, サイズ復元 |
| PW-02 | 既存ウィンドウに同一動画送信 | 同じvideoId | `player-open`イベント送信, フォーカス |
| PW-03 | 別動画への切替確認 | 異なるvideoId | SwitchConfirmModal表示 |
| PW-04 | 切替確認後に実行 | confirmSwitch呼出 | `skipConfirm: true`で再呼出 |
| PW-05 | ウィンドウ破棄時のクリーンアップ | `tauri://destroyed` | `playerWindowActiveId` = null |
| PW-06 | pending store ポーリング | PlayerWindowリロード後 | 200msごとに`take_pending_player_open`ポーリング, 5秒タイムアウト |
| PW-07 | `player-active`イベント受信(メインウィンドウ) | プレイヤーから送信 | `playerWindowActiveId`/`playerWindowActiveTitle`更新 |

### 9.2 異常系テスト

| # | シナリオ | 前提条件 | 期待結果 |
|---|---------|---------|---------|
| PW-08 | ウィンドウ作成失敗 | `tauri://error` | エラーメッセージ表示 |
| PW-09 | 保存先未設定でプレイヤーオープン | `downloadDir`空 | エラーメッセージ, 設定画面オープン |
| PW-10 | ライブラリに動画不在 | `pendingPlayerId`に該当動画なし | エラー: "ライブラリに該当する動画が見つかりません" |
| PW-11 | ファイルパス解決失敗 | `resolve_video_file`がthrow | null返却, フォールバック |

---

## 10. フィルタリング・検索・ソート

### 10.1 フィルターテスト

| # | フィルター | 値 | 期待結果 |
|---|----------|---|---------|
| F-01 | downloadFilter | "all" | 全動画表示 |
| F-02 | downloadFilter | "downloaded" | `downloadStatus` = "downloaded"のみ |
| F-03 | downloadFilter | "undownloaded" | `downloadStatus` ≠ "downloaded" |
| F-04 | typeFilter | "video" | `contentType` = "video"のみ |
| F-05 | typeFilter | "live" | `contentType` = "live"のみ |
| F-06 | typeFilter | "shorts" | `contentType` = "shorts"のみ |
| F-07 | favoriteFilter | "favorite" | `favorite` = true のみ |
| F-08 | 複合フィルター | downloaded + live + favorite | 全条件AND結合 |

### 10.2 検索テスト

| # | テストケース | 期待結果 |
|---|------------|---------|
| S-01 | タイトル検索 | タイトル含む動画が表示 |
| S-02 | チャンネル名検索 | チャンネル名含む動画が表示 |
| S-03 | 説明文検索 | description含む動画が表示 |
| S-04 | タグ検索 | tags含む動画が表示 |
| S-05 | ID検索 | id含む動画が表示 |
| S-06 | 複数トークン検索 | スペース区切りで全トークンAND検索 |
| S-07 | 大文字小文字無視 | 小文字変換で比較 |
| S-08 | 空検索 | 全動画表示 |

### 10.3 ソートテスト

| # | テストケース | 期待結果 |
|---|------------|---------|
| SO-01 | published-desc | 新しい順 (sortTime降順) |
| SO-02 | published-asc | 古い順 (sortTime昇順) |
| SO-03 | 同一sortTime | `addedAt`降順でタイブレイク |
| SO-04 | publishedAt無し | `addedAt`をフォールバック使用 |

---

## 11. 設定管理

### 11.1 正常系テスト

| # | シナリオ | 期待結果 |
|---|---------|---------|
| SET-01 | 保存先フォルダ選択 | ダイアログ表示, localStorage + persistSettings呼出 |
| SET-02 | Cookies設定(ファイル) | cookiesSource="file", ファイルパス保存 |
| SET-03 | Cookies設定(ブラウザ) | cookiesSource="browser", ブラウザ名保存 |
| SET-04 | Cookies設定(なし) | cookiesSource="none", localStorage削除 |
| SET-05 | ブラウザ指定なしでbrowser選択 | デフォルト"chrome"設定 |
| SET-06 | yt-dlpパス手動設定 | ファイル選択ダイアログ, パス保存 |
| SET-07 | ffmpegパス手動設定 | ファイル選択ダイアログ, パス保存 |
| SET-08 | ffprobeパス手動設定 | ファイル選択ダイアログ, パス保存 |
| SET-09 | パスクリア | パス空文字化, localStorage削除 |
| SET-10 | リモートコンポーネント設定 | "none"/"ejs:github"/"ejs:npm" |
| SET-11 | ダウンロード品質変更 | localStorage + persistSettings |
| SET-12 | 言語変更 | i18n.changeLanguage + localStorage |
| SET-13 | 設定閉じ時の自動保存 | persistSettings呼出後にモーダル閉じ |
| SET-14 | ライブラリ再リンク | フォルダ選択 → サムネイル更新 → 整合性チェック |

### 11.2 Cookie適用ロジック (Rust側)

| # | cookiesSource | cookiesFile | cookiesBrowser | 期待するコマンド引数 |
|---|-------------|-------------|---------------|-------------------|
| CK-01 | "browser" | 任意 | "chrome" | `--cookies-from-browser chrome` |
| CK-02 | "browser" | 任意 | "" | 引数なし |
| CK-03 | "file" | "/path/to/cookies" | 任意 | `--cookies /path/to/cookies` |
| CK-04 | "" | "/path/to/cookies" | 任意 | `--cookies /path/to/cookies` (legacy fallback) |
| CK-05 | "none" | 任意 | 任意 | 引数なし |

---

## 12. バックアップ・復元

### 12.1 正常系テスト

| # | シナリオ | 期待結果 |
|---|---------|---------|
| BK-01 | バックアップエクスポート | フォルダ選択 → `export_state`(ZIP作成) → 成功通知 |
| BK-02 | バックアップインポート | ファイル選択 → `import_state`(ZIP読込) → 成功通知 → 10秒後リロード |
| BK-03 | インポート後整合性チェック | `integrityCheckPending` = "1" → 次回起動時にチェック |
| BK-04 | カウントダウン表示 | インポート後10秒カウントダウン |

### 12.2 ZIP構造テスト

| # | テストケース | 期待結果 |
|---|------------|---------|
| BZ-01 | manifest.json含む | version, createdAtMs, settingsVersion, videosVersion |
| BZ-02 | settings/app.json含む | VersionedSettings形式 |
| BZ-03 | index/videos.json含む | VersionedVideos形式 |
| BZ-04 | 新しいバージョンのバックアップ | エラー: "アプリを更新してください" |

### 12.3 異常系テスト

| # | シナリオ | 期待結果 |
|---|---------|---------|
| BK-05 | エクスポート失敗 | エラーメッセージ表示 |
| BK-06 | インポート失敗 | エラーメッセージ表示 |
| BK-07 | 無効なZIPファイル | エラーメッセージ表示 |

---

## 13. 整合性チェック

### 13.1 正常系テスト

| # | シナリオ | 期待結果 |
|---|---------|---------|
| IC-01 | 起動時自動チェック | 状態準備完了後にローカルファイル検証 |
| IC-02 | 手動チェック | `runIntegrityCheck`実行, モーダル表示 |
| IC-03 | 問題なし | `integrityIssues` = [], "問題ありません"表示 |
| IC-04 | 動画ファイル不在検出 | `videoMissing` = true, videoErrors設定 |
| IC-05 | コメントファイル不在検出 | `commentsMissing` = true, commentErrors設定 |
| IC-06 | メタデータ不在検出 | `metadataMissing` = true (metadataFetchedだが.info.jsonなし) |
| IC-07 | 復旧アクション | 問題0件時に `onMetadataRecovery(true)` 呼出 |
| IC-08 | サマリー表示 | total, videoMissing, commentsMissing, metadataMissing |

### 13.2 チェック対象の条件

| # | 動画状態 | checkVideo | checkComments |
|---|---------|-----------|--------------|
| CC-01 | downloaded | true | commentsStatusに依存 |
| CC-02 | pending | false | false |
| CC-03 | failed | false | true (failedはチェック) |
| CC-04 | commentsStatus=unavailable | - | false |
| CC-05 | commentsStatus=downloaded | - | true |
| CC-06 | videoErrorsに"動画ファイルが見つかりません" | true | - |
| CC-07 | commentErrorsに"コメントファイルが見つかりません" | - | true |

### 13.3 異常系テスト

| # | シナリオ | 期待結果 |
|---|---------|---------|
| IC-09 | 保存先未設定 | エラーメッセージ表示, issues/summaryクリア |
| IC-10 | verify_local_files失敗 | フォールバックで個別チェック |
| IC-11 | 動画0件 | summary = {total:0, ...}, 即完了 |

---

## 14. ツールセットアップ

### 14.1 正常系テスト

| # | シナリオ | 期待結果 |
|---|---------|---------|
| TS-01 | 初回起動でツール未検出 | SetupDialog自動表示 |
| TS-02 | 自動ダウンロード開始 | `download_tools` invoke, 進捗表示 |
| TS-03 | ダウンロード完了 | `refreshTooling`呼出, "セットアップ完了"表示 |
| TS-04 | スキップ | dismissed = true, ダイアログ非表示 |
| TS-05 | 閉じる(アクティブ中) | 閉じ不可 |
| TS-06 | 進捗イベント | `tool-download-progress`でUI更新 |

### 14.2 ツール検出ロジック (Rust側)

| # | 検索パス | 優先度 |
|---|--------|-------|
| TR-01 | 環境変数YTDLP_PATH | 最高 |
| TR-02 | CARGO_MANIFEST_DIR (開発) | 高 |
| TR-03 | 実行ファイル隣 | 中 |
| TR-04 | LOCALAPPDATA/Programs | 中 |
| TR-05 | USERPROFILE/bin | 低 |
| TR-06 | PATH内 (フォールバック) | 最低 |

### 14.3 不足ツールの検出

| # | yt-dlp | ffmpeg | ffprobe | missingTools |
|---|--------|--------|---------|-------------|
| TM-01 | ✗ | ✓ | ✓ | ["yt-dlp"] |
| TM-02 | ✓ | ✗ | ✗ | ["ffmpeg", "ffprobe"] |
| TM-03 | ✗ | ✗ | ✗ | ["yt-dlp", "ffmpeg", "ffprobe"] |
| TM-04 | ✓ | ✓ | ✓ | [] (ダイアログ非表示) |

---

## 15. アプリアップデート

### 15.1 正常系テスト

| # | シナリオ | 期待結果 |
|---|---------|---------|
| AU-01 | 起動時自動チェック(silent) | `check()` → 更新有無判定 |
| AU-02 | 更新あり | UpdateModal表示, currentVersion/latestVersion |
| AU-03 | 更新なし | UpdateModal非表示 |
| AU-04 | 更新インストール | `downloadAndInstall` → 進捗表示 → `relaunch` |
| AU-05 | 手動ダウンロード | GitHub Releasesページオープン |
| AU-06 | 更新を後で | `dismissUpdate`でモーダル閉じ |
| AU-07 | 変更履歴表示 | `extractLocalizedNotes` + `changelogMarkdownToHtml` |

### 15.2 異常系テスト

| # | シナリオ | 期待結果 |
|---|---------|---------|
| AU-08 | チェック失敗 | error設定, コンソールエラー |
| AU-09 | インストール失敗 | error設定, isUpdating=false |
| AU-10 | updateRef=null | errorメッセージ設定 |

### 15.3 変更履歴パーサーテスト

| # | 入力 | 期待結果 |
|---|-----|---------|
| CL-01 | `{"ja": "### 修正\n- バグ修正"}` + language="ja" | "### 修正\n- バグ修正" |
| CL-02 | `{"en": "### Fixed\n- Fix"}` + language="ja" | "### Fixed\n- Fix" (fallback) |
| CL-03 | 非JSON文字列 | そのまま返却 |
| CL-04 | `### Header` → HTML | `<h4>Header</h4>` |
| CL-05 | `- Item` → HTML | `<ul><li>Item</li></ul>` |
| CL-06 | `**bold**` → HTML | `<strong>bold</strong>` |
| CL-07 | `` `code` `` → HTML | `<code>code</code>` |
| CL-08 | HTMLエスケープ | `<script>` → `&lt;script&gt;` |

---

## 16. テーマ管理

### 16.1 テスト

| # | シナリオ | 期待結果 |
|---|---------|---------|
| TH-01 | 初期値(localStorage無し) | "system" |
| TH-02 | localStorage="dark" | "dark" |
| TH-03 | "light"設定 | `data-theme="light"` 属性設定 |
| TH-04 | "dark"設定 | `data-theme="dark"` 属性設定 |
| TH-05 | "system"設定 | `data-theme`属性削除 |
| TH-06 | テーマ切替サイクル | light → dark → system → light |
| TH-07 | localStorage保存 | `localStorage.setItem("theme", mode)` |

---

## 17. サムネイル管理

### 17.1 正常系テスト

| # | シナリオ | 期待結果 |
|---|---------|---------|
| TN-01 | リモートサムネイルDL+PNG変換 | fetch → convertImageToPng → save_thumbnail |
| TN-02 | 候補URL順序 | maxresdefault → sddefault → primary → hqdefault |
| TN-03 | 既存サムネイル検出 | `find_existing_thumbnail`でスキップ |
| TN-04 | uploaderIdによるフォルダ分類 | `@handle/title [id].png` 形式で保存 |
| TN-05 | フォルダ変更時の再解決 | `refreshThumbnailsForDir` → 全動画のパス更新 |
| TN-06 | リモートURLのスキップ(refreshThumbnails) | http/https/asset/data: で始まるURLはスキップ |

### 17.2 異常系テスト

| # | シナリオ | 期待結果 |
|---|---------|---------|
| TN-07 | 全候補URL fetch失敗 | 最初のURL文字列を返却 |
| TN-08 | PNG変換失敗 | 元のバイナリで保存 |
| TN-09 | uploaderIdなし | ローカル保存スキップ, リモートURLを返却 |
| TN-10 | save_thumbnail失敗 | URLフォールバック |

### 17.3 拡張子推定 (`guessThumbnailExtension`)

| # | Content-Type | URL | 期待結果 |
|---|-------------|-----|---------|
| TE-01 | "image/jpeg" | 任意 | "jpg" |
| TE-02 | "image/png" | 任意 | "png" |
| TE-03 | "image/webp" | 任意 | "webp" |
| TE-04 | null | `...file.png?q=1` | "png" |
| TE-05 | null | `...file.jpeg` | "jpg" |
| TE-06 | null | `...file` | "jpg" (デフォルト) |

### 17.4 uploaderHandle導出 (`deriveUploaderHandle`)

| # | uploaderId | uploaderUrl | channelUrl | 期待結果 |
|---|-----------|------------|-----------|---------|
| UH-01 | "@handle" | 任意 | 任意 | "@handle" |
| UH-02 | "" | `youtube.com/@handle/videos` | 任意 | "@handle" |
| UH-03 | "" | "" | `youtube.com/@ch/streams` | "@ch" |
| UH-04 | "" | "" | "" | null |
| UH-05 | "UCxxxxxxx" | "" | "" | null (@ prefix無し) |

---

## 18. 永続化状態管理

### 18.1 正常系テスト

| # | シナリオ | 期待結果 |
|---|---------|---------|
| PS-01 | 初回ロード(Tauriストア) | `load_state`から設定+動画リスト復元 |
| PS-02 | Tauriストア空時のlocalStorageフォールバック | localStorageから動画リスト読み込み |
| PS-03 | 動画のcommentsStatus正規化 | 未定義 → "pending" |
| PS-04 | cookiesSourceレガシー互換 | cookiesFile有+source無 → source="file" |
| PS-05 | ブラウザデフォルト | source="browser" + browser無 → "chrome" |
| PS-06 | 自動保存(debounce) | 動画/設定変更時に1秒debounceで`save_state` |
| PS-07 | 言語設定復元 | loadedLanguage → i18n.changeLanguage |

### 18.2 異常系テスト

| # | シナリオ | 期待結果 |
|---|---------|---------|
| PS-08 | load_state失敗 | 空配列フォールバック |
| PS-09 | localStorage JSON不正 | 空配列フォールバック |
| PS-10 | save_state失敗 | UIブロックせず黙殺 |

### 18.3 Rust側: ファイル分離テスト

| # | テストケース | 期待結果 |
|---|------------|---------|
| PF-01 | settings/app.json読み込み | VersionedSettings形式パース |
| PF-02 | index/videos.json読み込み | VersionedVideos形式パース |
| PF-03 | バージョン互換性 | version > SCHEMA_VERSION → デフォルト値 |
| PF-04 | レガシー形式(version無し) | 直接パース試行 |
| PF-05 | atomic_write | 一時ファイル経由の安全な書き込み |

---

## 19. yt-dlp自動更新

### 19.1 正常系テスト

| # | シナリオ | 期待結果 |
|---|---------|---------|
| YU-01 | 自動更新開始 | `isStateReady` + `isDataCheckDone` + `ytDlpAvailable` → `update_yt_dlp` |
| YU-02 | 更新成功 | フローティング通知(success): "yt-dlpを更新しました" |
| YU-03 | 更新失敗 | フローティング通知(error): "yt-dlpの更新に失敗しました" |
| YU-04 | 重複通知防止 | 同一key + 5秒以内 → 通知スキップ |
| YU-05 | 通知自動消去 | 8秒後に自動削除 |
| YU-06 | 更新完了フラグ | `ytDlpUpdateDone` = true (メタデータ取得トリガー) |

### 19.2 異常系テスト

| # | シナリオ | 期待結果 |
|---|---------|---------|
| YU-07 | yt-dlp未検出時 | `ytDlpAvailable` = false → 更新スキップ |
| YU-08 | 二重呼出防止 | `updateRequestedRef` = true → 2回目スキップ |

---

## 20. ダウンロードエラースライド

### 20.1 テスト

| # | シナリオ | 期待結果 |
|---|---------|---------|
| ES-01 | 同一タイトルのエラー集約 | video/comments/metadataフェーズ別にグループ化 |
| ES-02 | 最新のエラーが優先 | createdAt降順ソート |
| ES-03 | スライドインデックス範囲 | 0 ≤ index < slides.length |
| ES-04 | 空エラーリスト | slides = [], index = 0 |
| ES-05 | エラー追加時のインデックス調整 | 範囲外にならないようclamp |

---

## 21. アクティブアクティビティ表示

### 21.1 テスト

| # | シナリオ | 期待結果 |
|---|---------|---------|
| AA-01 | 一括DL中 | 空配列(FloatingStatusStackの一括パネルで表示) |
| AA-02 | 動画DL中 | status = "動画をダウンロード中" |
| AA-03 | コメントDL中 | status = "ライブチャットを取得中" |
| AA-04 | キュー待機中 | status = "ダウンロード待機中" |
| AA-05 | コメント準備中 | status = "ライブチャット準備中" |
| AA-06 | 重複ID統合 | downloadingIds∪commentsDownloadingIds∪queuedDownloadIds∪pendingCommentIds |

---

## 22. ユーティリティ関数

### 22.1 `formatDuration`

| # | 入力 | 期待結果 |
|---|-----|---------|
| FD-01 | 0 | "" |
| FD-02 | null/undefined/NaN | "" |
| FD-03 | 65 | "1:05" |
| FD-04 | 3661 | "1:01:01" |
| FD-05 | 59 | "0:59" |

### 22.2 `formatClock`

| # | 入力 | 期待結果 |
|---|-----|---------|
| FC-01 | 0 | "0:00" |
| FC-02 | null/undefined/NaN | "" |
| FC-03 | 65000 | "1:05" |
| FC-04 | -1000 | "0:00" (負の値はmax(0,...)) |

### 22.3 `parseDateValue`

| # | 入力 | 期待結果 |
|---|-----|---------|
| PD-01 | "2024-01-15T10:00:00Z" | ミリ秒タイムスタンプ |
| PD-02 | "1705312800" (10桁) | × 1000 でミリ秒 |
| PD-03 | "1705312800000" (13桁) | そのままミリ秒 |
| PD-04 | "" / null / undefined | null |
| PD-05 | "invalid" | null |

### 22.4 `getVideoSortTime`

| # | 入力 | 期待結果 |
|---|-----|---------|
| GS-01 | publishedAt有り | publishedAtのミリ秒 |
| GS-02 | publishedAt無し, addedAt有り | addedAtのミリ秒 |
| GS-03 | 両方無し | 0 |

### 22.5 `parseUploadDate`

| # | 入力 | 期待結果 |
|---|-----|---------|
| PU-01 | "20240115" | "2024-01-15T00:00:00.000Z" |
| PU-02 | "" / null | undefined |
| PU-03 | "2024-01-15" (非8桁) | undefined |

### 22.6 `toAssetUrl`

| # | 入力 | 期待結果 |
|---|-----|---------|
| AS-01 | `D:\videos\test.mp4` | `https://asset.localhost/D%3A/videos/test.mp4` |
| AS-02 | Unicode文字含むパス | 各セグメントがencodeURIComponent |
| AS-03 | asset:// 形式 | `asset://localhost/...` 形式も対応 |
| AS-04 | 非asset URL | そのまま返却 |

### 22.7 `deriveContentType`

| # | 入力 | 期待結果 |
|---|-----|---------|
| CT-01 | isLive=true | "live" |
| CT-02 | liveStatus="is_live" | "live" |
| CT-03 | liveStatus="upcoming" | "live" |
| CT-04 | liveStatus="post_live" | "live" |
| CT-05 | liveStatus="was_live" | "live" |
| CT-06 | webpageUrl="/shorts/..." | "shorts" |
| CT-07 | durationSec=30 | "shorts" |
| CT-08 | durationSec=60 | "shorts" (≤60) |
| CT-09 | durationSec=61 | "video" |
| CT-10 | デフォルト | "video" |

---

## 23. Rustバックエンド

### 23.1 ファイルシステム

| # | テストケース | 期待結果 |
|---|------------|---------|
| RS-01 | `extract_id_from_filename("title [abc123].mp4")` | "abc123" |
| RS-02 | `extract_id_from_filename("no-brackets.mp4")` | None |
| RS-03 | `find_info_json` - ファイル名にIDマッチ | 即return |
| RS-04 | `find_info_json` - JSON内のidフィールドマッチ | フォールバック |
| RS-05 | `resolve_video_file` - インデックスキャッシュ | VideoIndexStateから高速解決 |
| RS-06 | `resolve_video_file` - ディスクスキャン | キャッシュミス時にディレクトリ走査 |
| RS-07 | `library_videos_dir` | `{output_dir}/videos/` |
| RS-08 | `library_metadata_dir` | `{output_dir}/metadata/` |
| RS-09 | `library_comments_dir` | `{output_dir}/comments/` |
| RS-10 | `library_thumbnails_dir` | `{output_dir}/thumbnails/` |
| RS-11 | `resolve_library_root_dir` - 子フォルダ指定 | 親ディレクトリを返却 |
| RS-12 | `sanitize_path_component` | 制御文字・禁止文字を `_` に置換, 最大長制限 |
| RS-13 | `sanitize_filename_component` | ASCII英数字と-_のみ, 最大60文字 |

### 23.2 コメントファイル検索

| # | テストケース | 期待結果 |
|---|------------|---------|
| CF-01 | `.live_chat.json` 優先 | live_chat > comments > info.json |
| CF-02 | ファイル名にID含む | 直接マッチ |
| CF-03 | JSON内video_idマッチ | 第1行のJSONL or objectからID抽出 |
| CF-04 | info.jsonからの関連ファイル探索 | stem + ".live_chat.json" → stem + ".comments.json" |
| CF-05 | 候補1件のみ | そのまま返却 |

### 23.3 メタデータ解析

| # | テストケース | 期待結果 |
|---|------------|---------|
| MP-01 | `parse_video_metadata_value` | 全フィールド正常マッピング |
| MP-02 | channel fallback | channel → uploader → channel_title |
| MP-03 | 不在フィールド | None |
| MP-04 | tags/categories配列 | Vec<String>変換 |

### 23.4 パス正規化

| # | 入力 | 期待結果 |
|---|-----|---------|
| PN-01 | `/path/to/library` | `/path/to/library` |
| PN-02 | `/path/to/library/videos` | `/path/to/library` (parentに戻る) |
| PN-03 | `/path/to/library/metadata` | `/path/to/library` |
| PN-04 | `/path/to/library/comments` | `/path/to/library` |
| PN-05 | `/path/to/library/thumbnails` | `/path/to/library` |
| PN-06 | `/path/to/library/contents` | `/path/to/library` |

### 23.5 ダウンロードプロセス管理

| # | テストケース | 期待結果 |
|---|------------|---------|
| DP-01 | 同時DLキャンセル | `cancelled`セットに追加 → wait → process kill |
| DP-02 | プロセスマップ管理 | children HashMap<id, Child> |
| DP-03 | 非公開動画検出 | stderr含む"private" → is_private=true |
| DP-03b | 削除動画検出 | stderr含む"has been removed" → is_deleted=true |
| DP-04 | タイトル警告リトライ | YTDLP_TITLE_WARNING検出 → 再試行 |
| DP-05 | CREATE_NO_WINDOW (Windows) | 0x08000000フラグ |
| DP-06 | エラーログ書き出し | `write_error_log` → errorlogs/ に保存 |

### 23.6 ウィンドウサイズ永続化

| # | テストケース | 期待結果 |
|---|------------|---------|
| WS-01 | メインウィンドウサイズ保存 | JSON形式: {width, height, x, y} |
| WS-02 | プレイヤーウィンドウサイズ保存 | 別ファイルに保存 |
| WS-03 | サイズ復元 | 起動時にファイルから読み込み |
| WS-04 | デバウンス保存 | 頻繁なリサイズに対応 |

---

## 24. UIコンポーネント

### 24.1 VideoCard

| # | テストケース | 期待結果 |
|---|------------|---------|
| VC-01 | downloaded + playable | 再生ボタン表示, overlayClass="play-overlay" |
| VC-02 | pending | ダウンロードボタン表示, overlayClass="download-overlay" |
| VC-03 | downloading | ボタンdisabled |
| VC-04 | queued | ボタンdisabled |
| VC-05 | isCurrentlyLive | ボタンdisabled |
| VC-06 | isPrivate + !downloaded | ボタンdisabled, 非公開バッジ表示 |
| VC-06b | isDeleted + !downloaded | ボタンdisabled, 削除バッジ表示 |
| VC-07 | メニュー開閉 | クリックでトグル, Escapeで閉じ, 外側クリックで閉じ |
| VC-08 | お気に入りトグル | ハートアイコン切替 |
| VC-09 | コンテキストメニュー項目 | DL(canDownloadのみ), メタデータ更新, ブラウザで開く, URL複製, 削除(canDeleteのみ) |
| VC-10 | failed状態 | エラーバッジ表示 |
| VC-11 | commentsDownloading | ライブチャットバッジアニメーション |
| VC-12 | 再生時間表示 | durationSecフォーマット表示 |

### 24.2 VideoGrid

| # | テストケース | 期待結果 |
|---|------------|---------|
| VG-01 | 仮想化レンダリング | react-window FixedSizeGrid使用 |
| VG-02 | レスポンシブカラム数 | max4列, 幅に応じて動的計算 |
| VG-03 | 追加中スケルトン | showAddSkeleton=true時に先頭にスケルトン |
| VG-04 | アイテムキー | video.id使用, スケルトンは"skeleton" |
| VG-05 | overscan | 2行分 |

### 24.3 VideoFilters

| # | テストケース | 期待結果 |
|---|------------|---------|
| VF-01 | 検索入力 | onSearchChange呼出 |
| VF-02 | 検索クリア | 検索クエリ有り時のみクリアボタン表示 |
| VF-03 | フィルター選択 | segmentedボタンのactive切替 |
| VF-04 | 表示件数 | `filteredCount / totalCount` |
| VF-05 | 一括DLボタン | bulkDownloadDisabledでdisabled制御 |

### 24.4 AddVideoModal

| # | テストケース | 期待結果 |
|---|------------|---------|
| AM-01 | タブ切替(video/channel) | segmented active切替 |
| AM-02 | 送信ボタン制御 | URL空 or isAdding → disabled |
| AM-03 | エラー表示 | errorMessage非空時に表示 |
| AM-04 | Backdrop click | onClose呼出 |
| AM-05 | 追加時DLチェックボックス | videoモードのみ表示 |

### 24.5 SettingsModal

| # | テストケース | 期待結果 |
|---|------------|---------|
| SM-01 | タブ切替(general/tools/data) | コンテンツ切替 |
| SM-02 | ツール状態表示 | ok/missing ピル表示 |
| SM-03 | DL品質セレクトボックス | 6オプション |
| SM-04 | 言語セレクトボックス | 日本語/English |
| SM-05 | インテグリティサマリー | 問題数表示 |

### 24.6 SetupDialog

| # | テストケース | 期待結果 |
|---|------------|---------|
| SD-01 | idle状態 | 不足ツールリスト + 自動DL / スキップボタン |
| SD-02 | downloading状態 | プログレスバー + spinner |
| SD-03 | done状態 | 完了メッセージ + 閉じるボタン |
| SD-04 | error状態 | エラーメッセージ + リトライ / スキップ |
| SD-05 | active中のbackdrop click | 閉じ不可 |

### 24.7 UpdateModal

| # | テストケース | 期待結果 |
|---|------------|---------|
| UM-01 | 更新あり表示 | currentVersion, latestVersion |
| UM-02 | 変更履歴トグル | 展開/折りたたみ |
| UM-03 | DL進捗 | プログレスバー + バイト表示 |
| UM-04 | エラー表示 | エラーメッセージ |
| UM-05 | isUpdating中のbackdrop click | 閉じ不可 |
| UM-06 | SmartScreen警告 | 非更新中のみ表示 |

### 24.8 DeleteConfirmModal

| # | テストケース | 期待結果 |
|---|------------|---------|
| DC-01 | リストのみ削除 | onDeleteListOnly呼出 |
| DC-02 | ファイル含め削除 | onDeleteWithFiles呼出 |
| DC-03 | キャンセル | onCancel呼出 |

### 24.9 FloatingStatusStack

| # | テストケース | 期待結果 |
|---|------------|---------|
| FS-01 | パネルなし | null返却 |
| FS-02 | フローティング通知 | kind別スタイル(error/success/info) |
| FS-03 | メタデータ取得中 | spinner + 進捗 |
| FS-04 | メタデータ一時停止 | 一時停止理由 + 再開ボタン |
| FS-05 | ダウンロードエラー | スライド表示(prev/next) + クリアボタン |
| FS-06 | 一括DL進捗 | 進捗バー + 停止ボタン |
| FS-07 | 個別DL進捗 | アクティビティ一覧(ログ展開可) |

### 24.10 LoadingOverlay

| # | テストケース | 期待結果 |
|---|------------|---------|
| LO-01 | isStateReady=false | オーバーレイ表示 |
| LO-02 | isStateReady=true | 非表示 |

---

## 25. i18n（国際化）

### 25.1 テスト

| # | テストケース | 期待結果 |
|---|------------|---------|
| I-01 | 日本語(ja) | ja.json キー全て存在 |
| I-02 | 英語(en) | en.json キー全て存在 |
| I-03 | キー不足なし | ja.jsonとen.jsonのキー構造が一致 |
| I-04 | 補間パラメータ | `{{count}}`, `{{detail}}` 等が正しく置換 |
| I-05 | 言語切替 | `i18n.changeLanguage` → UI即時反映 |
| I-06 | フォールバック | 未定義キー → フォールバック言語 |

---

## 26. エッジケース・統合テスト

### 26.1 ネットワーク関連

| # | シナリオ | 期待結果 |
|---|---------|---------|
| EC-01 | DL中のネットワーク切断 | yt-dlpのエラー → classifyDownloadError → 適切なエラー表示 |
| EC-02 | メタデータ取得中のネットワーク切断 | 失敗通知 → 次の動画へ |
| EC-03 | oEmbed API タイムアウト | fetchの例外 → エラーメッセージ |

### 26.2 ファイルシステム関連

| # | シナリオ | 期待結果 |
|---|---------|---------|
| EC-04 | DL完了後にファイル手動削除 | 整合性チェックでvideoMissing検出 |
| EC-05 | 保存先フォルダの権限不足 | `fs::create_dir_all` エラー |
| EC-06 | 非常に長いファイル名 | `sanitize_path_component`で切り詰め |
| EC-07 | Unicode文字含むファイルパス | `toAssetUrl`で正しくエンコード |
| EC-08 | DL中の保存先変更 | 進行中DLには影響なし |

### 26.3 動画状態の特殊ケース

| # | シナリオ | 期待結果 |
|---|---------|---------|
| EC-09 | 非公開動画の追加 | oEmbed取得時にForbidden or メタデータで検出 |
| EC-10 | 削除された動画の追加 | oEmbed取得時にNot Found or メタデータで検出 |
| EC-11 | 年齢制限動画 | ageLimit設定, DLにCookies必要の可能性 |
| EC-12 | ライブ配信中の動画 | DL不可通知, contentType="live" |
| EC-13 | 配信予定の動画 | DL不可通知, contentType="live" |
| EC-13b | 非公開の動画 | DL不可通知, isPrivateフラグ設定, 非公開バッジ表示 |
| EC-13c | 削除された動画 | DL不可通知, isDeletedフラグ設定, 削除バッジ表示 |
| EC-14 | 終了したライブ配信 | 通常通りDL可能, liveStatus="was_live"/"post_live" |
| EC-15 | ショート動画 | contentType="shorts", 60秒以下 |

### 26.4 同時操作

| # | シナリオ | 期待結果 |
|---|---------|---------|
| EC-16 | 個別DL + 一括DL同時 | 一括DL中エラー通知 or waitingForSingles |
| EC-17 | メタデータ取得 + DL同時 | メタデータ完了を15秒待機 |
| EC-18 | 複数タブ/ウィンドウ | プレイヤーウィンドウの切替確認 |
| EC-19 | 急速な動画追加 | バッチ更新で最適化(debounce 300ms) |

### 26.5 起動シーケンス

| # | ステップ | 条件 | 期待結果 |
|---|---------|------|---------|
| SQ-01 | 状態ロード | 起動時 | load_state → 設定/動画リスト復元 |
| SQ-02 | ツールチェック | 状態ロード後 | check_tooling → ツール状態判定 |
| SQ-03 | セットアップダイアログ | ツール不足時 | SetupDialog表示 |
| SQ-04 | ローカルファイルチェック | 状態準備完了後 | 整合性チェック(バックグラウンド) |
| SQ-05 | yt-dlp更新 | データチェック完了後 | update_yt_dlp呼出 |
| SQ-06 | メタデータ自動取得 | yt-dlp更新完了 + 整合性問題なし | 未取得動画のメタデータ取得開始 |
| SQ-07 | プレイヤーウィンドウ初期化 | `?player=1&videoId=X` パラメータ | pending store ポーリング → 動画再生 |

### 26.6 データ整合性

| # | シナリオ | 期待結果 |
|---|---------|---------|
| DI-01 | 保存先フォルダ変更 | サムネイル再解決 + 整合性チェック |
| DI-02 | バックアップ復元後 | 整合性チェックフラグ設定 + リロード |
| DI-03 | 動画削除(リストのみ) | videos配列から除外, ファイルは維持 |
| DI-04 | 動画削除(ファイル含) | `delete_video_files` invoke + videos配列除外 |
| DI-05 | チェック中のdownloadDir変更 | `hasCheckedFiles`リセット, 再チェック |

---

## テストの優先度

### ~~P0 (必須)~~ 🔴 Critical

- D-01〜D-06: ダウンロード基本フロー
- D-07〜D-18: ダウンロードエラーハンドリング
- P-01〜P-02: 再生基本フロー
- PS-01〜PS-06: 永続化基本フロー
- AV-01〜AV-10: URL解析
- IC-01〜IC-04: 整合性チェック基本

### ~~P1 (重要)~~ 🟡 Important

- M-01〜M-10: メタデータ取得
- B-01〜B-07: 一括ダウンロード
- C-01〜C-05: コメントダウンロード
- CH-01〜CH-05: チャンネル取得
- TS-01〜TS-03: ツールセットアップ
- BK-01〜BK-03: バックアップ
- SET-01〜SET-14: 設定管理

### ~~P2 (通常)~~ 🟢 Normal

- VC-01〜VC-12: VideoCard表示
- VF-01〜VF-05: フィルター
- F-01〜F-08: フィルタリングロジック
- S-01〜S-08: 検索ロジック
- TN-01〜TN-10: サムネイル
- AU-01〜AU-07: アプリ更新
- TH-01〜TH-07: テーマ

### ~~P3 (低)~~ ⚪ Low

- UM-01〜UM-06: UpdateModal UI
- SD-01〜SD-05: SetupDialog UI
- ES-01〜ES-05: エラースライド
- AA-01〜AA-06: アクティビティ

---

## テスト環境セットアップ

### 必要なモック

1. **Tauri API**: `@tauri-apps/api/core` (`invoke`), `@tauri-apps/api/event` (`listen`, `emitTo`)
2. **Tauri プラグイン**: `@tauri-apps/plugin-dialog` (`open`), `@tauri-apps/plugin-opener` (`openPath`, `revealItemInDir`, `openUrl`), `@tauri-apps/plugin-updater` (`check`), `@tauri-apps/plugin-process` (`relaunch`)
3. **WebviewWindow**: `@tauri-apps/api/webviewWindow`
4. **fetch API**: oEmbed, サムネイルダウンロード
5. **localStorage**: 設定の永続化
6. **HTMLVideoElement**: canplay, timeupdate, error イベント
7. **createImageBitmap / canvas**: PNG変換

### テスティングライブラリ

- **Vitest**: ユニットテスト
- **React Testing Library**: コンポーネントテスト
- **Playwright**: E2Eテスト (既存の `e2e/tauri-smoke.spec.ts`)
