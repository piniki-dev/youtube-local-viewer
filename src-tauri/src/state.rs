use std::{fs, io::{Read, Write}};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};
use zip::write::FileOptions;
use zip::{ZipArchive, ZipWriter};
use serde::{Deserialize, Serialize};
use crate::models::{PersistedState, PersistedSettings, PersistedVideos, VersionedSettings, VersionedVideos};
use crate::paths::{atomic_write, settings_file_path, videos_file_path};
use crate::paths::{library_videos_dir, library_metadata_dir, library_comments_dir, library_thumbnails_dir};
use crate::{SETTINGS_SCHEMA_VERSION, VIDEOS_SCHEMA_VERSION, BACKUP_SCHEMA_VERSION};

pub(crate) fn parse_versioned_settings(content: &str) -> PersistedSettings {
    if let Ok(wrapper) = serde_json::from_str::<VersionedSettings>(content) {
        if wrapper.version <= SETTINGS_SCHEMA_VERSION {
            return wrapper.data;
        }
        return PersistedSettings::default();
    }
    serde_json::from_str::<PersistedSettings>(content).unwrap_or_default()
}

pub(crate) fn parse_versioned_videos(content: &str) -> PersistedVideos {
    if let Ok(wrapper) = serde_json::from_str::<VersionedVideos>(content) {
        if wrapper.version <= VIDEOS_SCHEMA_VERSION {
            return wrapper.data;
        }
        return PersistedVideos::default();
    }
    serde_json::from_str::<PersistedVideos>(content).unwrap_or_default()
}

pub(crate) fn read_settings(app: &AppHandle) -> PersistedSettings {
    let settings_path = match settings_file_path(app) {
        Ok(path) => path,
        Err(_) => return PersistedSettings::default(),
    };
    if !settings_path.exists() {
        return PersistedSettings::default();
    }
    let content = match fs::read_to_string(&settings_path) {
        Ok(content) => content,
        Err(_) => return PersistedSettings::default(),
    };
    parse_versioned_settings(&content)
}

#[tauri::command]
pub fn load_state(app: AppHandle) -> Result<PersistedState, String> {
    let settings_path = settings_file_path(&app)?;
    let videos_path = videos_file_path(&app)?;

    let settings = if settings_path.exists() {
        let content = fs::read_to_string(&settings_path)
            .map_err(|e| format!("設定ファイルの読み込みに失敗しました: {}", e))?;
        parse_versioned_settings(&content)
    } else {
        PersistedSettings::default()
    };

    let videos = if videos_path.exists() {
        let content = fs::read_to_string(&videos_path)
            .map_err(|e| format!("動画インデックスの読み込みに失敗しました: {}", e))?;
        parse_versioned_videos(&content)
    } else {
        PersistedVideos::default()
    };

    Ok(PersistedState {
        videos: videos.videos,
        download_dir: settings.download_dir,
        cookies_file: settings.cookies_file,
        cookies_source: settings.cookies_source,
        cookies_browser: settings.cookies_browser,
        remote_components: settings.remote_components,
        yt_dlp_path: settings.yt_dlp_path,
        ffmpeg_path: settings.ffmpeg_path,
        ffprobe_path: settings.ffprobe_path,
        download_quality: settings.download_quality,
    })
}

#[tauri::command]
pub fn save_state(app: AppHandle, state: PersistedState) -> Result<(), String> {
    let settings_path = settings_file_path(&app)?;
    let videos_path = videos_file_path(&app)?;

    if let Some(parent) = settings_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("設定フォルダの作成に失敗しました: {}", e))?;
    }
    if let Some(parent) = videos_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("インデックスフォルダの作成に失敗しました: {}", e))?;
    }

    let settings = VersionedSettings {
        version: SETTINGS_SCHEMA_VERSION,
        data: PersistedSettings {
            download_dir: state.download_dir,
            cookies_file: state.cookies_file,
            cookies_source: state.cookies_source,
            cookies_browser: state.cookies_browser,
            remote_components: state.remote_components,
            yt_dlp_path: state.yt_dlp_path,
            ffmpeg_path: state.ffmpeg_path,
            ffprobe_path: state.ffprobe_path,
            download_quality: state.download_quality,
        },
    };
    let settings_content = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("設定データの整形に失敗しました: {}", e))?;
    atomic_write(&settings_path, settings_content.as_bytes())?;

    let videos = VersionedVideos {
        version: VIDEOS_SCHEMA_VERSION,
        data: PersistedVideos {
            videos: state.videos,
        },
    };
    let videos_content = serde_json::to_string_pretty(&videos)
        .map_err(|e| format!("動画インデックスの整形に失敗しました: {}", e))?;
    atomic_write(&videos_path, videos_content.as_bytes())?;
    Ok(())
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportManifest {
    version: u32,
    created_at_ms: u128,
    settings_version: Option<u32>,
    videos_version: Option<u32>,
}

