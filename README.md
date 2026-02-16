<table>
	<thead>
    	<tr>
      		<th style="text-align:center">English</th>
      		<th style="text-align:center"><a href="README_ja.md">日本語</a></th>
    	</tr>
  	</thead>
</table>

# YouTube Local Viewer

A Windows desktop application for downloading, managing, and playing YouTube videos locally.

This app aims to reduce the anxiety of "not knowing when archives might disappear" and let you **keep your own personal library of streams and videos at hand**.

Especially useful for VTuber fans who:

- Want to keep local backups in case archived streams get deleted
- Want to watch or listen to karaoke streams and long broadcasts offline without worrying about connectivity

Built with Tauri 2 + React 19 + TypeScript.

## Features

- Download YouTube videos locally (with quality selection)
  - Keep videos even if the original archive is deleted
- Live chat synchronized playback
  - Relive streams complete with comments
- Bulk channel registration and video metadata fetching
  - Build your library in bulk by channel or agency
- Video search and filtering (by download status, type, publication date)
  - Easily narrow down to karaoke streams, members-only content, etc.
- Dark mode support
- Backup and restore functionality
- Local thumbnail caching
- Separate player window for video playback
- Browser cookie integration for downloads
- Automatic download of yt-dlp / ffmpeg on first launch
- Automatic error log saving

## System Requirements

- Windows 10/11 (64bit)
- WebView2 Runtime (usually pre-installed)

## Installation

1. Download the latest `.exe` installer from [GitHub Releases](https://github.com/piniki-dev/youtube-local-viewer/releases)
2. Run the installer (no admin rights required, per-user installation)
3. On first launch, you'll be guided to automatically download yt-dlp and ffmpeg

> **Note:** As this is an unsigned application, Windows SmartScreen warnings may appear.
> Click "More info" → "Run anyway" to launch.

## Disclaimer

Please review the terms of service of YouTube and any relevant VTuber agencies or content creators before using this application, and use it only within those terms.

Do not redistribute, re-upload, or publicly share any downloaded videos or audio files. Please limit use to personal viewing only.

## External Tools

This application uses the following external tools for downloading and media processing.
They are automatically downloaded on first launch.

| Tool | Purpose | License |
|------|---------|---------|
| [yt-dlp](https://github.com/yt-dlp/yt-dlp) | Video and metadata download | Unlicense |
| [ffmpeg](https://ffmpeg.org/) / ffprobe | Media processing and codec verification | LGPL 2.1+ / GPL |

## Data Storage

### Application Settings (User Data Directory)

- `settings/app.json` — Application settings
- `index/videos.json` — Video index

### Video Data (User-specified folder)

```
<storage_folder>/
  videos/<youtube_handle>/<title> [video_id].mp4
  metadata/<youtube_handle>/<title> [video_id].info.json
  metadata/<youtube_handle>/<title> [video_id].live_chat.json
  thumbnails/<youtube_handle>/<title> [video_id].png
```

## Development Setup

### Required Tools

- [Node.js](https://nodejs.org/) 20+
- [Rust](https://rustup.rs/) (stable)
- Windows SDK / Visual Studio Build Tools

### Instructions

```bash
# Install dependencies
npm install

# Start development server (Tauri + Vite)
npm run tauri dev

# Build for release
npm run tauri build
```

### Testing

```bash
# Unit/Component tests
npm run test

# E2E tests (first time requires: npx playwright install)
npm run test:e2e
```

## Known Limitations

- Windows only (macOS / Linux not supported)
- No code signing (SmartScreen warnings appear)
- Downloads may fail due to YouTube specification changes (addressed by yt-dlp updates)
- Limited accessibility and keyboard navigation

## License

[MIT License](LICENSE)

Copyright (c) 2026 piniki
