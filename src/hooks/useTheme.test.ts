/**
 * useTheme テスト
 *
 * テーマモードの切り替え、localStorage永続化、data-theme属性を検証。
 */
import { renderHook, act } from "@testing-library/react";
import { useTheme } from "./useTheme";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("useTheme", () => {
  it("初期値 system（localStorageなし）", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.themeMode).toBe("system");
  });

  it("localStorageに light → 初期値 light", () => {
    localStorage.setItem("theme", "light");
    const { result } = renderHook(() => useTheme());
    expect(result.current.themeMode).toBe("light");
  });

  it("localStorageに dark → 初期値 dark", () => {
    localStorage.setItem("theme", "dark");
    const { result } = renderHook(() => useTheme());
    expect(result.current.themeMode).toBe("dark");
  });

  it("localStorageに不正値 → system フォールバック", () => {
    localStorage.setItem("theme", "invalid");
    const { result } = renderHook(() => useTheme());
    expect(result.current.themeMode).toBe("system");
  });

  it("setThemeMode('dark') → localStorage保存, data-theme設定", () => {
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.setThemeMode("dark");
    });
    expect(result.current.themeMode).toBe("dark");
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("setThemeMode('light') → data-theme='light'", () => {
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.setThemeMode("light");
    });
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("setThemeMode('system') → data-theme属性を削除", () => {
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.setThemeMode("dark");
    });
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    act(() => {
      result.current.setThemeMode("system");
    });
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });
});
