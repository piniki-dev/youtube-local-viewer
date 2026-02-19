/**
 * SetupDialog テスト
 *
 * props駆動の表示状態 (idle/downloading/done/error) とコールバック発火を検証。
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import i18n from "../i18n";
import { SetupDialog } from "./SetupDialog";
import type { DownloadState, MissingTool } from "../hooks/useToolSetup";

const IDLE_STATE: DownloadState = {
  active: false,
  currentTool: "",
  bytesDownloaded: 0,
  bytesTotal: null,
  status: "idle",
  message: "",
  error: null,
};

const DOWNLOADING_STATE: DownloadState = {
  active: true,
  currentTool: "yt-dlp",
  bytesDownloaded: 500,
  bytesTotal: 1000,
  status: "downloading",
  message: "Downloading yt-dlp...",
  error: null,
};

const DONE_STATE: DownloadState = {
  active: false,
  currentTool: "",
  bytesDownloaded: 0,
  bytesTotal: null,
  status: "done",
  message: "All tools installed!",
  error: null,
};

const ERROR_STATE: DownloadState = {
  active: false,
  currentTool: "",
  bytesDownloaded: 0,
  bytesTotal: null,
  status: "error",
  message: "",
  error: "Download failed: network error",
};

const MISSING_TOOLS: MissingTool[] = [
  { name: "yt-dlp", label: "yt-dlp" },
  { name: "ffmpeg", label: "FFmpeg / FFprobe" },
];

function renderDialog(overrides: Partial<Parameters<typeof SetupDialog>[0]> = {}) {
  const props = {
    isOpen: true,
    missingTools: MISSING_TOOLS,
    downloadState: IDLE_STATE,
    onStartDownload: vi.fn(),
    onSkip: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  const result = render(
    <I18nextProvider i18n={i18n}>
      <SetupDialog {...props} />
    </I18nextProvider>
  );
  return { ...result, props };
}

describe("SetupDialog", () => {
  // ── isOpen制御 ──

  it("isOpen=false → 何も描画しない", () => {
    const { container } = renderDialog({ isOpen: false });
    expect(container.innerHTML).toBe("");
  });

  it("isOpen=true → ダイアログ表示", () => {
    renderDialog();
    expect(screen.getByText(i18n.t("setup.title"))).toBeInTheDocument();
  });

  // ── idle状態 ──

  it("idle → 欠損ツール一覧を表示", () => {
    renderDialog();
    expect(screen.getByText("yt-dlp")).toBeInTheDocument();
    expect(screen.getByText("FFmpeg / FFprobe")).toBeInTheDocument();
  });

  it("idle → スキップ・ダウンロードボタンあり", () => {
    renderDialog();
    expect(screen.getByText(i18n.t("setup.skip"))).toBeInTheDocument();
    expect(screen.getByText(i18n.t("setup.autoDownload"))).toBeInTheDocument();
  });

  it("idle → 閉じるボタンあり", () => {
    renderDialog();
    expect(screen.getByTitle(i18n.t("setup.close"))).toBeInTheDocument();
  });

  // ── downloading状態 ──

  it("downloading → スピナーとメッセージ表示", () => {
    renderDialog({ downloadState: DOWNLOADING_STATE });
    expect(screen.getByText("Downloading yt-dlp...")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("downloading → 閉じるボタン非表示", () => {
    renderDialog({ downloadState: DOWNLOADING_STATE });
    expect(screen.queryByTitle(i18n.t("setup.close"))).not.toBeInTheDocument();
  });

  // ── done状態 ──

  it("done → 成功メッセージと閉じるボタン", () => {
    renderDialog({ downloadState: DONE_STATE });
    expect(screen.getByText("All tools installed!")).toBeInTheDocument();
    expect(screen.getByText(i18n.t("setup.close"))).toBeInTheDocument();
  });

  // ── error状態 ──

  it("error → エラーメッセージとリトライボタン", () => {
    renderDialog({ downloadState: ERROR_STATE });
    expect(
      screen.getByText("Download failed: network error")
    ).toBeInTheDocument();
    expect(screen.getByText(i18n.t("setup.retry"))).toBeInTheDocument();
  });

  // ── コールバック ──

  it("ダウンロードボタン → onStartDownload", async () => {
    const user = userEvent.setup();
    const { props } = renderDialog();
    await user.click(screen.getByText(i18n.t("setup.autoDownload")));
    expect(props.onStartDownload).toHaveBeenCalledOnce();
  });

  it("スキップボタン → onSkip", async () => {
    const user = userEvent.setup();
    const { props } = renderDialog();
    await user.click(screen.getByText(i18n.t("setup.skip")));
    expect(props.onSkip).toHaveBeenCalledOnce();
  });

  it("閉じるボタン → onClose", async () => {
    const user = userEvent.setup();
    const { props } = renderDialog();
    await user.click(screen.getByTitle(i18n.t("setup.close")));
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it("バックドロップクリック(idle) → onClose", async () => {
    const user = userEvent.setup();
    const { props, container } = renderDialog();
    const backdrop = container.querySelector(".modal-backdrop")!;
    await user.click(backdrop);
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it("バックドロップクリック(active) → onClose呼ばれない", async () => {
    const user = userEvent.setup();
    const { props, container } = renderDialog({
      downloadState: DOWNLOADING_STATE,
    });
    const backdrop = container.querySelector(".modal-backdrop")!;
    await user.click(backdrop);
    // active中はバックドロップ無効（onClickがundefined）
    // Note: click on modal-backdrop hits the backdrop handler only if it's set
    // When active, onClick is undefined so the event propagation won't call onClose
    // However userEvent clicks may bubble, so we just verify the intent
    expect(props.onClose).not.toHaveBeenCalled();
  });

  // ── プログレス計算 ──

  it("bytesTotal=0 → パーセント非表示", () => {
    const noTotalState: DownloadState = {
      ...DOWNLOADING_STATE,
      bytesTotal: 0,
    };
    renderDialog({ downloadState: noTotalState });
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it("bytesTotal=null → パーセント非表示", () => {
    const nullTotalState: DownloadState = {
      ...DOWNLOADING_STATE,
      bytesTotal: null,
    };
    renderDialog({ downloadState: nullTotalState });
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });
});
