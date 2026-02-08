use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::env;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};
use std::{fs, path::PathBuf};
use zip::write::FileOptions;
use zip::{ZipArchive, ZipWriter};

const YTDLP_TITLE_WARNING: &str =
    "No title found in player responses; falling back to title from initial data";
const YTDLP_WARNING_RETRY_MAX: usize = 10;
const YTDLP_WARNING_RETRY_SLEEP_MS: u64 = 500;
const YTDLP_NONE_DECODE_ERROR: &str = "NoneType";
const YTDLP_NONE_DECODE_RETRY_MAX: usize = 2;
const YTDLP_NONE_DECODE_RETRY_SLEEP_MS: u64 = 10_000;
const WINDOW_MIN_WIDTH: u32 = 1280;
const WINDOW_MIN_HEIGHT: u32 = 720;
const WINDOW_SIZE_FILE_NAME: &str = "window_size.json";
const SETTINGS_DIR_NAME: &str = "settings";
const INDEX_DIR_NAME: &str = "index";
const SETTINGS_FILE_NAME: &str = "app.json";
const VIDEOS_FILE_NAME: &str = "videos.json";
const SETTINGS_SCHEMA_VERSION: u32 = 1;
const VIDEOS_SCHEMA_VERSION: u32 = 1;
const BACKUP_SCHEMA_VERSION: u32 = 2;
const LIBRARY_VIDEOS_DIR_NAME: &str = "videos";
const LIBRARY_COMMENTS_DIR_NAME: &str = "comments";
const LIBRARY_METADATA_DIR_NAME: &str = "metadata";
const LIBRARY_THUMBNAILS_DIR_NAME: &str = "thumbnails";

#[derive(Clone, Copy, Serialize, Deserialize)]
struct WindowSizeConfig {
    width: u32,
    height: u32,
    x: Option<i32>,
    y: Option<i32>,
}

#[derive(Default)]
struct WindowSizeState {
    last_saved: Mutex<Option<(u32, u32)>>,
    last_position: Mutex<Option<(i32, i32)>>,
}

fn apply_cookies_args(
    command: &mut Command,
    cookies_source: Option<&str>,
    cookies_file: Option<&str>,
    cookies_browser: Option<&str>,
) {
    let source = cookies_source.unwrap_or("").trim();
    if source == "browser" {
        if let Some(browser) = cookies_browser {
            let trimmed = browser.trim();
            if !trimmed.is_empty() {
                command.arg("--cookies-from-browser").arg(trimmed);
                return;
            }
        }
    }

    let should_use_file = source == "file" || (source.is_empty() && cookies_file.is_some());
    if should_use_file {
        if let Some(path) = cookies_file {
            let trimmed = path.trim();
            if !trimmed.is_empty() {
                command.arg("--cookies").arg(trimmed);
            }
        }
    }
}

#[derive(Clone, Serialize)]
struct DownloadFinished {
    id: String,
    success: bool,
    stdout: String,
    stderr: String,
    cancelled: bool,
}

#[derive(Clone, Serialize)]
struct CommentsFinished {
    id: String,
    success: bool,
    stdout: String,
    stderr: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MetadataFinished {
    id: String,
    success: bool,
    stdout: String,
    stderr: String,
    metadata: Option<VideoMetadata>,
    has_live_chat: Option<bool>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MetadataIndex {
    info_ids: Vec<String>,
    chat_ids: Vec<String>,
}

#[derive(Clone, Default)]
struct DownloadProcessState {
    children: Arc<Mutex<HashMap<String, Arc<Mutex<Child>>>>>,
    cancelled: Arc<Mutex<HashSet<String>>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CommentItem {
    author: String,
    text: String,
    like_count: Option<u64>,
    published_at: Option<String>,
    offset_ms: Option<u64>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MediaInfo {
    video_codec: Option<String>,
    audio_codec: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
    duration: Option<f64>,
    container: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ChannelVideoItem {
    id: String,
    title: String,
    channel: Option<String>,
    url: String,
    thumbnail: Option<String>,
    webpage_url: Option<String>,
    duration_sec: Option<u64>,
    upload_date: Option<String>,
    release_timestamp: Option<i64>,
    timestamp: Option<i64>,
    live_status: Option<String>,
    is_live: Option<bool>,
    was_live: Option<bool>,
    view_count: Option<u64>,
    like_count: Option<u64>,
    comment_count: Option<u64>,
    tags: Option<Vec<String>>,
    categories: Option<Vec<String>>,
    description: Option<String>,
    channel_id: Option<String>,
    uploader_id: Option<String>,
    channel_url: Option<String>,
    uploader_url: Option<String>,
    availability: Option<String>,
    language: Option<String>,
    audio_language: Option<String>,
    age_limit: Option<u64>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct VideoMetadata {
    id: Option<String>,
    title: Option<String>,
    channel: Option<String>,
    thumbnail: Option<String>,
    url: Option<String>,
    webpage_url: Option<String>,
    duration_sec: Option<u64>,
    upload_date: Option<String>,
    release_timestamp: Option<i64>,
    timestamp: Option<i64>,
    live_status: Option<String>,
    is_live: Option<bool>,
    was_live: Option<bool>,
    view_count: Option<u64>,
    like_count: Option<u64>,
    comment_count: Option<u64>,
    tags: Option<Vec<String>>,
    categories: Option<Vec<String>>,
    description: Option<String>,
    channel_id: Option<String>,
    uploader_id: Option<String>,
    channel_url: Option<String>,
    uploader_url: Option<String>,
    availability: Option<String>,
    language: Option<String>,
    audio_language: Option<String>,
    age_limit: Option<u64>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalMetadataItem {
    id: String,
    metadata: VideoMetadata,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedState {
    videos: Vec<serde_json::Value>,
    download_dir: Option<String>,
    cookies_file: Option<String>,
    cookies_source: Option<String>,
    cookies_browser: Option<String>,
    remote_components: Option<String>,
    yt_dlp_path: Option<String>,
    ffmpeg_path: Option<String>,
    ffprobe_path: Option<String>,
}

#[derive(Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct PersistedSettings {
    download_dir: Option<String>,
    cookies_file: Option<String>,
    cookies_source: Option<String>,
    cookies_browser: Option<String>,
    remote_components: Option<String>,
    yt_dlp_path: Option<String>,
    ffmpeg_path: Option<String>,
    ffprobe_path: Option<String>,
}

#[derive(Clone, Serialize, Deserialize, Default)]
struct PersistedVideos {
    videos: Vec<serde_json::Value>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VersionedSettings {
    version: u32,
    data: PersistedSettings,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VersionedVideos {
    version: u32,
    data: PersistedVideos,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LocalFileCheckItem {
    id: String,
    title: String,
    check_video: bool,
    check_comments: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalFileCheckResult {
    id: String,
    video_ok: bool,
    comments_ok: bool,
}

fn sanitize_filename_component(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return "unknown".to_string();
    }
    let mut out = String::with_capacity(trimmed.len());
    for ch in trimmed.chars() {
        if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
            out.push(ch);
        } else {
            out.push('_');
        }
    }
    let normalized = out.trim_matches('_').to_string();
    if normalized.is_empty() {
        "unknown".to_string()
    } else if normalized.len() > 60 {
        normalized.chars().take(60).collect()
    } else {
        normalized
    }
}

fn sanitize_path_component(value: &str, max_len: usize) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return "unknown".to_string();
    }
    let mut out = String::with_capacity(trimmed.len());
    for ch in trimmed.chars() {
        let is_invalid = ch.is_control()
            || matches!(ch, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*');
        if is_invalid {
            out.push('_');
        } else {
            out.push(ch);
        }
    }
    let mut normalized = out.trim().to_string();
    while normalized.ends_with([' ', '.']) {
        normalized.pop();
    }
    if normalized.is_empty() {
        return "unknown".to_string();
    }
    if normalized.len() > max_len {
        normalized.chars().take(max_len).collect()
    } else {
        normalized
    }
}

fn write_error_log(
    app: &AppHandle,
    kind: &str,
    id: &str,
    stdout: &str,
    stderr: &str,
) -> Result<(), String> {
    let base = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("保存先ディレクトリの取得に失敗しました: {}", e))?;
    let dir = base.join("errorlogs");
    fs::create_dir_all(&dir)
        .map_err(|e| format!("ログフォルダの作成に失敗しました: {}", e))?;
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let safe_kind = sanitize_filename_component(kind);
    let safe_id = sanitize_filename_component(id);
    let file_name = format!("{}_{}_{}.log", ts, safe_kind, safe_id);
    let file_path = dir.join(file_name);
    let content = format!(
        "kind: {}\nvideo_id: {}\ntimestamp_ms: {}\n\n[stdout]\n{}\n\n[stderr]\n{}\n",
        kind, id, ts, stdout, stderr
    );
    fs::write(&file_path, content)
        .map_err(|e| format!("ログの保存に失敗しました: {}", e))?;
    Ok(())
}

fn window_size_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("保存先ディレクトリの取得に失敗しました: {}", e))?;
    fs::create_dir_all(&dir)
        .map_err(|e| format!("設定フォルダの作成に失敗しました: {}", e))?;
    Ok(dir.join(WINDOW_SIZE_FILE_NAME))
}

fn resolve_library_root_dir(output_dir: &str) -> PathBuf {
    let base = PathBuf::from(output_dir);
    let last = base
        .file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.to_lowercase());
    let is_child = matches!(
        last.as_deref(),
        Some("videos") | Some("comments") | Some("metadata") | Some("contents")
    );
    if is_child {
        return base.parent().unwrap_or(&base).to_path_buf();
    }
    base
}

fn library_videos_dir(output_dir: &str) -> PathBuf {
    resolve_library_root_dir(output_dir).join(LIBRARY_VIDEOS_DIR_NAME)
}

fn library_comments_dir(output_dir: &str) -> PathBuf {
    resolve_library_root_dir(output_dir).join(LIBRARY_COMMENTS_DIR_NAME)
}

fn library_metadata_dir(output_dir: &str) -> PathBuf {
    resolve_library_root_dir(output_dir).join(LIBRARY_METADATA_DIR_NAME)
}

fn library_thumbnails_dir(output_dir: &str) -> PathBuf {
    resolve_library_root_dir(output_dir).join(LIBRARY_THUMBNAILS_DIR_NAME)
}

fn settings_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("保存先ディレクトリの取得に失敗しました: {}", e))?;
    Ok(dir.join(SETTINGS_DIR_NAME).join(SETTINGS_FILE_NAME))
}

fn videos_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("保存先ディレクトリの取得に失敗しました: {}", e))?;
    Ok(dir.join(INDEX_DIR_NAME).join(VIDEOS_FILE_NAME))
}

fn parse_versioned_settings(content: &str) -> PersistedSettings {
    if let Ok(wrapper) = serde_json::from_str::<VersionedSettings>(content) {
        if wrapper.version <= SETTINGS_SCHEMA_VERSION {
            return wrapper.data;
        }
        return PersistedSettings::default();
    }
    serde_json::from_str::<PersistedSettings>(content).unwrap_or_default()
}

fn parse_versioned_videos(content: &str) -> PersistedVideos {
    if let Ok(wrapper) = serde_json::from_str::<VersionedVideos>(content) {
        if wrapper.version <= VIDEOS_SCHEMA_VERSION {
            return wrapper.data;
        }
        return PersistedVideos::default();
    }
    serde_json::from_str::<PersistedVideos>(content).unwrap_or_default()
}

fn read_settings(app: &AppHandle) -> PersistedSettings {
    let settings_path = match settings_file_path(app) {
        Ok(path) => path,
        Err(_) => return PersistedSettings::default(),
    };
    if !settings_path.exists() {
        return PersistedSettings::default();
    }
    let content = match fs::read_to_string(&settings_path) {
        Ok(content) => content,
        Err(_) => return PersistedSettings::default(),
    };
    parse_versioned_settings(&content)
}

fn collect_files_recursive(dir: &Path) -> Vec<PathBuf> {
    if !dir.exists() {
        return Vec::new();
    }
    let mut out = Vec::new();
    let mut stack = vec![dir.to_path_buf()];
    while let Some(current) = stack.pop() {
        let entries = match fs::read_dir(&current) {
            Ok(entries) => entries,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
            } else if path.is_file() {
                out.push(path);
            }
        }
    }
    out
}


fn read_window_size(app: &AppHandle) -> Option<WindowSizeConfig> {
    let path = window_size_file_path(app).ok()?;
    let content = fs::read_to_string(path).ok()?;
    serde_json::from_str(&content).ok()
}

fn write_window_size(app: &AppHandle, size: WindowSizeConfig) -> Result<(), String> {
    let path = window_size_file_path(app)?;
    let content = serde_json::to_string(&size)
        .map_err(|e| format!("ウィンドウサイズの保存に失敗しました: {}", e))?;
    fs::write(&path, content)
        .map_err(|e| format!("ウィンドウサイズの保存に失敗しました: {}", e))?;
    Ok(())
}

