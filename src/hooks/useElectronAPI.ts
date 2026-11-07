import '../electron-api.d.ts';

/**
 * useElectronAPI — Hook for detecting and using the Electron bridge.
 *
 * Usage:
 *   const { isElectron, saveFile, openFile } = useElectronAPI();
 *
 * Falls back to browser-native approaches when running in a web context.
 */

/** True when running inside the Electron shell. */
export const isElectron = (): boolean =>
  typeof window !== 'undefined' && typeof window.electronAPI !== 'undefined';

/**
 * Save a Blob or ArrayBuffer to disk.
 *
 * In Electron: opens a native Save-As dialog.
 * In browser: triggers a temporary <a> download link.
 */
export async function saveFileNative(
  blob: Blob,
  filename: string
): Promise<void> {
  if (isElectron() && window.electronAPI) {
    const buffer = await blob.arrayBuffer();
    const result = await window.electronAPI.saveFile(filename, buffer);
    if (!result.success && !result.canceled) {
      throw new Error(result.error ?? 'Unknown save error');
    }
    return;
  }

  // Browser fallback
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

/**
 * Open a file from disk.
 *
 * In Electron: opens a native file-picker dialog and returns a File object.
 * In browser: returns null (caller must use an <input type="file">).
 */
export async function openFileNative(
  filters?: Array<{ name: string; extensions: string[] }>
): Promise<File | null> {
  if (!isElectron() || !window.electronAPI) return null;

  const result = await window.electronAPI.openFile(filters);
  if (!result.success) return null;

  const { buffer, filePath } = result as { success: true; buffer: ArrayBuffer; filePath: string };
  const filename = filePath.split(/[\\/]/).pop() ?? 'file';
  return new File([buffer], filename);
}

/**
 * Show a native OS notification.
 * No-op in browser context.
 */
export async function showNativeNotification(
  title: string,
  body: string
): Promise<void> {
  if (isElectron() && window.electronAPI) {
    await window.electronAPI.showNotification(title, body);
    return;
  }
  // Browser: use the Web Notification API if permitted
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body });
  }
}

/**
 * Persist the focus-room timer state for crash recovery.
 * No-op in browser context.
 */
export async function setTimerHeartbeat(state: unknown): Promise<void> {
  if (isElectron() && window.electronAPI) {
    await window.electronAPI.setTimerHeartbeat(state);
  }
}

/**
 * Read back the last persisted timer state.
 * Returns null in browser context.
 */
export async function getTimerRecoveryState(): Promise<unknown | null> {
  if (!isElectron() || !window.electronAPI) return null;
  const result = await window.electronAPI.getTimerRecoveryState();
  if (!result.success) return null;
  return (result as { success: true; state: unknown }).state;
}

/**
 * Clear timer recovery state after a clean session end.
 */
export async function clearTimerRecoveryState(): Promise<void> {
  if (isElectron() && window.electronAPI) {
    await window.electronAPI.clearTimerRecoveryState();
  }
}

/**
 * Get Electron startup performance instrumentation metrics.
 */
export async function getStartupMetricsNative() {
  if (isElectron() && window.electronAPI) {
    return window.electronAPI.getStartupMetrics();
  }
  return null;
}

/**
 * Save an automatic local backup to userData/backups with rotation.
 */
export async function saveAutoBackupNative(
  filename: string,
  payload: string,
  maxBackups = 7
): Promise<{ success: boolean; filePath?: string; rotatedCount?: number; error?: string }> {
  if (isElectron() && window.electronAPI?.autoBackup) {
    return window.electronAPI.autoBackup.save(filename, payload, maxBackups);
  }

  // Web fallback: save into localStorage auto backup checkpoint
  try {
    const key = `rbi_prep_autobackup_${filename}`;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, payload);
    }
    return { success: true, filePath: 'browser-storage' };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * List automatic backups saved on this device.
 */
export async function listAutoBackupsNative(): Promise<
  Array<{
    filename: string;
    filePath: string;
    sizeBytes: number;
    createdAtIso: string;
    schemaVersion: string;
  }>
> {
  if (isElectron() && window.electronAPI?.autoBackup) {
    const res = await window.electronAPI.autoBackup.list();
    return res.success ? res.backups : [];
  }

  // Web fallback: list localStorage auto backups
  const backups: Array<{
    filename: string;
    filePath: string;
    sizeBytes: number;
    createdAtIso: string;
    schemaVersion: string;
  }> = [];
  if (typeof localStorage !== 'undefined') {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('rbi_prep_autobackup_')) {
        const val = localStorage.getItem(k) || '';
        backups.push({
          filename: k.replace('rbi_prep_autobackup_', ''),
          filePath: 'browser-storage',
          sizeBytes: val.length,
          createdAtIso: new Date().toISOString(),
          schemaVersion: '5.0-local-first-hybrid',
        });
      }
    }
  }
  return backups;
}

/**
 * Read the content of an automatic backup.
 */
export async function readAutoBackupNative(
  filename: string
): Promise<{ success: boolean; content?: string; error?: string }> {
  if (isElectron() && window.electronAPI?.autoBackup) {
    return window.electronAPI.autoBackup.read(filename);
  }

  if (typeof localStorage !== 'undefined') {
    const content = localStorage.getItem(`rbi_prep_autobackup_${filename}`);
    if (content) return { success: true, content };
  }
  return { success: false, error: 'Backup not found' };
}
