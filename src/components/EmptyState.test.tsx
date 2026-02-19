/**
 * C-3. EmptyState コンポーネントテスト
 */
import { render, screen } from "@testing-library/react";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("children を section.empty 内に描画する", () => {
    render(<EmptyState>テスト空状態</EmptyState>);
    const el = screen.getByText("テスト空状態");
    expect(el).toBeInTheDocument();
    expect(el.closest("section")).toHaveClass("empty");
  });
});
