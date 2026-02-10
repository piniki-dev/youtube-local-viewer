import type { ReactNode } from "react";

type PlayerWindowProps = {
  title: string;
  isOpen: boolean;
  children: ReactNode;
};

export function PlayerWindow({ title, isOpen, children }: PlayerWindowProps) {
  return (
    <main className="app player-window">
      <header className="app-header">
        <div>
          <h1>{title || "再生"}</h1>
        </div>
      </header>
      <section className="player-window-body">{children}</section>
    </main>
  );
}
