import JSZip from 'jszip';
import {
  dbGetAllAttachmentBlobs,
  dbGetAllAttachmentsMeta,
  dbSaveAttachmentBlobAndMeta,
  getLocalDb,
  LOCAL_DB_VERSION,
  REQUIRED_OBJECT_STORES,
} from '../db/localDb';
import { computeBlobSha256, sanitizeStorageFilename } from '../storage';
import { saveAutoBackupNative } from '../hooks/useElectronAPI';
import {
  ActiveTimerState,
  AIInteractionRecord,
  CurrentAffairRecord,
  QuizAttemptRecord,
  RevisionRecord,
  RoutineTaskRecord,
  StudySessionRecord,
  SubjectCategory,
  TopicRecord,
  UserWorkspacePrefs,
  VaultAttachment,
  VaultNoteRecord,
} from '../types';

export const BACKUP_SCHEMA_VERSION = '5.0-local-first-hybrid';

export interface ZipAttachmentManifestEntry {
  attachmentId: string;
  zipPath: string;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
  noteId?: string;
  sessionId?: string;
}

export interface CompleteBackupManifest {
  app: 'RBI Prep OS 2027';
  schemaVersion: string;
  dbVersion: number;
  backupType: 'METADATA_ONLY_JSON' | 'COMPLETE_ZIP_WITH_BINARIES';
  exportedAtIso: string;
  databaseJsonSha256: string;
  recordCounts: {
    customSubjects: number;
    topics: number;
    sessions: number;
    tasks: number;
    notes: number;
    quizzes: number;
    revisions: number;
    currentAffairs: number;
    aiInteractions: number;
    attachmentMetadataCount: number;
    attachmentBinariesIncluded: number;
  };
  attachments: ZipAttachmentManifestEntry[];
}

export interface WorkspaceDatabaseExportPayload {
  app: 'RBI Prep OS 2027';
  schemaVersion: string;
  dbVersion: number;
  exportedAtIso: string;
  backupClassification: string;
  attachmentBackupNotice: string;
  prefs: UserWorkspacePrefs;
  activeTimer?: ActiveTimerState;
  customSubjects: SubjectCategory[];
  topics: TopicRecord[];
  sessions: StudySessionRecord[];
  tasks: RoutineTaskRecord[];
  notes: VaultNoteRecord[];
  quizzes: QuizAttemptRecord[];
  revisions: RevisionRecord[];
  currentAffairs: CurrentAffairRecord[];
  aiInteractions: AIInteractionRecord[];
  attachmentsMeta: VaultAttachment[];
}

export interface BackupInspectionPreview {
  valid: boolean;
  backupType: 'METADATA_ONLY_JSON' | 'COMPLETE_ZIP_WITH_BINARIES';
  schemaVersion: string;
  exportedAtIso: string;
  checksumVerified: boolean;
  checksumErrors: string[];
  recordCounts: CompleteBackupManifest['recordCounts'];
  duplicateIdsDetected: {
    topics: number;
    sessions: number;
    tasks: number;
    notes: number;
    quizzes: number;
    revisions: number;
    currentAffairs: number;
    attachments: number;
  };
  totalDuplicates: number;
}

export interface RestoreExecutionResult {
  mode: 'merge' | 'replace';
  backupType: 'METADATA_ONLY_JSON' | 'COMPLETE_ZIP_WITH_BINARIES';
  restoredCounts: {
    topics: number;
    sessions: number;
    tasks: number;
    notes: number;
    quizzes: number;
    revisions: number;
    currentAffairs: number;
    aiInteractions: number;
    attachmentBinaries: number;
  };
  skippedDuplicates: number;
  checksumsVerified: number;
}

async function computeStringSha256(text: string): Promise<string> {
  const blob = new Blob([text], { type: 'application/json' });
  return computeBlobSha256(blob);
}

/**
 * Builds the JSON database payload from current workspace state + IndexedDB attachment metadata.
 */
