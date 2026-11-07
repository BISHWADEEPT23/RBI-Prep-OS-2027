import React, { useEffect, useMemo, useState } from 'react';
import { authenticatedAiFetch } from '../aiApi';
import { addDaysToDateStr, getKolkataDateString, useStudy } from '../context/StudyContext';
import { makeSafeId } from '../firebase';
import {
  MigrationExecutionReport,
  runLegacyAttachmentMigration,
  runLocalLegacyAttachmentMigration,
  scanLegacyEmbeddedAttachments,
} from '../migration';
import {
  blobToTemporaryDataUrl,
  deleteStudyAttachment,
  downloadStudyAttachmentBlob,
  retryAttachmentUpload,
  uploadStudyAttachment,
} from '../storage';
import { VaultAttachment, VaultNoteRecord } from '../types';
import { AttachmentCard, formatBytes } from './AttachmentChipAndPreview';
import { AuthDiagnosticsPanel } from './AuthDiagnosticsPanel';

export const KnowledgeVault: React.FC = () => {
  const {
    user,
    isOnline,
    aiStatus,
    allSubjects,
    topics,
    notes,
    sessions,
    syncConflicts,
    resolveSyncConflict,
    retryPendingOfflineUploads,
    runAuthPreflight,
    saveVaultNote,
    deleteVaultNote,
    saveRevisionItem,
    exportWorkspaceJson,
    openAiTutorWithContext,
    showSnackbar,
  } = useStudy();

  const [activeSubView, setActiveSubView] = useState<
    'repository' | 'screenshot_workflow' | 'editor' | 'migration'
  >('repository');

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSubject, setFilterSubject] = useState('All');
  const [filterSourceType, setFilterSourceType] = useState('All');

  // Note Editor state
  const [editingNoteId, setEditingNoteId] = useState<string | undefined>(undefined);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteSubject, setNoteSubject] = useState('Finance');
  const [noteTopicTitle, setNoteTopicTitle] = useState('Functions of RBI');
  const [noteSessionId, setNoteSessionId] = useState('');
  const [noteSourceType, setNoteSourceType] = useState<VaultNoteRecord['sourceType']>('note');
  const [noteSourceUrl, setNoteSourceUrl] = useState('');
  const [noteTagsCsv, setNoteTagsCsv] = useState('RBI Act 1934, Monetary Policy');
  const [noteContent, setNoteContent] = useState('');
  const [noteOriginalExtracted, setNoteOriginalExtracted] = useState('');
  const [noteAttachments, setNoteAttachments] = useState<VaultAttachment[]>([]);
  const [autosaveStatus, setAutosaveStatus] = useState<
    'Idle' | 'Draft buffered locally' | 'Saved'
  >('Idle');

  // Upload progress state
  const [uploadingFilesCount, setUploadingFilesCount] = useState(0);
  const [uploadProgressPct, setUploadProgressPct] = useState(0);
  const [uploadBannerError, setUploadBannerError] = useState<string | null>(null);

  // Image / PDF Zoom Modal, Version History Modal, Delete Note Confirmation & Remove Attachment Confirmation
  const [zoomedItem, setZoomedItem] = useState<{
    attachment: VaultAttachment;
    url: string;
  } | null>(null);
  const [historyNote, setHistoryNote] = useState<VaultNoteRecord | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [attachmentRemovalTarget, setAttachmentRemovalTarget] = useState<{
    context: 'editor' | 'workflow' | 'saved_note';
    note?: VaultNoteRecord;
    attachment: VaultAttachment;
  } | null>(null);

  // 10-Step Screenshot-to-Notes Interactive Workflow State (Phase 5 & Phase 6 Offline/Online Separation)
  const [wfScreenshots, setWfScreenshots] = useState<VaultAttachment[]>([]);
  const [wfSubject, setWfSubject] = useState('Finance');
  const [wfTopic, setWfTopic] = useState('Functions of RBI');
  const [wfSessionId, setWfSessionId] = useState('');
  const [wfStep, setWfStep] = useState<number>(1);
  const [wfLoading, setWfLoading] = useState(false);
  const [wfWarnings, setWfWarnings] = useState<string[]>([]);
  const [wfExtractedText, setWfExtractedText] = useState('');
  const [wfStructuredTitle, setWfStructuredTitle] = useState('');
  const [wfStructuredNotes, setWfStructuredNotes] = useState('');
  const [wfSuggestedTags, setWfSuggestedTags] = useState('');
  const [wfScheduleRevision, setWfScheduleRevision] = useState(true);

  // Phase 4 Legacy Migration State
  const legacyInventory = useMemo(() => scanLegacyEmbeddedAttachments(notes), [notes]);
  const [migrationRunning, setMigrationRunning] = useState(false);
  const [migrationStatusText, setMigrationStatusText] = useState('');
  const [migrationReport, setMigrationReport] = useState<MigrationExecutionReport | null>(null);
  const [backupExportedBeforeMigration, setBackupExportedBeforeMigration] = useState(false);

  // Local draft autosave buffer for note editor
  useEffect(() => {
    if (activeSubView !== 'editor' || !noteContent.trim()) return;
    setAutosaveStatus('Draft buffered locally');
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(
          'rbi_vault_editor_draft',
          JSON.stringify({ noteTitle, noteSubject, noteTopicTitle, noteContent })
        );
      } catch {
        // Ignore storage quota warning
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [activeSubView, noteTitle, noteSubject, noteTopicTitle, noteContent]);

  const filteredNotes = notes.filter((n) => {
    const matchesSearch =
      !searchQuery.trim() ||
      n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.topicTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (n.tagsCsv && n.tagsCsv.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesSubject = filterSubject === 'All' || n.subject === filterSubject;
    const matchesType = filterSourceType === 'All' || n.sourceType === filterSourceType;
    return matchesSearch && matchesSubject && matchesType;
  });

  const handleOpenNewNoteEditor = () => {
    setEditingNoteId(undefined);
    setNoteTitle('');
    setNoteSubject('Finance');
    setNoteTopicTitle(topics[0]?.title || 'Functions of RBI');
    setNoteSessionId('');
    setNoteSourceType('note');
    setNoteSourceUrl('');
    setNoteTagsCsv('RBI Grade B, Core Note');
    setNoteContent('');
    setNoteOriginalExtracted('');
    setNoteAttachments([]);
    setUploadBannerError(null);
    setActiveSubView('editor');
  };

  const handleOpenEditNote = (note: VaultNoteRecord) => {
    setEditingNoteId(note.id);
    setNoteTitle(note.title);
    setNoteSubject(note.subject);
    setNoteTopicTitle(note.topicTitle);
    setNoteSessionId(note.sessionId || '');
    setNoteSourceType(note.sourceType);
    setNoteSourceUrl(note.sourceUrl || '');
    setNoteTagsCsv(note.tagsCsv || '');
    setNoteContent(note.content);
    setNoteOriginalExtracted(note.originalExtractedText || '');
    setNoteAttachments(note.attachments || []);
    setUploadBannerError(null);
    setActiveSubView('editor');
  };

  const handleSaveEditorNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteTitle.trim() || !noteContent.trim()) return;
    const matchedTopic = topics.find(
      (t) =>
        t.subject === noteSubject &&
        t.title.toLowerCase() === noteTopicTitle.toLowerCase()
    );
    const existingNote = editingNoteId
      ? notes.find((n) => n.id === editingNoteId)
      : undefined;

    await saveVaultNote({
      id: editingNoteId,
      title: noteTitle.trim(),
      subject: noteSubject,
      topicId: matchedTopic?.id,
      topicTitle: noteTopicTitle.trim() || 'General',
      sessionId: noteSessionId || undefined,
      sourceType: noteSourceType,
      content: noteContent,
      originalExtractedText: noteOriginalExtracted || undefined,
      sourceUrl: noteSourceUrl.trim() || undefined,
      tagsCsv: noteTagsCsv.trim() || undefined,
      attachments: noteAttachments,
      version: existingNote ? existingNote.version : 1,
      history: existingNote ? existingNote.history : [],
    });
    setAutosaveStatus('Saved');
    setActiveSubView('repository');
  };

  // Phase 4: Upload files into local IndexedDB binary store (with magic-byte check, 10MB cap, SHA-256 checksum & progress)
  const handleFileAttachmentInput = async (
    e: React.ChangeEvent<HTMLInputElement>,
    target: 'editor' | 'workflow'
  ) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    e.target.value = '';

    setUploadBannerError(null);
    setUploadingFilesCount(files.length);
    setUploadProgressPct(0);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const uploadedAtt = await uploadStudyAttachment({
            file,
            fileName: file.name,
            noteId: target === 'editor' ? editingNoteId : undefined,
            sessionId: target === 'editor' ? noteSessionId || undefined : wfSessionId || undefined,
            onProgress: (pct) => {
              const overall = Math.round(((i + pct / 100) / files.length) * 100);
              setUploadProgressPct(overall);
            },
          });

          if (target === 'editor') {
            setNoteAttachments((prev) => {
              if (
                prev.some(
                  (p) =>
                    (p.checksum && p.checksum === uploadedAtt.checksum) ||
                    p.id === uploadedAtt.id
                )
              ) {
                showSnackbar(`Skipped duplicate attachment: ${uploadedAtt.fileName}`);
                return prev;
              }
              return [...prev, uploadedAtt];
            });
          } else {
            setWfScreenshots((prev) => {
              if (
                prev.some(
                  (p) =>
                    (p.checksum && p.checksum === uploadedAtt.checksum) ||
                    (p.fileName === uploadedAtt.fileName &&
                      p.sizeBytes === uploadedAtt.sizeBytes)
                )
              ) {
                setWfWarnings((w) => [
                  ...w,
                  `Duplicate upload detected and skipped: ${uploadedAtt.fileName}`,
                ]);
                return prev;
              }
              return [...prev, uploadedAtt];
            });
            setWfStep((prev) => Math.max(prev, 2));
          }
        } catch (fileErr) {
          const errMsg =
            fileErr instanceof Error ? fileErr.message : 'File validation failed.';
          setUploadBannerError(errMsg);
          showSnackbar(errMsg);
        }
      }
    } finally {
      setUploadingFilesCount(0);
      setUploadProgressPct(0);
    }
  };

  const handleRetryAttachment = async (
    att: VaultAttachment,
    context: 'editor' | 'workflow' | 'saved_note',
    parentNote?: VaultNoteRecord
  ) => {
    try {
      const updatedAtt = await retryAttachmentUpload(att, (pct) =>
        setUploadProgressPct(pct)
      );
      if (context === 'editor') {
        setNoteAttachments((prev) =>
          prev.map((a) => (a.id === att.id ? updatedAtt : a))
        );
      } else if (context === 'workflow') {
        setWfScreenshots((prev) =>
          prev.map((a) => (a.id === att.id ? updatedAtt : a))
        );
      } else if (context === 'saved_note' && parentNote) {
        await saveVaultNote({
          ...parentNote,
          id: parentNote.id,
          attachments: (parentNote.attachments || []).map((a) =>
            a.id === att.id ? updatedAtt : a
          ),
        });
      }
      if (updatedAtt.uploadStatus === 'uploaded') {
        showSnackbar(`Uploaded "${updatedAtt.fileName}" to Firebase Storage.`);
      } else {
        showSnackbar(
          `Saved "${updatedAtt.fileName}" locally on this device.`
        );
      }
    } catch (err) {
      showSnackbar(err instanceof Error ? err.message : 'Retry upload failed.');
    } finally {
      setUploadProgressPct(0);
    }
  };

  const handleConfirmRemoveAttachment = async () => {
    if (!attachmentRemovalTarget) return;
    const { context, note, attachment } = attachmentRemovalTarget;
    try {
      await deleteStudyAttachment(attachment);
      if (context === 'editor') {
        setNoteAttachments((prev) => prev.filter((a) => a.id !== attachment.id));
      } else if (context === 'workflow') {
        setWfScreenshots((prev) => prev.filter((a) => a.id !== attachment.id));
      } else if (context === 'saved_note' && note) {
        await saveVaultNote({
          ...note,
          id: note.id,
          attachments: (note.attachments || []).filter((a) => a.id !== attachment.id),
        });
      }
      showSnackbar(`Removed attachment "${attachment.fileName}".`);
    } catch (err) {
      showSnackbar(
        err instanceof Error ? err.message : 'Failed to remove attachment.'
      );
    } finally {
      setAttachmentRemovalTarget(null);
    }
  };

  const handleGenerateSampleLectureSlide = async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 920;
    canvas.height = 540;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#f6fbf8';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#158e7f';
    ctx.fillRect(0, 0, canvas.width, 72);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('RBI GRADE B — FINANCE: FUNCTIONS OF RBI (RBI ACT, 1934)', 32, 45);

    ctx.fillStyle = '#171d1b';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('1. Monetary Authority & Price Stability (Section 45ZB - MPC)', 36, 125);
    ctx.font = '17px sans-serif';
    ctx.fillText('• Inflation Target: 4% CPI (+/- 2% tolerance band: 2% to 6%).', 52, 160);
    ctx.fillText('• Monetary Policy Committee: 6 members (3 RBI + 3 Govt nominated).', 52, 190);

    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('2. Issuer of Currency (Section 22 of RBI Act, 1934)', 36, 245);
    ctx.font = '17px sans-serif';
    ctx.fillText('• Minimum Reserve System (since 1956): Rs. 200 Crore total reserve', 52, 280);
    ctx.fillText(
      '  (Minimum Rs. 115 Crore in Gold Coin/Bullion + Rs. 85 Crore Foreign Securities).',
      52,
      310
    );

    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(
      '3. Banker to Government (Sections 20, 21 & 21A) & Ways and Means Advances',
      36,
      365
    );
    ctx.font = '17px sans-serif';
    ctx.fillText(
      '• Manages public debt and provides temporary WMA to bridge mismatches.',
      52,
      400
    );
    ctx.fillText('• Banker to Banks & Lender of Last Resort (Section 17 & 18).', 52, 435);

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png')
    );
    if (!blob) return;

    setUploadingFilesCount(1);
    try {
      const uploadedAtt = await uploadStudyAttachment({
        file: blob,
        fileName: 'RBI_Functions_Lecture_Slide.png',
        sessionId: wfSessionId || undefined,
        onProgress: (pct) => setUploadProgressPct(pct),
      });
      setWfScreenshots((prev) => [...prev, uploadedAtt]);
      setWfSubject('Finance');
      setWfTopic('Functions of RBI');
      setWfStep(3);
      showSnackbar('Saved sample RBI slide in local IndexedDB and ready for OCR or manual transcription!');
    } finally {
      setUploadingFilesCount(0);
      setUploadProgressPct(0);
    }
  };

  // Offline Manual Continuation Path (Phase 6: Never block Screenshot-to-Notes if offline or Gemini unavailable)
  const handleOfflineManualStructuring = () => {
    const raw =
      wfExtractedText.trim() ||
      `[Manual Transcription for ${wfTopic} (${wfSubject})]\n• Key Concept / Statutory Provision:\n• Core Mechanism:\n• Exam Takeaways:`;
    if (!wfExtractedText.trim()) {
      setWfExtractedText(raw);
    }
    setWfStructuredTitle(`${wfTopic} — Structured Study Notes`);
    setWfStructuredNotes(
      `### ${wfTopic} (${wfSubject})\n\n#### 1. Core Transcription & Key Facts\n${raw}\n\n#### 2. RBI Grade B Exam Highlights\n- Verify statutory sections and recent circular updates.\n- Review key numbers and committee recommendations.`
    );
    setWfSuggestedTags(`${wfSubject}, ${wfTopic}, Offline Screenshot Note`);
    setWfStep(8);
    showSnackbar(
      'Prepared structured note draft offline. Review and click "Save Final Note" below.'
    );
  };

  // Step 4 (Online AI): Analyze Screenshots using Gemini OCR
  const handleRunStep4GeminiExtract = async () => {
    if (wfScreenshots.length === 0) return;
    if (!isOnline) {
      showSnackbar(
        'AI Tutor needs an internet connection. Switching to offline manual transcription.'
      );
      handleOfflineManualStructuring();
      return;
    }
    setWfLoading(true);
    try {
      const imagePayloads: Array<{ fileName: string; mimeType: string; data: string }> = [];
      for (const att of wfScreenshots) {
        const blob = await downloadStudyAttachmentBlob(att);
        const tempBase64 = await blobToTemporaryDataUrl(blob);
        imagePayloads.push({
          fileName: att.fileName,
          mimeType: att.mimeType,
          data: tempBase64,
        });
      }

      const response = await authenticatedAiFetch('/api/ai/screenshot-ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: 'extract',
          subject: wfSubject,
          topic: wfTopic,
          images: imagePayloads,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || 'Failed to extract text from screenshots');
      setWfExtractedText(data.combinedRawText || '');
      if (Array.isArray(data.warnings) && data.warnings.length > 0) {
        setWfWarnings((prev) => [...prev, ...data.warnings]);
      }
      setWfStep(6);
      showSnackbar('Step 5–6 ready: Review and edit extracted screenshot text.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Screenshot OCR error.';
      setWfWarnings((prev) => [
        ...prev,
        `${msg} — Your uploaded screenshots and draft are preserved locally. You can transcribe manually below.`,
      ]);
      showSnackbar(`${msg} — You can continue manually offline.`);
    } finally {
      setWfLoading(false);
    }
  };

  // Step 7 (Online AI): Produce Structured Study Notes from Reviewed Text
  const handleRunStep7StructureNotes = async () => {
    if (!wfExtractedText.trim()) return;
    if (!isOnline) {
      handleOfflineManualStructuring();
      return;
    }
    setWfLoading(true);
    try {
      const response = await authenticatedAiFetch('/api/ai/screenshot-ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: 'structure',
          subject: wfSubject,
          topic: wfTopic,
          reviewedText: wfExtractedText,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to structure notes');
      setWfStructuredTitle(
        data.suggestedTitle || `${wfTopic} — Structured Screenshot Notes`
      );
      setWfStructuredNotes(data.structuredNoteMarkdown || wfExtractedText);
      setWfSuggestedTags(
        Array.isArray(data.suggestedTags)
          ? data.suggestedTags.join(', ')
          : `${wfSubject}, ${wfTopic}`
      );
      setWfStep(8);
      showSnackbar(
        'Step 7–8 ready: Review and refine structured study notes before saving.'
      );
    } catch (err) {
      showSnackbar(
        `${
          err instanceof Error ? err.message : 'Note structuring error.'
        } Switched to offline structured template.`
      );
      handleOfflineManualStructuring();
    } finally {
      setWfLoading(false);
    }
  };

  // Step 9 & 10: Save Final Note & Associate with Topic & Session (storing Firebase Storage paths, NOT base64)
  const handleStep9SaveFinalNote = async () => {
    const matchedTopic = topics.find(
      (t) =>
        t.subject === wfSubject &&
        t.title.toLowerCase() === wfTopic.toLowerCase()
    );
    const savedNote = await saveVaultNote({
      title: wfStructuredTitle.trim() || `${wfTopic} — Screenshot Study Notes`,
      subject: wfSubject,
      topicId: matchedTopic?.id,
      topicTitle: wfTopic.trim() || 'Functions of RBI',
      sessionId: wfSessionId || undefined,
      sourceType: 'screenshot',
      content: wfStructuredNotes || wfExtractedText,
      originalExtractedText: wfExtractedText,
      tagsCsv: wfSuggestedTags,
      attachments: wfScreenshots.map((att) => ({
        ...att,
        extractedText: wfExtractedText.slice(0, 2000),
      })),
      version: 1,
      history: [],
    });

    if (wfScheduleRevision) {
      const dueDate = addDaysToDateStr(getKolkataDateString(), 1);
      await saveRevisionItem({
        topicId: matchedTopic?.id || makeSafeId('topic'),
        topicTitle: savedNote.topicTitle,
        subject: savedNote.subject,
        phase: matchedTopic?.phase || 'Phase II',
        intervalDays: 1,
        stageLabel: 'Day 1 Screenshot Note Review',
        dueDate,
        status: 'upcoming',
        confidence: 4,
        recommendationReason: `Scheduled Day 1 review for newly structured screenshot note "${savedNote.title}".`,
      });
    }

    setWfScreenshots([]);
    setWfExtractedText('');
    setWfStructuredNotes('');
    setWfStep(1);
    setActiveSubView('repository');
  };

  const handleDownloadNoteMarkdown = (note: VaultNoteRecord) => {
    const attachmentSection =
      note.attachments && note.attachments.length > 0
        ? `\n\n---\n## Attachment Metadata (${note.attachments.length})\n` +
          note.attachments
            .map(
              (a) =>
                `- **${a.fileName}** | MIME: \`${a.mimeType}\` | Size: ${formatBytes(
                  a.sizeBytes
                )} | Status: \`${a.uploadStatus || 'uploaded'}\` | Storage Path: \`${
                  a.storagePath || 'local_indexeddb'
                }\` | Checksum: \`${a.checksum || 'n/a'}\``
            )
            .join('\n')
        : '';

    const blob = new Blob(
      [
        `# ${note.title}\nSubject: ${note.subject} | Topic: ${note.topicTitle} | Version: v${note.version}\nUpdated: ${note.updatedAtIso}\n\n${note.content}\n\n${
          note.originalExtractedText
            ? `---\n## Original Preserved OCR Extraction\n${note.originalExtractedText}`
            : ''
        }${attachmentSection}`,
      ],
      { type: 'text/markdown;charset=utf-8' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${note.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Phase 4: Create a sample legacy embedded base64 note so the user/QA can test the migration workflow anytime
  const handleCreateSampleLegacyEmbeddedNote = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 480;
    canvas.height = 260;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#fff8e6';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0c695d';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('LEGACY BASE64 SCREENSHOT — RBI LAF CORRIDOR', 24, 50);
    ctx.fillStyle = '#222222';
    ctx.font = '15px sans-serif';
    ctx.fillText('• Repo Rate: Policy Rate set by 6-member MPC (Sec 45ZB)', 24, 95);
    ctx.fillText('• SDF Rate: Uncollateralized floor (Repo - 25 bps)', 24, 130);
    ctx.fillText('• MSF Rate: Penal ceiling rate (Repo + 25 bps)', 24, 165);

    const legacyDataUrl = canvas.toDataURL('image/png');
    saveVaultNote({
      title: 'Functions of RBI — Legacy Base64 Embedded Note (Pre-Patch 02)',
      subject: 'Finance',
      topicTitle: 'Functions of RBI',
      sourceType: 'screenshot',
      content:
        '### Liquidity Adjustment Facility (LAF)\n- **Repo Rate**: Policy rate determined by the Monetary Policy Committee.\n- **Standing Deposit Facility (SDF)**: Floor of the LAF corridor without collateral requirement.\n- **Marginal Standing Facility (MSF)**: Ceiling of the LAF corridor.',
      originalExtractedText:
        'LEGACY BASE64 SCREENSHOT — RBI LAF CORRIDOR\nRepo Rate, SDF Rate, MSF Rate',
      tagsCsv: 'Finance, Functions of RBI, Legacy Migration Test',
      attachments: [
        {
          id: makeSafeId('legacy_att'),
          fileName: 'Legacy_RBI_LAF_Slide.png',
          mimeType: 'image/png',
          sizeBytes: Math.round((legacyDataUrl.length * 3) / 4),
          dataUrl: legacyDataUrl,
          uploadStatus: 'legacy_embedded',
          createdAtIso: new Date().toISOString(),
        },
      ],
      version: 1,
      history: [],
    });
  };

  const handleExportPreMigrationBackup = () => {
    const json = exportWorkspaceJson();
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rbi_prep_os_pre_migration_backup_${getKolkataDateString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setBackupExportedBeforeMigration(true);
    showSnackbar('Downloaded pre-migration JSON backup.');
  };

  const handleExecuteLocalMigration = async () => {
    setMigrationRunning(true);
    setMigrationStatusText('Running Local IndexedDB Attachment Migration...');
    try {
      const report = await runLocalLegacyAttachmentMigration({
        notes,
        saveMigratedNote: async (migratedNote) =>
          saveVaultNote({
            ...migratedNote,
            id: migratedNote.id,
          }),
        onProgress: (curr, total, status) => {
          setMigrationStatusText(`[${curr}/${total}] ${status}`);
        },
      });
      setMigrationReport(report);
      showSnackbar(
        `Local migration complete: ${report.migratedCount} migrated to IndexedDB, ${report.alreadyMigratedCount} skipped, ${report.failedCount} failed.`
      );
    } catch (err) {
      showSnackbar(err instanceof Error ? err.message : 'Local migration failed.');
    } finally {
      setMigrationRunning(false);
      setMigrationStatusText('');
    }
  };

  const handleExecuteLegacyMigration = async () => {
    if (!user || !user.emailVerified) {
      showSnackbar(
        'Sign-In verification required: Please sign in with a verified Google account before running Firebase Storage migration.'
      );
      return;
    }
    setMigrationRunning(true);
    setMigrationStatusText('Verifying Firebase Authentication & API Key Referrer preflight...');
    try {
      const preflight = await runAuthPreflight();
      if (!preflight.refererAllowedByApiKey) {
        throw new Error(
          `Sign-In / API Key Referrer check blocked (${preflight.statusSummary}). Please add the preview referrer URL in Google Cloud Console first.`
        );
      }
      setMigrationStatusText('Initializing migration inventory...');
      const report = await runLegacyAttachmentMigration({
        notes,
        saveMigratedNote: async (migratedNote) =>
          saveVaultNote({
            ...migratedNote,
            id: migratedNote.id,
          }),
        onProgress: (curr, total, status) => {
          setMigrationStatusText(`[${curr}/${total}] ${status}`);
        },
      });
      setMigrationReport(report);
      showSnackbar(
        `Migration finished: ${report.migratedCount} migrated, ${report.alreadyMigratedCount} skipped, ${report.failedCount} failed.`
      );
    } catch (err) {
      showSnackbar(err instanceof Error ? err.message : 'Migration failed.');
    } finally {
      setMigrationRunning(false);
      setMigrationStatusText('');
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Header & Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-xs font-medium text-[var(--md-on-surface-variant)]">
            Personal Knowledge Repository · Local-First IndexedDB &amp; Optional Cloud Storage
          </span>
          <h1 className="font-display text-2xl md:text-3xl font-semibold text-[var(--md-on-surface)]">
            Knowledge Vault
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveSubView('repository')}
            className={`px-4 py-2 rounded-full text-xs font-medium cursor-pointer ${
              activeSubView === 'repository'
                ? 'bg-[var(--md-primary)] text-[var(--md-on-primary)]'
                : 'bg-[var(--md-surface-container)] text-[var(--md-on-surface)]'
            }`}
          >
            All Notes ({notes.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveSubView('screenshot_workflow')}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium cursor-pointer ${
              activeSubView === 'screenshot_workflow'
                ? 'bg-[var(--md-primary)] text-[var(--md-on-primary)]'
                : 'bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)]'
            }`}
          >
            <span className="material-symbols-rounded text-[16px]">document_scanner</span>
            <span>Screenshot-to-Notes Studio</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubView('migration')}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium cursor-pointer ${
              activeSubView === 'migration'
                ? 'bg-[var(--md-primary)] text-[var(--md-on-primary)]'
                : legacyInventory.totalLegacyAttachments > 0
                ? 'bg-[#f3e8ff] text-[#6b21a8] font-semibold'
                : 'bg-[var(--md-surface-container)] text-[var(--md-on-surface)]'
            }`}
          >
            <span className="material-symbols-rounded text-[16px]">cloud_upload</span>
            <span>
              Storage Migration ({legacyInventory.totalLegacyAttachments})
            </span>
          </button>
          <button
            type="button"
            onClick={handleOpenNewNoteEditor}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-[var(--md-outline-variant)] text-xs font-medium cursor-pointer"
          >
            <span className="material-symbols-rounded text-[16px]">edit_note</span>
            <span>New Note</span>
          </button>
        </div>
      </div>

      {/* Offline / Connectivity Status Banner */}
      {!isOnline && (
        <div className="p-3.5 rounded-[16px] bg-[#fff4d6] text-[#7a5200] text-xs flex items-center justify-between gap-3 border border-[#f5d98e]">
          <span>
            <strong>Offline Mode Active:</strong> Notes and screenshot/PDF attachments are saved directly on this device in IndexedDB (`rbi_prep_os_2027`). You can attach screenshots, transcribe notes, and schedule revisions completely offline.
          </span>
        </div>
      )}

      {/* Phase 6: Synchronization Conflict Banner */}
      {syncConflicts.length > 0 && (
        <div className="p-4 rounded-[20px] bg-[#fff4d6] text-[#5c3c00] border border-[#f0c36d] space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider">
            Synchronization Conflict Detected ({syncConflicts.length})
          </div>
          {syncConflicts.map((conflict) => (
            <div
              key={conflict.noteId}
              className="p-3 rounded-[14px] bg-white/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
            >
              <div>
                <p className="font-semibold text-[#222]">{conflict.noteTitle}</p>
                <p className="text-[11px] text-[#555]">
                  Local edit ({new Date(conflict.localNote.updatedAtIso).toLocaleTimeString()}) differs from Cloud version (v{conflict.remoteNote.version}). Choose which version to keep:
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => resolveSyncConflict(conflict.noteId, 'keep_local')}
                  className="px-3 py-1.5 rounded-full bg-[#199989] text-white font-semibold cursor-pointer"
                >
                  Keep Local
                </button>
                <button
                  type="button"
                  onClick={() => resolveSyncConflict(conflict.noteId, 'accept_remote')}
                  className="px-3 py-1.5 rounded-full bg-[#eee] text-[#222] font-medium cursor-pointer"
                >
                  Accept Cloud
                </button>
                <button
                  type="button"
                  onClick={() => resolveSyncConflict(conflict.noteId, 'fork_both')}
                  className="px-3 py-1.5 rounded-full border border-[#199989] text-[#0c695d] font-semibold cursor-pointer"
                >
                  Save Both (Fork)
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Progress & Validation Error Bar */}
      {uploadingFilesCount > 0 && (
        <div className="p-3.5 rounded-[16px] bg-[#e0f2fe] text-[#0369a1] text-xs space-y-1.5">
          <div className="flex items-center justify-between font-semibold">
            <span>
              Validating magic bytes &amp; saving {uploadingFilesCount} attachment(s)...
            </span>
            <span>{uploadProgressPct}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-white/70 overflow-hidden">
            <div
              className="h-full bg-[#0284c7] transition-all"
              style={{ width: `${uploadProgressPct}%` }}
            />
          </div>
        </div>
      )}

      {uploadBannerError && (
        <div className="p-3.5 rounded-[16px] bg-[var(--md-error-container)] text-[var(--md-on-error-container)] text-xs flex items-center justify-between">
          <span>
            <strong>Attachment Validation Notice:</strong> {uploadBannerError}
          </span>
          <button
            type="button"
            onClick={() => setUploadBannerError(null)}
            className="text-xs underline ml-3 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* VIEW 4: PHASE 4 SAFE LEGACY BASE64-TO-STORAGE MIGRATION TOOL */}
      {activeSubView === 'migration' && (
        <div className="rounded-[28px] bg-[var(--md-surface-container-low)] p-6 md:p-8 border border-[var(--md-outline-variant)]/50 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--md-outline-variant)]/40 pb-4">
            <div>
              <span className="text-xs font-medium text-[var(--md-primary)]">
                Phase 4 — Idempotent, Checkpointed Legacy Base64 Migration (Local IndexedDB + Optional Cloud)
              </span>
              <h2 className="font-display text-xl font-semibold text-[var(--md-on-surface)] mt-0.5">
                Attachment Storage Migration Center
              </h2>
              <p className="text-xs text-[var(--md-on-surface-variant)] mt-1 max-w-2xl">
                Scans existing Knowledge Vault notes for legacy embedded <code>data:...;base64</code> images/PDFs, converts them into verified binary <code>Blob</code> records in local IndexedDB (<code>rbi_prep_os_2027</code>) with SHA-256 read-back verification, and removes embedded base64 strings only after verification succeeds. No Google Sign-In is required for Local IndexedDB Migration.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCreateSampleLegacyEmbeddedNote}
                className="px-3.5 py-2 rounded-full bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)] text-xs font-medium cursor-pointer"
              >
                + Create Sample Legacy Base64 Note
              </button>
              <button
                type="button"
                onClick={() => retryPendingOfflineUploads()}
                className="px-3.5 py-2 rounded-full border border-[var(--md-outline-variant)] text-xs font-medium cursor-pointer"
              >
                Sync Pending Offline Queue
              </button>
            </div>
          </div>

          {!user && <AuthDiagnosticsPanel />}

          {/* Inventory Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-[18px] bg-[var(--md-surface)] border border-[var(--md-outline-variant)]/50">
              <p className="text-xs text-[var(--md-on-surface-variant)]">
                Notes with Legacy Embedded Base64
              </p>
              <p className="font-mono-tabular text-2xl font-bold text-[var(--md-on-surface)] mt-1">
                {legacyInventory.totalLegacyNotes}
              </p>
            </div>
            <div className="p-4 rounded-[18px] bg-[var(--md-surface)] border border-[var(--md-outline-variant)]/50">
              <p className="text-xs text-[var(--md-on-surface-variant)]">
                Legacy Attachments Pending Migration
              </p>
              <p className="font-mono-tabular text-2xl font-bold text-[var(--md-primary)] mt-1">
                {legacyInventory.totalLegacyAttachments}
              </p>
            </div>
            <div className="p-4 rounded-[18px] bg-[var(--md-surface)] border border-[var(--md-outline-variant)]/50">
              <p className="text-xs text-[var(--md-on-surface-variant)]">
                Estimated Payload Reduction
              </p>
              <p className="font-mono-tabular text-2xl font-bold text-[var(--md-on-surface)] mt-1">
                {formatBytes(legacyInventory.totalBase64Chars)}
              </p>
            </div>
          </div>

          {/* Migration Inventory Table */}
          {legacyInventory.items.length > 0 ? (
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--md-on-surface-variant)]">
                Pre-Migration Inventory ({legacyInventory.items.length} embedded item(s))
              </h3>
              <div className="divide-y divide-[var(--md-outline-variant)]/40 rounded-[16px] bg-[var(--md-surface)] border border-[var(--md-outline-variant)]/50 overflow-hidden">
                {legacyInventory.items.map((item) => (
                  <div
                    key={`${item.noteId}:${item.attachmentId}`}
                    className="p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <span className="font-semibold text-[var(--md-on-surface)]">
                        {item.fileName}
                      </span>{' '}
                      <span className="text-[var(--md-on-surface-variant)]">
                        in note &ldquo;{item.noteTitle}&rdquo; ({item.subject})
                      </span>
                    </div>
                    <div className="font-mono-tabular text-[11px] text-[var(--md-on-surface-variant)]">
                      {item.mimeType} · ~{formatBytes(item.estimatedDecodedBytes)} ({formatBytes(item.base64StringLength)} base64)
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-6 rounded-[18px] bg-[var(--md-surface)] border border-dashed border-[var(--md-outline-variant)] text-center text-xs text-[var(--md-on-surface-variant)]">
              Zero unmigrated legacy base64 attachments detected in your Knowledge Vault. All current attachments use local IndexedDB Blob storage or Firebase Storage references.
            </div>
          )}

          {/* Step-by-Step Safe Execution Controls */}
          <div className="p-5 rounded-[20px] bg-[var(--md-surface)] border border-[var(--md-outline-variant)]/60 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-[var(--md-on-surface)]">
                Safe Migration Execution Sequence
              </p>
              <p className="text-[11px] text-[var(--md-on-surface-variant)]">
                1. Export a pre-migration JSON backup first. 2. Run Local IndexedDB Migration (no sign-in required) or Cloud Migration.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={handleExportPreMigrationBackup}
                className="px-4 py-2 rounded-full border border-[var(--md-outline-variant)] text-xs font-medium cursor-pointer"
              >
                {backupExportedBeforeMigration
                  ? '✓ Pre-Migration Backup Exported'
                  : 'Step 1: Export Pre-Migration Backup'}
              </button>

              <button
                type="button"
                disabled={
                  migrationRunning ||
                  legacyInventory.totalLegacyAttachments === 0
                }
                onClick={handleExecuteLocalMigration}
                className="px-5 py-2 rounded-full bg-[var(--md-primary)] text-[var(--md-on-primary)] text-xs font-semibold disabled:opacity-50 cursor-pointer"
              >
                {migrationRunning
                  ? migrationStatusText || 'Migrating & Verifying...'
                  : 'Step 2A: Migrate to Local IndexedDB (No Sign-In Needed)'}
              </button>

              <button
                type="button"
                disabled={
                  migrationRunning ||
                  legacyInventory.totalLegacyAttachments === 0 ||
                  !user
                }
                onClick={handleExecuteLegacyMigration}
                className="px-4 py-2 rounded-full bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)] text-xs font-semibold disabled:opacity-50 cursor-pointer"
              >
                {!user
                  ? 'Step 2B: Cloud Migration (Sign-In Optional)'
                  : 'Step 2B: Migrate to Firebase Cloud Storage'}
              </button>
            </div>
          </div>

          {/* Migration Report */}
          {migrationReport && (
            <div className="p-5 rounded-[20px] bg-[var(--md-surface)] border border-[var(--md-primary)]/40 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-[var(--md-on-surface)]">
                  Migration Execution Report
                </h3>
                <span className="text-xs font-mono-tabular text-[var(--md-primary)] font-semibold">
                  Freed {formatBytes(migrationReport.totalFirestoreBytesFreed)} from embedded note payloads
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="p-2.5 rounded-lg bg-[#def4ef] text-[#0c695d] font-semibold">
                  Migrated &amp; Verified: {migrationReport.migratedCount}
                </div>
                <div className="p-2.5 rounded-lg bg-[#e0f2fe] text-[#0369a1] font-semibold">
                  Skipped (Idempotent): {migrationReport.alreadyMigratedCount}
                </div>
                <div className="p-2.5 rounded-lg bg-[#ffe8e5] text-[#8a1f17] font-semibold">
                  Failed (Originals Preserved): {migrationReport.failedCount}
                </div>
              </div>
              <div className="divide-y divide-[var(--md-outline-variant)]/40 text-xs">
                {migrationReport.results.map((r) => (
                  <div
                    key={`${r.noteId}:${r.attachmentId}`}
                    className="py-2 flex flex-wrap items-center justify-between gap-2"
                  >
                    <div>
                      <strong>{r.fileName}</strong> ({r.noteTitle})
                      {r.storagePath && (
                        <div className="text-[10px] font-mono-tabular text-[var(--md-on-surface-variant)]">
                          Path: {r.storagePath} · SHA-256: #{r.checksum?.slice(0, 12)}
                        </div>
                      )}
                      {r.error && (
                        <div className="text-[11px] text-[var(--md-error)]">
                          {r.error}
                        </div>
                      )}
                    </div>
                    <span className="font-mono-tabular font-semibold">
                      {r.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW 1: 10-STEP SCREENSHOT-TO-NOTES WORKFLOW (Phase 5 & Phase 6) */}
      {activeSubView === 'screenshot_workflow' && (
        <div className="rounded-[28px] bg-[var(--md-surface-container-low)] p-6 md:p-8 border border-[var(--md-outline-variant)]/50 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--md-outline-variant)]/40 pb-4">
            <div>
              <span className="text-xs font-medium text-[var(--md-primary)]">
                10-Step Grounded Studio · Works Offline (Manual Transcription) &amp; Online (Gemini Vision OCR)
              </span>
              <h2 className="font-display text-xl font-semibold text-[var(--md-on-surface)]">
                Screenshot-to-Notes Interactive Workflow
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleOfflineManualStructuring}
                className="px-3.5 py-1.5 rounded-full border border-[var(--md-outline-variant)] text-xs font-medium cursor-pointer"
              >
                Use Offline Note Template
              </button>
              <button
                type="button"
                onClick={handleGenerateSampleLectureSlide}
                className="px-3.5 py-1.5 rounded-full bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)] text-xs font-medium cursor-pointer"
              >
                Load Sample RBI Lecture Slide
              </button>
            </div>
          </div>

          {/* Offline vs Online Capabilities Strip */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="p-3.5 rounded-[16px] bg-[var(--md-surface)] border border-[var(--md-outline-variant)]/50">
              <span className="font-semibold text-[var(--md-primary)]">
                ✓ Available Offline (No Internet / No Sign-In):
              </span>{' '}
              <span className="text-[var(--md-on-surface-variant)]">
                Upload screenshots/PDFs to local IndexedDB, preview &amp; zoom, associate Subject/Topic/Session, manual transcription, structured note template, save to Vault, and schedule Revision.
              </span>
            </div>
            <div className="p-3.5 rounded-[16px] bg-[var(--md-surface)] border border-[var(--md-outline-variant)]/50">
              <span className="font-semibold text-[var(--md-on-surface)]">
                ✦ Online AI Enhancement ({isOnline ? 'Connected' : 'Offline — Manual Fallback Active'}):
              </span>{' '}
              <span className="text-[var(--md-on-surface-variant)]">
                Automated Gemini Vision OCR extraction and AI-generated bullet structuring when connected to the backend.
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 space-y-4">
              <div className="p-5 rounded-[20px] bg-[var(--md-surface)] border border-dashed border-[var(--md-outline)] text-center space-y-3">
                <span className="material-symbols-rounded text-[32px] text-[var(--md-primary)]">
                  upload_file
                </span>
                <p className="text-sm font-medium text-[var(--md-on-surface)]">
                  Step 1: Upload Lecture Screenshots or PDFs (Max 10 MB)
                </p>
                <p className="text-xs text-[var(--md-on-surface-variant)]">
                  Supports PNG, JPEG, WebP screenshots and PDF handouts. Magic-byte verified and stored as binary Blobs in local IndexedDB.
                </p>
                <label className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[var(--md-primary)] text-[var(--md-on-primary)] text-xs font-medium cursor-pointer">
                  <span>Select Screenshot / PDF Files</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,application/pdf"
                    multiple
                    onChange={(e) => handleFileAttachmentInput(e, 'workflow')}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="p-5 rounded-[20px] bg-[var(--md-surface)] border border-[var(--md-outline-variant)]/50 space-y-3">
                <p className="text-xs font-semibold text-[var(--md-on-surface)]">
                  Step 3: Select Subject, Topic &amp; Optional Study Session
                </p>
                <div>
                  <label className="block text-xs text-[var(--md-on-surface-variant)] mb-1">
                    Subject
                  </label>
                  <select
                    value={wfSubject}
                    onChange={(e) => setWfSubject(e.target.value)}
                    className="w-full px-3 py-2 rounded-[12px] bg-[var(--md-surface-container-low)] text-sm border border-[var(--md-outline-variant)]"
                  >
                    {allSubjects.map((s) => (
                      <option key={s.id} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-[var(--md-on-surface-variant)] mb-1">
                    Topic
                  </label>
                  <input
                    type="text"
                    value={wfTopic}
                    onChange={(e) => setWfTopic(e.target.value)}
                    placeholder="e.g., Functions of RBI"
                    className="w-full px-3 py-2 rounded-[12px] bg-[var(--md-surface-container-low)] text-sm border border-[var(--md-outline-variant)]"
                  />
                </div>

                <div>
                  <label className="block text-xs text-[var(--md-on-surface-variant)] mb-1">
                    Associate with Study Session (Optional)
                  </label>
                  <select
                    value={wfSessionId}
                    onChange={(e) => setWfSessionId(e.target.value)}
                    className="w-full px-3 py-2 rounded-[12px] bg-[var(--md-surface-container-low)] text-xs border border-[var(--md-outline-variant)]"
                  >
                    <option value="">None (Standalone Topic Note)</option>
                    {sessions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.sessionDate} — {s.topicTitle} ({s.focusedMinutes}m)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2 pt-1">
                  <button
                    type="button"
                    onClick={handleRunStep4GeminiExtract}
                    disabled={wfScreenshots.length === 0 || wfLoading}
                    className="w-full py-2.5 rounded-full bg-[var(--md-primary)] text-[var(--md-on-primary)] text-xs font-medium disabled:opacity-50 cursor-pointer"
                  >
                    {wfLoading
                      ? 'Running Gemini Vision OCR...'
                      : 'Step 4A: Analyze Screenshots with Gemini AI'}
                  </button>
                  <button
                    type="button"
                    onClick={handleOfflineManualStructuring}
                    className="w-full py-2 rounded-full bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)] text-xs font-medium cursor-pointer"
                  >
                    Step 4B: Continue Offline (Manual Transcription &amp; Template)
                  </button>
                </div>
              </div>
            </div>

            {/* Right: Step 2 Preview + Step 5/6 Extracted Text Review + Step 7/8/9/10 Structured Notes */}
            <div className="lg:col-span-7 space-y-5">
              {/* Step 2: File Previews */}
              <div className="p-5 rounded-[20px] bg-[var(--md-surface)] border border-[var(--md-outline-variant)]/50 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-[var(--md-on-surface)]">
                    Step 2: Uploaded Screenshot Previews ({wfScreenshots.length})
                  </p>
                  {wfScreenshots.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setWfScreenshots([])}
                      className="text-xs text-[var(--md-error)] hover:underline cursor-pointer"
                    >
                      Clear All
                    </button>
                  )}
                </div>

                {wfWarnings.length > 0 && (
                  <div className="p-3 rounded-[12px] bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)] text-xs space-y-1">
                    {wfWarnings.map((w, i) => (
                      <p key={i}>Notice: {w}</p>
                    ))}
                  </div>
                )}

                {wfScreenshots.length === 0 ? (
                  <p className="text-xs text-[var(--md-on-surface-variant)] py-4 text-center">
                    No screenshots selected yet. Upload an image or click &ldquo;Load Sample RBI Lecture Slide&rdquo; above.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {wfScreenshots.map((att) => (
                      <AttachmentCard
                        key={att.id}
                        attachment={att}
                        onZoom={(a, url) => setZoomedItem({ attachment: a, url })}
                        onRetryUpload={(a) => handleRetryAttachment(a, 'workflow')}
                        onRequestRemove={(a) =>
                          setAttachmentRemovalTarget({
                            context: 'workflow',
                            attachment: a,
                          })
                        }
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Steps 5 & 6: Extracted Text Display & User Review/Correction */}
              <div className="p-5 rounded-[20px] bg-[var(--md-surface)] border border-[var(--md-outline-variant)]/50 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-[var(--md-on-surface)]">
                    Steps 5 &amp; 6: Review &amp; Correct Extracted or Transcribed Text
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleOfflineManualStructuring}
                      className="px-3 py-1.5 rounded-full border border-[var(--md-outline-variant)] text-xs font-medium cursor-pointer"
                    >
                      Format with Offline Template
                    </button>
                    <button
                      type="button"
                      onClick={handleRunStep7StructureNotes}
                      disabled={!wfExtractedText.trim() || wfLoading}
                      className="px-4 py-1.5 rounded-full bg-[var(--md-primary)] text-[var(--md-on-primary)] text-xs font-medium disabled:opacity-50 cursor-pointer"
                    >
                      {wfLoading ? 'Structuring...' : 'Step 7: Generate Structured Notes'}
                    </button>
                  </div>
                </div>

                <textarea
                  rows={5}
                  value={wfExtractedText}
                  onChange={(e) => setWfExtractedText(e.target.value)}
                  placeholder="Type or paste screenshot notes manually while offline, or run Step 4A Gemini Vision OCR when online..."
                  className="w-full p-3.5 rounded-[14px] bg-[var(--md-surface-container-low)] text-xs font-mono-tabular border border-[var(--md-outline-variant)]"
                />
              </div>

              {/* Steps 8, 9 & 10: Edit Structured Notes & Save Final Version */}
              {(wfStep >= 8 || wfStructuredNotes) && (
                <div className="p-5 rounded-[20px] bg-[var(--md-primary-container)]/30 border border-[var(--md-primary)] space-y-3">
                  <p className="text-xs font-semibold text-[var(--md-on-surface)]">
                    Steps 8, 9 &amp; 10: Edit Structured Notes, Schedule Revision &amp; Save to Vault
                  </p>
                  <input
                    type="text"
                    value={wfStructuredTitle}
                    onChange={(e) => setWfStructuredTitle(e.target.value)}
                    placeholder="Note Title"
                    className="w-full px-3.5 py-2 rounded-[12px] bg-[var(--md-surface)] text-sm font-semibold border border-[var(--md-outline-variant)]"
                  />
                  <textarea
                    rows={7}
                    value={wfStructuredNotes}
                    onChange={(e) => setWfStructuredNotes(e.target.value)}
                    className="w-full p-3.5 rounded-[14px] bg-[var(--md-surface)] text-sm border border-[var(--md-outline-variant)]"
                  />
                  <label className="flex items-center gap-2 text-xs text-[var(--md-on-surface)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={wfScheduleRevision}
                      onChange={(e) => setWfScheduleRevision(e.target.checked)}
                      className="rounded accent-[var(--md-primary)]"
                    />
                    <span>
                      Automatically schedule Day +1 spaced repetition review in Revision Center
                    </span>
                  </label>
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <span className="text-xs text-[var(--md-on-surface-variant)]">
                      Attachment bytes are stored in Firebase Storage / IndexedDB; Firestore stores only metadata &amp; text.
                    </span>
                    <button
                      type="button"
                      onClick={handleStep9SaveFinalNote}
                      className="px-6 py-2.5 rounded-full bg-[var(--md-primary)] text-[var(--md-on-primary)] text-xs font-medium whitespace-nowrap cursor-pointer"
                    >
                      Steps 9–10: Save Final Note
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: RICH NOTE EDITOR */}
      {activeSubView === 'editor' && (
        <form
          onSubmit={handleSaveEditorNote}
          className="rounded-[28px] bg-[var(--md-surface-container-low)] p-6 md:p-8 border border-[var(--md-outline-variant)]/50 space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="text-xs text-[var(--md-on-surface-variant)]">
                Status: {autosaveStatus}
              </span>
              <h2 className="font-display text-xl font-semibold text-[var(--md-on-surface)]">
                {editingNoteId
                  ? 'Edit Study Note (Preserves Version History)'
                  : 'Create Study Note'}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveSubView('repository')}
                className="px-4 py-2 rounded-full border border-[var(--md-outline-variant)] text-xs font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-6 py-2 rounded-full bg-[var(--md-primary)] text-[var(--md-on-primary)] text-xs font-medium cursor-pointer"
              >
                Save Note
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-[var(--md-on-surface-variant)] mb-1">
                Note Title
              </label>
              <input
                type="text"
                required
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
                placeholder="e.g., Functions of RBI"
                className="w-full px-3.5 py-2.5 rounded-[14px] bg-[var(--md-surface)] text-sm border border-[var(--md-outline-variant)]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--md-on-surface-variant)] mb-1">
                Subject
              </label>
              <select
                value={noteSubject}
                onChange={(e) => setNoteSubject(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-[14px] bg-[var(--md-surface)] text-sm border border-[var(--md-outline-variant)]"
              >
                {allSubjects.map((s) => (
                  <option key={s.id} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--md-on-surface-variant)] mb-1">
                Topic Tag
              </label>
              <input
                type="text"
                required
                value={noteTopicTitle}
                onChange={(e) => setNoteTopicTitle(e.target.value)}
                placeholder="e.g., Functions of RBI"
                className="w-full px-3.5 py-2.5 rounded-[14px] bg-[var(--md-surface)] text-sm border border-[var(--md-outline-variant)]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--md-on-surface-variant)] mb-1">
                Content Type
              </label>
              <select
                value={noteSourceType}
                onChange={(e) =>
                  setNoteSourceType(e.target.value as VaultNoteRecord['sourceType'])
                }
                className="w-full px-3 py-2 rounded-[14px] bg-[var(--md-surface)] text-xs border border-[var(--md-outline-variant)]"
              >
                <option value="note">Study Note</option>
                <option value="screenshot">Screenshot Note</option>
                <option value="pdf">PDF Summary</option>
                <option value="url">URL Reference</option>
                <option value="class_reference">Anuj Jindal Class Reference</option>
                <option value="practice_note">Practice Question Note</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--md-on-surface-variant)] mb-1">
                Reference URL (Optional)
              </label>
              <input
                type="url"
                value={noteSourceUrl}
                onChange={(e) => setNoteSourceUrl(e.target.value)}
                placeholder="https://rbi.org.in/..."
                className="w-full px-3 py-2 rounded-[14px] bg-[var(--md-surface)] text-xs border border-[var(--md-outline-variant)]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--md-on-surface-variant)] mb-1">
                Tags (comma-separated)
              </label>
              <input
                type="text"
                value={noteTagsCsv}
                onChange={(e) => setNoteTagsCsv(e.target.value)}
                placeholder="RBI Act, Monetary Policy"
                className="w-full px-3 py-2 rounded-[14px] bg-[var(--md-surface)] text-xs border border-[var(--md-outline-variant)]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--md-on-surface-variant)] mb-1">
              Study Note Content
            </label>
            <textarea
              rows={10}
              required
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              placeholder="Write or paste structured notes, statutory sections, committee recommendations, and examples..."
              className="w-full p-4 rounded-[16px] bg-[var(--md-surface)] text-sm border border-[var(--md-outline-variant)] leading-relaxed"
            />
          </div>

          {/* Editor Attachments Section */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--md-surface)] border border-[var(--md-outline-variant)] text-xs font-medium cursor-pointer hover:bg-[var(--md-surface-container)]">
                <span className="material-symbols-rounded text-[18px]">attach_file</span>
                <span>
                  Attach Screenshots / PDFs ({noteAttachments.length}) — Max 10 MB
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,application/pdf"
                  multiple
                  onChange={(e) => handleFileAttachmentInput(e, 'editor')}
                  className="hidden"
                />
              </label>
              <span className="text-[11px] text-[var(--md-on-surface-variant)]">
                Allowed: PNG, JPEG, WebP, PDF · Uploaded to <code>users/&#123;uid&#125;/study-attachments/</code>
              </span>
            </div>

            {noteAttachments.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {noteAttachments.map((att) => (
                  <AttachmentCard
                    key={att.id}
                    attachment={att}
                    onZoom={(a, url) => setZoomedItem({ attachment: a, url })}
                    onRetryUpload={(a) => handleRetryAttachment(a, 'editor')}
                    onRequestRemove={(a) =>
                      setAttachmentRemovalTarget({
                        context: 'editor',
                        attachment: a,
                      })
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </form>
      )}

      {/* VIEW 3: REPOSITORY LIST & SEARCH */}
      {activeSubView === 'repository' && (
        <div className="space-y-5">
          {/* Legacy Migration Prompt Banner if legacy attachments exist */}
          {legacyInventory.totalLegacyAttachments > 0 && (
            <div className="p-4 rounded-[20px] bg-[#f3e8ff] text-[#581c87] border border-[#d8b4fe] flex flex-wrap items-center justify-between gap-3 text-xs">
              <div>
                <strong>
                  {legacyInventory.totalLegacyAttachments} Legacy Embedded Base64 Attachment(s) Found:
                </strong>{' '}
                Migrate them to Firebase Storage to reduce Firestore document size by ~{formatBytes(legacyInventory.totalBase64Chars)}.
              </div>
              <button
                type="button"
                onClick={() => setActiveSubView('migration')}
                className="px-4 py-1.5 rounded-full bg-[#6b21a8] text-white font-semibold cursor-pointer"
              >
                Open Migration Center →
              </button>
            </div>
          )}

          {/* Search and Filter Bar */}
          <div className="rounded-[24px] bg-[var(--md-surface-container-low)] p-4 border border-[var(--md-outline-variant)]/40 grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-6 relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search notes, topics, statutory sections, or tags..."
                className="w-full pl-4 pr-4 py-2.5 rounded-[16px] bg-[var(--md-surface)] text-sm border border-[var(--md-outline-variant)]"
              />
            </div>
            <div className="sm:col-span-3">
              <select
                value={filterSubject}
                onChange={(e) => setFilterSubject(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-[16px] bg-[var(--md-surface)] text-sm border border-[var(--md-outline-variant)]"
              >
                <option value="All">All Subjects</option>
                {allSubjects.map((s) => (
                  <option key={s.id} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-3">
              <select
                value={filterSourceType}
                onChange={(e) => setFilterSourceType(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-[16px] bg-[var(--md-surface)] text-sm border border-[var(--md-outline-variant)]"
              >
                <option value="All">All Content Types</option>
                <option value="note">Text Notes</option>
                <option value="screenshot">Screenshot OCR Notes</option>
                <option value="pdf">PDF Notes</option>
                <option value="class_reference">Class References</option>
                <option value="practice_note">Practice Notes</option>
              </select>
            </div>
          </div>

          {filteredNotes.length === 0 ? (
            <div className="py-12 text-center rounded-[24px] bg-[var(--md-surface-container-low)] border border-dashed border-[var(--md-outline-variant)] p-6 space-y-3">
              <p className="text-base font-semibold text-[var(--md-on-surface)]">
                Your Knowledge Vault is empty
              </p>
              <p className="text-xs text-[var(--md-on-surface-variant)] max-w-md mx-auto">
                Create structured text notes, or use the Screenshot-to-Notes Studio to extract and organize lecture screenshots with Gemini and Firebase Storage.
              </p>
              <div className="flex justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveSubView('screenshot_workflow')}
                  className="px-4 py-2 rounded-full bg-[var(--md-primary)] text-[var(--md-on-primary)] text-xs font-medium cursor-pointer"
                >
                  Open Screenshot-to-Notes Studio
                </button>
                <button
                  type="button"
                  onClick={handleOpenNewNoteEditor}
                  className="px-4 py-2 rounded-full border border-[var(--md-outline-variant)] text-xs font-medium cursor-pointer"
                >
                  Create Text Note
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredNotes.map((note) => (
                <article
                  key={note.id}
                  className="rounded-[24px] bg-[var(--md-surface-container-low)] p-6 border border-[var(--md-outline-variant)]/40 space-y-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-xs text-[var(--md-on-surface-variant)]">
                        <span className="font-semibold text-[var(--md-primary)]">
                          {note.subject}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{note.topicTitle}</span>
                        <span aria-hidden="true">·</span>
                        <span className="capitalize">
                          {note.sourceType.replace('_', ' ')}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-tabular">v{note.version}</span>
                      </div>
                      <h3 className="font-display text-lg font-semibold text-[var(--md-on-surface)] mt-1">
                        {note.title}
                      </h3>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          openAiTutorWithContext(
                            note.subject,
                            note.topicTitle,
                            note.topicId
                          )
                        }
                        className="px-3 py-1.5 rounded-full bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)] text-xs font-medium cursor-pointer"
                      >
                        Ask AI Tutor
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenEditNote(note)}
                        className="px-3 py-1.5 rounded-full border border-[var(--md-outline-variant)] text-xs font-medium cursor-pointer"
                      >
                        Edit
                      </button>
                      {note.history && note.history.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setHistoryNote(note)}
                          className="px-3 py-1.5 rounded-full border border-[var(--md-outline-variant)] text-xs font-medium cursor-pointer"
                        >
                          History ({note.history.length})
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDownloadNoteMarkdown(note)}
                        className="px-3 py-1.5 rounded-full border border-[var(--md-outline-variant)] text-xs font-medium cursor-pointer"
                      >
                        Export Note + Meta
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmId(note.id)}
                        className="text-xs text-[var(--md-error)] hover:underline px-2 cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  <div className="p-4 rounded-[16px] bg-[var(--md-surface)] text-sm text-[var(--md-on-surface)] whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto border border-[var(--md-outline-variant)]/30">
                    {note.content}
                  </div>

                  {/* Attachments Grid with Storage Path, Status, Retry, Zoom & Confirmed Removal */}
                  {note.attachments && note.attachments.length > 0 && (
                    <div className="space-y-2 pt-1">
                      <div className="text-[11px] font-semibold text-[var(--md-on-surface-variant)]">
                        Attachments ({note.attachments.length})
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {note.attachments.map((att) => (
                          <AttachmentCard
                            key={att.id}
                            attachment={att}
                            compact
                            onZoom={(a, url) =>
                              setZoomedItem({ attachment: a, url })
                            }
                            onRetryUpload={(a) =>
                              handleRetryAttachment(a, 'saved_note', note)
                            }
                            onRequestRemove={(a) =>
                              setAttachmentRemovalTarget({
                                context: 'saved_note',
                                note,
                                attachment: a,
                              })
                            }
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Image / PDF Zoom & Open Modal */}
      {zoomedItem && (
        <div
          onClick={() => setZoomedItem(null)}
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-4xl w-full rounded-[24px] bg-[var(--md-surface)] p-5 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-[var(--md-on-surface)]">
                  {zoomedItem.attachment.fileName}
                </p>
                <p className="text-[11px] font-mono-tabular text-[var(--md-on-surface-variant)]">
                  {zoomedItem.attachment.mimeType} · {formatBytes(zoomedItem.attachment.sizeBytes)}
                  {zoomedItem.attachment.storagePath &&
                    ` · ${zoomedItem.attachment.storagePath}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={zoomedItem.url}
                  download={zoomedItem.attachment.fileName}
                  className="px-3.5 py-1.5 rounded-full bg-[var(--md-primary)] text-[var(--md-on-primary)] text-xs font-medium no-underline"
                >
                  Download File
                </a>
                <button
                  type="button"
                  onClick={() => setZoomedItem(null)}
                  className="px-3.5 py-1.5 rounded-full bg-[var(--md-surface-container)] text-xs font-medium cursor-pointer"
                >
                  Close Preview
                </button>
              </div>
            </div>
            {zoomedItem.attachment.mimeType === 'application/pdf' ? (
              <iframe
                src={zoomedItem.url}
                title={zoomedItem.attachment.fileName}
                className="w-full h-[72vh] rounded-[16px] border border-[var(--md-outline-variant)]"
              />
            ) : (
              <img
                src={zoomedItem.url}
                alt={zoomedItem.attachment.fileName}
                referrerPolicy="no-referrer"
                className="w-full max-h-[75vh] object-contain rounded-[16px]"
              />
            )}
          </div>
        </div>
      )}

      {/* Confirm Attachment Removal Modal */}
      {attachmentRemovalTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-[28px] bg-[var(--md-surface)] p-6 space-y-4 border border-[var(--md-outline-variant)]">
            <h3 className="font-display text-lg font-semibold text-[var(--md-on-surface)]">
              Remove Attachment &ldquo;{attachmentRemovalTarget.attachment.fileName}&rdquo;?
            </h3>
            <p className="text-xs text-[var(--md-on-surface-variant)]">
              This will remove the attachment reference from the note and delete its stored file object from Firebase Storage and local IndexedDB cache.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAttachmentRemovalTarget(null)}
                className="px-4 py-2 rounded-full border border-[var(--md-outline-variant)] text-xs font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRemoveAttachment}
                className="px-4 py-2 rounded-full bg-[var(--md-error)] text-white text-xs font-medium cursor-pointer"
              >
                Confirm Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Version History Modal */}
      {historyNote && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="max-w-xl w-full rounded-[28px] bg-[var(--md-surface)] p-6 space-y-4 border border-[var(--md-outline-variant)]">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">
                Version History — {historyNote.title}
              </h3>
              <button
                type="button"
                onClick={() => setHistoryNote(null)}
                className="text-xs font-medium text-[var(--md-primary)] cursor-pointer"
              >
                Close
              </button>
            </div>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {historyNote.history.map((h) => (
                <div
                  key={h.version}
                  className="p-3.5 rounded-[16px] bg-[var(--md-surface-container-low)] border border-[var(--md-outline-variant)]/50 space-y-1"
                >
                  <div className="flex items-center justify-between text-xs font-mono-tabular text-[var(--md-on-surface-variant)]">
                    <span>Version v{h.version}</span>
                    <span>{new Date(h.savedAtIso).toLocaleString()}</span>
                  </div>
                  <p className="text-xs text-[var(--md-on-surface)] whitespace-pre-wrap">
                    {h.fullContent}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Delete Note Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-[28px] bg-[var(--md-surface)] p-6 space-y-4 border border-[var(--md-outline-variant)]">
            <h3 className="font-display text-lg font-semibold">
              Delete Note Permanently?
            </h3>
            <p className="text-xs text-[var(--md-on-surface-variant)]">
              This will remove the note and its version history from your Knowledge Vault.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 rounded-full border border-[var(--md-outline-variant)] text-xs font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const target = notes.find((n) => n.id === deleteConfirmId);
                  if (target?.attachments) {
                    for (const att of target.attachments) {
                      try {
                        await deleteStudyAttachment(att);
                      } catch {
                        // Continue deleting note
                      }
                    }
                  }
                  await deleteVaultNote(deleteConfirmId);
                  setDeleteConfirmId(null);
                }}
                className="px-4 py-2 rounded-full bg-[var(--md-error)] text-white text-xs font-medium cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
