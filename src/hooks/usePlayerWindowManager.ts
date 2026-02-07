import { useCallback, useEffect, useState } from "react";
import { emitTo, listen } from "@tauri-apps/api/event";
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
  openPlayerInWindow: (video: TVideo) => Promise<void> | void;
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

  const openPlayerWindow = useCallback(
    async (video: TVideo, options?: { skipConfirm?: boolean }) => {
      const label = "player";
      const existing = await WebviewWindow.getByLabel(label);
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
          await emitTo(label, "player-open", { id: video.id });
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
      const playerWindow = new WebviewWindow(label, {
        title: video.title,
        url,
        width: 1200,
        height: 800,
        resizable: true,
      });
      playerWindow.once("tauri://created", () => {
        void emitTo(label, "player-open", { id: video.id });
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
    async (video: TVideo) => {
      if (!isPlayerWindow) {
        if (!downloadDir) {
          setErrorMessage("保存先フォルダが未設定です。設定から選択してください。");
          setIsSettingsOpen(true);
          return;
        }
        await openPlayerWindow(video);
        return;
      }
      await openPlayerInWindow(video);
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
      unlisten = await listen<{ id: string }>("player-open", (event) => {
        setPendingPlayerId(event.payload.id);
      });
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
    if (initialId) setPendingPlayerId(initialId);
  }, [isPlayerWindow]);

  useEffect(() => {
    if (!isPlayerWindow || !isStateReady || !pendingPlayerId) return;
    const target = videosRef.current.find((item) => item.id === pendingPlayerId);
    if (!target) {
      setPlayerTitle("動画が見つかりませんでした。");
      setPlayerError("ライブラリに該当する動画が見つかりませんでした。");
      setIsPlayerOpen(true);
      return;
    }
    void openPlayer(target);
  }, [
    isPlayerWindow,
    isStateReady,
    pendingPlayerId,
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