export async function buildWorkspaceDatabasePayload(state?: {
  prefs: UserWorkspacePrefs;
  activeTimer?: ActiveTimerState;
  topics: TopicRecord[];
  sessions: StudySessionRecord[];
  tasks: RoutineTaskRecord[];
  notes: VaultNoteRecord[];
  quizzes: QuizAttemptRecord[];
  revisions: RevisionRecord[];
  currentAffairs: CurrentAffairRecord[];
  aiInteractions: AIInteractionRecord[];
}): Promise<WorkspaceDatabaseExportPayload> {
  let resolvedState = state;
  if (!resolvedState) {
    const db = await getLocalDb();
    const [
      settingsRow,
      timerRow,
      topics,
      sessions,
      tasks,
      notes,
      quizzes,
      revisions,
      currentAffairs,
      aiInteractions,
    ] = await Promise.all([
      db.get('workspaceSettings', 'default_workspace'),
      db.get('workspaceSettings', 'active_timer'),
      db.getAll('topics') as Promise<TopicRecord[]>,
      db.getAll('studySessions') as Promise<StudySessionRecord[]>,
      db.getAll('studyTasks') as Promise<RoutineTaskRecord[]>,
      db.getAll('vaultNotes') as Promise<VaultNoteRecord[]>,
      db.getAll('quizAttempts') as Promise<QuizAttemptRecord[]>,
      db.getAll('revisionItems') as Promise<RevisionRecord[]>,
      db.getAll('currentAffairs') as Promise<CurrentAffairRecord[]>,
      db.getAll('aiConversations') as Promise<AIInteractionRecord[]>,
    ]);
    resolvedState = {
      prefs: settingsRow?.prefs || {
        userId: 'local_user',
        displayName: 'RBI Aspirant',
        dailyGoalMinutes: 180,
        officeStart: '09:30',
        officeEnd: '18:30',
        workDays: [1, 2, 3, 4, 5],
        themeSeed: '#427968',
        themeMode: 'light',
        revisionIntervals: [1, 3, 7, 14, 30],
        customSubjects: [],
        workspaceMode: 'LOCAL_WORKSPACE',
      },
      activeTimer: timerRow?.activeTimer,
      topics,
      sessions,
      tasks,
      notes,
      quizzes,
      revisions,
      currentAffairs,
      aiInteractions,
    };
  }

  const idbAttachmentsMeta = await dbGetAllAttachmentsMeta();
  const noteAttachments = resolvedState.notes.flatMap((n) => n.attachments || []);
  const mergedMetaMap = new Map<string, VaultAttachment>();
  for (const a of idbAttachmentsMeta) mergedMetaMap.set(a.id, a);
  for (const a of noteAttachments) {
    if (!mergedMetaMap.has(a.id)) mergedMetaMap.set(a.id, a);
  }

  return {
    app: 'RBI Prep OS 2027',
    schemaVersion: BACKUP_SCHEMA_VERSION,
    dbVersion: LOCAL_DB_VERSION,
    exportedAtIso: new Date().toISOString(),
    backupClassification:
      'METADATA_ONLY_JSON (Study records + attachment metadata & SHA-256 checksums; use Complete ZIP Backup to include binary screenshot/PDF files)',
    attachmentBackupNotice:
      'This JSON export contains all study records, notes, and attachment metadata/checksums, but does NOT embed binary screenshot/PDF files. Use "Export Complete ZIP Backup (.zip)" to bundle original screenshot and PDF binaries.',
    prefs: resolvedState.prefs,
    activeTimer: resolvedState.activeTimer,
    customSubjects: resolvedState.prefs.customSubjects || [],
    topics: resolvedState.topics,
    sessions: resolvedState.sessions,
    tasks: resolvedState.tasks,
    notes: resolvedState.notes,
    quizzes: resolvedState.quizzes,
    revisions: resolvedState.revisions,
    currentAffairs: resolvedState.currentAffairs,
    aiInteractions: resolvedState.aiInteractions,
    attachmentsMeta: Array.from(mergedMetaMap.values()),
  };
}

