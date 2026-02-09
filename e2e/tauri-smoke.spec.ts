import { test, expect } from "@playwright/test";

test("app shows header and empty state", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "YouTube Local Viewer" })
  ).toBeVisible();
  await expect(
    page.getByText("まだ動画がありません。右上の「＋ 動画を追加」から登録してください。")
  ).toBeVisible();
});
