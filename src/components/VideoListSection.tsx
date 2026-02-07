import type { ReactNode } from "react";
import { EmptyState } from "./EmptyState";
import { VideoFilters } from "./VideoFilters";
import { VideoGrid } from "./VideoGrid";

type DownloadFilter = "all" | "downloaded" | "undownloaded";
type TypeFilter = "all" | "video" | "live" | "shorts";
type PublishedSort = "published-desc" | "published-asc";

type VideoListSectionProps<T> = {
  sortedCount: number;
  filteredCount: number;
  showAddSkeleton: boolean;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onClearSearch: () => void;
  downloadFilter: DownloadFilter;
  onChangeDownloadFilter: (value: DownloadFilter) => void;
  typeFilter: TypeFilter;
  onChangeTypeFilter: (value: TypeFilter) => void;
  publishedSort: PublishedSort;
  onChangePublishedSort: (value: PublishedSort) => void;
  onStartBulkDownload: () => void;
  bulkDownloadDisabled: boolean;
  filteredVideos: T[];
  renderSkeletonCard: () => ReactNode;
  renderVideoCard: (video: T) => ReactNode;
  gridCardWidth: number;
  gridGap: number;
  gridRowHeight: number;
};

export function VideoListSection<T>({
  sortedCount,
  filteredCount,
  showAddSkeleton,
  searchQuery,
  onSearchChange,
  onClearSearch,
  downloadFilter,
  onChangeDownloadFilter,
  typeFilter,
  onChangeTypeFilter,
  publishedSort,
  onChangePublishedSort,
  onStartBulkDownload,
  bulkDownloadDisabled,
  filteredVideos,
  renderSkeletonCard,
  renderVideoCard,
  gridCardWidth,
  gridGap,
  gridRowHeight,
}: VideoListSectionProps<T>) {
  if (sortedCount === 0) {
    return (
      <EmptyState>
        まだ動画がありません。右上の「＋ 動画を追加」から登録してください。
      </EmptyState>
    );
  }

  return (
    <>
      <VideoFilters
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        onClearSearch={onClearSearch}
        downloadFilter={downloadFilter}
        onChangeDownloadFilter={onChangeDownloadFilter}
        typeFilter={typeFilter}
        onChangeTypeFilter={onChangeTypeFilter}
        publishedSort={publishedSort}
        onChangePublishedSort={onChangePublishedSort}
        filteredCount={filteredCount}
        totalCount={sortedCount}
        onStartBulkDownload={onStartBulkDownload}
        bulkDownloadDisabled={bulkDownloadDisabled}
      />

      {filteredCount === 0 && !showAddSkeleton ? (
        <EmptyState>条件に一致する動画がありません。</EmptyState>
      ) : (
        <VideoGrid
          filteredVideos={filteredVideos}
          showAddSkeleton={showAddSkeleton}
          renderSkeletonCard={renderSkeletonCard}
          renderVideoCard={renderVideoCard}
          gridCardWidth={gridCardWidth}
          gridGap={gridGap}
          gridRowHeight={gridRowHeight}
        />
      )}
    </>
  );
}
