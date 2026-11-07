import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import {
  dbGetAllAttachmentsMeta,
  dbGetPendingSyncOperations,
  dbUpdateSyncOperationStatus,
  getLocalDb,
} from '../db/localDb';
import { auth, db, stripUndefined } from '../firebase';
import { retryAttachmentUpload, sanitizeAttachmentForFirestore } from '../storage';
import {
  CurrentAffairRecord,
  QuizAttemptRecord,
  RevisionRecord,
  RoutineTaskRecord,
  StudySessionRecord,
  SyncConflictRecord,
  TopicRecord,
  VaultNoteRecord,
  WorkspaceMode,
} from '../types';

export interface CloudSyncInventory {
  topicsCount: number;
  sessionsCount: number;
  tasksCount: number;
  notesCount: number;
  quizzesCount: number;
  revisionsCount: number;
  currentAffairsCount: number;
  pendingAttachmentsCount: number;
  totalEstimatedBytes: number;
  destinationProjectId: string;
}

export interface CloudSyncStatus {
  mode: WorkspaceMode;
  connected: boolean;
  authenticatedEmail: string | null;
  pendingOperationsCount: number;
  failedOperationsCount: number;
  lastSyncedAtIso: string | null;
  destinationProjectId: string;
}

export interface PushSyncResult {
  uploadedRecords: number;
  uploadedAttachments: number;
  failedCount: number;
  verifiedCloudPersistence: boolean;
  completedAtIso: string;
}

export interface CloudSyncProvider {
  connect(options: { explicitUserConsent: boolean }): Promise<CloudSyncStatus>;
  disconnect(): Promise<CloudSyncStatus>;
  prepareFirstTimeSyncInventory(): Promise<CloudSyncInventory>;
  pushChanges(): Promise<PushSyncResult>;
  pullChanges(): Promise<{ pulledRecords: number; conflicts: SyncConflictRecord[] }>;
  resolveConflict(
    noteId: string,
    resolution: 'keep_local' | 'accept_remote' | 'fork_both'
  ): Promise<void>;
  getSyncStatus(): Promise<CloudSyncStatus>;
  retryFailedOperations(): Promise<PushSyncResult>;
}

const SYNC_LAST_CHECKPOINT_KEY = 'rbi_prep_os_2027_cloud_sync_checkpoint_v5';

export class FirebaseCloudSyncAdapter implements CloudSyncProvider {
  private mode: WorkspaceMode = 'LOCAL_WORKSPACE';
  private explicitConsentGranted = false;
  private lastSyncedAtIso: string | null = null;
  private readonly projectId = 'project-fbfd3ef6-3206-44d7-879';

  constructor(initialMode: WorkspaceMode = 'LOCAL_WORKSPACE', consentGranted = false) {
    this.mode = initialMode;
    this.explicitConsentGranted = consentGranted;
    try {
      if (typeof localStorage !== 'undefined') {
        this.lastSyncedAtIso = localStorage.getItem(SYNC_LAST_CHECKPOINT_KEY);
      }
    } catch {
      this.lastSyncedAtIso = null;
    }
  }

  public setModeInternal(mode: WorkspaceMode, consentGranted: boolean): void {
    this.mode = mode;
    this.explicitConsentGranted = consentGranted;
  }

  public async connect(options: {
    explicitUserConsent: boolean;
  }): Promise<CloudSyncStatus> {
    if (!options.explicitUserConsent) {
      throw new Error(
        'Explicit user consent is required before activating Cloud Sync or uploading local study records.'
      );
    }
    this.explicitConsentGranted = true;
    this.mode = 'CLOUD_SYNC';
    return this.getSyncStatus();
  }

  public async disconnect(): Promise<CloudSyncStatus> {
    // Disabling Cloud Sync switches cleanly to LOCAL_WORKSPACE without deleting any local records
    this.mode = 'LOCAL_WORKSPACE';
    this.explicitConsentGranted = false;
    return this.getSyncStatus();
  }

  public async prepareFirstTimeSyncInventory(): Promise<CloudSyncInventory> {
    const localDb = await getLocalDb();
    const [
      topics,
      sessions,
      tasks,
      notes,
      quizzes,
      revisions,
      currentAffairs,
      attachments,
    ] = await Promise.all([
      localDb.getAll('topics') as Promise<TopicRecord[]>,
      localDb.getAll('studySessions') as Promise<StudySessionRecord[]>,
      localDb.getAll('studyTasks') as Promise<RoutineTaskRecord[]>,
      localDb.getAll('vaultNotes') as Promise<VaultNoteRecord[]>,
      localDb.getAll('quizAttempts') as Promise<QuizAttemptRecord[]>,
      localDb.getAll('revisionItems') as Promise<RevisionRecord[]>,
      localDb.getAll('currentAffairs') as Promise<CurrentAffairRecord[]>,
      dbGetAllAttachmentsMeta(),
    ]);

    const pendingAtts = attachments.filter((a) => !a.storagePath);
    const totalEstimatedBytes =
      pendingAtts.reduce((acc, a) => acc + (a.sizeBytes || a.byteSize || 0), 0) +
      notes.reduce((acc, n) => acc + (n.content?.length || 0), 0);

    return {
      topicsCount: topics.length,
      sessionsCount: sessions.length,
      tasksCount: tasks.length,
      notesCount: notes.length,
      quizzesCount: quizzes.length,
      revisionsCount: revisions.length,
      currentAffairsCount: currentAffairs.length,
      pendingAttachmentsCount: pendingAtts.length,
      totalEstimatedBytes,
      destinationProjectId: this.projectId,
    };
  }

