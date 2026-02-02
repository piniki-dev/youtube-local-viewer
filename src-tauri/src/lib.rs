use serde::{Deserialize, Serialize};
use std::env;
use std::io::{BufRead, BufReader};
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::SystemTime;
use tauri::{AppHandle, Emitter, Manager};
use std::{fs, path::PathBuf};

#[derive(Clone, Serialize)]
struct DownloadFinished {
    id: String,
    success: bool,
    stdout: String,
    stderr: String,
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

#[derive(Clone, Serialize, Deserialize)]
struct PersistedState {
    videos: Vec<serde_json::Value>,
    download_dir: Option<String>,
    cookies_file: Option<String>,
    remote_components: Option<String>,
    yt_dlp_path: Option<String>,
    ffmpeg_path: Option<String>,
    ffprobe_path: Option<String>,
}

#[tauri::command]
fn start_download(
    app: AppHandle,
    id: String,
    url: String,
    output_dir: String,
    cookies_file: Option<String>,
    remote_components: Option<String>,
    yt_dlp_path: Option<String>,
    ffmpeg_path: Option<String>,
) -> Result<(), String> {
    let output_path = format!("{}/%(title)s [%(id)s].%(ext)s", output_dir);
    let yt_dlp = resolve_override(yt_dlp_path).unwrap_or_else(resolve_yt_dlp);
    let ffmpeg_location = resolve_override(ffmpeg_path);

    std::thread::spawn(move || {
        let mut command = Command::new(yt_dlp);
        command
            .arg("--no-playlist")
            .arg("--newline")
            .arg("--progress")
            .arg("-f")
            .arg("bestvideo[ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]/best[ext=mp4][vcodec^=avc1]")
            .arg("--merge-output-format")
            .arg("mp4")
            .arg("-o")
            .arg(output_path);
        if let Some(location) = ffmpeg_location {
            command.arg("--ffmpeg-location").arg(location);
        }
        if let Some(path) = cookies_file {
            if !path.trim().is_empty() {
                command.arg("--cookies").arg(path);
            }
        }
        if let Some(remote) = remote_components {
            if !remote.trim().is_empty() {
                command.arg("--remote-components").arg(remote);
            }
        }
        command.arg(&url).stdout(Stdio::piped()).stderr(Stdio::piped());

        let mut child = match command.spawn() {
            Ok(child) => child,
            Err(err) => {
                let _ = app.emit(
                    "download-finished",
                    DownloadFinished {
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
            std::thread::spawn(move || {
                let reader = BufReader::new(stdout);
                for line in reader.lines().flatten() {
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

        if let Some(stderr) = child.stderr.take() {
            let app_clone = app.clone();
            let id_clone = id.clone();
            let stderr_acc_clone = stderr_acc.clone();
            std::thread::spawn(move || {
                let reader = BufReader::new(stderr);
                for line in reader.lines().flatten() {
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

        let output = match child.wait() {
            Ok(status) => status,
            Err(err) => {
                let _ = app.emit(
                    "download-finished",
                    DownloadFinished {
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

        let _ = app.emit(
            "download-finished",
            DownloadFinished {
                id,
                success: output.success(),
                stdout,
                stderr,
            },
        );
    });

    Ok(())
}

#[tauri::command]
fn start_comments_download(
    app: AppHandle,
    id: String,
    url: String,
    output_dir: String,
    cookies_file: Option<String>,
    remote_components: Option<String>,
    yt_dlp_path: Option<String>,
    ffmpeg_path: Option<String>,
) -> Result<(), String> {
    let output_path = format!("{}/%(title)s [%(id)s].%(ext)s", output_dir);
    let yt_dlp = resolve_override(yt_dlp_path).unwrap_or_else(resolve_yt_dlp);
    let ffmpeg_location = resolve_override(ffmpeg_path);

    std::thread::spawn(move || {
        let mut command = Command::new(yt_dlp);
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
            .arg(output_path);
        if let Some(location) = ffmpeg_location {
            command.arg("--ffmpeg-location").arg(location);
        }
        if let Some(path) = cookies_file {
            if !path.trim().is_empty() {
                command.arg("--cookies").arg(path);
            }
        }
        if let Some(remote) = remote_components {
            if !remote.trim().is_empty() {
                command.arg("--remote-components").arg(remote);
            }
        }
        command.arg(&url).stdout(Stdio::piped()).stderr(Stdio::piped());

        let mut child = match command.spawn() {
            Ok(child) => child,
            Err(err) => {
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
            std::thread::spawn(move || {
                let reader = BufReader::new(stdout);
                for line in reader.lines().flatten() {
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
            std::thread::spawn(move || {
                let reader = BufReader::new(stderr);
                for line in reader.lines().flatten() {
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

        let _ = app.emit(
            "comments-finished",
            CommentsFinished {
                id,
                success: output.success(),
                stdout,
                stderr,
            },
        );
    });

    Ok(())
}

#[tauri::command]
fn get_comments(id: String, output_dir: String) -> Result<Vec<CommentItem>, String> {
    let dir = PathBuf::from(output_dir);
    let file_path = find_comments_file(&dir, &id)
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
    let dir = PathBuf::from(output_dir);
    if !dir.exists() {
        return Ok(None);
    }

    let id_lower = id.to_lowercase();
    let title_trimmed = title.trim().to_string();
    let title_lower = title_trimmed.to_lowercase();
    let entries = fs::read_dir(&dir).map_err(|e| format!("保存先フォルダを読み込めません: {}", e))?;

    let mut info_stem: Option<String> = None;
    if let Ok(info_entries) = fs::read_dir(&dir) {
        for entry in info_entries.flatten() {
            let path = entry.path();
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
    }

    let mut all_candidates: Vec<(PathBuf, SystemTime)> = Vec::new();
    let mut id_matches: Vec<(PathBuf, SystemTime)> = Vec::new();
    let mut exact_title_matches: Vec<(PathBuf, SystemTime)> = Vec::new();
    let mut partial_title_matches: Vec<(PathBuf, SystemTime)> = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();
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
    let dir = PathBuf::from(output_dir);
    if !dir.exists() {
        return Ok(false);
    }
    Ok(find_comments_file(&dir, &id).is_some())
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
    let base = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("保存先ディレクトリの取得に失敗しました: {}", e))?;
    let file_path = base.join("ytlv_state.json");
    if !file_path.exists() {
        return Ok(PersistedState {
            videos: Vec::new(),
            download_dir: None,
            cookies_file: None,
            remote_components: None,
            yt_dlp_path: None,
            ffmpeg_path: None,
            ffprobe_path: None,
        });
    }
    let content = fs::read_to_string(&file_path)
        .map_err(|e| format!("状態ファイルの読み込みに失敗しました: {}", e))?;
    let state = serde_json::from_str::<PersistedState>(&content)
        .map_err(|e| format!("状態ファイルの解析に失敗しました: {}", e))?;
    Ok(state)
}

#[tauri::command]
fn save_state(app: AppHandle, state: PersistedState) -> Result<(), String> {
    let base = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("保存先ディレクトリの取得に失敗しました: {}", e))?;
    fs::create_dir_all(&base)
        .map_err(|e| format!("保存先ディレクトリの作成に失敗しました: {}", e))?;
    let file_path = base.join("ytlv_state.json");
    let content = serde_json::to_string_pretty(&state)
        .map_err(|e| format!("状態データの整形に失敗しました: {}", e))?;
    fs::write(&file_path, content)
        .map_err(|e| format!("状態ファイルの保存に失敗しました: {}", e))?;
    Ok(())
}

fn find_comments_file(dir: &Path, id: &str) -> Option<PathBuf> {
    let entries = fs::read_dir(dir).ok()?;
    let mut candidates: Vec<PathBuf> = Vec::new();
    let mut info_match: Option<PathBuf> = None;
    let mut name_live_match: Option<PathBuf> = None;
    let mut name_comments_match: Option<PathBuf> = None;
    let mut name_info_match: Option<PathBuf> = None;
    for entry in entries.flatten() {
        let path = entry.path();
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

fn parse_comments_array(content: &str) -> Vec<CommentItem> {
    let mut out = Vec::new();
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(content) {
        out.extend(parse_comments_value(&value));
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

fn resolve_ffprobe() -> String {
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
        .invoke_handler(tauri::generate_handler![
            start_download,
            start_comments_download,
            get_comments,
            resolve_video_file,
            video_file_exists,
            comments_file_exists,
            probe_media,
            load_state,
            save_state
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
