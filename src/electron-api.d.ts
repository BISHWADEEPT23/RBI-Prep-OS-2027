/**
 * Global type declarations for the Electron preload bridge.
 *
 * Import this file in tsconfig.json (or reference it via triple-slash)
 * so the renderer TypeScript code gets full type safety when calling
 * window.electronAPI without importing from Electron directly.
 */

export {};

declare global {
  interface ElectronSaveFileResult {
    success: true;
    filePath: string;
  }
  interface ElectronSaveFileError {
    success: false;
    canceled?: boolean;
    error?: string;
  }
  type ElectronSaveFileReturn = ElectronSaveFileResult | ElectronSaveFileError;

  interface ElectronOpenFileResult {
    success: true;
    buffer: ArrayBuffer;
    filePath: string;
  }
  interface ElectronOpenFileError {
    success: false;
    canceled?: boolean;
    error?: string;
  }
  type ElectronOpenFileReturn = ElectronOpenFileResult | ElectronOpenFileError;

  interface ElectronTimerRecoveryResult {
    success: true;
    state: unknown;
  }
  interface ElectronTimerRecoveryError {
    success: false;
    state: null;
  }
  type ElectronTimerRecoveryReturn = ElectronTimerRecoveryResult | ElectronTimerRecoveryError;

  interface ElectronAPI {
    /** Open a Save-As dialog and write buffer to disk. */
    saveFile(filename: string, buffer: ArrayBuffer): Promise<ElectronSaveFileReturn>;

    /** Open a file-picker dialog and return the selected file's buffer. */
    openFile(
      filters?: Array<{ name: string; extensions: string[] }>
    ): Promise<ElectronOpenFileReturn>;

    /** Show a native OS notification. */
    showNotification(title: string, body: string): Promise<void>;

    /** App version from package.json. */
    getAppVersion(): Promise<string>;

    /** Host platform string. */
    getPlatform(): Promise<'win32' | 'darwin' | 'linux'>;

    /** OS-level preferred color scheme. */
    getNativeTheme(): Promise<'dark' | 'light'>;

    /** Persist timer heartbeat for crash recovery. */
    setTimerHeartbeat(state: unknown): Promise<{ success: boolean; error?: string }>;

    /** Read back persisted timer state on app startup. */
    getTimerRecoveryState(): Promise<ElectronTimerRecoveryReturn>;

    /** Clear recovery file after a clean session end. */
    clearTimerRecoveryState(): Promise<{ success: boolean; error?: string }>;

    /** Get startup performance instrumentation metrics. */
    getStartupMetrics(): Promise<{
      appLaunchEpochMs: number;
      appReadyMs: number;
      windowCreatedMs: number;
      readyToShowMs: number;
      didFinishLoadMs: number;
      nowEpochMs: number;
      uptimeSeconds: number;
    }>;

    /** Automatic Local Backup Bridge */
    autoBackup: {
      getDir(): Promise<string>;
      save(
        filename: string,
        payload: string,
        maxBackups?: number
      ): Promise<{
        success: boolean;
        filePath?: string;
        rotatedCount?: number;
        totalBackups?: number;
        error?: string;
      }>;
      list(): Promise<{
        success: boolean;
        backups: Array<{
          filename: string;
          filePath: string;
          sizeBytes: number;
          createdAtIso: string;
          schemaVersion: string;
        }>;
        error?: string;
      }>;
      read(
        filename: string
      ): Promise<{ success: boolean; content?: string; filePath?: string; error?: string }>;
    };
  }

  interface Window {
    electronAPI?: ElectronAPI;
  }
}
