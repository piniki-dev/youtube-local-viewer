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
    #[allow(unused_mut)]
    let mut dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("保存先ディレクトリの取得に失敗しました: {}", e))?;
    
    // 開発モードでは -dev サフィックスを付与してディレクトリを分離
    #[cfg(debug_assertions)]
    {
        let dir_name = dir
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("config");
        let parent = dir.parent().unwrap_or(dir.as_path());
        dir = parent.join(format!("{}-dev", dir_name));
    }
    
    Ok(dir.join(SETTINGS_DIR_NAME).join(SETTINGS_FILE_NAME))
}

pub(crate) fn videos_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    #[allow(unused_mut)]
    let mut dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("保存先ディレクトリの取得に失敗しました: {}", e))?;
    
    // 開発モードでは -dev サフィックスを付与してディレクトリを分離
    #[cfg(debug_assertions)]
    {
        let dir_name = dir
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("config");
        let parent = dir.parent().unwrap_or(dir.as_path());
        dir = parent.join(format!("{}-dev", dir_name));
    }
    
    Ok(dir.join(INDEX_DIR_NAME).join(VIDEOS_FILE_NAME))
}

pub(crate) fn write_error_log(
    app: &AppHandle,
    kind: &str,
    id: &str,
    stdout: &str,
    stderr: &str,
) -> Result<(), String> {
    #[allow(unused_mut)]
    let mut base = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("保存先ディレクトリの取得に失敗しました: {}", e))?;
    
    // 開発モードでは -dev サフィックスを付与してディレクトリを分離
    #[cfg(debug_assertions)]
    {
        let dir_name = base
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("config");
        let parent = base.parent().unwrap_or(base.as_path());
        base = parent.join(format!("{}-dev", dir_name));
    }
    
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

#[cfg(test)]
mod tests {
    use super::*;

    // =========================================================
    // resolve_library_root_dir
    // =========================================================

    #[test]
    fn resolve_root_plain_dir() {
        let root = resolve_library_root_dir("/home/user/library");
        assert_eq!(root, PathBuf::from("/home/user/library"));
    }

    #[test]
    fn resolve_root_videos_child() {
        let root = resolve_library_root_dir("/home/user/library/videos");
        assert_eq!(root, PathBuf::from("/home/user/library"));
    }

    #[test]
    fn resolve_root_comments_child() {
        let root = resolve_library_root_dir("/home/user/library/comments");
        assert_eq!(root, PathBuf::from("/home/user/library"));
    }

    #[test]
    fn resolve_root_metadata_child() {
        let root = resolve_library_root_dir("/home/user/library/metadata");
        assert_eq!(root, PathBuf::from("/home/user/library"));
    }

    #[test]
    fn resolve_root_contents_child() {
        let root = resolve_library_root_dir("/home/user/library/contents");
        assert_eq!(root, PathBuf::from("/home/user/library"));
    }

    #[test]
    fn resolve_root_thumbnails_child() {
        let root = resolve_library_root_dir("/home/user/library/thumbnails");
        assert_eq!(root, PathBuf::from("/home/user/library"));
    }

    #[test]
    fn resolve_root_case_insensitive() {
        let root = resolve_library_root_dir("/home/user/library/Videos");
        assert_eq!(root, PathBuf::from("/home/user/library"));
    }

    #[test]
    fn resolve_root_unknown_child_kept() {
        let root = resolve_library_root_dir("/home/user/library/other");
        assert_eq!(root, PathBuf::from("/home/user/library/other"));
    }

    // =========================================================
    // normalized_library_root
    // =========================================================

    #[test]
    fn normalized_root_strips_child() {
        let root = normalized_library_root("/data/lib/videos");
        assert!(root.ends_with("lib") || root.contains("lib"));
        assert!(!root.ends_with("videos"));
    }

    // =========================================================
    // library_*_dir
    // =========================================================

    #[test]
    fn library_videos_dir_appends() {
        let dir = library_videos_dir("/data/lib");
        assert!(dir.ends_with("videos"));
    }

    #[test]
    fn library_comments_dir_appends() {
        let dir = library_comments_dir("/data/lib");
        assert!(dir.ends_with("comments"));
    }

