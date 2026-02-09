import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppHeader } from "./AppHeader";

describe("AppHeader", () => {
  it("renders title and buttons", () => {
    render(<AppHeader onOpenSettings={() => {}} onOpenAdd={() => {}} />);

    expect(
      screen.getByRole("heading", { name: "YouTube Local Viewer" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "設定" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "＋ 動画を追加" })
    ).toBeInTheDocument();
  });

  it("fires callbacks when buttons are clicked", async () => {
    const user = userEvent.setup();
    const onOpenSettings = vi.fn();
    const onOpenAdd = vi.fn();

    render(<AppHeader onOpenSettings={onOpenSettings} onOpenAdd={onOpenAdd} />);

    await user.click(screen.getByRole("button", { name: "設定" }));
    await user.click(screen.getByRole("button", { name: "＋ 動画を追加" }));

    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    expect(onOpenAdd).toHaveBeenCalledTimes(1);
  });
});
