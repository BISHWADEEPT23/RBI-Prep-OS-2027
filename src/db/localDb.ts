import { openDB, IDBPDatabase } from 'idb';
import {
  ActiveTimerState,
  AIInteractionRecord,
  AttachmentBlobRecord,
  CurrentAffairRecord,
  DEFAULT_RBI_SUBJECTS,
  LocalStorageMigrationReport,
  NoteVersionEntry,
  QuizAttemptRecord,
  QuizQuestionItem,
  QuizResponseRecord,
  RevisionRecord,
  RoutineTaskRecord,
  StorageQuotaEstimate,
  StudySessionRecord,
  SubjectCategory,
  SyncConflictRecord,
  SyncOperationRecord,
  TopicRecord,
  UserWorkspacePrefs,
  VaultAttachment,
  VaultNoteRecord,
} from '../types';

export const LOCAL_DB_NAME = 'rbi_prep_os_2027';
export const LOCAL_DB_VERSION = 2;

export const LEGACY_LOCAL_STORAGE_KEY = 'rbi_prep_os_2027_workspace_v3';
export const LEGACY_LOCAL_STORAGE_BACKUP_KEY = 'rbi_prep_os_2027_workspace_v3_recoverable_backup';
export const LEGACY_MIGRATION_META_KEY = 'rbi_prep_os_2027_ls_migration_meta_v5';

export const REQUIRED_OBJECT_STORES = [
  'workspaceSettings',
  'subjects',
  'topics',
  'studyTasks',
  'studySessions',
  'routineBlocks',
  'vaultNotes',
  'noteVersions',
  'attachments',
  'attachmentBlobs',
  'quizQuestions',
  'quizAttempts',
  'quizResponses',
  'revisionItems',
  'currentAffairs',
  'aiConversations',
  'syncOperations',
  'syncConflicts',
  'migrationCheckpoints',
] as const;

export type LocalStoreName = (typeof REQUIRED_OBJECT_STORES)[number];

export interface WorkspaceSettingsRow {
  id: 'default_workspace' | 'active_timer';
  prefs?: UserWorkspacePrefs;
  activeTimer?: ActiveTimerState;
  schemaVersion: number;
  updatedAtIso: string;
}

export interface MigrationCheckpointRow {
  id: string; // `${noteId}:${attachmentId}`
  noteId: string;
  attachmentId: string;
  targetType: 'local_indexeddb' | 'firebase_storage';
  storagePath?: string;
  localBlobId?: string;
  checksum: string;
  sizeBytes: number;
  verifiedAtIso: string;
}

export const BUNDLED_OFFLINE_QUIZ_QUESTIONS: QuizQuestionItem[] = [
  {
    id: 'q_rbi_1',
    subject: 'Finance',
    topicTitle: 'Functions of RBI',
    question:
      'Under which section of the Reserve Bank of India Act, 1934 is the Central Government empowered to constitute the Monetary Policy Committee (MPC)?',
    options: ['Section 22', 'Section 45ZB', 'Section 17', 'Section 42(1)'],
    correctIndex: 1,
    explanation:
      'Section 45ZB of the RBI Act, 1934 (inserted by the Finance Act, 2016) provides for the constitution of a six-member Monetary Policy Committee (MPC) to determine the policy repo rate required to achieve the inflation target.',
    difficulty: 'Phase II Core',
    conceptTag: 'Monetary Policy Committee',
    groundedInNotes: true,
  },
  {
    id: 'q_rbi_2',
    subject: 'Finance',
    topicTitle: 'Functions of RBI',
    question:
      'Under the Minimum Reserve System adopted by the RBI in 1956 for currency issuance, what is the minimum value of gold coin and gold bullion that must be maintained at all times?',
    options: ['Rs. 85 Crore', 'Rs. 115 Crore', 'Rs. 200 Crore', 'Rs. 500 Crore'],
    correctIndex: 1,
    explanation:
      'Under the Minimum Reserve System (Section 33 of the RBI Act, 1934), RBI maintains a minimum reserve of Rs. 200 Crore, of which at least Rs. 115 Crore must be in gold coin and gold bullion and Rs. 85 Crore in foreign securities.',
    difficulty: 'Phase I & II',
    conceptTag: 'Issuer of Currency',
    groundedInNotes: true,
  },
  {
    id: 'q_rbi_3',
    subject: 'Finance',
    topicTitle: 'Functions of RBI',
    question:
      'Which instrument of the Liquidity Adjustment Facility (LAF) allows scheduled commercial banks to absorb overnight liquidity with the RBI without any collateral requirement?',
    options: [
      'Marginal Standing Facility (MSF)',
      'Standing Deposit Facility (SDF)',
      'Variable Rate Repo (VRR)',
      'Ways and Means Advances (WMA)',
    ],
    correctIndex: 1,
    explanation:
      'Introduced in April 2022 under Section 17(1A) of the RBI Act, the Standing Deposit Facility (SDF) acts as the floor of the LAF corridor and absorbs overnight liquidity from banks without requiring RBI to provide eligible collateral.',
    difficulty: 'Phase II Core',
    conceptTag: 'Liquidity Adjustment Facility',
    groundedInNotes: true,
  },
  {
    id: 'q_rbi_4',
    subject: 'Finance',
    topicTitle: 'Functions of RBI',
    question:
      'Which section of the RBI Act, 1934 grants the Reserve Bank of India the sole right to issue bank notes in India?',
    options: ['Section 20', 'Section 22', 'Section 24', 'Section 31'],
    correctIndex: 1,
    explanation:
      'Section 22 of the RBI Act, 1934 confers upon the Reserve Bank the sole right to issue bank notes in India (except one-rupee notes and coins, which are issued by the Government of India under the Coinage Act, 2011 and put into circulation through RBI).',
    difficulty: 'Phase I & II',
    conceptTag: 'Currency Management',
    groundedInNotes: true,
  },
  {
    id: 'q_rbi_5',
    subject: 'Finance',
    topicTitle: 'Functions of RBI',
    question:
      'What happens when the average CPI headline inflation remains outside the prescribed tolerance band (2% to 6%) for three consecutive quarters?',
    options: [
      'MPC is automatically dissolved',
      'RBI must submit a report to the Central Government stating reasons, remedial actions, and estimated time to return to target',
      'Repo rate is frozen for two quarters',
      'Statutory Liquidity Ratio is automatically raised by 100 bps',
    ],
    correctIndex: 1,
    explanation:
      'Under Section 45ZN of the RBI Act, 1934, if RBI fails to meet the inflation target for three consecutive quarters, it must submit a report to the Central Government explaining the reasons for failure, proposed remedial actions, and an estimate of the time period within which the target will be achieved.',
    difficulty: 'Phase II Core',
    conceptTag: 'Flexible Inflation Targeting',
    groundedInNotes: true,
  },
  {
    id: 'q_rbi_6',
    subject: 'Economic and Social Issues',
    topicTitle: 'Measurement of Growth: National Income & Per Capita Income',
    question:
      'In India’s National Accounts Statistics (base year 2011-12), Gross Value Added (GVA) at Basic Prices is related to GVA at Factor Cost by which formula?',
    options: [
      'GVA at Basic Prices = GVA at Factor Cost + Production Taxes - Production Subsidies',
      'GVA at Basic Prices = GVA at Factor Cost + Product Taxes - Product Subsidies',
      'GVA at Basic Prices = GDP at Market Prices + Net Factor Income from Abroad',
      'GVA at Basic Prices = GVA at Factor Cost - Consumption of Fixed Capital',
    ],
    correctIndex: 0,
    explanation:
      'GVA at Basic Prices includes production taxes (such as land revenue, stamp duty) less production subsidies, whereas GDP at Market Prices equals GVA at Basic Prices plus product taxes less product subsidies.',
    difficulty: 'Phase II Core',
    conceptTag: 'National Income Accounting',
    groundedInNotes: true,
  },
  {
    id: 'q_rbi_7',
    subject: 'Management',
    topicTitle: 'Motivation Theories (Maslow, Herzberg, McGregor, Vroom)',
    question:
      'According to Frederick Herzberg’s Two-Factor Theory of Motivation, which of the following is classified as a true "Motivator" (Intrinsic Factor) rather than a Hygiene Factor?',
    options: [
      'Company policy and administration',
      'Interpersonal relations with supervisor',
      'Recognition and responsibility for achievement',
      'Job security and base salary',
    ],
    correctIndex: 2,
    explanation:
      'In Herzberg’s Dual-Factor Theory, achievement, recognition, the work itself, responsibility, and advancement are intrinsic Motivators that lead to satisfaction, whereas salary, supervision, and company policies are Hygiene factors that prevent dissatisfaction.',
    difficulty: 'Phase II Core',
    conceptTag: 'Motivation Theories',
    groundedInNotes: true,
  },
];

