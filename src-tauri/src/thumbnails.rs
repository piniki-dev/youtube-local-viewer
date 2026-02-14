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
