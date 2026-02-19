/**
 * C-1. VideoFilters コンポーネントテスト
 *
 * フィルター操作・検索・一括DLボタンの描画とコールバックを検証。
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import i18n from "../i18n";
import { VideoFilters } from "./VideoFilters";

function defaultProps() {
  return {
    searchQuery: "",
    onSearchChange: vi.fn(),
    onClearSearch: vi.fn(),
    favoriteFilter: "all" as const,
    onChangeFavoriteFilter: vi.fn(),
    downloadFilter: "all" as const,
    onChangeDownloadFilter: vi.fn(),
    typeFilter: "all" as const,
    onChangeTypeFilter: vi.fn(),
    publishedSort: "published-desc" as const,
    onChangePublishedSort: vi.fn(),
    filteredCount: 5,
    totalCount: 10,
    onStartBulkDownload: vi.fn(),
    bulkDownloadDisabled: false,
  };
}

function renderWithI18n(ui: React.ReactElement) {
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

describe("VideoFilters", () => {
  it("フィルター件数を表示する", () => {
    renderWithI18n(<VideoFilters {...defaultProps()} />);
    expect(screen.getByText(/5.*\/.*10/)).toBeInTheDocument();
  });

  it("検索入力でコールバック発火", async () => {
    const user = userEvent.setup();
    const props = defaultProps();
    renderWithI18n(<VideoFilters {...props} />);

    const input = screen.getByPlaceholderText(i18n.t("filters.searchPlaceholder"));
    await user.type(input, "test");

    expect(props.onSearchChange).toHaveBeenCalled();
  });

  it("検索クリアボタン — searchQuery あり時のみ表示", () => {
    const props = { ...defaultProps(), searchQuery: "abc" };
    renderWithI18n(<VideoFilters {...props} />);

    expect(
      screen.getByRole("button", { name: i18n.t("filters.clear") })
    ).toBeInTheDocument();
  });

  it("検索クリアボタン — searchQuery 空なら非表示", () => {
    renderWithI18n(<VideoFilters {...defaultProps()} />);
    expect(
      screen.queryByRole("button", { name: i18n.t("filters.clear") })
    ).not.toBeInTheDocument();
  });

  it("DLフィルタ切り替えでコールバック発火", async () => {
    const user = userEvent.setup();
    const props = defaultProps();
    renderWithI18n(<VideoFilters {...props} />);

    await user.click(
      screen.getByRole("button", { name: i18n.t("filters.downloaded") })
    );
    expect(props.onChangeDownloadFilter).toHaveBeenCalledWith("downloaded");
  });

  it("タイプフィルタ切り替え", async () => {
    const user = userEvent.setup();
    const props = defaultProps();
    renderWithI18n(<VideoFilters {...props} />);

    await user.click(
      screen.getByRole("button", { name: i18n.t("filters.live") })
    );
    expect(props.onChangeTypeFilter).toHaveBeenCalledWith("live");
  });

  it("公開日ソート切り替え", async () => {
    const user = userEvent.setup();
    const props = defaultProps();
    renderWithI18n(<VideoFilters {...props} />);

    await user.click(
      screen.getByRole("button", { name: i18n.t("filters.oldest") })
    );
    expect(props.onChangePublishedSort).toHaveBeenCalledWith("published-asc");
  });

  it("一括DLボタンクリック", async () => {
    const user = userEvent.setup();
    const props = defaultProps();
    renderWithI18n(<VideoFilters {...props} />);

    await user.click(
      screen.getByRole("button", { name: i18n.t("filters.bulkDownload") })
    );
    expect(props.onStartBulkDownload).toHaveBeenCalledTimes(1);
  });

  it("一括DLボタン disabled 時", () => {
    const props = { ...defaultProps(), bulkDownloadDisabled: true };
    renderWithI18n(<VideoFilters {...props} />);

    expect(
      screen.getByRole("button", { name: i18n.t("filters.bulkDownload") })
    ).toBeDisabled();
  });
});