let dbPromise: Promise<IDBPDatabase> | null = null;
let simulateQuotaExceededForTesting = false;
let bundledDefaultsSeeded = false;
let lastKnownSaveTimeIso: string | null = null;

export function getCachedLastSaveTimeIso(): string | null {
  return lastKnownSaveTimeIso;
}

export function updateCachedLastSaveTimeIso(iso: string): void {
  lastKnownSaveTimeIso = iso;
}

export function setSimulateQuotaExceeded(enabled: boolean): void {
  simulateQuotaExceededForTesting = enabled;
}

export function resetLocalDbConnection(): void {
  dbPromise = null;
  bundledDefaultsSeeded = false;
}

export function applySchemaUpgrade(
  db: IDBPDatabase,
  oldVersion: number,
  _newVersion: number | null
): void {
  if (oldVersion < 1) {
    if (!db.objectStoreNames.contains('workspaceSettings')) {
      db.createObjectStore('workspaceSettings', { keyPath: 'id' });
    }
    if (!db.objectStoreNames.contains('subjects')) {
      const s = db.createObjectStore('subjects', { keyPath: 'id' });
      s.createIndex('phase', 'phase', { unique: false });
      s.createIndex('code', 'code', { unique: false });
    }
    if (!db.objectStoreNames.contains('topics')) {
      const s = db.createObjectStore('topics', { keyPath: 'id' });
      s.createIndex('subject', 'subject', { unique: false });
      s.createIndex('phase', 'phase', { unique: false });
      s.createIndex('status', 'status', { unique: false });
      s.createIndex('updatedAtIso', 'updatedAtIso', { unique: false });
    }
    if (!db.objectStoreNames.contains('studyTasks')) {
      const s = db.createObjectStore('studyTasks', { keyPath: 'id' });
      s.createIndex('date', 'date', { unique: false });
      s.createIndex('subject', 'subject', { unique: false });
      s.createIndex('status', 'status', { unique: false });
    }
    if (!db.objectStoreNames.contains('studySessions')) {
      const s = db.createObjectStore('studySessions', { keyPath: 'id' });
      s.createIndex('sessionDate', 'sessionDate', { unique: false });
      s.createIndex('topicId', 'topicId', { unique: false });
      s.createIndex('subject', 'subject', { unique: false });
      s.createIndex('createdAtIso', 'createdAtIso', { unique: false });
    }
    if (!db.objectStoreNames.contains('routineBlocks')) {
      const s = db.createObjectStore('routineBlocks', { keyPath: 'id' });
      s.createIndex('date', 'date', { unique: false });
      s.createIndex('subject', 'subject', { unique: false });
      s.createIndex('status', 'status', { unique: false });
    }
    if (!db.objectStoreNames.contains('vaultNotes')) {
      const s = db.createObjectStore('vaultNotes', { keyPath: 'id' });
      s.createIndex('subject', 'subject', { unique: false });
      s.createIndex('topicId', 'topicId', { unique: false });
      s.createIndex('sourceType', 'sourceType', { unique: false });
      s.createIndex('updatedAtIso', 'updatedAtIso', { unique: false });
    }
    if (!db.objectStoreNames.contains('noteVersions')) {
      const s = db.createObjectStore('noteVersions', { keyPath: 'id' });
      s.createIndex('noteId', 'noteId', { unique: false });
      s.createIndex('savedAtIso', 'savedAtIso', { unique: false });
    }
    if (!db.objectStoreNames.contains('attachments')) {
      const s = db.createObjectStore('attachments', { keyPath: 'id' });
      s.createIndex('noteId', 'noteId', { unique: false });
      s.createIndex('sessionId', 'sessionId', { unique: false });
      s.createIndex('sha256', 'sha256', { unique: false });
      s.createIndex('uploadStatus', 'uploadStatus', { unique: false });
    }
    if (!db.objectStoreNames.contains('attachmentBlobs')) {
      db.createObjectStore('attachmentBlobs', { keyPath: 'id' });
    }
  }

  if (oldVersion < 2) {
    // Version 2 ensures all remaining v5.0 stores exist while preserving any v1 records untouched
    if (!db.objectStoreNames.contains('quizQuestions')) {
      const s = db.createObjectStore('quizQuestions', { keyPath: 'id' });
      s.createIndex('subject', 'subject', { unique: false });
      s.createIndex('conceptTag', 'conceptTag', { unique: false });
      s.createIndex('difficulty', 'difficulty', { unique: false });
    }
    if (!db.objectStoreNames.contains('quizAttempts')) {
      const s = db.createObjectStore('quizAttempts', { keyPath: 'id' });
      s.createIndex('attemptDate', 'attemptDate', { unique: false });
      s.createIndex('subject', 'subject', { unique: false });
      s.createIndex('quizType', 'quizType', { unique: false });
    }
    if (!db.objectStoreNames.contains('quizResponses')) {
      const s = db.createObjectStore('quizResponses', { keyPath: 'id' });
      s.createIndex('attemptId', 'attemptId', { unique: false });
      s.createIndex('questionId', 'questionId', { unique: false });
      s.createIndex('mistakeCategory', 'mistakeCategory', { unique: false });
    }
    if (!db.objectStoreNames.contains('revisionItems')) {
      const s = db.createObjectStore('revisionItems', { keyPath: 'id' });
      s.createIndex('dueDate', 'dueDate', { unique: false });
      s.createIndex('topicId', 'topicId', { unique: false });
      s.createIndex('status', 'status', { unique: false });
      s.createIndex('subject', 'subject', { unique: false });
    }
    if (!db.objectStoreNames.contains('currentAffairs')) {
      const s = db.createObjectStore('currentAffairs', { keyPath: 'id' });
      s.createIndex('date', 'date', { unique: false });
      s.createIndex('monthTag', 'monthTag', { unique: false });
      s.createIndex('revisionStatus', 'revisionStatus', { unique: false });
    }
    if (!db.objectStoreNames.contains('aiConversations')) {
      const s = db.createObjectStore('aiConversations', { keyPath: 'id' });
      s.createIndex('subject', 'subject', { unique: false });
      s.createIndex('actionType', 'actionType', { unique: false });
      s.createIndex('createdAtIso', 'createdAtIso', { unique: false });
    }
    if (!db.objectStoreNames.contains('syncOperations')) {
      const s = db.createObjectStore('syncOperations', { keyPath: 'id' });
      s.createIndex('status', 'status', { unique: false });
      s.createIndex('entityType', 'entityType', { unique: false });
      s.createIndex('createdAtIso', 'createdAtIso', { unique: false });
    }
    if (!db.objectStoreNames.contains('syncConflicts')) {
      const s = db.createObjectStore('syncConflicts', { keyPath: 'noteId' });
      s.createIndex('detectedAtIso', 'detectedAtIso', { unique: false });
    }
    if (!db.objectStoreNames.contains('migrationCheckpoints')) {
      const s = db.createObjectStore('migrationCheckpoints', { keyPath: 'id' });
      s.createIndex('noteId', 'noteId', { unique: false });
      s.createIndex('attachmentId', 'attachmentId', { unique: false });
    }
  }
}

