type AppHeaderProps = {
  onOpenSettings: () => void;
  onOpenAdd: () => void;
};

export function AppHeader({ onOpenSettings, onOpenAdd }: AppHeaderProps) {
  return (
    <header className="app-header">
      <div>
        <h1>YouTube Local Viewer</h1>
        <p className="subtitle">ローカル保存と再生のためのデスクトップアプリ</p>
      </div>
      <div className="header-actions">
        <button className="ghost" onClick={onOpenSettings}>
          設定
        </button>
        <button className="primary" onClick={onOpenAdd}>
          ＋ 動画を追加
        </button>
      </div>
    </header>
  );
}
