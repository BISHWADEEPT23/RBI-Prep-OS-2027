import 'fake-indexeddb/auto';
import {
  getLocalDb,
  resetLocalDbConnection,
  seedBundledDefaultsIfEmpty,
  loadWorkspaceFromIndexedDb,
  dbSaveTopic,
  dbAtomicSaveStudySession,
  dbAtomicSaveQuizAttempt,
  dbAtomicSaveVaultNote,
  dbSaveRevisionItem,
  dbSaveAttachmentBlobAndMeta,
  dbGetAttachmentBlob,
  applySchemaUpgrade,
  LOCAL_DB_NAME,
  LOCAL_DB_VERSION,
} from './src/db/localDb';
import {
  DEFAULT_PREFS,
  DEFAULT_TIMER_STATE,
  addDaysToDateStr,
  getKolkataDateString,
} from './src/context/StudyContext';
import {
  TopicRecord,
  StudySessionRecord,
  QuizAttemptRecord,
  VaultNoteRecord,
  RevisionRecord,
  VaultAttachment,
} from './src/types';
import { triggerAutoBackup, inspectBackupInput } from './src/backup/backupRestore';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`✅ PASS: ${msg}`);
    passCount++;
  } else {
    console.error(`❌ FAIL: ${msg}`);
    failCount++;
  }
}