#[tauri::command]
pub fn export_state(app: AppHandle, output_path: String) -> Result<(), String> {
    let settings_path = settings_file_path(&app)?;
    let videos_path = videos_file_path(&app)?;

    let file = fs::File::create(&output_path)
        .map_err(|e| format!("エクスポート先の作成に失敗しました: {}", e))?;
    let mut zip = ZipWriter::new(file);
    let options = FileOptions::default();

    let manifest = ExportManifest {
        version: BACKUP_SCHEMA_VERSION,
        created_at_ms: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0),
        settings_version: Some(SETTINGS_SCHEMA_VERSION),
        videos_version: Some(VIDEOS_SCHEMA_VERSION),
    };
    let manifest_content = serde_json::to_string_pretty(&manifest)
        .map_err(|e| format!("マニフェストの作成に失敗しました: {}", e))?;
    zip.start_file("manifest.json", options)
        .map_err(|e| format!("zipの作成に失敗しました: {}", e))?;
    zip.write_all(manifest_content.as_bytes())
        .map_err(|e| format!("zipの書き込みに失敗しました: {}", e))?;

    if settings_path.exists() {
        let content = fs::read_to_string(&settings_path)
            .map_err(|e| format!("設定ファイルの読み込みに失敗しました: {}", e))?;
        zip.start_file("settings/app.json", options)
            .map_err(|e| format!("zipの作成に失敗しました: {}", e))?;
        zip.write_all(content.as_bytes())
            .map_err(|e| format!("zipの書き込みに失敗しました: {}", e))?;
    }

    if videos_path.exists() {
        let content = fs::read_to_string(&videos_path)
            .map_err(|e| format!("動画インデックスの読み込みに失敗しました: {}", e))?;
        zip.start_file("index/videos.json", options)
            .map_err(|e| format!("zipの作成に失敗しました: {}", e))?;
        zip.write_all(content.as_bytes())
            .map_err(|e| format!("zipの書き込みに失敗しました: {}", e))?;
    }

    zip.finish()
        .map_err(|e| format!("zipの作成に失敗しました: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn import_state(app: AppHandle, input_path: String) -> Result<(), String> {
    let file = fs::File::open(&input_path)
        .map_err(|e| format!("インポート元の読み込みに失敗しました: {}", e))?;
    let mut archive = ZipArchive::new(file)
        .map_err(|e| format!("zipの読み込みに失敗しました: {}", e))?;

    if let Ok(mut manifest_entry) = archive.by_name("manifest.json") {
        let mut manifest_content = String::new();
        manifest_entry
            .read_to_string(&mut manifest_content)
            .map_err(|e| format!("マニフェストの読み込みに失敗しました: {}", e))?;
        if let Ok(manifest) = serde_json::from_str::<ExportManifest>(&manifest_content) {
            if manifest.version > BACKUP_SCHEMA_VERSION {
                return Err(format!(
                    "このバックアップは新しい形式です（version: {}）。アプリを更新してください。",
                    manifest.version
                ));
            }
        }
    }

    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("zipの読み込みに失敗しました: {}", e))?;
        let name = entry.name().to_string();
        let target = match name.as_str() {
            "settings/app.json" => Some(settings_file_path(&app)?),
            "index/videos.json" => Some(videos_file_path(&app)?),
            _ => None,
        };
        let Some(target_path) = target else {
            continue;
        };

        if let Some(parent) = target_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("保存先フォルダの作成に失敗しました: {}", e))?;
        }

        let mut buffer = Vec::new();
        entry
            .read_to_end(&mut buffer)
            .map_err(|e| format!("zipの読み込みに失敗しました: {}", e))?;
        atomic_write(&target_path, &buffer)?;
    }

    Ok(())
}

/// 開発環境専用: アプリデータを初期化する
/// keep_settings=true の場合は設定ファイルを残す
#[tauri::command]
pub fn dev_reset(app: AppHandle, output_dir: String, keep_settings: bool) -> Result<String, String> {
    let mut log = Vec::new();

    // 1. ダウンロードしたファイルの削除 (videos, metadata, comments, thumbnails)
    if !output_dir.trim().is_empty() {
        let dirs = [
            library_videos_dir(&output_dir),
            library_metadata_dir(&output_dir),
            library_comments_dir(&output_dir),
            library_thumbnails_dir(&output_dir),
        ];
        for dir in &dirs {
            if dir.exists() {
                match fs::remove_dir_all(dir) {
                    Ok(_) => log.push(format!("削除: {}", dir.display())),
                    Err(e) => log.push(format!("削除失敗: {} ({})", dir.display(), e)),
                }
            }
        }
    }

    // 2. videos.json の削除
    match videos_file_path(&app) {
        Ok(path) => {
            if path.exists() {
                match fs::remove_file(&path) {
                    Ok(_) => log.push(format!("削除: {}", path.display())),
                    Err(e) => log.push(format!("削除失敗: {} ({})", path.display(), e)),
                }
            }
        }
        Err(e) => log.push(format!("videos.json パス取得失敗: {}", e)),
    }

    // 3. エラーログの削除
    if let Ok(base) = app.path().app_config_dir() {
        #[cfg(debug_assertions)]
        let base: std::path::PathBuf = {
            let dir_name = base.file_name().and_then(|n| n.to_str()).unwrap_or("config");
            let parent = base.parent().unwrap_or(base.as_path());
            parent.join(format!("{}-dev", dir_name))
        };
        let errorlogs = base.join("errorlogs");
        if errorlogs.exists() {
            match fs::remove_dir_all(&errorlogs) {
                Ok(_) => log.push(format!("削除: {}", errorlogs.display())),
                Err(e) => log.push(format!("削除失敗: {} ({})", errorlogs.display(), e)),
            }
        }
    }

    // 4. 設定ファイルの削除 (全初期化の場合)
    if !keep_settings {
        match settings_file_path(&app) {
            Ok(path) => {
                if path.exists() {
                    match fs::remove_file(&path) {
                        Ok(_) => log.push(format!("削除: {}", path.display())),
                        Err(e) => log.push(format!("削除失敗: {} ({})", path.display(), e)),
                    }
                }
            }
            Err(e) => log.push(format!("settings パス取得失敗: {}", e)),
        }
    }

    Ok(log.join("\n"))
}