fn parse_video_metadata_value(value: &serde_json::Value) -> VideoMetadata {
    VideoMetadata {
        id: value.get("id").and_then(|v| v.as_str()).map(|s| s.to_string()),
        title: value.get("title").and_then(|v| v.as_str()).map(|s| s.to_string()),
        channel: value
            .get("channel")
            .and_then(|v| v.as_str())
            .or_else(|| value.get("uploader").and_then(|v| v.as_str()))
            .or_else(|| value.get("channel_title").and_then(|v| v.as_str()))
            .map(|s| s.to_string()),
        thumbnail: value
            .get("thumbnail")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        url: value
            .get("url")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        webpage_url: value
            .get("webpage_url")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        duration_sec: value.get("duration").and_then(|v| v.as_u64()),
        upload_date: value
            .get("upload_date")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        release_timestamp: value
            .get("release_timestamp")
            .and_then(|v| v.as_i64()),
        timestamp: value.get("timestamp").and_then(|v| v.as_i64()),
        live_status: value
            .get("live_status")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        is_live: value.get("is_live").and_then(|v| v.as_bool()),
        was_live: value.get("was_live").and_then(|v| v.as_bool()),
        view_count: value.get("view_count").and_then(|v| v.as_u64()),
        like_count: value.get("like_count").and_then(|v| v.as_u64()),
        comment_count: value.get("comment_count").and_then(|v| v.as_u64()),
        tags: value
            .get("tags")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|item| item.as_str().map(|s| s.to_string()))
                    .collect::<Vec<String>>()
            }),
        categories: value
            .get("categories")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|item| item.as_str().map(|s| s.to_string()))
                    .collect::<Vec<String>>()
            }),
        description: value
            .get("description")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        channel_id: value
            .get("channel_id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        uploader_id: value
            .get("uploader_id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        channel_url: value
            .get("channel_url")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        uploader_url: value
            .get("uploader_url")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        availability: value
            .get("availability")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        language: value
            .get("language")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        audio_language: value
            .get("audio_language")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        age_limit: value.get("age_limit").and_then(|v| v.as_u64()),
    }
}

fn extract_id_from_filename(name: &str) -> Option<String> {
    if let (Some(open_idx), Some(close_idx)) = (name.rfind('['), name.rfind(']')) {
        if close_idx > open_idx + 1 {
            let id = name[(open_idx + 1)..close_idx].trim();
            if !id.is_empty() {
                return Some(id.to_string());
            }
        }
    }
    None
}

fn find_info_json(dir: &Path, id: &str) -> Option<PathBuf> {
    if !dir.exists() {
        return None;
    }
    let id_lower = id.to_lowercase();
    let mut candidates: Vec<PathBuf> = Vec::new();

    for path in collect_files_recursive(dir) {
        if !path.is_file() {
            continue;
        }
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(name) => name.to_string(),
            None => continue,
        };
        let name_lower = name.to_lowercase();
        if !name_lower.ends_with(".info.json") {
            continue;
        }
        if name_lower.contains(&id_lower) {
            return Some(path);
        }
        candidates.push(path);
    }

    for path in candidates {
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(video_id) = value.get("id").and_then(|v| v.as_str()) {
                    if video_id.eq_ignore_ascii_case(id) {
                        return Some(path);
                    }
                }
                if let Some(display_id) = value.get("display_id").and_then(|v| v.as_str()) {
                    if display_id.eq_ignore_ascii_case(id) {
                        return Some(path);
                    }
                }
                if let Some(video_id) = value.get("video_id").and_then(|v| v.as_str()) {
                    if video_id.eq_ignore_ascii_case(id) {
                        return Some(path);
                    }
                }
            }
        }
    }

    None
}

#[tauri::command]
fn start_download(
    app: AppHandle,
    state: State<DownloadProcessState>,
    id: String,
    url: String,
    output_dir: String,
    cookies_file: Option<String>,
    cookies_source: Option<String>,
    cookies_browser: Option<String>,
    remote_components: Option<String>,
    yt_dlp_path: Option<String>,
    ffmpeg_path: Option<String>,
) -> Result<(), String> {
    let output_dir_path = library_videos_dir(&output_dir);
    let output_path = output_dir_path
        .join("%(uploader_id)s/%(title)s [%(id)s].%(ext)s")
        .to_string_lossy()
        .to_string();
    if let Err(err) = fs::create_dir_all(&output_dir_path) {
        return Err(format!("保存先フォルダの作成に失敗しました: {}", err));
    }
    let yt_dlp = resolve_override(yt_dlp_path).unwrap_or_else(resolve_yt_dlp);
    let ffmpeg_location = resolve_override(ffmpeg_path).or_else(|| Some(resolve_ffmpeg()));
    let state = state.inner().clone();

    std::thread::spawn(move || {
        let mut last_stdout = String::new();
        let mut last_stderr = String::new();
        let mut last_success = false;
        let mut last_cancelled = false;

        for attempt in 1..=YTDLP_WARNING_RETRY_MAX {
            let warning_seen = Arc::new(AtomicBool::new(false));
            let mut command = Command::new(&yt_dlp);
            command
                .arg("--no-playlist")
                .arg("--newline")
                .arg("--progress")
                .arg("--sleep-subtitles")
                .arg("5")
                .arg("--sleep-requests")
                .arg("0.75")
                .arg("--sleep-interval")
                .arg("10")
                .arg("--max-sleep-interval")
                .arg("20")
                .arg("-f")
                .arg("bestvideo[ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]/best[ext=mp4][vcodec^=avc1]")
                .arg("--merge-output-format")
                .arg("mp4")
                .arg("-o")
                .arg(&output_path);
            if let Some(location) = &ffmpeg_location {
                command.arg("--ffmpeg-location").arg(location);
            }
            apply_cookies_args(
                &mut command,
                cookies_source.as_deref(),
                cookies_file.as_deref(),
                cookies_browser.as_deref(),
            );
            if let Some(remote) = &remote_components {
                if !remote.trim().is_empty() {
                    command.arg("--remote-components").arg(remote);
                }
            }
            command.arg(&url).stdout(Stdio::piped()).stderr(Stdio::piped());

            let child = match command.spawn() {
                Ok(child) => child,
                Err(err) => {
                    let _ = write_error_log(
                        &app,
                        "video_download",
                        &id,
                        "",
                        &format!("yt-dlpの起動に失敗しました: {}", err),
                    );
                    let _ = app.emit(
                        "download-finished",
                        DownloadFinished {
                            id: id.clone(),
                            success: false,
                            stdout: "".to_string(),
                            stderr: format!("yt-dlpの起動に失敗しました: {}", err),
                            cancelled: false,
                        },
                    );
                    return;
                }
            };

            let child = Arc::new(Mutex::new(child));
            if let Ok(mut map) = state.children.lock() {
                map.insert(id.clone(), child.clone());
            }

            let stdout_acc = Arc::new(Mutex::new(String::new()));
            let stderr_acc = Arc::new(Mutex::new(String::new()));

            let stdout = {
                let mut guard = match child.lock() {
                    Ok(guard) => guard,
                    Err(err) => {
                        let _ = app.emit(
                            "download-finished",
                            DownloadFinished {
                                id: id.clone(),
                                success: false,
                                stdout: "".to_string(),
                                stderr: format!("yt-dlpの制御に失敗しました: {}", err),
                                cancelled: false,
                            },
                        );
                        let _ = write_error_log(
                            &app,
                            "video_download",
                            &id,
                            "",
                            &format!("yt-dlpの制御に失敗しました: {}", err),
                        );
                        return;
                    }
                };
                guard.stdout.take()
            };

            if let Some(stdout) = stdout {
                let app_clone = app.clone();
                let id_clone = id.clone();
                let stdout_acc_clone = stdout_acc.clone();
                let warning_seen_clone = warning_seen.clone();
                std::thread::spawn(move || {
                    let reader = BufReader::new(stdout);
                    for line in reader.lines().flatten() {
                        if line.contains(YTDLP_TITLE_WARNING) {
                            warning_seen_clone.store(true, Ordering::Relaxed);
                        }
                        if let Ok(mut buf) = stdout_acc_clone.lock() {
                            buf.push_str(&line);
                            buf.push('\n');
                        }
                        let _ = app_clone.emit(
                            "download-progress",
                            serde_json::json!({ "id": id_clone, "line": line }),
                        );
                    }
                });
            }

            let stderr = {
                let mut guard = match child.lock() {
                    Ok(guard) => guard,
                    Err(err) => {
                        let _ = app.emit(
                            "download-finished",
                            DownloadFinished {
                                id: id.clone(),
                                success: false,
                                stdout: "".to_string(),
                                stderr: format!("yt-dlpの制御に失敗しました: {}", err),
                                cancelled: false,
                            },
                        );
                        let _ = write_error_log(
                            &app,
                            "video_download",
                            &id,
                            "",
                            &format!("yt-dlpの制御に失敗しました: {}", err),
                        );
                        return;
                    }
                };
                guard.stderr.take()
            };

            if let Some(stderr) = stderr {
                let app_clone = app.clone();
                let id_clone = id.clone();
                let stderr_acc_clone = stderr_acc.clone();
                let warning_seen_clone = warning_seen.clone();
                std::thread::spawn(move || {
                    let reader = BufReader::new(stderr);
                    for line in reader.lines().flatten() {
                        if line.contains(YTDLP_TITLE_WARNING) {
                            warning_seen_clone.store(true, Ordering::Relaxed);
                        }
                        if let Ok(mut buf) = stderr_acc_clone.lock() {
                            buf.push_str(&line);
                            buf.push('\n');
                        }
                        let _ = app_clone.emit(
                            "download-progress",
                            serde_json::json!({ "id": id_clone, "line": line }),
                        );
                    }
                });
            }

            let output = loop {
                let status = {
                    let mut guard = match child.lock() {
                        Ok(guard) => guard,
                        Err(err) => {
                            let _ = app.emit(
                                "download-finished",
                                DownloadFinished {
                                    id: id.clone(),
                                    success: false,
                                    stdout: "".to_string(),
                                    stderr: format!("yt-dlpの制御に失敗しました: {}", err),
                                    cancelled: false,
                                },
                            );
                            let _ = write_error_log(
                                &app,
                                "video_download",
                                &id,
                                "",
                                &format!("yt-dlpの制御に失敗しました: {}", err),
                            );
                            return;
                        }
                    };
                    guard.try_wait()
                };
                match status {
                    Ok(Some(status)) => break status,
                    Ok(None) => {
                        std::thread::sleep(Duration::from_millis(200));
                        continue;
                    }
                    Err(err) => {
                        let _ = app.emit(
                            "download-finished",
                            DownloadFinished {
                                id: id.clone(),
                                success: false,
                                stdout: "".to_string(),
                                stderr: format!("yt-dlpの実行に失敗しました: {}", err),
                                cancelled: false,
                            },
                        );
                        let _ = write_error_log(
                            &app,
                            "video_download",
                            &id,
                            "",
                            &format!("yt-dlpの実行に失敗しました: {}", err),
                        );
                        return;
                    }
                }
            };

            let stdout = stdout_acc.lock().map(|s| s.clone()).unwrap_or_default();
            let stderr = stderr_acc.lock().map(|s| s.clone()).unwrap_or_default();
            if let Ok(mut map) = state.children.lock() {
                map.remove(&id);
            }
            let cancelled = match state.cancelled.lock() {
                Ok(mut set) => set.remove(&id),
                Err(_) => false,
            };

            last_stdout = stdout;
            last_stderr = stderr;
            last_success = output.success();
            last_cancelled = cancelled;

            let warning_retry = warning_seen.load(Ordering::Relaxed);
            if warning_retry && !cancelled && attempt < YTDLP_WARNING_RETRY_MAX {
                let _ = app.emit(
                    "download-progress",
                    serde_json::json!({
                        "id": id.clone(),
                        "line": format!(
                            "警告を検知したためリトライします ({}/{})",
                            attempt,
                            YTDLP_WARNING_RETRY_MAX
                        )
                    }),
                );
                std::thread::sleep(Duration::from_millis(YTDLP_WARNING_RETRY_SLEEP_MS));
                continue;
            }

            break;
        }

        if !last_success && !last_cancelled {
            let _ = write_error_log(&app, "video_download", &id, &last_stdout, &last_stderr);
        }

        let _ = app.emit(
            "download-finished",
            DownloadFinished {
                id,
                success: last_success,
                stdout: last_stdout,
                stderr: last_stderr,
                cancelled: last_cancelled,
            },
        );
    });

    Ok(())
}

#[tauri::command]
fn stop_download(state: State<DownloadProcessState>, id: String) -> Result<(), String> {
    let child = match state.children.lock() {
        Ok(map) => map.get(&id).cloned(),
        Err(err) => return Err(format!("停止処理に失敗しました: {}", err)),
    };

    let Some(child) = child else {
        return Err("停止対象のダウンロードが見つかりませんでした。".to_string());
    };

    if let Ok(mut set) = state.cancelled.lock() {
        set.insert(id);
    }

    let mut guard = match child.lock() {
        Ok(guard) => guard,
        Err(err) => return Err(format!("停止処理に失敗しました: {}", err)),
    };

    guard
        .kill()
        .map_err(|err| format!("ダウンロード停止に失敗しました: {}", err))?;

    Ok(())
}

