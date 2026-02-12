use std::collections::HashMap;
use std::collections::HashSet;
use std::{fs, path::{Path, PathBuf}};
use std::process::Command;
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::time::SystemTime;
use tauri::State;
use crate::models::{VideoIndexState, LocalFileCheckItem, LocalFileCheckResult, MetadataIndex, LocalMetadataItem, MediaInfo};
use crate::paths::{collect_files_recursive, normalized_library_root, library_videos_dir, library_metadata_dir, library_comments_dir};
use crate::metadata::parse_video_metadata_value;
use crate::tooling::{resolve_override, resolve_ffprobe};

pub(crate) fn extract_id_from_filename(name: &str) -> Option<String> {
    if let (Some(open_idx), Some(close_idx)) = (name.rfind('['), name.rfind(']')) {
        if close_idx > open_idx + 1 {
            let id = name[(open_idx + 1)..close_idx].trim();
            if !id.is_empty() {
                return Some(id.to_string());
            }
        }
    }
    None
}

pub(crate) fn find_info_json(dir: &Path, id: &str) -> Option<PathBuf> {
    if !dir.exists() {
        return None;
    }
    let id_lower = id.to_lowercase();
    let mut candidates: Vec<PathBuf> = Vec::new();

    for path in collect_files_recursive(dir) {
        if !path.is_file() {
            continue;
        }
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(name) => name.to_string(),
            None => continue,
        };
        let name_lower = name.to_lowercase();
        if !name_lower.ends_with(".info.json") {
            continue;
        }
        if name_lower.contains(&id_lower) {
            return Some(path);
        }
        candidates.push(path);
    }

    for path in candidates {
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(video_id) = value.get("id").and_then(|v| v.as_str()) {
                    if video_id.eq_ignore_ascii_case(id) {
                        return Some(path);
                    }
                }
                if let Some(display_id) = value.get("display_id").and_then(|v| v.as_str()) {
                    if display_id.eq_ignore_ascii_case(id) {
                        return Some(path);
                    }
                }
                if let Some(video_id) = value.get("video_id").and_then(|v| v.as_str()) {
                    if video_id.eq_ignore_ascii_case(id) {
                        return Some(path);
                    }
                }
            }
        }
    }

    None
}

pub(crate) fn update_video_index_from_scan(
    state: &VideoIndexState,
    output_dir: &str,
    video_entries: &[PathBuf],
    info_stem_by_id: &HashMap<String, String>,
) {
    ensure_video_index_root(state, output_dir);
    let mut index = state.index.lock().unwrap();
    let mut stem_to_id: HashMap<String, String> = HashMap::new();
    for (id, stem) in info_stem_by_id {
        stem_to_id.insert(stem.to_lowercase(), id.to_lowercase());
    }

    for path in video_entries {
        if !path.is_file() {
            continue;
        }
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(name) => name.to_string(),
            None => continue,
        };
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase());
        let is_video = matches!(ext.as_deref(), Some("mp4") | Some("webm") | Some("mkv") | Some("m4v"));
        if !is_video {
            continue;
        }

        if let Some(id) = extract_id_from_filename(&name) {
            index.insert(id.to_lowercase(), path.to_string_lossy().to_string());
            continue;
        }

        let stem = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or_default()
            .to_lowercase();
        if let Some(id) = stem_to_id.get(&stem) {
            index.insert(id.clone(), path.to_string_lossy().to_string());
        }
    }
}

pub(crate) fn ensure_video_index_root(state: &VideoIndexState, output_dir: &str) {
    let root = normalized_library_root(output_dir);
    let mut root_guard = state.root_dir.lock().unwrap();
    let mut index_guard = state.index.lock().unwrap();
    if root_guard.as_deref() != Some(root.as_str()) {
        *root_guard = Some(root);
        index_guard.clear();
    }
}

pub(crate) fn info_base_name(path: &Path) -> Option<String> {
    let stem = path.file_stem()?.to_string_lossy().to_string();
    if let Some(base) = stem.strip_suffix(".info") {
        return Some(base.to_string());
    }
    Some(stem)
}

pub(crate) fn is_live_chat_file(path: &Path) -> bool {
    path.file_name()
        .and_then(|n| n.to_str())
        .map(|name| name.to_lowercase().ends_with(".live_chat.json"))
        .unwrap_or(false)
}

