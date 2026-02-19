# テストシナリオ詳細定義

> 実際のソースコードに基づくテストシナリオ。各テストケースにモック方針と検証ポイントを定義。

## 概要

| レイヤー | テスト種別 | フレームワーク | 対象 |
|---------|----------|-------------|------|
| **A** | ユーティリティ関数 | Vitest | 純粋関数（formatters, metadataHelpers, changelogParser） |
| **B** | フック単体 | Vitest + renderHook | カスタムフック（Tauri API モック） |
| **C** | コンポーネント | Vitest + Testing Library | UIコンポーネントの表示・操作 |
| **D** | Rust ユニット | cargo test | パース・検出ロジック |
| **E** | 統合シナリオ | Vitest | 複数フック/コンポーネントの連携 |

---

## A. ユーティリティ関数テスト

### A-1. formatters.ts

#### A-1-1. `formatDuration(value?: number | null): string`

| # | シナリオ | 入力 | 期待値 | 根拠 |
|---|---------|------|--------|-----|
| 1 | 秒のみ | `45` | `"0:45"` | `hours=0` → `m:ss` 形式 |
| 2 | 分+秒 | `125` | `"2:05"` | 秒のゼロ埋め確認 |
| 3 | 時+分+秒 | `3661` | `"1:01:01"` | `hours>0` → `h:mm:ss` 形式 |
| 4 | ゼロ | `0` | `"0:00"` | `value===0` は有効値 |
| 5 | null | `null` | `""` | `!value` ガード |
| 6 | undefined | `undefined` | `""` | `!value` ガード |
| 7 | NaN | `NaN` | `""` | `Number.isNaN` ガード |
| 8 | 24時間 | `86400` | `"24:00:00"` | 長時間動画 |

#### A-1-2. `formatClock(ms?: number | null): string`

| # | シナリオ | 入力(ms) | 期待値 |
|---|---------|----------|--------|
| 1 | 通常 | `65000` | `"1:05"` |
| 2 | ゼロ | `0` | `"0:00"` |
| 3 | null | `null` | `""` |
| 4 | 負の値 | `-1000` | `"0:00"` |
| 5 | undefined | `undefined` | `""` |

#### A-1-3. `parseDateValue(value?: string): number | null`

| # | シナリオ | 入力 | 期待値 |
|---|---------|------|--------|
| 1 | ISO文字列 | `"2024-01-15T00:00:00Z"` | ミリ秒数値 |
| 2 | Unix秒(10桁) | `"1705276800"` | `1705276800000` |
| 3 | ミリ秒(13桁) | `"1705276800000"` | `1705276800000` |
| 4 | 空文字列 | `""` | `null` |
| 5 | undefined | `undefined` | `null` |
| 6 | 不正文字列 | `"invalid"` | `null` |
| 7 | 空白のみ | `"  "` | `null` |

#### A-1-4. `getVideoSortTime(video: VideoDateLike): number`

| # | シナリオ | 入力 | 期待値 |
|---|---------|------|--------|
| 1 | publishedAt優先 | `{ publishedAt: "2024-01-15T00:00:00Z", addedAt: "2024-01-20T00:00:00Z" }` | publishedAtのミリ秒 |
| 2 | addedAtフォールバック | `{ addedAt: "2024-01-20T00:00:00Z" }` | addedAtのミリ秒 |
| 3 | 両方なし | `{ addedAt: "" }` | `0` |

#### A-1-5. `formatPublishedAt(value?: string): string`

| # | シナリオ | 入力 | 期待値 |
|---|---------|------|--------|
| 1 | ISO文字列 | `"2024-01-15T00:00:00Z"` | ja-JPロケール文字列 |
| 2 | undefined | `undefined` | `""` |
| 3 | 空文字列 | `""` | `""` |

---

### A-2. metadataHelpers.ts

#### A-2-1. `parseVideoId(url: string): string | null`

| # | シナリオ | 入力 | 期待値 | コード上の分岐 |
|---|---------|------|--------|-------------|
| 1 | 標準watch | `"https://www.youtube.com/watch?v=dQw4w9WgXcQ"` | `"dQw4w9WgXcQ"` | `searchParams.get("v")` |
| 2 | 短縮URL | `"https://youtu.be/dQw4w9WgXcQ"` | `"dQw4w9WgXcQ"` | `hostname.includes("youtu.be")` → `pathname` |
| 3 | shorts | `"https://www.youtube.com/shorts/dQw4w9WgXcQ"` | `"dQw4w9WgXcQ"` | `/shorts/` 分岐 |
| 4 | live | `"https://www.youtube.com/live/dQw4w9WgXcQ"` | `"dQw4w9WgXcQ"` | `/live/` 分岐 |
| 5 | embed | `"https://www.youtube.com/embed/dQw4w9WgXcQ"` | `"dQw4w9WgXcQ"` | `/embed/` 分岐 |
| 6 | nocookie | `"https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"` | `"dQw4w9WgXcQ"` | `youtube-nocookie.com` ホスト判定 |
| 7 | パラメータ付き | `"https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120"` | `"dQw4w9WgXcQ"` | 追加パラメータ無視 |
| 8 | モバイル | `"https://m.youtube.com/watch?v=dQw4w9WgXcQ"` | `"dQw4w9WgXcQ"` | サブドメイン `endsWith` |
| 9 | 非YouTubeホスト | `"https://example.com/watch?v=abc"` | `null` | `isYouTubeHost` ガード |
| 10 | 空文字列 | `""` | `null` | `new URL()` でcatch |
| 11 | URLでない文字列 | `"dQw4w9WgXcQ"` | `null` | `new URL()` でcatch |
| 12 | youtu.beサブドメイン | `"https://www.youtu.be/dQw4w9WgXcQ"` | `"dQw4w9WgXcQ"` | `endsWith(".youtu.be")` |

#### A-2-2. `parseUploadDate(value?: string | null): string | undefined`

| # | シナリオ | 入力 | 期待値 |
|---|---------|------|--------|
| 1 | 8桁日付 | `"20240115"` | `"2024-01-15T00:00:00.000Z"` |
| 2 | null | `null` | `undefined` |
| 3 | 空文字列 | `""` | `undefined` |
| 4 | 不正形式 | `"2024-01"` | `undefined` |
| 5 | 空白のみ | `"  "` | `undefined` |

