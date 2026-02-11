import { useCallback, useEffect, useRef, useState } from "react";
import { emitTo, listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

type VideoLike = {
  id: string;
  title: string;
};

type UsePlayerWindowManagerParams<TVideo extends VideoLike> = {
  isPlayerWindow: boolean;
  isStateReady: boolean;
  videosRef: React.RefObject<TVideo[]>;
  downloadDir: string;
  setErrorMessage: React.Dispatch<React.SetStateAction<string>>;
  setIsSettingsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  openPlayerInWindow: (video: TVideo, options?: { filePath?: string | null }) =>
    | Promise<void>
    | void;
  setPlayerTitle: React.Dispatch<React.SetStateAction<string>>;
  setPlayerError: React.Dispatch<React.SetStateAction<string>>;
  setIsPlayerOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

export function usePlayerWindowManager<TVideo extends VideoLike>({
  isPlayerWindow,
  isStateReady,
  videosRef,
  downloadDir,
  setErrorMessage,
  setIsSettingsOpen,
  openPlayerInWindow,
  setPlayerTitle,
  setPlayerError,
  setIsPlayerOpen,
}: UsePlayerWindowManagerParams<TVideo>) {
  const isDev = import.meta.env.DEV;
  const playerWindowMinWidth = 1280;
  const playerWindowMinHeight = 720;
  const [playerWindowActiveId, setPlayerWindowActiveId] = useState<
    string | null
  >(null);
  const [playerWindowActiveTitle, setPlayerWindowActiveTitle] = useState("");
  const [isSwitchConfirmOpen, setIsSwitchConfirmOpen] = useState(false);
  const [switchConfirmMessage, setSwitchConfirmMessage] = useState("");
  const [pendingSwitchVideo, setPendingSwitchVideo] = useState<TVideo | null>(
    null
  );
  const [pendingPlayerId, setPendingPlayerId] = useState<string | null>(null);
  const [pendingPlayerFilePath, setPendingPlayerFilePath] = useState<
    string | null
  >(null);
  const [pendingPlayerReady, setPendingPlayerReady] = useState(false);
  const pendingPlayerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const pendingPlayerPollRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );

  const openPlayerWindow = useCallback(
    async (video: TVideo, options?: { skipConfirm?: boolean }) => {
      const label = "player";
      const existing = await WebviewWindow.getByLabel(label);
      const resolveFilePath = async () => {
        if (!downloadDir) return null;
        try {
          const result = await invoke<string | null>("resolve_video_file", {
            id: video.id,
            title: video.title,
            outputDir: downloadDir,
          });
          console.log(
            `[player-open] resolved filePath=${result ? "yes" : "no"}`
          );
          return result;
        } catch {
          console.log("[player-open] resolve_video_file failed");
          return null;
        }
      };

      if (existing) {
        try {
          const isDifferentVideo =
            playerWindowActiveId !== null
              ? playerWindowActiveId !== video.id
              : true;
          if (isDifferentVideo && !options?.skipConfirm) {
            const currentTitle = playerWindowActiveTitle || "再生中の動画";
            setSwitchConfirmMessage(
              `${currentTitle}を再生中ですが切り替えますか？`
            );
            setPendingSwitchVideo(video);
            setIsSwitchConfirmOpen(true);
            return;
          }
          const filePath = await resolveFilePath();
          void invoke("set_pending_player_open", {
            label,
            id: video.id,
            filePath,
          });
          await emitTo(label, "player-open", { id: video.id, filePath });
          if (import.meta.env.DEV) {
            void invoke("open_devtools_window", { label });
          }
          try {
            await existing.setTitle(video.title);
          } catch {
            // ignore title errors
          }
          await existing.setFocus();
          existing.once("tauri://destroyed", () => {
            setPlayerWindowActiveId(null);
            setPlayerWindowActiveTitle("");
          });
          setPlayerWindowActiveId(video.id);
          setPlayerWindowActiveTitle(video.title);
        } catch {
          setErrorMessage("プレイヤーウィンドウの起動に失敗しました。");
        }
        return;
      }

      const url = `index.html?player=1&videoId=${encodeURIComponent(video.id)}`;
      const filePathPromise = resolveFilePath();
      const playerWindow = new WebviewWindow(label, {
        title: video.title,
        url,
        width: 1200,
        height: 800,
        minWidth: playerWindowMinWidth,
        minHeight: playerWindowMinHeight,
        resizable: true,
      });
      playerWindow.once("tauri://created", () => {
        if (import.meta.env.DEV) {
          void invoke("open_devtools_window", { label });
        }
        void filePathPromise.then((filePath) => {
          void invoke("set_pending_player_open", {
            label,
            id: video.id,
            filePath,
          });
          void emitTo(label, "player-open", { id: video.id, filePath });
        });
      });
      playerWindow.once("tauri://error", () => {
        setErrorMessage("プレイヤーウィンドウの作成に失敗しました。");
      });
      playerWindow.once("tauri://destroyed", () => {
        setPlayerWindowActiveId(null);
        setPlayerWindowActiveTitle("");
      });
      setPlayerWindowActiveId(video.id);
      setPlayerWindowActiveTitle(video.title);
    },
    [
      downloadDir,
      playerWindowActiveId,
      playerWindowActiveTitle,
      setErrorMessage,
      setPlayerWindowActiveId,
      setPlayerWindowActiveTitle,
    ]
  );

  const closeSwitchConfirm = useCallback(() => {
    setIsSwitchConfirmOpen(false);
    setSwitchConfirmMessage("");
    setPendingSwitchVideo(null);
  }, []);

  const confirmSwitch = useCallback(async () => {
    const target = pendingSwitchVideo;
    closeSwitchConfirm();
    if (!target) return;
    await openPlayerWindow(target, { skipConfirm: true });
  }, [pendingSwitchVideo, closeSwitchConfirm, openPlayerWindow]);

  const openPlayer = useCallback(
    async (video: TVideo, filePath?: string | null) => {
      if (!isPlayerWindow) {
        if (!downloadDir) {
          setErrorMessage("保存先フォルダが未設定です。設定から選択してください。");
          setIsSettingsOpen(true);
          return;
        }
        await openPlayerWindow(video);
        return;
      }
      await openPlayerInWindow(video, { filePath });
    },
    [
      isPlayerWindow,
      downloadDir,
      setErrorMessage,
      setIsSettingsOpen,
      openPlayerWindow,
      openPlayerInWindow,
    ]
  );

  useEffect(() => {
    if (isPlayerWindow) return;
    let unlisten: (() => void) | null = null;
    const setup = async () => {
      unlisten = await listen<{ id: string; title: string }>(
        "player-active",
        (event) => {
          setPlayerWindowActiveId(event.payload.id);
          setPlayerWindowActiveTitle(event.payload.title);
        }
      );
    };
    void setup();
    return () => {
      if (unlisten) unlisten();
    };
  }, [isPlayerWindow]);

  useEffect(() => {
    if (!isPlayerWindow) return;
    let unlisten: (() => void) | null = null;
    const setup = async () => {
      unlisten = await listen<{ id: string; filePath?: string | null }>(
        "player-open",
        (event) => {
          setPendingPlayerId(event.payload.id);
          setPendingPlayerFilePath(event.payload.filePath ?? null);
          setPendingPlayerReady(true);
          if (isDev) {
            console.log(
              `[player-open] id=${event.payload.id} filePath=${
                event.payload.filePath ? "yes" : "no"
              }`
            );
          }
          if (pendingPlayerTimeoutRef.current) {
            window.clearTimeout(pendingPlayerTimeoutRef.current);
            pendingPlayerTimeoutRef.current = null;
          }
          if (pendingPlayerPollRef.current) {
            window.clearInterval(pendingPlayerPollRef.current);
            pendingPlayerPollRef.current = null;
          }
        }
      );
    };
    void setup();
    return () => {
      if (unlisten) unlisten();
    };
  }, [isPlayerWindow]);

  useEffect(() => {
    if (!isPlayerWindow) return;
    const params = new URLSearchParams(window.location.search);
    const initialId = params.get("videoId");
    if (!initialId) return;
    setPendingPlayerId((prev) => prev ?? initialId);
    setPendingPlayerFilePath((prev) => prev ?? null);
    const label = "player";
    const poll = window.setInterval(() => {
      void invoke<{ id: string; filePath?: string | null } | null>(
        "take_pending_player_open",
        { label }
      ).then((payload) => {
        if (!payload) return;
        setPendingPlayerId(payload.id);
        setPendingPlayerFilePath(payload.filePath ?? null);
        setPendingPlayerReady(true);
          if (isDev) {
            console.log(
              `[player-open] pending store id=${payload.id} filePath=${
                payload.filePath ? "yes" : "no"
              }`
            );
          }
        if (pendingPlayerTimeoutRef.current) {
          window.clearTimeout(pendingPlayerTimeoutRef.current);
          pendingPlayerTimeoutRef.current = null;
        }
        if (pendingPlayerPollRef.current) {
          window.clearInterval(pendingPlayerPollRef.current);
          pendingPlayerPollRef.current = null;
        }
      });
    }, 200);
    pendingPlayerPollRef.current = poll;
    const timer = window.setTimeout(() => {
      if (isDev) {
        console.log(`[player-open] timeout fallback id=${initialId}`);
      }
      setPendingPlayerReady(true);
      if (pendingPlayerPollRef.current) {
        window.clearInterval(pendingPlayerPollRef.current);
        pendingPlayerPollRef.current = null;
      }
    }, 5000);
    pendingPlayerTimeoutRef.current = timer;
    return () => {
      window.clearTimeout(timer);
      if (pendingPlayerTimeoutRef.current === timer) {
        pendingPlayerTimeoutRef.current = null;
      }
      if (pendingPlayerPollRef.current === poll) {
        window.clearInterval(pendingPlayerPollRef.current);
        pendingPlayerPollRef.current = null;
      }
    };
  }, [isPlayerWindow]);

  useEffect(() => {
    if (!isPlayerWindow || !isStateReady || !pendingPlayerId || !pendingPlayerReady) {
      return;
    }
    const target = videosRef.current.find((item) => item.id === pendingPlayerId);
    if (!target) {
      setPlayerTitle("動画が見つかりませんでした。");
      setPlayerError("ライブラリに該当する動画が見つかりませんでした。");
      setIsPlayerOpen(true);
      return;
    }
    void openPlayer(target, pendingPlayerFilePath);
  }, [
    isPlayerWindow,
    isStateReady,
    pendingPlayerId,
    pendingPlayerReady,
    pendingPlayerFilePath,
    videosRef,
    openPlayer,
    setPlayerTitle,
    setPlayerError,
    setIsPlayerOpen,
  ]);

  return {
    isSwitchConfirmOpen,
    switchConfirmMessage,
    closeSwitchConfirm,
    confirmSwitch,
    openPlayer,
  };
}
