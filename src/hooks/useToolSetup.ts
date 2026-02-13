import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import i18n from "../i18n";

type ToolingCheckStatus = {
  ok: boolean;
  path: string;
};

type ToolingCheckResult = {
  ytDlp: ToolingCheckStatus;
  ffmpeg: ToolingCheckStatus;
  ffprobe: ToolingCheckStatus;
};

type ToolDownloadProgressPayload = {
  tool: string;
  status: string;
  bytesDownloaded: number;
  bytesTotal: number | null;
  message: string;
};

export type MissingTool = {
  name: string;
  label: string;
};

export type DownloadState = {
  active: boolean;
  currentTool: string;
  bytesDownloaded: number;
  bytesTotal: number | null;
  status: "idle" | "downloading" | "extracting" | "done" | "error";
  message: string;
  error: string | null;
};

type UseToolSetupParams = {
  toolingStatus: ToolingCheckResult | null;
  isStateReady: boolean;
  refreshTooling: () => void;
};

const INITIAL_DOWNLOAD_STATE: DownloadState = {
  active: false,
  currentTool: "",
  bytesDownloaded: 0,
  bytesTotal: null,
  status: "idle",
  message: "",
  error: null,
};

export function useToolSetup({
  toolingStatus,
  isStateReady,
  refreshTooling,
}: UseToolSetupParams) {
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [downloadState, setDownloadState] =
    useState<DownloadState>(INITIAL_DOWNLOAD_STATE);
  const dismissedRef = useRef(false);
  const shownRef = useRef(false);

  useEffect(() => {
    if (!isStateReady || !toolingStatus || dismissedRef.current || shownRef.current) return;
    const hasMissing =
      !toolingStatus.ytDlp.ok ||
      !toolingStatus.ffmpeg.ok ||
      !toolingStatus.ffprobe.ok;
    if (hasMissing) {
      shownRef.current = true;
      setIsSetupOpen(true);
    }
  }, [toolingStatus, isStateReady]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    const setup = async () => {
      unlisten = await listen<ToolDownloadProgressPayload>(
        "tool-download-progress",
        (event) => {
          const p = event.payload;
          setDownloadState((prev) => ({
            ...prev,
            active:
              p.status === "downloading" || p.status === "extracting",
            currentTool: p.tool,
            bytesDownloaded: p.bytesDownloaded,
            bytesTotal: p.bytesTotal,
            status: p.status as DownloadState["status"],
            message: p.message,
            error: p.status === "error" ? p.message : prev.error,
          }));
        }
      );
    };
    void setup();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const missingTools: MissingTool[] = [];
  if (toolingStatus) {
    if (!toolingStatus.ytDlp.ok)
      missingTools.push({ name: "yt-dlp", label: "yt-dlp" });
    if (!toolingStatus.ffmpeg.ok)
      missingTools.push({ name: "ffmpeg", label: "ffmpeg" });
    if (!toolingStatus.ffprobe.ok)
      missingTools.push({ name: "ffprobe", label: "ffprobe" });
  }

  const startDownload = useCallback(async () => {
    const tools: string[] = [];
    if (toolingStatus && !toolingStatus.ytDlp.ok) tools.push("yt-dlp");
    if (
      toolingStatus &&
      (!toolingStatus.ffmpeg.ok || !toolingStatus.ffprobe.ok)
    ) {
      tools.push("ffmpeg");
    }
    if (tools.length === 0) return;

    setDownloadState({
      active: true,
      currentTool: tools[0],
      bytesDownloaded: 0,
      bytesTotal: null,
      status: "downloading",
      message: "ダウンロード準備中...",
      error: null,
    });

    try {
      await invoke("download_tools", { tools });
      refreshTooling();
      setDownloadState((prev) => ({
        ...prev,
        active: false,
        status: "done",
        message: i18n.t('errors.setupComplete'),
      }));
    } catch (e) {
      setDownloadState((prev) => ({
        ...prev,
        active: false,
        status: "error",
        error: String(e),
      }));
    }
  }, [toolingStatus, refreshTooling]);

  const skipSetup = useCallback(() => {
    dismissedRef.current = true;
    setIsSetupOpen(false);
    setDownloadState(INITIAL_DOWNLOAD_STATE);
  }, []);

  const closeSetup = useCallback(() => {
    if (downloadState.active) return;
    dismissedRef.current = true;
    setIsSetupOpen(false);
    setDownloadState(INITIAL_DOWNLOAD_STATE);
  }, [downloadState.active]);

  return {
    isSetupOpen,
    downloadState,
    missingTools,
    startDownload,
    skipSetup,
    closeSetup,
  };
}