#### A-2-3. `parseTimestamp(value?: number | null): string | undefined`

| # | シナリオ | 入力 | 期待値 |
|---|---------|------|--------|
| 1 | 有効なUnix秒 | `1705276800` | ISO文字列 |
| 2 | null | `null` | `undefined` |
| 3 | Infinity | `Infinity` | `undefined` |
| 4 | NaN | `NaN` | `undefined` |

#### A-2-4. `deriveContentType` — コンテンツ種別判定

| # | シナリオ | 入力 | 期待値 | コード上の分岐 |
|---|---------|------|--------|-------------|
| 1 | isLive=true | `{ isLive: true }` | `"live"` | 最初の条件 |
| 2 | liveStatus="is_live" | `{ liveStatus: "is_live" }` | `"live"` | liveStatus分岐 |
| 3 | liveStatus="is_upcoming" | `{ liveStatus: "is_upcoming" }` | `"live"` | liveStatus分岐 |
| 4 | liveStatus="was_live" | `{ liveStatus: "was_live" }` | `"live"` | `post_live/was_live` 分岐 |
| 5 | liveStatus="post_live" | `{ liveStatus: "post_live" }` | `"live"` | 同上 |
| 7 | shorts URL | `{ webpageUrl: "https://youtube.com/shorts/abc" }` | `"shorts"` | URL判定 |
| 8 | 60秒以下 | `{ durationSec: 30 }` | `"shorts"` | 時間判定 |
| 9 | 61秒 | `{ durationSec: 61 }` | `"video"` | 境界値 |
| 10 | 条件なし | `{}` | `"video"` | デフォルト |
| 11 | 大文字小文字 | `{ liveStatus: "IS_LIVE" }` | `"live"` | `.toLowerCase()` |

#### A-2-5. `isCurrentlyLive`

| # | シナリオ | 入力 | 期待値 |
|---|---------|------|--------|
| 1 | isLive=true | `{ isLive: true }` | `true` |
| 2 | is_live | `{ liveStatus: "is_live" }` | `true` |
| 3 | is_upcoming | `{ liveStatus: \"is_upcoming\" }` | `true` |
| 4 | was_live | `{ liveStatus: \"was_live\" }` | `false` |
| 5 | 何もなし | `{}` | `false` |

#### A-2-6. `buildMetadataFields`

| # | シナリオ | テスト内容 |
|---|---------|----------|
| 1 | 全フィールド入力 | すべてのフィールドが正しくマッピング |
| 2 | 全null入力 | undefinedフィールドのみ、contentType="video" |
| 3 | publishedAt優先順位 | releaseTimestamp > timestamp > uploadDate |
| 4 | releaseTimestampのみ | publishedAtがreleaseTimestampから生成 |
| 5 | timestampのみ | publishedAtがtimestampから生成 |
| 6 | uploadDateのみ | publishedAtがuploadDateから生成 |
| 7 | ライブ配信メタデータ | contentType="live" |
| 8 | Shortsメタデータ | contentType="shorts" |

#### A-2-7. `guessThumbnailExtension`

| # | シナリオ | 入力 | 期待値 |
|---|---------|------|--------|
| 1 | Content-Type: image/jpeg | `("url", "image/jpeg")` | `"jpg"` |
| 2 | Content-Type: image/png | `("url", "image/png")` | `"png"` |
| 3 | Content-Type: image/webp | `("url", "image/webp")` | `"webp"` |
| 4 | Content-Type: image/gif | `("url", "image/gif")` | `"gif"` |
| 5 | URLの拡張子 | `("thumb.png?v=1", null)` | `"png"` |
| 6 | jpeg→jpg変換 | `("thumb.jpeg", null)` | `"jpg"` |
| 7 | デフォルト | `("thumb", null)` | `"jpg"` |

#### A-2-8. `deriveUploaderHandle`

| # | シナリオ | 入力 | 期待値 |
|---|---------|------|--------|
| 1 | @始まりID | `("@user", null, null)` | `"@user"` |
| 2 | uploaderURLから | `(null, "https://youtube.com/@handle", null)` | `"@handle"` |
| 3 | channelURLフォールバック | `(null, null, "https://youtube.com/@ch")` | `"@ch"` |
| 4 | すべてnull | `(null, null, null)` | `null` |
| 5 | 空文字列のID | `("", "https://youtube.com/@h", null)` | `"@h"` |

#### A-2-9. `buildThumbnailCandidates`

| # | シナリオ | テスト内容 |
|---|---------|----------|
| 1 | primary指定あり | `[maxres, sd, primary, hqdefault]` の4要素 |
| 2 | primary=null | 3番目が`null` |
| 3 | ID反映確認 | URLにIDが含まれる |

---

## B. フック単体テスト

### モック共通設定

```typescript
// テスト共通のTauriモック
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const eventListeners = new Map<string, Function>();
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((event: string, handler: Function) => {
    eventListeners.set(event, handler);
    return Promise.resolve(() => eventListeners.delete(event));
  }),
  emitTo: vi.fn(),
}));

// イベント発火ヘルパー
function emitEvent(name: string, payload: unknown) {
  const handler = eventListeners.get(name);
  if (handler) handler({ payload });
}
```

---

### B-1. useDownloadEvents

> ファイル: `src/hooks/useDownloadEvents.ts`
> 4つのTauriイベントリスナー: `download-progress`, `download-finished`, `comments-progress`, `comments-finished`

#### B-1-1. download-finished — ダウンロード完了イベント

