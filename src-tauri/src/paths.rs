use std::{fs, io::Write, path::{Path, PathBuf}};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};
use crate::{SETTINGS_DIR_NAME, SETTINGS_FILE_NAME, INDEX_DIR_NAME, VIDEOS_FILE_NAME,
            LIBRARY_VIDEOS_DIR_NAME, LIBRARY_COMMENTS_DIR_NAME, LIBRARY_METADATA_DIR_NAME, LIBRARY_THUMBNAILS_DIR_NAME};

pub(crate) fn resolve_library_root_dir(output_dir: &str) -> PathBuf {
    let base = PathBuf::from(output_dir);
    let last = base
        .file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.to_lowercase());
    let is_child = matches!(
        last.as_deref(),
        Some("videos") | Some("comments") | Some("metadata") | Some("contents") | Some("thumbnails")
    );
    if is_child {
        return base.parent().unwrap_or(&base).to_path_buf();
    }
    base
}

pub(crate) fn normalized_library_root(output_dir: &str) -> String {
    resolve_library_root_dir(output_dir).to_string_lossy().to_string()
}

pub(crate) fn library_videos_dir(output_dir: &str) -> PathBuf {
    resolve_library_root_dir(output_dir).join(LIBRARY_VIDEOS_DIR_NAME)
}

pub(crate) fn library_comments_dir(output_dir: &str) -> PathBuf {
    resolve_library_root_dir(output_dir).join(LIBRARY_COMMENTS_DIR_NAME)
}

pub(crate) fn library_metadata_dir(output_dir: &str) -> PathBuf {
    resolve_library_root_dir(output_dir).join(LIBRARY_METADATA_DIR_NAME)
}

pub(crate) fn library_thumbnails_dir(output_dir: &str) -> PathBuf {
    resolve_library_root_dir(output_dir).join(LIBRARY_THUMBNAILS_DIR_NAME)
}

pub(crate) fn sanitize_filename_component(value: &str) -> String {
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

pub(crate) fn sanitize_path_component(value: &str, max_len: usize) -> String {
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

pub(crate) fn collect_files_recursive(dir: &Path) -> Vec<PathBuf> {
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

pub(crate) fn settings_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("保存先ディレクトリの取得に失敗しました: {}", e))?;
    Ok(dir.join(SETTINGS_DIR_NAME).join(SETTINGS_FILE_NAME))
}

pub(crate) fn videos_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("保存先ディレクトリの取得に失敗しました: {}", e))?;
    Ok(dir.join(INDEX_DIR_NAME).join(VIDEOS_FILE_NAME))
}

pub(crate) fn write_error_log(
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

/// Write data to a file atomically: write to a .tmp sibling, then rename.
/// Prevents data corruption if the app crashes mid-write.
pub(crate) fn atomic_write(path: &Path, data: &[u8]) -> Result<(), String> {
    let tmp_path = path.with_extension("tmp");
    let mut file = fs::File::create(&tmp_path)
        .map_err(|e| format!("一時ファイルの作成に失敗しました: {}", e))?;
    file.write_all(data)
        .map_err(|e| format!("一時ファイルへの書き込みに失敗しました: {}", e))?;
    file.sync_all()
        .map_err(|e| format!("一時ファイルの同期に失敗しました: {}", e))?;
    fs::rename(&tmp_path, path)
        .map_err(|e| format!("ファイルの置き換えに失敗しました: {}", e))?;
    Ok(())
}