export async function getLocalDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(LOCAL_DB_NAME, LOCAL_DB_VERSION, {
      upgrade(db, oldVersion, newVersion) {
        applySchemaUpgrade(db, oldVersion, newVersion);
      },
      blocked() {
        console.warn('[IndexedDB] Database upgrade blocked by another open tab.');
      },
      blocking() {
        console.warn('[IndexedDB] Closing connection to allow newer version upgrade.');
      },
    });
  }
  return dbPromise;
}

export function assertQuotaNotExceeded(): void {
  if (simulateQuotaExceededForTesting) {
    const err = new Error(
      'QuotaExceededError: Browser storage quota exceeded. Please export a ZIP backup or remove old large attachments.'
    );
    err.name = 'QuotaExceededError';
    throw err;
  }
}

export function isQuotaExceededError(err: unknown): boolean {
  if (!err) return false;
  const name = (err as { name?: string })?.name || '';
  const msg = err instanceof Error ? err.message : String(err);
  return (
    name === 'QuotaExceededError' ||
    name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    msg.includes('QuotaExceededError') ||
    msg.toLowerCase().includes('quota exceeded')
  );
}

export async function estimateStorageQuota(): Promise<StorageQuotaEstimate> {
  if (simulateQuotaExceededForTesting) {
    return {
      usageBytes: 98 * 1024 * 1024,
      quotaBytes: 100 * 1024 * 1024,
      usagePercent: 98,
      isNearLimit: true,
      isExceeded: true,
      warningMessage:
        'Browser storage quota exceeded (98% used). New binary writes are blocked to prevent silent corruption. Please export a Complete ZIP Backup.',
    };
  }

  try {
    if (
      typeof navigator !== 'undefined' &&
      navigator.storage &&
      typeof navigator.storage.estimate === 'function'
    ) {
      const est = await navigator.storage.estimate();
      const usageBytes = est.usage || 0;
      const quotaBytes = est.quota || 512 * 1024 * 1024;
      const usagePercent = quotaBytes > 0 ? Math.round((usageBytes / quotaBytes) * 1000) / 10 : 0;
      const isNearLimit = usagePercent >= 80;
      const isExceeded = usagePercent >= 98;
      return {
        usageBytes,
        quotaBytes,
        usagePercent,
        isNearLimit,
        isExceeded,
        warningMessage: isExceeded
          ? `Storage capacity critical (${usagePercent}% used). Export a ZIP backup immediately.`
          : isNearLimit
          ? `Local storage usage is at ${usagePercent}%. Consider exporting a Complete ZIP Backup.`
          : null,
      };
    }
  } catch {
    // Fallback below
  }

  return {
    usageBytes: 0,
    quotaBytes: 512 * 1024 * 1024,
    usagePercent: 0,
    isNearLimit: false,
    isExceeded: false,
    warningMessage: null,
  };
}

// Cross-Tab BroadcastChannel for concurrent multi-tab edits (Test L23)
const BROADCAST_CHANNEL_NAME = 'rbi_prep_os_2027_sync_channel';

export interface CrossTabSyncMessage {
  type: 'WORKSPACE_UPDATED';
  storeName: LocalStoreName;
  recordId: string;
  updatedAtIso: string;
}

export function broadcastWorkspaceChange(
  storeName: LocalStoreName,
  recordId: string
): void {
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      const msg: CrossTabSyncMessage = {
        type: 'WORKSPACE_UPDATED',
        storeName,
        recordId,
        updatedAtIso: new Date().toISOString(),
      };
      bc.postMessage(msg);
      bc.close();
    }
  } catch {
    // BroadcastChannel optional in older environments
  }
}

