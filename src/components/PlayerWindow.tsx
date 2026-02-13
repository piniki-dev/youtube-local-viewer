import type { ReactNode } from "react";
import { useTranslation } from 'react-i18next';

type PlayerWindowProps = {
  title: string;
  children: ReactNode;
};

export function PlayerWindow({ title, children }: PlayerWindowProps) {
  const { t } = useTranslation();
  return (
    <main className="app player-window">
      <header className="app-header">
        <div>
          <h1>{title || t('player.playback')}</h1>
        </div>
      </header>
      <section className="player-window-body">{children}</section>
    </main>
  );
}
