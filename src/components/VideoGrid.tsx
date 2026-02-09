import AutoSizer from "react-virtualized-auto-sizer";
import { FixedSizeGrid as Grid, type GridChildComponentProps } from "react-window";
import type { ReactNode } from "react";

type VideoGridProps<T> = {
  filteredVideos: T[];
  showAddSkeleton: boolean;
  renderSkeletonCard: () => ReactNode;
  renderVideoCard: (video: T) => ReactNode;
  gridCardWidth: number;
  gridGap: number;
  gridRowHeight: number;
};

export function VideoGrid<T>({
  filteredVideos,
  showAddSkeleton,
  renderSkeletonCard,
  renderVideoCard,
  gridCardWidth,
  gridGap,
  gridRowHeight,
}: VideoGridProps<T>) {
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

            return (
              <Grid
                columnCount={columnCount}
                columnWidth={columnWidth + gridGap}
                height={height}
                rowCount={rowCount}
                rowHeight={gridRowHeight + gridGap}
                width={width}
                overscanRowCount={2}
              >
                {({ columnIndex, rowIndex, style }: GridChildComponentProps) => {
                  const index = rowIndex * columnCount + columnIndex;
                  if (index >= totalItems) return null;
                  const offsetIndex = showAddSkeleton ? index - 1 : index;
                  const adjustedStyle = {
                    ...style,
                    left: (style.left as number) + gridGap,
                    top: (style.top as number) + gridGap,
                    width: (style.width as number) - gridGap,
                    height: (style.height as number) - gridGap,
                  };
                  if (showAddSkeleton && index === 0) {
                    return <div style={adjustedStyle}>{renderSkeletonCard()}</div>;
                  }
                  const video = filteredVideos[offsetIndex];
                  if (!video) return null;
                  return <div style={adjustedStyle}>{renderVideoCard(video)}</div>;
                }}
              </Grid>
            );
          }}
        </AutoSizer>
      </div>
    </section>
  );
}