export function subscribeCrossTabChanges(
  onUpdate: (msg: CrossTabSyncMessage) => void
): () => void {
  if (typeof BroadcastChannel === 'undefined') {
    return () => {};
  }
  try {
    const bc = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    const handler = (event: MessageEvent<CrossTabSyncMessage>) => {
      if (event.data && event.data.type === 'WORKSPACE_UPDATED') {
        onUpdate(event.data);
      }
    };
    bc.addEventListener('message', handler);
    return () => {
      bc.removeEventListener('message', handler);
      bc.close();
    };
  } catch {
    return () => {};
  }
}

/**
 * Ensures bundled RBI subjects and offline question bank exist in IndexedDB.
 */
export async function seedBundledDefaultsIfEmpty(): Promise<void> {
  if (bundledDefaultsSeeded) return;
  const db = await getLocalDb();
  const existingSubjects = await db.count('subjects');
  if (existingSubjects === 0) {
    const tx = db.transaction('subjects', 'readwrite');
    for (const s of DEFAULT_RBI_SUBJECTS) {
      await tx.store.put({
        ...s,
        createdAtIso: new Date().toISOString(),
        updatedAtIso: new Date().toISOString(),
      });
    }
    await tx.done;
  }

  const existingQuestions = await db.count('quizQuestions');
  if (existingQuestions === 0) {
    const tx = db.transaction('quizQuestions', 'readwrite');
    for (const q of BUNDLED_OFFLINE_QUIZ_QUESTIONS) {
      await tx.store.put(q);
    }
    await tx.done;
  }
  bundledDefaultsSeeded = true;
}

/**
 * Phase 3: Existing LocalStorage Migration into `rbi_prep_os_2027` IndexedDB.
 * 1. Detects records in `rbi_prep_os_2027_workspace_v3`.
 * 2. Creates a recoverable backup at `rbi_prep_os_2027_workspace_v3_recoverable_backup`.
 * 3. Validates schema.
 * 4. Imports into IndexedDB.
 * 5. Compares record counts and key fields.
 * 6. Marks migration complete only after verification.
 * 7. Retains legacy data until the user explicitly confirms cleanup.
 */
export async function migrateLegacyLocalStorageToIndexedDb(): Promise<LocalStorageMigrationReport> {
  const emptyReport: LocalStorageMigrationReport = {
    detectedLegacyData: false,
    backupKey: LEGACY_LOCAL_STORAGE_BACKUP_KEY,
    legacyRetained: false,
    verifiedMatch: true,
    counts: {
      topics: 0,
      sessions: 0,
      tasks: 0,
      notes: 0,
      quizzes: 0,
      revisions: 0,
      currentAffairs: 0,
      aiInteractions: 0,
    },
  };

  if (typeof localStorage === 'undefined') return emptyReport;

  try {
    const existingMetaRaw = localStorage.getItem(LEGACY_MIGRATION_META_KEY);
    const rawLegacy = localStorage.getItem(LEGACY_LOCAL_STORAGE_KEY);

    if (!rawLegacy) {
      if (existingMetaRaw) {
        return JSON.parse(existingMetaRaw) as LocalStorageMigrationReport;
      }
      return emptyReport;
    }

    // Check if already migrated and verified
    if (existingMetaRaw) {
      const prevMeta = JSON.parse(existingMetaRaw) as LocalStorageMigrationReport;
      if (prevMeta.verifiedMatch && prevMeta.migratedAtIso) {
        return {
          ...prevMeta,
          legacyRetained: Boolean(localStorage.getItem(LEGACY_LOCAL_STORAGE_KEY)),
        };
      }
    }

    // Step 2: Create recoverable backup before touching anything
    if (!localStorage.getItem(LEGACY_LOCAL_STORAGE_BACKUP_KEY)) {
      localStorage.setItem(LEGACY_LOCAL_STORAGE_BACKUP_KEY, rawLegacy);
    }

    // Step 3: Validate schema
    const parsed = JSON.parse(rawLegacy);
    if (!parsed || typeof parsed !== 'object') {
      return emptyReport;
    }

    const legacyTopics: TopicRecord[] = Array.isArray(parsed.topics) ? parsed.topics : [];
    const legacySessions: StudySessionRecord[] = Array.isArray(parsed.sessions) ? parsed.sessions : [];
    const legacyTasks: RoutineTaskRecord[] = Array.isArray(parsed.tasks) ? parsed.tasks : [];
    const legacyNotes: VaultNoteRecord[] = Array.isArray(parsed.notes) ? parsed.notes : [];
    const legacyQuizzes: QuizAttemptRecord[] = Array.isArray(parsed.quizzes) ? parsed.quizzes : [];
    const legacyRevisions: RevisionRecord[] = Array.isArray(parsed.revisions) ? parsed.revisions : [];
    const legacyCA: CurrentAffairRecord[] = Array.isArray(parsed.currentAffairs)
      ? parsed.currentAffairs
      : [];
    const legacyAI: AIInteractionRecord[] = Array.isArray(parsed.aiInteractions)
      ? parsed.aiInteractions
      : [];

    const db = await getLocalDb();
    const nowIso = new Date().toISOString();

    // Step 4: Atomic import into IndexedDB
    const tx = db.transaction(
      [
        'workspaceSettings',
        'subjects',
        'topics',
        'studyTasks',
        'studySessions',
        'routineBlocks',
        'vaultNotes',
        'quizAttempts',
        'revisionItems',
        'currentAffairs',
        'aiConversations',
      ],
      'readwrite'
    );

    if (parsed.prefs && typeof parsed.prefs === 'object') {
      const existingSettings = (await tx.objectStore('workspaceSettings').get(
        'default_workspace'
      )) as WorkspaceSettingsRow | undefined;
      if (!existingSettings) {
        await tx.objectStore('workspaceSettings').put({
          id: 'default_workspace',
          prefs: {
            workspaceMode: 'LOCAL_WORKSPACE',
            ...parsed.prefs,
          },
          schemaVersion: LOCAL_DB_VERSION,
          updatedAtIso: nowIso,
        } satisfies WorkspaceSettingsRow);
      }
      if (Array.isArray(parsed.prefs.customSubjects)) {
        for (const cs of parsed.prefs.customSubjects) {
          if (cs && cs.id) {
            await tx.objectStore('subjects').put({ ...cs, isCustom: true });
          }
        }
      }
    }

    if (parsed.activeTimer && typeof parsed.activeTimer === 'object') {
      const existingTimer = await tx.objectStore('workspaceSettings').get('active_timer');
      if (!existingTimer) {
        await tx.objectStore('workspaceSettings').put({
          id: 'active_timer',
          activeTimer: parsed.activeTimer,
          schemaVersion: LOCAL_DB_VERSION,
          updatedAtIso: nowIso,
        } satisfies WorkspaceSettingsRow);
      }
    }

    for (const item of legacyTopics) {
      if (item && item.id) await tx.objectStore('topics').put(item);
    }
    for (const item of legacySessions) {
      if (item && item.id) await tx.objectStore('studySessions').put(item);
    }
    for (const item of legacyTasks) {
      if (item && item.id) {
        await tx.objectStore('studyTasks').put(item);
        await tx.objectStore('routineBlocks').put(item);
      }
    }
    for (const item of legacyNotes) {
      if (item && item.id) await tx.objectStore('vaultNotes').put(item);
    }
    for (const item of legacyQuizzes) {
      if (item && item.id) await tx.objectStore('quizAttempts').put(item);
    }
    for (const item of legacyRevisions) {
      if (item && item.id) await tx.objectStore('revisionItems').put(item);
    }
    for (const item of legacyCA) {
      if (item && item.id) await tx.objectStore('currentAffairs').put(item);
    }
    for (const item of legacyAI) {
      if (item && item.id) await tx.objectStore('aiConversations').put(item);
    }

    await tx.done;

    // Step 5: Verify record counts in IndexedDB are >= migrated counts
    const [
      idbTopics,
      idbSessions,
      idbTasks,
      idbNotes,
      idbQuizzes,
      idbRevisions,
      idbCA,
      idbAI,
    ] = await Promise.all([
      db.count('topics'),
      db.count('studySessions'),
      db.count('studyTasks'),
      db.count('vaultNotes'),
      db.count('quizAttempts'),
      db.count('revisionItems'),
      db.count('currentAffairs'),
      db.count('aiConversations'),
    ]);

    const verifiedMatch =
      idbTopics >= legacyTopics.filter((x) => x?.id).length &&
      idbSessions >= legacySessions.filter((x) => x?.id).length &&
      idbTasks >= legacyTasks.filter((x) => x?.id).length &&
      idbNotes >= legacyNotes.filter((x) => x?.id).length &&
      idbQuizzes >= legacyQuizzes.filter((x) => x?.id).length &&
      idbRevisions >= legacyRevisions.filter((x) => x?.id).length &&
      idbCA >= legacyCA.filter((x) => x?.id).length &&
      idbAI >= legacyAI.filter((x) => x?.id).length;

    const report: LocalStorageMigrationReport = {
      detectedLegacyData: true,
      migratedAtIso: nowIso,
      backupKey: LEGACY_LOCAL_STORAGE_BACKUP_KEY,
      legacyRetained: true,
      verifiedMatch,
      counts: {
        topics: legacyTopics.length,
        sessions: legacySessions.length,
        tasks: legacyTasks.length,
        notes: legacyNotes.length,
        quizzes: legacyQuizzes.length,
        revisions: legacyRevisions.length,
        currentAffairs: legacyCA.length,
        aiInteractions: legacyAI.length,
      },
    };

    if (verifiedMatch) {
      localStorage.setItem(LEGACY_MIGRATION_META_KEY, JSON.stringify(report));
    }

    return report;
  } catch (err) {
    console.warn('[LocalStorage -> IndexedDB Migration] Error:', err);
    return emptyReport;
  }
}