| # | シナリオ | ペイロード | 検証ポイント |
|---|---------|----------|------------|
| 1 | 成功 | `{ id: "v1", success: true, stderr: "", stdout: "" }` | `downloadStatus → "downloaded"`, エラー削除, 進捗削除, `warmVideoCache` 呼出 |
| 2 | 失敗(通常) | `{ id: "v1", success: false, stderr: "error msg", stdout: "" }` | `downloadStatus → "failed"`, `videoErrors[v1]` セット, `addDownloadErrorItem` 呼出, `addFloatingNotice(kind:"error")` |
| 3 | **非公開検出** | `{ id: "v1", success: false, isPrivate: true, stderr: "This video is private", stdout: "" }` | `downloadStatus → "failed"`, `isPrivate: true` セット, `addFloatingNotice(title: privateVideoDownloadFailed, details: タイトル+チャンネル)`, autoDismissなし, videoErrorsには追加**しない** |
| 3b | **削除検出** | `{ id: "v1", success: false, isDeleted: true, stderr: "has been removed by the uploader", stdout: "" }` | `downloadStatus → "failed"`, `isDeleted: true` セット, `addFloatingNotice(title: deletedVideoDownloadFailed, details: タイトル+チャンネル)`, autoDismissなし, videoErrorsには追加**しない** |
| 4 | キャンセル | `{ id: "v1", success: false, cancelled: true, stderr: "", stdout: "" }` | `downloadStatus → "pending"`, エラー削除, 進捗削除 |
| 5 | 成功→自動コメントDL(非一括) | `{ id: "v1", success: true }` + bulkDownload非アクティブ | `maybeStartAutoCommentsDownload("v1")` 呼出 |
| 6 | 成功（一括DL中） | `{ id: "v1", success: true }` + bulk.active=true, currentId="v1" | `handleBulkCompletion("v1", false)` 呼出, コメントDLスキップ |
| 7 | キャンセル（一括DL中） | `{ id: "v1", cancelled: true }` + bulk.active=true, currentId="v1" | `handleBulkCompletion("v1", true)` 呼出 |
| 8 | 成功→コメント待ちフラグ | `maybeStartAutoCommentsDownload` が `true` を返す | `onVideoDownloadFinished(id, true)` |
| 9 | 成功→コメント不要 | `maybeStartAutoCommentsDownload` が `false` を返す | `onVideoDownloadFinished(id, false)` |

#### B-1-2. download-progress — 進捗イベント

| # | シナリオ | 検証ポイント |
|---|---------|------------|
| 1 | 進捗行受信 | `progressLines["v1"] === "50%"` |
| 2 | 複数動画の並行進捗 | 各IDの進捗が独立 |
| 3 | 上書き更新 | 既存の進捗行が新しい値で置換 |

#### B-1-3. comments-finished — コメント完了イベント

| # | シナリオ | ペイロード | 検証ポイント |
|---|---------|----------|------------|
| 1 | 成功(ファイルあり) | `{ id, success: true }` + `comments_file_exists → true` | `commentsStatus → "downloaded"` |
| 2 | 成功(ファイルなし) | `{ id, success: true }` + `comments_file_exists → false` | `commentsStatus → "unavailable"` |
| 3 | 失敗 | `{ id, success: false, stderr: "err" }` | `commentsStatus → "failed"`, `commentErrors[id]` セット |
| 4 | メタデータ付き成功 | `{ id, success: true, metadata: {...}, hasLiveChat: true }` | `applyMetadataUpdate` 呼出 with metadata & hasLiveChat |
| 5 | 一括DL中のコメント完了 | bulk.active=true, currentId=id, phase="comments" | `handleBulkCompletion` 呼出 |
| 6 | comments_file_exists例外 | invoke が reject | `commentsStatus` 変更なし, `addFloatingNotice(kind:"error", title:commentsFileCheckFailed)` 表示 |

#### B-1-4. `classifyDownloadError` — エラー分類（内部関数）

| # | stderr/stdout内容 | 分類キー |
|---|----------------|---------|
| 1 | `"yt-dlpの起動に失敗しました"` | `errors.ytdlpNotFound` |
| 2 | `"no such file or directory"` | `errors.ytdlpNotFound` |
| 3 | `"指定されたファイルが見つかりません"` | `errors.ytdlpNotFound` |
| 4 | `"the system cannot find"` | `errors.ytdlpNotFound` |
| 5 | `"unable to connect"` | `errors.networkError` |
| 6 | `"network is unreachable"` | `errors.networkError` |
| 7 | `"connection refused"` | `errors.networkError` |
| 8 | `"connection timed out"` | `errors.networkError` |
| 9 | `"timed out"` | `errors.networkError` |
| 10 | `"failed to connect"` | `errors.networkError` |
| 11 | `"getaddrinfo"` | `errors.networkError` |
| 12 | `"nodename nor servname provided"` | `errors.networkError` |
| 13 | `"HTTP Error 429"` | `errors.rateLimitError` |
| 14 | `"too many requests"` | `errors.rateLimitError` |
| 15 | `"HTTP Error 403"` | `errors.accessDeniedError` |
| 16 | `"403 Forbidden"` | `errors.accessDeniedError` |
| 17 | `"some random error"` | `errors.downloadFailed` (汎用) |

---

### B-2. useMetadataFetch

> ファイル: `src/hooks/useMetadataFetch.ts`
> Tauriイベント: `metadata-finished`
> Tauriコマンド: `start_metadata_download`, `get_metadata_index`, `get_local_metadata_by_ids`

#### B-2-1. metadata-finished — メタデータ完了イベント

| # | シナリオ | ペイロード | 検証ポイント |
|---|---------|----------|------------|
| 1 | 成功(通常動画) | `{ id, success: true, metadata: { title: "T", channel: "C", availability: "public" } }` | `applyMetadataUpdate` 呼出, `metadataFetched: true` |
| 2 | **非公開動画検出** | `{ id, success: true, isPrivate: true }` | `addFloatingNotice(kind:"error", title:privateVideoDetected, details:タイトル+チャンネル)`, autoDismissなし, `applyMetadataUpdate({ isPrivate: true })` |
| 2b | **削除済み動画検出** | `{ id, success: true, isDeleted: true }` | `addFloatingNotice(kind:"error", title:deletedVideoDetected, details:タイトル+チャンネル)`, autoDismissなし, `applyMetadataUpdate({ isDeleted: true })` |
| 3 | ライブ配信検出 | `{ id, success: true, metadata: { isLive: true } }` | `addFloatingNotice(kind:"info", title:liveStreamDetected)` |
| 4 | liveStatus="is_live"検出 | `{ id, success: true, metadata: { liveStatus: "is_live" } }` | 同上 |
| 5 | 配信予定検出 | `{ id, success: true, metadata: { liveStatus: "is_upcoming" } }` | `addFloatingNotice(kind:"info", title:upcomingStreamDetected)` |
| 6 | 失敗 | `{ id, success: false, stderr: "error" }` | 一時停止(`metadataPaused: true`), キューに再追加, `addDownloadErrorItem` 呼出 |
| 7 | 失敗後のキュー再追加 | 成功=false | `metadataActiveItem` がキュー先頭に挿入 |
| 8 | 完了カウント更新 | 任意 | `metadataFetch.completed +1`, `active` = completed < total |
| 9 | 次の取得スケジュール | 成功 + キュー残あり | 250ms後に `startNextMetadataDownload` |

