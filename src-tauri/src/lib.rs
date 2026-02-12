use tauri::{Manager, WindowEvent};

mod models;
mod paths;
mod tooling;
mod tool_download;
mod window;
mod thumbnails;
mod state;
mod files;
mod metadata;
mod comments;
mod download;

// Re-export for use in module cross-references
pub(crate) use models::*;

const YTDLP_TITLE_WARNING: &str =
    "No title found in player responses; falling back to title from initial data";
const YTDLP_WARNING_RETRY_MAX: usize = 10;
const YTDLP_WARNING_RETRY_SLEEP_MS: u64 = 500;
const YTDLP_NONE_DECODE_ERROR: &str = "NoneType";
const YTDLP_NONE_DECODE_RETRY_MAX: usize = 2;
const YTDLP_NONE_DECODE_RETRY_SLEEP_MS: u64 = 10_000;
const WINDOW_MIN_WIDTH: u32 = 1280;
const WINDOW_MIN_HEIGHT: u32 = 720;
const WINDOW_SIZE_FILE_NAME: &str = "window_size.json";
const PLAYER_WINDOW_SIZE_FILE_NAME: &str = "player_window_size.json";
const SETTINGS_DIR_NAME: &str = "settings";
const INDEX_DIR_NAME: &str = "index";
const SETTINGS_FILE_NAME: &str = "app.json";
const VIDEOS_FILE_NAME: &str = "videos.json";
const SETTINGS_SCHEMA_VERSION: u32 = 1;
const VIDEOS_SCHEMA_VERSION: u32 = 1;
const BACKUP_SCHEMA_VERSION: u32 = 2;
const LIBRARY_VIDEOS_DIR_NAME: &str = "videos";
const LIBRARY_COMMENTS_DIR_NAME: &str = "comments";
const LIBRARY_METADATA_DIR_NAME: &str = "metadata";
const LIBRARY_THUMBNAILS_DIR_NAME: &str = "thumbnails";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())

        .manage(DownloadProcessState::default())
        .manage(WindowSizeState::default())
        .manage(PlayerWindowSizeState::default())
        .manage(VideoIndexState::default())
        .manage(PendingPlayerOpenState::default())
        .invoke_handler(tauri::generate_handler![
            window::get_player_window_size,
            download::start_download,
            download::stop_download,
            comments::start_comments_download,
            metadata::start_metadata_download,
            metadata::list_channel_videos,
            metadata::get_channel_metadata,
            metadata::get_video_metadata,
            comments::get_comments,
            files::resolve_video_file,
            files::video_file_exists,
            files::comments_file_exists,
            files::verify_local_files,
            files::info_json_exists,
            files::get_metadata_index,
            files::get_local_metadata_by_ids,
            files::probe_media,
            state::load_state,
            state::save_state,
            state::export_state,
            state::import_state,
            thumbnails::resolve_thumbnail_path,
            thumbnails::save_thumbnail,
            tooling::update_yt_dlp,
            tooling::check_tooling,
            tool_download::download_tools,
            window::open_devtools_window,
            window::set_pending_player_open,
            window::take_pending_player_open
        ])
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let screen_size = if let Ok(Some(monitor)) = window.current_monitor() {
                    let size = monitor.size();
                    Some((size.width as u32, size.height as u32))
                } else {
                    None
                };

                let (mut min_width, mut min_height) = (WINDOW_MIN_WIDTH, WINDOW_MIN_HEIGHT);
                if let Some((screen_width, screen_height)) = screen_size {
                    min_width = min_width.min(screen_width);
                    min_height = min_height.min(screen_height);
                }

                let default_size = if let Some((screen_width, screen_height)) = screen_size {
                    if screen_width >= 1920 && screen_height >= 1080 {
                        (1920u32, 1080u32)
                    } else {
                        (1280u32, 720u32)
                    }
                } else {
                    (1280u32, 720u32)
                };

                let saved_config = window::read_window_size(&app.handle());
                let saved_size = saved_config.map(|s| (s.width, s.height));

                let (mut window_width, mut window_height) = saved_size.unwrap_or(default_size);
                window_width = window_width.max(min_width);
                window_height = window_height.max(min_height);
                if let Some((screen_width, screen_height)) = screen_size {
                    window_width = window_width.min(screen_width);
                    window_height = window_height.min(screen_height);
                }

                let _ = window.set_min_size(Some(tauri::LogicalSize {
                    width: min_width as f64,
                    height: min_height as f64,
                }));

                let _ = window.set_size(tauri::LogicalSize {
                    width: window_width as f64,
                    height: window_height as f64,
                });

                if let Some(config) = saved_config {
                    if let (Some(x), Some(y)) = (config.x, config.y) {
                        let _ = window.set_position(tauri::LogicalPosition {
                            x: x as f64,
                            y: y as f64,
                        });
                    }
                }

                #[cfg(debug_assertions)]
                {
                    window.open_devtools();
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            let label = window.label();
            if label != "main" && label != "player" {
                return;
            }
            let is_player = label == "player";

            if let WindowEvent::Resized(size) = event {
                if size.width == 0 || size.height == 0 {
                    return;
                }

                let width = size.width as u32;
                let height = size.height as u32;

                if is_player {
                    let state = window.state::<PlayerWindowSizeState>();
                    let mut last_saved = state.last_saved.lock().unwrap();
                    if let Some((last_w, last_h)) = *last_saved {
                        if last_w == width && last_h == height {
                            return;
                        }
                    }
                    *last_saved = Some((width, height));
                    let position = window.outer_position().ok();
                    let config = WindowSizeConfig {
                        width,
                        height,
                        x: position.map(|p| p.x),
                        y: position.map(|p| p.y),
                    };
                    let _ = window::write_player_window_size(&window.app_handle(), config);
                } else {
                    let state = window.state::<WindowSizeState>();
                    let mut last_saved = state.last_saved.lock().unwrap();
                    if let Some((last_w, last_h)) = *last_saved {
                        if last_w == width && last_h == height {
                            return;
                        }
                    }
                    *last_saved = Some((width, height));
                    let position = window.outer_position().ok();
                    let config = WindowSizeConfig {
                        width,
                        height,
                        x: position.map(|p| p.x),
                        y: position.map(|p| p.y),
                    };
                    let _ = window::write_window_size(&window.app_handle(), config);
                }
            }

            if let WindowEvent::Moved(position) = event {
                let x = position.x;
                let y = position.y;

                if is_player {
                    let state = window.state::<PlayerWindowSizeState>();
                    let mut last_position = state.last_position.lock().unwrap();
                    if let Some((last_x, last_y)) = *last_position {
                        if last_x == x && last_y == y {
                            return;
                        }
                    }
                    *last_position = Some((x, y));
                    if let Ok(size) = window.outer_size() {
                        let config = WindowSizeConfig {
                            width: size.width as u32,
                            height: size.height as u32,
                            x: Some(x),
                            y: Some(y),
                        };
                        let _ = window::write_player_window_size(&window.app_handle(), config);
                    }
                } else {
                    let state = window.state::<WindowSizeState>();
                    let mut last_position = state.last_position.lock().unwrap();
                    if let Some((last_x, last_y)) = *last_position {
                        if last_x == x && last_y == y {
                            return;
                        }
                    }
                    *last_position = Some((x, y));
                    if let Ok(size) = window.outer_size() {
                        let config = WindowSizeConfig {
                            width: size.width as u32,
                            height: size.height as u32,
                            x: Some(x),
                            y: Some(y),
                        };
                        let _ = window::write_window_size(&window.app_handle(), config);
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
