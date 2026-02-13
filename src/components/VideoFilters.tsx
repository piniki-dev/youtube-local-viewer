type DownloadFilter = "all" | "downloaded" | "undownloaded";
type TypeFilter = "all" | "video" | "live" | "shorts";
type PublishedSort = "published-desc" | "published-asc";
type FavoriteFilter = "all" | "favorite";

type VideoFiltersProps = {
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
  filteredCount: number;
  totalCount: number;
  onStartBulkDownload: () => void;
  bulkDownloadDisabled: boolean;
};

export function VideoFilters({
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
  filteredCount,
  totalCount,
  onStartBulkDownload,
  bulkDownloadDisabled,
}: VideoFiltersProps) {
  return (
    <section className="filter-bar">
      <div className="filter-group filter-search">
        <span className="filter-label">検索</span>
        <div className="search-field">
          <input
            className="search-input"
            type="search"
            placeholder="タイトル・チャンネル・タグで検索"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          {searchQuery && (
            <button
              className="ghost tiny"
              type="button"
              onClick={onClearSearch}
            >
              クリア
            </button>
          )}
        </div>
      </div>
      <div className="filter-group">
        <span className="filter-label">お気に入り</span>
        <div className="segmented">
          <button
            className={favoriteFilter === "all" ? "active" : ""}
            onClick={() => onChangeFavoriteFilter("all")}
            type="button"
          >
            すべて
          </button>
          <button
            className={favoriteFilter === "favorite" ? "active" : ""}
            onClick={() => onChangeFavoriteFilter("favorite")}
            type="button"
          >
            <i className="ri-heart-fill" /> お気に入り
          </button>
        </div>
      </div>
      <div className="filter-group">
        <span className="filter-label">ダウンロード</span>
        <div className="segmented">
          <button
            className={downloadFilter === "all" ? "active" : ""}
            onClick={() => onChangeDownloadFilter("all")}
            type="button"
          >
            すべて
          </button>
          <button
            className={downloadFilter === "downloaded" ? "active" : ""}
            onClick={() => onChangeDownloadFilter("downloaded")}
            type="button"
          >
            ダウンロード済み
          </button>
          <button
            className={downloadFilter === "undownloaded" ? "active" : ""}
            onClick={() => onChangeDownloadFilter("undownloaded")}
            type="button"
          >
            未ダウンロード
          </button>
        </div>
      </div>
      <div className="filter-group">
        <span className="filter-label">種別</span>
        <div className="segmented">
          <button
            className={typeFilter === "all" ? "active" : ""}
            onClick={() => onChangeTypeFilter("all")}
            type="button"
          >
            すべて
          </button>
          <button
            className={typeFilter === "video" ? "active" : ""}
            onClick={() => onChangeTypeFilter("video")}
            type="button"
          >
            動画
          </button>
          <button
            className={typeFilter === "live" ? "active" : ""}
            onClick={() => onChangeTypeFilter("live")}
            type="button"
          >
            配信
          </button>
          <button
            className={typeFilter === "shorts" ? "active" : ""}
            onClick={() => onChangeTypeFilter("shorts")}
            type="button"
          >
            ショート
          </button>
        </div>
      </div>
      <div className="filter-group">
        <span className="filter-label">配信日</span>
        <div className="segmented">
          <button
            className={publishedSort === "published-desc" ? "active" : ""}
            onClick={() => onChangePublishedSort("published-desc")}
            type="button"
          >
            新しい順
          </button>
          <button
            className={publishedSort === "published-asc" ? "active" : ""}
            onClick={() => onChangePublishedSort("published-asc")}
            type="button"
          >
            古い順
          </button>
        </div>
      </div>
      <div className="filter-actions">
        <div className="filter-summary">
          表示: {filteredCount} / {totalCount}
        </div>
        <div className="bulk-download-group">
          <button
            className="primary small"
            type="button"
            onClick={onStartBulkDownload}
            disabled={bulkDownloadDisabled}
          >
            未ダウンロードを一括DL
          </button>
        </div>
      </div>
    </section>
  );
}