#[tauri::command]
pub fn video_file_exists(
    id: String,
    title: String,
    output_dir: String,
    state: State<VideoIndexState>,
) -> Result<bool, String> {
    Ok(resolve_video_file(id, title, output_dir, None, state)?.is_some())
}

#[tauri::command]
pub fn comments_file_exists(id: String, output_dir: String) -> Result<bool, String> {
    let dir = library_metadata_dir(&output_dir);
    let fallback_dir = library_comments_dir(&output_dir);
    if !dir.exists() && !fallback_dir.exists() {
        return Ok(false);
    }
    let path = crate::comments::find_comments_file(&dir, &id)
        .or_else(|| crate::comments::find_comments_file(&fallback_dir, &id));
    let Some(path) = path else {
        return Ok(false);
    };
    let is_info = path
        .file_name()
        .and_then(|n| n.to_str())
        .map(|name| name.to_lowercase().ends_with(".info.json"))
        .unwrap_or(false);
    Ok(!is_info)
}

#[tauri::command]
pub fn info_json_exists(id: String, output_dir: String) -> Result<bool, String> {
    let dir = library_metadata_dir(&output_dir);
    if !dir.exists() {
        return Ok(false);
    }
    Ok(find_info_json(&dir, &id).is_some())
}

#[tauri::command]
pub fn verify_local_files(
    output_dir: String,
    items: Vec<LocalFileCheckItem>,
    state: State<VideoIndexState>,
) -> Result<Vec<LocalFileCheckResult>, String> {
    let videos_dir = library_videos_dir(&output_dir);
    let comments_dir = library_comments_dir(&output_dir);
    let metadata_dir = library_metadata_dir(&output_dir);
    if !videos_dir.exists() && !comments_dir.exists() && !metadata_dir.exists() {
        return Ok(items
            .into_iter()
            .map(|item| LocalFileCheckResult {
                id: item.id,
                video_ok: !item.check_video,
                comments_ok: !item.check_comments,
            })
            .collect());
    }

    let video_entries = collect_files_recursive(&videos_dir);
    let comment_entries = collect_files_recursive(&comments_dir);
    let metadata_entries = collect_files_recursive(&metadata_dir);

    let mut video_files: Vec<(String, String)> = Vec::new();
    let mut video_stems: HashSet<String> = HashSet::new();
    let mut video_ids_from_name: HashSet<String> = HashSet::new();
    let mut video_file_count = 0usize;

    let mut info_stem_by_id: HashMap<String, String> = HashMap::new();
    let mut comment_ids_from_name: HashSet<String> = HashSet::new();
    let mut comment_file_count = 0usize;

    for path in &video_entries {
        if !path.is_file() {
            continue;
        }
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(name) => name.to_string(),
            None => continue,
        };
        let name_lower = name.to_lowercase();

        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase());
        let is_video = matches!(ext.as_deref(), Some("mp4") | Some("webm") | Some("mkv") | Some("m4v"));
        if is_video {
            video_file_count += 1;
            if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                let stem_lower = stem.to_lowercase();
                video_stems.insert(stem_lower.clone());
                video_files.push((name_lower.clone(), stem_lower));
            }
            if let Some(id) = extract_id_from_filename(&name) {
                video_ids_from_name.insert(id.to_lowercase());
            }
        }
    }

    for path in comment_entries {
        if !path.is_file() {
            continue;
        }
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(name) => name.to_string(),
            None => continue,
        };
        let name_lower = name.to_lowercase();
        let is_comment = name_lower.ends_with(".live_chat.json") || name_lower.ends_with(".comments.json");
        if !is_comment {
            continue;
        }
        comment_file_count += 1;
        if let Some(id) = extract_id_from_filename(&name) {
            comment_ids_from_name.insert(id.to_lowercase());
        }
    }

    for path in metadata_entries.iter() {
        if !path.is_file() {
            continue;
        }
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(name) => name.to_string(),
            None => continue,
        };
        let name_lower = name.to_lowercase();
        let is_comment = name_lower.ends_with(".live_chat.json") || name_lower.ends_with(".comments.json");
        if !is_comment {
            continue;
        }
        comment_file_count += 1;
        if let Some(id) = extract_id_from_filename(&name) {
            comment_ids_from_name.insert(id.to_lowercase());
        }
    }

    for path in metadata_entries {
        if !path.is_file() {
            continue;
        }
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(name) => name.to_string(),
            None => continue,
        };
        let name_lower = name.to_lowercase();
        let is_info = name_lower.ends_with(".info.json");
        if !is_info {
            continue;
        }
        if let Some(id) = extract_id_from_filename(&name) {
            if let Some(base) = info_base_name(&path) {
                info_stem_by_id.entry(id.to_lowercase()).or_insert(base);
            }
        } else if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(&content) {
                let id = value
                    .get("video_id")
                    .and_then(|v| v.as_str())
                    .or_else(|| value.get("id").and_then(|v| v.as_str()))
                    .or_else(|| value.get("display_id").and_then(|v| v.as_str()))
                    .map(|s| s.to_string());
                if let Some(id) = id {
                    if let Some(base) = info_base_name(&path) {
                        info_stem_by_id.entry(id.to_lowercase()).or_insert(base);
                    }
                }
            }
        }
    }

    update_video_index_from_scan(&state, &output_dir, &video_entries, &info_stem_by_id);

    let results = items
        .into_iter()
        .map(|item| {
            let id_lower = item.id.to_lowercase();
            let title_lower = item.title.trim().to_lowercase();

            let video_ok = if !item.check_video {
                true
            } else if video_file_count == 0 {
                false
            } else {
                let mut matched = false;
                if let Some(info_stem) = info_stem_by_id.get(&id_lower) {
                    matched = video_stems.contains(&info_stem.to_lowercase());
                }
                if !matched && video_ids_from_name.contains(&id_lower) {
                    matched = true;
                }
                if !matched {
                    matched = video_files.iter().any(|(name_lower, _)| name_lower.contains(&id_lower));
                }
                if !matched && !title_lower.is_empty() {
                    matched = video_stems.contains(&title_lower)
                        || video_files
                            .iter()
                            .any(|(_, stem_lower)| stem_lower.contains(&title_lower) || title_lower.contains(stem_lower));
                }
                if matched {
                    true
                } else {
                    video_file_count > 0
                }
            };

            let comments_ok = if !item.check_comments {
                true
            } else if comment_file_count == 0 {
                false
            } else if comment_ids_from_name.contains(&id_lower) {
                true
            } else if let Some(base) = info_stem_by_id.get(&id_lower) {
                let live_chat = metadata_dir.join(format!("{}.live_chat.json", base));
                let comments = metadata_dir.join(format!("{}.comments.json", base));
                let live_chat_legacy = comments_dir.join(format!("{}.live_chat.json", base));
                let comments_legacy = comments_dir.join(format!("{}.comments.json", base));
                live_chat.exists() || comments.exists() || live_chat_legacy.exists() || comments_legacy.exists()
            } else if comment_file_count == 1 {
                true
            } else {
                false
            };

            LocalFileCheckResult {
                id: item.id,
                video_ok,
                comments_ok,
            }
        })
        .collect();

    Ok(results)
}

