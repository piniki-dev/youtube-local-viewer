/**
 * C-3. AddVideoModal コンポーネントテスト
 *
 * URL入力、タブ切替、エラー表示、ボタン状態を検証。
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import i18n from "../i18n";
import { AddVideoModal } from "./AddVideoModal";

function defaultProps(): React.ComponentProps<typeof AddVideoModal> {
  return {
    isOpen: true,
    addMode: "video",
    onChangeAddMode: vi.fn(),
    videoUrl: "",
    onChangeVideoUrl: vi.fn(),
    channelUrl: "",
    onChangeChannelUrl: vi.fn(),
    downloadOnAdd: false,
    onToggleDownloadOnAdd: vi.fn(),
    errorMessage: "",
    isAdding: false,
    onClose: vi.fn(),
    onAddVideo: vi.fn(),
    onAddChannel: vi.fn(),
  };
}

function renderWithI18n(ui: React.ReactElement) {
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

describe("AddVideoModal", () => {
  it("isOpen=false → 何も描画しない", () => {
    const { container } = renderWithI18n(
      <AddVideoModal {...defaultProps()} isOpen={false} />
    );
    expect(container.querySelector(".modal")).toBeNull();
  });

  it("isOpen=true → モーダル表示", () => {
    renderWithI18n(<AddVideoModal {...defaultProps()} />);
    expect(screen.getByText(i18n.t("addVideo.title"))).toBeInTheDocument();
  });

  it("URL入力 → onChangeVideoUrl呼出", async () => {
    const user = userEvent.setup();
    const props = defaultProps();
    renderWithI18n(<AddVideoModal {...props} />);

    const input = screen.getByPlaceholderText(i18n.t("addVideo.videoUrlPlaceholder"));
    await user.type(input, "https://youtube.com/watch?v=test");

    expect(props.onChangeVideoUrl).toHaveBeenCalled();
  });

  it("追加ボタンクリック → onAddVideo呼出", async () => {
    const user = userEvent.setup();
    const props = { ...defaultProps(), videoUrl: "https://youtube.com/watch?v=test" };
    renderWithI18n(<AddVideoModal {...props} />);

    await user.click(screen.getByRole("button", { name: i18n.t("addVideo.add") }));
    expect(props.onAddVideo).toHaveBeenCalledTimes(1);
  });

  it("エラーメッセージ表示", () => {
    const props = { ...defaultProps(), errorMessage: "Invalid URL" };
    renderWithI18n(<AddVideoModal {...props} />);
    expect(screen.getByText("Invalid URL")).toBeInTheDocument();
  });

  it("isAdding=true → ボタン無効化", () => {
    const props = {
      ...defaultProps(),
      videoUrl: "https://youtube.com/watch?v=test",
      isAdding: true,
    };
    renderWithI18n(<AddVideoModal {...props} />);
    expect(screen.getByRole("button", { name: i18n.t("addVideo.add") })).toBeDisabled();
  });

  it("URL空 → 追加ボタン無効化", () => {
    renderWithI18n(<AddVideoModal {...defaultProps()} />);
    expect(screen.getByRole("button", { name: i18n.t("addVideo.add") })).toBeDisabled();
  });

  it("チャンネルタブ切替", async () => {
    const user = userEvent.setup();
    const props = defaultProps();
    renderWithI18n(<AddVideoModal {...props} />);

    await user.click(screen.getByRole("button", { name: i18n.t("addVideo.channelTab") }));
    expect(props.onChangeAddMode).toHaveBeenCalledWith("channel");
  });

  it("チャンネルモード → チャンネルURL入力表示", () => {
    const props = { ...defaultProps(), addMode: "channel" as const };
    renderWithI18n(<AddVideoModal {...props} />);
    expect(
      screen.getByPlaceholderText(i18n.t("addVideo.channelUrlPlaceholder"))
    ).toBeInTheDocument();
  });

  it("チャンネルモード → onAddChannel呼出", async () => {
    const user = userEvent.setup();
    const props = {
      ...defaultProps(),
      addMode: "channel" as const,
      channelUrl: "https://youtube.com/@test",
    };
    renderWithI18n(<AddVideoModal {...props} />);

    await user.click(screen.getByRole("button", { name: i18n.t("addVideo.add") }));
    expect(props.onAddChannel).toHaveBeenCalledTimes(1);
  });

  it("downloadOnAddチェックボックス", async () => {
    const user = userEvent.setup();
    const props = defaultProps();
    renderWithI18n(<AddVideoModal {...props} />);

    const checkbox = screen.getByRole("checkbox");
    await user.click(checkbox);
    expect(props.onToggleDownloadOnAdd).toHaveBeenCalledWith(true);
  });

  it("閉じるボタン → onClose呼出", async () => {
    const user = userEvent.setup();
    const props = defaultProps();
    renderWithI18n(<AddVideoModal {...props} />);

    await user.click(screen.getByRole("button", { name: i18n.t("addVideo.cancel") }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
