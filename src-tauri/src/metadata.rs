use std::io::{BufRead, BufReader};
use std::fs;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use crate::models::{VideoMetadata, ChannelVideoItem, MetadataFinished};
use crate::paths::{library_metadata_dir, write_error_log};
use crate::tooling::{apply_cookies_args, resolve_yt_dlp, resolve_override, resolve_ffmpeg};
use crate::files::{find_info_json, comments_file_exists};
use crate::{YTDLP_TITLE_WARNING, YTDLP_WARNING_RETRY_MAX, YTDLP_WARNING_RETRY_SLEEP_MS};

pub(crate) fn parse_video_metadata_value(value: &serde_json::Value) -> VideoMetadata {
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

pub(crate) fn normalize_channel_base_url(url: &str) -> String {
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

pub(crate) fn build_channel_section_urls(base_url: &str) -> Vec<String> {
    vec![
        format!("{}/videos", base_url.trim_end_matches('/')),
        format!("{}/streams", base_url.trim_end_matches('/')),
        format!("{}/live", base_url.trim_end_matches('/')),
        format!("{}/shorts", base_url.trim_end_matches('/')),
    ]
}

pub(crate) fn fetch_channel_section(
    yt_dlp: &str,
    url: &str,
    cookies_file: Option<&String>,
    cookies_source: Option<&str>,
    cookies_browser: Option<&str>,
    remote_components: Option<&String>,
    limit: Option<u32>,
) -> Result<Vec<ChannelVideoItem>, String> {
    let mut command = Command::new(yt_dlp);
    #[cfg(windows)]
    command.creation_flags(0x08000000); // CREATE_NO_WINDOW
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

#[tauri::command]
pub fn start_metadata_download(
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
        let mut live_detected = false;
        let mut upcoming_detected = false;

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
            let live_stream_detected = Arc::new(AtomicBool::new(false));
            let upcoming_stream_detected = Arc::new(AtomicBool::new(false));
            
            // Step 1: Download info.json only (fast, no comments)
            let mut command = Command::new(&yt_dlp);
            #[cfg(windows)]
            command.creation_flags(0x08000000); // CREATE_NO_WINDOW
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
                let live_stream_detected_clone = live_stream_detected.clone();
                let upcoming_stream_detected_clone = upcoming_stream_detected.clone();
                std::thread::spawn(move || {
                    let reader = BufReader::new(stdout);
                    for line in reader.lines().flatten() {
                        if line.contains(YTDLP_TITLE_WARNING) {
                            warning_seen_clone.store(true, Ordering::Relaxed);
                        }
                        // Detect upcoming live event patterns
                        if line.contains("This live event will begin") {
                            upcoming_stream_detected_clone.store(true, Ordering::Relaxed);
                        }
                        // Detect live streaming patterns in stdout
                        if line.contains("live/1") 
                            || line.contains("live_broadcast") 
                            || line.contains("/live_")
                            || line.contains("playlist_type/DVR")
                            || line.starts_with("frame=")
                            || line.contains("Output #0, mpegts,") {
                            live_stream_detected_clone.store(true, Ordering::Relaxed);
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
                let live_stream_detected_clone = live_stream_detected.clone();
                let upcoming_stream_detected_clone = upcoming_stream_detected.clone();
                std::thread::spawn(move || {
                    let reader = BufReader::new(stderr);
                    for line in reader.lines().flatten() {
                        if line.contains(YTDLP_TITLE_WARNING) {
                            warning_seen_clone.store(true, Ordering::Relaxed);
                        }
                        // Detect upcoming live event patterns
                        if line.contains("This live event will begin") {
                            upcoming_stream_detected_clone.store(true, Ordering::Relaxed);
                        }
                        // Detect live streaming patterns
                        if line.contains("live/1") 
                            || line.contains("live_broadcast") 
                            || line.contains("/live_")
                            || line.contains("playlist_type/DVR")
                            || line.starts_with("frame=") {
                            live_stream_detected_clone.store(true, Ordering::Relaxed);
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

            let start_time = std::time::Instant::now();
            let timeout_duration = Duration::from_secs(30); // 30 second timeout for info.json only
            let mut timed_out = false;

            let output = loop {
                // Check timeout
                if start_time.elapsed() > timeout_duration {
                    // Timeout reached, kill process
                    let _ = child.kill();
                    timed_out = true;
                    
                    // Wait for process to finish after killing
                    match child.wait() {
                        Ok(status) => break status,
                        Err(err) => {
                            let _ = write_error_log(
                                &app,
                                "metadata_download",
                                &id,
                                "",
                                &format!("タイムアウト後のプロセス終了に失敗: {}", err),
                            );
                            let _ = app.emit(
                                "metadata-finished",
                                MetadataFinished {
                                    id: id.clone(),
                                    success: false,
                                    stdout: "".to_string(),
                                    stderr: format!("タイムアウト後のプロセス終了に失敗: {}", err),
                                    metadata: None,
                                    has_live_chat: None,
                                },
                            );
                            return;
                        }
                    }
                }
                
                // Check if live stream is detected
                if live_stream_detected.load(Ordering::Relaxed) {
                    // Kill the process immediately
                    let _ = child.kill();
                    live_detected = true;
                    
                    // Wait briefly for process to terminate, but don't block forever
                    let kill_wait_start = std::time::Instant::now();
                    let kill_wait_timeout = Duration::from_secs(2);
                    let mut final_status = None;
                    while kill_wait_start.elapsed() < kill_wait_timeout {
                        match child.try_wait() {
                            Ok(Some(status)) => {
                                final_status = Some(status);
                                break;
                            }
                            Ok(None) => {
                                std::thread::sleep(Duration::from_millis(50));
                            }
                            Err(_) => break,
                        }
                    }
                    
                    // Break with whatever status we have (or force success)
                    break final_status.unwrap_or_else(|| {
                        // Process didn't exit cleanly, but we detected live stream
                        // Create a "success" status since we accomplished our goal
                        #[cfg(unix)]
                        {
                            use std::os::unix::process::ExitStatusExt;
                            std::process::ExitStatus::from_raw(0)
                        }
                        #[cfg(windows)]
                        {
                            use std::os::windows::process::ExitStatusExt;
                            std::process::ExitStatus::from_raw(0)
                        }
                    });
                } else {
                    // Normal exit path - non-blocking check
                    match child.try_wait() {
                        Ok(Some(status)) => break status,
                        Ok(None) => {
                            // Process still running, sleep briefly and check again
                            std::thread::sleep(Duration::from_millis(100));
                        }
                        Err(err) => {
                            let _ = write_error_log(
                                &app,
                                "metadata_download",
                                &id,
                                "",
                                &format!("プロセス待機中にエラー: {}", err),
                            );
                            let _ = app.emit(
                                "metadata-finished",
                                MetadataFinished {
                                    id: id.clone(),
                                    success: false,
                                    stdout: "".to_string(),
                                    stderr: format!("プロセス待機中にエラー: {}", err),
                                    metadata: None,
                                    has_live_chat: None,
                                },
                            );
                            return;
                        }
                    }
                }
            };

            let stdout = stdout_acc.lock().map(|s| s.clone()).unwrap_or_default();
            let stderr = stderr_acc.lock().map(|s| s.clone()).unwrap_or_default();

            last_stdout = stdout;
            last_stderr = stderr;
            last_success = output.success();

            // If timed out during info.json download, treat as error
            if timed_out {
                last_success = false;
                last_stderr = format!("{}\nメタデータ取得がタイムアウトしました (30秒)", last_stderr);
            }

            // If upcoming live event detected (e.g. "This live event will begin in N minutes"),
            // skip metadata fetch and mark as upcoming.
            // Check both the atomic flag AND the stderr text to avoid race conditions
            // where the flag hasn't been set yet when we check it.
            if upcoming_stream_detected.load(Ordering::Relaxed)
                || last_stderr.contains("This live event will begin") {
                upcoming_detected = true;
                let _ = app.emit(
                    "metadata-progress",
                    serde_json::json!({
                        "id": id.clone(),
                        "line": "配信予定の動画を検出しました。メタデータ取得をスキップします。"
                    }),
                );
                break;
            }

            // If live stream detected, exit retry loop immediately
            if live_detected {
                break;
            }

            // Step 2: Check if it's a live stream from info.json (inside retry loop)
            
            if last_success && !live_detected {
                let info_path = find_info_json(&output_dir_path, &id);
                if let Some(ref info_file) = info_path {
                    
                    match fs::read_to_string(&info_file) {
                        Ok(info_data) => {
                            match serde_json::from_str::<serde_json::Value>(&info_data) {
                                Ok(json_value) => {
                                    // Check both is_live (boolean) and live_status/liveStatus (string)
                                    let is_live_bool = json_value.get("is_live").and_then(|v| v.as_bool()).unwrap_or(false);
                                    let live_status_str = json_value.get("live_status")
                                        .or_else(|| json_value.get("liveStatus"))
                                        .and_then(|v| v.as_str());
                                    let is_live_status = live_status_str
                                        .map(|s| s == "is_live" || s == "is_upcoming")
                                        .unwrap_or(false);
                                    
                                    if is_live_bool || is_live_status {
                                        // It's a live stream, mark as detected and skip comments
                                        live_detected = true;
                                        let _ = app.emit(
                                            "metadata-progress",
                                            serde_json::json!({
                                                "id": id.clone(),
                                                "line": format!("ライブ配信を検出しました (is_live: {}, live_status: {:?}). コメント取得をスキップします。", 
                                                    is_live_bool,
                                                    live_status_str)
                                            }),
                                        );
                                    } else {
                                        let _ = app.emit(
                                            "metadata-progress",
                                            serde_json::json!({
                                                "id": id.clone(),
                                                "line": format!("通常動画を確認 (is_live: {}, live_status: {:?}). info.json取得完了。", 
                                                    is_live_bool,
                                                    live_status_str)
                                            }),
                                        );
                                    }
                                    // Exit retry loop immediately after successfully reading info.json
                                    break;
                                }
                                Err(_e) => {
                                    // Failed to parse JSON
                                }
                            }
                        }
                        Err(_e) => {
                            // Failed to read file
                        }
                    }
                } else {
                    // info.json not found
                }
            }

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

        // Step 3: If not live, download comments (after retry loop)
        if last_success && !live_detected {
            let _ = app.emit(
                "metadata-progress",
                serde_json::json!({
                    "id": id.clone(),
                    "line": "コメントをダウンロード中..."
                }),
            );

            let mut comment_command = Command::new(&yt_dlp);
            #[cfg(windows)]
            comment_command.creation_flags(0x08000000); // CREATE_NO_WINDOW
            comment_command
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
                .arg("-o")
                .arg(&output_path);
            if let Some(location) = &ffmpeg_location {
                comment_command.arg("--ffmpeg-location").arg(location);
            }
            apply_cookies_args(
                &mut comment_command,
                cookies_source.as_deref(),
                cookies_file.as_deref(),
                cookies_browser.as_deref(),
            );
            if let Some(remote) = &remote_components {
                if !remote.trim().is_empty() {
                    comment_command.arg("--remote-components").arg(remote);
                }
            }
            comment_command.arg(&url).stdout(Stdio::piped()).stderr(Stdio::piped());

            // Run comment download with timeout and live detection
            if let Ok(mut child) = comment_command.spawn() {
                let _stdout_acc = Arc::new(Mutex::new(String::new()));
                let live_detected_flag = Arc::new(AtomicBool::new(false));

                // Monitor stdout for live patterns
                if let Some(stdout) = child.stdout.take() {
                    let live_flag_clone = live_detected_flag.clone();
                    std::thread::spawn(move || {
                        let reader = BufReader::new(stdout);
                        for line in reader.lines().flatten() {
                            if line.contains("live/1") 
                                || line.contains("live_broadcast") 
                                || line.contains("/live_")
                                || line.contains("playlist_type/DVR")
                                || line.starts_with("frame=")
                                || line.contains("Output #0, mpegts,") {
                                live_flag_clone.store(true, Ordering::Relaxed);
                            }
                        }
                    });
                }

                // Monitor stderr for live patterns
                if let Some(stderr) = child.stderr.take() {
                    let live_flag_clone = live_detected_flag.clone();
                    std::thread::spawn(move || {
                        let reader = BufReader::new(stderr);
                        for line in reader.lines().flatten() {
                            if line.contains("live/1") 
                                || line.contains("live_broadcast") 
                                || line.contains("/live_")
                                || line.contains("playlist_type/DVR") {
                                live_flag_clone.store(true, Ordering::Relaxed);
                            }
                        }
                    });
                }
                
                let start_time = std::time::Instant::now();
                let comment_timeout = Duration::from_secs(120); // 120 second timeout for comments
                
                loop {
                    // Check if live stream detected
                    if live_detected_flag.load(Ordering::Relaxed) {
                        let _ = child.kill();
                        let _ = child.wait();
                        live_detected = true;
                        break;
                    }

                    if start_time.elapsed() > comment_timeout {
                        let _ = child.kill();
                        let _ = child.wait();
                        break;
                    }
                    
                    match child.try_wait() {
                        Ok(Some(_)) => break,
                        Ok(None) => std::thread::sleep(Duration::from_millis(100)),
                        Err(_) => break,
                    }
                }
            }
        }

        if !last_success && !upcoming_detected {
            let _ = write_error_log(&app, "metadata_download", &id, &last_stdout, &last_stderr);
        }

        let mut metadata: Option<VideoMetadata> = None;
        let mut has_live_chat: Option<bool> = None;

        // If upcoming live event detected, create metadata with is_upcoming status
        if upcoming_detected {
            metadata = Some(VideoMetadata {
                id: Some(id.clone()),
                title: None,
                channel: None,
                thumbnail: None,
                url: None,
                webpage_url: None,
                duration_sec: None,
                upload_date: None,
                release_timestamp: None,
                timestamp: None,
                live_status: Some("is_upcoming".to_string()),
                is_live: None,
                was_live: None,
                view_count: None,
                like_count: None,
                comment_count: None,
                tags: None,
                categories: None,
                description: None,
                channel_id: None,
                uploader_id: None,
                channel_url: None,
                uploader_url: None,
                availability: None,
                language: None,
                audio_language: None,
                age_limit: None,
            });
            has_live_chat = None;
        } else if live_detected {
            metadata = Some(VideoMetadata {
                id: Some(id.clone()),
                title: None,
                channel: None,
                thumbnail: None,
                url: None,
                webpage_url: None,
                duration_sec: None,
                upload_date: None,
                release_timestamp: None,
                timestamp: None,
                live_status: Some("is_live".to_string()),
                is_live: Some(true),
                was_live: None,
                view_count: None,
                like_count: None,
                comment_count: None,
                tags: None,
                categories: None,
                description: None,
                channel_id: None,
                uploader_id: None,
                channel_url: None,
                uploader_url: None,
                availability: None,
                language: None,
                audio_language: None,
                age_limit: None,
            });
            has_live_chat = None;
        } else if last_success {
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
                success: upcoming_detected || live_detected || last_success,
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
pub fn get_video_metadata(
    url: String,
    cookies_file: Option<String>,
    cookies_source: Option<String>,
    cookies_browser: Option<String>,
    remote_components: Option<String>,
    yt_dlp_path: Option<String>,
) -> Result<VideoMetadata, String> {
    let yt_dlp = resolve_override(yt_dlp_path).unwrap_or_else(resolve_yt_dlp);
    let mut command = Command::new(yt_dlp);
    #[cfg(windows)]
    command.creation_flags(0x08000000); // CREATE_NO_WINDOW
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
pub fn get_channel_metadata(
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
    #[cfg(windows)]
    command.creation_flags(0x08000000); // CREATE_NO_WINDOW
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
pub fn list_channel_videos(
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