#[tauri::command]
pub fn get_metadata_index(output_dir: String) -> Result<MetadataIndex, String> {
    let metadata_dir = library_metadata_dir(&output_dir);
    let comments_dir = library_comments_dir(&output_dir);
    if !metadata_dir.exists() && !comments_dir.exists() {
        return Ok(MetadataIndex {
            info_ids: Vec::new(),
            chat_ids: Vec::new(),
        });
    }

    let mut info_ids: HashSet<String> = HashSet::new();
    let mut chat_ids: HashSet<String> = HashSet::new();

    for path in collect_files_recursive(&metadata_dir) {
        if !path.is_file() {
            continue;
        }
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(name) => name.to_string(),
            None => continue,
        };
        let name_lower = name.to_lowercase();
        let is_info = name_lower.ends_with(".info.json");
        let is_chat = name_lower.ends_with(".live_chat.json") || name_lower.ends_with(".comments.json");
        if !is_info && !is_chat {
            continue;
        }

        if let (Some(open_idx), Some(close_idx)) = (name.rfind('['), name.rfind(']')) {
            if close_idx > open_idx + 1 {
                let id = name[(open_idx + 1)..close_idx].trim().to_string();
                if !id.is_empty() {
                    if is_info {
                        info_ids.insert(id.clone());
                    }
                    if is_chat {
                        chat_ids.insert(id);
                    }
                    continue;
                }
            }
        }

        // Fallback: inspect JSON for ID if filename does not include it.
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(&content) {
                let id = value
                    .get("id")
                    .and_then(|v| v.as_str())
                    .or_else(|| value.get("video_id").and_then(|v| v.as_str()))
                    .or_else(|| value.get("display_id").and_then(|v| v.as_str()))
                    .map(|s| s.to_string());
                if let Some(id) = id {
                    if is_info {
                        info_ids.insert(id.clone());
                    }
                    if is_chat {
                        chat_ids.insert(id);
                    }
                }
            }
        }
    }

    for path in collect_files_recursive(&comments_dir) {
        if !path.is_file() {
            continue;
        }
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(name) => name.to_string(),
            None => continue,
        };
        let name_lower = name.to_lowercase();
        let is_info = name_lower.ends_with(".info.json");
        let is_chat = name_lower.ends_with(".live_chat.json") || name_lower.ends_with(".comments.json");
        if !is_info && !is_chat {
            continue;
        }

        if let (Some(open_idx), Some(close_idx)) = (name.rfind('['), name.rfind(']')) {
            if close_idx > open_idx + 1 {
                let id = name[(open_idx + 1)..close_idx].trim().to_string();
                if !id.is_empty() {
                    if is_info {
                        info_ids.insert(id.clone());
                    }
                    if is_chat {
                        chat_ids.insert(id);
                    }
                    continue;
                }
            }
        }

        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(&content) {
                let id = value
                    .get("id")
                    .and_then(|v| v.as_str())
                    .or_else(|| value.get("video_id").and_then(|v| v.as_str()))
                    .or_else(|| value.get("display_id").and_then(|v| v.as_str()))
                    .map(|s| s.to_string());
                if let Some(id) = id {
                    if is_info {
                        info_ids.insert(id.clone());
                    }
                    if is_chat {
                        chat_ids.insert(id);
                    }
                }
            }
        }
    }

    Ok(MetadataIndex {
        info_ids: info_ids.into_iter().collect(),
        chat_ids: chat_ids.into_iter().collect(),
    })
}

