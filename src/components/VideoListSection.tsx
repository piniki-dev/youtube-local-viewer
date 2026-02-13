import { memo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "./EmptyState";
import { VideoFilters } from "./VideoFilters";
import { VideoGrid } from "./VideoGrid";

type DownloadFilter = "all" | "downloaded" | "undownloaded";
type TypeFilter = "all" | "video" | "live" | "shorts";
type PublishedSort = "published-desc" | "published-asc";
type FavoriteFilter = "all" | "favorite";

type MediaInfo = {
  videoCodec?: string | null;
  audioCodec?: string | null;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  container?: string | null;
};

type VideoListSectionProps<T> = {
  sortedCount: number;
  filteredCount: number;
  showAddSkeleton: boolean;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onClearSearch: () => void;
  favoriteFilter: FavoriteFilter;
  onChangeFavoriteFilter: (value: FavoriteFilter) => void;
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
  downloadingIds: string[];
  commentsDownloadingIds: string[];
  queuedDownloadIds: string[];
  onPlay: (video: T) => void;
  onDownload: (video: T) => Promise<void> | void;
  onDelete: (video: T) => void;
  onRefreshMetadata: (video: T) => void;
  onToggleFavorite: (id: string) => void;
  mediaInfoById: Record<string, MediaInfo | null>;
  formatPublishedAt: (value?: string) => string;
  formatDuration: (value?: number | null) => string;
  gridCardWidth: number;
  gridGap: number;
  gridRowHeight: number;
  downloadDir: string;
  onOpenSettings: () => void;
  onOpenAdd: () => void;
  addDisabled: boolean;
};

const VideoListSectionComponent = <T extends { id: string }>({
  sortedCount,
  filteredCount,
  showAddSkeleton,
  searchQuery,
  onSearchChange,
  onClearSearch,
  favoriteFilter,
  onChangeFavoriteFilter,
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
  downloadingIds,
  commentsDownloadingIds,
  queuedDownloadIds,
  onPlay,
  onDownload,
  onDelete,
  onRefreshMetadata,
  onToggleFavorite,
  mediaInfoById,
  formatPublishedAt,
  formatDuration,
  gridCardWidth,
  gridGap,
  gridRowHeight,
  downloadDir,
  onOpenSettings,
  onOpenAdd,
  addDisabled,
}: VideoListSectionProps<T>) => {
  const { t } = useTranslation();
  if (sortedCount === 0) {
    return (
      <EmptyState>
        <div className="empty-guide">
          <p className="empty-title">{t("videoList.emptyTitle")}</p>
          <p className="empty-lead">
            {t("videoList.emptyMessage")}
          </p>
          <ol className="empty-steps">
            <li>{t("videoList.emptyStep1")}</li>
            <li>{t("videoList.emptyStep2")}</li>
            <li>{t("videoList.emptyStep3")}</li>
          </ol>
          <div className="empty-actions">
            <button className="ghost" onClick={onOpenSettings}>
              {t("videoList.openSettings")}
            </button>
            <button className="primary" onClick={onOpenAdd} disabled={addDisabled}>
              {t("videoList.addVideo")}
            </button>
          </div>
          <p className="empty-hint">
            {t("videoList.downloadDir")}: {downloadDir ? downloadDir : t("videoList.notSet")}
          </p>
        </div>
      </EmptyState>
    );
  }

  return (
    <>
      <VideoFilters
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        onClearSearch={onClearSearch}
        favoriteFilter={favoriteFilter}
        onChangeFavoriteFilter={onChangeFavoriteFilter}
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
        <EmptyState>{t("videoList.noMatch")}</EmptyState>
      ) : (
        <VideoGrid
          filteredVideos={filteredVideos}
          showAddSkeleton={showAddSkeleton}
          renderSkeletonCard={renderSkeletonCard}
          downloadingIds={downloadingIds}
          commentsDownloadingIds={commentsDownloadingIds}
          queuedDownloadIds={queuedDownloadIds}
          onPlay={onPlay}
          onDownload={onDownload}
          onDelete={onDelete}
          onRefreshMetadata={onRefreshMetadata}
          onToggleFavorite={onToggleFavorite}
          mediaInfoById={mediaInfoById}
          formatPublishedAt={formatPublishedAt}
          formatDuration={formatDuration}
          gridCardWidth={gridCardWidth}
          gridGap={gridGap}
          gridRowHeight={gridRowHeight}
        />
      )}
    </>
  );
};

export const VideoListSection = memo(VideoListSectionComponent) as typeof VideoListSectionComponent;
