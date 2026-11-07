import React, { useState, useEffect } from 'react';
import { BackupInspectionPreview } from '../backup/backupRestore';
import { getKolkataDateString, useStudy } from '../context/StudyContext';
import { saveFileNative, listAutoBackupsNative, readAutoBackupNative } from '../hooks/useElectronAPI';
import { THEME_PRESETS } from '../theme/md3Theme';
import { AuthDiagnosticsPanel } from './AuthDiagnosticsPanel';

interface ParsedImportRow {
  title: string;
  subject: string;
  date: string;
  durationMinutes: number;
  isDuplicate: boolean;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const SettingsBackupImport: React.FC = () => {
  const {
    user,
    workspaceMode,
    prefs,
    topics,
    sessions,
    notes,
    quizzes,
    tasks,
    storageQuota,
    localStorageMigrationReport,
    cleanupLegacyLocalStorage,
    updatePrefs,
    enableCloudSyncWithConsent,
    disableCloudSync,
    signInWithGoogle,
    signOutUser,
    syncLocalToCloud,
    exportWorkspaceJson,
    exportCompleteZipBackup,
    inspectBackupFile,
    restoreBackupWithMode,
    restoreWorkspaceJson,
    triggerManualAutoBackup,
    saveRoutineTask,
    showSnackbar,
  } = useStudy();

  const [displayNameInput, setDisplayNameInput] = useState(prefs.displayName);
  const [dailyGoalInput, setDailyGoalInput] = useState(prefs.dailyGoalMinutes);
  const [intervalsInput, setIntervalsInput] = useState(prefs.revisionIntervals.join(', '));
  const [customHex, setCustomHex] = useState(prefs.themeSeed);
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(prefs.autoBackupEnabled !== false);

  // Automatic Local Backups State (Phase 5)
  const [autoBackupsList, setAutoBackupsList] = useState<
    Array<{
      filename: string;
      filePath: string;
      sizeBytes: number;
      createdAtIso: string;
      schemaVersion: string;
    }>
  >([]);
  const [loadingAutoBackups, setLoadingAutoBackups] = useState(false);
  const [creatingAutoBackup, setCreatingAutoBackup] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoadingAutoBackups(true);
      try {
        const list = await listAutoBackupsNative();
        if (mounted) setAutoBackupsList(list);
      } catch {
        // Fallback
      } finally {
        if (mounted) setLoadingAutoBackups(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const refreshAutoBackups = async () => {
    setLoadingAutoBackups(true);
    try {
      const list = await listAutoBackupsNative();
      setAutoBackupsList(list);
    } finally {
      setLoadingAutoBackups(false);
    }
  };

  const handleCreateAutoBackupNow = async () => {
    setCreatingAutoBackup(true);
    try {
      await triggerManualAutoBackup();
      await refreshAutoBackups();
    } finally {
      setCreatingAutoBackup(false);
    }
  };

  const handleInspectAutoBackup = async (filename: string) => {
    const res = await readAutoBackupNative(filename);
    if (res.success && res.content) {
      setRestoreInputSource(res.content);
      setRestoreJsonText(res.content);
      const preview = await inspectBackupFile(res.content);
      setBackupPreview(preview);
      showSnackbar(`Inspected backup "${filename}": ${preview.recordCounts.sessions} sessions, ${preview.recordCounts.topics} topics.`);
    } else {
      showSnackbar(`Failed to read backup: ${res.error || 'Unknown error'}`);
    }
  };

  // Cloud Sync Consent State
  const [cloudConsentConfirmed, setCloudConsentConfirmed] = useState(false);

  // Validated Backup & Restore State (Phase 10)
  const [exportingZip, setExportingZip] = useState(false);
  const [restoreInputSource, setRestoreInputSource] = useState<string | Blob | null>(null);
  const [restoreJsonText, setRestoreJsonText] = useState('');
  const [backupPreview, setBackupPreview] = useState<BackupInspectionPreview | null>(null);
  const [restoreMode, setRestoreMode] = useState<'merge' | 'replace'>('merge');
  const [restoring, setRestoring] = useState(false);

  // Optional Course Schedule Import (Part M — Section 22)
  const [courseImportText, setCourseImportText] = useState(
    'Functions of RBI & Monetary Policy, Finance, 2026-11-03, 60\nInflation & Phillips Curve, Economic and Social Issues, 2026-11-04, 45\nMotivation Theories (Maslow & Herzberg), Management, 2026-11-05, 45'
  );
  const [previewImportRows, setPreviewImportRows] = useState<ParsedImportRow[]>([]);

  const handleSaveProfileSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedIntervals = intervalsInput
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n >= 1 && n <= 180);

    await updatePrefs({
      displayName: displayNameInput.trim() || 'RBI Aspirant',
      dailyGoalMinutes: Math.min(Math.max(15, Number(dailyGoalInput) || 180), 960),
      revisionIntervals: parsedIntervals.length > 0 ? parsedIntervals : [1, 3, 7, 14, 30],
      autoBackupEnabled,
    });
    showSnackbar('Saved workspace preferences and spaced repetition intervals.');
  };

  const handleDownloadJsonBackup = async () => {
    const json = exportWorkspaceJson();
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const filename = `rbi_prep_os_2027_metadata_backup_${getKolkataDateString()}.json`;
    await saveFileNative(blob, filename);
    showSnackbar('Downloaded metadata-only JSON backup.');
  };

  const handleDownloadCompleteZipBackup = async () => {
    setExportingZip(true);
    try {
      const { zipBlob, filename } = await exportCompleteZipBackup();
      const resolvedFilename = filename || `rbi_prep_os_2027_complete_backup_${getKolkataDateString()}.zip`;
      await saveFileNative(zipBlob, resolvedFilename);
    } catch (err) {
      showSnackbar(err instanceof Error ? err.message : 'Failed to create ZIP backup.');
    } finally {
      setExportingZip(false);
    }
  };

  const handleExportCsvType = async (type: 'sessions' | 'notes' | 'progress' | 'quizzes') => {
    const today = getKolkataDateString();
    let csv = '';
    if (type === 'sessions') {
      csv =
        'ID,Date,Phase,Subject,Topic,FocusedMins,PausedMins,Confidence\n' +
        sessions
          .map(
            (s) =>
              `"${s.id}","${s.sessionDate}","${s.phase}","${s.subject}","${s.topicTitle}",${s.focusedMinutes},${s.pausedMinutes},${s.confidence}`
          )
          .join('\n');
    } else if (type === 'notes') {
      csv =
        'ID,Title,Subject,Topic,SourceType,Version,UpdatedAt\n' +
        notes
          .map(
            (n) =>
              `"${n.id}","${n.title.replace(/"/g, '""')}","${n.subject}","${n.topicTitle}","${n.sourceType}",${n.version},"${n.updatedAtIso}"`
          )
          .join('\n');
    } else if (type === 'progress') {
      csv =
        'ID,Phase,Subject,Chapter,Topic,Status,StudyMinutes,PracticeAccuracy,Confidence\n' +
        topics
          .map(
            (t) =>
              `"${t.id}","${t.phase}","${t.subject}","${t.chapter}","${t.title}","${t.status}",${t.studyMinutes},${t.practiceAccuracy ?? ''},${t.confidence}`
          )
          .join('\n');
    } else {
      csv =
        'ID,Date,Type,Subject,Topic,TotalQuestions,Correct,AccuracyPct,DurationSec\n' +
        quizzes
          .map(
            (q) =>
              `"${q.id}","${q.attemptDate}","${q.quizType}","${q.subject}","${q.topicTitle}",${q.totalQuestions},${q.correctCount},${q.accuracy},${q.durationSeconds}`
          )
          .join('\n');
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const filename = `rbi_prep_os_${type}_${today}.csv`;
    await saveFileNative(blob, filename);
  };

  const handleBackupFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      if (file.name.toLowerCase().endsWith('.zip') || file.type === 'application/zip') {
        setRestoreInputSource(file);
        setRestoreJsonText('');
        const preview = await inspectBackupFile(file);
        setBackupPreview(preview);
      } else {
        const text = await file.text();
        setRestoreJsonText(text);
        setRestoreInputSource(text);
        const preview = await inspectBackupFile(text);
        setBackupPreview(preview);
      }
    } catch (err) {
      setBackupPreview(null);
      showSnackbar(err instanceof Error ? err.message : 'Invalid backup file.');
    } finally {
      e.target.value = '';
    }
  };