#### B-2-2. `applyMetadataUpdate` — メタデータ適用ロジック

| # | シナリオ | パラメータ | 検証ポイント |
|---|---------|----------|------------|
| 1 | タイトル更新 | `metadata: { title: "New Title" }` | `patch.title === "New Title"` |
| 2 | チャンネル更新 | `metadata: { channel: "New Ch" }` | `patch.channel === "New Ch"` |
| 3 | sourceURL優先順位 | `metadata: { webpageUrl: "url1", url: "url2" }` | `patch.sourceUrl === "url1"` (webpageUrl優先) |
| 4 | **非公開→ライブステータスクリア** | `isPrivate: true` | `patch.liveStatus === null`, `patch.isLive === null` |
| 4b | **削除→ライブステータスクリア** | `isDeleted: true` | `patch.liveStatus === null`, `patch.isLive === null` |
| 5 | **非公開→wasLive保持** | `isPrivate: true`, `currentVideo.wasLive: true` | `patch.wasLive === true` |
| 5b | **削除→wasLive保持** | `isDeleted: true`, `currentVideo.wasLive: true` | `patch.wasLive === true` |
| 6 | isPrivate=false | `isPrivate: false` | `patch.isPrivate === false` |
| 7 | ライブタイトルクリーニング | `metadata: { title: "配信タイトル 2024-01-15 14:00" }` | `patch.title === "配信タイトル"` |
| 8 | タイトルクリーニング不一致 | `metadata: { title: "No timestamp here" }` | `patch.title === "No timestamp here"` |
| 9 | markMetadataFetched=true | `markMetadataFetched: true` | `patch.metadataFetched === true` |
| 10 | hasLiveChat=true → downloaded | `hasLiveChat: true`, commentsStatus≠"downloaded" | `patch.commentsStatus === "downloaded"` |
| 11 | hasLiveChat=false(pending,非ライブ) | `hasLiveChat: false`, commentsStatus="pending", 非ライブ | `patch.commentsStatus === "unavailable"` |
| 12 | hasLiveChat=false(pending,ライブ中) | `hasLiveChat: false`, commentsStatus="pending", `isLive: true` | commentsStatus変更**なし**（pendingのまま） |
| 13 | hasLiveChat=false(pending,配信予定) | `hasLiveChat: false`, commentsStatus="pending", `liveStatus: "is_upcoming"` | commentsStatus変更**なし** |
| 14 | サムネイル非同期解決 | metadata.thumbnail指定 | `resolveThumbnailPath` 呼出、結果がpatchに反映 |
| 15 | メタデータなし(null) | `metadata: null` | タイトル等の変更なし |

#### B-2-3. `scheduleBackgroundMetadataFetch`

| # | シナリオ | テスト内容 |
|---|---------|----------|
| 1 | 新規バッチ開始 | `metadataFetch = { active: true, total: N, completed: 0 }` |
| 2 | 既存バッチに追加 | `total` が加算、`completed` は維持 |
| 3 | 重複ID除外 | `pendingMetadataIds` に既存のIDは追加しない |
| 4 | outputDir未設定 | 何もしない |
| 5 | 空配列 | 何もしない |
| 6 | sourceURL正規化 | sourceUrl空の場合は `https://www.youtube.com/watch?v=${id}` |

#### B-2-4. `checkAndStartMetadataRecovery`

| # | シナリオ | テスト内容 |
|---|---------|----------|
| 1 | info.jsonなし→再取得対象 | `scheduleBackgroundMetadataFetch` に含まれる |
| 2 | ローカルメタデータ適用 | `get_local_metadata_by_ids` → `applyMetadataUpdate` |
| 3 | ライブ配信再取得(force=true) | ライブ動画が再取得対象に含まれる |
| 4 | ライブ配信除外(force=false) | ライブ動画は再取得対象から除外 |
| 5 | chatファイル検出 | `chatIds` に含まれる → `hasLiveChat: true` 適用 |
| 6 | metadataFetched=true → スキップ | 取得済み動画は対象外 |
| 7 | 整合性チェック中スキップ | `integritySummaryTotal > 0` → スキップ |
| 8 | ytDlpUpdateDone=false → スキップ | 前提条件未達 |
| 9 | 二重実行防止 | `autoMetadataCheckRef` で制御 |

#### B-2-5. `retryMetadataFetch`

| # | シナリオ | テスト内容 |
|---|---------|----------|
| 1 | 一時停止解除 | `metadataPaused: false`, `metadataPauseReason: ""` |
| 2 | 次の取得開始 | `startNextMetadataDownload` が呼ばれる |

---

### B-3. useDownloadActions

> ファイル: `src/hooks/useDownloadActions.ts`
> Tauriコマンド: `start_download`, `start_comments_download`

#### B-3-1. `startDownload` — ガードチェック（DL実行前の拒否条件）

| # | シナリオ | 条件 | 検証ポイント |
|---|---------|-----|------------|
| 1 | DL先未設定 | `downloadDir=""` | エラーメッセージ + 設定画面表示 |
| 2 | yt-dlp未検出 | `toolingStatus.ytDlp.ok=false` | `addFloatingNotice(kind:"error")` + 設定画面表示 |
| 3 | **メタデータ未取得→待機** | `metadataFetched=false` | メタデータ取得スケジュール, 最大15秒イベント駆動待機(500msインターバル) |
| 4 | メタデータ待機タイムアウト | 15秒超過 | `addFloatingNotice(kind:"error", title:metadataTimeout)` |
| 5 | **ライブ配信拒否** | `isLive=true` or `liveStatus="is_live"` | `addFloatingNotice(kind:"error", title:liveStreamCannotDownload)`, ダウンロードしない |
| 6 | **配信予定拒否** | `liveStatus="is_upcoming"` | 同上 |
| 7 | **非公開動画拒否** | `isPrivate=true` | `addFloatingNotice(kind:"error", title:privateVideoDownloadFailed)`, ダウンロードしない |
| 7b | **削除済み動画拒否** | `isDeleted=true` | `addFloatingNotice(kind:"error", title:deletedVideoDownloadFailed)`, ダウンロードしない |
| 8 | 一括DL中の個別DL拒否 | `bulkActive=true`, `allowDuringBulk` 未指定 | `addFloatingNotice(kind:"error", title:bulkDownloadActive)` |
| 9 | 一括DL中の許可付きDL | `allowDuringBulk=true` | 通常通り実行 |
| 10 | 同一ID二重実行防止 | `activeDownloadIdRef === video.id` | 何もしない(return) |

