/**
 * Tauri API モック共通基盤
 * テスト内で `vi.mock(...)` を呼ぶ前に、import していれば自動適用される。
 * 個別テストでは `import { mockInvoke, emitEvent, resetTauriMocks } from "..."` で利用。
 */
import { vi } from "vitest";

// ── invoke モック ────────────────────────────────────────────
export const mockInvoke = vi.fn();

// ── listen モック（イベント名→ハンドラのマップ） ─────────────
const eventListeners = new Map<string, Set<Function>>();

export const mockListen = vi.fn(
  (event: string, handler: Function): Promise<() => void> => {
    if (!eventListeners.has(event)) {
      eventListeners.set(event, new Set());
    }
    eventListeners.get(event)!.add(handler);
    return Promise.resolve(() => {
      eventListeners.get(event)?.delete(handler);
    });
  }
);

export const mockEmitTo = vi.fn();

// ── vi.mock 定義 ───────────────────────────────────────────
vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: mockListen,
  emitTo: mockEmitTo,
}));

// ── テストヘルパー ─────────────────────────────────────────
/** 指定イベントのリスナーを全て発火させる */
export function emitEvent(name: string, payload: unknown) {
  const handlers = eventListeners.get(name);
  if (handlers) {
    handlers.forEach((handler) => handler({ payload }));
  }
}

/** 登録済みリスナー数を返す */
export function listenerCount(name: string) {
  return eventListeners.get(name)?.size ?? 0;
}

/** 全モックをリセット */
export function resetTauriMocks() {
  mockInvoke.mockReset();
  mockListen.mockClear();
  mockEmitTo.mockClear();
  eventListeners.clear();
}
