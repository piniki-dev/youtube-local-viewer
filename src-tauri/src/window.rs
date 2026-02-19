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

#[cfg(test)]
mod tests {
    use crate::models::{WindowSizeConfig, PendingPlayerOpen, PendingPlayerOpenState};
    use std::collections::HashMap;
    use std::sync::Mutex;

    // ── WindowSizeConfig serialization ──

    #[test]
    fn window_size_config_roundtrip() {
        let config = WindowSizeConfig {
            width: 1280,
            height: 720,
            x: Some(100),
            y: Some(200),
        };
        let json = serde_json::to_string(&config).unwrap();
        let parsed: WindowSizeConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.width, 1280);
        assert_eq!(parsed.height, 720);
        assert_eq!(parsed.x, Some(100));
        assert_eq!(parsed.y, Some(200));
    }

    #[test]
    fn window_size_config_without_position() {
        let config = WindowSizeConfig {
            width: 800,
            height: 600,
            x: None,
            y: None,
        };
        let json = serde_json::to_string(&config).unwrap();
        let parsed: WindowSizeConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.width, 800);
        assert_eq!(parsed.height, 600);
        assert_eq!(parsed.x, None);
        assert_eq!(parsed.y, None);
    }

    // ── PendingPlayerOpen serialization ──

    #[test]
    fn pending_player_open_roundtrip() {
        let pending = PendingPlayerOpen {
            id: "abc123".to_string(),
            file_path: Some("/path/to/video.mp4".to_string()),
        };
        let json = serde_json::to_string(&pending).unwrap();
        assert!(json.contains("\"id\":\"abc123\""));
        assert!(json.contains("\"filePath\""));
        let parsed: PendingPlayerOpen = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.id, "abc123");
        assert_eq!(parsed.file_path, Some("/path/to/video.mp4".to_string()));
    }

    #[test]
    fn pending_player_open_no_file_path() {
        let pending = PendingPlayerOpen {
            id: "xyz".to_string(),
            file_path: None,
        };
        let json = serde_json::to_string(&pending).unwrap();
        let parsed: PendingPlayerOpen = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.id, "xyz");
        assert_eq!(parsed.file_path, None);
    }

    // ── PendingPlayerOpenState (Mutex HashMap) ──

    #[test]
    fn pending_state_insert_and_remove() {
        let state = PendingPlayerOpenState {
            pending: Mutex::new(HashMap::new()),
        };
        {
            let mut map = state.pending.lock().unwrap();
            map.insert(
                "player-1".to_string(),
                PendingPlayerOpen {
                    id: "video1".to_string(),
                    file_path: Some("/v/1.mp4".to_string()),
                },
            );
        }
        {
            let map = state.pending.lock().unwrap();
            assert!(map.contains_key("player-1"));
            assert_eq!(map.get("player-1").unwrap().id, "video1");
        }
        {
            let mut map = state.pending.lock().unwrap();
            let removed = map.remove("player-1");
            assert!(removed.is_some());
            assert_eq!(removed.unwrap().id, "video1");
        }
        {
            let map = state.pending.lock().unwrap();
            assert!(map.is_empty());
        }
    }

    #[test]
    fn pending_state_remove_nonexistent_returns_none() {
        let state = PendingPlayerOpenState {
            pending: Mutex::new(HashMap::new()),
        };
        let mut map = state.pending.lock().unwrap();
        assert!(map.remove("no-such-label").is_none());
    }

    #[test]
    fn pending_state_overwrite() {
        let state = PendingPlayerOpenState {
            pending: Mutex::new(HashMap::new()),
        };
        let mut map = state.pending.lock().unwrap();
        map.insert(
            "p1".to_string(),
            PendingPlayerOpen { id: "v1".to_string(), file_path: None },
        );
        map.insert(
            "p1".to_string(),
            PendingPlayerOpen { id: "v2".to_string(), file_path: Some("/new".to_string()) },
        );
        assert_eq!(map.get("p1").unwrap().id, "v2");
    }

    #[test]
    fn pending_state_multiple_labels() {
        let state = PendingPlayerOpenState {
            pending: Mutex::new(HashMap::new()),
        };
        let mut map = state.pending.lock().unwrap();
        map.insert(
            "main".to_string(),
            PendingPlayerOpen { id: "a".to_string(), file_path: None },
        );
        map.insert(
            "sub".to_string(),
            PendingPlayerOpen { id: "b".to_string(), file_path: None },
        );
        assert_eq!(map.len(), 2);
        assert_eq!(map.get("main").unwrap().id, "a");
        assert_eq!(map.get("sub").unwrap().id, "b");
    }
}