#[tauri::command]
pub fn get_local_metadata_by_ids(
    output_dir: String,
    ids: Vec<String>,
) -> Result<Vec<LocalMetadataItem>, String> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }

    let mut remaining: HashSet<String> = ids.iter().map(|id| id.to_lowercase()).collect();
    let mut results: Vec<LocalMetadataItem> = Vec::new();

    let metadata_dir = library_metadata_dir(&output_dir);
    let comments_dir = library_comments_dir(&output_dir);

    let mut scan_dirs: Vec<PathBuf> = Vec::new();
    if metadata_dir.exists() {
        scan_dirs.push(metadata_dir);
    }
    if comments_dir.exists() {
        scan_dirs.push(comments_dir);
    }

    for dir in scan_dirs {
        for path in collect_files_recursive(&dir) {
            if remaining.is_empty() {
                return Ok(results);
            }
            if !path.is_file() {
                continue;
            }
            let name = match path.file_name().and_then(|n| n.to_str()) {
                Some(name) => name.to_string(),
                None => continue,
            };
            let name_lower = name.to_lowercase();
            if !name_lower.ends_with(".info.json") {
                continue;
            }

            let extracted_id = extract_id_from_filename(&name);
            let extracted_lower = extracted_id.as_ref().map(|id| id.to_lowercase());
            let matches_name = extracted_lower
                .as_ref()
                .map(|id| remaining.contains(id))
                .unwrap_or(false);

            if !matches_name && extracted_id.is_some() {
                continue;
            }

            let content = match fs::read_to_string(&path) {
                Ok(content) => content,
                Err(_) => continue,
            };
            let value = match serde_json::from_str::<serde_json::Value>(&content) {
                Ok(value) => value,
                Err(_) => continue,
            };

            let id_from_value = value
                .get("id")
                .and_then(|v| v.as_str())
                .or_else(|| value.get("video_id").and_then(|v| v.as_str()))
                .or_else(|| value.get("display_id").and_then(|v| v.as_str()))
                .map(|s| s.to_string());

            let resolved_id = id_from_value.or_else(|| extracted_id.clone());
            let Some(resolved_id) = resolved_id else {
                continue;
            };
            let resolved_lower = resolved_id.to_lowercase();
            if !remaining.contains(&resolved_lower) {
                continue;
            }

            let metadata = parse_video_metadata_value(&value);
            results.push(LocalMetadataItem {
                id: resolved_id.clone(),
                metadata,
            });
            remaining.remove(&resolved_lower);
        }
    }

    Ok(results)
}