#[tauri::command]
fn start_comments_download(
    app: AppHandle,
    id: String,
    url: String,
    output_dir: String,
    cookies_file: Option<String>,
    cookies_source: Option<String>,
    cookies_browser: Option<String>,
    remote_components: Option<String>,
    yt_dlp_path: Option<String>,
    ffmpeg_path: Option<String>,
) -> Result<(), String> {
    let output_dir_path = library_comments_dir(&output_dir);
    let output_path = output_dir_path
        .join("%(uploader_id)s/%(title)s [%(id)s].%(ext)s")
        .to_string_lossy()
        .to_string();
    if let Err(err) = fs::create_dir_all(&output_dir_path) {
        return Err(format!("保存先フォルダの作成に失敗しました: {}", err));
    }
    let yt_dlp = resolve_override(yt_dlp_path).unwrap_or_else(resolve_yt_dlp);
    let ffmpeg_location = resolve_override(ffmpeg_path).or_else(|| Some(resolve_ffmpeg()));

    std::thread::spawn(move || {
        let mut last_stdout = String::new();
        let mut last_stderr = String::new();
        let mut last_success = false;

        for attempt in 1..=YTDLP_WARNING_RETRY_MAX {
            let warning_seen = Arc::new(AtomicBool::new(false));
            let mut command = Command::new(&yt_dlp);
            command
                .arg("--no-playlist")
                .arg("--newline")
                .arg("--progress")
                .arg("--skip-download")
                .arg("--write-info-json")
                .arg("-o")
                .arg(&output_path);
            if let Some(location) = &ffmpeg_location {
                command.arg("--ffmpeg-location").arg(location);
            }
            apply_cookies_args(
                &mut command,
                cookies_source.as_deref(),
                cookies_file.as_deref(),
                cookies_browser.as_deref(),
            );
            if let Some(remote) = &remote_components {
                if !remote.trim().is_empty() {
                    command.arg("--remote-components").arg(remote);
                }
            }
            command.arg(&url).stdout(Stdio::piped()).stderr(Stdio::piped());

            let mut child = match command.spawn() {
                Ok(child) => child,
                Err(err) => {
                    let _ = write_error_log(
                        &app,
                        "comments_download",
                        &id,
                        "",
                        &format!("yt-dlpの起動に失敗しました: {}", err),
                    );
                    let _ = app.emit(
                        "comments-finished",
                        CommentsFinished {
                            id,
                            success: false,
                            stdout: "".to_string(),
                            stderr: format!("yt-dlpの起動に失敗しました: {}", err),
                        },
                    );
                    return;
                }
            };

            let stdout_acc = Arc::new(Mutex::new(String::new()));
            let stderr_acc = Arc::new(Mutex::new(String::new()));

            if let Some(stdout) = child.stdout.take() {
                let app_clone = app.clone();
                let id_clone = id.clone();
                let stdout_acc_clone = stdout_acc.clone();
                let warning_seen_clone = warning_seen.clone();
                std::thread::spawn(move || {
                    let reader = BufReader::new(stdout);
                    for line in reader.lines().flatten() {
                        if line.contains(YTDLP_TITLE_WARNING) {
                            warning_seen_clone.store(true, Ordering::Relaxed);
                        }
                        if let Ok(mut buf) = stdout_acc_clone.lock() {
                            buf.push_str(&line);
                            buf.push('\n');
                        }
                        let _ = app_clone.emit(
                            "comments-progress",
                            serde_json::json!({ "id": id_clone, "line": line }),
                        );
                    }
                });
            }

            if let Some(stderr) = child.stderr.take() {
                let app_clone = app.clone();
                let id_clone = id.clone();
                let stderr_acc_clone = stderr_acc.clone();
                let warning_seen_clone = warning_seen.clone();
                std::thread::spawn(move || {
                    let reader = BufReader::new(stderr);
                    for line in reader.lines().flatten() {
                        if line.contains(YTDLP_TITLE_WARNING) {
                            warning_seen_clone.store(true, Ordering::Relaxed);
                        }
                        if let Ok(mut buf) = stderr_acc_clone.lock() {
                            buf.push_str(&line);
                            buf.push('\n');
                        }
                        let _ = app_clone.emit(
                            "comments-progress",
                            serde_json::json!({ "id": id_clone, "line": line }),
                        );
                    }
                });
            }

            let output = match child.wait() {
                Ok(status) => status,
                Err(err) => {
                    let _ = write_error_log(
                        &app,
                        "comments_download",
                        &id,
                        "",
                        &format!("yt-dlpの実行に失敗しました: {}", err),
                    );
                    let _ = app.emit(
                        "comments-finished",
                        CommentsFinished {
                            id,
                            success: false,
                            stdout: "".to_string(),
                            stderr: format!("yt-dlpの実行に失敗しました: {}", err),
                        },
                    );
                    return;
                }
            };

            let stdout = stdout_acc.lock().map(|s| s.clone()).unwrap_or_default();
            let stderr = stderr_acc.lock().map(|s| s.clone()).unwrap_or_default();

            last_stdout = stdout;
            last_stderr = stderr;
            last_success = output.success();

            let warning_retry = warning_seen.load(Ordering::Relaxed);
            if warning_retry && attempt < YTDLP_WARNING_RETRY_MAX {
                let _ = app.emit(
                    "comments-progress",
                    serde_json::json!({
                        "id": id.clone(),
                        "line": format!(
                            "警告を検知したためリトライします ({}/{})",
                            attempt,
                            YTDLP_WARNING_RETRY_MAX
                        )
                    }),
                );
                std::thread::sleep(Duration::from_millis(YTDLP_WARNING_RETRY_SLEEP_MS));
                continue;
            }

            let none_decode_retry = !last_success
                && attempt < YTDLP_NONE_DECODE_RETRY_MAX
                && (last_stderr.contains(YTDLP_NONE_DECODE_ERROR)
                    || last_stdout.contains(YTDLP_NONE_DECODE_ERROR))
                && (last_stderr.contains("decode") || last_stdout.contains("decode"));
            if none_decode_retry {
                let _ = app.emit(
                    "metadata-progress",
                    serde_json::json!({
                        "id": id.clone(),
                        "line": format!(
                            "一時的なエラーを検知したためリトライします ({}/{})",
                            attempt,
                            YTDLP_NONE_DECODE_RETRY_MAX
                        )
                    }),
                );
                std::thread::sleep(Duration::from_millis(YTDLP_NONE_DECODE_RETRY_SLEEP_MS));
                continue;
            }

            break;
        }

        if !last_success {
            let _ = write_error_log(&app, "comments_download", &id, &last_stdout, &last_stderr);
        }

        let _ = app.emit(
            "comments-finished",
            CommentsFinished {
                id,
                success: last_success,
                stdout: last_stdout,
                stderr: last_stderr,
            },
        );
    });

    Ok(())
}

#[tauri::command]
fn start_metadata_download(
    app: AppHandle,
    id: String,
    url: String,
    output_dir: String,
    cookies_file: Option<String>,
    cookies_source: Option<String>,
    cookies_browser: Option<String>,
    remote_components: Option<String>,
    yt_dlp_path: Option<String>,
    ffmpeg_path: Option<String>,
) -> Result<(), String> {
    let output_dir_path = library_metadata_dir(&output_dir);
    let output_path = output_dir_path
        .join("%(uploader_id)s/%(title)s [%(id)s].%(ext)s")
        .to_string_lossy()
        .to_string();
    let yt_dlp = resolve_override(yt_dlp_path).unwrap_or_else(resolve_yt_dlp);
    let ffmpeg_location = resolve_override(ffmpeg_path).or_else(|| Some(resolve_ffmpeg()));

    std::thread::spawn(move || {
        let mut last_stdout = String::new();
        let mut last_stderr = String::new();
        let mut last_success = false;

        if let Err(err) = fs::create_dir_all(&output_dir_path) {
            let _ = app.emit(
                "metadata-finished",
                MetadataFinished {
                    id,
                    success: false,
                    stdout: "".to_string(),
                    stderr: format!("保存先フォルダの作成に失敗しました: {}", err),
                    metadata: None,
                    has_live_chat: None,
                },
            );
            return;
        }


        for attempt in 1..=YTDLP_WARNING_RETRY_MAX {
            let warning_seen = Arc::new(AtomicBool::new(false));
            let mut command = Command::new(&yt_dlp);
            command
                .arg("--no-playlist")
                .arg("--newline")
                .arg("--progress")
                .arg("--skip-download")
                .arg("--write-comments")
                .arg("--write-subs")
                .arg("--sub-langs")
                .arg("live_chat")
                .arg("--sub-format")
                .arg("json")
                .arg("--write-info-json")
                .arg("-o")
                .arg(&output_path);
            if let Some(location) = &ffmpeg_location {
                command.arg("--ffmpeg-location").arg(location);
            }
            apply_cookies_args(
                &mut command,
                cookies_source.as_deref(),
                cookies_file.as_deref(),
                cookies_browser.as_deref(),
            );
            if let Some(remote) = &remote_components {
                if !remote.trim().is_empty() {
                    command.arg("--remote-components").arg(remote);
                }
            }
            command.arg(&url).stdout(Stdio::piped()).stderr(Stdio::piped());

            let mut child = match command.spawn() {
                Ok(child) => child,
                Err(err) => {
                    let _ = write_error_log(
                        &app,
                        "metadata_download",
                        &id,
                        "",
                        &format!("yt-dlpの起動に失敗しました: {}", err),
                    );
                    let _ = app.emit(
                        "metadata-finished",
                        MetadataFinished {
                            id,
                            success: false,
                            stdout: "".to_string(),
                            stderr: format!("yt-dlpの起動に失敗しました: {}", err),
                            metadata: None,
                            has_live_chat: None,
                        },
                    );
                    return;
                }
            };

            let stdout_acc = Arc::new(Mutex::new(String::new()));
            let stderr_acc = Arc::new(Mutex::new(String::new()));

            if let Some(stdout) = child.stdout.take() {
                let app_clone = app.clone();
                let id_clone = id.clone();
                let stdout_acc_clone = stdout_acc.clone();
                let warning_seen_clone = warning_seen.clone();
                std::thread::spawn(move || {
                    let reader = BufReader::new(stdout);
                    for line in reader.lines().flatten() {
                        if line.contains(YTDLP_TITLE_WARNING) {
                            warning_seen_clone.store(true, Ordering::Relaxed);
                        }
                        if let Ok(mut buf) = stdout_acc_clone.lock() {
                            buf.push_str(&line);
                            buf.push('\n');
                        }
                        let _ = app_clone.emit(
                            "metadata-progress",
                            serde_json::json!({ "id": id_clone, "line": line }),
                        );
                    }
                });
            }

            if let Some(stderr) = child.stderr.take() {
                let app_clone = app.clone();
                let id_clone = id.clone();
                let stderr_acc_clone = stderr_acc.clone();
                let warning_seen_clone = warning_seen.clone();
                std::thread::spawn(move || {
                    let reader = BufReader::new(stderr);
                    for line in reader.lines().flatten() {
                        if line.contains(YTDLP_TITLE_WARNING) {
                            warning_seen_clone.store(true, Ordering::Relaxed);
                        }
                        if let Ok(mut buf) = stderr_acc_clone.lock() {
                            buf.push_str(&line);
                            buf.push('\n');
                        }
                        let _ = app_clone.emit(
                            "metadata-progress",
                            serde_json::json!({ "id": id_clone, "line": line }),
                        );
                    }
                });
            }

            let output = match child.wait() {
                Ok(status) => status,
                Err(err) => {
                    let _ = write_error_log(
                        &app,
                        "metadata_download",
                        &id,
                        "",
                        &format!("yt-dlpの実行に失敗しました: {}", err),
                    );
                    let _ = app.emit(
                        "metadata-finished",
                        MetadataFinished {
                            id,
                            success: false,
                            stdout: "".to_string(),
                            stderr: format!("yt-dlpの実行に失敗しました: {}", err),
                            metadata: None,
                            has_live_chat: None,
                        },
                    );
                    return;
                }
            };

            let stdout = stdout_acc.lock().map(|s| s.clone()).unwrap_or_default();
            let stderr = stderr_acc.lock().map(|s| s.clone()).unwrap_or_default();

            last_stdout = stdout;
            last_stderr = stderr;
            last_success = output.success();

            let warning_retry = warning_seen.load(Ordering::Relaxed);
            if warning_retry && attempt < YTDLP_WARNING_RETRY_MAX {
                let _ = app.emit(
                    "metadata-progress",
                    serde_json::json!({
                        "id": id.clone(),
                        "line": format!(
                            "警告を検知したためリトライします ({}/{})",
                            attempt,
                            YTDLP_WARNING_RETRY_MAX
                        )
                    }),
                );
                std::thread::sleep(Duration::from_millis(YTDLP_WARNING_RETRY_SLEEP_MS));
                continue;
            }

            break;
        }

        if !last_success {
            let _ = write_error_log(&app, "metadata_download", &id, &last_stdout, &last_stderr);
        }

        let mut metadata: Option<VideoMetadata> = None;
        let mut has_live_chat: Option<bool> = None;

        if last_success {
            let dir = library_metadata_dir(&output_dir);
            if let Some(info_path) = find_info_json(&dir, &id) {
                if let Ok(content) = fs::read_to_string(&info_path) {
                    if let Ok(value) = serde_json::from_str::<serde_json::Value>(&content) {
                        metadata = Some(parse_video_metadata_value(&value));
                    }
                }
            }
            has_live_chat = comments_file_exists(id.clone(), output_dir.clone()).ok();
        }

        let _ = app.emit(
            "metadata-finished",
            MetadataFinished {
                id,
                success: last_success,
                stdout: last_stdout,
                stderr: last_stderr,
                metadata,
                has_live_chat,
            },
        );
    });

    Ok(())
}

