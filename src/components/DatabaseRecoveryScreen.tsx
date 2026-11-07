import React, { useState, useEffect } from 'react';
import { listAutoBackupsNative, readAutoBackupNative, openFileNative } from '../hooks/useElectronAPI';

interface DatabaseRecoveryScreenProps {
  error: string;
  onRetry: () => Promise<void>;
  onRestoreContent?: (content: string) => Promise<void>;
  onRestoreFile?: (file: File) => Promise<void>;
}

export const DatabaseRecoveryScreen: React.FC<DatabaseRecoveryScreenProps> = ({
  error,
  onRetry,
  onRestoreContent,
  onRestoreFile,
}) => {
  const [retrying, setRetrying] = useState(false);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);
  const [availableBackups, setAvailableBackups] = useState<
    Array<{
      filename: string;
      filePath: string;
      sizeBytes: number;
      createdAtIso: string;
      schemaVersion: string;
    }>
  >([]);
  const [loadingBackups, setLoadingBackups] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoadingBackups(true);
      try {
        const list = await listAutoBackupsNative();
        if (mounted) setAvailableBackups(list);
      } catch {
        // Fallback
      } finally {
        if (mounted) setLoadingBackups(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleRetry = async () => {
    setRetrying(true);
    setRetryMessage(null);
    try {
      await onRetry();
    } catch (err) {
      setRetryMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setRetrying(false);
    }
  };

  const handlePickBackupFile = async () => {
    try {
      const file = await openFileNative([
        { name: 'Backup Archives & JSON', extensions: ['zip', 'json'] },
      ]);
      if (file && onRestoreFile) {
        await onRestoreFile(file);
      }
    } catch (err) {
      alert(`Could not load backup file: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleRestoreAutoBackup = async (filename: string) => {
    if (!window.confirm(`Restore study progress from automatic backup "${filename}"? This will safely populate your workspace.`)) {
      return;
    }
    try {
      const res = await readAutoBackupNative(filename);
      if (res.success && res.content && onRestoreContent) {
        await onRestoreContent(res.content);
      } else {
        alert(res.error || 'Failed to read automatic backup.');
      }
    } catch (err) {
      alert(`Restore failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div className="h-screen w-screen overflow-y-auto bg-[#f7f9f8] dark:bg-[#0c1210] flex items-center justify-center p-4 sm:p-6 select-text">
      <div className="w-full max-w-2xl bg-white dark:bg-[#121917] rounded-2xl shadow-xl border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8">
        {/* Warning Icon & Header */}
        <div className="flex items-center gap-3.5 mb-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center text-2xl font-bold">
            ⚠
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 dark:text-neutral-100 m-0">
              Database Connection Recovery
            </h1>
            <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 mt-0.5 m-0">
              RBI Prep OS 2027 — Safe Startup Diagnostics
            </p>
          </div>
        </div>

        {/* Reassurance Banner */}
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs sm:text-sm mb-5 leading-relaxed">
          <strong>Your study data has NOT been lost or deleted.</strong> All existing records remain stored in your Windows user directory. The database process simply needs to be reconnected or restored.
        </div>

        {/* Error Details */}
        <div className="mb-6">
          <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1.5">
            Diagnostic Error Details
          </label>
          <div className="p-3 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 font-mono text-xs overflow-x-auto border border-neutral-200 dark:border-neutral-700">
            {error || 'Unable to open IndexedDB store: Database locked or initialization timeout.'}
          </div>
          {retryMessage && (
            <p className="mt-2 text-xs text-rose-600 font-medium">
              Retry attempt failed: {retryMessage}
            </p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <button
            type="button"
            disabled={retrying}
            onClick={handleRetry}
            className="px-5 py-2.5 rounded-xl bg-[#427968] hover:bg-[#346254] text-white text-sm font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            {retrying ? 'Retrying Connection...' : '↻ Retry Database Connection'}
          </button>

          <button
            type="button"
            onClick={handlePickBackupFile}
            className="px-4 py-2.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 text-sm font-semibold transition-colors cursor-pointer"
          >
            ⇧ Restore from ZIP / JSON File
          </button>
        </div>

        {/* Available Automatic Backups on Disk */}
        <div className="border-t border-neutral-200 dark:border-neutral-800 pt-5">
          <h2 className="text-sm font-bold text-neutral-900 dark:text-neutral-100 mb-2">
            Available Automatic Windows Backups
          </h2>
          <p className="text-xs text-neutral-500 mb-3">
            Stored safely in your Windows AppData directory (`userData/backups`):
          </p>

          {loadingBackups ? (
            <div className="py-4 text-center text-xs text-neutral-500">Checking for local backups...</div>
          ) : availableBackups.length === 0 ? (
            <div className="p-3 rounded-lg bg-neutral-50 dark:bg-neutral-850 text-neutral-500 text-xs">
              No automatic backups found yet. You can restore from a previously exported ZIP backup file.
            </div>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {availableBackups.slice(0, 5).map((b) => (
                <div
                  key={b.filename}
                  className="p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-850 border border-neutral-200 dark:border-neutral-800 flex items-center justify-between text-xs"
                >
                  <div className="min-w-0 pr-2">
                    <div className="font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                      {b.filename}
                    </div>
                    <div className="text-[11px] text-neutral-500">
                      {new Date(b.createdAtIso).toLocaleString()} · {(b.sizeBytes / 1024).toFixed(1)} KB
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRestoreAutoBackup(b.filename)}
                    className="px-3 py-1 rounded-lg bg-[#427968]/15 hover:bg-[#427968]/25 text-[#427968] font-semibold text-xs shrink-0 cursor-pointer"
                  >
                    Restore
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
