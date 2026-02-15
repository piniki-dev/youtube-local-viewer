import { useTranslation } from "react-i18next";
import type { ThemeMode } from "../hooks/useTheme";

const THEME_CYCLE: ThemeMode[] = ["light", "dark", "system"];

const THEME_ICON: Record<ThemeMode, string> = {
  light: "ri-sun-line",
  dark: "ri-moon-line",
  system: "ri-computer-line",
};

type AppHeaderProps = {
  onOpenSettings: () => void;
  onOpenAdd: () => void;
  addDisabled: boolean;
  themeMode: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
  onDevReset?: () => void;
};

export function AppHeader({
  onOpenSettings,
  onOpenAdd,
  addDisabled,
  themeMode,
  onThemeChange,
  onDevReset,
}: AppHeaderProps) {
  const { t } = useTranslation();
  
  const handleThemeClick = () => {
    const idx = THEME_CYCLE.indexOf(themeMode);
    const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
    onThemeChange(next);
  };

  return (
    <header className="app-header">
      <div>
        <h1>{t("app.title")}</h1>
        <p className="subtitle">{t("app.subtitle")}</p>
      </div>
      <div className="header-actions">
        {onDevReset && (
          <button
            className="ghost"
            onClick={onDevReset}
            title="開発環境リセット"
            style={{ color: "var(--c-warning)", fontSize: "0.8rem" }}
          >
            <i className="ri-bug-line" style={{ marginRight: "0.25rem" }} />
            DEV Reset
          </button>
        )}
        <button
          className="ghost theme-toggle"
          onClick={handleThemeClick}
          title={`${t("header.theme.label")}: ${t(`header.theme.${themeMode}`)}`}
        >
          <i className={THEME_ICON[themeMode]} />
        </button>
        <button className="ghost" onClick={onOpenSettings}>
          {t("header.settings")}
        </button>
        <button className="primary" onClick={onOpenAdd} disabled={addDisabled}>
          {t("header.addVideo")}
        </button>
      </div>
    </header>
  );
}
