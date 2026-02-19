use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::process::Child;
use std::sync::{Arc, Mutex};

#[derive(Clone, Copy, Serialize, Deserialize)]
pub struct WindowSizeConfig {
    pub width: u32,
    pub height: u32,
    pub x: Option<i32>,
    pub y: Option<i32>,
}

#[derive(Default)]
pub struct WindowSizeState {
    pub last_saved: Mutex<Option<(u32, u32)>>,
    pub last_position: Mutex<Option<(i32, i32)>>,
}

#[derive(Default)]
pub struct PlayerWindowSizeState {
    pub last_saved: Mutex<Option<(u32, u32)>>,
    pub last_position: Mutex<Option<(i32, i32)>>,
}

#[derive(Default)]
pub struct VideoIndexState {
    pub root_dir: Mutex<Option<String>>,
    pub index: Mutex<HashMap<String, String>>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingPlayerOpen {
    pub id: String,
    pub file_path: Option<String>,
}

#[derive(Default)]
pub struct PendingPlayerOpenState {
    pub pending: Mutex<HashMap<String, PendingPlayerOpen>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadFinished {
    pub id: String,
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
    pub cancelled: bool,
    pub is_private: bool,
    pub is_deleted: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommentsFinished {
    pub id: String,
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
    pub metadata: Option<VideoMetadata>,
    pub has_live_chat: Option<bool>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataFinished {
    pub id: String,
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
    pub metadata: Option<VideoMetadata>,
    pub has_live_chat: Option<bool>,
    pub is_private: bool,
    pub is_deleted: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataIndex {
    pub info_ids: Vec<String>,
    pub chat_ids: Vec<String>,
}

#[derive(Clone, Default)]
pub struct DownloadProcessState {
    pub children: Arc<Mutex<HashMap<String, Arc<Mutex<Child>>>>>,
    pub cancelled: Arc<Mutex<HashSet<String>>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommentItem {
    pub author: String,
    pub author_photo_url: Option<String>,
    pub text: String,
    pub runs: Option<Vec<CommentRun>>,
    pub like_count: Option<u64>,
    pub published_at: Option<String>,
    pub offset_ms: Option<u64>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommentRun {
    pub text: Option<String>,
    pub emoji: Option<CommentEmoji>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommentEmoji {
    pub id: Option<String>,
    pub url: Option<String>,
    pub label: Option<String>,
    pub is_custom: Option<bool>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaInfo {
    pub video_codec: Option<String>,
    pub audio_codec: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub duration: Option<f64>,
    pub container: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelVideoItem {
    pub id: String,
    pub title: String,
    pub channel: Option<String>,
    pub url: String,
    pub thumbnail: Option<String>,
    pub webpage_url: Option<String>,
    pub duration_sec: Option<u64>,
    pub upload_date: Option<String>,
    pub release_timestamp: Option<i64>,
    pub timestamp: Option<i64>,
    pub live_status: Option<String>,
    pub is_live: Option<bool>,
    pub was_live: Option<bool>,
    pub view_count: Option<u64>,
    pub like_count: Option<u64>,
    pub comment_count: Option<u64>,
    pub tags: Option<Vec<String>>,
    pub categories: Option<Vec<String>>,
    pub description: Option<String>,
    pub channel_id: Option<String>,
    pub uploader_id: Option<String>,
    pub channel_url: Option<String>,
    pub uploader_url: Option<String>,
    pub availability: Option<String>,
    pub language: Option<String>,
    pub audio_language: Option<String>,
    pub age_limit: Option<u64>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoMetadata {
    pub id: Option<String>,
    pub title: Option<String>,
    pub channel: Option<String>,
    pub thumbnail: Option<String>,
    pub url: Option<String>,
    pub webpage_url: Option<String>,
    pub duration_sec: Option<u64>,
    pub upload_date: Option<String>,
    pub release_timestamp: Option<i64>,
    pub timestamp: Option<i64>,
    pub live_status: Option<String>,
    pub is_live: Option<bool>,
    pub was_live: Option<bool>,
    pub view_count: Option<u64>,
    pub like_count: Option<u64>,
    pub comment_count: Option<u64>,
    pub tags: Option<Vec<String>>,
    pub categories: Option<Vec<String>>,
    pub description: Option<String>,
    pub channel_id: Option<String>,
    pub uploader_id: Option<String>,
    pub channel_url: Option<String>,
    pub uploader_url: Option<String>,
    pub availability: Option<String>,
    pub language: Option<String>,
    pub audio_language: Option<String>,
    pub age_limit: Option<u64>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalMetadataItem {
    pub id: String,
    pub metadata: VideoMetadata,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedState {
    pub videos: Vec<serde_json::Value>,
    pub download_dir: Option<String>,
    pub cookies_file: Option<String>,
    pub cookies_source: Option<String>,
    pub cookies_browser: Option<String>,
    pub remote_components: Option<String>,
    pub yt_dlp_path: Option<String>,
    pub ffmpeg_path: Option<String>,
    pub ffprobe_path: Option<String>,
    pub download_quality: Option<String>,
}

#[derive(Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PersistedSettings {
    pub download_dir: Option<String>,
    pub cookies_file: Option<String>,
    pub cookies_source: Option<String>,
    pub cookies_browser: Option<String>,
    pub remote_components: Option<String>,
    pub yt_dlp_path: Option<String>,
    pub ffmpeg_path: Option<String>,
    pub ffprobe_path: Option<String>,
    pub download_quality: Option<String>,
}

#[derive(Clone, Serialize, Deserialize, Default)]
pub struct PersistedVideos {
    pub videos: Vec<serde_json::Value>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionedSettings {
    pub version: u32,
    pub data: PersistedSettings,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionedVideos {
    pub version: u32,
    pub data: PersistedVideos,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalFileCheckItem {
    pub id: String,
    pub title: String,
    pub check_video: bool,
    pub check_comments: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalFileCheckResult {
    pub id: String,
    pub video_ok: bool,
    pub comments_ok: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolingCheckStatus {
    pub ok: bool,
    pub path: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolingCheckResult {
    pub yt_dlp: ToolingCheckStatus,
    pub ffmpeg: ToolingCheckStatus,
    pub ffprobe: ToolingCheckStatus,
}