/**
 * Exports a Complete ZIP Backup containing:
 * - `workspace_database.json`
 * - `manifest.json` (with SHA-256 checksums for database JSON and every binary attachment)
 * - `attachments/{attachmentId}/{safeFilename}` binary files
 */
export async function createCompleteZipBackup(state?: {
  prefs: UserWorkspacePrefs;
  activeTimer?: ActiveTimerState;
  topics: TopicRecord[];
  sessions: StudySessionRecord[];
  tasks: RoutineTaskRecord[];
  notes: VaultNoteRecord[];
  quizzes: QuizAttemptRecord[];
  revisions: RevisionRecord[];
  currentAffairs: CurrentAffairRecord[];
  aiInteractions: AIInteractionRecord[];
}): Promise<{
  zipBlob: Blob;
  zipUint8Array: Uint8Array;
  manifest: CompleteBackupManifest;
}> {
  const payload = await buildWorkspaceDatabasePayload(state);
  payload.backupClassification =
    'COMPLETE_ZIP_WITH_BINARIES (Includes workspace_database.json, manifest.json, and original screenshot/PDF binaries)';

  const databaseJsonStr = JSON.stringify(payload, null, 2);
  const databaseJsonSha256 = await computeStringSha256(databaseJsonStr);

  const zip = new JSZip();
  zip.file('workspace_database.json', databaseJsonStr);

  const allBlobs = await dbGetAllAttachmentBlobs();
  const manifestAttachments: ZipAttachmentManifestEntry[] = [];

  for (const blobRec of allBlobs) {
    if (!blobRec || !blobRec.blob) continue;
    const attId = blobRec.attachmentId || blobRec.id;
    const safeName = sanitizeStorageFilename(
      blobRec.originalFilename || 'attachment',
      blobRec.mimeType
    );
    const zipPath = `attachments/${attId}/${safeName}`;
    const arrayBuf = await blobRec.blob.arrayBuffer();
    const sha256 =
      blobRec.sha256 || (await computeBlobSha256(blobRec.blob));

    zip.file(zipPath, new Uint8Array(arrayBuf));

    const matchingMeta = payload.attachmentsMeta.find((m) => m.id === attId);
    manifestAttachments.push({
      attachmentId: attId,
      zipPath,
      originalFilename: safeName,
      mimeType: blobRec.mimeType,
      byteSize: blobRec.blob.size,
      sha256,
      noteId: matchingMeta?.noteId,
      sessionId: matchingMeta?.sessionId,
    });
  }

  const manifest: CompleteBackupManifest = {
    app: 'RBI Prep OS 2027',
    schemaVersion: BACKUP_SCHEMA_VERSION,
    dbVersion: LOCAL_DB_VERSION,
    backupType: 'COMPLETE_ZIP_WITH_BINARIES',
    exportedAtIso: payload.exportedAtIso,
    databaseJsonSha256,
    recordCounts: {
      customSubjects: payload.customSubjects.length,
      topics: payload.topics.length,
      sessions: payload.sessions.length,
      tasks: payload.tasks.length,
      notes: payload.notes.length,
      quizzes: payload.quizzes.length,
      revisions: payload.revisions.length,
      currentAffairs: payload.currentAffairs.length,
      aiInteractions: payload.aiInteractions.length,
      attachmentMetadataCount: payload.attachmentsMeta.length,
      attachmentBinariesIncluded: manifestAttachments.length,
    },
    attachments: manifestAttachments,
  };

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  const zipUint8Array = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  const zipBlob = new Blob([zipUint8Array.buffer as ArrayBuffer], { type: 'application/zip' });

  return { zipBlob, zipUint8Array, manifest };
}

/**
 * Inspects and validates either a JSON backup string or a Complete ZIP Backup (Blob / Uint8Array / ArrayBuffer),
 * verifies all SHA-256 checksums, and computes duplicate counts against current IndexedDB records.
 */
