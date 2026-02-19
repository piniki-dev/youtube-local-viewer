/**
 * C-4. FloatingStatusStack コンポーネントテスト
 *
 * 各パネルの条件付き表示・操作コールバックを検証。
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import i18n from "../i18n";
import { FloatingStatusStack } from "./FloatingStatusStack";

const emptyBulk = {
  active: false,
  total: 0,
  completed: 0,
  currentId: null,
  currentTitle: "",
  stopRequested: false,
  phase: null as "video" | "comments" | null,
  waitingForSingles: false,
};

function defaultProps() {
  return {
    ytDlpNotices: [] as { id: string; kind: "success" | "error"; title: string; details?: string }[],
    onCloseNotice: vi.fn(),
    floatingNotices: [] as { id: string; kind: "success" | "error" | "info"; title: string; details?: string; autoDismissMs?: number }[],
    onCloseFloatingNotice: vi.fn(),
    metadataFetch: { active: false, total: 0, completed: 0 },
    metadataPaused: false,
    metadataPauseReason: "",
    onRetryMetadata: vi.fn(),
    hasDownloadErrors: false,
    downloadErrorSlides: [] as { title: string; video?: { details: string }; comments?: { details: string }; metadata?: { details: string }; createdAt: number }[],
    isDownloadErrorOpen: false,
    onToggleDownloadErrorOpen: vi.fn(),
    onClearDownloadErrors: vi.fn(),
    downloadErrorIndex: 0,
    onPrevDownloadError: vi.fn(),
    onNextDownloadError: vi.fn(),
    bulkDownload: emptyBulk,
    isBulkLogOpen: false,
    onToggleBulkLogOpen: vi.fn(),
    onStopBulkDownload: vi.fn(),
    progressLines: {} as Record<string, string>,
    commentProgressLines: {} as Record<string, string>,
    activeActivityItems: [] as { id: string; title: string; status: string; line: string }[],
    activeDownloadCount: 0,
    queuedDownloadCount: 0,
    isDownloadLogOpen: false,
    onToggleDownloadLogOpen: vi.fn(),
  };
}

function renderWithI18n(ui: React.ReactElement) {
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

describe("FloatingStatusStack", () => {
  it("パネルなし → null (何も描画しない)", () => {
    const { container } = renderWithI18n(
      <FloatingStatusStack {...defaultProps()} />
    );
    expect(container.querySelector(".floating-stack")).toBeNull();
  });

  it("floatingNotice表示 + 閉じるボタン", async () => {
    const user = userEvent.setup();
    const props = {
      ...defaultProps(),
      floatingNotices: [
        { id: "n1", kind: "error" as const, title: "Error Notice" },
      ],
    };
    renderWithI18n(<FloatingStatusStack {...props} />);

    expect(screen.getByText("Error Notice")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: i18n.t("floating.close") })
    );
    expect(props.onCloseFloatingNotice).toHaveBeenCalledWith("n1");
  });

  it("metadataFetch active → メタデータパネル表示", () => {
    const props = {
      ...defaultProps(),
      metadataFetch: { active: true, total: 10, completed: 3 },
    };
    renderWithI18n(<FloatingStatusStack {...props} />);

    expect(screen.getByText(/3.*\/.*10/)).toBeInTheDocument();
  });

  it("metadataFetch paused → リトライボタン", async () => {
    const user = userEvent.setup();
    const props = {
      ...defaultProps(),
      metadataFetch: { active: true, total: 10, completed: 3 },
      metadataPaused: true,
      metadataPauseReason: "rate limited",
    };
    renderWithI18n(<FloatingStatusStack {...props} />);

    expect(screen.getByText("rate limited")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: i18n.t("floating.retry") })
    );
    expect(props.onRetryMetadata).toHaveBeenCalledTimes(1);
  });

  it("bulkDownload active → 一括DLパネル表示, 停止ボタン", async () => {
    const user = userEvent.setup();
    const props = {
      ...defaultProps(),
      bulkDownload: {
        ...emptyBulk,
        active: true,
        total: 5,
        completed: 2,
        currentId: "v1",
        currentTitle: "Test Video",
        phase: "video" as const,
      },
      isBulkLogOpen: true,
    };
    renderWithI18n(<FloatingStatusStack {...props} />);

    expect(screen.getByText(/2.*\/.*5/)).toBeInTheDocument();
    const stopBtn = screen.getByRole("button", {
      name: i18n.t("floating.stop"),
    });
    await user.click(stopBtn);
    expect(props.onStopBulkDownload).toHaveBeenCalledTimes(1);
  });

  it("activeActivityItems → DLログパネル表示", () => {
    const props = {
      ...defaultProps(),
      activeActivityItems: [
        { id: "a1", title: "Downloading X", status: "video", line: "50%" },
      ],
      activeDownloadCount: 1,
    };
    renderWithI18n(<FloatingStatusStack {...props} />);

    expect(screen.getByText(/1/)).toBeInTheDocument();
  });

  it("downloadErrors表示 + クリアボタン", async () => {
    const user = userEvent.setup();
    const props = {
      ...defaultProps(),
      hasDownloadErrors: true,
      downloadErrorSlides: [
        {
          title: "Error Video",
          video: { details: "download failed" },
          createdAt: Date.now(),
        },
      ],
      isDownloadErrorOpen: true,
    };
    renderWithI18n(<FloatingStatusStack {...props} />);

    expect(screen.getByText("Error Video")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: i18n.t("floating.clear") })
    );
    expect(props.onClearDownloadErrors).toHaveBeenCalledTimes(1);
  });
});
