/**
 * useBackupActions テスト
 *
 * exportBackup / importBackup コールバックのステートセッター呼び出し、
 * invoke呼び出し、エラーハンドリング、タイマーロジックを検証。
 */
import { renderHook, act } from "@testing-library/react";
import { mockInvoke, resetTauriMocks } from "../test/tauriMocks";
import { useBackupActions } from "./useBackupActions";

// plugin-dialog モック
const mockOpenDialog = vi.fn();
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => mockOpenDialog(...args),
}));

// @tauri-apps/api/path モック
vi.mock("@tauri-apps/api/path", () => ({
  join: vi.fn((...parts: string[]) => Promise.resolve(parts.join("/"))),
}));

function makeSetters() {
  return {
    persistSettings: vi.fn().mockResolvedValue(undefined),
    setSettingsErrorMessage: vi.fn(),
    setBackupMessage: vi.fn(),
    setBackupRestartRequired: vi.fn(),
    setIsBackupNoticeOpen: vi.fn(),
    setBackupRestartCountdown: vi.fn(),
  };
}

function makeParams(overrides: Record<string, unknown> = {}) {
  const setters = makeSetters();
  return {
    params: {
      ...setters,
      integrityCheckPendingKey: "test_integrityPending",
      ...overrides,
    },
    setters,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  resetTauriMocks();
  mockOpenDialog.mockReset();
  localStorage.removeItem("test_integrityPending");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useBackupActions", () => {
  // ── exportBackup ──

  it("exportBackup成功 → backupMessage + isBackupNoticeOpen", async () => {
    mockOpenDialog.mockResolvedValue("/export/dir");
    mockInvoke.mockResolvedValue(undefined);
    const { params, setters } = makeParams();
    const { result } = renderHook(() => useBackupActions(params));

    await act(async () => {
      await result.current.exportBackup();
    });

    expect(setters.persistSettings).toHaveBeenCalled();
    expect(mockInvoke).toHaveBeenCalledWith("export_state", {
      outputPath: "/export/dir/ytlv-backup.zip",
    });
    expect(setters.setBackupMessage).toHaveBeenCalledWith(
      expect.any(String)
    );
    expect(setters.setIsBackupNoticeOpen).toHaveBeenCalledWith(true);
    expect(setters.setBackupRestartRequired).toHaveBeenCalledWith(false);
  });

  it("exportBackup ダイアログキャンセル → 何もしない", async () => {
    mockOpenDialog.mockResolvedValue(null);
    const { params } = makeParams();
    const { result } = renderHook(() => useBackupActions(params));

    await act(async () => {
      await result.current.exportBackup();
    });

    expect(mockInvoke).not.toHaveBeenCalledWith(
      "export_state",
      expect.anything()
    );
  });

  it("exportBackup失敗 → settingsErrorMessage", async () => {
    mockOpenDialog.mockRejectedValue(new Error("dialog error"));
    const { params, setters } = makeParams();
    const { result } = renderHook(() => useBackupActions(params));

    await act(async () => {
      await result.current.exportBackup();
    });

    expect(setters.setSettingsErrorMessage).toHaveBeenCalledWith(
      expect.any(String)
    );
  });

  // ── importBackup ──

  it("importBackup成功 → restart通知 + カウントダウン開始", async () => {
    mockOpenDialog.mockResolvedValue("/path/to/backup.zip");
    mockInvoke.mockResolvedValue(undefined);
    const { params, setters } = makeParams();
    const { result } = renderHook(() => useBackupActions(params));

    await act(async () => {
      await result.current.importBackup();
    });

    expect(mockInvoke).toHaveBeenCalledWith("import_state", {
      inputPath: "/path/to/backup.zip",
    });
    expect(setters.setBackupRestartRequired).toHaveBeenCalledWith(true);
    expect(setters.setIsBackupNoticeOpen).toHaveBeenCalledWith(true);
    expect(setters.setBackupRestartCountdown).toHaveBeenCalledWith(10);
    expect(localStorage.getItem("test_integrityPending")).toBe("1");
  });

  it("importBackup カウントダウン → 1秒ごとにデクリメント", async () => {
    mockOpenDialog.mockResolvedValue("/path/to/backup.zip");
    mockInvoke.mockResolvedValue(undefined);
    // location.reload をモック
    const reloadMock = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, reload: reloadMock },
      writable: true,
    });
    const { params, setters } = makeParams();
    const { result } = renderHook(() => useBackupActions(params));

    await act(async () => {
      await result.current.importBackup();
    });

    // 初期値10が設定される
    expect(setters.setBackupRestartCountdown).toHaveBeenCalledWith(10);

    // 1秒経過ごとに updater関数が呼ばれる
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    // setBackupRestartCountdown は updater function で呼ばれる
    const updateCalls = setters.setBackupRestartCountdown.mock.calls;
    // 初期の10 + updater function呼び出しがある
    expect(updateCalls.length).toBeGreaterThan(1);
  });

  it("importBackup ダイアログキャンセル → 何もしない", async () => {
    mockOpenDialog.mockResolvedValue(null);
    const { params } = makeParams();
    const { result } = renderHook(() => useBackupActions(params));

    await act(async () => {
      await result.current.importBackup();
    });

    expect(mockInvoke).not.toHaveBeenCalledWith(
      "import_state",
      expect.anything()
    );
  });

  it("importBackup失敗 → settingsErrorMessage", async () => {
    mockOpenDialog.mockRejectedValue(new Error("import error"));
    const { params, setters } = makeParams();
    const { result } = renderHook(() => useBackupActions(params));

    await act(async () => {
      await result.current.importBackup();
    });

    expect(setters.setSettingsErrorMessage).toHaveBeenCalledWith(
      expect.any(String)
    );
  });

  // ── 初期化 ──

  it("exportBackup → エラーメッセージ初期化", async () => {
    mockOpenDialog.mockResolvedValue(null);
    const { params, setters } = makeParams();
    const { result } = renderHook(() => useBackupActions(params));

    await act(async () => {
      await result.current.exportBackup();
    });

    expect(setters.setSettingsErrorMessage).toHaveBeenCalledWith("");
    expect(setters.setBackupMessage).toHaveBeenCalledWith("");
    expect(setters.setBackupRestartRequired).toHaveBeenCalledWith(false);
  });
});
