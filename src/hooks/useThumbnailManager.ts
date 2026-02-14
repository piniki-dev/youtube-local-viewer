import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  convertImageToPng,
  deriveUploaderHandle,
  guessThumbnailExtension,
} from "../utils/metadataHelpers";

type VideoLike = {
  id: string;
  thumbnail?: string;
};

type UseThumbnailManagerParams<TVideo extends VideoLike> = {
  videosRef: React.RefObject<TVideo[]>;
  downloadDirRef: React.RefObject<string>;
  setVideos: React.Dispatch<React.SetStateAction<TVideo[]>>;
};

export function useThumbnailManager<TVideo extends VideoLike>({
  videosRef,
  downloadDirRef,
  setVideos,
}: UseThumbnailManagerParams<TVideo>) {
  const resolveThumbnailPath = useCallback(
    async (
      videoId: string,
      title: string,
      uploaderId: string | null | undefined,
      uploaderUrl: string | null | undefined,
      channelUrl: string | null | undefined,
      thumbnailUrls: Array<string | null | undefined>
    ) => {
      const candidates = thumbnailUrls
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => item.length > 0);
      if (candidates.length === 0) return undefined;
      try {
        for (const url of candidates) {
          try {
            const response = await fetch(url);
            if (!response.ok) {
              continue;
            }
            const contentType = response.headers.get("content-type");
            const buffer = await response.arrayBuffer();
            const converted = await convertImageToPng(buffer);
            const extension = converted
              ? "png"
              : guessThumbnailExtension(url, contentType);
            const data = Array.from(converted ?? new Uint8Array(buffer));
            const handle = deriveUploaderHandle(uploaderId, uploaderUrl, channelUrl);
            
            // uploaderIdが取得できない場合はローカル保存をスキップ
            if (!handle) {
              return url;
            }
            
            const savedPath = await invoke<string>("save_thumbnail", {
              videoId,
              title,
              uploaderId: handle,
              outputDir: downloadDirRef.current || null,
              data,
              extension,
            });
            return savedPath || url;
          } catch {
            // try next candidate
          }
        }
        return candidates[0];
      } catch {
        return candidates[0];
      }
    },
    [downloadDirRef]
  );

  const refreshThumbnailsForDir = useCallback(
    async (outputDir: string) => {
      const snapshot = videosRef.current;
      if (!outputDir || snapshot.length === 0) return;
      const updates = new Map<string, string>();
      for (const video of snapshot) {
        if (!video.thumbnail || isRemoteThumbnail(video.thumbnail)) continue;
        try {
          const resolved = await invoke<string | null>("resolve_thumbnail_path", {
            outputDir,
            id: video.id,
          });
          if (resolved && resolved !== video.thumbnail) {
            updates.set(video.id, resolved);
          }
        } catch {
          // ignore lookup failures
        }
      }
      if (updates.size === 0) return;
      setVideos((prev) =>
        prev.map((item) => {
          const next = updates.get(item.id);
          return next ? { ...item, thumbnail: next } : item;
        })
      );
    },
    [setVideos, videosRef]
  );

  return { resolveThumbnailPath, refreshThumbnailsForDir };
}

const isRemoteThumbnail = (value?: string | null) => {
  if (!value) return false;
  return (
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("asset://") ||
    value.startsWith("data:")
  );
};
