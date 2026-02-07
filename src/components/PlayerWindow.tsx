import type { ReactNode } from "react";
import { EmptyState } from "./EmptyState";

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
      {isOpen ? (
        <section className="player-window-body">{children}</section>
      ) : (
        <EmptyState>
          再生する動画が選択されていません。メインウィンドウから動画を再生してください。
        </EmptyState>
      )}
    </main>
  );
}