  public async getSyncStatus(): Promise<CloudSyncStatus> {
    const pendingOps = await dbGetPendingSyncOperations();
    const failedCount = pendingOps.filter((o) => o.status === 'failed').length;
    const currentUser = auth?.currentUser || null;

    return {
      mode: this.mode,
      connected: Boolean(
        this.mode === 'CLOUD_SYNC' &&
          this.explicitConsentGranted &&
          currentUser &&
          currentUser.emailVerified
      ),
      authenticatedEmail: currentUser?.email || null,
      pendingOperationsCount: pendingOps.length,
      failedOperationsCount: failedCount,
      lastSyncedAtIso: this.lastSyncedAtIso,
      destinationProjectId: this.projectId,
    };
  }

  public async pushChanges(): Promise<PushSyncResult> {
    if (!this.explicitConsentGranted || this.mode !== 'CLOUD_SYNC') {
      throw new Error(
        'Cloud Sync is not enabled or explicit consent has not been granted.'
      );
    }

    const currentUser = auth?.currentUser;
    if (!currentUser || !currentUser.emailVerified) {
      throw new Error(
        'Please sign in with a verified Google account to push changes to Firebase.'
      );
    }

    const uid = currentUser.uid;
    const localDb = await getLocalDb();
    let uploadedRecords = 0;
    let uploadedAttachments = 0;
    let failedCount = 0;

    const [topics, sessions, tasks, notes, quizzes, revisions, currentAffairs] =
      await Promise.all([
        localDb.getAll('topics') as Promise<TopicRecord[]>,
        localDb.getAll('studySessions') as Promise<StudySessionRecord[]>,
        localDb.getAll('studyTasks') as Promise<RoutineTaskRecord[]>,
        localDb.getAll('vaultNotes') as Promise<VaultNoteRecord[]>,
        localDb.getAll('quizAttempts') as Promise<QuizAttemptRecord[]>,
        localDb.getAll('revisionItems') as Promise<RevisionRecord[]>,
        localDb.getAll('currentAffairs') as Promise<CurrentAffairRecord[]>,
      ]);

    // 1. Upload pending local attachments to Firebase Storage first
    for (const note of notes) {
      let noteAttsUpdated = false;
      const nextAtts = [];
      for (const att of note.attachments || []) {
        if (!att.storagePath) {
          try {
            const uploaded = await retryAttachmentUpload(att);
            if (uploaded.uploadStatus === 'uploaded' && uploaded.storagePath) {
              uploadedAttachments++;
              noteAttsUpdated = true;
              nextAtts.push(uploaded);
            } else {
              nextAtts.push(att);
            }
          } catch {
            failedCount++;
            nextAtts.push(att);
          }
        } else {
          nextAtts.push(att);
        }
      }
      if (noteAttsUpdated) {
        note.attachments = nextAtts;
        await localDb.put('vaultNotes', note);
      }
    }

    // 2. Push Topics
    for (const t of topics) {
      try {
        await setDoc(
          doc(db, 'users', uid, 'topics', t.id),
          stripUndefined({
            ...t,
            userId: uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
          { merge: true }
        );
        uploadedRecords++;
      } catch {
        failedCount++;
      }
    }

    // 3. Push Sessions
    for (const s of sessions) {
      try {
        await setDoc(
          doc(db, 'users', uid, 'sessions', s.id),
          stripUndefined({
            ...s,
            userId: uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
          { merge: true }
        );
        uploadedRecords++;
      } catch {
        failedCount++;
      }
    }

    // 4. Push Tasks
    for (const tk of tasks) {
      try {
        await setDoc(
          doc(db, 'users', uid, 'tasks', tk.id),
          stripUndefined({
            ...tk,
            userId: uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
          { merge: true }
        );
        uploadedRecords++;
      } catch {
        failedCount++;
      }
    }

    // 5. Push Notes (with sanitized attachment metadata, never raw base64)
    for (const n of notes) {
      try {
        const firestoreAtts = (n.attachments || []).map((a) =>
          sanitizeAttachmentForFirestore(a)
        );
        await setDoc(
          doc(db, 'users', uid, 'notes', n.id),
          stripUndefined({
            userId: uid,
            title: n.title,
            subject: n.subject,
            topicId: n.topicId,
            topicTitle: n.topicTitle,
            sessionId: n.sessionId,
            sourceType: n.sourceType,
            content: n.content,
            originalExtractedText: n.originalExtractedText,
            sourceUrl: n.sourceUrl,
            tagsCsv: n.tagsCsv,
            attachmentsMetaJson: JSON.stringify(firestoreAtts).slice(0, 195000),
            version: n.version,
            historyJson: JSON.stringify(n.history || []).slice(0, 95000),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
          { merge: true }
        );
        uploadedRecords++;
      } catch {
        failedCount++;
      }
    }

    // 6. Push Quizzes, Revisions & Current Affairs
    for (const q of quizzes) {
      try {
        await setDoc(
          doc(db, 'users', uid, 'quizzes', q.id),
          stripUndefined({
            userId: uid,
            quizType: q.quizType,
            subject: q.subject,
            topicId: q.topicId,
            topicTitle: q.topicTitle,
            totalQuestions: q.totalQuestions,
            correctCount: q.correctCount,
            incorrectCount: q.incorrectCount,
            skippedCount: q.skippedCount,
            accuracy: q.accuracy,
            durationSeconds: q.durationSeconds,
            detailsJson: JSON.stringify({
              questions: q.questions,
              descriptiveData: q.descriptiveData,
            }).slice(0, 95000),
            attemptDate: q.attemptDate,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
          { merge: true }
        );
        uploadedRecords++;
      } catch {
        failedCount++;
      }
    }

    for (const r of revisions) {
      try {
        await setDoc(
          doc(db, 'users', uid, 'revisions', r.id),
          stripUndefined({
            ...r,
            userId: uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
          { merge: true }
        );
        uploadedRecords++;
      } catch {
        failedCount++;
      }
    }

    for (const c of currentAffairs) {
      try {
        await setDoc(
          doc(db, 'users', uid, 'currentAffairs', c.id),
          stripUndefined({
            ...c,
            userId: uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
          { merge: true }
        );
        uploadedRecords++;
      } catch {
        failedCount++;
      }
    }

    const pendingOps = await dbGetPendingSyncOperations();
    for (const op of pendingOps) {
      await dbUpdateSyncOperationStatus(
        op.id,
        failedCount === 0 ? 'synced' : 'failed'
      );
    }

    const completedAtIso = new Date().toISOString();
    this.lastSyncedAtIso = completedAtIso;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(SYNC_LAST_CHECKPOINT_KEY, completedAtIso);
      }
    } catch {
      // Ignore
    }

    return {
      uploadedRecords,
      uploadedAttachments,
      failedCount,
      verifiedCloudPersistence: failedCount === 0,
      completedAtIso,
    };
  }

  public async pullChanges(): Promise<{
    pulledRecords: number;
    conflicts: SyncConflictRecord[];
  }> {
    const currentUser = auth?.currentUser;
    if (!currentUser || this.mode !== 'CLOUD_SYNC') {
      return { pulledRecords: 0, conflicts: [] };
    }
    const uid = currentUser.uid;
    const localDb = await getLocalDb();
    let pulledRecords = 0;
    const conflicts: SyncConflictRecord[] = [];

    const notesSnap = await getDocs(
      query(collection(db, `users/${uid}/notes`), where('userId', '==', uid))
    );

    for (const docSnap of notesSnap.docs) {
      const d = docSnap.data();
      const remoteNote: VaultNoteRecord = {
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
        createdAtIso:
          d.createdAt?.toDate?.()?.toISOString?.() || new Date().toISOString(),
        updatedAtIso:
          d.updatedAt?.toDate?.()?.toISOString?.() || new Date().toISOString(),
      };

      const localNote = (await localDb.get('vaultNotes', remoteNote.id)) as
        | VaultNoteRecord
        | undefined;
      if (
        localNote &&
        localNote.content !== remoteNote.content &&
        localNote.updatedAtIso > remoteNote.updatedAtIso
      ) {
        const conflict: SyncConflictRecord = {
          noteId: remoteNote.id,
          noteTitle: remoteNote.title,
          localNote,
          remoteNote,
          detectedAtIso: new Date().toISOString(),
        };
        conflicts.push(conflict);
        await localDb.put('syncConflicts', conflict);
      } else {
        await localDb.put('vaultNotes', remoteNote);
        pulledRecords++;
      }
    }

    return { pulledRecords, conflicts };
  }

  public async resolveConflict(
    noteId: string,
    _resolution: 'keep_local' | 'accept_remote' | 'fork_both'
  ): Promise<void> {
    const localDb = await getLocalDb();
    await localDb.delete('syncConflicts', noteId);
  }

  public async retryFailedOperations(): Promise<PushSyncResult> {
    return this.pushChanges();
  }
}

export const defaultCloudSyncAdapter = new FirebaseCloudSyncAdapter();
