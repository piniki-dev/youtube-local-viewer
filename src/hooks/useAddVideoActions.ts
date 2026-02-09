import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { buildMetadataFields, parseVideoId } from "../utils/metadataHelpers";

type VideoBase = {
  id: string;
  title: string;
  channel: string;
  thumbnail?: string;
  sourceUrl: string;
  downloadStatus: "pending" | "downloading" | "downloaded" | "failed";
  commentsStatus: "pending" | "downloading" | "downloaded" | "failed" | "unavailable";
  addedAt: string;
} & Record<string, unknown>;

type ChannelFeedItem = {
  id?: string | null;
  title?: string | null;
  channel?: string | null;
  thumbnail?: string | null;
  url?: string | null;
  webpageUrl?: string | null;
  durationSec?: number | null;
  uploadDate?: string | null;
  releaseTimestamp?: number | null;
  timestamp?: number | null;
  liveStatus?: string | null;
  isLive?: boolean | null;
  wasLive?: boolean | null;
  viewCount?: number | null;
  likeCount?: number | null;
  commentCount?: number | null;
  tags?: string[] | null;
  categories?: string[] | null;
  description?: string | null;
  channelId?: string | null;
  uploaderId?: string | null;
  channelUrl?: string | null;
  uploaderUrl?: string | null;
  availability?: string | null;
  language?: string | null;
  audioLanguage?: string | null;
  ageLimit?: number | null;
};

type UseAddVideoActionsParams<TVideo extends VideoBase> = {
  videos: TVideo[];
  setVideos: React.Dispatch<React.SetStateAction<TVideo[]>>;
  videoUrl: string;
  setVideoUrl: React.Dispatch<React.SetStateAction<string>>;
  channelUrl: string;
  setChannelUrl: React.Dispatch<React.SetStateAction<string>>;
  downloadOnAdd: boolean;
  setErrorMessage: React.Dispatch<React.SetStateAction<string>>;
  setIsAdding: React.Dispatch<React.SetStateAction<boolean>>;
  setIsAddOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsChannelFetchOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setChannelFetchProgress: React.Dispatch<React.SetStateAction<number>>;
  setChannelFetchMessage: React.Dispatch<React.SetStateAction<string>>;
  scheduleBackgroundMetadataFetch: (items: Array<{ id: string; sourceUrl?: string | null }>) => void;
  startDownload: (video: TVideo) => Promise<void> | void;
  cookiesFile: string;
  cookiesSource: "none" | "file" | "browser";
  cookiesBrowser: string;
  remoteComponents: "none" | "ejs:github" | "ejs:npm";
  ytDlpPath: string;
};

