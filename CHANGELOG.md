# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.11] - 2026-02-15

### Fixed
- Fixed React hooks order violation in UpdateModal that caused "Rendered more hooks than during the previous render" error

## [1.0.10] - 2026-02-15

### Changed
- Moved video probe (`ffprobe`) from eager execution on player open to on-demand execution only when a playback error occurs, reducing CPU/disk contention during metadata fetching
- Replaced inline player error display with a dedicated error modal dialog with "Reveal in Folder" action
- Removed "Open in External Player" button from player
- Extended metadata download timeout from 15s to 30s (info.json) and 60s to 120s (comments) to reduce failures under load

## [1.0.9] - 2026-02-15

### Added
- Display localized changelog in update modal (collapsible, parsed from Markdown to HTML)
- Bilingual changelog files: `CHANGELOG.md` (English) / `CHANGELOG_ja.md` (Japanese)
- Embed localized changelog in `latest.json` during release workflow

### Fixed
- Fixed live chat avatar images and emoji not displaying in release builds (added `*.ggpht.com` and `www.youtube.com` to CSP)
- Fixed typo where `media-src` CSP directive was concatenated

### Changed
- Made release workflow release notes bilingual (Japanese/English)

## [1.0.8] - 2026-02-15

### Fixed
- Fixed local files (images/videos) not loading in release builds (added `http://asset.localhost` to CSP)
- Fixed file paths containing Unicode characters (Japanese, special symbols, etc.) not being properly URL-encoded
- Fixed unused variable warnings during release builds

### Changed
- Added new `toAssetUrl` utility to replace direct usage of `convertFileSrc`
- Updated thumbnail search logic to support both new format (`{id}.{ext}`) and legacy format (`{title} [{id}].{ext}`)

## [1.0.7] - 2026-02-15

### Fixed
- Fixed timestamp removal from title when saving thumbnails for live streaming videos
- Fixed thumbnail saving to skip when `uploader_id` is empty and save after metadata fetch instead
- Fixed existing metadata patch being overwritten during thumbnail updates

### Changed
- Added `thumbnails` directory recognition as a library subdirectory
- Improved thumbnail search to also fallback to root `thumbnails` directory

## [1.0.6] - 2026-02-14

### Fixed
- Fixed metadata fetch entering infinite loop when adding a live streaming video
- Changed to skip re-fetching metadata for already-fetched live streaming videos except on startup
- Fixed duplicate floating notifications when live stream is detected

## [1.0.5] - 2026-02-14

### Added
- Added "Manual Install" button to update modal (direct NSIS installer download via browser)
- Added warning message when auto-update fails due to Windows Smart App Control

## [1.0.4] - 2026-02-14

### Fixed
- Fixed TypeScript compile error in `useAppUpdater`

## [1.0.3] - 2026-02-14

### Fixed
- Changed ZIP compression to `NoCompression` (Stored) to further improve Tauri updater compatibility
- Fixed space handling in download URL filename in `latest.json`

## [1.0.2] - 2026-02-14

### Fixed
- Fixed ZIP compression method for Tauri updater compatibility in release workflow
- Unified update modal UI with project CSS class system

### Changed
- Removed inline styles from update modal and migrated to `App.css`

## [1.0.1] - 2026-02-14

### Added
- Display application version info in settings modal

### Changed
- Moved cookie source setting from "Basic" tab to "Tools" tab, grouping related settings

## [1.0.0] - 2026-02-14

Official release. Production-ready.

### Changed
- Stability improvements and final adjustments from v0.1.0
- Production environment support

## [0.1.0] - 2026-02-12

Initial beta release.

### Added

#### Video Download
- Local download of YouTube videos
- Download quality selection
- Bulk download queue and progress panel
- Browser cookie integration for downloads
- yt-dlp error retry handling (title warning, decode error support)
- Automatic download error log saving

#### Playback
- Separate window video player
- Live chat synchronized playback (emoji and avatar display support)
- Auto-play
- Player window size and position persistence

#### Channel & Video Management
- Bulk channel registration and metadata fetching
- Video search functionality
- Filtering by download status and type
- Upload date sorting and display
- YouTube URL validation

#### UI/UX
- Dark mode support
- Local thumbnail cache with click-to-play
- Skeleton cards (loading display when adding videos)
- Floating status panel
- Video grid column width adjustment
- First-time setup wizard (onboarding)
- Startup data check overlay
- Window size and position persistence

#### Data Management
- Backup and restore functionality
- Metadata integrity check and thumbnail processing improvements
- Metadata update on comment download completion with unified save location

#### External Tools
- Automatic download of yt-dlp / ffmpeg / ffprobe on first launch
- yt-dlp update flow and notifications
- ffmpeg/ffprobe bundle detection
- Tool existence check and video addition gating

#### Development
- Unit test and E2E test environment setup (Vitest + Playwright)
- NSIS installer for Windows distribution (per-user)
- GitHub Actions CI/CD workflow
- Rust backend module separation

### Security
- Content Security Policy (CSP) configuration
- Tauri permission minimization
- Removal of unused plugins
