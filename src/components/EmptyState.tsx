import type { ReactNode } from "react";

type EmptyStateProps = {
  children: ReactNode;
};

export function EmptyState({ children }: EmptyStateProps) {
  return <section className="empty">{children}</section>;
}
