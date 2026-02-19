use std::env;
use std::process::{Command, Stdio};
use std::path::{Path, PathBuf};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use tauri::{AppHandle, Emitter};
use crate::models::{ToolingCheckResult, ToolingCheckStatus};
use crate::state::load_state;

pub(crate) fn apply_cookies_args(
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

pub(crate) fn resolve_override(value: Option<String>) -> Option<String> {
    value.and_then(|path| {
        let trimmed = path.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    })
}

pub(crate) fn resolve_yt_dlp() -> String {
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

pub(crate) fn resolve_ffmpeg() -> String {
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

pub(crate) fn resolve_ffprobe() -> String {
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

pub(crate) fn can_run_tool(tool: &str, args: &[&str]) -> bool {
    let mut command = Command::new(tool);
    #[cfg(windows)]
    command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    command
        .args(args)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

pub(crate) fn can_run_yt_dlp(yt_dlp: &str) -> bool {
    can_run_tool(yt_dlp, &["--version"])
}

pub(crate) fn can_run_ffmpeg(ffmpeg: &str) -> bool {
    can_run_tool(ffmpeg, &["-version"])
}

pub(crate) fn can_run_ffprobe(ffprobe: &str) -> bool {
    can_run_tool(ffprobe, &["-version"])
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct YtDlpUpdateEvent {
    status: String,
    stdout: String,
    stderr: String,
}

pub(crate) fn update_yt_dlp_if_available(app: &AppHandle, yt_dlp: String) {
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
    let mut command = Command::new(&yt_dlp);
    #[cfg(windows)]
    command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    let output = command.arg("-U").output();
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
pub fn check_tooling(
    yt_dlp_path: Option<String>,
    ffmpeg_path: Option<String>,
    ffprobe_path: Option<String>,
) -> Result<ToolingCheckResult, String> {
    let yt_dlp = resolve_override(yt_dlp_path).unwrap_or_else(resolve_yt_dlp);
    let ffmpeg = resolve_override(ffmpeg_path).unwrap_or_else(resolve_ffmpeg);
    let ffprobe = resolve_override(ffprobe_path).unwrap_or_else(resolve_ffprobe);

    Ok(ToolingCheckResult {
        yt_dlp: ToolingCheckStatus {
            ok: can_run_yt_dlp(&yt_dlp),
            path: yt_dlp,
        },
        ffmpeg: ToolingCheckStatus {
            ok: can_run_ffmpeg(&ffmpeg),
            path: ffmpeg,
        },
        ffprobe: ToolingCheckStatus {
            ok: can_run_ffprobe(&ffprobe),
            path: ffprobe,
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    // =========================================================
    // resolve_override
    // =========================================================

    #[test]
    fn resolve_override_some_path() {
        assert_eq!(
            resolve_override(Some("/usr/bin/yt-dlp".to_string())),
            Some("/usr/bin/yt-dlp".to_string())
        );
    }

    #[test]
    fn resolve_override_none() {
        assert_eq!(resolve_override(None), None);
    }

    #[test]
    fn resolve_override_empty_string() {
        assert_eq!(resolve_override(Some("".to_string())), None);
    }

    #[test]
    fn resolve_override_whitespace_only() {
        assert_eq!(resolve_override(Some("   ".to_string())), None);
    }

    #[test]
    fn resolve_override_trimmed() {
        assert_eq!(
            resolve_override(Some("  /path/bin  ".to_string())),
            Some("/path/bin".to_string())
        );
    }

    // =========================================================
    // apply_cookies_args
    // =========================================================

    #[test]
    fn apply_cookies_browser_mode() {
        let mut cmd = Command::new("echo");
        apply_cookies_args(&mut cmd, Some("browser"), None, Some("chrome"));
        let args: Vec<_> = cmd.get_args().collect();
        assert!(args.contains(&&std::ffi::OsStr::new("--cookies-from-browser")));
        assert!(args.contains(&&std::ffi::OsStr::new("chrome")));
    }

    #[test]
    fn apply_cookies_file_mode() {
        let mut cmd = Command::new("echo");
        apply_cookies_args(&mut cmd, Some("file"), Some("/cookies.txt"), None);
        let args: Vec<_> = cmd.get_args().collect();
        assert!(args.contains(&&std::ffi::OsStr::new("--cookies")));
        assert!(args.contains(&&std::ffi::OsStr::new("/cookies.txt")));
    }

    #[test]
    fn apply_cookies_implicit_file() {
        let mut cmd = Command::new("echo");
        apply_cookies_args(&mut cmd, Some(""), Some("/cookies.txt"), None);
        let args: Vec<_> = cmd.get_args().collect();
        assert!(args.contains(&&std::ffi::OsStr::new("--cookies")));
    }

    #[test]
    fn apply_cookies_no_source_no_file() {
        let mut cmd = Command::new("echo");
        apply_cookies_args(&mut cmd, None, None, None);
        let args: Vec<_> = cmd.get_args().collect();
        assert!(args.is_empty());
    }

    #[test]
    fn apply_cookies_browser_empty_name() {
        let mut cmd = Command::new("echo");
        apply_cookies_args(&mut cmd, Some("browser"), Some("/file.txt"), Some(""));
        let args: Vec<_> = cmd.get_args().collect();
        // Should NOT add --cookies-from-browser because browser name is empty
        assert!(!args.contains(&&std::ffi::OsStr::new("--cookies-from-browser")));
    }
}

#[tauri::command]
pub fn update_yt_dlp(app: AppHandle) -> Result<(), String> {
    let app_handle = app.clone();
    std::thread::spawn(move || {
        let persisted = load_state(app_handle.clone()).ok();
        let yt_dlp_override = persisted.and_then(|state| state.yt_dlp_path);
        let yt_dlp = resolve_override(yt_dlp_override).unwrap_or_else(resolve_yt_dlp);
        update_yt_dlp_if_available(&app_handle, yt_dlp);
    });
    Ok(())
}