#[tauri::command]
fn get_video_metadata(
    url: String,
    cookies_file: Option<String>,
    cookies_source: Option<String>,
    cookies_browser: Option<String>,
    remote_components: Option<String>,
    yt_dlp_path: Option<String>,
) -> Result<VideoMetadata, String> {
    let yt_dlp = resolve_override(yt_dlp_path).unwrap_or_else(resolve_yt_dlp);
    let mut command = Command::new(yt_dlp);
    command
        .arg("--dump-single-json")
        .arg("--skip-download")
        .arg("--no-playlist")
        .arg("--no-warnings");
    apply_cookies_args(
        &mut command,
        cookies_source.as_deref(),
        cookies_file.as_deref(),
        cookies_browser.as_deref(),
    );
    if let Some(remote) = remote_components {
        if !remote.trim().is_empty() {
            command.arg("--remote-components").arg(remote);
        }
    }
    command.arg(&url);

    let output = command
        .output()
        .map_err(|e| format!("yt-dlpの起動に失敗しました: {}", e))?;

    if !output.status.success() && output.stdout.is_empty() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(if stderr.trim().is_empty() {
            "yt-dlpの実行に失敗しました。".to_string()
        } else {
            stderr
        });
    }

    let value: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("yt-dlpの出力解析に失敗しました: {}", e))?;

    Ok(parse_video_metadata_value(&value))
}

#[tauri::command]
fn get_channel_metadata(
    url: String,
    cookies_file: Option<String>,
    cookies_source: Option<String>,
    cookies_browser: Option<String>,
    remote_components: Option<String>,
    yt_dlp_path: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<VideoMetadata>, String> {
    let yt_dlp = resolve_override(yt_dlp_path).unwrap_or_else(resolve_yt_dlp);
    let mut command = Command::new(yt_dlp);
    command
        .arg("--dump-single-json")
        .arg("--yes-playlist")
        .arg("--ignore-errors")
        .arg("--no-warnings")
        .arg("--skip-download");
    if let Some(limit) = limit {
        if limit > 0 {
            command.arg("--playlist-end").arg(limit.to_string());
        }
    }
    apply_cookies_args(
        &mut command,
        cookies_source.as_deref(),
        cookies_file.as_deref(),
        cookies_browser.as_deref(),
    );
    if let Some(remote) = remote_components {
        if !remote.trim().is_empty() {
            command.arg("--remote-components").arg(remote);
        }
    }
    command.arg(&url);

    let output = command
        .output()
        .map_err(|e| format!("yt-dlpの起動に失敗しました: {}", e))?;

    if !output.status.success() && output.stdout.is_empty() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(if stderr.trim().is_empty() {
            "yt-dlpの実行に失敗しました。".to_string()
        } else {
            stderr
        });
    }

    let value: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("yt-dlpの出力解析に失敗しました: {}", e))?;
    let entries = value
        .get("entries")
        .and_then(|v| v.as_array())
        .ok_or_else(|| "動画一覧が取得できませんでした。".to_string())?;

    let channel_id = value
        .get("channel_id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| {
            value
                .get("uploader_id")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        });

    let mut items = Vec::new();
    for entry in entries {
        let id = entry
            .get("id")
            .and_then(|v| v.as_str())
            .or_else(|| entry.get("url").and_then(|v| v.as_str()))
            .map(|s| s.to_string());
        let Some(id) = id else {
            continue;
        };

        if channel_id.as_deref().is_some_and(|cid| cid == id) {
            continue;
        }

        let title_value = entry
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("Untitled")
            .to_string();

        if title_value.ends_with(" - Videos")
            || title_value.ends_with(" - Live")
            || title_value.ends_with(" - Shorts")
        {
            continue;
        }

        items.push(VideoMetadata {
            id: Some(id),
            title: Some(title_value),
            channel: entry
                .get("channel")
                .and_then(|v| v.as_str())
                .or_else(|| entry.get("uploader").and_then(|v| v.as_str()))
                .or_else(|| entry.get("channel_title").and_then(|v| v.as_str()))
                .map(|s| s.to_string()),
            thumbnail: entry
                .get("thumbnail")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            url: entry
                .get("url")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            webpage_url: entry
                .get("webpage_url")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            duration_sec: entry.get("duration").and_then(|v| v.as_u64()),
            upload_date: entry
                .get("upload_date")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            release_timestamp: entry.get("release_timestamp").and_then(|v| v.as_i64()),
            timestamp: entry.get("timestamp").and_then(|v| v.as_i64()),
            live_status: entry
                .get("live_status")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            is_live: entry.get("is_live").and_then(|v| v.as_bool()),
            was_live: entry.get("was_live").and_then(|v| v.as_bool()),
            view_count: entry.get("view_count").and_then(|v| v.as_u64()),
            like_count: entry.get("like_count").and_then(|v| v.as_u64()),
            comment_count: entry.get("comment_count").and_then(|v| v.as_u64()),
            tags: entry
                .get("tags")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|item| item.as_str().map(|s| s.to_string()))
                        .collect::<Vec<String>>()
                }),
            categories: entry
                .get("categories")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|item| item.as_str().map(|s| s.to_string()))
                        .collect::<Vec<String>>()
                }),
            description: entry
                .get("description")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            channel_id: entry
                .get("channel_id")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            uploader_id: entry
                .get("uploader_id")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            channel_url: entry
                .get("channel_url")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            uploader_url: entry
                .get("uploader_url")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            availability: entry
                .get("availability")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            language: entry
                .get("language")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            audio_language: entry
                .get("audio_language")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            age_limit: entry.get("age_limit").and_then(|v| v.as_u64()),
        });
    }

    Ok(items)
}


#[tauri::command]
fn list_channel_videos(
    url: String,
    cookies_file: Option<String>,
    cookies_source: Option<String>,
    cookies_browser: Option<String>,
    remote_components: Option<String>,
    yt_dlp_path: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<ChannelVideoItem>, String> {
    let yt_dlp = resolve_override(yt_dlp_path).unwrap_or_else(resolve_yt_dlp);
    let base_url = normalize_channel_base_url(&url);
    let section_urls = build_channel_section_urls(&base_url);

    let mut merged: Vec<ChannelVideoItem> = Vec::new();
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();

    for section_url in section_urls {
        let mut items = match fetch_channel_section(
            &yt_dlp,
            &section_url,
            cookies_file.as_ref(),
            cookies_source.as_deref(),
            cookies_browser.as_deref(),
            remote_components.as_ref(),
            limit,
        ) {
            Ok(items) => items,
            Err(_) => Vec::new(),
        };
        for item in items.drain(..) {
            if seen.insert(item.id.clone()) {
                merged.push(item);
            }
        }
    }

    Ok(merged)
}

fn fetch_channel_section(
    yt_dlp: &str,
    url: &str,
    cookies_file: Option<&String>,
    cookies_source: Option<&str>,
    cookies_browser: Option<&str>,
    remote_components: Option<&String>,
    limit: Option<u32>,
) -> Result<Vec<ChannelVideoItem>, String> {
    let mut command = Command::new(yt_dlp);
    command
        .arg("--flat-playlist")
        .arg("--yes-playlist")
        .arg("--ignore-errors")
        .arg("--no-warnings")
        .arg("--skip-download")
        .arg("--dump-single-json");
    if let Some(limit) = limit {
        if limit > 0 {
            command.arg("--playlist-end").arg(limit.to_string());
        }
    }
    apply_cookies_args(
        &mut command,
        cookies_source,
        cookies_file.map(|s| s.as_str()),
        cookies_browser,
    );
    if let Some(remote) = remote_components {
        if !remote.trim().is_empty() {
            command.arg("--remote-components").arg(remote);
        }
    }
    command.arg(url);

    let output = command
        .output()
        .map_err(|e| format!("yt-dlpの起動に失敗しました: {}", e))?;

    let stdout = output.stdout;
    if !output.status.success() && stdout.is_empty() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(if stderr.trim().is_empty() {
            "yt-dlpの実行に失敗しました。".to_string()
        } else {
            stderr
        });
    }

    if stdout.is_empty() {
        return Ok(Vec::new());
    }

    let value: serde_json::Value = serde_json::from_slice(&stdout)
        .map_err(|e| format!("yt-dlpの出力解析に失敗しました: {}", e))?;
    let entries = value
        .get("entries")
        .and_then(|v| v.as_array())
        .ok_or_else(|| "動画一覧が取得できませんでした。".to_string())?;

    let channel_id = value
        .get("channel_id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| {
            value
                .get("uploader_id")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        });

    let mut items = Vec::new();
    for entry in entries {
        let id = entry
            .get("id")
            .and_then(|v| v.as_str())
            .or_else(|| entry.get("url").and_then(|v| v.as_str()))
            .map(|s| s.to_string());
        let Some(id) = id else {
            continue;
        };

        if channel_id.as_deref().is_some_and(|cid| cid == id) {
            continue;
        }

        let title = entry
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("Untitled")
            .to_string();

        if title.ends_with(" - Videos") || title.ends_with(" - Live") || title.ends_with(" - Shorts") {
            continue;
        }

        let channel = entry
            .get("channel")
            .and_then(|v| v.as_str())
            .or_else(|| entry.get("uploader").and_then(|v| v.as_str()))
            .or_else(|| entry.get("channel_title").and_then(|v| v.as_str()))
            .map(|s| s.to_string());
        let url_value = entry
            .get("url")
            .and_then(|v| v.as_str())
            .unwrap_or(&id);
        let full_url = if url_value.starts_with("http") {
            url_value.to_string()
        } else {
            format!("https://www.youtube.com/watch?v={}", url_value)
        };
        let thumbnail = entry
            .get("thumbnail")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let webpage_url = entry
            .get("webpage_url")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let duration_sec = entry.get("duration").and_then(|v| v.as_u64());
        let upload_date = entry
            .get("upload_date")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let release_timestamp = entry.get("release_timestamp").and_then(|v| v.as_i64());
        let timestamp = entry.get("timestamp").and_then(|v| v.as_i64());
        let live_status = entry
            .get("live_status")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let is_live = entry.get("is_live").and_then(|v| v.as_bool());
        let was_live = entry.get("was_live").and_then(|v| v.as_bool());
        let view_count = entry.get("view_count").and_then(|v| v.as_u64());
        let like_count = entry.get("like_count").and_then(|v| v.as_u64());
        let comment_count = entry.get("comment_count").and_then(|v| v.as_u64());
        let tags = entry
            .get("tags")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|item| item.as_str().map(|s| s.to_string()))
                    .collect::<Vec<String>>()
            });
        let categories = entry
            .get("categories")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|item| item.as_str().map(|s| s.to_string()))
                    .collect::<Vec<String>>()
            });
        let description = entry
            .get("description")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let channel_id = entry
            .get("channel_id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let uploader_id = entry
            .get("uploader_id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let channel_url = entry
            .get("channel_url")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let uploader_url = entry
            .get("uploader_url")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let availability = entry
            .get("availability")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let language = entry
            .get("language")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let audio_language = entry
            .get("audio_language")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let age_limit = entry.get("age_limit").and_then(|v| v.as_u64());

        items.push(ChannelVideoItem {
            id,
            title,
            channel,
            url: full_url,
            thumbnail,
            webpage_url,
            duration_sec,
            upload_date,
            release_timestamp,
            timestamp,
            live_status,
            is_live,
            was_live,
            view_count,
            like_count,
            comment_count,
            tags,
            categories,
            description,
            channel_id,
            uploader_id,
            channel_url,
            uploader_url,
            availability,
            language,
            audio_language,
            age_limit,
        });
    }

    Ok(items)
}

fn normalize_channel_base_url(url: &str) -> String {
    let lowered = url.to_lowercase();
    let replaced = if lowered.contains("/live") {
        url.replace("/live", "")
    } else if lowered.contains("/shorts") {
        url.replace("/shorts", "")
    } else if lowered.contains("/featured") {
        url.replace("/featured", "")
    } else if lowered.contains("/streams") {
        url.replace("/streams", "")
    } else if lowered.contains("/playlists") {
        url.replace("/playlists", "")
    } else if lowered.contains("/videos") {
        url.replace("/videos", "")
    } else {
        url.to_string()
    };
    if replaced.ends_with('/') {
        replaced.trim_end_matches('/').to_string()
    } else {
        replaced
    }
}

fn build_channel_section_urls(base_url: &str) -> Vec<String> {
    vec![
        format!("{}/videos", base_url.trim_end_matches('/')),
        format!("{}/streams", base_url.trim_end_matches('/')),
        format!("{}/live", base_url.trim_end_matches('/')),
        format!("{}/shorts", base_url.trim_end_matches('/')),
    ]
}

#[tauri::command]
fn get_comments(id: String, output_dir: String) -> Result<Vec<CommentItem>, String> {
    let dir = library_comments_dir(&output_dir);
    let file_path = find_comments_file(&dir, &id)
        .or_else(|| {
            let fallback_dir = library_metadata_dir(&output_dir);
            find_comments_file(&fallback_dir, &id)
        })
        .ok_or_else(|| "コメントファイルが見つかりません。".to_string())?;
    let content = fs::read_to_string(&file_path)
        .map_err(|e| format!("コメントファイルの読み込みに失敗しました: {}", e))?;

    if is_live_chat_file(&file_path) {
        return Ok(parse_live_chat_content(&content));
    }

    if let Ok(value) = serde_json::from_str::<serde_json::Value>(&content) {
        return Ok(parse_comments_value(&value));
    }

    Ok(parse_comments_lines(&content))
}

