use std::{fs, path::{Path, PathBuf}};
use tauri::{AppHandle, Manager};
use crate::paths::{library_thumbnails_dir, collect_files_recursive, sanitize_path_component};
use crate::state::read_settings;
use crate::models::PersistedSettings;

pub(crate) fn normalize_thumbnail_extension(value: Option<String>) -> String {
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

pub(crate) fn find_existing_thumbnail(dir: &Path, video_id: &str) -> Option<PathBuf> {
    if !dir.exists() {
        return None;
    }
    let id_lower = video_id.to_lowercase();
    let id_marker = format!("[{}]", id_lower);
    let id_prefix = format!("{}.", id_lower);
    for path in collect_files_recursive(dir) {
        if !path.is_file() {
            continue;
        }
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(name) => name.to_string(),
            None => continue,
        };
        let name_lower = name.to_lowercase();
        let is_image = name_lower.ends_with(".jpg")
            || name_lower.ends_with(".jpeg")
            || name_lower.ends_with(".png")
            || name_lower.ends_with(".webp")
            || name_lower.ends_with(".gif");
        if !is_image {
            continue;
        }
        // 新形式: {id}.{ext}
        if name_lower.starts_with(&id_prefix) {
            return Some(path);
        }
        // 旧形式: {title} [{id}].{ext}
        if name_lower.contains(&id_marker) {
            return Some(path);
        }
    }
    None
}

#[tauri::command]
pub fn save_thumbnail(
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

    let handle = uploader_id.as_deref().map(|s| s.trim()).filter(|s| !s.is_empty());
    if handle.is_none() {
        return Err("アップローダーIDが不明です。メタデータを取得してから再度お試しください。".to_string());
    }

    let resolved_output = output_dir.as_deref().map(|s| s.trim()).filter(|s| !s.is_empty());
    let settings = if resolved_output.is_none() { read_settings(&app) } else { PersistedSettings::default() };
    
    let (base_thumbnails_dir, dir) = if let Some(download_dir) = resolved_output.or(settings.download_dir.as_deref()) {
        let base = library_thumbnails_dir(download_dir);
        (Some(base.clone()), base.join(sanitize_path_component(handle.unwrap(), 64)))
    } else {
        let base = app
            .path()
            .app_config_dir()
            .map_err(|e| format!("保存先ディレクトリの取得に失敗しました: {}", e))?
            .join("thumbnails");
        (None, base.join(sanitize_path_component(handle.unwrap(), 64)))
    };
    
    fs::create_dir_all(&dir)
        .map_err(|e| format!("サムネイル保存先フォルダの作成に失敗しました: {}", e))?;

    // 既存のサムネイルを検索（現在のdirと、ルートのthumbnailsディレクトリ配下も検索）
    if let Some(existing) = find_existing_thumbnail(&dir, trimmed_id) {
        return Ok(existing.to_string_lossy().to_string());
    }
    
    if let Some(base) = base_thumbnails_dir {
        if let Some(existing) = find_existing_thumbnail(&base, trimmed_id) {
            return Ok(existing.to_string_lossy().to_string());
        }
    }

    let extension = normalize_thumbnail_extension(extension);
    let safe_title = sanitize_path_component(title.as_deref().unwrap_or("thumbnail"), 120);
    let file_path = dir.join(format!("{} [{}].{}", safe_title, trimmed_id, extension));
    fs::write(&file_path, &data)
        .map_err(|e| format!("サムネイルの保存に失敗しました: {}", e))?;

    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn resolve_thumbnail_path(output_dir: String, id: String) -> Result<Option<String>, String> {
    let dir = library_thumbnails_dir(&output_dir);
    if !dir.exists() {
        return Ok(None);
    }
    let id_lower = id.to_lowercase();
    let id_marker = format!("[{}]", id_lower);
    let id_prefix = format!("{}.", id_lower);
    for path in collect_files_recursive(&dir) {
        if !path.is_file() {
            continue;
        }
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(name) => name.to_string(),
            None => continue,
        };
        let name_lower = name.to_lowercase();
        let is_image = name_lower.ends_with(".jpg")
            || name_lower.ends_with(".jpeg")
            || name_lower.ends_with(".png")
            || name_lower.ends_with(".webp")
            || name_lower.ends_with(".gif");
        if !is_image {
            continue;
        }
        // 新形式: {id}.{ext}
        if name_lower.starts_with(&id_prefix) {
            return Ok(Some(path.to_string_lossy().to_string()));
        }
        // 旧形式: {title} [{id}].{ext}
        if name_lower.contains(&id_marker) {
            return Ok(Some(path.to_string_lossy().to_string()));
        }
    }
    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::*;

    // =========================================================
    // normalize_thumbnail_extension
    // =========================================================

    #[test]
    fn normalize_jpg() {
        assert_eq!(normalize_thumbnail_extension(Some("jpg".to_string())), "jpg");
    }

    #[test]
    fn normalize_jpeg_to_jpg() {
        assert_eq!(normalize_thumbnail_extension(Some("jpeg".to_string())), "jpg");
    }

    #[test]
    fn normalize_png() {
        assert_eq!(normalize_thumbnail_extension(Some("png".to_string())), "png");
    }

    #[test]
    fn normalize_webp() {
        assert_eq!(normalize_thumbnail_extension(Some("webp".to_string())), "webp");
    }

    #[test]
    fn normalize_gif() {
        assert_eq!(normalize_thumbnail_extension(Some("gif".to_string())), "gif");
    }

    #[test]
    fn normalize_none_default_jpg() {
        assert_eq!(normalize_thumbnail_extension(None), "jpg");
    }

    #[test]
    fn normalize_unknown_default_jpg() {
        assert_eq!(normalize_thumbnail_extension(Some("bmp".to_string())), "jpg");
    }

    #[test]
    fn normalize_leading_dot() {
        assert_eq!(normalize_thumbnail_extension(Some(".png".to_string())), "png");
    }

    #[test]
    fn normalize_uppercase() {
        assert_eq!(normalize_thumbnail_extension(Some("JPEG".to_string())), "jpg");
    }

    #[test]
    fn normalize_whitespace() {
        assert_eq!(normalize_thumbnail_extension(Some("  webp  ".to_string())), "webp");
    }

    // =========================================================
    // find_existing_thumbnail (tempdir)
    // =========================================================

    #[test]
    fn find_thumbnail_new_format() {
        let dir = std::env::temp_dir().join("ylv_test_thumb_new");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("abc123.jpg"), "img").unwrap();
        let result = find_existing_thumbnail(&dir, "abc123");
        assert!(result.is_some());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn find_thumbnail_old_format() {
        let dir = std::env::temp_dir().join("ylv_test_thumb_old");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("Title [abc123].webp"), "img").unwrap();
        let result = find_existing_thumbnail(&dir, "abc123");
        assert!(result.is_some());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn find_thumbnail_not_found() {
        let dir = std::env::temp_dir().join("ylv_test_thumb_miss");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("other.jpg"), "x").unwrap();
        let result = find_existing_thumbnail(&dir, "xyz");
        assert!(result.is_none());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn find_thumbnail_nonexistent_dir() {
        let result = find_existing_thumbnail(Path::new("/no/such/dir"), "id");
        assert!(result.is_none());
    }

    #[test]
    fn find_thumbnail_non_image_ignored() {
        let dir = std::env::temp_dir().join("ylv_test_thumb_noimg");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("abc123.txt"), "data").unwrap();
        let result = find_existing_thumbnail(&dir, "abc123");
        assert!(result.is_none());
        let _ = fs::remove_dir_all(&dir);
    }
}
