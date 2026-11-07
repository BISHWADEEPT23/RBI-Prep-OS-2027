/**
 * Electron Preload Script
 *
 * Runs in an isolated context. Only the narrow API exposed via
 * contextBridge.exposeInMainWorld is accessible to the renderer.
 *
 * Security: contextIsolation=true, nodeIntegration=false, sandbox=true
 */
import { contextBridge, ipcRenderer } from 'electron';

// ─── Type definitions (duplicated here so renderer can import from electron-api.d.ts) ───
export type SaveFileResult =
  | { success: true; filePath: string }
  | { success: false; canceled?: boolean; error?: string };

export type OpenFileResult =
  | { success: true; buffer: ArrayBuffer; filePath: string }
  | { success: false; canceled?: boolean; error?: string };

export type TimerRecoveryResult =
  | { success: true; state: unknown }
  | { success: false; state: null };

// ─── Exposed API ──────────────────────────────────────────────────────────────
contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Open a "Save As" dialog and write the given buffer to disk.
   */
  saveFile: (filename: string, buffer: ArrayBuffer): Promise<SaveFileResult> =>
    ipcRenderer.invoke('dialog:saveFile', filename, buffer),

  /**
   * Open a file-picker dialog and return the selected file's buffer.
   */
  openFile: (
    filters?: Array<{ name: string; extensions: string[] }>
  ): Promise<OpenFileResult> => ipcRenderer.invoke('dialog:openFile', filters),

  /**
   * Show a native OS notification.
   */
  showNotification: (title: string, body: string): Promise<void> =>
    ipcRenderer.invoke('notification:show', title, body),

  /**
   * Get the application version from package.json (via Electron).
   */
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),

  /**
   * Get the host platform string.
   */
  getPlatform: (): Promise<'win32' | 'darwin' | 'linux'> =>
    ipcRenderer.invoke('app:getPlatform'),

  /**
   * Get the OS-level preferred color scheme.
   */
  getNativeTheme: (): Promise<'dark' | 'light'> =>
    ipcRenderer.invoke('app:getNativeTheme'),

  /**
   * Persist a timer heartbeat state to userData/timer-recovery.json.
   * Called periodically by FocusRoom so the timer survives an unexpected
   * app restart.
   */
  setTimerHeartbeat: (state: unknown): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('timer:setRecoveryState', state),

  /**
   * Read back the last-persisted timer state (called on app startup).
   */
  getTimerRecoveryState: (): Promise<TimerRecoveryResult> =>
    ipcRenderer.invoke('timer:getRecoveryState'),

  /**
   * Clear the timer recovery file after a session ends cleanly.
   */
  clearTimerRecoveryState: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('timer:clearRecoveryState'),

  /**
   * Get startup performance instrumentation metrics.
   */
  getStartupMetrics: (): Promise<{
    appLaunchEpochMs: number;
    appReadyMs: number;
    windowCreatedMs: number;
    readyToShowMs: number;
    didFinishLoadMs: number;
    nowEpochMs: number;
    uptimeSeconds: number;
  }> => ipcRenderer.invoke('app:getStartupMetrics'),

  /**
   * Automatic local backup operations.
   */
  autoBackup: {
    getDir: (): Promise<string> => ipcRenderer.invoke('backup:getAutoBackupDir'),
    save: (
      filename: string,
      payload: string,
      maxBackups?: number
    ): Promise<{
      success: boolean;
      filePath?: string;
      rotatedCount?: number;
      totalBackups?: number;
      error?: string;
    }> => ipcRenderer.invoke('backup:saveAutoBackup', filename, payload, maxBackups),
    list: (): Promise<{
      success: boolean;
      backups: Array<{
        filename: string;
        filePath: string;
        sizeBytes: number;
        createdAtIso: string;
        schemaVersion: string;
      }>;
      error?: string;
    }> => ipcRenderer.invoke('backup:listAutoBackups'),
    read: (
      filename: string
    ): Promise<{ success: boolean; content?: string; filePath?: string; error?: string }> =>
      ipcRenderer.invoke('backup:readAutoBackup', filename),
  },
});