#[tauri::command]
fn resolve_video_file(id: String, title: String, output_dir: String) -> Result<Option<String>, String> {
    let dir = library_videos_dir(&output_dir);
    if !dir.exists() {
        return Ok(None);
    }

    let id_lower = id.to_lowercase();
    let title_trimmed = title.trim().to_string();
    let title_lower = title_trimmed.to_lowercase();
    let entries = collect_files_recursive(&dir);

    let mut info_stem: Option<String> = None;
    for path in collect_files_recursive(&dir) {
        if !path.is_file() {
            continue;
        }
            let name = match path.file_name().and_then(|n| n.to_str()) {
                Some(name) => name.to_string(),
                None => continue,
            };
            if !name.to_lowercase().ends_with(".info.json") {
                continue;
            }
            let content = match fs::read_to_string(&path) {
                Ok(content) => content,
                Err(_) => continue,
            };
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(video_id) = value.get("video_id").and_then(|v| v.as_str()) {
                    if video_id.eq_ignore_ascii_case(&id) {
                        if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                            let base = stem.strip_suffix(".info").unwrap_or(stem);
                            info_stem = Some(base.to_string());
                            break;
                        }
                    }
                }
            }
    }

    let mut all_candidates: Vec<(PathBuf, SystemTime)> = Vec::new();
    let mut id_matches: Vec<(PathBuf, SystemTime)> = Vec::new();
    let mut exact_title_matches: Vec<(PathBuf, SystemTime)> = Vec::new();
    let mut partial_title_matches: Vec<(PathBuf, SystemTime)> = Vec::new();

    for path in entries {
        if !path.is_file() {
            continue;
        }
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(name) => name.to_string(),
            None => continue,
        };
        let name_lower = name.to_lowercase();
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase());
        let is_video = matches!(ext.as_deref(), Some("mp4") | Some("webm") | Some("mkv") | Some("m4v"));
        if !is_video {
            continue;
        }

        let modified = path
            .metadata()
            .and_then(|m| m.modified())
            .unwrap_or(SystemTime::UNIX_EPOCH);
        all_candidates.push((path.clone(), modified));

        if name_lower.contains(&id_lower) {
            id_matches.push((path.clone(), modified));
            continue;
        }

        let stem = path
            .file_stem()
            .and_then(|s| s.to_str())
            .map(|s| s.to_string())
            .unwrap_or_default();
        let stem_lower = stem.to_lowercase();
        if let Some(info_base) = &info_stem {
            if stem == *info_base {
                id_matches.push((path.clone(), modified));
                continue;
            }
        }
        if !title_lower.is_empty() && stem_lower == title_lower {
            exact_title_matches.push((path.clone(), modified));
        } else if !title_lower.is_empty()
            && (stem_lower.contains(&title_lower) || title_lower.contains(&stem_lower))
        {
            partial_title_matches.push((path.clone(), modified));
        }
    }

    let pick_latest = |mut items: Vec<(PathBuf, SystemTime)>| -> Option<PathBuf> {
        items.sort_by_key(|(_, t)| *t);
        items.pop().map(|(p, _)| p)
    };

    let selected = pick_latest(id_matches)
        .or_else(|| pick_latest(exact_title_matches))
        .or_else(|| pick_latest(partial_title_matches))
        .or_else(|| {
            if all_candidates.len() == 1 {
                Some(all_candidates[0].0.clone())
            } else {
                pick_latest(all_candidates)
            }
        });

    Ok(selected.map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
fn video_file_exists(id: String, title: String, output_dir: String) -> Result<bool, String> {
    Ok(resolve_video_file(id, title, output_dir)?.is_some())
}

#[tauri::command]
fn comments_file_exists(id: String, output_dir: String) -> Result<bool, String> {
    let dir = library_comments_dir(&output_dir);
    if !dir.exists() {
        let fallback_dir = library_metadata_dir(&output_dir);
        if !fallback_dir.exists() {
            return Ok(false);
        }
    }
    let path = find_comments_file(&dir, &id)
        .or_else(|| {
            let fallback_dir = library_metadata_dir(&output_dir);
            find_comments_file(&fallback_dir, &id)
        });
    let Some(path) = path else {
        return Ok(false);
    };
    let is_info = path
        .file_name()
        .and_then(|n| n.to_str())
        .map(|name| name.to_lowercase().ends_with(".info.json"))
        .unwrap_or(false);
    Ok(!is_info)
}

#[tauri::command]
fn verify_local_files(
    output_dir: String,
    items: Vec<LocalFileCheckItem>,
) -> Result<Vec<LocalFileCheckResult>, String> {
    let videos_dir = library_videos_dir(&output_dir);
    let comments_dir = library_comments_dir(&output_dir);
    let metadata_dir = library_metadata_dir(&output_dir);
    if !videos_dir.exists() && !comments_dir.exists() && !metadata_dir.exists() {
        return Ok(items
            .into_iter()
            .map(|item| LocalFileCheckResult {
                id: item.id,
                video_ok: !item.check_video,
                comments_ok: !item.check_comments,
            })
            .collect());
    }

    let video_entries = collect_files_recursive(&videos_dir);
    let comment_entries = collect_files_recursive(&comments_dir);
    let metadata_entries = collect_files_recursive(&metadata_dir);

    let mut video_files: Vec<(String, String)> = Vec::new();
    let mut video_stems: HashSet<String> = HashSet::new();
    let mut video_ids_from_name: HashSet<String> = HashSet::new();
    let mut video_file_count = 0usize;

    let mut info_stem_by_id: HashMap<String, String> = HashMap::new();
    let mut comment_ids_from_name: HashSet<String> = HashSet::new();
    let mut comment_file_count = 0usize;

    for path in video_entries {
        if !path.is_file() {
            continue;
        }
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(name) => name.to_string(),
            None => continue,
        };
        let name_lower = name.to_lowercase();

        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase());
        let is_video = matches!(ext.as_deref(), Some("mp4") | Some("webm") | Some("mkv") | Some("m4v"));
        if is_video {
            video_file_count += 1;
            if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                let stem_lower = stem.to_lowercase();
                video_stems.insert(stem_lower.clone());
                video_files.push((name_lower.clone(), stem_lower));
            }
            if let Some(id) = extract_id_from_filename(&name) {
                video_ids_from_name.insert(id.to_lowercase());
            }
        }
    }

    for path in comment_entries {
        if !path.is_file() {
            continue;
        }
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(name) => name.to_string(),
            None => continue,
        };
        let name_lower = name.to_lowercase();
        let is_comment = name_lower.ends_with(".live_chat.json") || name_lower.ends_with(".comments.json");
        if !is_comment {
            continue;
        }
        comment_file_count += 1;
        if let Some(id) = extract_id_from_filename(&name) {
            comment_ids_from_name.insert(id.to_lowercase());
        }
    }

    for path in metadata_entries.iter() {
        if !path.is_file() {
            continue;
        }
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(name) => name.to_string(),
            None => continue,
        };
        let name_lower = name.to_lowercase();
        let is_comment = name_lower.ends_with(".live_chat.json") || name_lower.ends_with(".comments.json");
        if !is_comment {
            continue;
        }
        comment_file_count += 1;
        if let Some(id) = extract_id_from_filename(&name) {
            comment_ids_from_name.insert(id.to_lowercase());
        }
    }

    for path in metadata_entries {
        if !path.is_file() {
            continue;
        }
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(name) => name.to_string(),
            None => continue,
        };
        let name_lower = name.to_lowercase();
        let is_info = name_lower.ends_with(".info.json");
        if !is_info {
            continue;
        }
        if let Some(id) = extract_id_from_filename(&name) {
            if let Some(base) = info_base_name(&path) {
                info_stem_by_id.entry(id.to_lowercase()).or_insert(base);
            }
        } else if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(&content) {
                let id = value
                    .get("video_id")
                    .and_then(|v| v.as_str())
                    .or_else(|| value.get("id").and_then(|v| v.as_str()))
                    .or_else(|| value.get("display_id").and_then(|v| v.as_str()))
                    .map(|s| s.to_string());
                if let Some(id) = id {
                    if let Some(base) = info_base_name(&path) {
                        info_stem_by_id.entry(id.to_lowercase()).or_insert(base);
                    }
                }
            }
        }
    }

    let results = items
        .into_iter()
        .map(|item| {
            let id_lower = item.id.to_lowercase();
            let title_lower = item.title.trim().to_lowercase();

            let video_ok = if !item.check_video {
                true
            } else if video_file_count == 0 {
                false
            } else {
                let mut matched = false;
                if let Some(info_stem) = info_stem_by_id.get(&id_lower) {
                    matched = video_stems.contains(&info_stem.to_lowercase());
                }
                if !matched && video_ids_from_name.contains(&id_lower) {
                    matched = true;
                }
                if !matched {
                    matched = video_files.iter().any(|(name_lower, _)| name_lower.contains(&id_lower));
                }
                if !matched && !title_lower.is_empty() {
                    matched = video_stems.contains(&title_lower)
                        || video_files
                            .iter()
                            .any(|(_, stem_lower)| stem_lower.contains(&title_lower) || title_lower.contains(stem_lower));
                }
                if matched {
                    true
                } else {
                    video_file_count > 0
                }
            };

            let comments_ok = if !item.check_comments {
                true
            } else if comment_file_count == 0 {
                false
            } else if comment_ids_from_name.contains(&id_lower) {
                true
            } else if let Some(base) = info_stem_by_id.get(&id_lower) {
                let live_chat = comments_dir.join(format!("{}.live_chat.json", base));
                let comments = comments_dir.join(format!("{}.comments.json", base));
                live_chat.exists() || comments.exists()
            } else if comment_file_count == 1 {
                true
            } else {
                false
            };

            LocalFileCheckResult {
                id: item.id,
                video_ok,
                comments_ok,
            }
        })
        .collect();

    Ok(results)
}

#[tauri::command]
fn info_json_exists(id: String, output_dir: String) -> Result<bool, String> {
    let dir = library_metadata_dir(&output_dir);
    if !dir.exists() {
        return Ok(false);
    }
    Ok(find_info_json(&dir, &id).is_some())
}

#[tauri::command]
fn get_metadata_index(output_dir: String) -> Result<MetadataIndex, String> {
    let metadata_dir = library_metadata_dir(&output_dir);
    let comments_dir = library_comments_dir(&output_dir);
    if !metadata_dir.exists() && !comments_dir.exists() {
        return Ok(MetadataIndex {
            info_ids: Vec::new(),
            chat_ids: Vec::new(),
        });
    }

    let mut info_ids: HashSet<String> = HashSet::new();
    let mut chat_ids: HashSet<String> = HashSet::new();

    for path in collect_files_recursive(&metadata_dir) {
        if !path.is_file() {
            continue;
        }
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(name) => name.to_string(),
            None => continue,
        };
        let name_lower = name.to_lowercase();
        let is_info = name_lower.ends_with(".info.json");
        let is_chat = name_lower.ends_with(".live_chat.json") || name_lower.ends_with(".comments.json");
        if !is_info && !is_chat {
            continue;
        }

        if let (Some(open_idx), Some(close_idx)) = (name.rfind('['), name.rfind(']')) {
            if close_idx > open_idx + 1 {
                let id = name[(open_idx + 1)..close_idx].trim().to_string();
                if !id.is_empty() {
                    if is_info {
                        info_ids.insert(id.clone());
                    }
                    if is_chat {
                        chat_ids.insert(id);
                    }
                    continue;
                }
            }
        }

        // Fallback: inspect JSON for ID if filename does not include it.
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(&content) {
                let id = value
                    .get("id")
                    .and_then(|v| v.as_str())
                    .or_else(|| value.get("video_id").and_then(|v| v.as_str()))
                    .or_else(|| value.get("display_id").and_then(|v| v.as_str()))
                    .map(|s| s.to_string());
                if let Some(id) = id {
                    if is_info {
                        info_ids.insert(id.clone());
                    }
                    if is_chat {
                        chat_ids.insert(id);
                    }
                }
            }
        }
    }

    for path in collect_files_recursive(&comments_dir) {
        if !path.is_file() {
            continue;
        }
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(name) => name.to_string(),
            None => continue,
        };
        let name_lower = name.to_lowercase();
        let is_info = name_lower.ends_with(".info.json");
        let is_chat = name_lower.ends_with(".live_chat.json") || name_lower.ends_with(".comments.json");
        if !is_info && !is_chat {
            continue;
        }

        if let (Some(open_idx), Some(close_idx)) = (name.rfind('['), name.rfind(']')) {
            if close_idx > open_idx + 1 {
                let id = name[(open_idx + 1)..close_idx].trim().to_string();
                if !id.is_empty() {
                    if is_info {
                        info_ids.insert(id.clone());
                    }
                    if is_chat {
                        chat_ids.insert(id);
                    }
                    continue;
                }
            }
        }

        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(&content) {
                let id = value
                    .get("id")
                    .and_then(|v| v.as_str())
                    .or_else(|| value.get("video_id").and_then(|v| v.as_str()))
                    .or_else(|| value.get("display_id").and_then(|v| v.as_str()))
                    .map(|s| s.to_string());
                if let Some(id) = id {
                    if is_info {
                        info_ids.insert(id.clone());
                    }
                    if is_chat {
                        chat_ids.insert(id);
                    }
                }
            }
        }
    }

    Ok(MetadataIndex {
        info_ids: info_ids.into_iter().collect(),
        chat_ids: chat_ids.into_iter().collect(),
    })
}