/**
 * Only cleans up the retained legacy localStorage key when the user explicitly confirms cleanup.
 */
export function confirmLegacyLocalStorageCleanup(): boolean {
  if (typeof localStorage === 'undefined') return false;
  const metaRaw = localStorage.getItem(LEGACY_MIGRATION_META_KEY);
  if (metaRaw) {
    const parsed = JSON.parse(metaRaw) as LocalStorageMigrationReport;
    if (!parsed.verifiedMatch) {
      throw new Error('Cannot remove legacy LocalStorage before migration verification succeeds.');
    }
    parsed.legacyRetained = false;
    localStorage.setItem(LEGACY_MIGRATION_META_KEY, JSON.stringify(parsed));
  }
  localStorage.removeItem(LEGACY_LOCAL_STORAGE_KEY);
  return true;
}

/**
 * Loads the complete workspace snapshot from `rbi_prep_os_2027` IndexedDB.
 */
export async function loadWorkspaceFromIndexedDb(
  defaultPrefs: UserWorkspacePrefs,
  defaultTimer: ActiveTimerState
): Promise<{
  prefs: UserWorkspacePrefs;
  customSubjects: SubjectCategory[];
  topics: TopicRecord[];
  sessions: StudySessionRecord[];
  tasks: RoutineTaskRecord[];
  notes: VaultNoteRecord[];
  quizzes: QuizAttemptRecord[];
  revisions: RevisionRecord[];
  currentAffairs: CurrentAffairRecord[];
  aiInteractions: AIInteractionRecord[];
  activeTimer: ActiveTimerState;
  syncOperations: SyncOperationRecord[];
  syncConflicts: SyncConflictRecord[];
  lastSaveTimeIso: string;
}> {
  await seedBundledDefaultsIfEmpty();
  const db = await getLocalDb();

  const [
    settingsRow,
    timerRow,
    allSubjs,
    topics,
    sessions,
    tasks,
    notes,
    quizzes,
    revisions,
    currentAffairs,
    aiInteractions,
    syncOperations,
    syncConflicts,
  ] = await Promise.all([
    db.get('workspaceSettings', 'default_workspace') as Promise<WorkspaceSettingsRow | undefined>,
    db.get('workspaceSettings', 'active_timer') as Promise<WorkspaceSettingsRow | undefined>,
    db.getAll('subjects') as Promise<SubjectCategory[]>,
    db.getAll('topics') as Promise<TopicRecord[]>,
    db.getAll('studySessions') as Promise<StudySessionRecord[]>,
    db.getAll('studyTasks') as Promise<RoutineTaskRecord[]>,
    db.getAll('vaultNotes') as Promise<VaultNoteRecord[]>,
    db.getAll('quizAttempts') as Promise<QuizAttemptRecord[]>,
    db.getAll('revisionItems') as Promise<RevisionRecord[]>,
    db.getAll('currentAffairs') as Promise<CurrentAffairRecord[]>,
    db.getAll('aiConversations') as Promise<AIInteractionRecord[]>,
    db.getAll('syncOperations') as Promise<SyncOperationRecord[]>,
    db.getAll('syncConflicts') as Promise<SyncConflictRecord[]>,
  ]);

  const customSubjects = allSubjs.filter((s) => s.isCustom);
  const prefs: UserWorkspacePrefs = {
    ...defaultPrefs,
    ...(settingsRow?.prefs || {}),
    workspaceMode: settingsRow?.prefs?.workspaceMode || 'LOCAL_WORKSPACE',
    customSubjects:
      customSubjects.length > 0
        ? customSubjects
        : settingsRow?.prefs?.customSubjects || [],
  };

  const activeTimer: ActiveTimerState = {
    ...defaultTimer,
    ...(timerRow?.activeTimer || {}),
  };

  if (
    activeTimer.isRunning &&
    !activeTimer.isPaused &&
    activeTimer.lastHeartbeatEpochMs
  ) {
    const gapMs = Date.now() - activeTimer.lastHeartbeatEpochMs;
    if (gapMs > 20 * 60 * 1000) {
      activeTimer.unverifiedGapDetected = true;
      activeTimer.unverifiedGapMinutes = Math.round(gapMs / 60000);
    }
  }

  // Derive last save time from most recently saved record
  const candidateDates = [
    settingsRow?.updatedAtIso,
    timerRow?.updatedAtIso,
    sessions[0]?.updatedAtIso || sessions[0]?.createdAtIso,
    topics[0]?.updatedAtIso,
    notes[0]?.updatedAtIso,
    quizzes[0]?.createdAtIso,
  ].filter(Boolean) as string[];

  const lastSaveTimeIso = candidateDates.sort().reverse()[0] || new Date().toISOString();
  lastKnownSaveTimeIso = lastSaveTimeIso;

  return {
    prefs,
    customSubjects,
    topics: topics.sort((a, b) => (b.updatedAtIso || '').localeCompare(a.updatedAtIso || '')),
    sessions: sessions.sort((a, b) => (b.createdAtIso || '').localeCompare(a.createdAtIso || '')),
    tasks,
    notes: notes.sort((a, b) => (b.updatedAtIso || '').localeCompare(a.updatedAtIso || '')),
    quizzes: quizzes.sort((a, b) => (b.createdAtIso || '').localeCompare(a.createdAtIso || '')),
    revisions: revisions.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '')),
    currentAffairs: currentAffairs.sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    aiInteractions: aiInteractions.sort((a, b) =>
      (b.createdAtIso || '').localeCompare(a.createdAtIso || '')
    ),
    activeTimer,
    syncOperations,
    syncConflicts,
    lastSaveTimeIso,
  };
}