#### B-3-2. `startDownload` — キューイング

| # | シナリオ | 条件 | 検証ポイント |
|---|---------|-----|------------|
| 1 | 別のDL実行中→キュー追加 | `activeDownloadId` ≠ null | `downloadQueue`に追加, `addFloatingNotice(title:downloadQueued)` |
| 2 | 重複キュー追加拒否 | 既にキューにある | `enqueueDownload` → false |
| 3 | アクティブなし→即座にDL開始 | `activeDownloadId` = null | `startDownloadNow` 呼出 |

#### B-3-3. `startDownloadNow` — ダウンロード実行

| # | シナリオ | 検証ポイント |
|---|---------|------------|
| 1 | 正常開始 | `downloadStatus → "downloading"`, `downloadingIds` に追加, `invoke("start_download")` |
| 2 | invoke失敗 | `downloadStatus → "failed"`, エラーセット, `onStartFailed` 呼出, 次のキュー消化 |
| 3 | 品質パラメータ渡し | `quality: downloadQuality` がinvokeに含まれる |
| 4 | クッキー設定渡し | `cookiesFile`, `cookiesSource`, `cookiesBrowser` がinvokeに含まれる |

#### B-3-4. `startCommentsDownload` — コメントDL

| # | シナリオ | 検証ポイント |
|---|---------|------------|
| 1 | 正常開始 | `commentsStatus → "downloading"`, `commentsDownloadingIds` に追加 |
| 2 | unavailable → スキップ | 何もしない(return) |
| 3 | DL先未設定 | エラーメッセージ + 設定画面表示 |
| 4 | invoke失敗 | `commentsStatus → "failed"`, エラーセット |

#### B-3-5. キュー消化 — `startNextQueuedDownload`

| # | シナリオ | 検証ポイント |
|---|---------|------------|
| 1 | アクティブあり → 何もしない | `activeDownloadIdRef` ≠ null |
| 2 | 一括DL中(非waitingForSingles) → 何もしない | bulkActive=true, waitingForSingles=false |
| 3 | キューから次を開始 | `downloadQueue.shift()` → `startDownloadNow` |
| 4 | キュー空 | 何もしない |

---

### B-4. useAddVideoActions

> ファイル: `src/hooks/useAddVideoActions.ts`

#### B-4-1. `addVideo` — 単一動画追加

| # | シナリオ | 検証ポイント |
|---|---------|------------|
| 1 | 正常追加 | oEmbed fetch成功 → videos先頭に追加 → メタデータスケジュール |
| 2 | DL先未設定 | `"errors.downloadDirNotSet"` エラー |
| 3 | 空URL | `parseVideoId → null` → `"errors.invalidYouTubeUrl"` |
| 4 | 無効URL | 同上 |
| 5 | 重複ID | `"errors.videoAlreadyAdded"` |
| 6 | oEmbed 404 | `"errors.videoNotFound"`, モーダル再表示 |
| 7 | fetch例外 | `"errors.videoInfoFailed"` or `"errors.videoInfoFailedDetails"` |
| 8 | downloadOnAdd=true | 追加後 `startDownload(newVideo)` 呼出 |
| 9 | downloadOnAdd=false | `startDownload` 呼ばれない |
| 10 | 追加後のURL欄クリア | `setVideoUrl("")` |
| 11 | isAdding制御 | 開始時 true → 完了/エラー時 false |
| 12 | 新動画の初期状態 | `downloadStatus: "pending"`, `commentsStatus: "pending"`, `addedAt: ISO文字列` |

#### B-4-2. `addChannelVideos`

| # | シナリオ | 検証ポイント |
|---|---------|------------|
| 1 | 正常取得 | `invoke("list_channel_videos")` → 新規動画のみ追加 |
| 2 | DL先未設定 | エラーメッセージ |
| 3 | 空URL | `"errors.enterChannelUrl"` |
| 4 | 重複除外 | existingIds にある動画は追加しない |
| 5 | invoke失敗 | エラーメッセージ, モーダル閉じ |
| 6 | 進捗更新 | `channelFetchProgress` が 0→5→10→100 と進む |
| 7 | addedAt順序 | baseTime + offset で順序保持 |

---

### B-5. useVideoFiltering

> ファイル: `src/hooks/useVideoFiltering.ts`
> 純粋な `useMemo` ベースのフック。Tauriモック不要。

#### B-5-1. フィルタリング

| # | フィルタ条件 | テストデータ | 期待結果 |
|---|-----------|-----------|---------|
| 1 | `downloadFilter="all"` | downloaded + pending | 全て表示 |
| 2 | `downloadFilter="downloaded"` | downloaded + pending | downloadedのみ |
| 3 | `downloadFilter="undownloaded"` | downloaded + pending | pending のみ |
| 4 | `typeFilter="video"` | video + live + shorts | video のみ |
| 5 | `typeFilter="live"` | video + live + shorts | live のみ |
| 6 | `typeFilter="shorts"` | video + live + shorts | shorts のみ |
| 7 | `favoriteFilter="favorite"` | fav + non-fav | fav のみ |
| 8 | `favoriteFilter="all"` | fav + non-fav | 全て |
| 9 | 検索: 単一トークン | `"test"` vs titles | タイトルに"test"含む動画 |
| 10 | 検索: 複数トークン | `"test music"` | 両方含む動画のみ |
| 11 | 検索: チャンネル名 | チャンネル名一致 | 該当動画 |
| 12 | 検索: ID | 動画IDで検索 | 該当動画 |
| 13 | 検索: タグ | tags配列に一致 | 該当動画 |
| 14 | 検索: 大文字小文字 | `"TEST"` vs `"test"` | 一致（小文字化） |
| 15 | 複合フィルタ | downloaded + live + "keyword" | 全条件AND |