#[tauri::command]
fn get_local_metadata_by_ids(
    output_dir: String,
    ids: Vec<String>,
) -> Result<Vec<LocalMetadataItem>, String> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }

    let mut remaining: HashSet<String> = ids.iter().map(|id| id.to_lowercase()).collect();
    let mut results: Vec<LocalMetadataItem> = Vec::new();

    let metadata_dir = library_metadata_dir(&output_dir);
    let comments_dir = library_comments_dir(&output_dir);

    let mut scan_dirs: Vec<PathBuf> = Vec::new();
    if metadata_dir.exists() {
        scan_dirs.push(metadata_dir);
    }
    if comments_dir.exists() {
        scan_dirs.push(comments_dir);
    }

    for dir in scan_dirs {
        for path in collect_files_recursive(&dir) {
            if remaining.is_empty() {
                return Ok(results);
            }
            if !path.is_file() {
                continue;
            }
            let name = match path.file_name().and_then(|n| n.to_str()) {
                Some(name) => name.to_string(),
                None => continue,
            };
            let name_lower = name.to_lowercase();
            if !name_lower.ends_with(".info.json") {
                continue;
            }

            let extracted_id = extract_id_from_filename(&name);
            let extracted_lower = extracted_id.as_ref().map(|id| id.to_lowercase());
            let matches_name = extracted_lower
                .as_ref()
                .map(|id| remaining.contains(id))
                .unwrap_or(false);

            if !matches_name && extracted_id.is_some() {
                continue;
            }

            let content = match fs::read_to_string(&path) {
                Ok(content) => content,
                Err(_) => continue,
            };
            let value = match serde_json::from_str::<serde_json::Value>(&content) {
                Ok(value) => value,
                Err(_) => continue,
            };

            let id_from_value = value
                .get("id")
                .and_then(|v| v.as_str())
                .or_else(|| value.get("video_id").and_then(|v| v.as_str()))
                .or_else(|| value.get("display_id").and_then(|v| v.as_str()))
                .map(|s| s.to_string());

            let resolved_id = id_from_value.or_else(|| extracted_id.clone());
            let Some(resolved_id) = resolved_id else {
                continue;
            };
            let resolved_lower = resolved_id.to_lowercase();
            if !remaining.contains(&resolved_lower) {
                continue;
            }

            let metadata = parse_video_metadata_value(&value);
            results.push(LocalMetadataItem {
                id: resolved_id.clone(),
                metadata,
            });
            remaining.remove(&resolved_lower);
        }
    }

    Ok(results)
}

#[tauri::command]
fn probe_media(file_path: String, ffprobe_path: Option<String>) -> Result<MediaInfo, String> {
    let ffprobe = resolve_override(ffprobe_path).unwrap_or_else(resolve_ffprobe);
    let output = Command::new(ffprobe)
        .arg("-v")
        .arg("error")
        .arg("-show_entries")
        .arg("stream=codec_type,codec_name,codec_tag_string,codec_long_name,width,height")
        .arg("-show_entries")
        .arg("format=duration")
        .arg("-of")
        .arg("json")
        .arg(&file_path)
        .output()
        .map_err(|e| format!("ffprobeの起動に失敗しました: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(if stderr.trim().is_empty() {
            "ffprobeの実行に失敗しました。".to_string()
        } else {
            stderr
        });
    }

    let value: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("ffprobeの出力解析に失敗しました: {}", e))?;

    let mut info = MediaInfo {
        video_codec: None,
        audio_codec: None,
        width: None,
        height: None,
        duration: None,
        container: None,
    };

    if let Some(duration) = value
        .get("format")
        .and_then(|f| f.get("duration"))
        .and_then(|d| d.as_str())
    {
        info.duration = duration.parse::<f64>().ok();
    }

    if let Some(container) = value
        .get("format")
        .and_then(|f| f.get("format_name"))
        .and_then(|d| d.as_str())
    {
        info.container = Some(container.to_string());
    }

    if let Some(streams) = value.get("streams").and_then(|s| s.as_array()) {
        for stream in streams {
            let codec_type = stream.get("codec_type").and_then(|v| v.as_str());
            match codec_type {
                Some("video") if info.video_codec.is_none() => {
                    let codec = stream
                        .get("codec_name")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                        .or_else(|| {
                            stream
                                .get("codec_tag_string")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string())
                        })
                        .or_else(|| {
                            stream
                                .get("codec_long_name")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string())
                        });
                    info.video_codec = codec;
                    info.width = stream.get("width").and_then(|v| v.as_u64()).map(|v| v as u32);
                    info.height = stream.get("height").and_then(|v| v.as_u64()).map(|v| v as u32);
                }
                Some("audio") if info.audio_codec.is_none() => {
                    let codec = stream
                        .get("codec_name")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                        .or_else(|| {
                            stream
                                .get("codec_tag_string")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string())
                        })
                        .or_else(|| {
                            stream
                                .get("codec_long_name")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string())
                        });
                    info.audio_codec = codec;
                }
                _ => {}
            }
        }
    }

    Ok(info)
}

#[tauri::command]
fn load_state(app: AppHandle) -> Result<PersistedState, String> {
    let settings_path = settings_file_path(&app)?;
    let videos_path = videos_file_path(&app)?;

    let settings = if settings_path.exists() {
        let content = fs::read_to_string(&settings_path)
            .map_err(|e| format!("設定ファイルの読み込みに失敗しました: {}", e))?;
        parse_versioned_settings(&content)
    } else {
        PersistedSettings::default()
    };

    let videos = if videos_path.exists() {
        let content = fs::read_to_string(&videos_path)
            .map_err(|e| format!("動画インデックスの読み込みに失敗しました: {}", e))?;
        parse_versioned_videos(&content)
    } else {
        PersistedVideos::default()
    };

    Ok(PersistedState {
        videos: videos.videos,
        download_dir: settings.download_dir,
        cookies_file: settings.cookies_file,
        cookies_source: settings.cookies_source,
        cookies_browser: settings.cookies_browser,
        remote_components: settings.remote_components,
        yt_dlp_path: settings.yt_dlp_path,
        ffmpeg_path: settings.ffmpeg_path,
        ffprobe_path: settings.ffprobe_path,
    })
}

#[tauri::command]
fn save_state(app: AppHandle, state: PersistedState) -> Result<(), String> {
    let settings_path = settings_file_path(&app)?;
    let videos_path = videos_file_path(&app)?;

    if let Some(parent) = settings_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("設定フォルダの作成に失敗しました: {}", e))?;
    }
    if let Some(parent) = videos_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("インデックスフォルダの作成に失敗しました: {}", e))?;
    }

    let settings = VersionedSettings {
        version: SETTINGS_SCHEMA_VERSION,
        data: PersistedSettings {
            download_dir: state.download_dir,
            cookies_file: state.cookies_file,
            cookies_source: state.cookies_source,
            cookies_browser: state.cookies_browser,
            remote_components: state.remote_components,
            yt_dlp_path: state.yt_dlp_path,
            ffmpeg_path: state.ffmpeg_path,
            ffprobe_path: state.ffprobe_path,
        },
    };
    let settings_content = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("設定データの整形に失敗しました: {}", e))?;
    fs::write(&settings_path, settings_content)
        .map_err(|e| format!("設定ファイルの保存に失敗しました: {}", e))?;

    let videos = VersionedVideos {
        version: VIDEOS_SCHEMA_VERSION,
        data: PersistedVideos {
            videos: state.videos,
        },
    };
    let videos_content = serde_json::to_string_pretty(&videos)
        .map_err(|e| format!("動画インデックスの整形に失敗しました: {}", e))?;
    fs::write(&videos_path, videos_content)
        .map_err(|e| format!("動画インデックスの保存に失敗しました: {}", e))?;
    Ok(())
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportManifest {
    version: u32,
    created_at_ms: u128,
    settings_version: Option<u32>,
    videos_version: Option<u32>,
}

#[tauri::command]
fn export_state(app: AppHandle, output_path: String) -> Result<(), String> {
    let settings_path = settings_file_path(&app)?;
    let videos_path = videos_file_path(&app)?;

    let file = fs::File::create(&output_path)
        .map_err(|e| format!("エクスポート先の作成に失敗しました: {}", e))?;
    let mut zip = ZipWriter::new(file);
    let options = FileOptions::default();

    let manifest = ExportManifest {
        version: BACKUP_SCHEMA_VERSION,
        created_at_ms: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0),
        settings_version: Some(SETTINGS_SCHEMA_VERSION),
        videos_version: Some(VIDEOS_SCHEMA_VERSION),
    };
    let manifest_content = serde_json::to_string_pretty(&manifest)
        .map_err(|e| format!("マニフェストの作成に失敗しました: {}", e))?;
    zip.start_file("manifest.json", options)
        .map_err(|e| format!("zipの作成に失敗しました: {}", e))?;
    zip.write_all(manifest_content.as_bytes())
        .map_err(|e| format!("zipの書き込みに失敗しました: {}", e))?;

    if settings_path.exists() {
        let content = fs::read_to_string(&settings_path)
            .map_err(|e| format!("設定ファイルの読み込みに失敗しました: {}", e))?;
        zip.start_file("settings/app.json", options)
            .map_err(|e| format!("zipの作成に失敗しました: {}", e))?;
        zip.write_all(content.as_bytes())
            .map_err(|e| format!("zipの書き込みに失敗しました: {}", e))?;
    }

    if videos_path.exists() {
        let content = fs::read_to_string(&videos_path)
            .map_err(|e| format!("動画インデックスの読み込みに失敗しました: {}", e))?;
        zip.start_file("index/videos.json", options)
            .map_err(|e| format!("zipの作成に失敗しました: {}", e))?;
        zip.write_all(content.as_bytes())
            .map_err(|e| format!("zipの書き込みに失敗しました: {}", e))?;
    }

    zip.finish()
        .map_err(|e| format!("zipの作成に失敗しました: {}", e))?;
    Ok(())
}

#[tauri::command]
fn import_state(app: AppHandle, input_path: String) -> Result<(), String> {
    let file = fs::File::open(&input_path)
        .map_err(|e| format!("インポート元の読み込みに失敗しました: {}", e))?;
    let mut archive = ZipArchive::new(file)
        .map_err(|e| format!("zipの読み込みに失敗しました: {}", e))?;

    if let Ok(mut manifest_entry) = archive.by_name("manifest.json") {
        let mut manifest_content = String::new();
        manifest_entry
            .read_to_string(&mut manifest_content)
            .map_err(|e| format!("マニフェストの読み込みに失敗しました: {}", e))?;
        if let Ok(manifest) = serde_json::from_str::<ExportManifest>(&manifest_content) {
            if manifest.version > BACKUP_SCHEMA_VERSION {
                return Err(format!(
                    "このバックアップは新しい形式です（version: {}）。アプリを更新してください。",
                    manifest.version
                ));
            }
        }
    }

    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("zipの読み込みに失敗しました: {}", e))?;
        let name = entry.name().to_string();
        let target = match name.as_str() {
            "settings/app.json" => Some(settings_file_path(&app)?),
            "index/videos.json" => Some(videos_file_path(&app)?),
            _ => None,
        };
        let Some(target_path) = target else {
            continue;
        };

        if let Some(parent) = target_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("保存先フォルダの作成に失敗しました: {}", e))?;
        }

        let mut buffer = Vec::new();
        entry
            .read_to_end(&mut buffer)
            .map_err(|e| format!("zipの読み込みに失敗しました: {}", e))?;
        fs::write(&target_path, buffer)
            .map_err(|e| format!("ファイルの保存に失敗しました: {}", e))?;
    }

    Ok(())
}

fn normalize_thumbnail_extension(value: Option<String>) -> String {
    if let Some(raw) = value {
        let lowered = raw.trim().to_lowercase();
        let trimmed = lowered.trim_start_matches('.');
        if matches!(trimmed, "jpg" | "jpeg" | "png" | "webp" | "gif") {
            return if trimmed == "jpeg" {
                "jpg".to_string()
            } else {
                trimmed.to_string()
            };
        }
    }
    "jpg".to_string()
}

fn find_existing_thumbnail(dir: &Path, video_id: &str) -> Option<PathBuf> {
    if !dir.exists() {
        return None;
    }
    let id_marker = format!("[{}]", video_id);
    for path in collect_files_recursive(dir) {
        if !path.is_file() {
            continue;
        }
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(name) => name.to_string(),
            None => continue,
        };
        let name_lower = name.to_lowercase();
        if !name_lower.contains(&id_marker.to_lowercase()) {
            continue;
        }
        if name_lower.ends_with(".jpg")
            || name_lower.ends_with(".jpeg")
            || name_lower.ends_with(".png")
            || name_lower.ends_with(".webp")
            || name_lower.ends_with(".gif")
        {
            return Some(path);
        }
    }
    None
}

