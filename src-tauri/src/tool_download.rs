use std::env;
use std::fs;
use std::io;
use std::path::PathBuf;

use futures_util::StreamExt;
use tauri::{AppHandle, Emitter};

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ToolDownloadProgress {
    tool: String,
    status: String,
    bytes_downloaded: u64,
    bytes_total: Option<u64>,
    message: String,
}

fn emit_progress(
    app: &AppHandle,
    tool: &str,
    status: &str,
    bytes_downloaded: u64,
    bytes_total: Option<u64>,
    message: &str,
) {
    let _ = app.emit(
        "tool-download-progress",
        ToolDownloadProgress {
            tool: tool.to_string(),
            status: status.to_string(),
            bytes_downloaded,
            bytes_total,
            message: message.to_string(),
        },
    );
}

fn tools_base_dir() -> Result<PathBuf, String> {
    env::var("LOCALAPPDATA")
        .map(|s| PathBuf::from(s).join("Programs"))
        .map_err(|_| "LOCALAPPDATA環境変数が見つかりません".to_string())
}

async fn download_file_with_progress(
    app: &AppHandle,
    url: &str,
    target: &PathBuf,
    tool_name: &str,
) -> Result<(), String> {
    emit_progress(app, tool_name, "downloading", 0, None, "ダウンロード開始...");

    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|e| format!("HTTPクライアント作成失敗: {}", e))?;

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("ダウンロード開始失敗: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTPエラー: {}", response.status()));
    }

    let total_size = response.content_length();
    let tmp_path = target.with_extension("tmp");

    let mut file = fs::File::create(&tmp_path)
        .map_err(|e| format!("一時ファイル作成失敗: {}", e))?;

    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();
    let mut last_emit: u64 = 0;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("ダウンロードエラー: {}", e))?;
        io::Write::write_all(&mut file, &chunk)
            .map_err(|e| format!("書き込みエラー: {}", e))?;
        downloaded += chunk.len() as u64;

        if downloaded - last_emit > 256 * 1024 {
            last_emit = downloaded;
            let msg = if let Some(total) = total_size {
                let pct = (downloaded as f64 / total as f64 * 100.0) as u32;
                format!(
                    "ダウンロード中... {:.1}MB / {:.1}MB ({}%)",
                    downloaded as f64 / 1_048_576.0,
                    total as f64 / 1_048_576.0,
                    pct
                )
            } else {
                format!(
                    "ダウンロード中... {:.1}MB",
                    downloaded as f64 / 1_048_576.0
                )
            };
            emit_progress(app, tool_name, "downloading", downloaded, total_size, &msg);
        }
    }

    drop(file);
    fs::rename(&tmp_path, target).map_err(|e| format!("ファイル移動失敗: {}", e))?;

    emit_progress(
        app,
        tool_name,
        "done",
        downloaded,
        total_size,
        "ダウンロード完了",
    );
    Ok(())
}

fn extract_ffmpeg_binaries(zip_path: &PathBuf, target_dir: &PathBuf) -> Result<(), String> {
    let file =
        fs::File::open(zip_path).map_err(|e| format!("ZIPファイルを開けません: {}", e))?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|e| format!("ZIPアーカイブの読み取り失敗: {}", e))?;

    let mut found_ffmpeg = false;
    let mut found_ffprobe = false;

    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("ZIPエントリ読み取り失敗: {}", e))?;
        let name = entry.name().to_string();

        let target_name = if name.ends_with("/bin/ffmpeg.exe") || name.ends_with("\\bin\\ffmpeg.exe")
        {
            found_ffmpeg = true;
            Some("ffmpeg.exe")
        } else if name.ends_with("/bin/ffprobe.exe") || name.ends_with("\\bin\\ffprobe.exe") {
            found_ffprobe = true;
            Some("ffprobe.exe")
        } else {
            None
        };

        if let Some(target_name) = target_name {
            let target_path = target_dir.join(target_name);
            let tmp_path = target_path.with_extension("tmp");
            let mut out_file =
                fs::File::create(&tmp_path).map_err(|e| format!("ファイル作成失敗: {}", e))?;
            io::copy(&mut entry, &mut out_file)
                .map_err(|e| format!("ファイル展開失敗: {}", e))?;
            drop(out_file);
            fs::rename(&tmp_path, &target_path)
                .map_err(|e| format!("ファイル移動失敗: {}", e))?;
        }

        if found_ffmpeg && found_ffprobe {
            break;
        }
    }

    if !found_ffmpeg {
        return Err("ZIPにffmpeg.exeが見つかりません".to_string());
    }
    if !found_ffprobe {
        return Err("ZIPにffprobe.exeが見つかりません".to_string());
    }

    Ok(())
}

async fn download_yt_dlp(app: &AppHandle) -> Result<(), String> {
    let target_dir = tools_base_dir()?.join("yt-dlp");
    fs::create_dir_all(&target_dir)
        .map_err(|e| format!("ディレクトリ作成失敗: {}", e))?;
    let target_path = target_dir.join("yt-dlp.exe");

    let url = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe";
    download_file_with_progress(app, url, &target_path, "yt-dlp").await
}

async fn download_ffmpeg(app: &AppHandle) -> Result<(), String> {
    let target_dir = tools_base_dir()?.join("ffmpeg").join("bin");
    fs::create_dir_all(&target_dir)
        .map_err(|e| format!("ディレクトリ作成失敗: {}", e))?;

    let url = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip";
    let temp_zip = target_dir
        .parent()
        .unwrap()
        .join("ffmpeg-download.zip");

    download_file_with_progress(app, url, &temp_zip, "ffmpeg").await?;

    emit_progress(app, "ffmpeg", "extracting", 0, None, "展開中...");
    extract_ffmpeg_binaries(&temp_zip, &target_dir)?;

    let _ = fs::remove_file(&temp_zip);
    emit_progress(app, "ffmpeg", "done", 0, None, "ffmpeg/ffprobeの配置完了");
    Ok(())
}

#[tauri::command]
pub async fn download_tools(app: AppHandle, tools: Vec<String>) -> Result<(), String> {
    for tool in &tools {
        match tool.as_str() {
            "yt-dlp" => {
                if let Err(e) = download_yt_dlp(&app).await {
                    emit_progress(&app, "yt-dlp", "error", 0, None, &e);
                    return Err(e);
                }
            }
            "ffmpeg" => {
                if let Err(e) = download_ffmpeg(&app).await {
                    emit_progress(&app, "ffmpeg", "error", 0, None, &e);
                    return Err(e);
                }
            }
            _ => return Err(format!("不明なツール: {}", tool)),
        }
    }
    Ok(())
}