  const handleInspectJsonText = async () => {
    if (!restoreJsonText.trim()) return;
    try {
      setRestoreInputSource(restoreJsonText);
      const preview = await inspectBackupFile(restoreJsonText);
      setBackupPreview(preview);
    } catch (err) {
      setBackupPreview(null);
      showSnackbar(err instanceof Error ? err.message : 'Invalid backup JSON.');
    }
  };

  const handleExecuteValidatedRestore = async () => {
    const source = restoreInputSource || restoreJsonText;
    if (!source) return;
    setRestoring(true);
    try {
      if (typeof source === 'string' && !backupPreview) {
        await restoreWorkspaceJson(source);
      } else {
        await restoreBackupWithMode(source, restoreMode);
      }
      setBackupPreview(null);
      setRestoreInputSource(null);
      setRestoreJsonText('');
    } catch (err) {
      showSnackbar(err instanceof Error ? err.message : 'Backup restore failed.');
    } finally {
      setRestoring(false);
    }
  };

  const handlePreviewCourseImport = () => {
    const lines = courseImportText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const parsed: ParsedImportRow[] = lines.map((line) => {
      const parts = line.split(',').map((p) => p.trim());
      const title = parts[0] || 'Planned Lesson';
      const subject = parts[1] || 'Finance';
      const date = parts[2] || getKolkataDateString();
      const durationMinutes = Number(parts[3]) || 45;
      const isDuplicate = tasks.some(
        (tk) => tk.title.toLowerCase() === title.toLowerCase() && tk.date === date
      );
      return { title, subject, date, durationMinutes, isDuplicate };
    });
    setPreviewImportRows(parsed);
  };