#[tauri::command]
fn save_thumbnail(
    app: AppHandle,
    video_id: String,
    title: Option<String>,
    uploader_id: Option<String>,
    output_dir: Option<String>,
    data: Vec<u8>,
    extension: Option<String>,
) -> Result<String, String> {
    let trimmed_id = video_id.trim();
    if trimmed_id.is_empty() || data.is_empty() {
        return Err("サムネイルの保存に必要な情報が不足しています。".to_string());
    }

    let resolved_output = output_dir.as_deref().map(|s| s.trim()).filter(|s| !s.is_empty());
    let settings = if resolved_output.is_none() { read_settings(&app) } else { PersistedSettings::default() };
    let dir = if let Some(download_dir) = resolved_output.or(settings.download_dir.as_deref()) {
        let base = library_thumbnails_dir(download_dir);
        let handle = uploader_id.as_deref().map(|s| s.trim()).unwrap_or("");
        if handle.is_empty() {
            base
        } else {
            base.join(sanitize_path_component(handle, 64))
        }
    } else {
        let base = app
            .path()
            .app_config_dir()
            .map_err(|e| format!("保存先ディレクトリの取得に失敗しました: {}", e))?;
        base.join("thumbnails")
    };
    fs::create_dir_all(&dir)
        .map_err(|e| format!("サムネイル保存先フォルダの作成に失敗しました: {}", e))?;

    if let Some(existing) = find_existing_thumbnail(&dir, trimmed_id) {
        return Ok(existing.to_string_lossy().to_string());
    }

    let extension = normalize_thumbnail_extension(extension);
    let safe_title = sanitize_path_component(title.as_deref().unwrap_or("thumbnail"), 120);
    let file_path = dir.join(format!("{} [{}].{}", safe_title, trimmed_id, extension));
    fs::write(&file_path, &data)
        .map_err(|e| format!("サムネイルの保存に失敗しました: {}", e))?;

    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
fn resolve_thumbnail_path(output_dir: String, id: String) -> Result<Option<String>, String> {
    let dir = library_thumbnails_dir(&output_dir);
    if !dir.exists() {
        return Ok(None);
    }
    let id_marker = format!("[{}]", id).to_lowercase();
    for path in collect_files_recursive(&dir) {
        if !path.is_file() {
            continue;
        }
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(name) => name.to_string(),
            None => continue,
        };
        let name_lower = name.to_lowercase();
        if !name_lower.contains(&id_marker) {
            continue;
        }
        if name_lower.ends_with(".jpg")
            || name_lower.ends_with(".jpeg")
            || name_lower.ends_with(".png")
            || name_lower.ends_with(".webp")
            || name_lower.ends_with(".gif")
        {
            return Ok(Some(path.to_string_lossy().to_string()));
        }
    }
    Ok(None)
}

fn find_comments_file(dir: &Path, id: &str) -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    let mut info_match: Option<PathBuf> = None;
    let mut name_live_match: Option<PathBuf> = None;
    let mut name_comments_match: Option<PathBuf> = None;
    let mut name_info_match: Option<PathBuf> = None;
    for path in collect_files_recursive(dir) {
        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            let name_lower = name.to_lowercase();
            if name_lower.contains(&id.to_lowercase())
                && (name_lower.ends_with(".info.json")
                    || name_lower.ends_with(".comments.json")
                    || name_lower.ends_with(".live_chat.json"))
            {
                if name_lower.ends_with(".live_chat.json") {
                    name_live_match = Some(path.clone());
                } else if name_lower.ends_with(".comments.json") {
                    name_comments_match = Some(path.clone());
                } else if name_lower.ends_with(".info.json") {
                    name_info_match = Some(path.clone());
                }
            }
            if name_lower.ends_with(".info.json")
                || name_lower.ends_with(".comments.json")
                || name_lower.ends_with(".live_chat.json")
            {
                candidates.push(path);
            }
        }
    }

    if name_live_match.is_some() || name_comments_match.is_some() || name_info_match.is_some() {
        return name_live_match.or(name_comments_match).or(name_info_match);
    }

    for path in &candidates {
        if !is_live_chat_file(path) {
            continue;
        }
        if let Ok(content) = fs::read_to_string(path) {
            let mut matched = false;
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(video_id) = value.get("video_id").and_then(|v| v.as_str()) {
                    if video_id.eq_ignore_ascii_case(id) {
                        matched = true;
                    }
                }
            }
            if !matched {
                for line in content.lines() {
                    if let Ok(value) = serde_json::from_str::<serde_json::Value>(line) {
                        if let Some(video_id) = value.get("video_id").and_then(|v| v.as_str()) {
                            if video_id.eq_ignore_ascii_case(id) {
                                matched = true;
                                break;
                            }
                        }
                    }
                }
            }
            if matched {
                return Some(path.clone());
            }
        }
    }

    for path in &candidates {
        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            if !name.to_lowercase().ends_with(".comments.json") {
                continue;
            }
        }
        if let Ok(content) = fs::read_to_string(path) {
            let mut matched = false;
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(video_id) = value.get("video_id").and_then(|v| v.as_str()) {
                    if video_id.eq_ignore_ascii_case(id) {
                        matched = true;
                    }
                }
            }
            if !matched {
                for line in content.lines() {
                    if let Ok(value) = serde_json::from_str::<serde_json::Value>(line) {
                        if let Some(video_id) = value.get("video_id").and_then(|v| v.as_str()) {
                            if video_id.eq_ignore_ascii_case(id) {
                                matched = true;
                                break;
                            }
                        }
                    }
                }
            }
            if matched {
                return Some(path.clone());
            }
        }
    }

    for path in &candidates {
        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            if !name.to_lowercase().ends_with(".info.json") {
                continue;
            }
        }
        if let Ok(content) = fs::read_to_string(path) {
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(video_id) = value.get("id").and_then(|v| v.as_str()) {
                    if video_id.eq_ignore_ascii_case(id) {
                        info_match = Some(path.clone());
                        break;
                    }
                }
                if let Some(display_id) = value.get("display_id").and_then(|v| v.as_str()) {
                    if display_id.eq_ignore_ascii_case(id) {
                        info_match = Some(path.clone());
                        break;
                    }
                }
            }
        }
    }

    if let Some(info_path) = info_match {
        if let Some(base) = info_base_name(&info_path) {
            let live_chat_path = dir.join(format!("{}.live_chat.json", base));
            if live_chat_path.exists() {
                return Some(live_chat_path);
            }
            let comments_path = dir.join(format!("{}.comments.json", base));
            if comments_path.exists() {
                return Some(comments_path);
            }
        }
        return Some(info_path);
    }

    if candidates.len() == 1 {
        return candidates.into_iter().next();
    }

    None
}

fn info_base_name(path: &Path) -> Option<String> {
    let stem = path.file_stem()?.to_string_lossy().to_string();
    if let Some(base) = stem.strip_suffix(".info") {
        return Some(base.to_string());
    }
    Some(stem)
}

fn is_live_chat_file(path: &Path) -> bool {
    path.file_name()
        .and_then(|n| n.to_str())
        .map(|name| name.to_lowercase().ends_with(".live_chat.json"))
        .unwrap_or(false)
}

fn parse_comments_value(value: &serde_json::Value) -> Vec<CommentItem> {
    let mut out = Vec::new();
    if let Some(arr) = value.as_array() {
        for item in arr {
            if let Some(comment) = parse_comment_item(item) {
                out.push(comment);
            }
        }
        return out;
    }

    if let Some(arr) = value.get("comments").and_then(|v| v.as_array()) {
        for item in arr {
            if let Some(comment) = parse_comment_item(item) {
                out.push(comment);
            }
        }
    }
    out
}

fn parse_comments_lines(content: &str) -> Vec<CommentItem> {
    let mut out = Vec::new();
    for line in content.lines() {
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(line) {
            if let Some(comment) = parse_comment_item(&value) {
                out.push(comment);
            }
        }
    }
    out
}

fn parse_live_chat_content(content: &str) -> Vec<CommentItem> {
    let mut out = Vec::new();
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(content) {
        if let Some(arr) = value.as_array() {
            for item in arr {
                if let Some(chat) = parse_live_chat_item(item) {
                    out.push(chat);
                }
            }
            if !out.is_empty() {
                return out;
            }
        } else if let Some(chat) = parse_live_chat_item(&value) {
            out.push(chat);
            return out;
        }
    }
    for line in content.lines() {
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(line) {
            if let Some(chat) = parse_live_chat_item(&value) {
                out.push(chat);
            }
        }
    }
    out
}

fn parse_live_chat_item(value: &serde_json::Value) -> Option<CommentItem> {
    let renderer = find_live_chat_renderer(value)?;
    let author = renderer
        .get("authorName")
        .and_then(extract_text)
        .unwrap_or_else(|| "不明".to_string());
    let text = renderer
        .get("message")
        .and_then(extract_text)
        .or_else(|| renderer.get("headerSubtext").and_then(extract_text))
        .or_else(|| renderer.get("subtext").and_then(extract_text))
        .unwrap_or_default();
    if text.trim().is_empty() {
        return None;
    }
    let published_at = renderer
        .get("timestampUsec")
        .and_then(|v| v.as_str())
        .and_then(|s| s.parse::<i64>().ok())
        .map(|us| (us / 1000).to_string())
        .or_else(|| renderer.get("timestampText").and_then(extract_text));
    let offset_ms = find_video_offset_ms(value);
    Some(CommentItem {
        author,
        text,
        like_count: None,
        published_at,
        offset_ms,
    })
}

fn find_video_offset_ms(value: &serde_json::Value) -> Option<u64> {
    match value {
        serde_json::Value::Object(map) => {
            if let Some(raw) = map.get("videoOffsetTimeMsec") {
                if let Some(parsed) = raw.as_u64() {
                    return Some(parsed);
                }
                if let Some(text) = raw.as_str() {
                    if let Ok(parsed) = text.parse::<u64>() {
                        return Some(parsed);
                    }
                }
            }
            for child in map.values() {
                if let Some(found) = find_video_offset_ms(child) {
                    return Some(found);
                }
            }
            None
        }
        serde_json::Value::Array(items) => {
            for item in items {
                if let Some(found) = find_video_offset_ms(item) {
                    return Some(found);
                }
            }
            None
        }
        _ => None,
    }
}

fn find_live_chat_renderer<'a>(value: &'a serde_json::Value) -> Option<&'a serde_json::Value> {
    if let Some(renderer) = value.get("liveChatTextMessageRenderer") {
        return Some(renderer);
    }
    if let Some(renderer) = value.get("liveChatPaidMessageRenderer") {
        return Some(renderer);
    }
    if let Some(renderer) = value.get("liveChatMembershipItemRenderer") {
        return Some(renderer);
    }
    if let Some(renderer) = value.get("liveChatPaidStickerRenderer") {
        return Some(renderer);
    }
    if let Some(item) = value.get("addChatItemAction").and_then(|v| v.get("item")) {
        if let Some(found) = find_live_chat_renderer(item) {
            return Some(found);
        }
    }
    if let Some(actions) = value
        .get("replayChatItemAction")
        .and_then(|v| v.get("actions"))
        .and_then(|v| v.as_array())
    {
        for action in actions {
            if let Some(found) = find_live_chat_renderer(action) {
                return Some(found);
            }
        }
    }
    None
}

fn extract_text(value: &serde_json::Value) -> Option<String> {
    if let Some(simple) = value.get("simpleText").and_then(|v| v.as_str()) {
        return Some(simple.to_string());
    }
    if let Some(runs) = value.get("runs").and_then(|v| v.as_array()) {
        let mut out = String::new();
        for run in runs {
            if let Some(text) = run.get("text").and_then(|v| v.as_str()) {
                out.push_str(text);
                continue;
            }
            if let Some(shortcut) = run
                .get("emoji")
                .and_then(|v| v.get("shortcuts"))
                .and_then(|v| v.as_array())
                .and_then(|arr| arr.first())
                .and_then(|v| v.as_str())
            {
                out.push_str(shortcut);
            }
        }
        if !out.is_empty() {
            return Some(out);
        }
    }
    None
}

fn parse_comment_item(value: &serde_json::Value) -> Option<CommentItem> {
    let author = value.get("author")?.as_str()?.to_string();
    let text = value
        .get("text")
        .and_then(|v| v.as_str())
        .or_else(|| value.get("content").and_then(|v| v.as_str()))
        .unwrap_or("")
        .to_string();
    let like_count = value
        .get("like_count")
        .and_then(|v| v.as_u64());
    let published_at = value
        .get("_time_text")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| {
            value
                .get("timestamp")
                .and_then(|v| v.as_i64())
                .map(|t| t.to_string())
        });
    Some(CommentItem {
        author,
        text,
        like_count,
        published_at,
        offset_ms: None,
    })
}

fn resolve_override(value: Option<String>) -> Option<String> {
    value.and_then(|path| {
        let trimmed = path.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    })
}

