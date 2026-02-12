use std::io::{BufRead, BufReader};
use std::{fs, path::{Path, PathBuf}};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use crate::models::{CommentItem, CommentRun, CommentEmoji, CommentsFinished};
use crate::paths::{library_metadata_dir, library_comments_dir, collect_files_recursive, write_error_log};
use crate::metadata::parse_video_metadata_value;
use crate::tooling::{apply_cookies_args, resolve_yt_dlp, resolve_override, resolve_ffmpeg};
use crate::files::{find_info_json, is_live_chat_file, comments_file_exists};
use crate::{YTDLP_NONE_DECODE_ERROR, YTDLP_NONE_DECODE_RETRY_MAX, YTDLP_NONE_DECODE_RETRY_SLEEP_MS,
            YTDLP_TITLE_WARNING, YTDLP_WARNING_RETRY_MAX, YTDLP_WARNING_RETRY_SLEEP_MS};

pub(crate) fn find_comments_file(dir: &Path, id: &str) -> Option<PathBuf> {
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
        if let Some(base) = crate::files::info_base_name(&info_path) {
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
    let author_photo_url = renderer
        .get("authorPhoto")
        .and_then(|v| v.get("thumbnails"))
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.last().or_else(|| arr.first()))
        .and_then(|v| v.get("url"))
        .and_then(|v| v.as_str())
        .map(|v| v.to_string());
    let runs = renderer
        .get("message")
        .and_then(extract_runs)
        .or_else(|| renderer.get("headerSubtext").and_then(extract_runs))
        .or_else(|| renderer.get("subtext").and_then(extract_runs));
    let text = renderer
        .get("message")
        .and_then(extract_text)
        .or_else(|| renderer.get("headerSubtext").and_then(extract_text))
        .or_else(|| renderer.get("subtext").and_then(extract_text))
        .unwrap_or_default();
    if text.trim().is_empty() && runs.is_none() {
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
        author_photo_url,
        text,
        runs,
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
            if let Some(emoji) = run.get("emoji") {
                if let Some(emoji_id) = emoji.get("emojiId").and_then(|v| v.as_str()) {
                    out.push_str(emoji_id);
                    continue;
                }
                if let Some(label) = emoji
                    .get("image")
                    .and_then(|v| v.get("accessibility"))
                    .and_then(|v| v.get("accessibilityData"))
                    .and_then(|v| v.get("label"))
                    .and_then(|v| v.as_str())
                {
                    out.push_str(label);
                    continue;
                }
                if let Some(shortcut) = emoji
                    .get("shortcuts")
                    .and_then(|v| v.as_array())
                    .and_then(|arr| arr.first())
                    .and_then(|v| v.as_str())
                {
                    out.push_str(shortcut);
                }
            }
        }
        if !out.is_empty() {
            return Some(out);
        }
    }
    None
}

fn extract_runs(value: &serde_json::Value) -> Option<Vec<CommentRun>> {
    let runs = value.get("runs").and_then(|v| v.as_array())?;
    let mut out = Vec::new();
    for run in runs {
        if let Some(text) = run.get("text").and_then(|v| v.as_str()) {
            out.push(CommentRun {
                text: Some(text.to_string()),
                emoji: None,
            });
            continue;
        }
        if let Some(emoji) = run.get("emoji") {
            let id = emoji
                .get("emojiId")
                .and_then(|v| v.as_str())
                .map(|v| v.to_string());
            let label = emoji
                .get("image")
                .and_then(|v| v.get("accessibility"))
                .and_then(|v| v.get("accessibilityData"))
                .and_then(|v| v.get("label"))
                .and_then(|v| v.as_str())
                .map(|v| v.to_string());
            let url = emoji
                .get("image")
                .and_then(|v| v.get("thumbnails"))
                .and_then(|v| v.as_array())
                .and_then(|arr| arr.last().or_else(|| arr.first()))
                .and_then(|v| v.get("url"))
                .and_then(|v| v.as_str())
                .map(|v| v.to_string());
            let is_custom = emoji.get("isCustomEmoji").and_then(|v| v.as_bool());
            if id.is_none() && label.is_none() && url.is_none() {
                continue;
            }
            out.push(CommentRun {
                text: None,
                emoji: Some(CommentEmoji {
                    id,
                    url,
                    label,
                    is_custom,
                }),
            });
        }
    }
    if out.is_empty() {
        None
    } else {
        Some(out)
    }
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
        author_photo_url: None,
        text,
        runs: None,
        like_count,
        published_at,
        offset_ms: None,
    })
}

#[tauri::command]
pub fn start_comments_download(
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

        let mut metadata: Option<crate::models::VideoMetadata> = None;
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
            "comments-finished",
            CommentsFinished {
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
pub fn get_comments(
    id: String,
    output_dir: String,
    limit: Option<usize>,
) -> Result<Vec<CommentItem>, String> {
    let dir = library_metadata_dir(&output_dir);
    let file_path = find_comments_file(&dir, &id)
        .or_else(|| {
            let fallback_dir = library_comments_dir(&output_dir);
            find_comments_file(&fallback_dir, &id)
        })
        .ok_or_else(|| "コメントファイルが見つかりません。".to_string())?;
    let content = fs::read_to_string(&file_path)
        .map_err(|e| format!("コメントファイルの読み込みに失敗しました: {}", e))?;

    let mut items = if is_live_chat_file(&file_path) {
        parse_live_chat_content(&content)
    } else if let Ok(value) = serde_json::from_str::<serde_json::Value>(&content) {
        parse_comments_value(&value)
    } else {
        parse_comments_lines(&content)
    };

    if let Some(limit) = limit {
        if items.len() > limit {
            items.truncate(limit);
        }
    }

    Ok(items)
}
