import AutoSizer from "react-virtualized-auto-sizer";
import { FixedSizeGrid as Grid, type GridChildComponentProps } from "react-window";
import { memo, type ReactNode } from "react";
import { VideoCardItem } from "./VideoCardItem";

type MediaInfo = {
  videoCodec?: string | null;
  audioCodec?: string | null;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  container?: string | null;
};

type VideoGridProps<T> = {
  filteredVideos: T[];
  showAddSkeleton: boolean;
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
};

type GridCellData<T> = {
  filteredVideos: T[];
  showAddSkeleton: boolean;
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
  gridGap: number;
  columnCount: number;
  totalItems: number;
};

type CellProps = GridChildComponentProps<GridCellData<any>>;

// セルレンダリング関数を外部に定義してメモ化
const Cell = memo(({ columnIndex, rowIndex, style, data }: CellProps) => {
  const index = rowIndex * data.columnCount + columnIndex;
  if (index >= data.totalItems) return null;
  
  const offsetIndex = data.showAddSkeleton ? index - 1 : index;
  const adjustedStyle = {
    ...style,
    left: (style.left as number) + data.gridGap,
    top: (style.top as number) + data.gridGap,
    width: (style.width as number) - data.gridGap,
    height: (style.height as number) - data.gridGap,
  };
  
  if (data.showAddSkeleton && index === 0) {
    return <div style={adjustedStyle}>{data.renderSkeletonCard()}</div>;
  }
  
  const video = data.filteredVideos[offsetIndex];
  if (!video) return null;
  
  return (
    <div style={adjustedStyle}>
      <VideoCardItem
        video={video}
        downloadingIds={data.downloadingIds}
        commentsDownloadingIds={data.commentsDownloadingIds}
        queuedDownloadIds={data.queuedDownloadIds}
        onPlay={data.onPlay}
        onDownload={data.onDownload}
        onDelete={data.onDelete}
        onRefreshMetadata={data.onRefreshMetadata}
        onToggleFavorite={data.onToggleFavorite}
        mediaInfo={data.mediaInfoById[video.id]}
        formatPublishedAt={data.formatPublishedAt}
        formatDuration={data.formatDuration}
      />
    </div>
  );
});

Cell.displayName = "VideoGridCell";

const VideoGridComponent = <T extends { id: string }>({
  filteredVideos,
  showAddSkeleton,
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
}: VideoGridProps<T>) => {
  return (
    <section className="grid-virtual">
      <div className="grid-virtual-container">
        <AutoSizer>
          {({ width, height }: { width: number; height: number }) => {
            const totalItems = filteredVideos.length + (showAddSkeleton ? 1 : 0);
            const maxColumns = Math.min(
              4,
              Math.max(1, Math.floor((width - gridGap) / (gridCardWidth + gridGap)))
            );
            const columnCount = maxColumns;
            const availableWidth = Math.max(1, width - gridGap * (columnCount + 1));
            const columnWidth = Math.max(1, Math.floor(availableWidth / columnCount));
            const rowCount = Math.ceil(totalItems / columnCount);

            const cellData: GridCellData<T> = {
              filteredVideos,
              showAddSkeleton,
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
              gridGap,
              columnCount,
              totalItems,
            };

            return (
              <Grid
                columnCount={columnCount}
                columnWidth={columnWidth + gridGap}
                height={height}
                rowCount={rowCount}
                rowHeight={gridRowHeight + gridGap}
                width={width}
                overscanRowCount={2}
                itemData={cellData}
                itemKey={({ columnIndex, rowIndex, data }) => {
                  const index = rowIndex * data.columnCount + columnIndex;
                  if (index >= data.totalItems) return `empty-${index}`;
                  const offsetIndex = data.showAddSkeleton ? index - 1 : index;
                  if (data.showAddSkeleton && index === 0) return "skeleton";
                  const video = data.filteredVideos[offsetIndex];
                  return video ? video.id : `fallback-${index}`;
                }}
              >
                {Cell}
              </Grid>
            );
          }}
        </AutoSizer>
      </div>
    </section>
  );
};

export const VideoGrid = memo(VideoGridComponent) as typeof VideoGridComponent;