fn can_run_yt_dlp(yt_dlp: &str) -> bool {
    Command::new(yt_dlp)
        .arg("--version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct YtDlpUpdateEvent {
    status: String,
    stdout: String,
    stderr: String,
}

fn update_yt_dlp_if_available(app: &AppHandle, yt_dlp: String) {
    if !can_run_yt_dlp(&yt_dlp) {
        let _ = app.emit(
            "yt-dlp-update",
            YtDlpUpdateEvent {
                status: "skipped".to_string(),
                stdout: "".to_string(),
                stderr: "".to_string(),
            },
        );
        return;
    }
    let output = Command::new(&yt_dlp).arg("-U").output();
    let output = match output {
        Ok(output) => output,
        Err(err) => {
            let _ = app.emit(
                "yt-dlp-update",
                YtDlpUpdateEvent {
                    status: "failed".to_string(),
                    stdout: "".to_string(),
                    stderr: format!("yt-dlpの更新に失敗しました: {}", err),
                },
            );
            return;
        }
    };

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let combined = format!("{}\n{}", stdout, stderr).to_lowercase();
    if output.status.success() {
        if combined.contains("up to date")
            || combined.contains("up-to-date")
            || combined.contains("already up to date")
            || combined.contains("is up to date")
        {
            let _ = app.emit(
                "yt-dlp-update",
                YtDlpUpdateEvent {
                    status: "up-to-date".to_string(),
                    stdout,
                    stderr,
                },
            );
            return;
        }
        let _ = app.emit(
            "yt-dlp-update",
            YtDlpUpdateEvent {
                status: "updated".to_string(),
                stdout,
                stderr,
            },
        );
    } else {
        let _ = app.emit(
            "yt-dlp-update",
            YtDlpUpdateEvent {
                status: "failed".to_string(),
                stdout,
                stderr,
            },
        );
    }
}

#[tauri::command]
fn update_yt_dlp(app: AppHandle) -> Result<(), String> {
    let app_handle = app.clone();
    std::thread::spawn(move || {
        let persisted = load_state(app_handle.clone()).ok();
        let yt_dlp_override = persisted.and_then(|state| state.yt_dlp_path);
        let yt_dlp = resolve_override(yt_dlp_override).unwrap_or_else(resolve_yt_dlp);
        update_yt_dlp_if_available(&app_handle, yt_dlp);
    });
    Ok(())
}

fn resolve_yt_dlp() -> String {
    if let Ok(explicit) = env::var("YTDLP_PATH") {
        if Path::new(&explicit).exists() {
            return explicit;
        }
    }

    if cfg!(windows) {
        if let Ok(manifest_dir) = env::var("CARGO_MANIFEST_DIR") {
            let manifest_path = PathBuf::from(&manifest_dir);
            let candidates = [
                manifest_path.join("yt-dlp.exe"),
                manifest_path
                    .parent()
                    .map(|p| p.join("yt-dlp.exe"))
                    .unwrap_or_else(|| manifest_path.join("yt-dlp.exe")),
            ];
            for candidate in candidates {
                if candidate.exists() {
                    return candidate.to_string_lossy().to_string();
                }
            }
        }

        if let Ok(exe_path) = env::current_exe() {
            if let Some(parent) = exe_path.parent() {
                let candidate = parent.join("yt-dlp.exe");
                if candidate.exists() {
                    return candidate.to_string_lossy().to_string();
                }
            }
        }

        if let Ok(local_app_data) = env::var("LOCALAPPDATA") {
            let candidates = [
                PathBuf::from(&local_app_data)
                    .join("Programs")
                    .join("yt-dlp")
                    .join("yt-dlp.exe"),
                PathBuf::from(&local_app_data)
                    .join("yt-dlp")
                    .join("yt-dlp.exe"),
            ];
            for candidate in candidates {
                if candidate.exists() {
                    return candidate.to_string_lossy().to_string();
                }
            }
        }

        if let Ok(profile) = env::var("USERPROFILE") {
            let candidates = [
                PathBuf::from(&profile)
                    .join("AppData")
                    .join("Local")
                    .join("Programs")
                    .join("yt-dlp")
                    .join("yt-dlp.exe"),
                PathBuf::from(&profile).join("bin").join("yt-dlp.exe"),
                PathBuf::from(&profile)
                    .join(".local")
                    .join("bin")
                    .join("yt-dlp.exe"),
            ];
            for candidate in candidates {
                if candidate.exists() {
                    return candidate.to_string_lossy().to_string();
                }
            }
        }

        return "yt-dlp.exe".to_string();
    }

    if let Ok(manifest_dir) = env::var("CARGO_MANIFEST_DIR") {
        let manifest_path = PathBuf::from(&manifest_dir);
        let candidates = [
            manifest_path.join("yt-dlp"),
            manifest_path
                .parent()
                .map(|p| p.join("yt-dlp"))
                .unwrap_or_else(|| manifest_path.join("yt-dlp")),
        ];
        for candidate in candidates {
            if candidate.exists() {
                return candidate.to_string_lossy().to_string();
            }
        }
    }

    if let Ok(home) = env::var("HOME") {
        let candidate = format!("{}/.local/bin/yt-dlp", home);
        if Path::new(&candidate).exists() {
            return candidate;
        }
    }
    "yt-dlp".to_string()
}

fn resolve_ffmpeg() -> String {
    if cfg!(windows) {
        if let Ok(manifest_dir) = env::var("CARGO_MANIFEST_DIR") {
            let manifest_path = PathBuf::from(&manifest_dir);
            let candidates = [
                manifest_path.join("ffmpeg.exe"),
                manifest_path
                    .parent()
                    .map(|p| p.join("ffmpeg.exe"))
                    .unwrap_or_else(|| manifest_path.join("ffmpeg.exe")),
                manifest_path.join("ffmpeg").join("bin").join("ffmpeg.exe"),
            ];
            for candidate in candidates {
                if candidate.exists() {
                    return candidate.to_string_lossy().to_string();
                }
            }
        }

        if let Ok(exe_path) = env::current_exe() {
            if let Some(parent) = exe_path.parent() {
                let candidates = [
                    parent.join("ffmpeg.exe"),
                    parent.join("ffmpeg").join("bin").join("ffmpeg.exe"),
                ];
                for candidate in candidates {
                    if candidate.exists() {
                        return candidate.to_string_lossy().to_string();
                    }
                }
            }
        }

        if let Ok(local_app_data) = env::var("LOCALAPPDATA") {
            let candidates = [
                PathBuf::from(&local_app_data)
                    .join("Programs")
                    .join("ffmpeg")
                    .join("bin")
                    .join("ffmpeg.exe"),
                PathBuf::from(&local_app_data)
                    .join("ffmpeg")
                    .join("bin")
                    .join("ffmpeg.exe"),
            ];
            for candidate in candidates {
                if candidate.exists() {
                    return candidate.to_string_lossy().to_string();
                }
            }
        }

        if let Ok(profile) = env::var("USERPROFILE") {
            let candidates = [
                PathBuf::from(&profile)
                    .join("AppData")
                    .join("Local")
                    .join("Programs")
                    .join("ffmpeg")
                    .join("bin")
                    .join("ffmpeg.exe"),
                PathBuf::from(&profile)
                    .join("bin")
                    .join("ffmpeg.exe"),
                PathBuf::from(&profile)
                    .join(".local")
                    .join("bin")
                    .join("ffmpeg.exe"),
            ];
            for candidate in candidates {
                if candidate.exists() {
                    return candidate.to_string_lossy().to_string();
                }
            }
        }

        return "ffmpeg.exe".to_string();
    }

    if let Ok(home) = env::var("HOME") {
        let candidate = format!("{}/.local/bin/ffmpeg", home);
        if Path::new(&candidate).exists() {
            return candidate;
        }
    }
    "ffmpeg".to_string()
}

fn resolve_ffprobe() -> String {
    if cfg!(windows) {
        if let Ok(manifest_dir) = env::var("CARGO_MANIFEST_DIR") {
            let manifest_path = PathBuf::from(&manifest_dir);
            let candidates = [
                manifest_path.join("ffprobe.exe"),
                manifest_path
                    .parent()
                    .map(|p| p.join("ffprobe.exe"))
                    .unwrap_or_else(|| manifest_path.join("ffprobe.exe")),
                manifest_path.join("ffmpeg").join("bin").join("ffprobe.exe"),
            ];
            for candidate in candidates {
                if candidate.exists() {
                    return candidate.to_string_lossy().to_string();
                }
            }
        }

        if let Ok(exe_path) = env::current_exe() {
            if let Some(parent) = exe_path.parent() {
                let candidates = [
                    parent.join("ffprobe.exe"),
                    parent.join("ffmpeg").join("bin").join("ffprobe.exe"),
                ];
                for candidate in candidates {
                    if candidate.exists() {
                        return candidate.to_string_lossy().to_string();
                    }
                }
            }
        }

        if let Ok(local_app_data) = env::var("LOCALAPPDATA") {
            let candidates = [
                PathBuf::from(&local_app_data)
                    .join("Programs")
                    .join("ffmpeg")
                    .join("bin")
                    .join("ffprobe.exe"),
                PathBuf::from(&local_app_data)
                    .join("ffmpeg")
                    .join("bin")
                    .join("ffprobe.exe"),
            ];
            for candidate in candidates {
                if candidate.exists() {
                    return candidate.to_string_lossy().to_string();
                }
            }
        }

        if let Ok(profile) = env::var("USERPROFILE") {
            let candidates = [
                PathBuf::from(&profile)
                    .join("AppData")
                    .join("Local")
                    .join("Programs")
                    .join("ffmpeg")
                    .join("bin")
                    .join("ffprobe.exe"),
                PathBuf::from(&profile)
                    .join("bin")
                    .join("ffprobe.exe"),
                PathBuf::from(&profile)
                    .join(".local")
                    .join("bin")
                    .join("ffprobe.exe"),
            ];
            for candidate in candidates {
                if candidate.exists() {
                    return candidate.to_string_lossy().to_string();
                }
            }
        }

        return "ffprobe.exe".to_string();
    }

    if let Ok(home) = env::var("HOME") {
        let candidate = format!("{}/.local/bin/ffprobe", home);
        if Path::new(&candidate).exists() {
            return candidate;
        }
    }
    "ffprobe".to_string()
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(DownloadProcessState::default())
        .manage(WindowSizeState::default())
        .invoke_handler(tauri::generate_handler![
            start_download,
            stop_download,
            start_comments_download,
            start_metadata_download,
            list_channel_videos,
            get_channel_metadata,
            get_video_metadata,
            get_comments,
            resolve_video_file,
            video_file_exists,
            comments_file_exists,
            verify_local_files,
            info_json_exists,
            get_metadata_index,
            get_local_metadata_by_ids,
            probe_media,
            load_state,
            save_state,
            export_state,
            import_state,
            resolve_thumbnail_path,
            save_thumbnail,
            update_yt_dlp
        ])
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let screen_size = if let Ok(Some(monitor)) = window.current_monitor() {
                    let size = monitor.size();
                    Some((size.width as u32, size.height as u32))
                } else {
                    None
                };

                let (mut min_width, mut min_height) = (WINDOW_MIN_WIDTH, WINDOW_MIN_HEIGHT);
                if let Some((screen_width, screen_height)) = screen_size {
                    min_width = min_width.min(screen_width);
                    min_height = min_height.min(screen_height);
                }

                let default_size = if let Some((screen_width, screen_height)) = screen_size {
                    if screen_width >= 1920 && screen_height >= 1080 {
                        (1920u32, 1080u32)
                    } else {
                        (1280u32, 720u32)
                    }
                } else {
                    (1280u32, 720u32)
                };

                let saved_config = read_window_size(&app.handle());
                let saved_size = saved_config.map(|s| (s.width, s.height));

                let (mut window_width, mut window_height) = saved_size.unwrap_or(default_size);
                window_width = window_width.max(min_width);
                window_height = window_height.max(min_height);
                if let Some((screen_width, screen_height)) = screen_size {
                    window_width = window_width.min(screen_width);
                    window_height = window_height.min(screen_height);
                }

                let _ = window.set_min_size(Some(tauri::LogicalSize {
                    width: min_width as f64,
                    height: min_height as f64,
                }));

                let _ = window.set_size(tauri::LogicalSize {
                    width: window_width as f64,
                    height: window_height as f64,
                });

                if let Some(config) = saved_config {
                    if let (Some(x), Some(y)) = (config.x, config.y) {
                        let _ = window.set_position(tauri::LogicalPosition {
                            x: x as f64,
                            y: y as f64,
                        });
                    }
                }

                #[cfg(debug_assertions)]
                {
                    window.open_devtools();
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::Resized(size) = event {
                if size.width == 0 || size.height == 0 {
                    return;
                }

                let width = size.width as u32;
                let height = size.height as u32;
                let state = window.state::<WindowSizeState>();
                let mut last_saved = state.last_saved.lock().unwrap();
                if let Some((last_w, last_h)) = *last_saved {
                    if last_w == width && last_h == height {
                        return;
                    }
                }
                *last_saved = Some((width, height));

                let position = window.outer_position().ok();
                let config = WindowSizeConfig {
                    width,
                    height,
                    x: position.map(|p| p.x),
                    y: position.map(|p| p.y),
                };
                let _ = write_window_size(&window.app_handle(), config);
            }

            if let WindowEvent::Moved(position) = event {
                let x = position.x;
                let y = position.y;
                let state = window.state::<WindowSizeState>();
                let mut last_position = state.last_position.lock().unwrap();
                if let Some((last_x, last_y)) = *last_position {
                    if last_x == x && last_y == y {
                        return;
                    }
                }
                *last_position = Some((x, y));

                if let Ok(size) = window.outer_size() {
                    let config = WindowSizeConfig {
                        width: size.width as u32,
                        height: size.height as u32,
                        x: Some(x),
                        y: Some(y),
                    };
                    let _ = write_window_size(&window.app_handle(), config);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
