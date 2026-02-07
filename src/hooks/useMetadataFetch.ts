import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

type MetadataFetchState = {
  active: boolean;
  total: number;
  completed: number;
};

type VideoMetadata = {
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

type MetadataFinished = {
  id: string;
  success: boolean;
  stdout: string;
  stderr: string;
  metadata?: VideoMetadata | null;
  hasLiveChat?: boolean | null;
};

type VideoLike = {
  id: string;
  title: string;
  channel: string;
  sourceUrl: string;
  thumbnail?: string;
  commentsStatus: "pending" | "downloading" | "downloaded" | "failed" | "unavailable";
  metadataFetched?: boolean;
} & Record<string, unknown>;

type BuildMetadataFields<TVideo extends VideoLike> = (input: {
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
}) => Partial<TVideo>;

type UseMetadataFetchParams<TVideo extends VideoLike> = {
  videosRef: React.RefObject<TVideo[]>;
  downloadDirRef: React.RefObject<string>;
  cookiesFile: string;
  cookiesSource: "none" | "file" | "browser";
  cookiesBrowser: string;
  remoteComponents: "none" | "ejs:github" | "ejs:npm";
  ytDlpPath: string;
  ffmpegPath: string;
  addDownloadErrorItem: (
    id: string,
    phase: "video" | "comments" | "metadata",
    details: string
  ) => void;
  buildMetadataFields: BuildMetadataFields<TVideo>;
  buildThumbnailCandidates: (
    id: string,
    primary?: string | null
  ) => Array<string | null | undefined>;
  resolveThumbnailPath: (
    videoId: string,
    title: string,
    uploaderId: string | null | undefined,
    uploaderUrl: string | null | undefined,
    channelUrl: string | null | undefined,
    thumbnailUrls: Array<string | null | undefined>
  ) => Promise<string | undefined>;
  setVideos: React.Dispatch<React.SetStateAction<TVideo[]>>;
  isStateReady: boolean;
  isDataCheckDone: boolean;
  ytDlpUpdateDone: boolean;
  integritySummaryTotal: number;
  integrityIssuesLength: number;
};

export function useMetadataFetch<TVideo extends VideoLike>({
  videosRef,
  downloadDirRef,
  cookiesFile,
  cookiesSource,
  cookiesBrowser,
  remoteComponents,
  ytDlpPath,
  ffmpegPath,
  addDownloadErrorItem,
  buildMetadataFields,
  buildThumbnailCandidates,
  resolveThumbnailPath,
  setVideos,
  isStateReady,
  isDataCheckDone,
  ytDlpUpdateDone,
  integritySummaryTotal,
  integrityIssuesLength,
}: UseMetadataFetchParams<TVideo>) {
  const [metadataFetch, setMetadataFetch] = useState<MetadataFetchState>({
    active: false,
    total: 0,
    completed: 0,
  });
  const [metadataPaused, setMetadataPaused] = useState(false);
  const [metadataPauseReason, setMetadataPauseReason] = useState("");

  const pendingMetadataIdsRef = useRef<Set<string>>(new Set());
  const pendingMetadataUpdatesRef = useRef<Map<string, Partial<TVideo>>>(
    new Map()
  );
  const metadataFlushTimerRef = useRef<number | null>(null);
  const metadataQueueRef = useRef<Array<{ id: string; sourceUrl?: string | null }>>(
    []
  );
  const metadataActiveIdRef = useRef<string | null>(null);
  const metadataActiveItemRef = useRef<
    { id: string; sourceUrl?: string | null } | null
  >(null);
  const metadataPausedRef = useRef(false);
  const autoMetadataCheckRef = useRef(false);
  const autoMetadataStartupRef = useRef(false);
  const prevMetadataActiveRef = useRef(false);

  const flushMetadataUpdates = useCallback(() => {
    if (metadataFlushTimerRef.current !== null) {
      window.clearTimeout(metadataFlushTimerRef.current);
      metadataFlushTimerRef.current = null;
    }
    const updates = new Map(pendingMetadataUpdatesRef.current);
    pendingMetadataUpdatesRef.current.clear();
    if (updates.size === 0) return;
    setVideos((prev: TVideo[]) =>
      prev.map((item: TVideo) => {
        const patch = updates.get(item.id);
        return patch ? ({ ...item, ...patch } as TVideo) : item;
      })
    );
  }, [setVideos]);

  const scheduleMetadataFlush = useCallback(() => {
    if (metadataFlushTimerRef.current !== null) return;
    metadataFlushTimerRef.current = window.setTimeout(() => {
      flushMetadataUpdates();
    }, 300);
  }, [flushMetadataUpdates]);

  const startNextMetadataDownload = useCallback(async () => {
    if (metadataActiveIdRef.current) return;
    if (metadataPausedRef.current) return;
    const next = metadataQueueRef.current.shift();
    if (!next) return;

    const outputDir = downloadDirRef.current.trim();
    if (!outputDir) {
      pendingMetadataIdsRef.current.delete(next.id);
      setMetadataFetch((prev) => {
        const completed = prev.completed + 1;
        const active = completed < prev.total;
        return { ...prev, completed, active };
      });
      if (metadataQueueRef.current.length > 0) {
        window.setTimeout(startNextMetadataDownload, 0);
      }
      return;
    }

    const detailUrl =
      next.sourceUrl?.trim() || `https://www.youtube.com/watch?v=${next.id}`;
    metadataActiveIdRef.current = next.id;
    metadataActiveItemRef.current = next;
    try {
      await invoke("start_metadata_download", {
        id: next.id,
        url: detailUrl,
        outputDir,
        cookiesFile: cookiesFile || null,
        cookiesSource: cookiesSource || null,
        cookiesBrowser: cookiesSource === "browser" ? cookiesBrowser || null : null,
        remoteComponents: remoteComponents === "none" ? null : remoteComponents,
        ytDlpPath: ytDlpPath || null,
        ffmpegPath: ffmpegPath || null,
      });
    } catch {
      pendingMetadataIdsRef.current.delete(next.id);
      metadataActiveIdRef.current = null;
      setMetadataFetch((prev) => {
        const completed = prev.completed + 1;
        const active = completed < prev.total;
        return { ...prev, completed, active };
      });
      if (metadataQueueRef.current.length > 0) {
        window.setTimeout(startNextMetadataDownload, 0);
      }
    }
  }, [
    cookiesFile,
    cookiesSource,
    cookiesBrowser,
    remoteComponents,
    ytDlpPath,
    ffmpegPath,
    downloadDirRef,
  ]);

  const scheduleBackgroundMetadataFetch = useCallback(
    (items: Array<{ id: string; sourceUrl?: string | null }>) => {
      const outputDir = downloadDirRef.current.trim();
      if (!outputDir || items.length === 0) return;
      const normalizedItems = items
        .map((item) => ({
          id: item.id,
          sourceUrl:
            item.sourceUrl?.trim() || `https://www.youtube.com/watch?v=${item.id}`,
        }))
        .filter((item) => item.id);
      const uniqueItems = normalizedItems.filter(
        (item) => !pendingMetadataIdsRef.current.has(item.id)
      );
      if (uniqueItems.length === 0) return;

      uniqueItems.forEach((item) => {
        pendingMetadataIdsRef.current.add(item.id);
        metadataQueueRef.current.push(item);
      });

      setMetadataFetch((prev) => ({
        active: true,
        total: prev.total + uniqueItems.length,
        completed: prev.completed,
      }));

      const start = () => startNextMetadataDownload();
      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(() => start(), { timeout: 1500 });
        return;
      }
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.setTimeout(start, 0);
        });
      });
    },
    [downloadDirRef, startNextMetadataDownload]
  );

  const checkAndStartMetadataRecovery = useCallback(
    async (force = false) => {
      if (!ytDlpUpdateDone) return;
      if (autoMetadataCheckRef.current) return;
      if (metadataPausedRef.current) return;
      if (!force && (integritySummaryTotal > 0 || integrityIssuesLength > 0)) return;
      const outputDir = downloadDirRef.current.trim();
      if (!outputDir) return;

      autoMetadataCheckRef.current = true;
      try {
        const snapshot = videosRef.current;
        const candidates: Array<{ id: string; sourceUrl?: string | null }> = [];

        let infoIds = new Set<string>();
        let chatIds = new Set<string>();
        try {
          const index = await invoke<{ infoIds: string[]; chatIds: string[] }>(
            "get_metadata_index",
            { outputDir }
          );
          infoIds = new Set(index?.infoIds ?? []);
          chatIds = new Set(index?.chatIds ?? []);
        } catch {
          infoIds = new Set();
          chatIds = new Set();
        }

        for (const video of snapshot) {
          if (!video?.id) continue;
          if (pendingMetadataIdsRef.current.has(video.id)) continue;
          if (metadataActiveIdRef.current === video.id) continue;

          const needsLiveChatRetry =
            video.commentsStatus === "pending" || video.commentsStatus === "failed";

          const hasInfo = infoIds.has(video.id);
          const hasChat = chatIds.has(video.id);

          if (!hasInfo || (needsLiveChatRetry && !hasChat)) {
            candidates.push({ id: video.id, sourceUrl: video.sourceUrl });
          }
        }

        if (candidates.length > 0) {
          scheduleBackgroundMetadataFetch(candidates);
        }
      } finally {
        autoMetadataCheckRef.current = false;
      }
    },
    [
      ytDlpUpdateDone,
      integritySummaryTotal,
      integrityIssuesLength,
      scheduleBackgroundMetadataFetch,
      downloadDirRef,
      videosRef,
    ]
  );

  useEffect(() => {
    metadataPausedRef.current = metadataPaused;
  }, [metadataPaused]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    const setup = async () => {
      unlisten = await listen<MetadataFinished>(
        "metadata-finished",
        (event) => {
          const { id, success, metadata, hasLiveChat, stderr, stdout } =
            event.payload;
          metadataActiveIdRef.current = null;
          pendingMetadataIdsRef.current.delete(id);

          if (success) {
            metadataActiveItemRef.current = null;
            const currentVideo = videosRef.current.find(
              (item: TVideo) => item.id === id
            );
            const patch: Partial<TVideo> = {};

            if (metadata) {
              const metaFields = buildMetadataFields({
                webpageUrl: metadata.webpageUrl ?? null,
                durationSec: metadata.durationSec ?? null,
                uploadDate: metadata.uploadDate ?? null,
                releaseTimestamp: metadata.releaseTimestamp ?? null,
                timestamp: metadata.timestamp ?? null,
                liveStatus: metadata.liveStatus ?? null,
                isLive: metadata.isLive ?? null,
                wasLive: metadata.wasLive ?? null,
                viewCount: metadata.viewCount ?? null,
                likeCount: metadata.likeCount ?? null,
                commentCount: metadata.commentCount ?? null,
                tags: metadata.tags ?? null,
                categories: metadata.categories ?? null,
                description: metadata.description ?? null,
                channelId: metadata.channelId ?? null,
                uploaderId: metadata.uploaderId ?? null,
                channelUrl: metadata.channelUrl ?? null,
                uploaderUrl: metadata.uploaderUrl ?? null,
                availability: metadata.availability ?? null,
                language: metadata.language ?? null,
                audioLanguage: metadata.audioLanguage ?? null,
                ageLimit: metadata.ageLimit ?? null,
              });
              patch.title = (metadata.title ?? currentVideo?.title) || "Untitled";
              patch.channel =
                (metadata.channel ?? currentVideo?.channel) || "YouTube";
              patch.sourceUrl =
                metadata.webpageUrl ?? metadata.url ?? currentVideo?.sourceUrl ?? "";
              patch.thumbnail =
                currentVideo?.thumbnail ?? metadata.thumbnail ?? currentVideo?.thumbnail;
              Object.assign(patch, metaFields);
            }

            if (metadata) {
              const thumbnailCandidates = buildThumbnailCandidates(
                id,
                metadata.thumbnail ?? currentVideo?.thumbnail ?? null
              );
              void (async () => {
                const savedThumbnail = await resolveThumbnailPath(
                  id,
                  metadata.title ?? currentVideo?.title ?? "Untitled",
                  metadata.uploaderId ?? null,
                  metadata.uploaderUrl ?? null,
                  metadata.channelUrl ?? null,
                  thumbnailCandidates
                );
                if (savedThumbnail) {
                  pendingMetadataUpdatesRef.current.set(
                    id,
                    { thumbnail: savedThumbnail } as Partial<TVideo>
                  );
                  scheduleMetadataFlush();
                }
              })();
            }

            patch.metadataFetched = true;

            if (typeof hasLiveChat === "boolean") {
              if (hasLiveChat) {
                if (currentVideo?.commentsStatus !== "downloaded") {
                  patch.commentsStatus = "downloaded";
                }
              } else if (currentVideo?.commentsStatus === "pending") {
                patch.commentsStatus = "unavailable";
              }
            }

            if (Object.keys(patch).length > 0) {
              pendingMetadataUpdatesRef.current.set(id, patch);
              scheduleMetadataFlush();
            }
          } else {
            const details = stderr || stdout || "不明なエラー";
            addDownloadErrorItem(id, "metadata", details);
            const activeItem = metadataActiveItemRef.current;
            if (activeItem) {
              metadataQueueRef.current.unshift(activeItem);
              metadataActiveItemRef.current = null;
            }
            setMetadataPauseReason(details);
            setMetadataPaused(true);
          }

          setMetadataFetch((prev) => {
            const completed = prev.completed + 1;
            const active = completed < prev.total;
            return { ...prev, completed, active };
          });

          if (!metadataPausedRef.current && metadataQueueRef.current.length > 0) {
            window.setTimeout(startNextMetadataDownload, 250);
          }
        }
      );
    };
    void setup();
    return () => {
      if (unlisten) unlisten();
    };
  }, [
    addDownloadErrorItem,
    buildMetadataFields,
    buildThumbnailCandidates,
    resolveThumbnailPath,
    scheduleMetadataFlush,
    startNextMetadataDownload,
    videosRef,
  ]);

  useEffect(() => {
    if (!isStateReady || autoMetadataStartupRef.current) return;
    if (!isDataCheckDone || !ytDlpUpdateDone) return;
    autoMetadataStartupRef.current = true;
    void checkAndStartMetadataRecovery();
  }, [
    isStateReady,
    isDataCheckDone,
    ytDlpUpdateDone,
    checkAndStartMetadataRecovery,
  ]);

  useEffect(() => {
    const wasActive = prevMetadataActiveRef.current;
    if (wasActive && !metadataFetch.active) {
      void checkAndStartMetadataRecovery();
    }
    prevMetadataActiveRef.current = metadataFetch.active;
  }, [metadataFetch.active, checkAndStartMetadataRecovery]);

  const retryMetadataFetch = useCallback(() => {
    setMetadataPaused(false);
    setMetadataPauseReason("");
    window.setTimeout(startNextMetadataDownload, 0);
  }, [startNextMetadataDownload]);

  return {
    metadataFetch,
    metadataPaused,
    metadataPauseReason,
    scheduleBackgroundMetadataFetch,
    checkAndStartMetadataRecovery,
    retryMetadataFetch,
  };
}
