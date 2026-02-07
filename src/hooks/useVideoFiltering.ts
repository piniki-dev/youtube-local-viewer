import { useMemo } from "react";

type VideoLike = {
  id: string;
  title: string;
  channel: string;
  description?: string;
  tags?: string[];
  categories?: string[];
  publishedAt?: string;
  addedAt: string;
  contentType?: "video" | "live" | "shorts";
  downloadStatus: "pending" | "downloading" | "downloaded" | "failed";
};

type IndexedVideo<TVideo> = TVideo & {
  searchText: string;
  sortTime: number;
};

type UseVideoFilteringParams<TVideo extends VideoLike> = {
  videos: TVideo[];
  downloadFilter: "all" | "downloaded" | "undownloaded";
  typeFilter: "all" | "video" | "live" | "shorts";
  publishedSort: "published-desc" | "published-asc";
  deferredSearchQuery: string;
  indexedVideosRef: React.RefObject<IndexedVideo<TVideo>[]>;
  sortedVideosRef: React.RefObject<IndexedVideo<TVideo>[]>;
  filteredVideosRef: React.RefObject<IndexedVideo<TVideo>[]>;
  getVideoSortTime: (video: TVideo) => number;
};

export function useVideoFiltering<TVideo extends VideoLike>({
  videos,
  downloadFilter,
  typeFilter,
  publishedSort,
  deferredSearchQuery,
  indexedVideosRef,
  sortedVideosRef,
  filteredVideosRef,
  getVideoSortTime,
}: UseVideoFilteringParams<TVideo>) {
  const indexedVideos = useMemo<IndexedVideo<TVideo>[]>(() => {
    const next = videos.map((video) => {
      const searchText = [
        video.title,
        video.channel,
        video.description,
        video.id,
        video.tags?.join(" "),
        video.categories?.join(" "),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return {
        ...video,
        searchText,
        sortTime: getVideoSortTime(video),
      };
    });
    indexedVideosRef.current = next;
    return next;
  }, [videos, getVideoSortTime, indexedVideosRef]);

  const sortedVideos = useMemo(() => {
    const sorted = [...indexedVideos].sort((a, b) => {
      const timeA = a.sortTime;
      const timeB = b.sortTime;
      if (timeA === timeB) {
        return b.addedAt.localeCompare(a.addedAt);
      }
      return publishedSort === "published-desc" ? timeB - timeA : timeA - timeB;
    });
    sortedVideosRef.current = sorted;
    return sorted;
  }, [indexedVideos, publishedSort, sortedVideosRef]);

  const filteredVideos = useMemo(() => {
    const normalizedQuery = deferredSearchQuery.trim().toLowerCase();
    const tokens = normalizedQuery ? normalizedQuery.split(/\s+/) : [];
    const next = sortedVideos.filter((video) => {
      const matchesDownload =
        downloadFilter === "all"
          ? true
          : downloadFilter === "downloaded"
            ? video.downloadStatus === "downloaded"
            : video.downloadStatus !== "downloaded";
      const type = video.contentType ?? "video";
      const matchesType = typeFilter === "all" ? true : type === typeFilter;
      const matchesQuery =
        tokens.length === 0
          ? true
          : tokens.every((token) => video.searchText.includes(token));
      return matchesDownload && matchesType && matchesQuery;
    });
    filteredVideosRef.current = next;
    return next;
  }, [sortedVideos, downloadFilter, typeFilter, deferredSearchQuery, filteredVideosRef]);

  const hasUndownloaded = useMemo(
    () => videos.some((video) => video.downloadStatus !== "downloaded"),
    [videos]
  );

  return { indexedVideos, sortedVideos, filteredVideos, hasUndownloaded };
}
