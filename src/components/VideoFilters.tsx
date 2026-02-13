import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  return (
    <section className="filter-bar">
      <div className="filter-group filter-search">
        <span className="filter-label">{t("filters.search")}</span>
        <div className="search-field">
          <input
            className="search-input"
            type="search"
            placeholder={t("filters.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          {searchQuery && (
            <button
              className="ghost tiny"
              type="button"
              onClick={onClearSearch}
            >
              {t("filters.clear")}
            </button>
          )}
        </div>
      </div>
      <div className="filter-group">
        <span className="filter-label">{t("filters.favorite")}</span>
        <div className="segmented">
          <button
            className={favoriteFilter === "all" ? "active" : ""}
            onClick={() => onChangeFavoriteFilter("all")}
            type="button"
          >
            {t("filters.all")}
          </button>
          <button
            className={favoriteFilter === "favorite" ? "active" : ""}
            onClick={() => onChangeFavoriteFilter("favorite")}
            type="button"
          >
            <i className="ri-heart-fill" /> {t("filters.favoriteOnly")}
          </button>
        </div>
      </div>
      <div className="filter-group">
        <span className="filter-label">{t("filters.downloadFilter")}</span>
        <div className="segmented">
          <button
            className={downloadFilter === "all" ? "active" : ""}
            onClick={() => onChangeDownloadFilter("all")}
            type="button"
          >
            {t("filters.all")}
          </button>
          <button
            className={downloadFilter === "downloaded" ? "active" : ""}
            onClick={() => onChangeDownloadFilter("downloaded")}
            type="button"
          >
            {t("filters.downloaded")}
          </button>
          <button
            className={downloadFilter === "undownloaded" ? "active" : ""}
            onClick={() => onChangeDownloadFilter("undownloaded")}
            type="button"
          >
            {t("filters.notDownloaded")}
          </button>
        </div>
      </div>
      <div className="filter-group">
        <span className="filter-label">{t("filters.typeFilter")}</span>
        <div className="segmented">
          <button
            className={typeFilter === "all" ? "active" : ""}
            onClick={() => onChangeTypeFilter("all")}
            type="button"
          >
            {t("filters.all")}
          </button>
          <button
            className={typeFilter === "video" ? "active" : ""}
            onClick={() => onChangeTypeFilter("video")}
            type="button"
          >
            {t("filters.video")}
          </button>
          <button
            className={typeFilter === "live" ? "active" : ""}
            onClick={() => onChangeTypeFilter("live")}
            type="button"
          >
            {t("filters.live")}
          </button>
          <button
            className={typeFilter === "shorts" ? "active" : ""}
            onClick={() => onChangeTypeFilter("shorts")}
            type="button"
          >
            {t("filters.short")}
          </button>
        </div>
      </div>
      <div className="filter-group">
        <span className="filter-label">{t("filters.publishedDate")}</span>
        <div className="segmented">
          <button
            className={publishedSort === "published-desc" ? "active" : ""}
            onClick={() => onChangePublishedSort("published-desc")}
            type="button"
          >
            {t("filters.newest")}
          </button>
          <button
            className={publishedSort === "published-asc" ? "active" : ""}
            onClick={() => onChangePublishedSort("published-asc")}
            type="button"
          >
            {t("filters.oldest")}
          </button>
        </div>
      </div>
      <div className="filter-actions">
        <div className="filter-summary">
          {t("filters.showing")}: {filteredCount} / {totalCount}
        </div>
        <div className="bulk-download-group">
          <button
            className="primary small"
            type="button"
            onClick={onStartBulkDownload}
            disabled={bulkDownloadDisabled}
          >
            {t("filters.bulkDownload")}
          </button>
        </div>
      </div>
    </section>
  );
}
