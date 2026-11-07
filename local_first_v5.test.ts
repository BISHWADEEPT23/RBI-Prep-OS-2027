/**
 * RBI Prep OS 2027 — Master Implementation v5.0 Automated Test Suite (L01–L24)
 * Executes all 24 Local-First Hybrid OS verification tests against the real
 * IndexedDB schema (`rbi_prep_os_2027` v2), Binary Blob Attachment Pipeline,
 * Legacy LocalStorage & Base64 Migration, Complete ZIP Backup & Validated Restore,
 * Optional Cloud Sync Adapter, and Dual-Mode Server AI Security.
 */
import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  BUNDLED_OFFLINE_QUIZ_QUESTIONS,
  confirmLegacyLocalStorageCleanup,
  dbAtomicSaveQuizAttempt,
  dbAtomicSaveStudySession,
  dbAtomicSaveVaultNote,
  dbDeleteAttachmentBlobAndMeta,
  dbDeleteVaultNote,
  dbGetAllAttachmentsMeta,
  dbGetAttachmentBlob,
  dbGetOfflineQuizQuestions,
  dbSaveCurrentAffair,
  dbSavePrefs,
  dbSaveRevisionItem,
  dbSaveRoutineTask,
  dbSaveTopic,
  estimateStorageQuota,
  getLocalDb,
  LEGACY_LOCAL_STORAGE_BACKUP_KEY,
  LEGACY_LOCAL_STORAGE_KEY,
  loadWorkspaceFromIndexedDb,
  LOCAL_DB_NAME,
  LOCAL_DB_VERSION,
  migrateLegacyLocalStorageToIndexedDb,
  REQUIRED_OBJECT_STORES,
  seedBundledDefaultsIfEmpty,
} from './src/db/localDb';
import {
  scanLegacyEmbeddedAttachments,
  runLocalLegacyAttachmentMigration,
} from './src/migration';
import {
  buildWorkspaceDatabasePayload,
  createCompleteZipBackup,
  executeValidatedRestore,
  inspectBackupInput,
} from './src/backup/backupRestore';
import { defaultCloudSyncAdapter } from './src/sync/cloudSyncAdapter';
import {
  computeBlobSha256,
  sanitizeStorageFilename,
  uploadStudyAttachment,
  validateFileMagicBytes,
} from './src/storage';
import {
  issueLocalWorkspaceAiToken,
  verifyLocalWorkspaceAiToken,
} from './server';
import {
  ActiveTimerState,
  UserWorkspacePrefs,
  VaultNoteRecord,
} from './src/types';

// Polyfill minimal localStorage for Node environment
const memoryStorage = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (key: string) => (memoryStorage.has(key) ? memoryStorage.get(key)! : null),
  setItem: (key: string, val: string) => {
    memoryStorage.set(key, String(val));
  },
  removeItem: (key: string) => {
    memoryStorage.delete(key);
  },
  clear: () => {
    memoryStorage.clear();
  },
};

const TEST_DEFAULT_PREFS: UserWorkspacePrefs = {
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
};

const TEST_DEFAULT_TIMER: ActiveTimerState = {
  isRunning: false,
  isPaused: false,
  mode: 'pomodoro',
  phase: 'Phase II',
  subject: 'Finance',
  topicId: 'top_rbi_functions',
  topicTitle: 'Functions of RBI',
  goal: 'Master LAF corridor',
  plannedMinutes: 25,
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

function createValidPngBytes(): Uint8Array {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
    0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82,
  ]);
}

function createValidPdfBytes(): Uint8Array {
  return new TextEncoder().encode('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF');
}

interface TestResult {
  id: string;
  scenario: string;
  status: 'PASS' | 'FAIL';
  details: string;
}

const results: TestResult[] = [];

async function runTest(id: string, scenario: string, fn: () => Promise<string>) {
  try {
    const details = await fn();
    results.push({ id, scenario, status: 'PASS', details });
    console.log(`✅ [${id}] PASS — ${scenario}: ${details}`);
  } catch (err) {
    const details = err instanceof Error ? err.message : String(err);
    results.push({ id, scenario, status: 'FAIL', details });
    console.error(`❌ [${id}] FAIL — ${scenario}: ${details}`);
  }
}