#### B-5-2. ソート

| # | ソート条件 | テストデータ | 期待結果 |
|---|----------|-----------|---------|
| 1 | `published-desc` | 異なるpublishedAt | 新しい順 |
| 2 | `published-asc` | 同上 | 古い順 |
| 3 | 同一publishedAt | 異なるaddedAt | addedAt降順で2次ソート |

#### B-5-3. `hasUndownloaded`

| # | テストデータ | 期待値 |
|---|-----------|--------|
| 1 | 全downloaded | `false` |
| 2 | 1つpending | `true` |
| 3 | 空配列 | `false` |

#### B-5-4. searchText構築

| # | シナリオ | 検証ポイント |
|---|---------|------------|
| 1 | 全フィールドあり | title + channel + description + id + tags + categories が結合 |
| 2 | 一部null | nullフィールドは除外 |
| 3 | 小文字化 | すべて小文字で格納 |

---

### B-6. useBulkDownloadManager

> ファイル: `src/hooks/useBulkDownloadManager.ts`

#### B-6-1. `startBulkDownload`

| # | シナリオ | 検証ポイント |
|---|---------|------------|
| 1 | 正常開始 | DL対象のみキューに設定(downloaded/isLive/is_live/is_upcoming/isPrivate/isDeleted除外), `startNextBulkDownload` 呼出 |
| 2 | DL先未設定 | エラー + 設定画面表示 |
| 3 | 全DL済み/対象外のみ | `"errors.noVideosToDownload"` |
| 4 | 既に一括中 | 何もしない(return) |
| 5 | **ライブ/配信予定/非公開/削除除外** | `isLive`/`is_live`/`is_upcoming`/`isPrivate`/`isDeleted` はtargetsに含まない |
| 6 | 個別DL進行中 | `waitingForSingles: true`, 即座にDL開始しない |

#### B-6-2. `startNextBulkDownload`

| # | シナリオ | 検証ポイント |
|---|---------|------------|
| 1 | 次の動画DL開始 | `currentId`, `currentTitle`, `phase: "video"` 更新 |
| 2 | キュー空 → 完了 | `active: false`, `currentId: null`, `queue: []` |
| 3 | state非アクティブ | 何もしない(return) |

#### B-6-3. `handleBulkCompletion`

| # | シナリオ | 検証ポイント |
|---|---------|------------|
| 1 | 次のDLへ移行 | `completed+1`, `startNextBulkDownload` 呼出 |
| 2 | stopRequested → 全体中止 | `active: false`, `queue: []`, `stopRequested: false` |
| 3 | cancelled → 全体中止 | 同上 |
| 4 | currentId不一致 | 何もしない(return) |
| 5 | 非アクティブ | 何もしない(return) |

#### B-6-4. `stopBulkDownload`

| # | シナリオ | 検証ポイント |
|---|---------|------------|
| 1 | 通常停止 | `invoke("stop_download")`, `stopRequested: true` |
| 2 | waitingForSingles中 | 即座に `active: false`, invoke不要 |
| 3 | currentIdなし | 何もしない |
| 4 | invoke失敗 | エラーメッセージ, `stopRequested` リセット |
| 5 | 非アクティブ | 何もしない |

#### B-6-5. `maybeStartAutoCommentsDownload`

| # | シナリオ | 条件 | 戻り値 |
|---|---------|-----|--------|
| 1 | 一括DL中 | `bulkDownload.active` | `false` |
| 2 | 動画未発見 | `videosRef` にIDなし | `false` |
| 3 | コメントDL済み | `commentsStatus: "downloaded"` | `false` |
| 4 | コメントunavailable | `commentsStatus: "unavailable"` | `false` |
| 5 | コメントDL中 | `commentsDownloadingIds` に含む | `true` |
| 6 | コメント未DL → 開始 | pending状態 | `startCommentsDownload` 呼出, `true` |

#### B-6-6. `maybeStartQueuedBulk`

| # | シナリオ | 検証ポイント |
|---|---------|------------|
| 1 | 個別DL全完了 → 一括開始 | `waitingForSingles: false`, `startNextBulkDownload` 呼出 |
| 2 | 個別DLまだ残 | 何もしない |
| 3 | 非アクティブ | 何もしない |
| 4 | waitingForSingles=false | 何もしない |

---

### B-7. useIntegrityCheck（主要シナリオ）

| # | シナリオ | 検証ポイント |
|---|---------|------------|
| 1 | 全ファイル正常 | issues空、summary=null |
| 2 | 動画ファイル欠損 | `videoMissing: true`, `videoErrors` にi18nメッセージセット (downloadStatusは変更しない) |
| 3 | コメントファイル欠損 | `commentsMissing: true`, `commentErrors` にi18nメッセージセット (commentsStatusは変更しない) |
| 4 | `verify_local_files` 例外 | 個別チェック(`video_file_exists`/`comments_file_exists`)にフォールバック |
| 5 | 修復アクション | エラークリア（i18nメッセージ使用） |

---

## C. コンポーネントテスト

### C-1. VideoCard / VideoCardItem

| # | シナリオ | 検証ポイント |
|---|---------|------------|
| 1 | pending状態 | DLボタン表示 |
| 2 | downloading状態 | 進捗表示 |
| 3 | downloaded状態 | 再生ボタン表示 |
| 4 | failed状態 | 再試行ボタン表示 |
| 5 | **非公開バッジ** | `isPrivate: true` → 非公開バッジ表示 |
| 5b | **削除バッジ** | `isDeleted: true` → 削除済みバッジ表示 |
| 6 | ライブバッジ | `contentType: "live"` → ライブ表示 |
| 7 | ショーツバッジ | `contentType: "shorts"` → ショーツ表示 |
| 8 | お気に入りトグル | クリック → favorite切り替え |
| 9 | 削除ボタン | 確認モーダル表示 |
| 10 | サムネイル表示 | img要素のsrc |
| 11 | 再生時間表示 | durationSec → フォーマット済み文字列 |

### C-2. VideoFilters