#[tauri::command]
pub fn resolve_video_file(
    id: String,
    title: String,
    output_dir: String,
    trace_id: Option<String>,
    state: State<VideoIndexState>,
) -> Result<Option<String>, String> {
    let started = std::time::Instant::now();
    let dir = library_videos_dir(&output_dir);
    if !dir.exists() {
        #[cfg(debug_assertions)]
        println!(
            "[resolve_video_file] missing dir id={} trace={}",
            id,
            trace_id.as_deref().unwrap_or("-")
        );
        return Ok(None);
    }

    ensure_video_index_root(&state, &output_dir);
    let id_lower = id.to_lowercase();
    if let Ok(mut index) = state.index.lock() {
        if let Some(found) = index.get(&id_lower).cloned() {
            let cached = PathBuf::from(&found);
            if cached.exists() {
                #[cfg(debug_assertions)]
                println!(
                    "[resolve_video_file] cache hit id={} trace={} elapsedMs={}",
                    id,
                    trace_id.as_deref().unwrap_or("-"),
                    started.elapsed().as_millis()
                );
                return Ok(Some(found));
            }
            index.remove(&id_lower);
        }
    }
    #[cfg(debug_assertions)]
    println!(
        "[resolve_video_file] cache miss id={} trace={}",
        id,
        trace_id.as_deref().unwrap_or("-")
    );

    let title_trimmed = title.trim().to_string();
    let title_lower = title_trimmed.to_lowercase();
    let entries = collect_files_recursive(&dir);

    let mut info_stem: Option<String> = None;
    for path in collect_files_recursive(&dir) {
        if !path.is_file() {
            continue;
        }
            let name = match path.file_name().and_then(|n| n.to_str()) {
                Some(name) => name.to_string(),
                None => continue,
            };
            if !name.to_lowercase().ends_with(".info.json") {
                continue;
            }
            let content = match fs::read_to_string(&path) {
                Ok(content) => content,
                Err(_) => continue,
            };
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(video_id) = value.get("video_id").and_then(|v| v.as_str()) {
                    if video_id.eq_ignore_ascii_case(&id) {
                        if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                            let base = stem.strip_suffix(".info").unwrap_or(stem);
                            info_stem = Some(base.to_string());
                            break;
                        }
                    }
                }
            }
    }

    let mut all_candidates: Vec<(PathBuf, SystemTime)> = Vec::new();
    let mut id_matches: Vec<(PathBuf, SystemTime)> = Vec::new();
    let mut exact_title_matches: Vec<(PathBuf, SystemTime)> = Vec::new();
    let mut partial_title_matches: Vec<(PathBuf, SystemTime)> = Vec::new();

    for path in &entries {
        if !path.is_file() {
            continue;
        }
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(name) => name.to_string(),
            None => continue,
        };
        let name_lower = name.to_lowercase();
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase());
        let is_video = matches!(ext.as_deref(), Some("mp4") | Some("webm") | Some("mkv") | Some("m4v"));
        if !is_video {
            continue;
        }

        let modified = path
            .metadata()
            .and_then(|m| m.modified())
            .unwrap_or(SystemTime::UNIX_EPOCH);
        all_candidates.push((path.clone(), modified));

        if name_lower.contains(&id_lower) {
            id_matches.push((path.clone(), modified));
            continue;
        }

        let stem = path
            .file_stem()
            .and_then(|s| s.to_str())
            .map(|s| s.to_string())
            .unwrap_or_default();
        let stem_lower = stem.to_lowercase();
        if let Some(info_base) = &info_stem {
            if stem == *info_base {
                id_matches.push((path.clone(), modified));
                continue;
            }
        }
        if !title_lower.is_empty() && stem_lower == title_lower {
            exact_title_matches.push((path.clone(), modified));
        } else if !title_lower.is_empty()
            && (stem_lower.contains(&title_lower) || title_lower.contains(&stem_lower))
        {
            partial_title_matches.push((path.clone(), modified));
        }
    }

    let pick_latest = |mut items: Vec<(PathBuf, SystemTime)>| -> Option<PathBuf> {
        items.sort_by_key(|(_, t)| *t);
        items.pop().map(|(p, _)| p)
    };

    let selected = pick_latest(id_matches)
        .or_else(|| pick_latest(exact_title_matches))
        .or_else(|| pick_latest(partial_title_matches))
        .or_else(|| {
            if all_candidates.len() == 1 {
                Some(all_candidates[0].0.clone())
            } else {
                pick_latest(all_candidates)
            }
        });

    let resolved = selected.map(|p| p.to_string_lossy().to_string());
    if let Some(path) = resolved.as_ref() {
        if let Ok(mut index) = state.index.lock() {
            index.insert(id_lower, path.clone());
        }
    }
    #[cfg(debug_assertions)]
    println!(
        "[resolve_video_file] done id={} trace={} found={} elapsedMs={}",
        id,
        trace_id.as_deref().unwrap_or("-"),
        resolved.is_some(),
        started.elapsed().as_millis()
    );
    Ok(resolved)
}