export async function inspectBackupInput(
  input: string | Blob | Uint8Array | ArrayBuffer
): Promise<{
  preview: BackupInspectionPreview;
  payload: WorkspaceDatabaseExportPayload;
  extractedBinaries: Array<{
    entry: ZipAttachmentManifestEntry;
    blob: Blob;
  }>;
}> {
  let payload: WorkspaceDatabaseExportPayload;
  let backupType: 'METADATA_ONLY_JSON' | 'COMPLETE_ZIP_WITH_BINARIES' =
    'METADATA_ONLY_JSON';
  const checksumErrors: string[] = [];
  const extractedBinaries: Array<{
    entry: ZipAttachmentManifestEntry;
    blob: Blob;
  }> = [];

  if (typeof input === 'string') {
    const parsed = JSON.parse(input);
    if (!parsed || typeof parsed !== 'object' || parsed.app !== 'RBI Prep OS 2027') {
      throw new Error(
        'Invalid backup format: Expected an RBI Prep OS 2027 JSON or ZIP backup.'
      );
    }
    payload = {
      app: 'RBI Prep OS 2027',
      schemaVersion: parsed.schemaVersion || '3.2',
      dbVersion: parsed.dbVersion || 1,
      exportedAtIso: parsed.exportedAtIso || new Date().toISOString(),
      backupClassification: parsed.backupClassification || 'METADATA_ONLY_JSON',
      attachmentBackupNotice: parsed.attachmentBackupNotice || '',
      prefs: parsed.prefs,
      activeTimer: parsed.activeTimer,
      customSubjects: Array.isArray(parsed.customSubjects)
        ? parsed.customSubjects
        : Array.isArray(parsed.prefs?.customSubjects)
        ? parsed.prefs.customSubjects
        : [],
      topics: Array.isArray(parsed.topics) ? parsed.topics : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      notes: Array.isArray(parsed.notes) ? parsed.notes : [],
      quizzes: Array.isArray(parsed.quizzes) ? parsed.quizzes : [],
      revisions: Array.isArray(parsed.revisions) ? parsed.revisions : [],
      currentAffairs: Array.isArray(parsed.currentAffairs)
        ? parsed.currentAffairs
        : [],
      aiInteractions: Array.isArray(parsed.aiInteractions)
        ? parsed.aiInteractions
        : [],
      attachmentsMeta: Array.isArray(parsed.attachmentsMeta)
        ? parsed.attachmentsMeta
        : [],
    };
  } else {
    backupType = 'COMPLETE_ZIP_WITH_BINARIES';
    const zipData =
      input instanceof Blob ? await input.arrayBuffer() : input;
    const zip = await JSZip.loadAsync(zipData);

    const manifestFile = zip.file('manifest.json');
    const dbJsonFile = zip.file('workspace_database.json');
    if (!manifestFile || !dbJsonFile) {
      throw new Error(
        'Invalid Complete ZIP Backup: Missing manifest.json or workspace_database.json.'
      );
    }

    const manifestText = await manifestFile.async('string');
    const dbJsonText = await dbJsonFile.async('string');
    const manifest = JSON.parse(manifestText) as CompleteBackupManifest;
    payload = JSON.parse(dbJsonText) as WorkspaceDatabaseExportPayload;

    if (!payload || payload.app !== 'RBI Prep OS 2027') {
      throw new Error('Invalid workspace_database.json inside ZIP archive.');
    }

    const actualDbSha = await computeStringSha256(dbJsonText);
    if (manifest.databaseJsonSha256 && actualDbSha !== manifest.databaseJsonSha256) {
      checksumErrors.push(
        `Database JSON checksum mismatch (expected ${manifest.databaseJsonSha256.slice(
          0,
          12
        )}, got ${actualDbSha.slice(0, 12)}).`
      );
    }

    for (const attEntry of manifest.attachments || []) {
      const binFile = zip.file(attEntry.zipPath);
      if (!binFile) {
        checksumErrors.push(
          `Missing binary attachment in ZIP: ${attEntry.zipPath}`
        );
        continue;
      }
      const bytes = await binFile.async('uint8array');
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: attEntry.mimeType });
      const actualSha = await computeBlobSha256(blob);
      if (attEntry.sha256 && actualSha !== attEntry.sha256) {
        checksumErrors.push(
          `Attachment "${attEntry.originalFilename}" SHA-256 mismatch (expected ${attEntry.sha256.slice(
            0,
            12
          )}, got ${actualSha.slice(0, 12)}).`
        );
        continue;
      }
      extractedBinaries.push({ entry: attEntry, blob });
    }
  }

  // Compare against existing IndexedDB records to detect duplicate identifiers
  const db = await getLocalDb();
  const [
    exTopics,
    exSessions,
    exTasks,
    exNotes,
    exQuizzes,
    exRevs,
    exCA,
    exAtts,
  ] = await Promise.all([
    db.getAllKeys('topics') as Promise<string[]>,
    db.getAllKeys('studySessions') as Promise<string[]>,
    db.getAllKeys('studyTasks') as Promise<string[]>,
    db.getAllKeys('vaultNotes') as Promise<string[]>,
    db.getAllKeys('quizAttempts') as Promise<string[]>,
    db.getAllKeys('revisionItems') as Promise<string[]>,
    db.getAllKeys('currentAffairs') as Promise<string[]>,
    db.getAllKeys('attachments') as Promise<string[]>,
  ]);

  const topicSet = new Set(exTopics);
  const sessSet = new Set(exSessions);
  const taskSet = new Set(exTasks);
  const noteSet = new Set(exNotes);
  const quizSet = new Set(exQuizzes);
  const revSet = new Set(exRevs);
  const caSet = new Set(exCA);
  const attSet = new Set(exAtts);

  const duplicateIdsDetected = {
    topics: (payload.topics || []).filter((x) => topicSet.has(x.id)).length,
    sessions: (payload.sessions || []).filter((x) => sessSet.has(x.id)).length,
    tasks: (payload.tasks || []).filter((x) => taskSet.has(x.id)).length,
    notes: (payload.notes || []).filter((x) => noteSet.has(x.id)).length,
    quizzes: (payload.quizzes || []).filter((x) => quizSet.has(x.id)).length,
    revisions: (payload.revisions || []).filter((x) => revSet.has(x.id)).length,
    currentAffairs: (payload.currentAffairs || []).filter((x) => caSet.has(x.id)).length,
    attachments: extractedBinaries.filter((x) => attSet.has(x.entry.attachmentId)).length,
  };

  const totalDuplicates = Object.values(duplicateIdsDetected).reduce(
    (a, b) => a + b,
    0
  );

  const preview: BackupInspectionPreview = {
    valid: checksumErrors.length === 0,
    backupType,
    schemaVersion: payload.schemaVersion || BACKUP_SCHEMA_VERSION,
    exportedAtIso: payload.exportedAtIso,
    checksumVerified: checksumErrors.length === 0,
    checksumErrors,
    recordCounts: {
      customSubjects: (payload.customSubjects || []).length,
      topics: (payload.topics || []).length,
      sessions: (payload.sessions || []).length,
      tasks: (payload.tasks || []).length,
      notes: (payload.notes || []).length,
      quizzes: (payload.quizzes || []).length,
      revisions: (payload.revisions || []).length,
      currentAffairs: (payload.currentAffairs || []).length,
      aiInteractions: (payload.aiInteractions || []).length,
      attachmentMetadataCount: (payload.attachmentsMeta || []).length,
      attachmentBinariesIncluded: extractedBinaries.length,
    },
    duplicateIdsDetected,
    totalDuplicates,
  };

  return { preview, payload, extractedBinaries };
}

