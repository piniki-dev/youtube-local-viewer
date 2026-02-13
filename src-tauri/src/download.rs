use std::io::{BufRead, BufReader};
use std::fs;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};
use crate::models::{DownloadProcessState, DownloadFinished};
use crate::paths::{library_videos_dir, write_error_log};
use crate::tooling::{apply_cookies_args, resolve_yt_dlp, resolve_override, resolve_ffmpeg};
use crate::{YTDLP_TITLE_WARNING, YTDLP_WARNING_RETRY_MAX, YTDLP_WARNING_RETRY_SLEEP_MS};

fn quality_to_format(quality: Option<&str>) -> String {
    match quality {
        Some("1080p") => "bestvideo[height<=1080][ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4][vcodec^=avc1]".to_string(),
        Some("720p")  => "bestvideo[height<=720][ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]/best[height<=720][ext=mp4][vcodec^=avc1]".to_string(),
        Some("480p")  => "bestvideo[height<=480][ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]/best[height<=480][ext=mp4][vcodec^=avc1]".to_string(),
        Some("360p")  => "bestvideo[height<=360][ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]/best[height<=360][ext=mp4][vcodec^=avc1]".to_string(),
        Some("audio") => "bestaudio[ext=m4a]/bestaudio".to_string(),
        _ => "bestvideo[ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]/best[ext=mp4][vcodec^=avc1]".to_string(),
    }
}

#[tauri::command]
pub fn start_download(
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
    quality: Option<String>,
    is_live: Option<bool>,
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
    let format_str = quality_to_format(quality.as_deref());
    let state = state.inner().clone();

    std::thread::spawn(move || {
        let mut last_stdout = String::new();
        let mut last_stderr = String::new();
        let mut last_success = false;
        let mut last_cancelled = false;

        for attempt in 1..=YTDLP_WARNING_RETRY_MAX {
            let warning_seen = Arc::new(AtomicBool::new(false));
            let mut command = Command::new(&yt_dlp);
            #[cfg(windows)]
            command.creation_flags(0x08000000); // CREATE_NO_WINDOW
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
                .arg(&format_str)
                .arg("--merge-output-format")
                .arg("mp4")
                .arg("-o")
                .arg(&output_path);
            
            // Live recording mode options
            if is_live.unwrap_or(false) {
                command
                    .arg("--live-from-start")
                    .arg("--wait-for-video")
                    .arg("60");
            }
            
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
pub fn stop_download(state: State<DownloadProcessState>, id: String) -> Result<(), String> {
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