  const handleConfirmCourseImport = async () => {
    let added = 0;
    for (const row of previewImportRows) {
      if (!row.isDuplicate) {
        await saveRoutineTask({
          title: row.title,
          category: 'lesson',
          subject: row.subject,
          date: row.date,
          startTime: '19:30',
          durationMinutes: row.durationMinutes,
          priority: 'medium',
          status: 'planned',
        });
        added++;
      }
    }
    setPreviewImportRows([]);
    showSnackbar(
      `Imported ${added} planned schedule items (actual study history preserved untouched).`
    );
  };

  const totalAttachmentsCount = notes.reduce(
    (sum, n) => sum + (n.attachments?.length || 0),
    0
  );

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12">
      <div>
        <span className="text-xs font-medium text-[var(--md-on-surface-variant)]">
          Material You Theme Studio · Local-First IndexedDB (`rbi_prep_os_2027`) · Complete ZIP Backup &amp; Cloud Sync
        </span>
        <h1 className="font-display text-2xl md:text-3xl font-semibold text-[var(--md-on-surface)]">
          Settings, Theme Studio &amp; Backup
        </h1>
      </div>

      {/* Section 1: Material Design 3 Dynamic Color & Theme Studio (Part A Section 4) */}
      <section className="rounded-[28px] bg-[var(--md-surface-container-low)] p-6 md:p-8 border border-[var(--md-outline-variant)]/50 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-xs font-medium text-[var(--md-primary)]">
              Dynamic Color Engine
            </span>
            <h2 className="font-display text-xl font-semibold text-[var(--md-on-surface)]">
              Material You Theme Studio
            </h2>
          </div>