// Repository Operations on `rbi_prep_os_2027`

export async function dbSavePrefs(prefs: UserWorkspacePrefs): Promise<void> {
  assertQuotaNotExceeded();
  const db = await getLocalDb();
  const nowIso = new Date().toISOString();
  const tx = db.transaction(['workspaceSettings', 'subjects'], 'readwrite');
  await tx.objectStore('workspaceSettings').put({
    id: 'default_workspace',
    prefs,
    schemaVersion: LOCAL_DB_VERSION,
    updatedAtIso: nowIso,
  } satisfies WorkspaceSettingsRow);

  for (const subj of prefs.customSubjects || []) {
    await tx.objectStore('subjects').put({
      ...subj,
      isCustom: true,
      updatedAtIso: nowIso,
    });
  }
  await tx.done;
  updateCachedLastSaveTimeIso(nowIso);
  broadcastWorkspaceChange('workspaceSettings', 'default_workspace');
}

export async function dbSaveActiveTimer(activeTimer: ActiveTimerState): Promise<void> {
  assertQuotaNotExceeded();
  const db = await getLocalDb();
  await db.put('workspaceSettings', {
    id: 'active_timer',
    activeTimer,
    schemaVersion: LOCAL_DB_VERSION,
    updatedAtIso: new Date().toISOString(),
  } satisfies WorkspaceSettingsRow);
}

export async function dbSaveTopic(topic: TopicRecord): Promise<TopicRecord> {
  assertQuotaNotExceeded();
  const db = await getLocalDb();
  await db.put('topics', topic);
  updateCachedLastSaveTimeIso(topic.updatedAtIso || new Date().toISOString());
  broadcastWorkspaceChange('topics', topic.id);
  return topic;
}

export async function dbDeleteTopic(topicId: string): Promise<void> {
  const db = await getLocalDb();
  await db.delete('topics', topicId);
  broadcastWorkspaceChange('topics', topicId);
}

/**
 * Atomic multi-record transaction for saving a Focus Room study session:
 * - Prevents duplicate study-session creation by checking if `session.id` already exists in `studySessions`.
 * - Prevents double-counting study minutes on the associated `topic`.
 * - Idempotently schedules a revision item in `revisionItems` if requested.
 */
export async function dbAtomicSaveStudySession(options: {
  session: StudySessionRecord;
  updatedTopic: TopicRecord;
  revisionToSchedule?: RevisionRecord;
}): Promise<{
  session: StudySessionRecord;
  topic: TopicRecord;
  revision?: RevisionRecord;
  wasDuplicateSession: boolean;
}> {
  assertQuotaNotExceeded();
  const db = await getLocalDb();
  const tx = db.transaction(['studySessions', 'topics', 'revisionItems'], 'readwrite');

  const existingSession = (await tx
    .objectStore('studySessions')
    .get(options.session.id)) as StudySessionRecord | undefined;

  if (existingSession) {
    const currentTopic =
      ((await tx.objectStore('topics').get(options.updatedTopic.id)) as TopicRecord | undefined) ||
      options.updatedTopic;
    await tx.done;
    return {
      session: existingSession,
      topic: currentTopic,
      wasDuplicateSession: true,
    };
  }

  await tx.objectStore('studySessions').put(options.session);
  await tx.objectStore('topics').put(options.updatedTopic);

  let savedRevision: RevisionRecord | undefined;
  if (options.revisionToSchedule) {
    const allRevs = (await tx
      .objectStore('revisionItems')
      .index('topicId')
      .getAll(options.revisionToSchedule.topicId)) as RevisionRecord[];

    // Idempotent check: avoid duplicate pending revision for the same topicId, intervalDays, and dueDate
    const duplicateRev = allRevs.find(
      (r) =>
        r.status !== 'completed' &&
        r.intervalDays === options.revisionToSchedule?.intervalDays &&
        r.dueDate === options.revisionToSchedule?.dueDate
    );

    if (duplicateRev) {
      savedRevision = duplicateRev;
    } else {
      await tx.objectStore('revisionItems').put(options.revisionToSchedule);
      savedRevision = options.revisionToSchedule;
    }
  }

  await tx.done;
  updateCachedLastSaveTimeIso(options.session.updatedAtIso || new Date().toISOString());
  broadcastWorkspaceChange('studySessions', options.session.id);
  broadcastWorkspaceChange('topics', options.updatedTopic.id);
  if (savedRevision) {
    broadcastWorkspaceChange('revisionItems', savedRevision.id);
  }

  return {
    session: options.session,
    topic: options.updatedTopic,
    revision: savedRevision,
    wasDuplicateSession: false,
  };
}