| # | シナリオ | 検証ポイント |
|---|---------|------------|
| 1 | DLフィルタ切替 | all ↔ downloaded ↔ undownloaded |
| 2 | 種別フィルタ切替 | all ↔ video ↔ live ↔ shorts |
| 3 | お気に入りフィルタ | all ↔ favorite |
| 4 | 検索入力 | テキスト入力 → 値更新 |
| 5 | ソート切替 | desc ↔ asc |

### C-3. AddVideoModal

| # | シナリオ | 検証ポイント |
|---|---------|------------|
| 1 | URL入力→追加 | addVideo コールバック呼出 |
| 2 | エラーメッセージ表示 | エラー文言のDOM表示 |
| 3 | isAdding中 | ボタン無効化 |

### C-4. EmptyState

| # | シナリオ | 検証ポイント |
|---|---------|------------|
| 1 | 動画ゼロ | 空状態メッセージ表示 |

### C-5. AppHeader

| # | シナリオ | 検証ポイント |
|---|---------|------------|
| 1 | タイトル表示 | アプリ名のDOM存在 |
| 2 | ボタンクリック | 各onClickコールバック |

### C-6. FloatingStatusStack

| # | シナリオ | 検証ポイント |
|---|---------|------------|
| 1 | success通知表示 | 緑系のスタイル |
| 2 | error通知表示 | 赤系のスタイル |
| 3 | info通知表示 | 青系のスタイル |
| 4 | autoDismiss | 指定時間後にDOM除去 |

---

## D. Rust ユニットテスト

### D-1. metadata.rs — メタデータパース

| # | シナリオ | テスト内容 |
|---|---------|----------|
| 1 | 通常動画JSON | 全フィールド正しくパース |
| 2 | `availability: "private"` | availability フィールド反映 |
| 3 | `is_live: true` | isLive フィールド true |
| 4 | フィールド欠損 | null/None として処理 |
| 5 | 不正JSON | エラーハンドリング |

### D-2. 非公開・削除検出ロジック（stderr/stdout分析）

| # | stderr/stdout | 期待値 |
|---|-------------|--------|
| 1 | `"video is private"` | `is_private: true`, `is_deleted: false` |
| 2 | `"private video"` | `is_private: true`, `is_deleted: false` |
| 3 | 通常エラー | `is_private: false`, `is_deleted: false` |
| 4 | `"has been removed by the uploader"` | `is_deleted: true`, `is_private: false` |
| 5 | `"Video unavailable"` + `"has been removed"` | `is_deleted: true`, `is_private: false` |
| 6 | `"account associated with this video has been terminated"` | `is_deleted: true`, `is_private: false` |

### D-3. models.rs — シリアライズ

| # | テスト内容 |
|---|----------|
| 1 | `VideoMetadata` のJSON↔Struct往復 |
| 2 | `DownloadFinished` のis_private + is_deleted含むシリアライズ |
| 3 | `MetadataFinished` のmetadata + is_private + is_deleted シリアライズ |

### D-4. files.rs — ファイル操作

| # | テスト内容 |
|---|----------|
| 1 | `video_file_exists`: ファイルあり → true |
| 2 | `video_file_exists`: ファイルなし → false |
| 3 | `comments_file_exists`: パターンマッチ |
| 4 | `verify_local_files`: 一括チェック結果 |

---

## E. 統合シナリオテスト

### E-1. 動画ライフサイクル: 公開→非公開

> **もっとも重要なシナリオ**

```
 [公開時]                      [非公開後]
 URL追加                       メタデータ再取得
   ↓                              ↓
 oEmbed成功                   metadata-finished
   ↓                          { isPrivate: true }
 videos追加                        ↓
   ↓                         isPrivate: true セット
 メタデータ取得                liveStatus: null クリア
 availability: "public"            ↓
   ↓                         DLボタンdisabled
 ダウンロード成功               非公開バッジ表示
 downloadStatus: "downloaded"
```

| # | ステップ | イベント/操作 | 検証ポイント |
|---|---------|------------|------------|
| 1 | URL追加 | `addVideo("https://youtube.com/watch?v=test1")` | videos に追加(public) |
| 2 | メタデータ取得完了 | `metadata-finished { availability: "public" }` | `availability: "public"` |
| 3 | ダウンロード完了 | `download-finished { success: true }` | `downloadStatus: "downloaded"` |
| 4 | **非公開後のメタデータ再取得** | `metadata-finished { isPrivate: true }` | `isPrivate: true`, `liveStatus: null`, 通知表示 |
| 5 | **非公開後のUI状態** | VideoCard | DLボタンdisabled, 非公開バッジ表示 |

### E-2. 動画ライフサイクル: 通常→ライブ配信

| # | ステップ | 検証ポイント |
|---|---------|------------|
| 1 | メタデータでライブ検出 | `contentType: "live"`, 通知表示 |
| 2 | DL試行 → 拒否 | `liveStreamCannotDownload` エラー |
| 3 | 一括DLで除外 | キュー生成時にライブ動画を含めない |

### E-3. ダウンロード中に非公開化

| # | ステップ | 検証ポイント |
|---|---------|------------|
| 1 | DL開始 | `downloadStatus: "downloading"` |
| 2 | `download-finished { isPrivate: true }` | `downloadStatus: "failed"`, `isPrivate: true` |
| 3 | 再試行ブロック | DLボタンdisabled, `startDownload` → `isPrivate` ガード |

### E-3b. ダウンロード中に削除

| # | ステップ | 検証ポイント |
|---|---------|------------|
| 1 | DL開始 | `downloadStatus: "downloading"` |
| 2 | `download-finished { isDeleted: true }` | `downloadStatus: "failed"`, `isDeleted: true` |
| 3 | 再試行ブロック | DLボタンdisabled, `startDownload` → `isDeleted` ガード |

### E-4. 一括DL: 混在キュー

| # | キュー内容 | 検証ポイント |
|---|----------|------------|
| 1 | [通常1, 通常2] | 通常1→DL, 通常2→DL (ライブ/非公開/削除済み/DL済みはキューに含まれない) |

### E-5. メタデータ復旧 → 非公開/削除検出

| # | ステップ | 検証ポイント |
|---|---------|------------|
| 1 | 起動時リカバリ | `checkAndStartMetadataRecovery(true)` |
| 2 | 非公開動画のメタデータ返却 | `isPrivate: true` → ステータス更新 |
| 3 | 削除済み動画のメタデータ返却 | `isDeleted: true` → ステータス更新 |
| 4 | 以降のDL拒否 | DLボタンdisabled, ガードチェックで弾かれる |

