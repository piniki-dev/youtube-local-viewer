# アップデート機能のセットアップガイド

このアプリには自動アップデート機能が実装されています。このガイドでは、アップデート機能を有効にするための手順を説明します。

## 概要

実装されている機能：
- ✅ 起動時の自動アップデートチェック
- ✅ 新バージョンの通知
- ✅ ワンクリックでのダウンロード＆インストール
- ✅ プログレスバー表示
- ✅ リリースノート表示
- ✅ 多言語対応（日本語/英語）

## セットアップ手順

### 1. 署名鍵の生成

アップデートファイルに署名するための鍵ペアを生成します。

```bash
npm run tauri signer generate -- -w $env:USERPROFILE\.tauri\youtube-local-viewer.key
```

このコマンドを実行すると：
- **秘密鍵**: `%USERPROFILE%\.tauri\youtube-local-viewer.key` に保存されます
- **公開鍵**: コンソールに表示されます（`dW50cnVzdGVkIGNvbW1lbnQ6...` で始まる長い文字列）

### 2. 公開鍵の設定

コンソールに表示された公開鍵を `src-tauri/tauri.conf.json` の `plugins.updater.pubkey` フィールドにコピーします。

```json
{
  "plugins": {
    "updater": {
      "endpoints": [
        "https://github.com/piniki/youtube-local-viewer/releases/latest/download/latest.json"
      ],
      "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6XXXXXXXXXX..."
    }
  }
}
```

### 3. 秘密鍵の保護

**重要**: 秘密鍵は絶対に公開しないでください！

`.gitignore` に以下を追加（既に追加されていることを確認）：
```
*.key
.tauri/
```

秘密鍵を安全な場所にバックアップしてください。紛失すると既存ユーザーへのアップデート配信ができなくなります。

### 4. GitHub Releasesの準備

アップデート配信には GitHub Releases を使用します。

1. リポジトリを GitHub にプッシュ
2. リリースビルドを作成：
   ```bash
   npm run tauri build
   ```
3. ビルド成果物は `src-tauri/target/release/bundle/` に生成されます

### 5. リリースの作成

GitHub Releases でリリースを作成し、以下のファイルをアップロードします：

- `youtube-local-viewer_x.x.x_x64-setup.nsis.zip` - インストーラー
- `youtube-local-viewer_x.x.x_x64-setup.nsis.zip.sig` - 署名ファイル

Tauri は自動的に `latest.json` を生成し、GitHub API 経由でアクセス可能にします。

### 6. エンドポイントのカスタマイズ

デフォルトでは GitHub Releases を使用しますが、独自のサーバーを使用することもできます。

`tauri.conf.json` の `endpoints` を変更：
```json
{
  "plugins": {
    "updater": {
      "endpoints": [
        "https://your-update-server.com/latest.json"
      ],
      "pubkey": "..."
    }
  }
}
```

`latest.json` のフォーマット例：
```json
{
  "version": "1.0.0",
  "notes": "リリースノート",
  "pub_date": "2026-02-14T00:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "...",
      "url": "https://your-server.com/app-1.0.0-setup.exe"
    }
  }
}
```

## 開発環境でのテスト

開発中は署名なしでテストできます：

1. `tauri.conf.json` の `pubkey` を空文字列 `""` に設定
2. アプリを実行して動作確認

**注意**: 本番環境では必ず署名を有効にしてください。

## CI/CD での自動化

GitHub Actions を使用した自動リリースの例：

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run tauri build
        env:
          TAURI_PRIVATE_KEY: ${{ secrets.TAURI_PRIVATE_KEY }}
      - uses: softprops/action-gh-release@v1
        with:
          files: src-tauri/target/release/bundle/nsis/*.exe*
```

秘密鍵は GitHub Secrets に `TAURI_PRIVATE_KEY` として保存してください。

## トラブルシューティング

### アップデートが検出されない

- エンドポイント URL が正しいか確認
- `latest.json` がアクセス可能か確認
- ネットワーク接続を確認
- ブラウザの開発者ツールで console エラーを確認

### 署名エラー

- 公開鍵が正しく設定されているか確認
- `.sig` ファイルが正しくアップロードされているか確認
- 秘密鍵を使用してビルドしたか確認

### バージョンの競合

- `package.json` と `tauri.conf.json` のバージョンが一致しているか確認
- セマンティックバージョニング（`x.y.z` 形式）を使用しているか確認

## 参考資料

- [Tauri Updater 公式ドキュメント](https://v2.tauri.app/plugin/updater/)
- [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github)
- [セマンティックバージョニング](https://semver.org/lang/ja/)
