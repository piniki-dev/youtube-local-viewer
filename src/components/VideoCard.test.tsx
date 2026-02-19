/**
 * C-1. VideoCard コンポーネントテスト
 *
 * 各ステータスに応じたバッジ表示、ボタン操作、非公開/ライブバッジを検証。
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import i18n from "../i18n";
import { VideoCard } from "./VideoCard";

const baseVideo = {
  id: "v1",
  title: "Test Video",
  channel: "Test Channel",
  thumbnail: "https://img.youtube.com/vi/v1/hqdefault.jpg",
  publishedAt: "2024-01-15T00:00:00Z",
  downloadStatus: "pending" as const,
  commentsStatus: "pending" as const,
};

function defaultProps(): React.ComponentProps<typeof VideoCard> {
  return {
    video: { ...baseVideo },
    thumbnailSrc: "https://img.youtube.com/vi/v1/hqdefault.jpg",
    isPlayable: false,
    isDownloading: false,
    isCommentsDownloading: false,
    isQueued: false,
    isCurrentlyLive: false,
    isUpcoming: false,
    isPrivate: false,
    isDeleted: false,
    displayStatus: "pending",
    onPlay: vi.fn(),
    onDownload: vi.fn(),
    onDelete: vi.fn(),
    onRefreshMetadata: vi.fn(),
    isFavorite: false,
    onToggleFavorite: vi.fn(),
    onOpenInBrowser: vi.fn(),
    onCopyUrl: vi.fn(),
    mediaInfo: null,
    formatPublishedAt: (v?: string) => v ?? "",
    formatDuration: (v?: number | null) => (v ? `${v}s` : ""),
  };
}

function renderWithI18n(ui: React.ReactElement) {
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

describe("VideoCard", () => {
  it("pending状態 → DLボタン表示（未DLバッジ）", () => {
    renderWithI18n(<VideoCard {...defaultProps()} />);
    expect(screen.getByText(i18n.t("videoCard.notDownloaded"))).toBeInTheDocument();
  });

  it("downloading状態 → DL中バッジ表示", () => {
    const props = {
      ...defaultProps(),
      displayStatus: "downloading" as const,
      isDownloading: true,
    };
    renderWithI18n(<VideoCard {...props} />);
    expect(screen.getByText(i18n.t("videoCard.downloading"))).toBeInTheDocument();
  });

  it("downloaded状態 → DL済みバッジ + 再生ボタン", () => {
    const props = {
      ...defaultProps(),
      video: { ...baseVideo, downloadStatus: "downloaded" as const },
      displayStatus: "downloaded" as const,
      isPlayable: true,
    };
    renderWithI18n(<VideoCard {...props} />);
    expect(screen.getByText(i18n.t("videoCard.downloaded"))).toBeInTheDocument();
  });

  it("failed状態 → 失敗バッジ", () => {
    const props = {
      ...defaultProps(),
      video: { ...baseVideo, downloadStatus: "failed" as const },
      displayStatus: "failed" as const,
    };
    renderWithI18n(<VideoCard {...props} />);
    expect(screen.getByText(i18n.t("videoCard.failed"))).toBeInTheDocument();
  });

  it("非公開バッジ — isPrivate=true, 未DL", () => {
    const props = { ...defaultProps(), isPrivate: true };
    renderWithI18n(<VideoCard {...props} />);
    expect(screen.getByText(i18n.t("videoCard.privateVideo"))).toBeInTheDocument();
  });

  it("非公開 + DL済み → 両方のバッジ", () => {
    const props = {
      ...defaultProps(),
      video: { ...baseVideo, downloadStatus: "downloaded" as const },
      displayStatus: "downloaded" as const,
      isPrivate: true,
      isPlayable: true,
    };
    renderWithI18n(<VideoCard {...props} />);
    expect(screen.getByText(i18n.t("videoCard.downloaded"))).toBeInTheDocument();
    expect(screen.getByText(i18n.t("videoCard.privateVideo"))).toBeInTheDocument();
  });

  it("削除済みバッジ — isDeleted=true, 未DL", () => {
    const props = { ...defaultProps(), isDeleted: true };
    renderWithI18n(<VideoCard {...props} />);
    expect(screen.getByText(i18n.t("videoCard.deletedVideo"))).toBeInTheDocument();
  });

  it("削除済み + DL済み → 両方のバッジ", () => {
    const props = {
      ...defaultProps(),
      video: { ...baseVideo, downloadStatus: "downloaded" as const },
      displayStatus: "downloaded" as const,
      isDeleted: true,
      isPlayable: true,
    };
    renderWithI18n(<VideoCard {...props} />);
    expect(screen.getByText(i18n.t("videoCard.downloaded"))).toBeInTheDocument();
    expect(screen.getByText(i18n.t("videoCard.deletedVideo"))).toBeInTheDocument();
  });

  it("ライブバッジ — isCurrentlyLive=true", () => {
    const props = { ...defaultProps(), isCurrentlyLive: true };
    renderWithI18n(<VideoCard {...props} />);
    expect(screen.getByText(i18n.t("videoCard.liveStreaming"))).toBeInTheDocument();
  });

  it("配信予定バッジ — isUpcoming=true", () => {
    const props = { ...defaultProps(), isUpcoming: true, isCurrentlyLive: true };
    renderWithI18n(<VideoCard {...props} />);
    expect(screen.getByText(i18n.t("videoCard.upcomingStream"))).toBeInTheDocument();
  });

  it("お気に入りトグル", async () => {
    const user = userEvent.setup();
    const props = defaultProps();
    renderWithI18n(<VideoCard {...props} />);

    await user.click(
      screen.getByRole("button", { name: i18n.t("videoCard.addToFavorites") })
    );
    expect(props.onToggleFavorite).toHaveBeenCalledTimes(1);
  });

  it("サムネイル表示", () => {
    renderWithI18n(<VideoCard {...defaultProps()} />);
    const img = screen.getByAltText("Test Video");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "https://img.youtube.com/vi/v1/hqdefault.jpg");
  });

  it("タイトルとチャンネル表示", () => {
    renderWithI18n(<VideoCard {...defaultProps()} />);
    expect(screen.getByText("Test Video")).toBeInTheDocument();
    expect(screen.getByText("Test Channel")).toBeInTheDocument();
  });

  it("mediaInfo表示", () => {
    const props = {
      ...defaultProps(),
      video: { ...baseVideo, downloadStatus: "downloaded" as const },
      displayStatus: "downloaded" as const,
      mediaInfo: {
        videoCodec: "h264",
        audioCodec: "aac",
        width: 1920,
        height: 1080,
        duration: 120,
        container: "mp4",
      },
    };
    renderWithI18n(<VideoCard {...props} />);
    expect(screen.getByText(/h264/)).toBeInTheDocument();
    expect(screen.getByText(/1920x1080/)).toBeInTheDocument();
  });

  it("コメントDL済みバッジ", () => {
    const props = {
      ...defaultProps(),
      video: { ...baseVideo, commentsStatus: "downloaded" as const },
    };
    renderWithI18n(<VideoCard {...props} />);
    expect(screen.getByText(i18n.t("videoCard.commentsDownloaded"))).toBeInTheDocument();
  });

  it("コメントunavailable → コメント行非表示", () => {
    const props = {
      ...defaultProps(),
      video: { ...baseVideo, commentsStatus: "unavailable" as const },
    };
    renderWithI18n(<VideoCard {...props} />);
    expect(screen.queryByText(i18n.t("videoCard.commentsDownloaded"))).not.toBeInTheDocument();
    expect(screen.queryByText(i18n.t("videoCard.commentsNotDownloaded"))).not.toBeInTheDocument();
  });

  it("キュー中 → queuedバッジ", () => {
    const props = {
      ...defaultProps(),
      isQueued: true,
      displayStatus: "downloading" as const,
    };
    renderWithI18n(<VideoCard {...props} />);
    expect(screen.getByText(i18n.t("videoCard.queued"))).toBeInTheDocument();
  });
});