### E-6. 動画ライフサイクル: 公開→削除

> 削除された動画は非公開と類似のフローで処理される。`isDeleted` フラグで管理。

```
 [公開時]                      [削除後]
 URL追加                       メタデータ再取得 or ダウンロード試行
   ↓                              ↓
 oEmbed成功                   yt-dlp stderr:
   ↓                          "Video unavailable. This video has been removed by the uploader"
 videos追加                        ↓
   ↓                         Rust: is_deleted = true 検出
 メタデータ取得                    ↓
 availability: "public"       metadata-finished / download-finished
   ↓                          { isDeleted: true }
 ダウンロード成功                   ↓
 downloadStatus: "downloaded"  isDeleted: true セット
                               liveStatus: null クリア
                                   ↓
                              DLボタンdisabled
                              削除バッジ表示
```

| # | ステップ | イベント/操作 | 検証ポイント |
|---|---------|------------|------------|
| 1 | 削除検出(メタデータ) | `metadata-finished { isDeleted: true }` | `isDeleted: true` セット, `liveStatus: null` クリア, 通知表示 |
| 2 | 削除検出(ダウンロード) | `download-finished { isDeleted: true, success: false }` | `downloadStatus: "failed"`, `isDeleted: true` セット, 専用通知表示, videoErrorsには追加しない |
| 3 | 削除後のUI状態 | VideoCard | DLボタンdisabled, 削除バッジ表示 |
| 4 | 一括DL除外 | `startBulkDownload` | `isDeleted` 動画をキューに含めない |

> **対応箇所:**
> - `VideoLike` 型に `isDeleted?: boolean` 追加
> - Rust `models.rs`: `DownloadFinished`, `MetadataFinished` に `is_deleted: bool` 追加
> - Rust `download.rs`: stderr から `"has been removed"` パターン検出
> - Rust `metadata.rs`: stderr から `"has been removed"` パターン検出
> - `useDownloadActions.ts`: `startDownload` に `isDeleted` ガード追加（ボタンdisabledの安全策）
> - `useBulkDownloadManager.ts`: キュー作成時の除外条件に `isDeleted` 追加
> - `useDownloadEvents.ts`: `download-finished` で `isDeleted` フラグ処理
> - `useMetadataFetch.ts`: `metadata-finished` で `isDeleted` フラグ処理
> - `VideoCard.tsx` / `VideoCardItem.tsx`: 削除バッジ表示
> - `i18n`: `deletedVideo`, `deletedVideoDownloadFailed`, `deletedVideoDetected` キー追加

---

## テスト実装優先順位

| 優先度 | 対象 | 理由 |
|--------|-----|------|
| **1** | A (ユーティリティ) | 依存なし、即座に実装可能 |
| **2** | B-1, B-2 (DL/メタデータイベント) | コアロジック、非公開テスト含む |
| **3** | B-3 (DLアクション) | ユーザー操作の入口 |
| **4** | B-5 (フィルタリング) | 純粋データ変換、Tauriモック不要 |
| **5** | B-4 (動画追加) | fetch + invokeのモック |
| **6** | B-6 (一括DL) | 複雑な状態管理 |
| **7** | D (Rust) | バックエンド堅牢性 |
| **8** | C (コンポーネント) | UI表示確認 |
| **9** | E (統合) | フルフロー検証 |

---

## モック戦略サンプルコード

### フロントエンド: Tauri APIモック

```typescript
// __mocks__/tauri.ts
import { vi } from "vitest";

// invoke モック
export const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
}));

// listen モック（コールバックキャプチャ）
const eventListeners = new Map<string, Function>();
export const mockListen = vi.fn((event: string, handler: Function) => {
  eventListeners.set(event, handler);
  return Promise.resolve(() => eventListeners.delete(event));
});
vi.mock("@tauri-apps/api/event", () => ({
  listen: mockListen,
  emitTo: vi.fn(),
}));

// イベント発火ヘルパー
export function emitEvent(name: string, payload: unknown) {
  const handler = eventListeners.get(name);
  if (handler) handler({ payload });
}

// リセット
export function resetMocks() {
  mockInvoke.mockReset();
  mockListen.mockClear();
  eventListeners.clear();
}
```

### フロントエンド: renderHook テストパターン

```typescript
// hooks/useVideoFiltering.test.ts (例)
import { renderHook } from "@testing-library/react";
import { useVideoFiltering } from "./useVideoFiltering";

describe("useVideoFiltering", () => {
  const makeVideo = (overrides = {}) => ({
    id: "v1",
    title: "Test Video",
    channel: "Test Channel",
    addedAt: "2024-01-01T00:00:00Z",
    downloadStatus: "pending" as const,
    ...overrides,
  });

  it("downloadFilter='downloaded' filters correctly", () => {
    const videos = [
      makeVideo({ id: "v1", downloadStatus: "downloaded" }),
      makeVideo({ id: "v2", downloadStatus: "pending" }),
    ];
    const refs = {
      indexedVideosRef: { current: [] },
      sortedVideosRef: { current: [] },
      filteredVideosRef: { current: [] },
    };
    const { result } = renderHook(() =>
      useVideoFiltering({
        videos,
        downloadFilter: "downloaded",
        typeFilter: "all",
        publishedSort: "published-desc",
        favoriteFilter: "all",
        deferredSearchQuery: "",
        ...refs,
        getVideoSortTime: (v) => new Date(v.addedAt).getTime(),
      })
    );
    expect(result.current.filteredVideos).toHaveLength(1);
    expect(result.current.filteredVideos[0].id).toBe("v1");
  });
});
```

### Rust: ユニットテストパターン

```rust
// metadata.rs
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_parse_private_video_metadata() {
        let value = json!({
            "id": "test123",
            "title": "Private Video",
            "availability": "private"
        });
        let result = parse_video_metadata_value(&value);
        assert!(result.is_some());
        let meta = result.unwrap();
        assert_eq!(meta.availability, Some("private".to_string()));
    }

    #[test]
    fn test_detect_private_video_from_stderr() {
        let stderr = "ERROR: [youtube] abc123: This video is private";
        let is_private = detect_private_video(stderr);
        assert!(is_private);
    }
}
```