    #[test]
    fn library_metadata_dir_appends() {
        let dir = library_metadata_dir("/data/lib");
        assert!(dir.ends_with("metadata"));
    }

    #[test]
    fn library_thumbnails_dir_appends() {
        let dir = library_thumbnails_dir("/data/lib");
        assert!(dir.ends_with("thumbnails"));
    }

    // =========================================================
    // sanitize_filename_component
    // =========================================================

    #[test]
    fn sanitize_filename_normal() {
        assert_eq!(sanitize_filename_component("hello-world_1"), "hello-world_1");
    }

    #[test]
    fn sanitize_filename_special_chars() {
        assert_eq!(sanitize_filename_component("a/b:c*d"), "a_b_c_d");
    }

    #[test]
    fn sanitize_filename_empty() {
        assert_eq!(sanitize_filename_component(""), "unknown");
    }

    #[test]
    fn sanitize_filename_whitespace_only() {
        assert_eq!(sanitize_filename_component("   "), "unknown");
    }

    #[test]
    fn sanitize_filename_all_special() {
        assert_eq!(sanitize_filename_component("***"), "unknown");
    }

    #[test]
    fn sanitize_filename_truncate_60() {
        let long = "a".repeat(100);
        let result = sanitize_filename_component(&long);
        assert_eq!(result.len(), 60);
    }

    #[test]
    fn sanitize_filename_leading_trailing_underscores() {
        // After replacing, leading/trailing underscores are trimmed
        assert_eq!(sanitize_filename_component("!hello!"), "hello");
    }

    // =========================================================
    // sanitize_path_component
    // =========================================================

    #[test]
    fn sanitize_path_normal() {
        assert_eq!(sanitize_path_component("Hello World", 255), "Hello World");
    }

    #[test]
    fn sanitize_path_control_chars() {
        assert_eq!(sanitize_path_component("a\x00b\x1Fc", 255), "a_b_c");
    }

    #[test]
    fn sanitize_path_forbidden_chars() {
        assert_eq!(sanitize_path_component("a<b>c:d", 255), "a_b_c_d");
    }

    #[test]
    fn sanitize_path_empty() {
        assert_eq!(sanitize_path_component("", 255), "unknown");
    }

    #[test]
    fn sanitize_path_trailing_dots_spaces() {
        assert_eq!(sanitize_path_component("test.. ", 255), "test");
    }

    #[test]
    fn sanitize_path_truncate() {
        let long = "a".repeat(300);
        let result = sanitize_path_component(&long, 100);
        assert_eq!(result.len(), 100);
    }

    #[test]
    fn sanitize_path_all_invalid() {
        // Forbidden chars are replaced with '_', but underscores are not stripped
        assert_eq!(sanitize_path_component("<<<>>>", 255), "______");
    }

    // =========================================================
    // collect_files_recursive
    // =========================================================

    #[test]
    fn collect_files_nonexistent_dir() {
        let files = collect_files_recursive(Path::new("/nonexistent/dir/xyz"));
        assert!(files.is_empty());
    }

    #[test]
    fn collect_files_empty_dir() {
        let dir = std::env::temp_dir().join("ylv_test_collect_empty");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let files = collect_files_recursive(&dir);
        assert!(files.is_empty());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn collect_files_with_nested() {
        let dir = std::env::temp_dir().join("ylv_test_collect_nested");
        let _ = fs::remove_dir_all(&dir);
        let sub = dir.join("sub");
        fs::create_dir_all(&sub).unwrap();
        fs::write(dir.join("a.txt"), "a").unwrap();
        fs::write(sub.join("b.txt"), "b").unwrap();
        let files = collect_files_recursive(&dir);
        assert_eq!(files.len(), 2);
        let _ = fs::remove_dir_all(&dir);
    }

    // =========================================================
    // atomic_write
    // =========================================================

    #[test]
    fn atomic_write_creates_file() {
        let dir = std::env::temp_dir().join("ylv_test_atomic");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("test.json");
        atomic_write(&path, b"hello").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "hello");
        // .tmp should not remain
        assert!(!dir.join("test.tmp").exists());
        let _ = fs::remove_dir_all(&dir);
    }
}