#[tauri::command]
pub fn probe_media(file_path: String, ffprobe_path: Option<String>) -> Result<MediaInfo, String> {
    let ffprobe = resolve_override(ffprobe_path).unwrap_or_else(resolve_ffprobe);
    let mut command = Command::new(ffprobe);
    #[cfg(windows)]
    command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    let output = command
        .arg("-v")
        .arg("error")
        .arg("-show_entries")
        .arg("stream=codec_type,codec_name,codec_tag_string,codec_long_name,width,height")
        .arg("-show_entries")
        .arg("format=duration")
        .arg("-of")
        .arg("json")
        .arg(&file_path)
        .output()
        .map_err(|e| format!("ffprobeの起動に失敗しました: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(if stderr.trim().is_empty() {
            "ffprobeの実行に失敗しました。".to_string()
        } else {
            stderr
        });
    }

    let value: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("ffprobeの出力解析に失敗しました: {}", e))?;

    let mut info = MediaInfo {
        video_codec: None,
        audio_codec: None,
        width: None,
        height: None,
        duration: None,
        container: None,
    };

    if let Some(duration) = value
        .get("format")
        .and_then(|f| f.get("duration"))
        .and_then(|d| d.as_str())
    {
        info.duration = duration.parse::<f64>().ok();
    }

    if let Some(container) = value
        .get("format")
        .and_then(|f| f.get("format_name"))
        .and_then(|d| d.as_str())
    {
        info.container = Some(container.to_string());
    }

    if let Some(streams) = value.get("streams").and_then(|s| s.as_array()) {
        for stream in streams {
            let codec_type = stream.get("codec_type").and_then(|v| v.as_str());
            match codec_type {
                Some("video") if info.video_codec.is_none() => {
                    let codec = stream
                        .get("codec_name")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                        .or_else(|| {
                            stream
                                .get("codec_tag_string")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string())
                        })
                        .or_else(|| {
                            stream
                                .get("codec_long_name")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string())
                        });
                    info.video_codec = codec;
                    info.width = stream.get("width").and_then(|v| v.as_u64()).map(|v| v as u32);
                    info.height = stream.get("height").and_then(|v| v.as_u64()).map(|v| v as u32);
                }
                Some("audio") if info.audio_codec.is_none() => {
                    let codec = stream
                        .get("codec_name")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                        .or_else(|| {
                            stream
                                .get("codec_tag_string")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string())
                        })
                        .or_else(|| {
                            stream
                                .get("codec_long_name")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string())
                        });
                    info.audio_codec = codec;
                }
                _ => {}
            }
        }
    }

    Ok(info)
}
