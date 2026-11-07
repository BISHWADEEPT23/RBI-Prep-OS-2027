export type ExamPhase = 'Phase I' | 'Phase II' | 'Additional Categories';

export type WorkspaceMode = 'LOCAL_WORKSPACE' | 'CLOUD_SYNC';

export type AiAvailabilityState =
  | 'AVAILABLE'
  | 'OFFLINE'
  | 'NOT_CONFIGURED'
  | 'AUTH_REQUIRED'
  | 'RATE_LIMITED'
  | 'ERROR';

export type TopicStatus =
  | 'Not Started'
  | 'In Progress'
  | 'Lecture Completed'
  | 'Practice Completed'
  | 'Revision Due'
  | 'Mastered';

export type NavigationTab =
  | 'home'
  | 'focus'
  | 'routine'
  | 'subjects'
  | 'vault'
  | 'revision'
  | 'practice'
  | 'current_affairs'
  | 'analytics'
  | 'settings';

export type MistakeCategory =
  | 'Conceptual'
  | 'Calculation'
  | 'Misinterpretation'
  | 'Time management'
  | 'Guessing'
  | 'Knowledge gap';

export interface SubjectCategory {
  id: string;
  phase: ExamPhase;
  name: string;
  code: string;
  isCustom?: boolean;
  createdAtIso?: string;
  updatedAtIso?: string;
}

export const DEFAULT_RBI_SUBJECTS: SubjectCategory[] = [
  // Phase I
  { id: 'subj_quant', phase: 'Phase I', name: 'Quantitative Aptitude', code: 'QUANT' },
  { id: 'subj_reasoning', phase: 'Phase I', name: 'Reasoning Ability', code: 'REAS' },
  { id: 'subj_english_p1', phase: 'Phase I', name: 'English Language', code: 'ENG-I' },
  { id: 'subj_ga', phase: 'Phase I', name: 'General Awareness', code: 'GA' },
  // Phase II
  { id: 'subj_esi', phase: 'Phase II', name: 'Economic and Social Issues', code: 'ESI' },
  { id: 'subj_finance', phase: 'Phase II', name: 'Finance', code: 'FIN' },
  { id: 'subj_management', phase: 'Phase II', name: 'Management', code: 'MGMT' },
  { id: 'subj_english_desc', phase: 'Phase II', name: 'English Descriptive', code: 'ENG-II' },
  // Additional Categories
  { id: 'subj_ca', phase: 'Additional Categories', name: 'Current Affairs', code: 'CA' },
  { id: 'subj_rbi_notif', phase: 'Additional Categories', name: 'RBI Notifications', code: 'RBI-CIRC' },
  { id: 'subj_desc_writing', phase: 'Additional Categories', name: 'Descriptive Writing', code: 'DESC' },
  { id: 'subj_interview', phase: 'Additional Categories', name: 'Interview Preparation', code: 'INTV' },
];

