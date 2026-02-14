import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import i18n from "../i18n";

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

type LocalMetadataItem = {
  id: string;
  metadata: VideoMetadata;
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
  addFloatingNotice: (notice: {
    kind: "success" | "error" | "info";
    title: string;
    details?: string;
    autoDismissMs?: number;
  }) => void;
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
  addFloatingNotice,
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
  const startNextMetadataDownloadRef = useRef<(() => Promise<void>) | null>(null);
  const applyMetadataUpdateRef = useRef<((params: any) => void) | null>(null);
  const addDownloadErrorItemRef = useRef<((id: string, phase: "video" | "comments" | "metadata", details: string) => void) | null>(null);
  const addFloatingNoticeRef = useRef<((notice: any) => void) | null>(null);
  const scheduleMetadataFlushRef = useRef<(() => void) | null>(null);
  const metadataListenerSetupRef = useRef(false);

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

  const applyMetadataUpdate = useCallback(
    (params: {
      id: string;
      metadata?: VideoMetadata | null;
      hasLiveChat?: boolean | null;
      currentVideo?: TVideo | null;
      markMetadataFetched?: boolean;
    }) => {
      const {
        id,
        metadata,
        hasLiveChat,
        currentVideo,
        markMetadataFetched = false,
      } = params;
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
        
        // ライブ配信のタイトルからタイムスタンプを削除
        let cleanTitle = (metadata.title ?? currentVideo?.title) || "Untitled";
        // パターン: " YYYY-MM-DD HH:MM" を削除
        cleanTitle = cleanTitle.replace(/\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}$/, "");
        
        patch.title = cleanTitle;
        patch.channel = (metadata.channel ?? currentVideo?.channel) || "YouTube";
        
        // ライブ配信検出時に通知
        if (metadata.isLive || metadata.liveStatus === "is_live") {
          if (addFloatingNoticeRef.current) {
            addFloatingNoticeRef.current({
              kind: "info",
              title: i18n.t('errors.liveStreamDetected'),
              details: i18n.t('errors.liveStreamDetectedDetails'),
              autoDismissMs: 10000,
            });
          }
        }
        patch.sourceUrl =
          metadata.webpageUrl ?? metadata.url ?? currentVideo?.sourceUrl ?? "";
        patch.thumbnail =
          currentVideo?.thumbnail ?? metadata.thumbnail ?? currentVideo?.thumbnail;
        Object.assign(patch, metaFields);

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

      if (markMetadataFetched) {
        patch.metadataFetched = true;
      }

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
    },
    [
      buildMetadataFields,
      buildThumbnailCandidates,
      resolveThumbnailPath,
      scheduleMetadataFlush,
    ]
  );

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
    
    // 既存のライブ配信中のメタデータファイルを削除（再取得の場合）
    try {
      await invoke("delete_live_metadata_files", {
        id: next.id,
        outputDir,
      });
    } catch {
      // 失敗しても続行
    }
    
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

  useEffect(() => {
    startNextMetadataDownloadRef.current = startNextMetadataDownload;
  }, [startNextMetadataDownload]);

  useEffect(() => {
    applyMetadataUpdateRef.current = applyMetadataUpdate;
  }, [applyMetadataUpdate]);

  useEffect(() => {
    addDownloadErrorItemRef.current = addDownloadErrorItem;
  }, [addDownloadErrorItem]);

  useEffect(() => {
    addFloatingNoticeRef.current = addFloatingNotice;
  }, [addFloatingNotice]);

  useEffect(() => {
    scheduleMetadataFlushRef.current = scheduleMetadataFlush;
  }, [scheduleMetadataFlush]);

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

      const start = () => {
        if (startNextMetadataDownloadRef.current) {
          void startNextMetadataDownloadRef.current();
        }
      };
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
    [downloadDirRef]
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
        const infoLookupIds: string[] = [];
        const videoById = new Map(snapshot.map((item) => [item.id, item]));

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
          // 処理中の更新を確認
          const hasPendingUpdate = pendingMetadataUpdatesRef.current.has(video.id);
          const pendingUpdate = hasPendingUpdate ? pendingMetadataUpdatesRef.current.get(video.id) : null;
          const effectiveMetadataFetched = video.metadataFetched || pendingUpdate?.metadataFetched === true;

          const isPending = video.commentsStatus === "pending";
          const needsLiveChatRetry = isPending || video.commentsStatus === "failed";

          const hasInfo = infoIds.has(video.id);
          const hasChat = chatIds.has(video.id);

          if (isPending && hasChat) {
            applyMetadataUpdate({
              id: video.id,
              metadata: null,
              hasLiveChat: true,
              currentVideo: video,
              markMetadataFetched: false,
            });
          }

          if (isPending && hasInfo) {
            infoLookupIds.push(video.id);
          }

          // ライブ配信中の動画は配信終了を検出するため再取得
          const isCurrentlyLiveStream = video.isLive === true || video.liveStatus === "is_live";
          
          // メタデータ取得済みの場合はスキップ（ただしライブ配信中は除く）
          if (effectiveMetadataFetched && !isCurrentlyLiveStream) {
            continue;
          }

          if (!hasInfo || (needsLiveChatRetry && !hasChat) || isCurrentlyLiveStream) {
            candidates.push({ id: video.id, sourceUrl: video.sourceUrl });
          }
        }

        if (infoLookupIds.length > 0) {
          let localMetadata: LocalMetadataItem[] = [];
          try {
            localMetadata = await invoke<LocalMetadataItem[]>(
              "get_local_metadata_by_ids",
              { outputDir, ids: infoLookupIds }
            );
          } catch {
            localMetadata = [];
          }

          for (const item of localMetadata) {
            const currentVideo = videoById.get(item.id);
            if (!currentVideo || currentVideo.commentsStatus !== "pending") {
              continue;
            }
            // ローカルメタデータがライブ配信中の場合は適用せず、再取得対象に追加
            const isLocalLive = item.metadata?.isLive === true || item.metadata?.liveStatus === "is_live";
            if (isLocalLive) {
              // 古いライブ配信中のメタデータファイルを削除
              try {
                await invoke("delete_live_metadata_files", {
                  id: item.id,
                  outputDir,
                });
              } catch (err) {
                console.warn(`Failed to delete live metadata files for ${item.id}:`, err);
              }
              // ライブ配信終了を検出するため、再取得対象に追加
              if (!pendingMetadataIdsRef.current.has(item.id)) {
                candidates.push({ id: item.id, sourceUrl: currentVideo.sourceUrl });
              }
              continue;
            }
            const hasChat = chatIds.has(item.id);
            applyMetadataUpdate({
              id: item.id,
              metadata: item.metadata,
              hasLiveChat: hasChat ? true : null,
              currentVideo,
              markMetadataFetched: true,
            });
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
      applyMetadataUpdate,
      scheduleBackgroundMetadataFetch,
      downloadDirRef,
      videosRef,
    ]
  );

  useEffect(() => {
    metadataPausedRef.current = metadataPaused;
  }, [metadataPaused]);

  useEffect(() => {
    if (metadataListenerSetupRef.current) return;
    metadataListenerSetupRef.current = true;
    
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
            if (applyMetadataUpdateRef.current) {
              applyMetadataUpdateRef.current({
                id,
                metadata: metadata ?? null,
                hasLiveChat: typeof hasLiveChat === "boolean" ? hasLiveChat : null,
                currentVideo,
                markMetadataFetched: true,
              });
            }
          } else {
            const details = stderr || stdout || i18n.t('errors.unknownError');
            if (addDownloadErrorItemRef.current) {
              addDownloadErrorItemRef.current(id, "metadata", details);
            }
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
            window.setTimeout(() => startNextMetadataDownloadRef.current?.(), 250);
          }
        }
      );
    };
    void setup();
    return () => {
      if (unlisten) {
        unlisten();
        metadataListenerSetupRef.current = false;
      }
    };
  }, []);

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
    window.setTimeout(() => {
      if (startNextMetadataDownloadRef.current) {
        void startNextMetadataDownloadRef.current();
      }
    }, 0);
  }, []);

  return {
    metadataFetch,
    metadataPaused,
    metadataPauseReason,
    scheduleBackgroundMetadataFetch,
    checkAndStartMetadataRecovery,
    retryMetadataFetch,
    applyMetadataUpdate,
  };
}
