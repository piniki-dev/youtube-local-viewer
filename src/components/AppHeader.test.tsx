import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import i18n from "../i18n";
import { AppHeader } from "./AppHeader";

describe("AppHeader", () => {
  it("renders title and buttons", () => {
    render(
      <I18nextProvider i18n={i18n}>
        <AppHeader onOpenSettings={() => {}} onOpenAdd={() => {}} addDisabled={false} themeMode="system" onThemeChange={() => {}} />
      </I18nextProvider>
    );

    expect(
      screen.getByRole("heading", { name: "YouTube Local Viewer" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "＋ Add Video" })
    ).toBeInTheDocument();
  });

  it("fires callbacks when buttons are clicked", async () => {
    const user = userEvent.setup();
    const onOpenSettings = vi.fn();
    const onOpenAdd = vi.fn();

    render(
      <I18nextProvider i18n={i18n}>
        <AppHeader
          onOpenSettings={onOpenSettings}
          onOpenAdd={onOpenAdd}
          addDisabled={false}
          themeMode="system"
          onThemeChange={() => {}}
        />
      </I18nextProvider>
    );

    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("button", { name: "＋ Add Video" }));

    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    expect(onOpenAdd).toHaveBeenCalledTimes(1);
  });
});
