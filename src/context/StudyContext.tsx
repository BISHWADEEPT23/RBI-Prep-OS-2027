import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import {
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  makeSafeId,
  OperationType,
  stripUndefined,
} from '../firebase';
import { applyMd3ThemeToDocument } from '../theme/md3Theme';
import {
  ActiveTimerState,
  AIInteractionRecord,
  CurrentAffairRecord,
  DEFAULT_RBI_SUBJECTS,
  ExamPhase,
  LocalStorageMigrationReport,
  NavigationTab,
  QuizAttemptRecord,
  RevisionRecord,
  RoutineTaskRecord,
  StorageQuotaEstimate,
  StudySessionRecord,
  SubjectCategory,
  SyncConflictRecord,
  TopicRecord,
  UserWorkspacePrefs,
  VaultNoteRecord,
  WorkspaceMode,
} from '../types';
import {
  confirmLegacyLocalStorageCleanup,
  dbAtomicSaveQuizAttempt,
  dbAtomicSaveStudySession,
  dbAtomicSaveVaultNote,
  dbDeleteCurrentAffair,
  dbDeleteRoutineTask,
  dbDeleteTopic,
  dbDeleteVaultNote,
  dbQueueSyncOperation,
  dbSaveActiveTimer,
  dbSaveAIConversation,
  dbSaveCurrentAffair,
  dbSavePrefs,
  dbSaveRevisionItem,
  dbSaveRoutineTask,
  dbSaveTopic,
  estimateStorageQuota,
  isQuotaExceededError,
  LEGACY_LOCAL_STORAGE_KEY,
  loadWorkspaceFromIndexedDb,
  migrateLegacyLocalStorageToIndexedDb,
  subscribeCrossTabChanges,
} from '../db/localDb';
import { listPendingOfflineAttachments } from '../offlineQueue';
import {
  retryAttachmentUpload,
  sanitizeAttachmentForFirestore,
} from '../storage';
import {
  AuthErrorDiagnosis,
  AuthPreflightResult,
  diagnoseFirebaseAuthError,
  runFirebaseAuthPreflightCheck,
} from '../authDiagnostics';
import {
  AiStatusDetails,
  checkAiProviderStatus,
  getAiAvailabilityMessage,
  getOrCreateLocalWorkspaceId,
} from '../aiApi';
import {
  CloudSyncInventory,
  defaultCloudSyncAdapter,
  PushSyncResult,
} from '../sync/cloudSyncAdapter';
import {
  BackupInspectionPreview,
  buildWorkspaceDatabasePayload,
  createCompleteZipBackup,
  executeValidatedRestore,
  inspectBackupInput,
  RestoreExecutionResult,
  triggerAutoBackup,
} from '../backup/backupRestore';

export function getKolkataDateString(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

export function getKolkataFormattedDisplayDate(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function getKolkataGreeting(date: Date = new Date()): string {
  const hourStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    hour12: false,
  }).format(date);
  const hour = parseInt(hourStr, 10);
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function addDaysToDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + days));
  return dt.toISOString().slice(0, 10);
}

export const DEFAULT_TIMER_STATE: ActiveTimerState = {
  isRunning: false,
  isPaused: false,
  mode: 'stopwatch',
  phase: 'Phase II',
  subject: 'Finance',
  topicId: '',
  topicTitle: '',
  goal: '',
  plannedMinutes: 45,
  accumulatedFocusedMs: 0,
  accumulatedPausedMs: 0,
  lastResumeEpochMs: null,
  lastPauseEpochMs: null,
  lastHeartbeatEpochMs: null,
  unverifiedGapDetected: false,
  unverifiedGapMinutes: 0,
  checklist: [],
  quickNotes: '',
  sessionScreenshots: [],
};

export const DEFAULT_PREFS: UserWorkspacePrefs = {
  userId: 'local_user',
  workspaceId: getOrCreateLocalWorkspaceId(),
  workspaceMode: 'LOCAL_WORKSPACE',
  displayName: 'RBI Aspirant',
  themeSeed: '#427968',
  themeMode: 'light',
  dailyGoalMinutes: 180,
  officeStart: '09:00',
  officeEnd: '18:00',
  workDays: [1, 2, 3, 4, 5],
  revisionIntervals: [1, 3, 7, 14, 30],
  customSubjects: [],
};

export interface StudyRecommendation {
  id: string;
  title: string;
  subject: string;
  topicId?: string;
  topicTitle?: string;
  actionTab: NavigationTab;
  priorityLabel: 'High Priority' | 'Recommended Next' | 'Suggested';
  reason: string;
}

export interface PendingRetryOperation {
  description: string;
  errorMessage: string;
  retryFn: () => Promise<void>;
}

interface StudyContextValue {
  user: User | null;
  authReady: boolean;
  dbReady: boolean;
  isHydrating: boolean;
  dbError: string | null;
  lastSaveTimeIso: string | null;
  retryDatabaseConnection: () => Promise<void>;
  triggerManualAutoBackup: () => Promise<{ success: boolean; filePath?: string; error?: string }>;
  workspaceMode: WorkspaceMode;
  syncMode: 'cloud' | 'local';
  activeTab: NavigationTab;
  setActiveTab: (tab: NavigationTab) => void;
  aiDrawerOpen: boolean;
  setAiDrawerOpen: (open: boolean) => void;
  aiContextTopic: { subject: string; topicTitle: string; topicId?: string } | null;
  openAiTutorWithContext: (subject: string, topicTitle: string, topicId?: string) => void;

  // AI Provider Status (Phase 7)
  aiStatus: AiStatusDetails;
  refreshAiStatus: () => Promise<AiStatusDetails>;

  // Storage Quota & LocalStorage Migration (Phase 3 & 4)
  storageQuota: StorageQuotaEstimate;
  refreshStorageQuota: () => Promise<StorageQuotaEstimate>;
  localStorageMigrationReport: LocalStorageMigrationReport | null;
  cleanupLegacyLocalStorage: () => void;

  prefs: UserWorkspacePrefs;
  allSubjects: SubjectCategory[];
  topics: TopicRecord[];
  sessions: StudySessionRecord[];
  tasks: RoutineTaskRecord[];
  notes: VaultNoteRecord[];
  quizzes: QuizAttemptRecord[];
  revisions: RevisionRecord[];
  currentAffairs: CurrentAffairRecord[];
  aiInteractions: AIInteractionRecord[];
  activeTimer: ActiveTimerState;

  pendingRetry: PendingRetryOperation | null;
  clearPendingRetry: () => void;
  snackbarMessage: string | null;
  showSnackbar: (msg: string) => void;
  isOnline: boolean;
  pendingSyncCount: number;
  syncConflicts: SyncConflictRecord[];
  resolveSyncConflict: (
    noteId: string,
    resolution: 'keep_local' | 'accept_remote' | 'fork_both'
  ) => Promise<void>;
  retryPendingOfflineUploads: () => Promise<number>;

  // Optional Cloud Sync & Auth Actions (Phase 2 & 9)
  authDiagnosis: AuthErrorDiagnosis | null;
  clearAuthDiagnosis: () => void;
  authPreflight: AuthPreflightResult | null;
  runAuthPreflight: () => Promise<AuthPreflightResult>;
  signInWithGoogle: () => Promise<void>;
  signInWithGoogleRedirectFallback: () => Promise<void>;
  signOutUser: () => Promise<void>;
  enableCloudSyncWithConsent: () => Promise<void>;
  disableCloudSync: () => Promise<void>;
  prepareCloudSyncInventory: () => Promise<CloudSyncInventory>;
  syncLocalToCloud: () => Promise<PushSyncResult | void>;

  // Preferences & Theme
  updatePrefs: (partial: Partial<UserWorkspacePrefs>) => Promise<void>;
  addCustomSubject: (phase: ExamPhase, name: string, code: string) => Promise<void>;

  // Focus Room & Timer
  updateActiveTimer: (updater: (prev: ActiveTimerState) => ActiveTimerState) => void;
  startFocusForTopic: (
    phase: ExamPhase,
    subject: string,
    topicTitle: string,
    topicId?: string,
    plannedMinutes?: number,
    goal?: string
  ) => void;

  // CRUD Operations
  saveTopic: (
    topic: Omit<TopicRecord, 'id' | 'userId' | 'createdAtIso' | 'updatedAtIso'> & { id?: string }
  ) => Promise<TopicRecord>;
  deleteTopic: (id: string) => Promise<void>;
  saveStudySession: (
    session: Omit<StudySessionRecord, 'id' | 'userId' | 'createdAtIso' | 'updatedAtIso'> & {
      id?: string;
    },
    autoScheduleRevision?: boolean
  ) => Promise<StudySessionRecord>;
  saveRoutineTask: (
    task: Omit<RoutineTaskRecord, 'id' | 'userId' | 'createdAtIso' | 'updatedAtIso'> & {
      id?: string;
    }
  ) => Promise<RoutineTaskRecord>;
  deleteRoutineTask: (id: string) => Promise<void>;
  saveVaultNote: (
    note: Omit<VaultNoteRecord, 'id' | 'userId' | 'createdAtIso' | 'updatedAtIso'> & { id?: string }
  ) => Promise<VaultNoteRecord>;
  deleteVaultNote: (id: string) => Promise<void>;
  saveQuizAttempt: (
    attempt: Omit<QuizAttemptRecord, 'id' | 'userId' | 'createdAtIso' | 'updatedAtIso'> & {
      id?: string;
    }
  ) => Promise<QuizAttemptRecord>;
  saveRevisionItem: (
    rev: Omit<RevisionRecord, 'id' | 'userId' | 'createdAtIso' | 'updatedAtIso'> & { id?: string }
  ) => Promise<RevisionRecord>;
  completeRevisionItem: (
    revisionId: string,
    newConfidence: number,
    scheduleNextStage: boolean
  ) => Promise<void>;
  saveCurrentAffair: (
    entry: Omit<CurrentAffairRecord, 'id' | 'userId' | 'createdAtIso' | 'updatedAtIso'> & {
      id?: string;
    }
  ) => Promise<CurrentAffairRecord>;
  deleteCurrentAffair: (id: string) => Promise<void>;
  saveAIInteraction: (
    interaction: Omit<AIInteractionRecord, 'id' | 'userId' | 'createdAtIso' | 'updatedAtIso'>
  ) => Promise<void>;

