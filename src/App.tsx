import { useEffect, useMemo, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import "./App.css";

type DownloadStatus = "pending" | "downloading" | "downloaded" | "failed";
type CommentStatus = "pending" | "downloading" | "downloaded" | "failed";

type VideoItem = {
  id: string;
  title: string;
  channel: string;
  thumbnail?: string;
  sourceUrl: string;
  downloadStatus: DownloadStatus;
  commentsStatus: CommentStatus;
  addedAt: string;
};

type DownloadFinished = {
  id: string;
  success: boolean;
  stdout: string;
  stderr: string;
};

type CommentFinished = {
  id: string;
  success: boolean;
  stdout: string;
  stderr: string;
};

type CommentItem = {
  author: string;
  text: string;
  likeCount?: number;
  publishedAt?: string;
};

type MediaInfo = {
  videoCodec?: string | null;
  audioCodec?: string | null;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  container?: string | null;
};

const VIDEO_STORAGE_KEY = "ytlv_videos";
const DOWNLOAD_DIR_KEY = "ytlv_download_dir";
const COOKIES_FILE_KEY = "ytlv_cookies_file";
const REMOTE_COMPONENTS_KEY = "ytlv_remote_components";

type PersistedState = {
  videos: VideoItem[];
  downloadDir?: string | null;
  cookiesFile?: string | null;
  remoteComponents?: string | null;
};

function App() {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [downloadOnAdd, setDownloadOnAdd] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [downloadDir, setDownloadDir] = useState<string>("");
  const [downloadingIds, setDownloadingIds] = useState<string[]>([]);
  const [videoErrors, setVideoErrors] = useState<Record<string, string>>({});
  const [isErrorOpen, setIsErrorOpen] = useState(false);
  const [errorTargetId, setErrorTargetId] = useState<string | null>(null);
  const [cookiesFile, setCookiesFile] = useState<string>("");
  const [progressLines, setProgressLines] = useState<Record<string, string>>({});
  const [commentsDownloadingIds, setCommentsDownloadingIds] = useState<string[]>([]);
  const [commentErrors, setCommentErrors] = useState<Record<string, string>>({});
  const [commentProgressLines, setCommentProgressLines] = useState<Record<string, string>>({});
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsTitle, setCommentsTitle] = useState("");
  const [commentsList, setCommentsList] = useState<CommentItem[]>([]);
  const [commentsError, setCommentsError] = useState("");
  const [isStateReady, setIsStateReady] = useState(false);
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const [playerTitle, setPlayerTitle] = useState("");
  const [playerSrc, setPlayerSrc] = useState<string | null>(null);
  const [playerError, setPlayerError] = useState("");
  const [playerLoading, setPlayerLoading] = useState(false);
  const [playerVideoId, setPlayerVideoId] = useState<string | null>(null);
  const [playerDebug, setPlayerDebug] = useState<string>("");
  const [playerFilePath, setPlayerFilePath] = useState<string | null>(null);
  const [mediaInfoById, setMediaInfoById] = useState<Record<string, MediaInfo | null>>({});
  const [mediaInfoErrors, setMediaInfoErrors] = useState<Record<string, string>>({});
  const [mediaInfoLoadingIds, setMediaInfoLoadingIds] = useState<string[]>([]);
  const [hasCheckedFiles, setHasCheckedFiles] = useState(false);
  const [remoteComponents, setRemoteComponents] = useState<
    "none" | "ejs:github" | "ejs:npm"
  >("none");

  useEffect(() => {
    const load = async () => {
      let loadedVideos: VideoItem[] = [];
      let loadedDownloadDir: string | null = null;
      let loadedCookiesFile: string | null = null;
      let loadedRemote: string | null = null;
      try {
        const state = await invoke<PersistedState>("load_state");
        if (Array.isArray(state?.videos) && state.videos.length > 0) {
          loadedVideos = state.videos;
        }
        loadedDownloadDir = state?.downloadDir ?? null;
        loadedCookiesFile = state?.cookiesFile ?? null;
        loadedRemote = state?.remoteComponents ?? null;
      } catch {
        loadedVideos = [];
      }

      if (loadedVideos.length === 0) {
        const raw = localStorage.getItem(VIDEO_STORAGE_KEY);
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as VideoItem[];
            if (Array.isArray(parsed)) {
              loadedVideos = parsed;
            }
          } catch {
            loadedVideos = [];
          }
        }
      }

      const normalizedVideos = loadedVideos.map((item) => ({
        ...item,
        commentsStatus: item.commentsStatus ?? "pending",
      }));
      setVideos(normalizedVideos);

      if (!loadedDownloadDir) {
        const legacyDir = localStorage.getItem(DOWNLOAD_DIR_KEY);
        if (legacyDir) loadedDownloadDir = legacyDir;
      }
      if (!loadedCookiesFile) {
        const legacyCookies = localStorage.getItem(COOKIES_FILE_KEY);
        if (legacyCookies) loadedCookiesFile = legacyCookies;
      }
      if (!loadedRemote) {
        const legacyRemote = localStorage.getItem(REMOTE_COMPONENTS_KEY);
        if (legacyRemote) loadedRemote = legacyRemote;
      }

      if (loadedDownloadDir) setDownloadDir(loadedDownloadDir);
      if (loadedCookiesFile) setCookiesFile(loadedCookiesFile);
      if (loadedRemote === "ejs:github" || loadedRemote === "ejs:npm") {
        setRemoteComponents(loadedRemote);
      }

      try {
        await invoke("save_state", {
          state: {
            videos: normalizedVideos,
            downloadDir: loadedDownloadDir,
            cookiesFile: loadedCookiesFile,
            remoteComponents: loadedRemote,
          } satisfies PersistedState,
        });
      } catch {
        // ignore migration errors
      }

      setIsStateReady(true);
    };

    void load();
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    const setup = async () => {
      unlisten = await listen<{ id: string; line: string }>(
        "download-progress",
        (event) => {
          const { id, line } = event.payload;
          setProgressLines((prev) => ({ ...prev, [id]: line }));
        }
      );
    };
    void setup();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    const setup = async () => {
      unlisten = await listen<DownloadFinished>(
        "download-finished",
        (event) => {
          const { id, success, stderr, stdout } = event.payload;
          setDownloadingIds((prev) => prev.filter((item) => item !== id));
          if (success) {
            setVideos((prev) =>
              prev.map((v) =>
                v.id === id ? { ...v, downloadStatus: "downloaded" } : v
              )
            );
            setVideoErrors((prev) => {
              const next = { ...prev };
              delete next[id];
              return next;
            });
            setProgressLines((prev) => {
              const next = { ...prev };
              delete next[id];
              return next;
            });
          } else {
            setVideos((prev) =>
              prev.map((v) =>
                v.id === id ? { ...v, downloadStatus: "failed" } : v
              )
            );
            const details = stderr || stdout || "不明なエラー";
            setVideoErrors((prev) => ({ ...prev, [id]: details }));
            setErrorMessage("ダウンロードに失敗しました。詳細を確認してください。");
          }
        }
      );
    };
    void setup();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    const setup = async () => {
      unlisten = await listen<{ id: string; line: string }>(
        "comments-progress",
        (event) => {
          const { id, line } = event.payload;
          setCommentProgressLines((prev) => ({ ...prev, [id]: line }));
        }
      );
    };
    void setup();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    const setup = async () => {
      unlisten = await listen<CommentFinished>(
        "comments-finished",
        (event) => {
          const { id, success, stderr, stdout } = event.payload;
          setCommentsDownloadingIds((prev) => prev.filter((item) => item !== id));
          if (success) {
            setVideos((prev) =>
              prev.map((v) =>
                v.id === id ? { ...v, commentsStatus: "downloaded" } : v
              )
            );
            setCommentErrors((prev) => {
              const next = { ...prev };
              delete next[id];
              return next;
            });
            setCommentProgressLines((prev) => {
              const next = { ...prev };
              delete next[id];
              return next;
            });
          } else {
            setVideos((prev) =>
              prev.map((v) =>
                v.id === id ? { ...v, commentsStatus: "failed" } : v
              )
            );
            const details = stderr || stdout || "不明なエラー";
            setCommentErrors((prev) => ({ ...prev, [id]: details }));
            setErrorMessage("ライブチャット取得に失敗しました。詳細を確認してください。");
          }
        }
      );
    };
    void setup();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  useEffect(() => {
    if (!isStateReady) return;
    localStorage.setItem(VIDEO_STORAGE_KEY, JSON.stringify(videos));
    const persist = async () => {
      try {
        await invoke("save_state", {
          state: {
            videos,
            downloadDir: downloadDir || null,
            cookiesFile: cookiesFile || null,
            remoteComponents: remoteComponents || null,
          } satisfies PersistedState,
        });
      } catch {
        // ignore store errors to avoid blocking UI
      }
    };
    void persist();
  }, [videos, downloadDir, cookiesFile, remoteComponents, isStateReady]);

  useEffect(() => {
    if (!isStateReady) return;
    setHasCheckedFiles(false);
  }, [downloadDir, isStateReady]);

  useEffect(() => {
    if (!isStateReady || hasCheckedFiles) return;
    if (!downloadDir || videos.length === 0) return;

    const verifyLocalFiles = async () => {
      const checks = await Promise.all(
        videos.map(async (video) => {
          let videoOk = true;
          let commentsOk = true;

          if (video.downloadStatus === "downloaded") {
            try {
              videoOk = await invoke<boolean>("video_file_exists", {
                id: video.id,
                title: video.title,
                outputDir: downloadDir,
              });
            } catch {
              videoOk = false;
            }
          }

          if (video.commentsStatus === "downloaded") {
            try {
              commentsOk = await invoke<boolean>("comments_file_exists", {
                id: video.id,
                outputDir: downloadDir,
              });
            } catch {
              commentsOk = false;
            }
          }

          return { id: video.id, videoOk, commentsOk };
        })
      );

      const checkMap = new Map(checks.map((item) => [item.id, item]));

      setVideos((prev) =>
        prev.map((video) => {
          const result = checkMap.get(video.id);
          if (!result) return video;
          let next = video;
          if (video.downloadStatus === "downloaded" && !result.videoOk) {
            next = { ...next, downloadStatus: "failed" };
          }
          if (video.commentsStatus === "downloaded" && !result.commentsOk) {
            next = { ...next, commentsStatus: "failed" };
          }
          return next;
        })
      );

      setVideoErrors((prev) => {
        const next = { ...prev };
        for (const item of checks) {
          if (!item.videoOk) {
            next[item.id] = "動画ファイルが見つかりません。再ダウンロードしてください。";
          } else if (next[item.id]?.includes("動画ファイルが見つかりません")) {
            delete next[item.id];
          }
        }
        return next;
      });

      setCommentErrors((prev) => {
        const next = { ...prev };
        for (const item of checks) {
          if (!item.commentsOk) {
            next[item.id] = "コメントファイルが見つかりません。再取得してください。";
          } else if (next[item.id]?.includes("コメントファイルが見つかりません")) {
            delete next[item.id];
          }
        }
        return next;
      });

      setHasCheckedFiles(true);
    };

    void verifyLocalFiles();
  }, [isStateReady, hasCheckedFiles, downloadDir, videos]);

  const parseVideoId = (url: string) => {
    try {
      const u = new URL(url);
      if (u.hostname.includes("youtu.be")) {
        return u.pathname.replace("/", "");
      }
      if (u.pathname.startsWith("/shorts/")) {
        return u.pathname.split("/shorts/")[1]?.split("/")[0] ?? null;
      }
      if (u.pathname.startsWith("/embed/")) {
        return u.pathname.split("/embed/")[1]?.split("/")[0] ?? null;
      }
      return u.searchParams.get("v");
    } catch {
      return null;
    }
  };

  const addVideo = async () => {
    setErrorMessage("");
    const trimmed = videoUrl.trim();
    const id = parseVideoId(trimmed);
    if (!id) {
      setErrorMessage("YouTubeの動画URLを正しく入力してください。");
      return;
    }

    if (videos.some((v) => v.id === id)) {
      setErrorMessage("同じ動画がすでに追加されています。");
      return;
    }

    setIsAdding(true);
    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`;
      const res = await fetch(oembedUrl);
      const data = res.ok ? await res.json() : null;
      const newVideo: VideoItem = {
        id,
        title: data?.title ?? "Untitled",
        channel: data?.author_name ?? "YouTube",
        thumbnail: data?.thumbnail_url ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        sourceUrl: trimmed,
        downloadStatus: "pending",
        commentsStatus: "pending",
        addedAt: new Date().toISOString(),
      };
      setVideos((prev) => [newVideo, ...prev]);
      if (downloadOnAdd) {
        void startDownload(newVideo);
      }
      setVideoUrl("");
      setIsAddOpen(false);
    } catch {
      setErrorMessage("動画情報の取得に失敗しました。");
    } finally {
      setIsAdding(false);
    }
  };

  const startDownload = async (video: VideoItem) => {
    if (!downloadDir) {
      setErrorMessage("保存先フォルダが未設定です。設定から選択してください。");
      setIsSettingsOpen(true);
      return;
    }
    setDownloadingIds((prev) => (prev.includes(video.id) ? prev : [...prev, video.id]));
    setVideos((prev) =>
      prev.map((v) =>
        v.id === video.id ? { ...v, downloadStatus: "downloading" } : v
      )
    );
    try {
      await invoke("start_download", {
        id: video.id,
        url: video.sourceUrl,
        outputDir: downloadDir,
        cookiesFile: cookiesFile || null,
        remoteComponents: remoteComponents === "none" ? null : remoteComponents,
      });
    } catch {
      setVideos((prev) =>
        prev.map((v) =>
          v.id === video.id ? { ...v, downloadStatus: "failed" } : v
        )
      );
      setVideoErrors((prev) => ({
        ...prev,
        [video.id]: "yt-dlpの実行に失敗しました。",
      }));
      setProgressLines((prev) => ({
        ...prev,
        [video.id]: "yt-dlpの実行に失敗しました。",
      }));
      setErrorMessage("ダウンロードに失敗しました。詳細を確認してください。");
      setDownloadingIds((prev) => prev.filter((id) => id !== video.id));
    }
  };

  const startCommentsDownload = async (video: VideoItem) => {
    if (!downloadDir) {
      setErrorMessage("保存先フォルダが未設定です。設定から選択してください。");
      setIsSettingsOpen(true);
      return;
    }
    setCommentsDownloadingIds((prev) =>
      prev.includes(video.id) ? prev : [...prev, video.id]
    );
    setVideos((prev) =>
      prev.map((v) =>
        v.id === video.id ? { ...v, commentsStatus: "downloading" } : v
      )
    );
    try {
      await invoke("start_comments_download", {
        id: video.id,
        url: video.sourceUrl,
        outputDir: downloadDir,
        cookiesFile: cookiesFile || null,
        remoteComponents: remoteComponents === "none" ? null : remoteComponents,
      });
    } catch {
      setVideos((prev) =>
        prev.map((v) =>
          v.id === video.id ? { ...v, commentsStatus: "failed" } : v
        )
      );
      setCommentErrors((prev) => ({
        ...prev,
        [video.id]: "yt-dlpの実行に失敗しました。",
      }));
      setCommentProgressLines((prev) => ({
        ...prev,
        [video.id]: "yt-dlpの実行に失敗しました。",
      }));
      setErrorMessage("ライブチャット取得に失敗しました。詳細を確認してください。");
      setCommentsDownloadingIds((prev) => prev.filter((id) => id !== video.id));
    }
  };

  const openComments = async (video: VideoItem) => {
    if (!downloadDir) {
      setErrorMessage("保存先フォルダが未設定です。設定から選択してください。");
      setIsSettingsOpen(true);
      return;
    }
    setCommentsLoading(true);
    setCommentsError("");
    setCommentsTitle(video.title);
    setIsCommentsOpen(true);
    try {
      const result = await invoke<CommentItem[]>("get_comments", {
        id: video.id,
        outputDir: downloadDir,
      });
      setCommentsList(result ?? []);
    } catch {
      setCommentsError("ライブチャットの読み込みに失敗しました。");
    } finally {
      setCommentsLoading(false);
    }
  };

  const openPlayer = async (video: VideoItem) => {
    if (!downloadDir) {
      setErrorMessage("保存先フォルダが未設定です。設定から選択してください。");
      setIsSettingsOpen(true);
      return;
    }

    setPlayerLoading(true);
    setPlayerError("");
    setPlayerTitle(video.title);
    setPlayerSrc(null);
    setPlayerVideoId(video.id);
    setPlayerDebug("");
    setPlayerFilePath(null);
    setIsPlayerOpen(true);

    try {
      const filePath = await invoke<string | null>("resolve_video_file", {
        id: video.id,
        title: video.title,
        outputDir: downloadDir,
      });
      if (!filePath) {
        setPlayerError("動画ファイルが見つかりませんでした。");
        return;
      }
      setPlayerFilePath(filePath);
      try {
        const info = await invoke<{
          videoCodec?: string | null;
          audioCodec?: string | null;
          width?: number | null;
          height?: number | null;
          duration?: number | null;
          container?: string | null;
        }>("probe_media", { filePath });
        setMediaInfoById((prev) => ({ ...prev, [video.id]: info }));
      } catch {
        // ignore probe errors here; user can run manual check
      }
      const src = convertFileSrc(filePath);
      setPlayerSrc(src);
    } catch {
      setPlayerError("動画ファイルの読み込みに失敗しました。");
    } finally {
      setPlayerLoading(false);
    }
  };

  const closePlayer = () => {
    setIsPlayerOpen(false);
    setPlayerSrc(null);
    setPlayerError("");
    setPlayerTitle("");
    setPlayerVideoId(null);
    setPlayerDebug("");
    setPlayerFilePath(null);
  };

  const openExternalPlayer = async () => {
    if (!playerFilePath) return;
    try {
      await openPath(playerFilePath);
    } catch {
      setPlayerError("外部プレイヤーの起動に失敗しました。");
    }
  };

  const revealInFolder = async () => {
    if (!playerFilePath) return;
    try {
      await revealItemInDir(playerFilePath);
    } catch {
      setPlayerError("フォルダの表示に失敗しました。");
    }
  };

  const formatDuration = (value?: number | null) => {
    if (!value || Number.isNaN(value)) return "";
    const total = Math.floor(value);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  };

  const checkMediaInfo = async (video: VideoItem) => {
    if (!downloadDir) {
      setErrorMessage("保存先フォルダが未設定です。設定から選択してください。");
      setIsSettingsOpen(true);
      return;
    }

    setMediaInfoLoadingIds((prev) => (prev.includes(video.id) ? prev : [...prev, video.id]));
    setMediaInfoErrors((prev) => {
      const next = { ...prev };
      delete next[video.id];
      return next;
    });
    setMediaInfoById((prev) => ({ ...prev, [video.id]: null }));

    try {
      const filePath = await invoke<string | null>("resolve_video_file", {
        id: video.id,
        title: video.title,
        outputDir: downloadDir,
      });
      if (!filePath) {
        setMediaInfoErrors((prev) => ({
          ...prev,
          [video.id]: "動画ファイルが見つかりません。",
        }));
        return;
      }

      const info = await invoke<{
        videoCodec?: string | null;
        audioCodec?: string | null;
        width?: number | null;
        height?: number | null;
        duration?: number | null;
        container?: string | null;
      }>("probe_media", { filePath });

      setMediaInfoById((prev) => ({ ...prev, [video.id]: info }));
    } catch {
      setMediaInfoErrors((prev) => ({
        ...prev,
        [video.id]: "コーデック情報の取得に失敗しました。ffprobeが必要です。",
      }));
    } finally {
      setMediaInfoLoadingIds((prev) => prev.filter((id) => id !== video.id));
    }
  };

  const pickDownloadDir = async () => {
    setErrorMessage("");
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: "保存先フォルダを選択",
      });
      if (typeof selected === "string" && selected) {
        setDownloadDir(selected);
        localStorage.setItem(DOWNLOAD_DIR_KEY, selected);
      }
    } catch {
      setErrorMessage("保存先の設定に失敗しました。");
    }
  };

  const pickCookiesFile = async () => {
    setErrorMessage("");
    try {
      const selected = await openDialog({
        directory: false,
        multiple: false,
        title: "YouTube Cookieファイルを選択",
      });
      if (typeof selected === "string" && selected) {
        setCookiesFile(selected);
        localStorage.setItem(COOKIES_FILE_KEY, selected);
      }
    } catch {
      setErrorMessage("Cookieファイルの設定に失敗しました。");
    }
  };

  const updateRemoteComponents = (value: "none" | "ejs:github" | "ejs:npm") => {
    setRemoteComponents(value);
    if (value === "none") {
      localStorage.removeItem(REMOTE_COMPONENTS_KEY);
    } else {
      localStorage.setItem(REMOTE_COMPONENTS_KEY, value);
    }
  };

  const sortedVideos = useMemo(
    () => [...videos].sort((a, b) => b.addedAt.localeCompare(a.addedAt)),
    [videos]
  );

  const formatPublishedAt = (value?: string) => {
    if (!value) return "";
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (/^\d{10,13}$/.test(trimmed)) {
      const num = Number(trimmed);
      if (!Number.isNaN(num)) {
        const ms = trimmed.length === 13 ? num : num * 1000;
        return new Date(ms).toLocaleString("ja-JP");
      }
    }
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleString("ja-JP");
    }
    return trimmed;
  };

  return (
    <main className="app">
      <header className="app-header">
        <div>
          <h1>YouTube Local Viewer</h1>
          <p className="subtitle">ローカル保存と再生のためのデスクトップアプリ</p>
        </div>
        <div className="header-actions">
          <button className="ghost" onClick={() => setIsSettingsOpen(true)}>
            設定
          </button>
          <button className="primary" onClick={() => setIsAddOpen(true)}>
            ＋ 動画を追加
          </button>
        </div>
      </header>

      {sortedVideos.length === 0 ? (
        <section className="empty">
          まだ動画がありません。右上の「＋ 動画を追加」から登録してください。
        </section>
      ) : (
        <section className="grid">
          {sortedVideos.map((video) => (
            <article key={video.id} className="video-card">
              <div className="thumbnail">
                {video.thumbnail && (
                  <img src={video.thumbnail} alt={video.title} />
                )}
              </div>
              <div className="video-info">
                {(() => {
                  const isDownloading = downloadingIds.includes(video.id);
                  const isCommentsDownloading = commentsDownloadingIds.includes(video.id);
                  const displayStatus = isDownloading
                    ? "downloading"
                    : video.downloadStatus;
                  return (
                    <>
                <h3>{video.title}</h3>
                <p>{video.channel}</p>
                <span
                  className={`badge ${
                    displayStatus === "downloaded"
                      ? "badge-success"
                      : displayStatus === "downloading"
                        ? "badge-pending"
                      : displayStatus === "pending"
                        ? "badge-pending"
                        : "badge-muted"
                  }`}
                >
                  {displayStatus === "downloaded"
                    ? "ダウンロード済"
                    : displayStatus === "downloading"
                      ? "ダウンロード中"
                    : displayStatus === "pending"
                      ? "未ダウンロード"
                      : "失敗"}
                </span>
                {video.downloadStatus === "failed" && videoErrors[video.id] && (
                  <div className="error-row">
                    <p className="error small">
                      {videoErrors[video.id].slice(0, 140)}
                    </p>
                    <button
                      className="ghost tiny"
                      onClick={() => {
                        setErrorTargetId(video.id);
                        setIsErrorOpen(true);
                      }}
                    >
                      詳細
                    </button>
                  </div>
                )}
                {progressLines[video.id] && (
                  <p className="progress-line">{progressLines[video.id]}</p>
                )}
                {displayStatus !== "downloaded" && (
                  <button
                    className="ghost small"
                    onClick={() => startDownload(video)}
                    disabled={isDownloading}
                  >
                    {isDownloading ? "ダウンロード中..." : "ダウンロード"}
                  </button>
                )}
                {displayStatus === "downloaded" && (
                  <div className="action-row">
                    <button
                      className="primary small"
                      onClick={() => openPlayer(video)}
                    >
                      再生
                    </button>
                    <button
                      className="ghost small"
                      onClick={() => checkMediaInfo(video)}
                      disabled={mediaInfoLoadingIds.includes(video.id)}
                    >
                      {mediaInfoLoadingIds.includes(video.id)
                        ? "確認中..."
                        : "コーデック確認"}
                    </button>
                  </div>
                )}
                {mediaInfoErrors[video.id] && (
                  <p className="error small">{mediaInfoErrors[video.id]}</p>
                )}
                {mediaInfoById[video.id] && (
                  <p className="progress-line codec-line">
                    動画: {mediaInfoById[video.id]?.videoCodec ?? "不明"}
                    {mediaInfoById[video.id]?.width && mediaInfoById[video.id]?.height
                      ? ` ${mediaInfoById[video.id]?.width}x${mediaInfoById[video.id]?.height}`
                      : ""}
                    {mediaInfoById[video.id]?.duration
                      ? ` / ${formatDuration(mediaInfoById[video.id]?.duration)}`
                      : ""}
                    {mediaInfoById[video.id]?.container
                      ? ` / 容器: ${mediaInfoById[video.id]?.container}`
                      : ""}
                    {mediaInfoById[video.id]?.audioCodec
                      ? ` / 音声: ${mediaInfoById[video.id]?.audioCodec}`
                      : ""}
                  </p>
                )}
                <div className="comment-row">
                  <span
                    className={`badge ${
                      isCommentsDownloading
                        ? "badge-pending"
                        : video.commentsStatus === "downloaded"
                          ? "badge-success"
                          : video.commentsStatus === "pending"
                            ? "badge-pending"
                            : "badge-muted"
                    }`}
                  >
                    {isCommentsDownloading
                      ? "ライブチャット取得中"
                      : video.commentsStatus === "downloaded"
                        ? "ライブチャット取得済"
                        : video.commentsStatus === "pending"
                          ? "ライブチャット未取得"
                          : "ライブチャット失敗"}
                  </span>
                  <button
                    className="ghost small"
                    onClick={() => startCommentsDownload(video)}
                    disabled={isCommentsDownloading}
                  >
                    {isCommentsDownloading ? "取得中..." : "ライブチャット取得"}
                  </button>
                  <button
                    className="ghost small"
                    onClick={() => openComments(video)}
                    disabled={video.commentsStatus !== "downloaded"}
                  >
                    チャットを見る
                  </button>
                </div>
                {video.commentsStatus === "failed" && commentErrors[video.id] && (
                  <p className="error small">
                    {commentErrors[video.id].slice(0, 140)}
                  </p>
                )}
                {commentProgressLines[video.id] && (
                  <p className="progress-line">{commentProgressLines[video.id]}</p>
                )}
                    </>
                  );
                })()}
              </div>
            </article>
          ))}
        </section>
      )}

      {isAddOpen && (
        <div className="modal-backdrop" onClick={() => setIsAddOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>動画を追加</h2>
              <button className="icon" onClick={() => setIsAddOpen(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <label>
                動画URL
                <input
                  type="url"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                />
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={downloadOnAdd}
                  onChange={(e) => setDownloadOnAdd(e.target.checked)}
                />
                追加と同時にダウンロードする
              </label>
              {errorMessage && <p className="error">{errorMessage}</p>}
            </div>
            <div className="modal-footer">
              <button className="ghost" onClick={() => setIsAddOpen(false)}>
                キャンセル
              </button>
              <button
                className="primary"
                onClick={addVideo}
                disabled={isAdding || !videoUrl.trim()}
              >
                追加
              </button>
            </div>
          </div>
        </div>
      )}

      {isSettingsOpen && (
        <div className="modal-backdrop" onClick={() => setIsSettingsOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>設定</h2>
              <button className="icon" onClick={() => setIsSettingsOpen(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="setting-row">
                <div>
                  <p className="setting-label">保存先フォルダ</p>
                  <p className="setting-value">
                    {downloadDir ? downloadDir : "未設定"}
                  </p>
                </div>
                <button className="ghost" onClick={pickDownloadDir}>
                  フォルダを選択
                </button>
              </div>
              <div className="setting-row">
                <div>
                  <p className="setting-label">YouTube Cookieファイル</p>
                  <p className="setting-value">
                    {cookiesFile ? cookiesFile : "未設定"}
                  </p>
                </div>
                <button className="ghost" onClick={pickCookiesFile}>
                  ファイルを選択
                </button>
              </div>
              <div className="setting-row">
                <div>
                  <p className="setting-label">Remote components (EJS)</p>
                  <p className="setting-value">
                    {remoteComponents === "none" ? "無効" : remoteComponents}
                  </p>
                </div>
                <div className="select-wrap">
                  <select
                    value={remoteComponents}
                    onChange={(e) =>
                      updateRemoteComponents(
                        e.target.value as "none" | "ejs:github" | "ejs:npm"
                      )
                    }
                  >
                    <option value="none">無効</option>
                    <option value="ejs:github">ejs:github（推奨）</option>
                    <option value="ejs:npm">ejs:npm</option>
                  </select>
                </div>
              </div>
              {errorMessage && <p className="error">{errorMessage}</p>}
            </div>
          </div>
        </div>
      )}

      {isErrorOpen && errorTargetId && (
        <div className="modal-backdrop" onClick={() => setIsErrorOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>エラー詳細</h2>
              <button className="icon" onClick={() => setIsErrorOpen(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <pre className="error-details">
                {videoErrors[errorTargetId] ?? "詳細がありません。"}
              </pre>
            </div>
            <div className="modal-footer">
              <button className="primary" onClick={() => setIsErrorOpen(false)}>
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {isCommentsOpen && (
        <div className="modal-backdrop" onClick={() => setIsCommentsOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>ライブチャット一覧</h2>
              <button className="icon" onClick={() => setIsCommentsOpen(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="comment-title">{commentsTitle}</div>
              {commentsLoading && <p className="progress-line">読み込み中...</p>}
              {commentsError && <p className="error">{commentsError}</p>}
              {!commentsLoading && !commentsError && commentsList.length === 0 && (
                <p className="progress-line">チャットが見つかりませんでした。</p>
              )}
              <div className="comment-list">
                {commentsList.map((comment, index) => (
                  <div key={`${comment.author}-${index}`} className="comment-item">
                    <div className="comment-meta">
                      <span>{comment.author}</span>
                      {comment.likeCount !== undefined && (
                        <span>👍 {comment.likeCount}</span>
                      )}
                      {comment.publishedAt && (
                        <span>{formatPublishedAt(comment.publishedAt)}</span>
                      )}
                    </div>
                    <div className="comment-text">{comment.text}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="primary" onClick={() => setIsCommentsOpen(false)}>
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {isPlayerOpen && (
        <div className="modal-backdrop" onClick={closePlayer}>
          <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>動画再生</h2>
              <button className="icon" onClick={closePlayer}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="comment-title">{playerTitle}</div>
              {playerLoading && <p className="progress-line">読み込み中...</p>}
              {playerError && <p className="error">{playerError}</p>}
              {playerSrc && !playerError && (
                <video
                  className="player-video"
                  controls
                  preload="metadata"
                  src={playerSrc}
                  onCanPlay={() => setPlayerError("")}
                  onError={(event) => {
                    const media = event.currentTarget;
                    const err = media.error;
                    const debug = `code=${err?.code ?? "none"} network=${media.networkState} ready=${media.readyState} src=${media.currentSrc}`;
                    setPlayerDebug(debug);
                    const info = playerVideoId ? mediaInfoById[playerVideoId] : null;
                    const v = info?.videoCodec?.toLowerCase();
                    const a = info?.audioCodec?.toLowerCase();
                    if (v && a && v.includes("h264") && a.includes("aac")) {
                      setPlayerError(
                        "この動画は再生できません。Linux側のコーデック(GStreamer)が未導入の可能性があります。"
                      );
                    } else if (v || a) {
                      setPlayerError(
                        "この動画は再生できません。H.264/AACで再ダウンロードしてください。"
                      );
                    } else {
                      setPlayerError(
                        "この動画は再生できません。コーデック未確認のため、先に『コーデック確認』を実行してください。"
                      );
                    }
                  }}
                />
              )}
              {playerDebug && (
                <p className="progress-line codec-line">{playerDebug}</p>
              )}
              {playerError && playerFilePath && (
                <div className="action-row">
                  <button className="ghost small" onClick={openExternalPlayer}>
                    外部プレイヤーで開く
                  </button>
                  <button className="ghost small" onClick={revealInFolder}>
                    フォルダを開く
                  </button>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="primary" onClick={closePlayer}>
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default App;
