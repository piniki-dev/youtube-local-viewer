use std::io::{BufRead, BufReader};
use std::fs;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
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