  // Recommendations & Backup (Phase 10)
  recommendations: StudyRecommendation[];
  exportWorkspaceJson: () => string;
  exportCompleteZipBackup: () => Promise<{ zipBlob: Blob; filename: string }>;
  inspectBackupFile: (input: string | Blob) => Promise<BackupInspectionPreview>;
  restoreBackupWithMode: (
    input: string | Blob,
    mode: 'merge' | 'replace'
  ) => Promise<RestoreExecutionResult>;
  restoreWorkspaceJson: (
    jsonString: string
  ) => Promise<{ importedCount: number; skippedDuplicates: number }>;
}

const StudyContext = createContext<StudyContextValue | null>(null);

interface LocalStoreBundle {
  prefs: UserWorkspacePrefs;
  topics: TopicRecord[];
  sessions: StudySessionRecord[];
  tasks: RoutineTaskRecord[];
  notes: VaultNoteRecord[];
  quizzes: QuizAttemptRecord[];
  revisions: RevisionRecord[];
  currentAffairs: CurrentAffairRecord[];
  aiInteractions: AIInteractionRecord[];
  activeTimer: ActiveTimerState;
}

function loadFastInitialHintFromLocalStorage(): LocalStoreBundle {
  try {
    const raw =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem(LEGACY_LOCAL_STORAGE_KEY)
        : null;
    if (!raw) {
      return {
        prefs: DEFAULT_PREFS,
        topics: [],
        sessions: [],
        tasks: [],
        notes: [],
        quizzes: [],
        revisions: [],
        currentAffairs: [],
        aiInteractions: [],
        activeTimer: DEFAULT_TIMER_STATE,
      };
    }
    const parsed = JSON.parse(raw);
    return {
      prefs: {
        ...DEFAULT_PREFS,
        ...(parsed.prefs || {}),
        workspaceMode: parsed.prefs?.workspaceMode || 'LOCAL_WORKSPACE',
      },
      topics: Array.isArray(parsed.topics) ? parsed.topics : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      notes: Array.isArray(parsed.notes) ? parsed.notes : [],
      quizzes: Array.isArray(parsed.quizzes) ? parsed.quizzes : [],
      revisions: Array.isArray(parsed.revisions) ? parsed.revisions : [],
      currentAffairs: Array.isArray(parsed.currentAffairs) ? parsed.currentAffairs : [],
      aiInteractions: Array.isArray(parsed.aiInteractions) ? parsed.aiInteractions : [],
      activeTimer: { ...DEFAULT_TIMER_STATE, ...(parsed.activeTimer || {}) },
    };
  } catch {
    return {
      prefs: DEFAULT_PREFS,
      topics: [],
      sessions: [],
      tasks: [],
      notes: [],
      quizzes: [],
      revisions: [],
      currentAffairs: [],
      aiInteractions: [],
      activeTimer: DEFAULT_TIMER_STATE,
    };
  }
}

const VALID_NAV_TABS: NavigationTab[] = [
  'home',
  'focus',
  'routine',
  'subjects',
  'vault',
  'revision',
  'practice',
  'current_affairs',
  'analytics',
  'settings',
];

