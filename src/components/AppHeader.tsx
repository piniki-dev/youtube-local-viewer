import type { ThemeMode } from "../hooks/useTheme";

const THEME_CYCLE: ThemeMode[] = ["light", "dark", "system"];

const THEME_ICON: Record<ThemeMode, string> = {
  light: "ri-sun-line",
  dark: "ri-moon-line",
  system: "ri-computer-line",
};

const THEME_LABEL: Record<ThemeMode, string> = {
  light: "ライト",
  dark: "ダーク",
  system: "システム",
};

type AppHeaderProps = {
  onOpenSettings: () => void;
  onOpenAdd: () => void;
  addDisabled: boolean;
  themeMode: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
};

export function AppHeader({
  onOpenSettings,
  onOpenAdd,
  addDisabled,
  themeMode,
  onThemeChange,
}: AppHeaderProps) {
  const handleThemeClick = () => {
    const idx = THEME_CYCLE.indexOf(themeMode);
    const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
    onThemeChange(next);
  };

  return (
    <header className="app-header">
      <div>
        <h1>YouTube Local Viewer</h1>
        <p className="subtitle">ローカル保存と再生のためのデスクトップアプリ</p>
      </div>
      <div className="header-actions">
        <button
          className="ghost theme-toggle"
          onClick={handleThemeClick}
          title={`テーマ: ${THEME_LABEL[themeMode]}`}
        >
          <i className={THEME_ICON[themeMode]} />
        </button>
        <button className="ghost" onClick={onOpenSettings}>
          設定
        </button>
        <button className="primary" onClick={onOpenAdd} disabled={addDisabled}>
          ＋ 動画を追加
        </button>
      </div>
    </header>
  );
}