export interface TopicRecord {
  id: string;
  userId: string;
  phase: ExamPhase;
  subject: string;
  chapter: string;
  title: string;
  status: TopicStatus;
  studyMinutes: number;
  practiceAccuracy?: number;
  confidence: number; // 0 to 5
  revisionStage?: number;
  nextRevisionDate?: string;
  lastStudiedAt?: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface StudySessionRecord {
  id: string;
  userId: string;
  phase: ExamPhase;
  subject: string;
  topicId: string;
  topicTitle: string;
  goal?: string;
  timerMode?: 'stopwatch' | 'countdown' | 'pomodoro';
  plannedMinutes?: number;
  focusedMinutes: number;
  pausedMinutes: number;
  outcome?: string;
  confidence: number; // 1 to 5
  notesSummary?: string;
  screenshotsCount?: number;
  suggestedRevisionDate?: string;
  sessionDate: string; // YYYY-MM-DD in Asia/Kolkata
  createdAtIso: string;
  updatedAtIso: string;
}

export interface RoutineTaskRecord {
  id: string;
  userId: string;
  title: string;
  category: 'lesson' | 'revision' | 'practice' | 'current_affairs' | 'mock';
  subject: string;
  topicId?: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  durationMinutes: number;
  priority: 'high' | 'medium' | 'low';
  status: 'planned' | 'completed' | 'missed' | 'rescheduled';
  isRecurring?: boolean;
  createdAtIso: string;
  updatedAtIso: string;
}

export type AttachmentUploadStatus =
  | 'local_stored'
  | 'uploaded'
  | 'pending_offline'
  | 'uploading'
  | 'failed'
  | 'legacy_embedded';

export interface VaultAttachment {
  id: string;
  ownerWorkspaceId?: string;
  ownerUid?: string;
  noteId?: string;
  sessionId?: string;
  originalFilename?: string;
  fileName: string;
  mimeType: string;
  byteSize?: number;
  sizeBytes: number;
  sha256?: string;
  checksum?: string; // SHA-256 hex digest of file bytes
  localBlobId?: string; // IndexedDB key in attachmentBlobs store
  cloudStoragePath?: string;
  storagePath?: string; // users/{uid}/study-attachments/{attachmentId}/{safeFilename}
  uploadStatus?: AttachmentUploadStatus;
  createdAt?: string;
  updatedAt?: string;
  createdAtIso?: string;
  updatedAtIso?: string;
  dataUrl?: string; // Legacy embedded data URL or transient in-memory OCR buffer (not persisted once migrated)
  extractedText?: string;
  uploadProgress?: number;
  uploadError?: string;
}

export interface AttachmentBlobRecord {
  id: string;
  attachmentId: string;
  ownerWorkspaceId: string;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
  blob: Blob;
  createdAt: string;
  updatedAt: string;
}

export interface SyncConflictRecord {
  noteId: string;
  noteTitle: string;
  localNote: VaultNoteRecord;
  remoteNote: VaultNoteRecord;
  detectedAtIso: string;
}

export interface SyncOperationRecord {
  id: string;
  entityType:
    | 'prefs'
    | 'subject'
    | 'topic'
    | 'session'
    | 'task'
    | 'note'
    | 'attachment'
    | 'quiz'
    | 'revision'
    | 'current_affair'
    | 'ai_interaction';
  entityId: string;
  operation: 'upsert' | 'delete';
  status: 'queued' | 'syncing' | 'synced' | 'failed';
  retryCount: number;
  lastError?: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface NoteVersionEntry {
  id?: string;
  noteId?: string;
  version: number;
  savedAtIso: string;
  contentSnippet: string;
  fullContent: string;
}

export interface VaultNoteRecord {
  id: string;
  userId: string;
  title: string;
  subject: string;
  topicId?: string;
  topicTitle: string;
  sessionId?: string;
  sourceType: 'note' | 'screenshot' | 'pdf' | 'url' | 'class_reference' | 'practice_note';
  content: string;
  originalExtractedText?: string;
  sourceUrl?: string;
  tagsCsv?: string;
  attachments: VaultAttachment[];
  version: number;
  history: NoteVersionEntry[];
  createdAtIso: string;
  updatedAtIso: string;
}

export interface QuizQuestionItem {
  id: string;
  subject?: string;
  topicTitle?: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  difficulty: string;
  conceptTag: string;
  groundedInNotes?: boolean;
  selectedOption?: number | null;
  isSkipped?: boolean;
  isBookmarked?: boolean;
  timeSpentSeconds?: number;
  mistakeCategory?: MistakeCategory;
}

export interface QuizResponseRecord {
  id: string;
  attemptId: string;
  questionId: string;
  subject: string;
  selectedOption: number | null;
  correctIndex: number;
  isCorrect: boolean;
  isSkipped: boolean;
  mistakeCategory?: MistakeCategory;
  timeSpentSeconds: number;
  createdAtIso: string;
}

export interface QuizAttemptRecord {
  id: string;
  userId: string;
  quizType: 'mcq' | 'descriptive' | 'mock';
  subject: string;
  topicId?: string;
  topicTitle: string;
  totalQuestions: number;
  correctCount: number;
  incorrectCount: number;
  skippedCount: number;
  accuracy: number;
  durationSeconds: number;
  questions: QuizQuestionItem[];
  descriptiveData?: {
    questionPrompt: string;
    userAnswer: string;
    estimatedScore: number;
    maxMarks: number;
    feedback: string;
  };
  attemptDate: string; // YYYY-MM-DD
  createdAtIso: string;
  updatedAtIso: string;
}

export interface RevisionRecord {
  id: string;
  userId: string;
  topicId: string;
  topicTitle: string;
  subject: string;
  phase?: ExamPhase;
  intervalDays: number;
  stageLabel: string;
  dueDate: string; // YYYY-MM-DD
  status: 'due' | 'upcoming' | 'overdue' | 'completed';
  confidence?: number;
  lastAccuracy?: number;
  recommendationReason: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface CurrentAffairRecord {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  monthTag: string; // YYYY-MM
  headline: string;
  sourceUrl?: string;
  summary: string;
  keyFacts?: string;
  regulatoryRelevance?: string;
  esiConnection?: string;
  financeConnection?: string;
  revisionStatus: 'Unreviewed' | 'Reviewed Once' | 'Revised & Mastered';
  createdAtIso: string;
  updatedAtIso: string;
}

export interface AIInteractionRecord {
  id: string;
  userId: string;
  actionType: string;
  subject?: string;
  topicTitle?: string;
  prompt: string;
  responseText: string;
  sourceNoteTitles?: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface ActiveTimerState {
  isRunning: boolean;
  isPaused: boolean;
  mode: 'stopwatch' | 'countdown' | 'pomodoro';
  phase: ExamPhase;
  subject: string;
  topicId: string;
  topicTitle: string;
  goal: string;
  plannedMinutes: number;
  accumulatedFocusedMs: number;
  accumulatedPausedMs: number;
  lastResumeEpochMs: number | null;
  lastPauseEpochMs: number | null;
  lastHeartbeatEpochMs: number | null;
  unverifiedGapDetected: boolean;
  unverifiedGapMinutes: number;
  checklist: { id: string; text: string; done: boolean }[];
  quickNotes: string;
  sessionScreenshots: VaultAttachment[];
}

export interface UserWorkspacePrefs {
  userId: string;
  workspaceId?: string;
  workspaceMode?: WorkspaceMode;
  cloudSyncConsentAtIso?: string;
  displayName: string;
  themeSeed: string;
  themeMode: 'light' | 'dark' | 'system';
  dailyGoalMinutes: number;
  officeStart: string;
  officeEnd: string;
  workDays: number[]; // 1 = Mon ... 5 = Fri
  revisionIntervals: number[]; // Default [1, 3, 7, 14, 30]
  customSubjects: SubjectCategory[];
  leaveDays?: string[]; // YYYY-MM-DD holiday/leave overrides
  DescriptiveDrafts?: Record<string, string>;
  lastSelectedSubject?: string;
  lastSelectedTopicId?: string;
  autoBackupEnabled?: boolean;
  maxAutoBackups?: number;
}

export interface StorageQuotaEstimate {
  usageBytes: number;
  quotaBytes: number;
  usagePercent: number;
  isNearLimit: boolean;
  isExceeded: boolean;
  warningMessage: string | null;
}

export interface LocalStorageMigrationReport {
  detectedLegacyData: boolean;
  migratedAtIso?: string;
  backupKey: string;
  legacyRetained: boolean;
  verifiedMatch: boolean;
  counts: {
    topics: number;
    sessions: number;
    tasks: number;
    notes: number;
    quizzes: number;
    revisions: number;
    currentAffairs: number;
    aiInteractions: number;
  };
}