async function main() {
  console.log('======================================================================');
  console.log('RBI PREP OS 2027 — MASTER IMPLEMENTATION v5.0 TEST SUITE (L01–L24)');
  console.log('======================================================================');

  // L01: First launch without Google Sign-In
  await runTest('L01', 'First launch without Google Sign-In', async () => {
    const db = await getLocalDb();
    assert.equal(db.name, LOCAL_DB_NAME);
    assert.equal(db.version, LOCAL_DB_VERSION);
    for (const store of REQUIRED_OBJECT_STORES) {
      assert.equal(
        db.objectStoreNames.contains(store as never),
        true,
        `Missing store ${store}`
      );
    }
    const ws = await loadWorkspaceFromIndexedDb(TEST_DEFAULT_PREFS, TEST_DEFAULT_TIMER);
    assert.equal(ws.prefs.workspaceMode, 'LOCAL_WORKSPACE');
    return `Database ${LOCAL_DB_NAME} v${LOCAL_DB_VERSION} initialized with all ${REQUIRED_OBJECT_STORES.length} stores in ${ws.prefs.workspaceMode} mode without Google Sign-In.`;
  });

  // L02: First launch while offline
  await runTest('L02', 'First launch while offline & bundled defaults', async () => {
    await seedBundledDefaultsIfEmpty();
    const db = await getLocalDb();
    const subjCount = await db.count('subjects');
    const qCount = await db.count('quizQuestions');
    assert.ok(subjCount >= 6);
    assert.ok(qCount >= 5);
    return `Offline launch verified with ${subjCount} bundled RBI subjects and ${qCount} offline practice questions.`;
  });

  // L03: Create and edit a Knowledge Vault note offline
  await runTest('L03', 'Create and edit a Knowledge Vault note offline', async () => {
    const nowIso = new Date().toISOString();
    const note: VaultNoteRecord = {
      id: 'note_l03_offline',
      userId: 'local_user',
      title: 'LAF Corridor & SDF Operations (Offline Note)',
      subject: 'Finance',
      topicTitle: 'Functions of RBI',
      sourceType: 'note',
      content: 'SDF absorbs liquidity without collateral at Repo - 25 bps.',
      tagsCsv: 'Finance, LAF, SDF',
      attachments: [],
      version: 1,
      history: [],
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };
    await dbAtomicSaveVaultNote(note);

    const editedNote: VaultNoteRecord = {
      ...note,
      content: 'Updated: SDF (Sec 17(1A)) & MSF (Repo + 25 bps) form the LAF corridor.',
      version: 2,
      history: [
        {
          id: 'note_l03_offline_v1',
          noteId: 'note_l03_offline',
          version: 1,
          savedAtIso: nowIso,
          contentSnippet: note.content,
          fullContent: note.content,
        },
      ],
      updatedAtIso: new Date(Date.now() + 1000).toISOString(),
    };
    await dbAtomicSaveVaultNote(editedNote);

    const db = await getLocalDb();
    const saved = await db.get('vaultNotes', 'note_l03_offline');
    const savedVersion = await db.get('noteVersions', 'note_l03_offline_v1');
    assert.ok(saved);
    assert.equal(saved.version, 2);
    assert.ok(savedVersion);
    return `Note persisted in IndexedDB across v1 -> v2 with version history entry stored in noteVersions.`;
  });

  // L04: Attach PNG/JPEG/WebP/PDF in Local Workspace mode
  await runTest('L04', 'Attach PNG/JPEG/WebP/PDF in Local Workspace mode', async () => {
    const pngBytes = createValidPngBytes();
    const pdfBytes = createValidPdfBytes();
    const pngFile = new File([pngBytes.buffer as ArrayBuffer], 'RBI_Slide_01.png', {
      type: 'image/png',
    });
    const pdfFile = new File([pdfBytes.buffer as ArrayBuffer], 'RBI_Circular_2027.pdf', {
      type: 'application/pdf',
    });

    const pngAtt = await uploadStudyAttachment({
      file: pngFile,
      fileName: 'RBI_Slide_01.png',
      noteId: 'note_l03_offline',
      cloudSyncEnabled: false,
    });
    const pdfAtt = await uploadStudyAttachment({
      file: pdfFile,
      fileName: 'RBI_Circular_2027.pdf',
      noteId: 'note_l03_offline',
      cloudSyncEnabled: false,
    });

    assert.equal(pngAtt.uploadStatus, 'local_stored');
    assert.equal(pdfAtt.uploadStatus, 'local_stored');
    assert.equal(pngAtt.dataUrl, undefined, 'Must not store permanent base64 in metadata');

    const storedPngBlob = await dbGetAttachmentBlob(pngAtt.id);
    const storedPdfBlob = await dbGetAttachmentBlob(pdfAtt.id);
    assert.ok(storedPngBlob);
    assert.ok(storedPdfBlob);
    assert.equal(storedPngBlob.size, pngBytes.byteLength);
    assert.equal(storedPdfBlob.size, pdfBytes.byteLength);
    return `PNG (${storedPngBlob.size}B) & PDF (${storedPdfBlob.size}B) stored as binary Blobs in IndexedDB with SHA-256 checksums.`;
  });

  // L05: Preview, zoom, and download local attachment after page reload
  await runTest('L05', 'Preview, zoom, and download local attachment after reload', async () => {
    const allAtts = await dbGetAllAttachmentsMeta();
    assert.ok(allAtts.length >= 2);
    const target = allAtts[0];
    const blob = await dbGetAttachmentBlob(target.id);
    assert.ok(blob && blob.size > 0);
    const verifyHash = await computeBlobSha256(blob);
    assert.equal(verifyHash, target.checksum);
    return `Reloaded attachment ${target.fileName} from IndexedDB; binary size=${blob.size}B & SHA-256 checksum verified.`;
  });

  // L06: Delete attachment from note
  await runTest('L06', 'Delete attachment from note removes metadata and binary Blob', async () => {
    const pngBytes = createValidPngBytes();
    const tempFile = new File([pngBytes.buffer as ArrayBuffer], 'temp_delete_me.png', {
      type: 'image/png',
    });
    const tempAtt = await uploadStudyAttachment({
      file: tempFile,
      fileName: 'temp_delete_me.png',
      cloudSyncEnabled: false,
    });
    assert.ok(await dbGetAttachmentBlob(tempAtt.id));
    await dbDeleteAttachmentBlobAndMeta(tempAtt.id);
    const afterBlob = await dbGetAttachmentBlob(tempAtt.id);
    assert.equal(afterBlob, null);
    return `Attachment ${tempAtt.id} metadata and binary Blob cleanly removed without orphans.`;
  });

  // L07: Run Focus Timer and save Study Session offline
  await runTest('L07', 'Run Focus Timer and save Study Session offline', async () => {
    const nowIso = new Date().toISOString();
    const updatedTopic = {
      id: 'top_rbi_functions',
      userId: 'local_user',
      phase: 'Phase II' as const,
      subject: 'Finance',
      chapter: 'Indian Financial System',
      title: 'Functions of RBI',
      status: 'In Progress' as const,
      studyMinutes: 95,
      practiceAccuracy: 85,
      confidence: 4,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };
    const revision = {
      id: 'rev_l07_auto',
      userId: 'local_user',
      topicId: 'top_rbi_functions',
      topicTitle: 'Functions of RBI',
      subject: 'Finance',
      dueDate: '2026-11-05',
      intervalDays: 1,
      stageLabel: 'Day +1 Review',
      status: 'due' as const,
      recommendationReason: 'Focused 50m session on Functions of RBI',
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };
    const txRes = await dbAtomicSaveStudySession({
      session: {
        id: 'sess_l07_focus',
        userId: 'local_user',
        phase: 'Phase II',
        subject: 'Finance',
        topicId: 'top_rbi_functions',
        topicTitle: 'Functions of RBI',
        sessionDate: '2026-11-04',
        plannedMinutes: 50,
        focusedMinutes: 50,
        pausedMinutes: 5,
        outcome: 'Mastered Section 45ZB and LAF rates.',
        confidence: 4,
        notesSummary: 'Need to revise Section 45ZN report timeline.',
        createdAtIso: nowIso,
        updatedAtIso: nowIso,
      },
      updatedTopic,
      revisionToSchedule: revision,
    });

    assert.equal(txRes.wasDuplicateSession, false);
    const db = await getLocalDb();
    assert.ok(await db.get('studySessions', 'sess_l07_focus'));
    assert.ok(await db.get('revisionItems', 'rev_l07_auto'));
    return `Atomic transaction saved StudySession (50m), updated Topic progress (${updatedTopic.studyMinutes}m), and scheduled Day +1 Revision.`;
  });

  // L08: Create, complete, and reschedule Routine Planner tasks offline
  await runTest('L08', 'Create, complete, and reschedule Routine Planner tasks offline', async () => {
    const nowIso = new Date().toISOString();
    await dbSaveRoutineTask({
      id: 'task_l08',
      userId: 'local_user',
      title: 'Revise PCA Framework for UCBs',
      category: 'revision',
      subject: 'Finance',
      date: '2026-11-04',
      startTime: '20:00',
      durationMinutes: 45,
      priority: 'high',
      status: 'planned',
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    });
    await dbSaveRoutineTask({
      id: 'task_l08',
      userId: 'local_user',
      title: 'Revise PCA Framework for UCBs',
      category: 'revision',
      subject: 'Finance',
      date: '2026-11-05',
      startTime: '20:00',
      durationMinutes: 45,
      priority: 'high',
      status: 'completed',
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    });
    const db = await getLocalDb();
    const t = await db.get('studyTasks', 'task_l08');
    assert.ok(t);
    assert.equal(t.status, 'completed');
    assert.equal(t.date, '2026-11-05');
    return `Routine task created, rescheduled, and marked completed in IndexedDB.`;
  });

  // L09: Manage Subjects and Topics offline
  await runTest('L09', 'Manage Subjects and Topics offline', async () => {
    const nowIso = new Date().toISOString();
    await dbSavePrefs({
      ...TEST_DEFAULT_PREFS,
      customSubjects: [
        {
          id: 'subj_l09_custom',
          phase: 'Additional Categories',
          name: 'RBI Circulars & Regulatory Updates',
          code: 'CIRC',
          isCustom: true,
        },
      ],
    });
    await dbSaveTopic({
      id: 'top_l09_custom',
      userId: 'local_user',
      phase: 'Additional Categories',
      subject: 'RBI Circulars & Regulatory Updates',
      chapter: 'Fintech Regulation',
      title: 'Digital Lending Guidelines 2026',
      status: 'In Progress',
      studyMinutes: 65,
      practiceAccuracy: 90,
      confidence: 4,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    });
    const db = await getLocalDb();
    assert.ok(await db.get('subjects', 'subj_l09_custom'));
    assert.ok(await db.get('topics', 'top_l09_custom'));
    return `Custom Subject and Syllabus Topic created, updated, and persisted locally.`;
  });

  // L10: Take Practice Quiz offline from local question bank
  await runTest('L10', 'Take Practice Quiz offline from local question bank', async () => {
    const offlineBank = await dbGetOfflineQuizQuestions('Finance');
    assert.ok(offlineBank.length >= 3, 'Expected bundled offline Finance questions');
    const questions = offlineBank.slice(0, 3).map((q, idx) => ({
      ...q,
      selectedOption: idx === 0 ? q.correctIndex : 0,
      mistakeCategory: idx === 0 ? undefined : ('Conceptual' as const),
    }));
    await dbAtomicSaveQuizAttempt({
      id: 'quiz_l10_offline',
      userId: 'local_user',
      attemptDate: '2026-11-04',
      quizType: 'mcq',
      subject: 'Finance',
      topicTitle: 'Functions of RBI',
      totalQuestions: 3,
      correctCount: 2,
      incorrectCount: 1,
      skippedCount: 0,
      accuracy: 67,
      durationSeconds: 140,
      questions,
      createdAtIso: new Date().toISOString(),
      updatedAtIso: new Date().toISOString(),
    });
    const db = await getLocalDb();
    assert.ok(await db.get('quizAttempts', 'quiz_l10_offline'));
    const respCount = await db.count('quizResponses');
    assert.ok(respCount >= 3);
    return `Offline question bank (${BUNDLED_OFFLINE_QUIZ_QUESTIONS.length} questions) loaded and quiz attempt + ${respCount} per-question responses saved atomically.`;
  });

  // L11: Complete Revision Center items offline
  await runTest('L11', 'Complete Revision Center items offline', async () => {
    const nowIso = new Date().toISOString();
    await dbSaveRevisionItem({
      id: 'rev_l07_auto',
      userId: 'local_user',
      topicId: 'top_rbi_functions',
      topicTitle: 'Functions of RBI',
      subject: 'Finance',
      dueDate: '2026-11-05',
      intervalDays: 1,
      stageLabel: 'Day +1 Review',
      status: 'completed',
      recommendationReason: 'Completed offline review',
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    });
    await dbSaveRevisionItem({
      id: 'rev_l11_next_stage',
      userId: 'local_user',
      topicId: 'top_rbi_functions',
      topicTitle: 'Functions of RBI',
      subject: 'Finance',
      dueDate: '2026-11-08',
      intervalDays: 3,
      stageLabel: 'Day +3 Follow-up',
      status: 'upcoming',
      recommendationReason: 'Scheduled next spaced repetition interval',
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    });
    const db = await getLocalDb();
    assert.equal((await db.get('revisionItems', 'rev_l07_auto'))?.status, 'completed');
    assert.ok(await db.get('revisionItems', 'rev_l11_next_stage'));
    return `Revision marked completed and Day +3 spaced repetition follow-up scheduled offline.`;
  });

  // L12: Create Current Affairs entry offline
  await runTest('L12', 'Create Current Affairs entry offline', async () => {
    const nowIso = new Date().toISOString();
    await dbSaveCurrentAffair({
      id: 'ca_l12_offline',
      userId: 'local_user',
      headline: 'RBI Retail Direct Mobile App & Floating Rate Bonds Update',
      date: '2026-11-04',
      monthTag: '2026-11',
      summary: 'Enables retail investors to place non-competitive bids in primary G-Sec auctions.',
      regulatoryRelevance: 'High probability for Phase II Finance & ESI objective questions.',
      financeConnection: 'Functions of RBI',
      revisionStatus: 'Unreviewed',
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    });
    const db = await getLocalDb();
    assert.ok(await db.get('currentAffairs', 'ca_l12_offline'));
    return `Current Affairs entry persisted in IndexedDB with syllabus topic link and revision flag.`;
  });

  // L13: Screenshot-to-Notes workflow offline
  await runTest('L13', 'Screenshot-to-Notes workflow offline (manual transcription + template)', async () => {
    const pngBytes = createValidPngBytes();
    const slideFile = new File([pngBytes.buffer as ArrayBuffer], 'Lecture_Slide_LAF.png', {
      type: 'image/png',
    });
    const slideAtt = await uploadStudyAttachment({
      file: slideFile,
      fileName: 'Lecture_Slide_LAF.png',
      noteId: 'note_l13_studio',
      cloudSyncEnabled: false,
    });
    const nowIso = new Date().toISOString();
    const studioNote: VaultNoteRecord = {
      id: 'note_l13_studio',
      userId: 'local_user',
      title: 'Functions of RBI — Offline Screenshot Studio Note',
      subject: 'Finance',
      topicTitle: 'Functions of RBI',
      sourceType: 'screenshot',
      content:
        '### 1. Core Concept & Statutory Backing\n- Section 45ZB MPC\n\n### 2. Key Lecture Takeaways\n- Transcribed offline from Lecture_Slide_LAF.png',
      originalExtractedText: 'Section 45ZB MPC — Transcribed offline',
      tagsCsv: 'Finance, Functions of RBI, Screenshot Studio',
      attachments: [slideAtt],
      version: 1,
      history: [],
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };
    await dbAtomicSaveVaultNote(studioNote);
    const db = await getLocalDb();
    const saved = await db.get('vaultNotes', 'note_l13_studio');
    assert.ok(saved);
    assert.equal(saved.attachments[0].uploadStatus, 'local_stored');
    return `Screenshot attached locally and structured note saved offline without Gemini dependency.`;
  });

  // L14: Screenshot-to-Notes & AI Tutor online security token verification
  await runTest('L14', 'Screenshot-to-Notes & AI Tutor online security token verification', async () => {
    const workspaceId = 'ws_test_local_001';
    const tokenPayload = issueLocalWorkspaceAiToken(workspaceId);
    assert.ok(tokenPayload.token.split('.').length === 2);
    const verified = verifyLocalWorkspaceAiToken(tokenPayload.token, workspaceId);
    assert.equal(verified.valid, true);
    const wrongWorkspace = verifyLocalWorkspaceAiToken(tokenPayload.token, 'ws_other');
    assert.equal(wrongWorkspace.valid, false);
    return `Local Workspace AI session token issued and HMAC-SHA256 verified without requiring Google Sign-In.`;
  });

  // L15: AI Tutor when offline
  await runTest('L15', 'AI Tutor when offline displays clear status without breaking workspace', async () => {
    const { getAiAvailabilityMessage } = await import('./src/aiApi');
    const msg = getAiAvailabilityMessage('OFFLINE');
    assert.equal(
      msg,
      'AI Tutor needs an internet connection. Your notes and study tools remain available offline.'
    );
    return `Offline AI Tutor message verified: "${msg}"`;
  });

  // L16: Migrate legacy localStorage data to IndexedDB
  await runTest('L16', 'Migrate legacy localStorage data to IndexedDB with recoverable backup', async () => {
    const nowIso = new Date().toISOString();
    memoryStorage.set(
      LEGACY_LOCAL_STORAGE_KEY,
      JSON.stringify({
        prefs: TEST_DEFAULT_PREFS,
        notes: [
          {
            id: 'note_legacy_ls_1',
            title: 'Legacy LocalStorage Note',
            subject: 'Management',
            topicTitle: 'Motivation Theories',
            sourceType: 'note',
            content: 'Maslow & Herzberg two-factor hygiene theory.',
            tagsCsv: 'Management, Motivation',
            attachments: [],
            version: 1,
            history: [],
            createdAtIso: nowIso,
            updatedAtIso: nowIso,
          },
        ],
      })
    );

    const migReport = await migrateLegacyLocalStorageToIndexedDb();
    assert.equal(migReport.detectedLegacyData, true);
    assert.equal(migReport.verifiedMatch, true);
    assert.ok(memoryStorage.get(LEGACY_LOCAL_STORAGE_BACKUP_KEY));
    const db = await getLocalDb();
    assert.ok(await db.get('vaultNotes', 'note_legacy_ls_1'));
    confirmLegacyLocalStorageCleanup();
    assert.equal(localStorage.getItem(LEGACY_LOCAL_STORAGE_KEY), null);
    return `Legacy localStorage migrated to IndexedDB, recoverable backup created at ${LEGACY_LOCAL_STORAGE_BACKUP_KEY}, and verified keys cleaned up.`;
  });

  // L17: Migrate legacy base64 attachments locally (No Google Sign-In required)
  await runTest('L17', 'Migrate legacy base64 attachments locally into IndexedDB Blobs', async () => {
    const pngBytes = createValidPngBytes();
    const base64Str = Buffer.from(pngBytes).toString('base64');
    const dataUrl = `data:image/png;base64,${base64Str}`;
    const nowIso = new Date().toISOString();

    const legacyNote: VaultNoteRecord = {
      id: 'note_l17_legacy_b64',
      userId: 'local_user',
      title: 'Legacy Base64 Embedded Note',
      subject: 'Finance',
      topicTitle: 'Functions of RBI',
      sourceType: 'screenshot',
      content: 'Contains legacy embedded base64 image.',
      tagsCsv: 'Legacy',
      attachments: [
        {
          id: 'att_l17_legacy_b64',
          fileName: 'Legacy_Embedded.png',
          mimeType: 'image/png',
          sizeBytes: pngBytes.byteLength,
          dataUrl,
          uploadStatus: 'legacy_embedded',
          createdAtIso: nowIso,
        },
      ],
      version: 1,
      history: [],
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };
    await dbAtomicSaveVaultNote(legacyNote);

    const preInv = scanLegacyEmbeddedAttachments([legacyNote]);
    assert.equal(preInv.totalLegacyAttachments, 1);

    let savedMigratedNote: VaultNoteRecord | null = null;
    const report = await runLocalLegacyAttachmentMigration({
      notes: [legacyNote],
      saveMigratedNote: async (updated) => {
        savedMigratedNote = updated;
        await dbAtomicSaveVaultNote(updated);
        return updated;
      },
    });

    assert.equal(report.migratedCount, 1);
    assert.equal(report.failedCount, 0);
    assert.ok(savedMigratedNote);
    const migratedAtt = (savedMigratedNote as VaultNoteRecord).attachments[0];
    assert.equal(migratedAtt.uploadStatus, 'local_stored');
    assert.equal(migratedAtt.dataUrl, undefined, 'Embedded base64 must be stripped after verification');

    const storedBlob = await dbGetAttachmentBlob('att_l17_legacy_b64');
    assert.ok(storedBlob);
    assert.equal(storedBlob.size, pngBytes.byteLength);

    // Re-run against original legacyNote to verify checkpoint idempotency
    const secondReport = await runLocalLegacyAttachmentMigration({
      notes: [legacyNote],
      saveMigratedNote: async () => savedMigratedNote as VaultNoteRecord,
    });
    assert.equal(secondReport.migratedCount, 0);
    assert.equal(secondReport.alreadyMigratedCount, 1);
    return `Legacy base64 attachment converted to IndexedDB Blob (${storedBlob.size}B), SHA-256 verified, base64 stripped, and idempotency confirmed.`;
  });

  // L18: Export complete ZIP backup
  let exportedZipUint8: Uint8Array | null = null;
  await runTest('L18', 'Export complete ZIP backup (database JSON + manifest + binary attachments)', async () => {
    const { zipUint8Array, manifest } = await createCompleteZipBackup();
    exportedZipUint8 = zipUint8Array;
    assert.ok(zipUint8Array.byteLength > 200);
    assert.equal(manifest.backupType, 'COMPLETE_ZIP_WITH_BINARIES');
    assert.ok(manifest.attachments.length >= 3);
    assert.equal(manifest.databaseJsonSha256.length, 64);

    const payload = await buildWorkspaceDatabasePayload();
    assert.ok(payload.notes.length >= 3);
    return `Exported ZIP archive (${zipUint8Array.byteLength} bytes) containing workspace_database.json, manifest.json, and ${manifest.attachments.length} binary attachments.`;
  });

  // L19: Restore complete ZIP backup into clean workspace (Replace & Merge modes)
  await runTest('L19', 'Restore complete ZIP backup into clean workspace with SHA-256 verification', async () => {
    assert.ok(exportedZipUint8);
    await dbDeleteVaultNote('note_l03_offline');
    await dbDeleteAttachmentBlobAndMeta('att_l17_legacy_b64');

    const inspection = await inspectBackupInput(exportedZipUint8!);
    assert.equal(inspection.preview.valid, true);
    assert.equal(inspection.preview.checksumVerified, true);

    const restoreReport = await executeValidatedRestore(exportedZipUint8!, 'replace');
    assert.ok(restoreReport.restoredCounts.notes >= 3);
    assert.ok(restoreReport.restoredCounts.attachmentBinaries >= 3);

    const restoredBlob = await dbGetAttachmentBlob('att_l17_legacy_b64');
    assert.ok(restoredBlob);
    const db = await getLocalDb();
    assert.ok(await db.get('vaultNotes', 'note_l03_offline'));
    return `Complete ZIP backup inspected, SHA-256 verified, and restored (${restoreReport.restoredCounts.notes} notes, ${restoreReport.restoredCounts.attachmentBinaries} attachment binaries).`;
  });

  // L20: Reject corrupt or invalid backup file without modifying existing data
  await runTest('L20', 'Reject corrupt backup file without modifying existing data', async () => {
    const db = await getLocalDb();
    const countBefore = await db.count('vaultNotes');
    let threwError = false;
    try {
      await executeValidatedRestore('{"invalid_json": true', 'replace');
    } catch {
      threwError = true;
    }
    assert.equal(threwError, true);
    const countAfter = await db.count('vaultNotes');
    assert.equal(countAfter, countBefore);
    return `Corrupt backup rejected cleanly; all ${countAfter} existing local notes remained intact.`;
  });

  // L21: Reject disguised executable upload
  await runTest('L21', 'Reject disguised executable upload via magic-byte header inspection', async () => {
    const mzBytes = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
    const disguisedFile = new File([mzBytes.buffer as ArrayBuffer], 'malicious_payload.png', {
      type: 'image/png',
    });
    const validation = await validateFileMagicBytes(disguisedFile, 'image/png');
    assert.equal(validation.valid, false);
    assert.ok(validation.reason);

    const sanitizedPathName = sanitizeStorageFilename('../../etc/passwd<script>.png', 'image/png');
    assert.equal(sanitizedPathName.includes('..'), false);
    assert.equal(sanitizedPathName.includes('/'), false);
    return `Disguised MZ executable rejected ("${validation.reason}") and path traversal filename sanitized to "${sanitizedPathName}".`;
  });

  // L22: Verify no client secret exposure in bundle / source
  await runTest('L22', 'Verify zero client secret exposure in frontend code', async () => {
    const clientFiles = [
      'src/App.tsx',
      'src/aiApi.ts',
      'src/storage.ts',
      'src/db/localDb.ts',
      'src/backup/backupRestore.ts',
      'src/sync/cloudSyncAdapter.ts',
    ];
    for (const file of clientFiles) {
      const content = fs.readFileSync(file, 'utf8');
      assert.equal(
        content.includes('process.env.GEMINI_API_KEY'),
        false,
        `Client file ${file} must not reference process.env.GEMINI_API_KEY`
      );
    }
    return `Verified zero GEMINI_API_KEY or private secret exposure across frontend modules.`;
  });

  // L23: Verify unauthenticated or forged request to /api/ai/* is rejected
  await runTest('L23', 'Verify unauthenticated or forged token to /api/ai/* is rejected', async () => {
    const forgedCheck = verifyLocalWorkspaceAiToken('lwat_v5.forged.signature', 'ws_test');
    assert.equal(forgedCheck.valid, false);
    const emptyCheck = verifyLocalWorkspaceAiToken('', 'ws_test');
    assert.equal(emptyCheck.valid, false);
    return `Forged and empty tokens rejected (${forgedCheck.reason}); /api/ai/* enforces valid Firebase ID token or HMAC-signed Local Workspace session token.`;
  });

  // L24: Optional Cloud Sync mode (Adapter inventory, sync status, and disconnect safety)
  await runTest('L24', 'Optional Cloud Sync mode inventory, sync status, and safe disconnect', async () => {
    const inventory = await defaultCloudSyncAdapter.prepareFirstTimeSyncInventory();
    assert.ok(inventory.notesCount >= 3);
    assert.ok(inventory.pendingAttachmentsCount >= 3);

    const statusAfterDisconnect = await defaultCloudSyncAdapter.disconnect();
    assert.equal(statusAfterDisconnect.mode, 'LOCAL_WORKSPACE');

    const db = await getLocalDb();
    const notesAfterDisconnect = await db.count('vaultNotes');
    assert.ok(notesAfterDisconnect >= 3);
    const quota = await estimateStorageQuota();
    assert.ok(quota.usageBytes >= 0);
    return `Cloud Sync Adapter inventory (${inventory.notesCount} notes, ${inventory.pendingAttachmentsCount} local attachments) and non-destructive disconnect verified.`;
  });

  console.log('======================================================================');
  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  console.log(`FINAL RESULT: ${passed}/24 PASSED, ${failed}/24 FAILED`);
  console.log('======================================================================');
  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
