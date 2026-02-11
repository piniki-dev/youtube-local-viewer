import { useCallback, useEffect, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";

export function useTheme() {
  const [themeMode, setThemeModeRaw] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem("theme");
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
    return "system";
  });

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeRaw(mode);
    localStorage.setItem("theme", mode);
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    if (themeMode === "system") {
      html.removeAttribute("data-theme");
    } else {
      html.setAttribute("data-theme", themeMode);
    }
  }, [themeMode]);

  return { themeMode, setThemeMode };
}
