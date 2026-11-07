# RBI Prep OS 2027 — Local-First Hybrid Architecture (v5.0)

## 1. Phase 1 Audit & Compatibility Matrix

| Feature | Works Without Google Sign-In | Works Offline |Works Online Without Firebase | Needs Backend Gemini | Needs Firebase Sync |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Home Dashboard & Analytics** | YES | YES | YES | NO | Optional |
| **Material You Theme Studio** | YES | YES | YES | NO | Optional |
| **Focus Room & Study Timer** | YES | YES | YES | NO | Optional |
| **Routine Planner & Checklist** | YES | YES | YES | NO | Optional |
| **Subjects & Topics Tracker** | YES | YES | YES | NO | Optional |
| **Knowledge Vault Notes & Version History** | YES | YES | YES | NO | Optional |
| **Binary Attachments (PNG/JPEG/WebP/PDF)** | YES | YES | YES | NO | Optional |
| **Legacy Base64 -> Local IndexedDB Migration** | YES | YES | YES | NO | Optional |
| **Screenshot-to-Notes Manual Transcription & Template** | YES | YES | YES | NO | Optional |
| **Screenshot-to-Notes AI Vision OCR & Structuring** | YES | NO (Manual Fallback) | YES | YES (`/api/ai/*`) | Optional |
| **Practice Quizzes (Bundled Offline Question Bank)** | YES | YES | YES | NO | Optional |
| **Practice Quizzes (AI Question Generator)** | YES | NO (Bank Fallback) | YES | YES (`/api/ai/*`) | Optional |
| **Phase II Descriptive Writing Drafts & Rubric** | YES | YES | YES | Optional | Optional |
| **Revision Center (Spaced Repetition)** | YES | YES | YES | NO | Optional |
| **Current Affairs Notebook** | YES | YES | YES | NO | Optional |
| **Complete ZIP Backup (`.zip`) & Validated Restore** | YES | YES | YES | NO | Optional |
| **Cross-Device Cloud Sync** | NO (Opt-in) | Queued Locally | NO | NO | YES (`project-fbfd3ef6-3206-44d7-879`) |

---

## 2. Authoritative Local IndexedDB Schema (`rbi_prep_os_2027`, Version 2)

All 19 object stores are created and managed in `src/db/localDb.ts`:

1. `workspaceSettings`: Workspace mode (`LOCAL_WORKSPACE` default vs `CLOUD_SYNC`), Material You seed color, appearance mode, daily goal, revision intervals, and active timer recovery state.
2. `subjects`: Bundled RBI Grade B/A subjects (`Phase I`, `Phase II`, `Additional Categories`) and user-defined custom subjects.
3. `topics`: Syllabus topics indexed by `subjectId`, `phase`, `status`, and `updatedAt`.
4. `studyTasks`: Planned and completed study tasks indexed by `scheduledDate`, `status`, `subjectId`, and `updatedAt`.
5. `studySessions`: Completed Focus Room sessions indexed by `sessionDate`, `subjectId`, `topicId`, and `createdAt`.
6. `routineBlocks`: Daily/weekly routine planner blocks indexed by `dayOfWeek`, `date`, and `status`.
7. `vaultNotes`: Rich study notes indexed by `subjectId`, `topicId`, `sourceType`, and `updatedAt`.
8. `noteVersions`: Immutable version history snapshots indexed by `noteId`, `versionNumber`, and `createdAt`.
9. `attachments`: Attachment metadata records (`id`, `ownerWorkspaceId`, `noteId`, `sessionId`, `originalFilename`, `mimeType`, `byteSize`, `sha256`, `localBlobId`, `cloudStoragePath`, `uploadStatus`).
10. `attachmentBlobs`: Raw binary `Blob` payloads keyed by `id` (`localBlobId`) so screenshots and PDFs are never permanently stored as base64 strings inside note JSON.
11. `quizQuestions`: Bundled and saved offline practice questions indexed by `subjectId`, `topicId`, and `difficulty`.
12. `quizAttempts`: Completed MCQ and descriptive practice attempts indexed by `subjectId`, `topicId`, and `createdAt`.
13. `quizResponses`: Per-question responses and mistake categories indexed by `attemptId`, `questionId`, and `mistakeCategory`.
14. `revisionItems`: Spaced repetition items indexed by `dueDate`, `status`, `topicId`, and `subjectId`.
15. `currentAffairs`: Monthly current affairs entries indexed by `date`, `category`, and `revisionFlag`.
16. `aiConversations`: Grounded AI Tutor interaction history indexed by `topicId`, `subjectId`, and `createdAt`.
17. `syncOperations`: Outbound sync queue indexed by `status`, `entityType`, and `createdAt`.
18. `syncConflicts`: Detected local-vs-cloud conflict records awaiting user resolution (`keep_local`, `accept_remote`, `fork_both`).
19. `migrationCheckpoints`: Idempotent checkpoints for legacy `localStorage` and base64 attachment migrations.
