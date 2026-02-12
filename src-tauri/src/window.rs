use std::{fs, path::PathBuf};
use tauri::{AppHandle, Manager, State};
use crate::models::{WindowSizeConfig, PendingPlayerOpen, PendingPlayerOpenState};
use crate::{WINDOW_SIZE_FILE_NAME, PLAYER_WINDOW_SIZE_FILE_NAME};

pub(crate) fn window_size_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("保存先ディレクトリの取得に失敗しました: {}", e))?;
    fs::create_dir_all(&dir)
        .map_err(|e| format!("設定フォルダの作成に失敗しました: {}", e))?;
    Ok(dir.join(WINDOW_SIZE_FILE_NAME))
}

pub(crate) fn player_window_size_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("保存先ディレクトリの取得に失敗しました: {}", e))?;
    fs::create_dir_all(&dir)
        .map_err(|e| format!("設定フォルダの作成に失敗しました: {}", e))?;
    Ok(dir.join(PLAYER_WINDOW_SIZE_FILE_NAME))
}

pub(crate) fn read_window_size(app: &AppHandle) -> Option<WindowSizeConfig> {
    let path = window_size_file_path(app).ok()?;
    let content = fs::read_to_string(path).ok()?;
    serde_json::from_str(&content).ok()
}

pub(crate) fn write_window_size(app: &AppHandle, size: WindowSizeConfig) -> Result<(), String> {
    let path = window_size_file_path(app)?;
    let content = serde_json::to_string(&size)
        .map_err(|e| format!("ウィンドウサイズの保存に失敗しました: {}", e))?;
    crate::paths::atomic_write(&path, content.as_bytes())?;
    Ok(())
}

pub(crate) fn read_player_window_size(app: &AppHandle) -> Option<WindowSizeConfig> {
    let path = player_window_size_file_path(app).ok()?;
    let content = fs::read_to_string(path).ok()?;
    serde_json::from_str(&content).ok()
}

pub(crate) fn write_player_window_size(app: &AppHandle, size: WindowSizeConfig) -> Result<(), String> {
    let path = player_window_size_file_path(app)?;
    let content = serde_json::to_string(&size)
        .map_err(|e| format!("プレイヤーウィンドウサイズの保存に失敗しました: {}", e))?;
    crate::paths::atomic_write(&path, content.as_bytes())?;
    Ok(())
}

#[tauri::command]
pub fn get_player_window_size(app: AppHandle) -> Option<WindowSizeConfig> {
    read_player_window_size(&app)
}

#[tauri::command]
pub fn set_pending_player_open(
    label: String,
    id: String,
    file_path: Option<String>,
    state: State<PendingPlayerOpenState>,
) -> Result<(), String> {
    let mut pending = state.pending.lock().unwrap();
    pending.insert(
        label,
        PendingPlayerOpen {
            id,
            file_path,
        },
    );
    Ok(())
}

#[tauri::command]
pub fn take_pending_player_open(
    label: String,
    state: State<PendingPlayerOpenState>,
) -> Result<Option<PendingPlayerOpen>, String> {
    let mut pending = state.pending.lock().unwrap();
    Ok(pending.remove(&label))
}

#[tauri::command]
#[allow(unused_variables)]
pub fn open_devtools_window(app: AppHandle, label: String) -> Result<(), String> {
    #[cfg(debug_assertions)]
    {
        if let Some(window) = app.get_webview_window(&label) {
            window.open_devtools();
        }
    }
    Ok(())
}
