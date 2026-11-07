import { performance } from 'perf_hooks';
import 'fake-indexeddb/auto';
import {
  getLocalDb,
  seedBundledDefaultsIfEmpty,
  loadWorkspaceFromIndexedDb,
  dbAtomicSaveStudySession,
  dbAtomicSaveQuizAttempt,
  resetLocalDbConnection,
} from './src/db/localDb';
// Benchmark DEFAULT constants (avoiding importing StudyContext which imports Firebase)
const DEFAULT_PREFS: any = {
  userId: 'local_user',
  workspaceId: 'local_bench',
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

const DEFAULT_TIMER_STATE: any = {
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
import { StudySessionRecord, QuizAttemptRecord, TopicRecord } from './src/types';

async function runBenchmark() {
  console.log('====================================================');
  console.log('RBI PREP OS 2027 — STARTUP & HYDRATION BENCHMARK');
  console.log('====================================================');

  // Cold open
  resetLocalDbConnection();
  const t0 = performance.now();
  const db = await getLocalDb();
  const t1 = performance.now();
  const coldOpenMs = t1 - t0;
  console.log(`[1] Cold IndexedDB Open: ${coldOpenMs.toFixed(2)} ms`);

  // Seeding bundled defaults
  const t2 = performance.now();
  await seedBundledDefaultsIfEmpty();
  const t3 = performance.now();
  const seedMs = t3 - t2;
  console.log(`[2] Seed Bundled Defaults: ${seedMs.toFixed(2)} ms`);

  // Cold hydration
  const t4 = performance.now();
  const data1 = await loadWorkspaceFromIndexedDb(DEFAULT_PREFS, DEFAULT_TIMER_STATE);
  const t5 = performance.now();
  const coldHydrateMs = t5 - t4;
  console.log(`[3] Cold Workspace Hydration: ${coldHydrateMs.toFixed(2)} ms`);
  console.log(`    Hydrated: ${data1.topics.length} topics, ${data1.sessions.length} sessions, ${data1.quizzes.length} quizzes`);

  // Warm hydration (db already open)
  const t6 = performance.now();
  const data2 = await loadWorkspaceFromIndexedDb(DEFAULT_PREFS, DEFAULT_TIMER_STATE);
  const t7 = performance.now();
  const warmHydrateMs = t7 - t6;
  console.log(`[4] Warm Workspace Hydration: ${warmHydrateMs.toFixed(2)} ms`);

  // Add 100 study sessions and 50 topics to test scale
  console.log('\nPopulating test dataset (100 sessions, 50 topics, 20 quizzes)...');
  const nowIso = new Date().toISOString();
  for (let i = 0; i < 50; i++) {
    const topic: TopicRecord = {
      id: `top_bench_${i}`,
      userId: 'local_user',
      phase: i % 2 === 0 ? 'Phase I' : 'Phase II',
      subject: i % 3 === 0 ? 'Finance' : i % 3 === 1 ? 'Management' : 'Economic and Social Issues (ESI)',
      chapter: `Chapter ${Math.floor(i / 5) + 1}`,
      title: `Benchmark Topic ${i}`,
      status: i % 4 === 0 ? 'Mastered' : 'In Progress',
      studyMinutes: i * 25,
      confidence: (i % 5) + 1,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };
    await db.put('topics', topic);
  }

  for (let i = 0; i < 100; i++) {
    const session: StudySessionRecord = {
      id: `sess_bench_${i}`,
      userId: 'local_user',
      phase: 'Phase II',
      subject: 'Finance',
      topicId: `top_bench_${i % 50}`,
      topicTitle: `Benchmark Topic ${i % 50}`,
      plannedMinutes: 45,
      focusedMinutes: 40 + (i % 20),
      pausedMinutes: 5,
      confidence: 4,
      outcome: 'Completed',
      timerMode: 'stopwatch',
      sessionDate: '2026-11-07',
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };
    await db.put('studySessions', session);
  }

  for (let i = 0; i < 20; i++) {
    const quiz: QuizAttemptRecord = {
      id: `quiz_bench_${i}`,
      userId: 'local_user',
      subject: 'Finance',
      topicId: `top_bench_${i % 50}`,
      topicTitle: `Benchmark Topic ${i % 50}`,
      quizType: 'mcq',
      totalQuestions: 10,
      correctCount: 8,
      incorrectCount: 2,
      skippedCount: 0,
      accuracy: 80,
      durationSeconds: 300,
      questions: [],
      attemptDate: '2026-11-07',
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };
    await db.put('quizAttempts', quiz);
  }

  // Hydration with dataset
  const t8 = performance.now();
  const populatedData = await loadWorkspaceFromIndexedDb(DEFAULT_PREFS, DEFAULT_TIMER_STATE);
  const t9 = performance.now();
  const populatedHydrateMs = t9 - t8;
  console.log(`[5] Hydration with 100 sessions + 50 topics: ${populatedHydrateMs.toFixed(2)} ms`);
  console.log(`    Total hydrated records: ${populatedData.sessions.length} sessions, ${populatedData.topics.length} topics, ${populatedData.quizzes.length} quizzes`);

  console.log('====================================================');
}

runBenchmark().catch(console.error);