export async function dbSaveRoutineTask(task: RoutineTaskRecord): Promise<RoutineTaskRecord> {
  assertQuotaNotExceeded();
  const db = await getLocalDb();
  const tx = db.transaction(['studyTasks', 'routineBlocks'], 'readwrite');
  await tx.objectStore('studyTasks').put(task);
  await tx.objectStore('routineBlocks').put(task);
  await tx.done;
  updateCachedLastSaveTimeIso(task.updatedAtIso || new Date().toISOString());
  broadcastWorkspaceChange('studyTasks', task.id);
  return task;
}

export async function dbDeleteRoutineTask(taskId: string): Promise<void> {
  const db = await getLocalDb();
  const tx = db.transaction(['studyTasks', 'routineBlocks'], 'readwrite');
  await tx.objectStore('studyTasks').delete(taskId);
  await tx.objectStore('routineBlocks').delete(taskId);
  await tx.done;
  broadcastWorkspaceChange('studyTasks', taskId);
}

/**
 * Atomic multi-record save for Vault Notes:
 * - Saves note to `vaultNotes`
 * - Persists version entries in `noteVersions`
 * - Persists attachment metadata in `attachments`
 */
export async function dbAtomicSaveVaultNote(note: VaultNoteRecord): Promise<VaultNoteRecord> {
  assertQuotaNotExceeded();
  const db = await getLocalDb();
  const tx = db.transaction(['vaultNotes', 'noteVersions', 'attachments'], 'readwrite');

  // Concurrent multi-tab protection: if a newer version exists in IndexedDB, preserve its history
  const existingInDb = (await tx.objectStore('vaultNotes').get(note.id)) as
    | VaultNoteRecord
    | undefined;

  let mergedNote = note;
  if (
    existingInDb &&
    existingInDb.updatedAtIso > note.updatedAtIso &&
    existingInDb.content !== note.content
  ) {
    const mergedHistory: NoteVersionEntry[] = [
      {
        id: `${note.id}_v_${existingInDb.version}`,
        noteId: note.id,
        version: existingInDb.version,
        savedAtIso: existingInDb.updatedAtIso,
        contentSnippet: existingInDb.content.slice(0, 140),
        fullContent: existingInDb.content,
      },
      ...(note.history || []),
    ];
    mergedNote = {
      ...note,
      version: Math.max(note.version, existingInDb.version + 1),
      history: mergedHistory.slice(0, 10),
    };
  }

  await tx.objectStore('vaultNotes').put(mergedNote);

  for (const h of mergedNote.history || []) {
    const versionRow: NoteVersionEntry = {
      ...h,
      id: h.id || `${mergedNote.id}_v_${h.version}_${h.savedAtIso}`,
      noteId: mergedNote.id,
    };
    await tx.objectStore('noteVersions').put(versionRow);
  }

  for (const att of mergedNote.attachments || []) {
    await tx.objectStore('attachments').put({
      ...att,
      noteId: mergedNote.id,
      originalFilename: att.originalFilename || att.fileName,
      byteSize: att.byteSize ?? att.sizeBytes,
      sha256: att.sha256 || att.checksum || '',
      createdAt: att.createdAt || att.createdAtIso || mergedNote.createdAtIso,
      updatedAt: new Date().toISOString(),
    });
  }

  await tx.done;
  updateCachedLastSaveTimeIso(mergedNote.updatedAtIso || new Date().toISOString());
  broadcastWorkspaceChange('vaultNotes', mergedNote.id);
  return mergedNote;
}

export async function dbDeleteVaultNote(noteId: string): Promise<void> {
  const db = await getLocalDb();
  await db.delete('vaultNotes', noteId);
  broadcastWorkspaceChange('vaultNotes', noteId);
}

/**
 * Binary Attachment Blob & Metadata operations in `rbi_prep_os_2027`
 */
export async function dbSaveAttachmentBlobAndMeta(
  meta: VaultAttachment,
  blob: Blob
): Promise<void> {
  assertQuotaNotExceeded();
  const db = await getLocalDb();
  const nowIso = new Date().toISOString();
  const blobKey = meta.localBlobId || meta.id;

  const blobRecord: AttachmentBlobRecord = {
    id: blobKey,
    attachmentId: meta.id,
    ownerWorkspaceId: meta.ownerWorkspaceId || meta.ownerUid || 'local_workspace',
    originalFilename: meta.originalFilename || meta.fileName,
    mimeType: meta.mimeType,
    byteSize: blob.size,
    sha256: meta.sha256 || meta.checksum || '',
    blob,
    createdAt: meta.createdAt || meta.createdAtIso || nowIso,
    updatedAt: nowIso,
  };

  const tx = db.transaction(['attachments', 'attachmentBlobs'], 'readwrite');
  await tx.objectStore('attachmentBlobs').put(blobRecord);
  await tx.objectStore('attachments').put({
    ...meta,
    localBlobId: blobKey,
    originalFilename: meta.originalFilename || meta.fileName,
    byteSize: blob.size,
    sizeBytes: blob.size,
    sha256: meta.sha256 || meta.checksum || '',
    updatedAt: nowIso,
    updatedAtIso: nowIso,
  });
  await tx.done;
  broadcastWorkspaceChange('attachments', meta.id);
}

export async function dbGetAttachmentBlob(blobIdOrAttachmentId: string): Promise<Blob | null> {
  const db = await getLocalDb();
  const record = (await db
    .get('attachmentBlobs', blobIdOrAttachmentId)) as AttachmentBlobRecord | undefined;
  if (record?.blob) {
    return record.blob;
  }
  return null;
}

export async function dbGetAttachmentMeta(
  attachmentId: string
): Promise<VaultAttachment | undefined> {
  const db = await getLocalDb();
  return (await db.get('attachments', attachmentId)) as VaultAttachment | undefined;
}

export async function dbGetAllAttachmentsMeta(): Promise<VaultAttachment[]> {
  const db = await getLocalDb();
  return (await db.getAll('attachments')) as VaultAttachment[];
}

export async function dbGetAllAttachmentBlobs(): Promise<AttachmentBlobRecord[]> {
  const db = await getLocalDb();
  return (await db.getAll('attachmentBlobs')) as AttachmentBlobRecord[];
}

export async function dbDeleteAttachmentBlobAndMeta(attachmentId: string): Promise<void> {
  const db = await getLocalDb();
  const tx = db.transaction(['attachments', 'attachmentBlobs'], 'readwrite');
  await tx.objectStore('attachments').delete(attachmentId);
  await tx.objectStore('attachmentBlobs').delete(attachmentId);
  await tx.done;
  broadcastWorkspaceChange('attachments', attachmentId);
}