          {/* Appearance Mode Selector: Light, Dark, System */}
          <div className="inline-flex p-1 rounded-full bg-[var(--md-surface-container-high)] border border-[var(--md-outline-variant)]/50">
            {(['light', 'dark', 'system'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => updatePrefs({ themeMode: mode })}
                className={`px-4 py-1.5 rounded-full text-xs font-medium capitalize cursor-pointer ${
                  prefs.themeMode === mode
                    ? 'bg-[var(--md-primary)] text-[var(--md-on-primary)]'
                    : 'text-[var(--md-on-surface-variant)]'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {THEME_PRESETS.map((preset) => {
            const isSelected = prefs.themeSeed.toLowerCase() === preset.seed.toLowerCase();
            return (
              <button
                key={preset.id}
                onClick={() => {
                  setCustomHex(preset.seed);
                  updatePrefs({ themeSeed: preset.seed });
                }}
                className={`p-4 rounded-[20px] text-left border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-[var(--md-primary-container)] text-[var(--md-on-primary-container)] border-[var(--md-primary)]'
                    : 'bg-[var(--md-surface)] text-[var(--md-on-surface)] border-[var(--md-outline-variant)]/50'
                }`}
              >
                <div
                  className="w-8 h-8 rounded-full border border-black/10 mb-2.5"
                  style={{ backgroundColor: preset.seed }}
                />
                <p className="text-xs font-semibold">{preset.name}</p>
                <p className="text-[11px] opacity-75 font-mono-tabular mt-0.5">{preset.seed}</p>
              </button>
            );
          })}

          {/* Custom Seed Color Picker */}
          <div className="p-4 rounded-[20px] bg-[var(--md-surface)] border border-[var(--md-outline-variant)]/50 flex flex-col justify-between">
            <label className="text-xs font-semibold text-[var(--md-on-surface)]">
              Custom Seed
            </label>
            <div className="flex items-center gap-2 mt-2">
              <input
                type="color"
                value={customHex}
                onChange={(e) => {
                  setCustomHex(e.target.value);
                  updatePrefs({ themeSeed: e.target.value });
                }}
                className="w-8 h-8 rounded cursor-pointer border-0"
              />
              <span className="text-xs font-mono-tabular">{customHex}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: Account & Data Synchronization (Phase 2 & Phase 9) + Study Targets */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 rounded-[24px] bg-[var(--md-surface-container-low)] p-6 border border-[var(--md-outline-variant)]/40 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-xs font-medium text-[var(--md-primary)]">
                Mode: {workspaceMode === 'LOCAL_WORKSPACE' ? 'Local Workspace (Default)' : 'Cloud Sync Enabled'}
              </span>
              <h2 className="font-display text-lg font-semibold text-[var(--md-on-surface)]">
                Account &amp; Data Synchronization
              </h2>
            </div>

            <div className="inline-flex p-1 rounded-full bg-[var(--md-surface-container-high)] border border-[var(--md-outline-variant)]/50 text-xs">
              <button
                type="button"
                onClick={() => disableCloudSync()}
                className={`px-3 py-1 rounded-full font-medium cursor-pointer ${
                  workspaceMode === 'LOCAL_WORKSPACE'
                    ? 'bg-[var(--md-primary)] text-[var(--md-on-primary)]'
                    : 'text-[var(--md-on-surface-variant)]'
                }`}
              >
                Local Workspace
              </button>
              <button
                type="button"
                onClick={() => enableCloudSyncWithConsent()}
                className={`px-3 py-1 rounded-full font-medium cursor-pointer ${
                  workspaceMode === 'CLOUD_SYNC'
                    ? 'bg-[var(--md-primary)] text-[var(--md-on-primary)]'
                    : 'text-[var(--md-on-surface-variant)]'
                }`}
              >
                Cloud Sync
              </button>
            </div>
          </div>

          {workspaceMode === 'LOCAL_WORKSPACE' ? (
            <div className="p-4 rounded-[18px] bg-[var(--md-surface)] border border-[var(--md-outline-variant)]/50 space-y-2.5 text-xs">
              <div className="flex items-center gap-2 font-semibold text-[var(--md-primary)]">
                <span className="material-symbols-rounded text-[18px]">check_circle</span>
                <span>Saved on this device · Zero Sign-In Required</span>
              </div>
              <p className="text-[var(--md-on-surface-variant)] leading-relaxed">
                All your study sessions, Knowledge Vault notes, binary screenshot/PDF attachments, routine tasks, quizzes, and spaced repetition schedules are stored locally in IndexedDB (<code>rbi_prep_os_2027</code>). You never need a Google account to study.
              </p>
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => enableCloudSyncWithConsent()}
                  className="px-4 py-1.5 rounded-full bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)] text-xs font-medium cursor-pointer"
                >
                  Configure Optional Cloud Sync &rarr;
                </button>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-[18px] bg-[var(--md-surface)] border border-[var(--md-outline-variant)]/50 space-y-3 text-xs">
              <p className="font-semibold text-[var(--md-on-surface)]">
                Optional Cross-Device Cloud Sync (Firebase)
              </p>
              <p className="text-[var(--md-on-surface-variant)]">
                Pre-Sync Local Inventory ready: <strong>{notes.length}</strong> notes,{' '}
                <strong>{sessions.length}</strong> sessions, <strong>{tasks.length}</strong> tasks,{' '}
                <strong>{totalAttachmentsCount}</strong> attachments, and{' '}
                <strong>{quizzes.length}</strong> quizzes.
              </p>

              <label className="flex items-start gap-2 cursor-pointer text-[11px] text-[var(--md-on-surface)]">
                <input
                  type="checkbox"
                  checked={cloudConsentConfirmed}
                  onChange={(e) => setCloudConsentConfirmed(e.target.checked)}
                  className="mt-0.5 accent-[var(--md-primary)]"
                />
                <span>
                  I consent to synchronizing my local study records with my private Google account in Cloud Firestore &amp; Storage. Local IndexedDB remains the primary source of truth.
                </span>
              </label>

              {user ? (
                <div className="space-y-2.5 pt-1">
                  <p className="text-[var(--md-primary)] font-medium">
                    Connected as <strong>{user.email}</strong>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={syncLocalToCloud}
                      disabled={!cloudConsentConfirmed}
                      className="px-4 py-2 rounded-full bg-[var(--md-primary)] text-[var(--md-on-primary)] text-xs font-medium disabled:opacity-50 cursor-pointer"
                    >
                      Sync Local Records to Cloud
                    </button>
                    <button
                      type="button"
                      onClick={signOutUser}
                      className="px-4 py-2 rounded-full border border-[var(--md-outline-variant)] text-xs font-medium cursor-pointer"
                    >
                      Disconnect Cloud Sync (Keep Local Data)
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleDownloadCompleteZipBackup}
                    className="px-3.5 py-2 rounded-full border border-[var(--md-outline-variant)] text-xs font-medium cursor-pointer"
                  >
                    1. Export Pre-Sync ZIP Backup
                  </button>
                  <button
                    type="button"
                    disabled={!cloudConsentConfirmed}
                    onClick={signInWithGoogle}
                    className="px-4 py-2 rounded-full bg-[var(--md-primary)] text-[var(--md-on-primary)] text-xs font-medium disabled:opacity-50 cursor-pointer"
                  >
                    2. Connect Google Account for Cloud Sync
                  </button>
                </div>
              )}

              <div className="pt-2">
                <AuthDiagnosticsPanel />
              </div>
            </div>
          )}
        </div>

        <form
          onSubmit={handleSaveProfileSettings}
          className="lg:col-span-6 rounded-[24px] bg-[var(--md-surface-container-low)] p-6 border border-[var(--md-outline-variant)]/40 space-y-4"
        >
          <h2 className="font-display text-lg font-semibold text-[var(--md-on-surface)]">
            Study Targets, Spaced Repetition &amp; Device Storage
          </h2>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[var(--md-on-surface-variant)] mb-1">
                Display Name
              </label>
              <input
                type="text"
                value={displayNameInput}
                onChange={(e) => setDisplayNameInput(e.target.value)}
                className="w-full px-3.5 py-2 rounded-[12px] bg-[var(--md-surface)] text-sm border border-[var(--md-outline-variant)]"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--md-on-surface-variant)] mb-1">
                Daily Focus Goal (Minutes)
              </label>
              <input
                type="number"
                min={15}
                max={960}
                value={dailyGoalInput}
                onChange={(e) => setDailyGoalInput(Number(e.target.value))}
                className="w-full px-3.5 py-2 rounded-[12px] bg-[var(--md-surface)] text-sm font-mono-tabular border border-[var(--md-outline-variant)]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-[var(--md-on-surface-variant)] mb-1">
              Spaced Repetition Intervals (Days, comma-separated)
            </label>
            <input
              type="text"
              value={intervalsInput}
              onChange={(e) => setIntervalsInput(e.target.value)}
              className="w-full px-3.5 py-2 rounded-[12px] bg-[var(--md-surface)] text-sm font-mono-tabular border border-[var(--md-outline-variant)]"
            />
          </div>

          <button
            type="submit"
            className="px-5 py-2 rounded-full bg-[var(--md-primary)] text-[var(--md-on-primary)] text-xs font-medium cursor-pointer"
          >
            Save Preferences
          </button>

          {/* Local IndexedDB Quota & Legacy Migration Report */}
          <div className="p-3.5 rounded-[16px] bg-[var(--md-surface)] border border-[var(--md-outline-variant)]/50 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[var(--md-on-surface)]">
                Local IndexedDB Storage (`rbi_prep_os_2027` v2)
              </span>
              <span className="font-mono-tabular text-[11px] text-[var(--md-primary)] font-semibold">
                {storageQuota
                  ? `${formatBytes(storageQuota.usageBytes)} / ${formatBytes(storageQuota.quotaBytes)} (${storageQuota.usagePercent}%)`
                  : 'Active'}
              </span>
            </div>
            {localStorageMigrationReport && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[var(--md-outline-variant)]/30 text-[11px] text-[var(--md-on-surface-variant)]">
                <span>
                  LocalStorage &rarr; IndexedDB Migration:{' '}
                  <strong className="text-[var(--md-on-surface)]">
                    {localStorageMigrationReport.verifiedMatch ? 'VERIFIED' : 'PENDING'}
                  </strong>
                </span>
                {localStorageMigrationReport.verifiedMatch && localStorageMigrationReport.legacyRetained && (
                  <button
                    type="button"
                    onClick={cleanupLegacyLocalStorage}
                    className="underline text-[var(--md-primary)] cursor-pointer"
                  >
                    Clean Up Legacy LocalStorage Keys
                  </button>
                )}
              </div>
            )}
          </div>
        </form>
      </div>

      {/* Section 3: Complete ZIP Backup, Metadata Export & Validated Restore (Phase 10) */}
      <section className="rounded-[24px] bg-[var(--md-surface-container-low)] p-6 border border-[var(--md-outline-variant)]/40 space-y-5">
        <div>
          <span className="text-xs font-medium text-[var(--md-primary)]">
            Phase 10 — User-Owned Learning Records · Complete ZIP Archive (Database + Binary Attachments) &amp; SHA-256 Validated Restore
          </span>
          <h2 className="font-display text-lg font-semibold text-[var(--md-on-surface)]">
            Complete Backup, Export &amp; Non-Destructive Restore
          </h2>
          <p className="text-xs text-[var(--md-on-surface-variant)] mt-1">
            <strong>Two Backup Formats:</strong> Use <strong>Complete ZIP Backup (<code>.zip</code>)</strong> to export <code>workspace_database.json</code>, <code>manifest.json</code> (with SHA-256 checksums), and every binary screenshot/PDF stored in IndexedDB under <code>attachments/&#123;attachmentId&#125;/&#123;filename&#125;</code>. Use <strong>Metadata-Only JSON (<code>.json</code>)</strong> for lightweight text-only exports.
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            disabled={exportingZip}
            onClick={handleDownloadCompleteZipBackup}
            className="px-5 py-2.5 rounded-full bg-[var(--md-primary)] text-[var(--md-on-primary)] text-xs font-semibold disabled:opacity-50 cursor-pointer"
          >
            {exportingZip
              ? 'Packaging ZIP Archive & Checksums...'
              : 'Download Complete Backup (.zip — Database + Attachments)'}
          </button>

          <button
            type="button"
            onClick={handleDownloadJsonBackup}
            className="px-4 py-2 rounded-full bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)] text-xs font-medium cursor-pointer"
          >
            Download Metadata-Only Backup (.json)
          </button>

          <button
            type="button"
            onClick={() => handleExportCsvType('sessions')}
            className="px-4 py-2 rounded-full bg-[var(--md-surface)] border border-[var(--md-outline-variant)] text-xs font-medium cursor-pointer"
          >
            Export Study Sessions (CSV)
          </button>
          <button
            type="button"
            onClick={() => handleExportCsvType('notes')}
            className="px-4 py-2 rounded-full bg-[var(--md-surface)] border border-[var(--md-outline-variant)] text-xs font-medium cursor-pointer"
          >
            Export Notes Index (CSV)
          </button>
          <button
            type="button"
            onClick={() => handleExportCsvType('progress')}
            className="px-4 py-2 rounded-full bg-[var(--md-surface)] border border-[var(--md-outline-variant)] text-xs font-medium cursor-pointer"
          >
            Export Topic Progress (CSV)
          </button>
          <button
            type="button"
            onClick={() => handleExportCsvType('quizzes')}
            className="px-4 py-2 rounded-full bg-[var(--md-surface)] border border-[var(--md-outline-variant)] text-xs font-medium cursor-pointer"
          >
            Export Quiz/Mock Results (CSV)
          </button>
        </div>

        {/* Phase 5: Automatic Windows Local Backups */}
        <div className="pt-4 border-t border-[var(--md-outline-variant)]/40 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-[var(--md-on-surface)] m-0">
                Automatic Local Backups (Windows AppData Directory)
              </h3>
              <p className="text-[11px] text-[var(--md-on-surface-variant)] mt-0.5 m-0">
                Automatic rolling backups stored in <code>userData/backups</code>. Never stored in the app install folder. Rotates to retain the 7 most recent checkpoints.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-[var(--md-on-surface)]">
                <input
                  type="checkbox"
                  checked={autoBackupEnabled}
                  onChange={(e) => {
                    setAutoBackupEnabled(e.target.checked);
                    updatePrefs({ autoBackupEnabled: e.target.checked });
                  }}
                  className="accent-[var(--md-primary)]"
                />
                <span>Auto-backup after sessions</span>
              </label>

              <button
                type="button"
                disabled={creatingAutoBackup}
                onClick={handleCreateAutoBackupNow}
                className="px-4 py-1.5 rounded-full bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)] text-xs font-medium cursor-pointer disabled:opacity-50"
              >
                {creatingAutoBackup ? 'Creating...' : '+ Create Checkpoint Now'}
              </button>
            </div>
          </div>

          {/* List of available auto backups */}
          {loadingAutoBackups ? (
            <div className="py-2 text-xs text-[var(--md-on-surface-variant)]">Loading automatic backups...</div>
          ) : autoBackupsList.length > 0 ? (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {autoBackupsList.map((b) => (
                <div
                  key={b.filename}
                  className="p-2.5 rounded-xl bg-[var(--md-surface)] border border-[var(--md-outline-variant)]/40 flex items-center justify-between text-xs"
                >
                  <div className="min-w-0 pr-2">
                    <span className="font-semibold text-[var(--md-on-surface)] font-mono-tabular">
                      {b.filename}
                    </span>
                    <span className="text-[11px] text-[var(--md-on-surface-variant)] ml-2">
                      {new Date(b.createdAtIso).toLocaleString()} · {(b.sizeBytes / 1024).toFixed(1)} KB
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleInspectAutoBackup(b.filename)}
                    className="px-3 py-1 rounded-full bg-[var(--md-primary)]/10 text-[var(--md-primary)] hover:bg-[var(--md-primary)]/20 font-semibold text-xs cursor-pointer shrink-0"
                  >
                    Inspect &amp; Restore
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-[var(--md-surface)] text-xs text-[var(--md-on-surface-variant)]">
              No automatic local backups found yet. Click <strong>+ Create Checkpoint Now</strong> or complete a focus session to generate one.
            </div>
          )}
        </div>

        {/* Validated Restore Engine */}
        <div className="pt-4 border-t border-[var(--md-outline-variant)]/40 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-[var(--md-on-surface)]">
                Validated Restore Engine (.zip or .json)
              </p>
              <p className="text-[11px] text-[var(--md-on-surface-variant)]">
                Inspects schema version, verifies SHA-256 checksums, previews item counts, and supports Merge or Replace with automatic rollback if any error occurs.
              </p>
            </div>
            <label className="px-4 py-2 rounded-full bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)] text-xs font-semibold cursor-pointer">
              <span>Select Backup File (.zip or .json)</span>
              <input
                type="file"
                accept=".zip,.json,application/zip,application/json"
                onChange={handleBackupFileUpload}
                className="hidden"
              />
            </label>
          </div>

          <div className="space-y-2">
            <textarea
              rows={2}
              value={restoreJsonText}
              onChange={(e) => setRestoreJsonText(e.target.value)}
              placeholder="Or paste raw backup JSON here to inspect and restore..."
              className="w-full p-3 rounded-[12px] bg-[var(--md-surface)] text-xs font-mono-tabular border border-[var(--md-outline-variant)]"
            />
            {restoreJsonText.trim() && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleInspectJsonText}
                  className="px-4 py-1.5 rounded-full border border-[var(--md-outline-variant)] text-xs font-medium cursor-pointer"
                >
                  Inspect JSON Backup
                </button>
                <button
                  type="button"
                  disabled={restoring}
                  onClick={handleExecuteValidatedRestore}
                  className="px-4 py-1.5 rounded-full bg-[var(--md-primary)] text-[var(--md-on-primary)] text-xs font-medium cursor-pointer"
                >
                  Quick Merge Restore
                </button>
              </div>
            )}
          </div>

          {backupPreview && (
            <div className="p-4 rounded-[18px] bg-[var(--md-surface)] border border-[var(--md-primary)]/50 space-y-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-bold text-[var(--md-on-surface)]">
                    Backup Inspection Preview ({backupPreview.backupType})
                  </span>
                  <span className="ml-2 text-[11px] text-[var(--md-on-surface-variant)]">
                    Exported: {new Date(backupPreview.exportedAtIso).toLocaleString()}
                  </span>
                </div>
                <span
                  className={`px-2.5 py-0.5 rounded-full font-semibold ${
                    backupPreview.checksumVerified
                      ? 'bg-[#def4ef] text-[#0c695d]'
                      : 'bg-[#ffe8e5] text-[#8a1f17]'
                  }`}
                >
                  {backupPreview.checksumVerified
                    ? '✓ SHA-256 Checksums Verified'
                    : '✕ Checksum Mismatch Detected'}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono-tabular text-[11px]">
                <div className="p-2.5 rounded-lg bg-[var(--md-surface-container-low)]">
                  Notes: <strong>{backupPreview.recordCounts.notes}</strong>
                </div>
                <div className="p-2.5 rounded-lg bg-[var(--md-surface-container-low)]">
                  Sessions: <strong>{backupPreview.recordCounts.sessions}</strong>
                </div>
                <div className="p-2.5 rounded-lg bg-[var(--md-surface-container-low)]">
                  Attachments (Binaries):{' '}
                  <strong>{backupPreview.recordCounts.attachmentBinariesIncluded}</strong>
                </div>
                <div className="p-2.5 rounded-lg bg-[var(--md-surface-container-low)]">
                  Duplicate IDs: <strong>{backupPreview.totalDuplicates}</strong>
                </div>
              </div>

              {backupPreview.checksumErrors.length > 0 && (
                <div className="p-3 rounded-lg bg-[#ffe8e5] text-[#8a1f17] space-y-1">
                  {backupPreview.checksumErrors.map((err, idx) => (
                    <p key={idx}>{err}</p>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--md-outline-variant)]/40">
                <div className="flex items-center gap-3">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="restoreMode"
                      checked={restoreMode === 'merge'}
                      onChange={() => setRestoreMode('merge')}
                      className="accent-[var(--md-primary)]"
                    />
                    <span>
                      <strong>Merge</strong> (Keep existing records, add new IDs)
                    </span>
                  </label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="restoreMode"
                      checked={restoreMode === 'replace'}
                      onChange={() => setRestoreMode('replace')}
                      className="accent-[var(--md-primary)]"
                    />
                    <span>
                      <strong>Replace</strong> (Replace local workspace with backup)
                    </span>
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setBackupPreview(null);
                      setRestoreInputSource(null);
                    }}
                    className="px-3.5 py-1.5 rounded-full border border-[var(--md-outline-variant)] text-xs cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!backupPreview.valid || restoring}
                    onClick={handleExecuteValidatedRestore}
                    className="px-5 py-2 rounded-full bg-[var(--md-primary)] text-[var(--md-on-primary)] text-xs font-semibold disabled:opacity-50 cursor-pointer"
                  >
                    {restoring
                      ? 'Restoring...'
                      : `Confirm & Execute ${restoreMode === 'merge' ? 'Merge' : 'Replace'} Restore`}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Section 4: Optional Course Schedule Import (Part M — Section 22) */}
      <section className="rounded-[24px] bg-[var(--md-surface-container-low)] p-6 border border-[var(--md-outline-variant)]/40 space-y-4">
        <div>
          <span className="text-xs font-medium text-[var(--md-primary)]">
            Optional Schedule Import · Distinct from Actual Study History
          </span>
          <h2 className="font-display text-lg font-semibold text-[var(--md-on-surface)]">
            Import Study Schedule (CSV / Structured Text)
          </h2>
          <p className="text-xs text-[var(--md-on-surface-variant)] mt-0.5">
            Format per line: <code>Topic Title, Subject, YYYY-MM-DD, DurationMinutes</code>. Preview and confirm before adding to your Routine Planner.
          </p>
        </div>

        <textarea
          rows={4}
          value={courseImportText}
          onChange={(e) => setCourseImportText(e.target.value)}
          className="w-full p-3.5 rounded-[14px] bg-[var(--md-surface)] text-xs font-mono-tabular border border-[var(--md-outline-variant)]"
        />

        <div className="flex items-center gap-3">
          <button
            onClick={handlePreviewCourseImport}
            className="px-4 py-2 rounded-full bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)] text-xs font-medium cursor-pointer"
          >
            Preview &amp; Check Duplicates
          </button>
          {previewImportRows.length > 0 && (
            <button
              onClick={handleConfirmCourseImport}
              className="px-5 py-2 rounded-full bg-[var(--md-primary)] text-[var(--md-on-primary)] text-xs font-medium cursor-pointer"
            >
              Confirm Import ({previewImportRows.filter((r) => !r.isDuplicate).length} new blocks)
            </button>
          )}
        </div>

        {previewImportRows.length > 0 && (
          <div className="space-y-2 pt-2">
            {previewImportRows.map((row, i) => (
              <div
                key={i}
                className="p-3 rounded-[12px] bg-[var(--md-surface)] border border-[var(--md-outline-variant)]/50 flex items-center justify-between text-xs"
              >
                <span>
                  <strong>{row.title}</strong> · {row.subject} · {row.date} ({row.durationMinutes}m)
                </span>
                <span className="font-medium text-[var(--md-primary)]">
                  {row.isDuplicate ? 'Duplicate (Will Skip)' : 'Ready to Import'}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