/**
 * Restores a validated backup (JSON or Complete ZIP) in either `merge` or `replace` mode
 * with pre-restore staging snapshot rollback so a failed restore can never leave partial corruption.
 */
export async function executeValidatedRestore(
  input: string | Blob | Uint8Array | ArrayBuffer,
  mode: 'merge' | 'replace' = 'merge'
): Promise<RestoreExecutionResult> {
  const { preview, payload, extractedBinaries } = await inspectBackupInput(input);
  if (!preview.valid) {
    throw new Error(
      `Backup integrity check failed: ${preview.checksumErrors.join('; ')}`
    );
  }

  const db = await getLocalDb();

  // Stage full snapshot of current stores for automatic rollback if any error occurs during restore
  const snapshotBeforeRestore: Record<string, unknown[]> = {};
  for (const storeName of REQUIRED_OBJECT_STORES) {
    snapshotBeforeRestore[storeName] = await db.getAll(storeName);
  }

  try {
    let skippedDuplicates = 0;
    const restoredCounts = {
      topics: 0,
      sessions: 0,
      tasks: 0,
      notes: 0,
      quizzes: 0,
      revisions: 0,
      currentAffairs: 0,
      aiInteractions: 0,
      attachmentBinaries: 0,
    };

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
        'attachments',
      ],
      'readwrite'
    );

    if (mode === 'replace') {
      await Promise.all([
        tx.objectStore('topics').clear(),
        tx.objectStore('studyTasks').clear(),
        tx.objectStore('studySessions').clear(),
        tx.objectStore('routineBlocks').clear(),
        tx.objectStore('vaultNotes').clear(),
        tx.objectStore('quizAttempts').clear(),
        tx.objectStore('revisionItems').clear(),
        tx.objectStore('currentAffairs').clear(),
        tx.objectStore('aiConversations').clear(),
        tx.objectStore('attachments').clear(),
      ]);
    }

    if (payload.prefs) {
      await tx.objectStore('workspaceSettings').put({
        id: 'default_workspace',
        prefs: payload.prefs,
        schemaVersion: LOCAL_DB_VERSION,
        updatedAtIso: new Date().toISOString(),
      });
    }

    for (const s of payload.customSubjects || []) {
      if (s && s.id) {
        await tx.objectStore('subjects').put({ ...s, isCustom: true });
      }
    }

    for (const item of payload.topics || []) {
      if (!item?.id) continue;
      if (mode === 'merge' && (await tx.objectStore('topics').get(item.id))) {
        skippedDuplicates++;
      } else {
        await tx.objectStore('topics').put(item);
        restoredCounts.topics++;
      }
    }

    for (const item of payload.sessions || []) {
      if (!item?.id) continue;
      if (mode === 'merge' && (await tx.objectStore('studySessions').get(item.id))) {
        skippedDuplicates++;
      } else {
        await tx.objectStore('studySessions').put(item);
        restoredCounts.sessions++;
      }
    }

    for (const item of payload.tasks || []) {
      if (!item?.id) continue;
      if (mode === 'merge' && (await tx.objectStore('studyTasks').get(item.id))) {
        skippedDuplicates++;
      } else {
        await tx.objectStore('studyTasks').put(item);
        await tx.objectStore('routineBlocks').put(item);
        restoredCounts.tasks++;
      }
    }

    for (const item of payload.notes || []) {
      if (!item?.id) continue;
      if (mode === 'merge' && (await tx.objectStore('vaultNotes').get(item.id))) {
        skippedDuplicates++;
      } else {
        await tx.objectStore('vaultNotes').put(item);
        restoredCounts.notes++;
      }
    }

    for (const item of payload.quizzes || []) {
      if (!item?.id) continue;
      if (mode === 'merge' && (await tx.objectStore('quizAttempts').get(item.id))) {
        skippedDuplicates++;
      } else {
        await tx.objectStore('quizAttempts').put(item);
        restoredCounts.quizzes++;
      }
    }

    for (const item of payload.revisions || []) {
      if (!item?.id) continue;
      if (mode === 'merge' && (await tx.objectStore('revisionItems').get(item.id))) {
        skippedDuplicates++;
      } else {
        await tx.objectStore('revisionItems').put(item);
        restoredCounts.revisions++;
      }
    }

    for (const item of payload.currentAffairs || []) {
      if (!item?.id) continue;
      if (mode === 'merge' && (await tx.objectStore('currentAffairs').get(item.id))) {
        skippedDuplicates++;
      } else {
        await tx.objectStore('currentAffairs').put(item);
        restoredCounts.currentAffairs++;
      }
    }

    for (const item of payload.aiInteractions || []) {
      if (!item?.id) continue;
      if (mode === 'merge' && (await tx.objectStore('aiConversations').get(item.id))) {
        skippedDuplicates++;
      } else {
        await tx.objectStore('aiConversations').put(item);
        restoredCounts.aiInteractions++;
      }
    }

    for (const attMeta of payload.attachmentsMeta || []) {
      if (!attMeta?.id) continue;
      await tx.objectStore('attachments').put({
        ...attMeta,
        localBlobId: attMeta.localBlobId || attMeta.id,
      });
    }

    await tx.done;

    if (mode === 'replace' && extractedBinaries.length > 0) {
      const clearBlobTx = db.transaction('attachmentBlobs', 'readwrite');
      await clearBlobTx.store.clear();
      await clearBlobTx.done;
    }

    // Restore binary attachment Blobs from ZIP archive
    for (const item of extractedBinaries) {
      const matchingMeta = (payload.attachmentsMeta || []).find(
        (m) => m.id === item.entry.attachmentId
      );
      const nowIso = new Date().toISOString();
      await dbSaveAttachmentBlobAndMeta(
        {
          id: item.entry.attachmentId,
          ownerWorkspaceId: matchingMeta?.ownerWorkspaceId || 'local_workspace',
          ownerUid: matchingMeta?.ownerUid || 'local_user',
          noteId: item.entry.noteId || matchingMeta?.noteId,
          sessionId: item.entry.sessionId || matchingMeta?.sessionId,
          originalFilename: item.entry.originalFilename,
          fileName: item.entry.originalFilename,
          mimeType: item.entry.mimeType,
          byteSize: item.entry.byteSize,
          sizeBytes: item.entry.byteSize,
          sha256: item.entry.sha256,
          checksum: item.entry.sha256,
          localBlobId: item.entry.attachmentId,
          uploadStatus: matchingMeta?.storagePath ? 'uploaded' : 'local_stored',
          storagePath: matchingMeta?.storagePath,
          cloudStoragePath: matchingMeta?.cloudStoragePath || matchingMeta?.storagePath,
          createdAt: matchingMeta?.createdAt || nowIso,
          updatedAt: nowIso,
          createdAtIso: matchingMeta?.createdAtIso || nowIso,
          updatedAtIso: nowIso,
        },
        item.blob
      );
      restoredCounts.attachmentBinaries++;
    }

    return {
      mode,
      backupType: preview.backupType,
      restoredCounts,
      skippedDuplicates,
      checksumsVerified: extractedBinaries.length,
    };
  } catch (err) {
    // Rollback to snapshotBeforeRestore if anything failed mid-restore
    try {
      const rbTx = db.transaction(REQUIRED_OBJECT_STORES, 'readwrite');
      for (const storeName of REQUIRED_OBJECT_STORES) {
        const st = rbTx.objectStore(storeName);
        await st.clear();
        for (const row of snapshotBeforeRestore[storeName] || []) {
          await st.put(row);
        }
      }
      await rbTx.done;
    } catch (rbErr) {
      console.error('[BackupRestore] Rollback error:', rbErr);
    }
    throw err;
  }
}

/**
 * Phase 5: Automatic Local Backup Trigger
 * Generates a timestamped JSON backup, validates schema, and saves to userData/backups with rotation.
 * Ensures backup failures CANNOT corrupt the primary database.
 */
export async function triggerAutoBackup(maxBackups = 7): Promise<{
  success: boolean;
  filePath?: string;
  error?: string;
}> {
  try {
    const payload = await buildWorkspaceDatabasePayload();
    const jsonString = JSON.stringify(payload, null, 2);
    const dateTag = new Date().toISOString().slice(0, 10);
    const filename = `rbi_prep_autobackup_${dateTag}_${Date.now()}.json`;

    const res = await saveAutoBackupNative(filename, jsonString, maxBackups);
    return res;
  } catch (err) {
    console.warn('[AutoBackup] Non-fatal auto backup warning:', err);
    return { success: false, error: String(err) };
  }
}