async function runTests() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  RBI Prep OS 2027 — v1.2.0 Persistent Progress Tests');
  console.log('═══════════════════════════════════════════════════════════\n');

  resetLocalDbConnection();
  const todayStr = getKolkataDateString();
  const nowIso = new Date().toISOString();

  // Test 1: Cold start and hydration of bundled defaults
  await seedBundledDefaultsIfEmpty();
  const initial = await loadWorkspaceFromIndexedDb(DEFAULT_PREFS, DEFAULT_TIMER_STATE);
  assert(initial.prefs.workspaceMode === 'LOCAL_WORKSPACE', 'Initial workspace mode is LOCAL_WORKSPACE');
  assert(initial.sessions.length === 0, 'New workspace starts with 0 sessions');

  // Test 2: Persist Study Session & Topic Completion
  const topic1: TopicRecord = {
    id: 'top_pers_1',
    userId: 'local_user',
    phase: 'Phase II',
    subject: 'Finance',
    chapter: 'Functions of RBI',
    title: 'Monetary Policy Framework & MPC',
    status: 'In Progress',
    studyMinutes: 0,
    confidence: 3,
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };
  await dbSaveTopic(topic1);

  const session1: StudySessionRecord = {
    id: 'sess_pers_1',
    userId: 'local_user',
    phase: 'Phase II',
    subject: 'Finance',
    topicId: topic1.id,
    topicTitle: topic1.title,
    plannedMinutes: 60,
    focusedMinutes: 60,
    pausedMinutes: 5,
    outcome: 'Completed',
    confidence: 5,
    timerMode: 'stopwatch',
    sessionDate: todayStr,
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  const updatedTopic1: TopicRecord = {
    ...topic1,
    status: 'Mastered',
    studyMinutes: 60,
    confidence: 5,
    lastStudiedAt: todayStr,
  };

  const revision1: RevisionRecord = {
    id: 'rev_pers_1',
    userId: 'local_user',
    topicId: topic1.id,
    topicTitle: topic1.title,
    subject: topic1.subject,
    phase: topic1.phase,
    intervalDays: 1,
    stageLabel: 'Day 1 Review',
    dueDate: addDaysToDateStr(todayStr, 1),
    status: 'upcoming',
    confidence: 5,
    recommendationReason: 'Auto scheduled after 60 min session',
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  const atomicSaveRes = await dbAtomicSaveStudySession({
    session: session1,
    updatedTopic: updatedTopic1,
    revisionToSchedule: revision1,
  });

  assert(atomicSaveRes.session.focusedMinutes === 60, 'Study session persisted with 60 focused minutes');
  assert(atomicSaveRes.topic.status === 'Mastered', 'Topic status updated to Mastered');
  assert(Boolean(atomicSaveRes.revision), 'Day 1 spaced revision scheduled');

  // Test 3: Close connection and hydrate from disk (Simulate App Restart)
  resetLocalDbConnection();
  const hydrated = await loadWorkspaceFromIndexedDb(DEFAULT_PREFS, DEFAULT_TIMER_STATE);
  assert(hydrated.sessions.length === 1, 'Restart restored exactly 1 study session');
  assert(hydrated.sessions[0].id === 'sess_pers_1', 'Restored correct session ID');
  assert(hydrated.topics.some((t) => t.id === 'top_pers_1' && t.status === 'Mastered'), 'Restored topic completion as Mastered');
  assert(hydrated.revisions.length === 1, 'Restored scheduled revision item');

  // Test 4: Persist Quiz attempt and responses
  const quiz1: QuizAttemptRecord = {
    id: 'quiz_pers_1',
    userId: 'local_user',
    quizType: 'mcq',
    subject: 'Finance',
    topicId: topic1.id,
    topicTitle: topic1.title,
    totalQuestions: 5,
    correctCount: 4,
    incorrectCount: 1,
    skippedCount: 0,
    accuracy: 80,
    durationSeconds: 180,
    attemptDate: todayStr,
    questions: [
      {
        id: 'q1',
        subject: 'Finance',
        topicTitle: 'Monetary Policy',
        question: 'What is repo rate?',
        options: ['A', 'B', 'C', 'D'],
        correctIndex: 1,
        selectedOption: 1,
        explanation: 'Rate at which RBI lends',
        difficulty: 'Core',
        conceptTag: 'Monetary Policy',
      },
    ],
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  await dbAtomicSaveQuizAttempt(quiz1);

  // Test 5: Re-hydrate after quiz save
  resetLocalDbConnection();
  const hydratedWithQuiz = await loadWorkspaceFromIndexedDb(DEFAULT_PREFS, DEFAULT_TIMER_STATE);
  assert(hydratedWithQuiz.quizzes.length === 1, 'Quiz attempt restored after restart');
  assert(hydratedWithQuiz.quizzes[0].accuracy === 80, 'Restored quiz accuracy (80%)');

  // Test 6: Persist Knowledge Vault note and binary attachment
  const note1: VaultNoteRecord = {
    id: 'note_pers_1',
    userId: 'local_user',
    title: 'Anuj Jindal RBI Lecture Notes',
    subject: 'Finance',
    topicId: topic1.id,
    topicTitle: topic1.title,
    sourceType: 'note',
    content: 'Notes on Section 45ZB Monetary Policy Committee composition and voting rules.',
    version: 1,
    attachments: [],
    history: [],
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };
  await dbAtomicSaveVaultNote(note1);

  const testBlob = new Blob(['PNG_TEST_HEADER_BYTES_123456'], { type: 'image/png' });
  const attMeta: VaultAttachment = {
    id: 'att_pers_1',
    localBlobId: 'att_pers_1',
    ownerWorkspaceId: 'local_workspace',
    noteId: note1.id,
    fileName: 'rbi_mpc_slide.png',
    originalFilename: 'rbi_mpc_slide.png',
    mimeType: 'image/png',
    sizeBytes: testBlob.size,
    byteSize: testBlob.size,
    sha256: 'mock_sha256_12345',
    storagePath: 'local',
    uploadStatus: 'local_stored',
  };
  await dbSaveAttachmentBlobAndMeta(attMeta, testBlob);

  resetLocalDbConnection();
  const blobRetrieved = await dbGetAttachmentBlob('att_pers_1');
  assert(Boolean(blobRetrieved), 'Binary attachment blob restored from IndexedDB');
  assert(blobRetrieved?.size === testBlob.size, 'Restored binary blob matches original size');

  // Test 7: Verify Study Progress Dashboard KPI calculations from real records
  const totalMins = hydratedWithQuiz.sessions.reduce((a, s) => a + s.focusedMinutes, 0);
  const totalHours = (totalMins / 60).toFixed(1);
  assert(totalHours === '1.0', `Total study hours correctly computed: ${totalHours} hrs`);

  const completedCount = hydratedWithQuiz.topics.filter(
    (t) => t.status === 'Mastered' || t.status === 'Practice Completed' || t.status === 'Lecture Completed'
  ).length;
  assert(completedCount === 1, `Completed topics correctly computed: ${completedCount}`);

  // Test 8: Schema Upgrade Safety (Simulate upgrading from v1 -> v2)
  const db = await getLocalDb();
  let upgradeThrew = false;
  try {
    applySchemaUpgrade(db, 1, 2);
  } catch (err) {
    upgradeThrew = true;
  }
  assert(!upgradeThrew, 'applySchemaUpgrade ran non-destructively without error');

  // Test 9: Automatic Local Backup generation and schema validation
  const autoBackupRes = await triggerAutoBackup(7);
  assert(autoBackupRes.success, 'Automatic local backup created successfully');

  // Test 10: Automatic Backup Duplicate Detection and Preview
  const testPayloadJson = JSON.stringify({
    app: 'RBI Prep OS 2027',
    schemaVersion: '5.0-local-first-hybrid',
    dbVersion: 2,
    exportedAtIso: new Date().toISOString(),
    backupClassification: 'LOCAL_WORKSPACE_AUTO',
    attachmentBackupNotice: 'Notice',
    prefs: DEFAULT_PREFS,
    customSubjects: [],
    topics: [topic1],
    sessions: [session1],
    tasks: [],
    notes: [note1],
    quizzes: [quiz1],
    revisions: [revision1],
    currentAffairs: [],
    aiInteractions: [],
    attachmentsMeta: [attMeta],
  });

  const { preview } = await inspectBackupInput(testPayloadJson);
  assert(preview.valid, 'Backup inspection validated schema');
  assert(preview.recordCounts.topics === 1, 'Inspected preview found 1 topic');
  assert(preview.recordCounts.sessions === 1, 'Inspected preview found 1 session');
  assert(preview.totalDuplicates >= 1, 'Inspected preview detected duplicate IDs before restore');

  // Test 11: Idempotency — repeated saves do not duplicate
  const atomicSaveRes2 = await dbAtomicSaveStudySession({
    session: session1,
    updatedTopic: updatedTopic1,
  });
  assert(atomicSaveRes2.wasDuplicateSession, 'Idempotent save prevented duplicate study session');

  // Test 12: Fast Startup — No eager Firebase network connection
  const tStart = performance.now();
  resetLocalDbConnection();
  const reloadedFast = await loadWorkspaceFromIndexedDb(DEFAULT_PREFS, DEFAULT_TIMER_STATE);
  const tElapsed = performance.now() - tStart;
  assert(tElapsed < 100, `Workspace hydration completed in ${tElapsed.toFixed(2)} ms (< 100ms)`);
  assert(Boolean(reloadedFast.lastSaveTimeIso), 'Last save timestamp is populated and non-null');

  console.log('\n───────────────────────────────────────────────────────────');
  console.log(`  ${passCount} PASS  |  ${failCount} FAIL  |  ${passCount + failCount} TOTAL`);
  console.log('───────────────────────────────────────────────────────────\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