export function useAddVideoActions<TVideo extends VideoBase>({
  videos,
  setVideos,
  videoUrl,
  setVideoUrl,
  channelUrl,
  setChannelUrl,
  downloadOnAdd,
  setErrorMessage,
  setIsAdding,
  setIsAddOpen,
  setIsChannelFetchOpen,
  setChannelFetchProgress,
  setChannelFetchMessage,
  scheduleBackgroundMetadataFetch,
  startDownload,
  cookiesFile,
  cookiesSource,
  cookiesBrowser,
  remoteComponents,
  ytDlpPath,
}: UseAddVideoActionsParams<TVideo>) {
  const addVideo = useCallback(async () => {
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
    setIsAddOpen(false);
    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`;
      const oembedRes = await fetch(oembedUrl);
      if (!oembedRes.ok) {
        setErrorMessage("存在しない動画URLです。");
        setIsAddOpen(true);
        return;
      }
      const data = await oembedRes.json();
      const metaFields = buildMetadataFields({
        webpageUrl: null,
        durationSec: null,
        uploadDate: null,
        releaseTimestamp: null,
        timestamp: null,
        liveStatus: null,
        isLive: null,
        wasLive: null,
        viewCount: null,
        likeCount: null,
        commentCount: null,
        tags: null,
        categories: null,
        description: null,
        channelId: null,
        uploaderId: null,
        channelUrl: null,
        uploaderUrl: null,
        availability: null,
        language: null,
        audioLanguage: null,
        ageLimit: null,
      });
      const primaryThumbnail = data?.thumbnail_url ?? null;
      const newVideo = {
        id,
        title: data?.title ?? "Untitled",
        channel: data?.author_name ?? "YouTube",
        thumbnail: primaryThumbnail ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        sourceUrl: trimmed,
        ...metaFields,
        downloadStatus: "pending",
        commentsStatus: "pending",
        addedAt: new Date().toISOString(),
      } as unknown as TVideo;
      setVideos((prev) => [newVideo, ...prev]);
      scheduleBackgroundMetadataFetch([{ id, sourceUrl: trimmed }]);
      if (downloadOnAdd) {
        void startDownload(newVideo);
      }
      setVideoUrl("");
      setIsAddOpen(false);
    } catch {
      setErrorMessage("動画情報の取得に失敗しました。");
      setIsAddOpen(true);
    } finally {
      setIsAdding(false);
    }
  }, [
    videoUrl,
    videos,
    setErrorMessage,
    setIsAdding,
    setIsAddOpen,
    setVideos,
    scheduleBackgroundMetadataFetch,
    downloadOnAdd,
    startDownload,
    setVideoUrl,
  ]);

  const addChannelVideos = useCallback(async () => {
    setErrorMessage("");
    const trimmed = channelUrl.trim();
    if (!trimmed) {
      setErrorMessage("チャンネルURLを入力してください。");
      return;
    }

    setIsAdding(true);
    setIsChannelFetchOpen(true);
    setChannelFetchProgress(0);
    setChannelFetchMessage("チャンネル情報を取得中...");
    try {
      setChannelFetchProgress(5);
      setChannelFetchMessage("動画一覧を取得中...");
      const result = await invoke<ChannelFeedItem[]>("list_channel_videos", {
        url: trimmed,
        cookiesFile: cookiesFile || null,
        cookiesSource: cookiesSource || null,
        cookiesBrowser: cookiesSource === "browser" ? cookiesBrowser || null : null,
        remoteComponents: remoteComponents === "none" ? null : remoteComponents,
        ytDlpPath: ytDlpPath || null,
        limit: null,
      });
      setChannelFetchProgress(10);

      const existingIds = new Set(videos.map((v) => v.id));
      const candidates = (result ?? []).filter(
        (item) => item?.id && !existingIds.has(item.id)
      );
      const totalCandidates = candidates.length;
      setChannelFetchMessage(
        `動画リストを整理中... (0/${Math.max(totalCandidates, 0)})`
      );

      const baseTime = Date.now();
      const total = result?.length ?? 0;
      let completed = 0;
      const newItems = await Promise.all(
        candidates.map(async (item, index) => {
          const addedAt = new Date(baseTime + (total - index)).toISOString();
          const metaFields = buildMetadataFields({
            webpageUrl: item.webpageUrl ?? item.url ?? null,
            durationSec: item.durationSec ?? null,
            uploadDate: item.uploadDate ?? null,
            releaseTimestamp: item.releaseTimestamp ?? null,
            timestamp: item.timestamp ?? null,
            liveStatus: item.liveStatus ?? null,
            isLive: item.isLive ?? null,
            wasLive: item.wasLive ?? null,
            viewCount: item.viewCount ?? null,
            likeCount: item.likeCount ?? null,
            commentCount: item.commentCount ?? null,
            tags: item.tags ?? null,
            categories: item.categories ?? null,
            description: item.description ?? null,
            channelId: item.channelId ?? null,
            uploaderId: item.uploaderId ?? null,
            channelUrl: item.channelUrl ?? null,
            uploaderUrl: item.uploaderUrl ?? null,
            availability: item.availability ?? null,
            language: item.language ?? null,
            audioLanguage: item.audioLanguage ?? null,
            ageLimit: item.ageLimit ?? null,
          });
          const primaryThumbnail = item.thumbnail ?? null;
          const fallbackThumbnail = `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`;
          completed += 1;
          const ratio = totalCandidates > 0 ? completed / totalCandidates : 1;
          const progress = Math.min(95, Math.round(10 + ratio * 85));
          setChannelFetchProgress(progress);
          setChannelFetchMessage(
            `動画リストを整理中... (${completed}/${totalCandidates})`
          );
          return {
            id: item.id as string,
            title: item.title || "Untitled",
            channel: item.channel?.trim() || "YouTube",
            thumbnail: primaryThumbnail ?? fallbackThumbnail,
            sourceUrl: item.url || `https://www.youtube.com/watch?v=${item.id}`,
            ...metaFields,
            downloadStatus: "pending",
            commentsStatus: "pending",
            addedAt,
          } as unknown as TVideo;
        })
      );

      if (newItems.length === 0) {
        setErrorMessage("追加できる新しい動画が見つかりませんでした。");
        return;
      }

      setChannelFetchMessage(`追加中... (${newItems.length}件)`);
      setVideos((prev) => [...newItems, ...prev]);
      scheduleBackgroundMetadataFetch(
        newItems.map((item) => ({ id: item.id, sourceUrl: item.sourceUrl }))
      );
      setChannelUrl("");
      setIsAddOpen(false);
      setChannelFetchProgress(100);
      setChannelFetchMessage("完了しました");
    } catch (err) {
      const detail =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : "";
      setErrorMessage(
        detail
          ? `チャンネルの動画取得に失敗しました。${detail}`
          : "チャンネルの動画取得に失敗しました。"
      );
    } finally {
      setIsAdding(false);
      setTimeout(() => {
        setIsChannelFetchOpen(false);
        setChannelFetchProgress(0);
        setChannelFetchMessage("");
      }, 400);
    }
  }, [
    channelUrl,
    cookiesBrowser,
    cookiesFile,
    cookiesSource,
    remoteComponents,
    ytDlpPath,
    scheduleBackgroundMetadataFetch,
    setChannelFetchMessage,
    setChannelFetchProgress,
    setChannelUrl,
    setErrorMessage,
    setIsAddOpen,
    setIsAdding,
    setIsChannelFetchOpen,
    setVideos,
    videos,
  ]);

  return { addVideo, addChannelVideos };
}