/**
 * Quiz & Question Bank operations
 */
export async function dbGetOfflineQuizQuestions(subject?: string): Promise<QuizQuestionItem[]> {
  await seedBundledDefaultsIfEmpty();
  const db = await getLocalDb();
  const all = (await db.getAll('quizQuestions')) as QuizQuestionItem[];
  if (!subject || subject === 'All') return all;
  const filtered = all.filter((q) => !q.subject || q.subject === subject);
  return filtered.length > 0 ? filtered : all;
}

export async function dbSaveQuizQuestionsToBank(questions: QuizQuestionItem[]): Promise<void> {
  assertQuotaNotExceeded();
  const db = await getLocalDb();
  const tx = db.transaction('quizQuestions', 'readwrite');
  for (const q of questions) {
    if (q && q.id) {
      await tx.store.put(q);
    }
  }
  await tx.done;
}

export async function dbAtomicSaveQuizAttempt(
  attempt: QuizAttemptRecord,
  updatedTopic?: TopicRecord
): Promise<QuizAttemptRecord> {
  assertQuotaNotExceeded();
  const db = await getLocalDb();
  const tx = db.transaction(['quizAttempts', 'quizResponses', 'topics', 'quizQuestions'], 'readwrite');

  await tx.objectStore('quizAttempts').put(attempt);

  for (let i = 0; i < (attempt.questions || []).length; i++) {
    const q = attempt.questions[i];
    const qId = q.id || `${attempt.id}_q_${i}`;
    const resp: QuizResponseRecord = {
      id: `${attempt.id}_resp_${i}`,
      attemptId: attempt.id,
      questionId: qId,
      subject: attempt.subject,
      selectedOption: q.selectedOption ?? null,
      correctIndex: q.correctIndex,
      isCorrect: q.selectedOption === q.correctIndex,
      isSkipped: Boolean(q.isSkipped),
      mistakeCategory: q.mistakeCategory,
      timeSpentSeconds: q.timeSpentSeconds || 0,
      createdAtIso: attempt.createdAtIso,
    };
    await tx.objectStore('quizResponses').put(resp);
    // Also save question in local offline question bank for future offline practice
    await tx.objectStore('quizQuestions').put({
      ...q,
      id: qId,
      subject: attempt.subject,
      topicTitle: attempt.topicTitle,
    });
  }

  if (updatedTopic) {
    await tx.objectStore('topics').put(updatedTopic);
  }

  await tx.done;
  updateCachedLastSaveTimeIso(attempt.updatedAtIso || new Date().toISOString());
  broadcastWorkspaceChange('quizAttempts', attempt.id);
  return attempt;
}

/**
 * Idempotent Revision scheduling & persistence
 */
export async function dbSaveRevisionItem(rev: RevisionRecord): Promise<RevisionRecord> {
  assertQuotaNotExceeded();
  const db = await getLocalDb();
  const tx = db.transaction('revisionItems', 'readwrite');
  const existingForTopic = (await tx.store
    .index('topicId')
    .getAll(rev.topicId)) as RevisionRecord[];

  const duplicate = existingForTopic.find(
    (r) =>
      r.id !== rev.id &&
      r.status !== 'completed' &&
      r.intervalDays === rev.intervalDays &&
      r.dueDate === rev.dueDate
  );

  if (duplicate) {
    const merged: RevisionRecord = {
      ...duplicate,
      ...rev,
      id: duplicate.id,
      updatedAtIso: new Date().toISOString(),
    };
    await tx.store.put(merged);
    await tx.done;
    broadcastWorkspaceChange('revisionItems', merged.id);
    return merged;
  }

  await tx.store.put(rev);
  await tx.done;
  broadcastWorkspaceChange('revisionItems', rev.id);
  return rev;
}

export async function dbSaveCurrentAffair(
  entry: CurrentAffairRecord
): Promise<CurrentAffairRecord> {
  assertQuotaNotExceeded();
  const db = await getLocalDb();
  await db.put('currentAffairs', entry);
  broadcastWorkspaceChange('currentAffairs', entry.id);
  return entry;
}

export async function dbDeleteCurrentAffair(id: string): Promise<void> {
  const db = await getLocalDb();
  await db.delete('currentAffairs', id);
  broadcastWorkspaceChange('currentAffairs', id);
}

export async function dbSaveAIConversation(
  interaction: AIInteractionRecord
): Promise<AIInteractionRecord> {
  assertQuotaNotExceeded();
  const db = await getLocalDb();
  await db.put('aiConversations', interaction);
  broadcastWorkspaceChange('aiConversations', interaction.id);
  return interaction;
}

/**
 * Sync Operations & Checkpoints
 */
export async function dbQueueSyncOperation(
  op: Omit<SyncOperationRecord, 'id' | 'createdAtIso' | 'updatedAtIso'>
): Promise<SyncOperationRecord> {
  const db = await getLocalDb();
  const nowIso = new Date().toISOString();
  const id = `sync_${op.entityType}_${op.entityId}`;
  const record: SyncOperationRecord = {
    ...op,
    id,
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };
  await db.put('syncOperations', record);
  return record;
}

export async function dbGetPendingSyncOperations(): Promise<SyncOperationRecord[]> {
  const db = await getLocalDb();
  const all = (await db.getAll('syncOperations')) as SyncOperationRecord[];
  return all.filter((op) => op.status === 'queued' || op.status === 'failed');
}

export async function dbUpdateSyncOperationStatus(
  id: string,
  status: SyncOperationRecord['status'],
  lastError?: string
): Promise<void> {
  const db = await getLocalDb();
  const existing = (await db.get('syncOperations', id)) as SyncOperationRecord | undefined;
  if (!existing) return;
  await db.put('syncOperations', {
    ...existing,
    status,
    retryCount: status === 'failed' ? existing.retryCount + 1 : existing.retryCount,
    lastError,
    updatedAtIso: new Date().toISOString(),
  });
}

export async function dbSaveMigrationCheckpoint(
  checkpoint: MigrationCheckpointRow
): Promise<void> {
  const db = await getLocalDb();
  await db.put('migrationCheckpoints', checkpoint);
}

export async function dbGetAllMigrationCheckpoints(): Promise<
  Record<string, MigrationCheckpointRow>
> {
  const db = await getLocalDb();
  const list = (await db.getAll('migrationCheckpoints')) as MigrationCheckpointRow[];
  const map: Record<string, MigrationCheckpointRow> = {};
  for (const item of list) {
    map[item.id] = item;
  }
  return map;
}