function getTabFromUrl(): NavigationTab {
  if (typeof window === 'undefined') return 'home';
  if (window.location.hash) {
    const raw = window.location.hash.replace(/^#\/?/, '').trim();
    if (VALID_NAV_TABS.includes(raw as NavigationTab)) {
      return raw as NavigationTab;
    }
  }
  const segments = window.location.pathname.split('/').filter(Boolean);
  const lastSegment = segments[segments.length - 1];
  if (lastSegment && VALID_NAV_TABS.includes(lastSegment as NavigationTab)) {
    return lastSegment as NavigationTab;
  }
  return 'home';
}

export const StudyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const initialFast = useMemo(() => loadFastInitialHintFromLocalStorage(), []);

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(true); // Non-blocking startup in Local Workspace mode
  const [dbReady, setDbReady] = useState(false);
  const [isHydrating, setIsHydrating] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);
  const [lastSaveTimeIso, setLastSaveTimeIso] = useState<string | null>(null);
  const [activeTab, setActiveTabState] = useState<NavigationTab>(() => getTabFromUrl());

  const setActiveTab = useCallback((tab: NavigationTab) => {
    setActiveTabState(tab);
    if (typeof window !== 'undefined') {
      const targetHash = `#/${tab}`;
      if (window.location.hash !== targetHash) {
        window.history.replaceState(null, '', targetHash);
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleHashChange = () => {
      const tab = getTabFromUrl();
      setActiveTabState(tab);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [aiContextTopic, setAiContextTopic] = useState<{
    subject: string;
    topicTitle: string;
    topicId?: string;
  } | null>(null);

  const [prefs, setPrefs] = useState<UserWorkspacePrefs>(initialFast.prefs);
  const [topics, setTopics] = useState<TopicRecord[]>(initialFast.topics);
  const [sessions, setSessions] = useState<StudySessionRecord[]>(initialFast.sessions);
  const [tasks, setTasks] = useState<RoutineTaskRecord[]>(initialFast.tasks);
  const [notes, setNotes] = useState<VaultNoteRecord[]>(initialFast.notes);
  const [quizzes, setQuizzes] = useState<QuizAttemptRecord[]>(initialFast.quizzes);
  const [revisions, setRevisions] = useState<RevisionRecord[]>(initialFast.revisions);
  const [currentAffairs, setCurrentAffairs] = useState<CurrentAffairRecord[]>(
    initialFast.currentAffairs
  );
  const [aiInteractions, setAiInteractions] = useState<AIInteractionRecord[]>(
    initialFast.aiInteractions
  );
  const [activeTimer, setActiveTimer] = useState<ActiveTimerState>(initialFast.activeTimer);

  const [pendingRetry, setPendingRetry] = useState<PendingRetryOperation | null>(null);
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  );
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [syncConflicts, setSyncConflicts] = useState<SyncConflictRecord[]>([]);
  const [authDiagnosis, setAuthDiagnosis] = useState<AuthErrorDiagnosis | null>(null);
  const [authPreflight, setAuthPreflight] = useState<AuthPreflightResult | null>(null);

  const [aiStatus, setAiStatus] = useState<AiStatusDetails>(() => ({
    state: typeof navigator !== 'undefined' && !navigator.onLine ? 'OFFLINE' : 'AVAILABLE',
    message: getAiAvailabilityMessage(
      typeof navigator !== 'undefined' && !navigator.onLine ? 'OFFLINE' : 'AVAILABLE'
    ),
  }));

  const [storageQuota, setStorageQuota] = useState<StorageQuotaEstimate>({
    usageBytes: 0,
    quotaBytes: 512 * 1024 * 1024,
    usagePercent: 0,
    isNearLimit: false,
    isExceeded: false,
    warningMessage: null,
  });

  const [localStorageMigrationReport, setLocalStorageMigrationReport] =
    useState<LocalStorageMigrationReport | null>(null);

  const workspaceMode: WorkspaceMode = prefs.workspaceMode || 'LOCAL_WORKSPACE';
  const cloudSyncActive = Boolean(
    workspaceMode === 'CLOUD_SYNC' && prefs.cloudSyncConsentAtIso && user
  );

  const showSnackbar = useCallback((msg: string) => {
    setSnackbarMessage(msg);
    setTimeout(() => {
      setSnackbarMessage((prev) => (prev === msg ? null : prev));
    }, 4000);
  }, []);

  const clearPendingRetry = useCallback(() => setPendingRetry(null), []);
  const clearAuthDiagnosis = useCallback(() => setAuthDiagnosis(null), []);

  const refreshAiStatus = useCallback(async () => {
    const status = await checkAiProviderStatus();
    setAiStatus(status);
    return status;
  }, []);

  const refreshStorageQuota = useCallback(async () => {
    const quota = await estimateStorageQuota();
    setStorageQuota(quota);
    return quota;
  }, []);

  const reloadFromIndexedDb = useCallback(async () => {
    try {
      setDbError(null);
      const loaded = await loadWorkspaceFromIndexedDb(DEFAULT_PREFS, DEFAULT_TIMER_STATE);
      setPrefs(loaded.prefs);
      setTopics(loaded.topics);
      setSessions(loaded.sessions);
      setTasks(loaded.tasks);
      setNotes(loaded.notes);
      setQuizzes(loaded.quizzes);
      setRevisions(loaded.revisions);
      setCurrentAffairs(loaded.currentAffairs);
      setAiInteractions(loaded.aiInteractions);
      setActiveTimer(loaded.activeTimer);
      setLastSaveTimeIso(loaded.lastSaveTimeIso);
      setPendingSyncCount(
        loaded.syncOperations.filter(
          (op) => op.status === 'queued' || op.status === 'failed'
        ).length
      );
      setSyncConflicts(loaded.syncConflicts);
      defaultCloudSyncAdapter.setModeInternal(
        loaded.prefs.workspaceMode || 'LOCAL_WORKSPACE',
        Boolean(loaded.prefs.cloudSyncConsentAtIso)
      );
      return loaded;
    } catch (err) {
      console.error('[IndexedDB Hydration Error]:', err);
      setDbError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  }, []);

  const retryDatabaseConnection = useCallback(async () => {
    setIsHydrating(true);
    setDbError(null);
    try {
      await reloadFromIndexedDb();
      setDbReady(true);
    } catch (err) {
      setDbError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsHydrating(false);
    }
  }, [reloadFromIndexedDb]);

  // Phase 2 & 3 Fast Startup: Load IndexedDB immediately, non-blocking background refreshes
  useEffect(() => {
    let mounted = true;
    (async () => {
      setIsHydrating(true);
      try {
        const migReport = await migrateLegacyLocalStorageToIndexedDb();
        if (mounted && migReport.detectedLegacyData) {
          setLocalStorageMigrationReport(migReport);
        }
        await reloadFromIndexedDb();
        if (mounted) {
          setDbReady(true);
          setDbError(null);
        }
        // Non-blocking background checks
        refreshStorageQuota().catch(() => {});
        refreshAiStatus().catch(() => {});
      } catch (err) {
        console.error('[Startup IndexedDB Load] Error:', err);
        if (mounted) {
          setDbError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (mounted) {
          setIsHydrating(false);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [reloadFromIndexedDb, refreshStorageQuota, refreshAiStatus]);

  // Cross-tab BroadcastChannel listener for concurrent two-tab edits (Test L23)
  useEffect(() => {
    const unsubscribe = subscribeCrossTabChanges(() => {
      reloadFromIndexedDb().catch(() => {});
    });
    return () => unsubscribe();
  }, [reloadFromIndexedDb]);

  // Phase 11: Android WebView & Browser backgrounding / visibilitychange safeguard
  useEffect(() => {
    const handleVisibilityOrPageHide = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        dbSaveActiveTimer({
          ...activeTimer,
          lastHeartbeatEpochMs: Date.now(),
        }).catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityOrPageHide);
    window.addEventListener('pagehide', handleVisibilityOrPageHide);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityOrPageHide);
      window.removeEventListener('pagehide', handleVisibilityOrPageHide);
    };
  }, [activeTimer]);

  const runAuthPreflight = useCallback(async () => {
    const res = await runFirebaseAuthPreflightCheck();
    setAuthPreflight(res);
    return res;
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      refreshAiStatus().catch(() => {});
    };
    const handleOffline = () => {
      setIsOnline(false);
      setAiStatus({
        state: 'OFFLINE',
        message: getAiAvailabilityMessage('OFFLINE'),
      });
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [refreshAiStatus]);

  // Apply Material Design 3 Dynamic Color Palette whenever seed or mode changes
  useEffect(() => {
    applyMd3ThemeToDocument(prefs.themeSeed, prefs.themeMode);
  }, [prefs.themeSeed, prefs.themeMode]);

  // Persist activeTimer changes to IndexedDB
  useEffect(() => {
    if (!dbReady) return;
    dbSaveActiveTimer(activeTimer).catch(() => {});
  }, [activeTimer, dbReady]);

  // Heartbeat for active timer to detect browser sleep / clock jumps
  useEffect(() => {
    if (!activeTimer.isRunning || activeTimer.isPaused) return;
    const interval = setInterval(() => {
      setActiveTimer((prev) => {
        if (!prev.isRunning || prev.isPaused) return prev;
        const now = Date.now();
        if (prev.lastHeartbeatEpochMs && now - prev.lastHeartbeatEpochMs > 20 * 60 * 1000) {
          return {
            ...prev,
            unverifiedGapDetected: true,
            unverifiedGapMinutes: Math.round((now - prev.lastHeartbeatEpochMs) / 60000),
            lastHeartbeatEpochMs: now,
          };
        }
        return { ...prev, lastHeartbeatEpochMs: now };
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [activeTimer.isRunning, activeTimer.isPaused]);

  // Non-blocking passive Firebase Auth listener (never auto-triggers Google Sign-In on launch)
  useEffect(() => {
    if (!auth) return;

    const unsubscribe = onAuthStateChanged(auth, async (currUser) => {
      setUser(currUser);
      setAuthReady(true);

      if (currUser && workspaceMode === 'CLOUD_SYNC' && prefs.cloudSyncConsentAtIso) {
        setAuthDiagnosis(null);
        try {
          const userSnap = await getDoc(doc(db, 'users', currUser.uid));
          if (!userSnap.exists()) {
            const initPayload = stripUndefined({
              userId: currUser.uid,
              displayName: (currUser.displayName || prefs.displayName || 'RBI Aspirant').slice(
                0,
                120
              ),
              themeSeed: prefs.themeSeed.slice(0, 32),
              themeMode: prefs.themeMode,
              dailyGoalMinutes: prefs.dailyGoalMinutes,
              officeStart: prefs.officeStart.slice(0, 10),
              officeEnd: prefs.officeEnd.slice(0, 10),
              workDays: JSON.stringify(prefs.workDays).slice(0, 64),
              revisionIntervals: JSON.stringify(prefs.revisionIntervals).slice(0, 64),
              customSubjectsJson: JSON.stringify(prefs.customSubjects).slice(0, 20000),
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            await setDoc(doc(db, 'users', currUser.uid), initPayload);
          }
        } catch (err) {
          console.warn('Error initializing cloud user workspace doc:', err);
        }
      }
    });
    return () => unsubscribe();
  }, [workspaceMode, prefs.cloudSyncConsentAtIso]);

  // Firestore real-time listeners ONLY when Cloud Sync is explicitly active and user is signed in
  // Crucially: Never delete local records merely because cloud records are missing!
  useEffect(() => {
    if (!authReady || !user || workspaceMode !== 'CLOUD_SYNC' || !prefs.cloudSyncConsentAtIso) {
      return;
    }
    const uid = user.uid;

    const unsubNotes = onSnapshot(
      query(collection(db, `users/${uid}/notes`), where('userId', '==', uid)),
      (snap) => {
        const remoteItems: VaultNoteRecord[] = snap.docs.map((docSnap) => {
          const d = docSnap.data();
          return {
            id: docSnap.id,
            userId: d.userId,
            title: d.title,
            subject: d.subject,
            topicId: d.topicId,
            topicTitle: d.topicTitle,
            sessionId: d.sessionId,
            sourceType: d.sourceType,
            content: d.content,
            originalExtractedText: d.originalExtractedText,
            sourceUrl: d.sourceUrl,
            tagsCsv: d.tagsCsv,
            attachments: d.attachmentsMetaJson ? JSON.parse(d.attachmentsMetaJson) : [],
            version: Number(d.version) || 1,
            history: d.historyJson ? JSON.parse(d.historyJson) : [],
            createdAtIso: d.createdAt?.toDate?.()?.toISOString?.() || new Date().toISOString(),
            updatedAtIso: d.updatedAt?.toDate?.()?.toISOString?.() || new Date().toISOString(),
          };
        });

        setNotes((prevLocal) => {
          const mergedMap = new Map<string, VaultNoteRecord>();
          // Always preserve all local notes first (never delete local records if missing in cloud)
          prevLocal.forEach((ln) => mergedMap.set(ln.id, ln));

          remoteItems.forEach((rn) => {
            const localExisting = mergedMap.get(rn.id);
            if (
              localExisting &&
              localExisting.content !== rn.content &&
              localExisting.updatedAtIso > rn.updatedAtIso &&
              localExisting.version >= rn.version
            ) {
              setSyncConflicts((prevConflicts) => {
                if (prevConflicts.some((c) => c.noteId === rn.id)) return prevConflicts;
                return [
                  ...prevConflicts,
                  {
                    noteId: rn.id,
                    noteTitle: rn.title,
                    localNote: localExisting,
                    remoteNote: rn,
                    detectedAtIso: new Date().toISOString(),
                  },
                ];
              });
              mergedMap.set(rn.id, localExisting);
            } else {
              mergedMap.set(rn.id, rn);
              dbAtomicSaveVaultNote(rn).catch(() => {});
            }
          });

          return Array.from(mergedMap.values()).sort((a, b) =>
            b.updatedAtIso.localeCompare(a.updatedAtIso)
          );
        });
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, `users/${uid}/notes`);
        } catch {}
      }
    );

    return () => {
      unsubNotes();
    };
  }, [authReady, user, workspaceMode, prefs.cloudSyncConsentAtIso]);

  const handleLocalWriteError = useCallback(
    (description: string, err: unknown, retryFn: () => Promise<void>) => {
      const msg = isQuotaExceededError(err)
        ? 'Browser storage quota exceeded: Your data in memory is preserved. Please export a Complete ZIP Backup to free space.'
        : err instanceof Error
        ? err.message
        : String(err);

      setPendingRetry({
        description,
        errorMessage: msg,
        retryFn,
      });
      showSnackbar(msg);
      refreshStorageQuota().catch(() => {});
    },
    [showSnackbar, refreshStorageQuota]
  );

  // Cloud Sync background push helper (never blocks local study!)
  const pushEntityToCloudIfActive = useCallback(
    async (
      entityType:
        | 'prefs'
        | 'topic'
        | 'session'
        | 'task'
        | 'note'
        | 'quiz'
        | 'revision'
        | 'current_affair'
        | 'ai_interaction',
      entityId: string,
      cloudWriteFn: () => Promise<void>
    ) => {
      if (workspaceMode !== 'CLOUD_SYNC' || !prefs.cloudSyncConsentAtIso) {
        return;
      }
      if (!isOnline || !user) {
        await dbQueueSyncOperation({
          entityType,
          entityId,
          operation: 'upsert',
          status: 'queued',
          retryCount: 0,
        });
        setPendingSyncCount((c) => c + 1);
        return;
      }
      try {
        await cloudWriteFn();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await dbQueueSyncOperation({
          entityType,
          entityId,
          operation: 'upsert',
          status: 'failed',
          retryCount: 1,
          lastError: msg,
        });
        setPendingSyncCount((c) => c + 1);
      }
    },
    [workspaceMode, prefs.cloudSyncConsentAtIso, isOnline, user]
  );

  const signInWithGoogleRedirectFallback = useCallback(async () => {
    try {
      setAuthDiagnosis(null);
      await signInWithRedirect(auth, googleProvider);
    } catch (err) {
      const diag = diagnoseFirebaseAuthError(err);
      setAuthDiagnosis(diag);
      showSnackbar(diag.title);
    }
  }, [showSnackbar]);

  const signInWithGoogle = useCallback(async () => {
    try {
      setAuthDiagnosis(null);
      await signInWithPopup(auth, googleProvider);
      await runAuthPreflight();
      getRedirectResult(auth).catch(() => {});
      showSnackbar('Signed in with Google.');
    } catch (err) {
      const diag = diagnoseFirebaseAuthError(err);
      setAuthDiagnosis(diag);
      await runAuthPreflight();
      showSnackbar(diag.title);
    }
  }, [showSnackbar, runAuthPreflight]);

  const signOutUser = useCallback(async () => {
    await firebaseSignOut(auth);
    const nextPrefs: UserWorkspacePrefs = {
      ...prefs,
      workspaceMode: 'LOCAL_WORKSPACE',
    };
    setPrefs(nextPrefs);
    await dbSavePrefs(nextPrefs);
    await defaultCloudSyncAdapter.disconnect();
    showSnackbar('Signed out. Running in Local Workspace mode; all local records preserved.');
  }, [prefs, showSnackbar]);

  const updatePrefs = useCallback(
    async (partial: Partial<UserWorkspacePrefs>) => {
      const next: UserWorkspacePrefs = { ...prefs, ...partial };
      setPrefs(next);
      try {
        await dbSavePrefs(next);
      } catch (err) {
        handleLocalWriteError('Save Workspace Preferences', err, async () => {
          await updatePrefs(partial);
        });
        return;
      }

      if (cloudSyncActive && user) {
        await pushEntityToCloudIfActive('prefs', 'default_workspace', async () => {
          const payload = stripUndefined({
            displayName: next.displayName.slice(0, 120),
            themeSeed: next.themeSeed.slice(0, 32),
            themeMode: next.themeMode,
            dailyGoalMinutes: Math.min(Math.max(next.dailyGoalMinutes, 15), 960),
            officeStart: next.officeStart.slice(0, 10),
            officeEnd: next.officeEnd.slice(0, 10),
            workDays: JSON.stringify(next.workDays).slice(0, 64),
            revisionIntervals: JSON.stringify(next.revisionIntervals).slice(0, 64),
            customSubjectsJson: JSON.stringify(next.customSubjects).slice(0, 20000),
            updatedAt: serverTimestamp(),
          });
          await updateDoc(doc(db, 'users', user.uid), payload);
        });
      }
    },
    [prefs, cloudSyncActive, user, handleLocalWriteError, pushEntityToCloudIfActive]
  );

  // Phase 9: First-Time Cloud Activation with Explicit User Consent (Test L19 & L20)
  const enableCloudSyncWithConsent = useCallback(async () => {
    const consentAt = new Date().toISOString();
    await defaultCloudSyncAdapter.connect({ explicitUserConsent: true });
    await updatePrefs({
      workspaceMode: 'CLOUD_SYNC',
      cloudSyncConsentAtIso: consentAt,
    });
    showSnackbar(
      'Cloud Sync mode activated with your consent. Sign in with Google when ready to synchronize.'
    );
  }, [updatePrefs, showSnackbar]);

  const disableCloudSync = useCallback(async () => {
    await defaultCloudSyncAdapter.disconnect();
    await updatePrefs({
      workspaceMode: 'LOCAL_WORKSPACE',
    });
    showSnackbar(
      'Switched to Local Workspace mode. All study records remain stored on this device.'
    );
  }, [updatePrefs, showSnackbar]);

  const prepareCloudSyncInventory = useCallback(async (): Promise<CloudSyncInventory> => {
    return defaultCloudSyncAdapter.prepareFirstTimeSyncInventory();
  }, []);

  const addCustomSubject = useCallback(
    async (phase: ExamPhase, name: string, code: string) => {
      const nowIso = new Date().toISOString();
      const newSubj: SubjectCategory = {
        id: makeSafeId('subj'),
        phase,
        name: name.trim().slice(0, 80),
        code: code.trim().toUpperCase().slice(0, 12) || 'CUST',
        isCustom: true,
        createdAtIso: nowIso,
        updatedAtIso: nowIso,
      };
      await updatePrefs({
        customSubjects: [...prefs.customSubjects, newSubj],
      });
      showSnackbar(`Added custom subject: ${newSubj.name}`);
    },
    [prefs.customSubjects, updatePrefs, showSnackbar]
  );

  const allSubjects = useMemo(() => {
    const map = new Map<string, SubjectCategory>();
    for (const s of DEFAULT_RBI_SUBJECTS) map.set(s.id, s);
    for (const cs of prefs.customSubjects || []) map.set(cs.id, cs);
    return Array.from(map.values());
  }, [prefs.customSubjects]);

  const openAiTutorWithContext = useCallback(
    (subject: string, topicTitle: string, topicId?: string) => {
      setAiContextTopic({ subject, topicTitle, topicId });
      setAiDrawerOpen(true);
    },
    []
  );

  const updateActiveTimer = useCallback(
    (updater: (prev: ActiveTimerState) => ActiveTimerState) => {
      setActiveTimer((prev) => {
        const next = updater(prev);
        dbSaveActiveTimer(next).catch(() => {});
        return next;
      });
    },
    []
  );

  const startFocusForTopic = useCallback(
    (
      phase: ExamPhase,
      subject: string,
      topicTitle: string,
      topicId?: string,
      plannedMinutes = 45,
      goal = ''
    ) => {
      const now = Date.now();
      const nextTimer: ActiveTimerState = {
        isRunning: true,
        isPaused: false,
        mode: 'stopwatch',
        phase,
        subject,
        topicId: topicId || '',
        topicTitle,
        goal: goal || `Deep study on ${topicTitle}`,
        plannedMinutes,
        accumulatedFocusedMs: 0,
        accumulatedPausedMs: 0,
        lastResumeEpochMs: now,
        lastPauseEpochMs: null,
        lastHeartbeatEpochMs: now,
        unverifiedGapDetected: false,
        unverifiedGapMinutes: 0,
        checklist: [
          { id: 'chk_1', text: 'Read core concept & statutory definitions', done: false },
          { id: 'chk_2', text: 'Capture key notes or class screenshots', done: false },
          { id: 'chk_3', text: 'Attempt 5 practice MCQs after session', done: false },
        ],
        quickNotes: '',
        sessionScreenshots: [],
      };
      setActiveTimer(nextTimer);
      dbSaveActiveTimer(nextTimer).catch(() => {});
      setActiveTab('focus');
    },
    []
  );

  const saveTopic = useCallback(
    async (
      input: Omit<TopicRecord, 'id' | 'userId' | 'createdAtIso' | 'updatedAtIso'> & { id?: string }
    ): Promise<TopicRecord> => {
      const existing = input.id ? topics.find((t) => t.id === input.id) : undefined;
      const topicId = input.id || makeSafeId('topic');
      const nowIso = new Date().toISOString();
      const uid = user?.uid || 'local_user';

      const record: TopicRecord = {
        id: topicId,
        userId: uid,
        phase: input.phase,
        subject: input.subject.slice(0, 120),
        chapter: (input.chapter || 'General').slice(0, 160),
        title: input.title.slice(0, 200),
        status: input.status,
        studyMinutes: Math.max(0, Number(input.studyMinutes) || 0),
        practiceAccuracy: input.practiceAccuracy,
        confidence: Math.min(Math.max(Number(input.confidence) || 0, 0), 5),
        revisionStage: input.revisionStage ?? 0,
        nextRevisionDate: input.nextRevisionDate,
        lastStudiedAt: input.lastStudiedAt,
        createdAtIso: existing?.createdAtIso || nowIso,
        updatedAtIso: nowIso,
      };

      try {
        await dbSaveTopic(record);
      } catch (err) {
        handleLocalWriteError(`Save Topic "${record.title}"`, err, async () => {
          await saveTopic(input);
        });
        throw err;
      }

      setTopics((prev) => {
        const idx = prev.findIndex((t) => t.id === topicId);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = record;
          return copy;
        }
        return [record, ...prev];
      });

      if (cloudSyncActive && user) {
        await pushEntityToCloudIfActive('topic', topicId, async () => {
          await setDoc(
            doc(db, 'users', user.uid, 'topics', topicId),
            stripUndefined({
              ...record,
              userId: user.uid,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            }),
            { merge: true }
          );
        });
      }

      return record;
    },
    [topics, user, cloudSyncActive, handleLocalWriteError, pushEntityToCloudIfActive]
  );

  const deleteTopic = useCallback(
    async (id: string) => {
      await dbDeleteTopic(id);
      setTopics((prev) => prev.filter((t) => t.id !== id));
      if (cloudSyncActive && user) {
        try {
          await deleteDoc(doc(db, 'users', user.uid, 'topics', id));
        } catch (e) {
          console.warn('Cloud delete topic warning:', e);
        }
      }
      showSnackbar('Topic deleted.');
    },
    [cloudSyncActive, user, showSnackbar]
  );

  const saveRevisionItem = useCallback(
    async (
      input: Omit<RevisionRecord, 'id' | 'userId' | 'createdAtIso' | 'updatedAtIso'> & { id?: string }
    ): Promise<RevisionRecord> => {
      const revId = input.id || makeSafeId('rev');
      const nowIso = new Date().toISOString();
      const uid = user?.uid || 'local_user';

      const candidate: RevisionRecord = {
        id: revId,
        userId: uid,
        topicId: input.topicId.slice(0, 128),
        topicTitle: input.topicTitle.slice(0, 200),
        subject: input.subject.slice(0, 120),
        phase: input.phase,
        intervalDays: Math.max(1, Number(input.intervalDays) || 1),
        stageLabel: (input.stageLabel || `Day ${input.intervalDays}`).slice(0, 32),
        dueDate: input.dueDate.slice(0, 32),
        status: input.status,
        confidence: input.confidence,
        lastAccuracy: input.lastAccuracy,
        recommendationReason: input.recommendationReason.slice(0, 500),
        createdAtIso: nowIso,
        updatedAtIso: nowIso,
      };

      let savedRecord: RevisionRecord;
      try {
        savedRecord = await dbSaveRevisionItem(candidate);
      } catch (err) {
        handleLocalWriteError(`Schedule Revision for "${candidate.topicTitle}"`, err, async () => {
          await saveRevisionItem(input);
        });
        throw err;
      }

      setRevisions((prev) => {
        const idx = prev.findIndex((r) => r.id === savedRecord.id);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = savedRecord;
          return copy.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
        }
        return [...prev, savedRecord].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      });

      if (cloudSyncActive && user) {
        await pushEntityToCloudIfActive('revision', savedRecord.id, async () => {
          await setDoc(
            doc(db, 'users', user.uid, 'revisions', savedRecord.id),
            stripUndefined({
              ...savedRecord,
              userId: user.uid,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            }),
            { merge: true }
          );
        });
      }

      return savedRecord;
    },
    [user, cloudSyncActive, handleLocalWriteError, pushEntityToCloudIfActive]
  );

  const saveStudySession = useCallback(
    async (
      input: Omit<StudySessionRecord, 'id' | 'userId' | 'createdAtIso' | 'updatedAtIso'> & {
        id?: string;
      },
      autoScheduleRevision = true
    ): Promise<StudySessionRecord> => {
      const sessionId = input.id || makeSafeId('sess');
      const nowIso = new Date().toISOString();
      const uid = user?.uid || 'local_user';

      const existingTopic = topics.find(
        (t) =>
          (input.topicId && t.id === input.topicId) ||
          (t.subject === input.subject &&
            t.title.toLowerCase() === input.topicTitle.toLowerCase())
      );

      const nextIntervalDays = prefs.revisionIntervals[0] || 1;
      const suggestedRevDate =
        input.suggestedRevisionDate || addDaysToDateStr(input.sessionDate, nextIntervalDays);

      const topicId = existingTopic?.id || input.topicId || makeSafeId('topic');
      const updatedTopic: TopicRecord = existingTopic
        ? {
            ...existingTopic,
            studyMinutes: existingTopic.studyMinutes + Math.max(0, Number(input.focusedMinutes) || 0),
            confidence: input.confidence,
            status:
              existingTopic.status === 'Not Started' ? 'In Progress' : existingTopic.status,
            lastStudiedAt: input.sessionDate,
            nextRevisionDate: suggestedRevDate,
            updatedAtIso: nowIso,
          }
        : {
            id: topicId,
            userId: uid,
            phase: input.phase,
            subject: input.subject.slice(0, 120),
            chapter: 'Core Syllabus',
            title: input.topicTitle.slice(0, 200),
            status: 'In Progress',
            studyMinutes: Math.max(0, Number(input.focusedMinutes) || 0),
            confidence: input.confidence,
            revisionStage: 0,
            lastStudiedAt: input.sessionDate,
            nextRevisionDate: suggestedRevDate,
            createdAtIso: nowIso,
            updatedAtIso: nowIso,
          };

      const sessionRecord: StudySessionRecord = {
        id: sessionId,
        userId: uid,
        phase: input.phase,
        subject: input.subject.slice(0, 120),
        topicId: updatedTopic.id,
        topicTitle: updatedTopic.title.slice(0, 200),
        goal: input.goal?.slice(0, 500),
        timerMode: input.timerMode,
        plannedMinutes: input.plannedMinutes,
        focusedMinutes: Math.max(0, Number(input.focusedMinutes) || 0),
        pausedMinutes: Math.max(0, Number(input.pausedMinutes) || 0),
        outcome: input.outcome?.slice(0, 120),
        confidence: Math.min(Math.max(Number(input.confidence) || 3, 1), 5),
        notesSummary: input.notesSummary?.slice(0, 4000),
        screenshotsCount: input.screenshotsCount || 0,
        suggestedRevisionDate: suggestedRevDate,
        sessionDate: input.sessionDate.slice(0, 32),
        createdAtIso: nowIso,
        updatedAtIso: nowIso,
      };

      const revisionToSchedule: RevisionRecord | undefined = autoScheduleRevision
        ? {
            id: makeSafeId('rev'),
            userId: uid,
            topicId: updatedTopic.id,
            topicTitle: updatedTopic.title,
            subject: updatedTopic.subject,
            phase: updatedTopic.phase,
            intervalDays: nextIntervalDays,
            stageLabel: `Day ${nextIntervalDays} Review`,
            dueDate: suggestedRevDate,
            status: suggestedRevDate <= getKolkataDateString() ? 'due' : 'upcoming',
            confidence: sessionRecord.confidence,
            recommendationReason: `Scheduled after ${sessionRecord.focusedMinutes} min study session on ${sessionRecord.sessionDate} (Confidence ${sessionRecord.confidence}/5).`,
            createdAtIso: nowIso,
            updatedAtIso: nowIso,
          }
        : undefined;

      // Atomic IndexedDB transaction across `studySessions`, `topics`, and `revisionItems`
      let atomicResult;
      try {
        atomicResult = await dbAtomicSaveStudySession({
          session: sessionRecord,
          updatedTopic,
          revisionToSchedule,
        });
      } catch (err) {
        handleLocalWriteError(`Save Study Session "${sessionRecord.topicTitle}"`, err, async () => {
          await saveStudySession(input, autoScheduleRevision);
        });
        throw err;
      }

      setLastSaveTimeIso(new Date().toISOString());

      // Trigger automatic local backup if enabled
      if (prefs.autoBackupEnabled !== false) {
        triggerAutoBackup(prefs.maxAutoBackups || 7).catch(() => {});
      }

      if (atomicResult.wasDuplicateSession) {
        return atomicResult.session;
      }

      setTopics((prev) => {
        const idx = prev.findIndex((t) => t.id === atomicResult.topic.id);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = atomicResult.topic;
          return copy;
        }
        return [atomicResult.topic, ...prev];
      });

      setSessions((prev) => [atomicResult.session, ...prev]);

      if (atomicResult.revision) {
        const rev = atomicResult.revision;
        setRevisions((prev) => {
          const idx = prev.findIndex((r) => r.id === rev.id);
          if (idx >= 0) {
            const copy = [...prev];
            copy[idx] = rev;
            return copy.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
          }
          return [...prev, rev].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
        });
      }

      if (cloudSyncActive && user) {
        await pushEntityToCloudIfActive('session', sessionRecord.id, async () => {
          await setDoc(
            doc(db, 'users', user.uid, 'sessions', sessionRecord.id),
            stripUndefined({
              ...sessionRecord,
              userId: user.uid,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            }),
            { merge: true }
          );
        });
      }

      showSnackbar(
        `Saved ${sessionRecord.focusedMinutes} min study session for ${sessionRecord.topicTitle}.`
      );
      return atomicResult.session;
    },
    [topics, prefs.revisionIntervals, user, cloudSyncActive, pushEntityToCloudIfActive, showSnackbar]
  );

  const completeRevisionItem = useCallback(
    async (revisionId: string, newConfidence: number, scheduleNextStage: boolean) => {
      const target = revisions.find((r) => r.id === revisionId);
      if (!target) return;

      await saveRevisionItem({
        ...target,
        id: target.id,
        status: 'completed',
        confidence: newConfidence,
      });

      if (scheduleNextStage) {
        const intervals =
          prefs.revisionIntervals.length > 0 ? prefs.revisionIntervals : [1, 3, 7, 14, 30];
        const currIdx = intervals.findIndex((d) => d >= target.intervalDays);
        const nextInterval =
          newConfidence <= 2
            ? intervals[0]
            : currIdx >= 0 && currIdx + 1 < intervals.length
            ? intervals[currIdx + 1]
            : intervals[intervals.length - 1];

        const nextDue = addDaysToDateStr(getKolkataDateString(), nextInterval);
        await saveRevisionItem({
          topicId: target.topicId,
          topicTitle: target.topicTitle,
          subject: target.subject,
          phase: target.phase,
          intervalDays: nextInterval,
          stageLabel: `Day ${nextInterval} Review`,
          dueDate: nextDue,
          status: 'upcoming',
          confidence: newConfidence,
          lastAccuracy: target.lastAccuracy,
          recommendationReason:
            newConfidence <= 2
              ? `Reset to Day ${nextInterval} interval because recorded confidence was low (${newConfidence}/5).`
              : `Advanced to Day ${nextInterval} spaced repetition interval after successful review (Confidence ${newConfidence}/5).`,
        });
      }

      showSnackbar(`Revision marked completed for ${target.topicTitle}.`);
    },
    [revisions, prefs.revisionIntervals, saveRevisionItem, showSnackbar]
  );

  const saveRoutineTask = useCallback(
    async (
      input: Omit<RoutineTaskRecord, 'id' | 'userId' | 'createdAtIso' | 'updatedAtIso'> & {
        id?: string;
      }
    ): Promise<RoutineTaskRecord> => {
      const existing = input.id ? tasks.find((t) => t.id === input.id) : undefined;
      const taskId = input.id || makeSafeId('task');
      const nowIso = new Date().toISOString();
      const uid = user?.uid || 'local_user';

      const record: RoutineTaskRecord = {
        id: taskId,
        userId: uid,
        title: input.title.slice(0, 200),
        category: input.category,
        subject: input.subject.slice(0, 120),
        topicId: input.topicId,
        date: input.date.slice(0, 32),
        startTime: input.startTime.slice(0, 16),
        durationMinutes: Math.min(Math.max(Number(input.durationMinutes) || 45, 5), 600),
        priority: input.priority,
        status: input.status,
        isRecurring: Boolean(input.isRecurring),
        createdAtIso: existing?.createdAtIso || nowIso,
        updatedAtIso: nowIso,
      };

      try {
        await dbSaveRoutineTask(record);
      } catch (err) {
        handleLocalWriteError(`Save Routine Task "${record.title}"`, err, async () => {
          await saveRoutineTask(input);
        });
        throw err;
      }

      setTasks((prev) => {
        const idx = prev.findIndex((t) => t.id === taskId);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = record;
          return copy;
        }
        return [...prev, record];
      });

      if (cloudSyncActive && user) {
        await pushEntityToCloudIfActive('task', taskId, async () => {
          await setDoc(
            doc(db, 'users', user.uid, 'tasks', taskId),
            stripUndefined({
              ...record,
              userId: user.uid,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            }),
            { merge: true }
          );
        });
      }

      return record;
    },
    [tasks, user, cloudSyncActive, handleLocalWriteError, pushEntityToCloudIfActive]
  );

  const deleteRoutineTask = useCallback(
    async (id: string) => {
      await dbDeleteRoutineTask(id);
      setTasks((prev) => prev.filter((t) => t.id !== id));
      if (cloudSyncActive && user) {
        try {
          await deleteDoc(doc(db, 'users', user.uid, 'tasks', id));
        } catch (e) {
          console.warn('Cloud delete routine task warning:', e);
        }
      }
      showSnackbar('Task removed.');
    },
    [cloudSyncActive, user, showSnackbar]
  );

  const saveVaultNote = useCallback(
    async (
      input: Omit<VaultNoteRecord, 'id' | 'userId' | 'createdAtIso' | 'updatedAtIso'> & {
        id?: string;
      }
    ): Promise<VaultNoteRecord> => {
      const existingNote = input.id ? notes.find((n) => n.id === input.id) : undefined;
      const noteId = input.id || makeSafeId('note');
      const nowIso = new Date().toISOString();
      const uid = user?.uid || 'local_user';

      const nextVersion = existingNote ? existingNote.version + 1 : 1;
      const nextHistory = existingNote
        ? [
            {
              id: `${noteId}_v_${existingNote.version}_${existingNote.updatedAtIso}`,
              noteId,
              version: existingNote.version,
              savedAtIso: existingNote.updatedAtIso,
              contentSnippet: existingNote.content.slice(0, 140),
              fullContent: existingNote.content.slice(0, 10000),
            },
            ...(existingNote.history || []).slice(0, 5),
          ]
        : [];

      const sanitizedAttachments = (input.attachments || []).map((att) =>
        sanitizeAttachmentForFirestore({
          ...att,
          ownerWorkspaceId: att.ownerWorkspaceId || prefs.workspaceId || 'local_workspace',
          ownerUid: att.ownerUid || uid,
          noteId,
          sessionId: att.sessionId || input.sessionId,
        })
      );

      const candidate: VaultNoteRecord = {
        id: noteId,
        userId: uid,
        title: input.title.slice(0, 240),
        subject: input.subject.slice(0, 120),
        topicId: input.topicId,
        topicTitle: input.topicTitle.slice(0, 200),
        sessionId: input.sessionId,
        sourceType: input.sourceType,
        content: input.content.slice(0, 50000),
        originalExtractedText: input.originalExtractedText?.slice(0, 50000),
        sourceUrl: input.sourceUrl?.slice(0, 1000),
        tagsCsv: input.tagsCsv?.slice(0, 500),
        attachments: sanitizedAttachments,
        version: nextVersion,
        history: nextHistory,
        createdAtIso: existingNote?.createdAtIso || nowIso,
        updatedAtIso: nowIso,
      };

      let savedRecord: VaultNoteRecord;
      try {
        savedRecord = await dbAtomicSaveVaultNote(candidate);
      } catch (err) {
        handleLocalWriteError(`Save Vault Note "${candidate.title}"`, err, async () => {
          await saveVaultNote(input);
        });
        throw err;
      }

      setNotes((prev) => {
        const idx = prev.findIndex((n) => n.id === noteId);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = savedRecord;
          return copy;
        }
        return [savedRecord, ...prev];
      });

      if (cloudSyncActive && user) {
        const firestoreAttachments = savedRecord.attachments.map((att) =>
          sanitizeAttachmentForFirestore(att)
        );
        const attachmentsMetaJson = JSON.stringify(firestoreAttachments).slice(0, 195000);
        const historyJson = JSON.stringify(savedRecord.history).slice(0, 95000);

        await pushEntityToCloudIfActive('note', noteId, async () => {
          await setDoc(
            doc(db, 'users', user.uid, 'notes', noteId),
            stripUndefined({
              userId: user.uid,
              title: savedRecord.title,
              subject: savedRecord.subject,
              topicId: savedRecord.topicId,
              topicTitle: savedRecord.topicTitle,
              sessionId: savedRecord.sessionId,
              sourceType: savedRecord.sourceType,
              content: savedRecord.content,
              originalExtractedText: savedRecord.originalExtractedText,
              sourceUrl: savedRecord.sourceUrl,
              tagsCsv: savedRecord.tagsCsv,
              attachmentsMetaJson,
              version: savedRecord.version,
              historyJson,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            }),
            { merge: true }
          );
        });
      }

      refreshStorageQuota().catch(() => {});
      showSnackbar(`Saved note "${savedRecord.title}" (v${savedRecord.version}).`);
      return savedRecord;
    },
    [
      notes,
      user,
      prefs.workspaceId,
      cloudSyncActive,
      handleLocalWriteError,
      pushEntityToCloudIfActive,
      refreshStorageQuota,
      showSnackbar,
    ]
  );

  const deleteVaultNote = useCallback(
    async (id: string) => {
      await dbDeleteVaultNote(id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
      if (cloudSyncActive && user) {
        try {
          await deleteDoc(doc(db, 'users', user.uid, 'notes', id));
        } catch (e) {
          console.warn('Cloud delete note warning:', e);
        }
      }
      showSnackbar('Note deleted from Knowledge Vault.');
    },
    [cloudSyncActive, user, showSnackbar]
  );

  const saveQuizAttempt = useCallback(
    async (
      input: Omit<QuizAttemptRecord, 'id' | 'userId' | 'createdAtIso' | 'updatedAtIso'> & {
        id?: string;
      }
    ): Promise<QuizAttemptRecord> => {
      const quizId = input.id || makeSafeId('quiz');
      const nowIso = new Date().toISOString();
      const uid = user?.uid || 'local_user';

      const record: QuizAttemptRecord = {
        id: quizId,
        userId: uid,
        quizType: input.quizType,
        subject: input.subject.slice(0, 120),
        topicId: input.topicId,
        topicTitle: input.topicTitle.slice(0, 200),
        totalQuestions: Math.max(1, Number(input.totalQuestions) || 1),
        correctCount: Math.max(0, Number(input.correctCount) || 0),
        incorrectCount: Math.max(0, Number(input.incorrectCount) || 0),
        skippedCount: Math.max(0, Number(input.skippedCount) || 0),
        accuracy: Math.min(Math.max(Math.round(Number(input.accuracy) || 0), 0), 100),
        durationSeconds: Math.max(0, Number(input.durationSeconds) || 0),
        questions: input.questions || [],
        descriptiveData: input.descriptiveData,
        attemptDate: input.attemptDate.slice(0, 32),
        createdAtIso: nowIso,
        updatedAtIso: nowIso,
      };

      const matchingTopic = topics.find(
        (t) =>
          (input.topicId && t.id === input.topicId) ||
          (t.subject === input.subject &&
            t.title.toLowerCase() === input.topicTitle.toLowerCase())
      );

      const updatedTopic: TopicRecord | undefined = matchingTopic
        ? {
            ...matchingTopic,
            practiceAccuracy: record.accuracy,
            status:
              matchingTopic.status === 'Not Started' || matchingTopic.status === 'In Progress'
                ? 'Practice Completed'
                : matchingTopic.status,
            updatedAtIso: nowIso,
          }
        : undefined;

      try {
        await dbAtomicSaveQuizAttempt(record, updatedTopic);
      } catch (err) {
        handleLocalWriteError(`Save Quiz Result "${record.subject}"`, err, async () => {
          await saveQuizAttempt(input);
        });
        throw err;
      }

      setLastSaveTimeIso(new Date().toISOString());

      setQuizzes((prev) => [record, ...prev]);
      if (updatedTopic) {
        setTopics((prev) => prev.map((t) => (t.id === updatedTopic.id ? updatedTopic : t)));
      }

      if (cloudSyncActive && user) {
        const detailsJson = JSON.stringify({
          questions: record.questions,
          descriptiveData: record.descriptiveData,
        }).slice(0, 95000);

        await pushEntityToCloudIfActive('quiz', quizId, async () => {
          await setDoc(
            doc(db, 'users', user.uid, 'quizzes', quizId),
            stripUndefined({
              userId: user.uid,
              quizType: record.quizType,
              subject: record.subject,
              topicId: record.topicId,
              topicTitle: record.topicTitle,
              totalQuestions: record.totalQuestions,
              correctCount: record.correctCount,
              incorrectCount: record.incorrectCount,
              skippedCount: record.skippedCount,
              accuracy: record.accuracy,
              durationSeconds: record.durationSeconds,
              detailsJson,
              attemptDate: record.attemptDate,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            }),
            { merge: true }
          );
        });
      }

      showSnackbar(`Saved quiz attempt (${record.accuracy}% accuracy).`);
      return record;
    },
    [topics, user, cloudSyncActive, pushEntityToCloudIfActive, showSnackbar]
  );

  const saveCurrentAffair = useCallback(
    async (
      input: Omit<CurrentAffairRecord, 'id' | 'userId' | 'createdAtIso' | 'updatedAtIso'> & {
        id?: string;
      }
    ): Promise<CurrentAffairRecord> => {
      const existing = input.id ? currentAffairs.find((c) => c.id === input.id) : undefined;
      const entryId = input.id || makeSafeId('ca');
      const nowIso = new Date().toISOString();
      const uid = user?.uid || 'local_user';

      const record: CurrentAffairRecord = {
        id: entryId,
        userId: uid,
        date: input.date.slice(0, 32),
        monthTag: (input.monthTag || input.date.slice(0, 7)).slice(0, 32),
        headline: input.headline.slice(0, 300),
        sourceUrl: input.sourceUrl?.slice(0, 1000),
        summary: input.summary.slice(0, 15000),
        keyFacts: input.keyFacts?.slice(0, 10000),
        regulatoryRelevance: input.regulatoryRelevance?.slice(0, 2000),
        esiConnection: input.esiConnection?.slice(0, 2000),
        financeConnection: input.financeConnection?.slice(0, 2000),
        revisionStatus: input.revisionStatus,
        createdAtIso: existing?.createdAtIso || nowIso,
        updatedAtIso: nowIso,
      };

      await dbSaveCurrentAffair(record);

      setCurrentAffairs((prev) => {
        const idx = prev.findIndex((c) => c.id === entryId);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = record;
          return copy;
        }
        return [record, ...prev].sort((a, b) => b.date.localeCompare(a.date));
      });

      if (cloudSyncActive && user) {
        await pushEntityToCloudIfActive('current_affair', entryId, async () => {
          await setDoc(
            doc(db, 'users', user.uid, 'currentAffairs', entryId),
            stripUndefined({
              ...record,
              userId: user.uid,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            }),
            { merge: true }
          );
        });
      }

      showSnackbar('Saved Current Affairs notebook entry.');
      return record;
    },
    [currentAffairs, user, cloudSyncActive, pushEntityToCloudIfActive, showSnackbar]
  );

  const deleteCurrentAffair = useCallback(
    async (id: string) => {
      await dbDeleteCurrentAffair(id);
      setCurrentAffairs((prev) => prev.filter((c) => c.id !== id));
      if (cloudSyncActive && user) {
        try {
          await deleteDoc(doc(db, 'users', user.uid, 'currentAffairs', id));
        } catch (e) {
          console.warn('Cloud delete CA warning:', e);
        }
      }
      showSnackbar('Current Affairs entry removed.');
    },
    [cloudSyncActive, user, showSnackbar]
  );

  const saveAIInteraction = useCallback(
    async (input: Omit<AIInteractionRecord, 'id' | 'userId' | 'createdAtIso' | 'updatedAtIso'>) => {
      const interactionId = makeSafeId('ai');
      const nowIso = new Date().toISOString();
      const uid = user?.uid || 'local_user';

      const record: AIInteractionRecord = {
        id: interactionId,
        userId: uid,
        actionType: input.actionType.slice(0, 64),
        subject: input.subject?.slice(0, 120),
        topicTitle: input.topicTitle?.slice(0, 200),
        prompt: input.prompt.slice(0, 10000),
        responseText: input.responseText.slice(0, 50000),
        sourceNoteTitles: input.sourceNoteTitles?.slice(0, 2000),
        createdAtIso: nowIso,
        updatedAtIso: nowIso,
      };

      await dbSaveAIConversation(record);
      setAiInteractions((prev) => [record, ...prev]);

      if (cloudSyncActive && user) {
        await pushEntityToCloudIfActive('ai_interaction', interactionId, async () => {
          await setDoc(
            doc(db, 'users', user.uid, 'interactions', interactionId),
            stripUndefined({
              ...record,
              userId: user.uid,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            }),
            { merge: true }
          );
        });
      }
    },
    [user, cloudSyncActive, pushEntityToCloudIfActive]
  );

  const syncLocalToCloud = useCallback(async (): Promise<PushSyncResult | void> => {
    if (workspaceMode !== 'CLOUD_SYNC' || !prefs.cloudSyncConsentAtIso) {
      showSnackbar('Please enable Cloud Sync mode and confirm consent in Settings first.');
      return;
    }
    if (!user) {
      showSnackbar('Please sign in with Google first to sync records to Cloud Firestore.');
      return;
    }
    const res = await defaultCloudSyncAdapter.pushChanges();
    await reloadFromIndexedDb();
    showSnackbar(
      `Synchronized ${res.uploadedRecords} study records and ${res.uploadedAttachments} attachment(s) to Cloud.`
    );
    return res;
  }, [workspaceMode, prefs.cloudSyncConsentAtIso, user, reloadFromIndexedDb, showSnackbar]);

  // Transparent Study Recommendation Engine (Section 18)
  const recommendations = useMemo<StudyRecommendation[]>(() => {
    const list: StudyRecommendation[] = [];
    const today = getKolkataDateString();

    const urgentRevisions = revisions.filter(
      (r) => r.status !== 'completed' && r.dueDate <= today
    );
    for (const rev of urgentRevisions.slice(0, 2)) {
      const isOverdue = rev.dueDate < today;
      list.push({
        id: `rec_rev_${rev.id}`,
        title: `Review: ${rev.topicTitle}`,
        subject: rev.subject,
        topicId: rev.topicId,
        topicTitle: rev.topicTitle,
        actionTab: 'revision',
        priorityLabel: isOverdue ? 'High Priority' : 'Recommended Next',
        reason: isOverdue
          ? `Recommended because this topic is overdue for revision (due on ${rev.dueDate}, ${rev.stageLabel}).`
          : `Recommended because this topic is scheduled for ${rev.stageLabel} spaced repetition today (${rev.dueDate}).`,
      });
    }

    const lowAccuracyTopics = topics.filter(
      (t) => typeof t.practiceAccuracy === 'number' && t.practiceAccuracy < 65
    );
    for (const top of lowAccuracyTopics.slice(0, 2)) {
      list.push({
        id: `rec_acc_${top.id}`,
        title: `Reinforce & Practice: ${top.title}`,
        subject: top.subject,
        topicId: top.id,
        topicTitle: top.title,
        actionTab: 'practice',
        priorityLabel: 'High Priority',
        reason: `Recommended because your latest recorded quiz accuracy on "${top.title}" was ${top.practiceAccuracy}%, which is below the 65% target threshold.`,
      });
    }

    const todayPendingTasks = tasks.filter(
      (tk) => tk.date === today && (tk.status === 'planned' || tk.status === 'missed')
    );
    for (const tk of todayPendingTasks.slice(0, 2)) {
      list.push({
        id: `rec_task_${tk.id}`,
        title: tk.title,
        subject: tk.subject,
        topicId: tk.topicId,
        topicTitle: tk.title,
        actionTab: 'routine',
        priorityLabel: tk.status === 'missed' ? 'High Priority' : 'Recommended Next',
        reason:
          tk.status === 'missed'
            ? `Recommended because this ${tk.durationMinutes}-minute ${tk.subject} block from ${tk.startTime} is marked as missed backlog.`
            : `Recommended because this ${tk.durationMinutes}-minute ${tk.subject} task is scheduled on your routine planner for today at ${tk.startTime}.`,
      });
    }

    const unpracticedTopics = topics.filter(
      (t) =>
        (t.status === 'In Progress' || t.status === 'Lecture Completed') &&
        typeof t.practiceAccuracy !== 'number'
    );
    for (const top of unpracticedTopics.slice(0, 1)) {
      list.push({
        id: `rec_unprac_${top.id}`,
        title: `Take 5-Question Quiz: ${top.title}`,
        subject: top.subject,
        topicId: top.id,
        topicTitle: top.title,
        actionTab: 'practice',
        priorityLabel: 'Suggested',
        reason: `Recommended because you logged ${top.studyMinutes} focused minutes on "${top.title}" (${top.status}), but have not recorded a practice quiz attempt yet.`,
      });
    }

    return list;
  }, [revisions, topics, tasks]);

  const retryPendingOfflineUploads = useCallback(async (): Promise<number> => {
    if (!cloudSyncActive || !user || !user.emailVerified || !isOnline) return 0;
    const pendingList = await listPendingOfflineAttachments();
    if (pendingList.length === 0) return 0;

    let uploadedCount = 0;
    for (const item of pendingList) {
      try {
        const targetNote = notes.find(
          (n) =>
            n.id === item.noteId ||
            (n.attachments || []).some((a) => a.id === item.attachmentId)
        );
        const uploadedAtt = await retryAttachmentUpload({
          id: item.attachmentId,
          ownerUid: user.uid,
          noteId: targetNote?.id || item.noteId,
          sessionId: item.sessionId,
          fileName: item.fileName,
          mimeType: item.mimeType,
          sizeBytes: item.sizeBytes,
          checksum: item.checksum,
          localBlobId: item.attachmentId,
          uploadStatus: 'pending_offline',
          createdAtIso: item.createdAtIso,
        });

        if (uploadedAtt.uploadStatus === 'uploaded' && targetNote) {
          uploadedCount++;
          await saveVaultNote({
            ...targetNote,
            id: targetNote.id,
            attachments: (targetNote.attachments || []).map((a) =>
              a.id === uploadedAtt.id ? uploadedAtt : a
            ),
          });
        }
      } catch (e) {
        console.warn('[OfflineSync] Retry failed for attachment:', item.attachmentId, e);
      }
    }

    if (uploadedCount > 0) {
      showSnackbar(`Uploaded ${uploadedCount} pending offline attachment(s) to Firebase Storage.`);
    }
    return uploadedCount;
  }, [cloudSyncActive, user, isOnline, notes, saveVaultNote, showSnackbar]);

  useEffect(() => {
    if (isOnline && cloudSyncActive && user && user.emailVerified) {
      retryPendingOfflineUploads();
    }
  }, [isOnline, cloudSyncActive, user, retryPendingOfflineUploads]);

  const resolveSyncConflict = useCallback(
    async (
      noteId: string,
      resolution: 'keep_local' | 'accept_remote' | 'fork_both'
    ) => {
      const conflict = syncConflicts.find((c) => c.noteId === noteId);
      if (!conflict) return;

      if (resolution === 'keep_local') {
        await saveVaultNote({
          ...conflict.localNote,
          id: conflict.localNote.id,
        });
        showSnackbar(`Kept local version of "${conflict.noteTitle}".`);
      } else if (resolution === 'accept_remote') {
        await dbAtomicSaveVaultNote(conflict.remoteNote);
        setNotes((prev) =>
          prev.map((n) => (n.id === noteId ? conflict.remoteNote : n))
        );
        showSnackbar(`Accepted cloud version of "${conflict.noteTitle}".`);
      } else {
        await dbAtomicSaveVaultNote(conflict.remoteNote);
        setNotes((prev) =>
          prev.map((n) => (n.id === noteId ? conflict.remoteNote : n))
        );
        await saveVaultNote({
          ...conflict.localNote,
          id: undefined,
          title: `${conflict.localNote.title} (Local Conflict Copy)`,
        });
        showSnackbar(`Saved both versions of "${conflict.noteTitle}" without data loss.`);
      }

      await defaultCloudSyncAdapter.resolveConflict(noteId, resolution);
      setSyncConflicts((prev) => prev.filter((c) => c.noteId !== noteId));
    },
    [syncConflicts, saveVaultNote, showSnackbar]
  );

  const exportWorkspaceJson = useCallback(() => {
    const payload = {
      schemaVersion: '5.0-local-first-hybrid',
      exportedAtIso: new Date().toISOString(),
      app: 'RBI Prep OS 2027',
      backupClassification:
        'METADATA_ONLY_JSON (Contains all study records, notes, and attachment metadata/checksums; use Export Complete ZIP Backup to bundle screenshot/PDF binary files)',
      attachmentBackupSummary: {
        importantNotice:
          'This JSON file contains all study records and attachment metadata/SHA-256 checksums, but does NOT include binary screenshot/PDF files. Use "Export Complete ZIP Backup (.zip)" in Settings for a complete backup including original binaries.',
      },
      prefs,
      customSubjects: prefs.customSubjects || [],
      topics,
      sessions,
      tasks,
      notes,
      quizzes,
      revisions,
      currentAffairs,
      aiInteractions,
    };
    return JSON.stringify(payload, null, 2);
  }, [prefs, topics, sessions, tasks, notes, quizzes, revisions, currentAffairs, aiInteractions]);

  const exportCompleteZipBackup = useCallback(async (): Promise<{
    zipBlob: Blob;
    filename: string;
  }> => {
    const { zipBlob } = await createCompleteZipBackup({
      prefs,
      activeTimer,
      topics,
      sessions,
      tasks,
      notes,
      quizzes,
      revisions,
      currentAffairs,
      aiInteractions,
    });
    const filename = `rbi_prep_os_2027_complete_backup_${getKolkataDateString()}.zip`;
    return { zipBlob, filename };
  }, [
    prefs,
    activeTimer,
    topics,
    sessions,
    tasks,
    notes,
    quizzes,
    revisions,
    currentAffairs,
    aiInteractions,
  ]);

  const inspectBackupFile = useCallback(
    async (input: string | Blob): Promise<BackupInspectionPreview> => {
      const { preview } = await inspectBackupInput(input);
      return preview;
    },
    []
  );

  const restoreBackupWithMode = useCallback(
    async (
      input: string | Blob,
      mode: 'merge' | 'replace'
    ): Promise<RestoreExecutionResult> => {
      const res = await executeValidatedRestore(input, mode);
      await reloadFromIndexedDb();
      await refreshStorageQuota();
      const totalRecords =
        res.restoredCounts.topics +
        res.restoredCounts.sessions +
        res.restoredCounts.tasks +
        res.restoredCounts.notes +
        res.restoredCounts.quizzes +
        res.restoredCounts.revisions +
        res.restoredCounts.currentAffairs;
      showSnackbar(
        `Restored ${totalRecords} study records and ${res.restoredCounts.attachmentBinaries} binary attachment(s) (${mode} mode).`
      );
      return res;
    },
    [reloadFromIndexedDb, refreshStorageQuota, showSnackbar]
  );

  const restoreWorkspaceJson = useCallback(
    async (
      jsonString: string
    ): Promise<{ importedCount: number; skippedDuplicates: number }> => {
      const res = await restoreBackupWithMode(jsonString, 'merge');
      const importedCount =
        res.restoredCounts.topics +
        res.restoredCounts.sessions +
        res.restoredCounts.tasks +
        res.restoredCounts.notes +
        res.restoredCounts.quizzes +
        res.restoredCounts.revisions +
        res.restoredCounts.currentAffairs;
      return {
        importedCount,
        skippedDuplicates: res.skippedDuplicates,
      };
    },
    [restoreBackupWithMode]
  );

  const cleanupLegacyLocalStorage = useCallback(() => {
    try {
      confirmLegacyLocalStorageCleanup();
      setLocalStorageMigrationReport((prev) =>
        prev ? { ...prev, legacyRetained: false } : null
      );
      showSnackbar(
        'Cleaned up legacy LocalStorage after verified IndexedDB migration.'
      );
    } catch (err) {
      showSnackbar(err instanceof Error ? err.message : 'Cleanup failed.');
    }
  }, [showSnackbar]);

  // Keep buildWorkspaceDatabasePayload referenced for completeness
  void buildWorkspaceDatabasePayload;

  const triggerManualAutoBackup = useCallback(async () => {
    const res = await triggerAutoBackup(prefs.maxAutoBackups || 7);
    if (res.success) {
      showSnackbar(`Auto backup created: ${res.filePath ? res.filePath.split(/[\\/]/).pop() : 'Local storage'}`);
    } else {
      showSnackbar(`Auto backup failed: ${res.error || 'Unknown error'}`);
    }
    return res;
  }, [prefs.maxAutoBackups, showSnackbar]);

  const value: StudyContextValue = {
    user,
    authReady,
    dbReady,
    isHydrating,
    dbError,
    lastSaveTimeIso,
    retryDatabaseConnection,
    triggerManualAutoBackup,
    workspaceMode,
    syncMode: cloudSyncActive ? 'cloud' : 'local',
    activeTab,
    setActiveTab,
    aiDrawerOpen,
    setAiDrawerOpen,
    aiContextTopic,
    openAiTutorWithContext,
    aiStatus,
    refreshAiStatus,
    storageQuota,
    refreshStorageQuota,
    localStorageMigrationReport,
    cleanupLegacyLocalStorage,
    prefs,
    allSubjects,
    topics,
    sessions,
    tasks,
    notes,
    quizzes,
    revisions,
    currentAffairs,
    aiInteractions,
    activeTimer,
    pendingRetry,
    clearPendingRetry,
    snackbarMessage,
    showSnackbar,
    isOnline,
    pendingSyncCount,
    syncConflicts,
    resolveSyncConflict,
    retryPendingOfflineUploads,
    authDiagnosis,
    clearAuthDiagnosis,
    authPreflight,
    runAuthPreflight,
    signInWithGoogle,
    signInWithGoogleRedirectFallback,
    signOutUser,
    enableCloudSyncWithConsent,
    disableCloudSync,
    prepareCloudSyncInventory,
    syncLocalToCloud,
    updatePrefs,
    addCustomSubject,
    updateActiveTimer,
    startFocusForTopic,
    saveTopic,
    deleteTopic,
    saveStudySession,
    saveRoutineTask,
    deleteRoutineTask,
    saveVaultNote,
    deleteVaultNote,
    saveQuizAttempt,
    saveRevisionItem,
    completeRevisionItem,
    saveCurrentAffair,
    deleteCurrentAffair,
    saveAIInteraction,
    recommendations,
    exportWorkspaceJson,
    exportCompleteZipBackup,
    inspectBackupFile,
    restoreBackupWithMode,
    restoreWorkspaceJson,
  };

  return <StudyContext.Provider value={value}>{children}</StudyContext.Provider>;
};

export function useStudy(): StudyContextValue {
  const ctx = useContext(StudyContext);
  if (!ctx) throw new Error('useStudy must be used inside a StudyProvider');
  return ctx;
}
