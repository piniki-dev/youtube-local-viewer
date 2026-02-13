import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import i18n from "../i18n";

type FloatingNoticeItem = {
  id: string;
  kind: "success" | "error";
  title: string;
  details?: string;
  createdAt: number;
};

type YtDlpUpdatePayload = {
  status?: "updated" | "failed" | string;
  stdout?: string;
  stderr?: string;
};

type UseYtDlpUpdateNoticesParams = {
  isStateReady: boolean;
  isDataCheckDone: boolean;
  ytDlpAvailable: boolean;
};

export function useYtDlpUpdateNotices({
  isStateReady,
  isDataCheckDone,
  ytDlpAvailable,
}: UseYtDlpUpdateNoticesParams) {
  const [ytDlpNotices, setYtDlpNotices] = useState<FloatingNoticeItem[]>([]);
  const [ytDlpUpdateDone, setYtDlpUpdateDone] = useState(false);
  const noticeRef = useRef<{ key: string; at: number } | null>(null);
  const updateRequestedRef = useRef(false);

  const addYtDlpNotice = useCallback(
    (kind: "success" | "error", title: string, details?: string) => {
      const id = `yt-dlp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const createdAt = Date.now();
      setYtDlpNotices((prev) => {
        const next: FloatingNoticeItem = { id, kind, title, details, createdAt };
        return [next, ...prev].slice(0, 3);
      });
      window.setTimeout(() => {
        setYtDlpNotices((prev) => prev.filter((item) => item.id !== id));
      }, 8000);
    },
    []
  );

  const dismissYtDlpNotice = useCallback((id: string) => {
    setYtDlpNotices((prev) => prev.filter((item) => item.id !== id));
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    const setup = async () => {
      unlisten = await listen<YtDlpUpdatePayload>("yt-dlp-update", (event) => {
        const status = event.payload?.status;
        if (!status) return;
        setYtDlpUpdateDone(true);
        const stdout = (event.payload?.stdout ?? "").trim();
        const stderr = (event.payload?.stderr ?? "").trim();
        const key = `${status}|${stdout}|${stderr}`;
        const now = Date.now();
        const last = noticeRef.current;
        if (last && last.key === key && now - last.at < 5000) {
          return;
        }
        noticeRef.current = { key, at: now };
        if (status === "updated") {
          const details = stdout || stderr || "";
          addYtDlpNotice(
            "success",
            "yt-dlpを更新しました。",
            details.trim() || undefined
          );
        } else if (status === "failed") {
          const details = stderr || stdout || i18n.t('errors.unknownError');
          addYtDlpNotice("error", i18n.t('errors.ytdlpUpdateFailed'), details);
        }
      });
    };
    void setup();
    return () => {
      if (unlisten) unlisten();
    };
  }, [addYtDlpNotice]);

  useEffect(() => {
    if (!isStateReady || !isDataCheckDone || !ytDlpAvailable) return;
    if (updateRequestedRef.current) return;
    updateRequestedRef.current = true;
    void invoke("update_yt_dlp");
  }, [isStateReady, isDataCheckDone, ytDlpAvailable]);

  return { ytDlpNotices, dismissYtDlpNotice, ytDlpUpdateDone };
}
