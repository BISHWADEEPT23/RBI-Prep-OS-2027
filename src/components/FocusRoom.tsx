import React, { useEffect, useState } from 'react';
import { authenticatedAiFetch } from '../aiApi';
import { addDaysToDateStr, getKolkataDateString, useStudy } from '../context/StudyContext';
import { makeSafeId } from '../firebase';
import {
  blobToTemporaryDataUrl,
  deleteStudyAttachment,
  downloadStudyAttachmentBlob,
  retryAttachmentUpload,
  uploadStudyAttachment,
} from '../storage';
import { ExamPhase, VaultAttachment } from '../types';
import { AttachmentCard } from './AttachmentChipAndPreview';

export const FocusRoom: React.FC = () => {
  const {
    allSubjects,
    topics,
    activeTimer,
    updateActiveTimer,
    saveStudySession,
    saveVaultNote,
    saveTopic,
    setActiveTab,
    openAiTutorWithContext,
    showSnackbar,
  } = useStudy();

  const [nowEpoch, setNowEpoch] = useState<number>(() => Date.now());
  const [newChecklistText, setNewChecklistText] = useState('');
  const [breakReminderEnabled, setBreakReminderEnabled] = useState(true);

  // Post-Session Summary Modal state
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [summaryFocusedMins, setSummaryFocusedMins] = useState(0);
  const [summaryPausedMins, setSummaryPausedMins] = useState(0);
  const [sessionOutcome, setSessionOutcome] = useState('Lecture & Core Notes Completed');
  const [confidenceRating, setConfidenceRating] = useState<number>(4);
  const [suggestedRevDate, setSuggestedRevDate] = useState<string>(() =>
    addDaysToDateStr(getKolkataDateString(), 1)
  );
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  // Live Screenshot OCR inside Focus Room
  const [analyzingScreenshots, setAnalyzingScreenshots] = useState(false);
  const [extractedOcrPreview, setExtractedOcrPreview] = useState<string>('');

  // Tick every 500ms while activeTimer is running
  useEffect(() => {
    if (!activeTimer.isRunning) return;
    const interval = setInterval(() => {
      setNowEpoch(Date.now());
    }, 500);
    return () => clearInterval(interval);
  }, [activeTimer.isRunning]);

  // Calculate accurate timestamp-based focused & paused milliseconds
  const currentFocusedMs =
    activeTimer.accumulatedFocusedMs +
    (activeTimer.isRunning && !activeTimer.isPaused && activeTimer.lastResumeEpochMs
      ? Math.max(0, nowEpoch - activeTimer.lastResumeEpochMs)
      : 0);

  const currentPausedMs =
    activeTimer.accumulatedPausedMs +
    (activeTimer.isRunning && activeTimer.isPaused && activeTimer.lastPauseEpochMs
      ? Math.max(0, nowEpoch - activeTimer.lastPauseEpochMs)
      : 0);

  const focusedSecondsTotal = Math.floor(currentFocusedMs / 1000);
  const pausedSecondsTotal = Math.floor(currentPausedMs / 1000);

  const targetSeconds =
    activeTimer.mode === 'pomodoro'
      ? 25 * 60
      : Math.max(1, activeTimer.plannedMinutes) * 60;

  const displaySeconds =
    activeTimer.mode === 'stopwatch'
      ? focusedSecondsTotal
      : Math.max(0, targetSeconds - focusedSecondsTotal);

  const formatDurationHMS = (totalSec: number) => {
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return hrs > 0 ? `${pad(hrs)}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
  };

  const phaseSubjects = allSubjects.filter((s) => s.phase === activeTimer.phase);
  const subjectTopics = topics.filter((t) => t.subject === activeTimer.subject);

  const handleStartTimer = async () => {
    const cleanTopic = activeTimer.topicTitle.trim() || 'Functions of RBI';
    let matchedTopic = topics.find(
      (t) =>
        t.subject === activeTimer.subject &&
        t.title.toLowerCase() === cleanTopic.toLowerCase()
    );
    if (!matchedTopic) {
      matchedTopic = await saveTopic({
        phase: activeTimer.phase,
        subject: activeTimer.subject,
        chapter: 'Core Syllabus',
        title: cleanTopic,
        status: 'In Progress',
        studyMinutes: 0,
        confidence: 3,
      });
    }

    const now = Date.now();
    setNowEpoch(now);
    updateActiveTimer((prev) => ({
      ...prev,
      topicId: matchedTopic?.id || prev.topicId,
      topicTitle: cleanTopic,
      isRunning: true,
      isPaused: false,
      accumulatedFocusedMs: 0,
      accumulatedPausedMs: 0,
      lastResumeEpochMs: now,
      lastPauseEpochMs: null,
      lastHeartbeatEpochMs: now,
      unverifiedGapDetected: false,
      unverifiedGapMinutes: 0,
    }));
  };

  const handlePauseTimer = () => {
    const now = Date.now();
    setNowEpoch(now);
    updateActiveTimer((prev) => {
      if (!prev.isRunning || prev.isPaused) return prev;
      const deltaFocused = prev.lastResumeEpochMs ? Math.max(0, now - prev.lastResumeEpochMs) : 0;
      return {
        ...prev,
        isPaused: true,
        accumulatedFocusedMs: prev.accumulatedFocusedMs + deltaFocused,
        lastResumeEpochMs: null,
        lastPauseEpochMs: now,
      };
    });
  };

  const handleResumeTimer = () => {
    const now = Date.now();
    setNowEpoch(now);
    updateActiveTimer((prev) => {
      if (!prev.isRunning || !prev.isPaused) return prev;
      const deltaPaused = prev.lastPauseEpochMs ? Math.max(0, now - prev.lastPauseEpochMs) : 0;
      return {
        ...prev,
        isPaused: false,
        accumulatedPausedMs: prev.accumulatedPausedMs + deltaPaused,
        lastResumeEpochMs: now,
        lastPauseEpochMs: null,
        lastHeartbeatEpochMs: now,
      };
    });
  };

  const handleStopAndOpenSummary = () => {
    if (activeTimer.isRunning && !activeTimer.isPaused) {
      handlePauseTimer();
    }
    const minsFocused = Math.max(1, Math.round(currentFocusedMs / 60000));
    const minsPaused = Math.round(currentPausedMs / 60000);
    setSummaryFocusedMins(minsFocused);
    setSummaryPausedMins(minsPaused);
    setSuggestedRevDate(addDaysToDateStr(getKolkataDateString(), 1));
    setShowSummaryModal(true);
  };

  const handleConfirmSaveSession = async () => {
    const todayStr = getKolkataDateString();
    const savedSession = await saveStudySession(
      {
        phase: activeTimer.phase,
        subject: activeTimer.subject,
        topicId: activeTimer.topicId,
        topicTitle: activeTimer.topicTitle || 'Functions of RBI',
        goal: activeTimer.goal,
        timerMode: activeTimer.mode,
        plannedMinutes: activeTimer.plannedMinutes,
        focusedMinutes: Math.max(1, summaryFocusedMins),
        pausedMinutes: Math.max(0, summaryPausedMins),
        outcome: sessionOutcome,
        confidence: confidenceRating,
        notesSummary: activeTimer.quickNotes,
        screenshotsCount: activeTimer.sessionScreenshots.length,
        suggestedRevisionDate: suggestedRevDate,
        sessionDate: todayStr,
      },
      true
    );

    // If the user wrote quick notes or uploaded screenshots during the session, save them to Knowledge Vault
    if (activeTimer.quickNotes.trim() || activeTimer.sessionScreenshots.length > 0) {
      await saveVaultNote({
        title: `${activeTimer.topicTitle || 'Study Session'} — Session Notes (${todayStr})`,
        subject: activeTimer.subject,
        topicId: savedSession.topicId,
        topicTitle: savedSession.topicTitle,
        sessionId: savedSession.id,
        sourceType: activeTimer.sessionScreenshots.length > 0 ? 'screenshot' : 'note',
        content:
          activeTimer.quickNotes.trim() ||
          extractedOcrPreview ||
          `Screenshots and notes captured during ${summaryFocusedMins} min Focus Room session.`,
        originalExtractedText: extractedOcrPreview || undefined,
        tagsCsv: `${activeTimer.subject}, Focus Session`,
        attachments: activeTimer.sessionScreenshots,
        version: 1,
        history: [],
      });
    }

    // Reset active timer state
    updateActiveTimer((prev) => ({
      ...prev,
      isRunning: false,
      isPaused: false,
      accumulatedFocusedMs: 0,
      accumulatedPausedMs: 0,
      lastResumeEpochMs: null,
      lastPauseEpochMs: null,
      unverifiedGapDetected: false,
      unverifiedGapMinutes: 0,
      quickNotes: '',
      sessionScreenshots: [],
    }));
    setExtractedOcrPreview('');
    setShowSummaryModal(false);
  };

  const handleDiscardSession = () => {
    updateActiveTimer((prev) => ({
      ...prev,
      isRunning: false,
      isPaused: false,
      accumulatedFocusedMs: 0,
      accumulatedPausedMs: 0,
      lastResumeEpochMs: null,
      lastPauseEpochMs: null,
      unverifiedGapDetected: false,
      unverifiedGapMinutes: 0,
      quickNotes: '',
      sessionScreenshots: [],
    }));
    setConfirmDiscardOpen(false);
    setShowSummaryModal(false);
    showSnackbar('Study session discarded.');
  };

  const handleAddChecklistItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChecklistText.trim()) return;
    updateActiveTimer((prev) => ({
      ...prev,
      checklist: [
        ...prev.checklist,
        { id: makeSafeId('chk'), text: newChecklistText.trim(), done: false },
      ],
    }));
    setNewChecklistText('');
  };

  const handleScreenshotUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    e.target.value = '';

    for (const file of files) {
      try {
        const uploadedAtt = await uploadStudyAttachment({
          file,
          fileName: file.name,
        });
        updateActiveTimer((prev) => ({
          ...prev,
          sessionScreenshots: [...prev.sessionScreenshots, uploadedAtt],
        }));
      } catch (err) {
        showSnackbar(
          err instanceof Error ? err.message : 'Screenshot validation failed.'
        );
      }
    }
  };

  const handleAnalyzeSessionScreenshots = async () => {
    if (activeTimer.sessionScreenshots.length === 0) return;
    setAnalyzingScreenshots(true);
    try {
      const images: Array<{ fileName: string; mimeType: string; data: string }> = [];
      for (const att of activeTimer.sessionScreenshots) {
        const blob = await downloadStudyAttachmentBlob(att);
        const tempBase64 = await blobToTemporaryDataUrl(blob);
        images.push({
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
          subject: activeTimer.subject,
          topic: activeTimer.topicTitle || 'Functions of RBI',
          images,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Screenshot extraction failed');
      const extracted = data.combinedRawText || '';
      setExtractedOcrPreview(extracted);
      updateActiveTimer((prev) => ({
        ...prev,
        quickNotes: prev.quickNotes
          ? `${prev.quickNotes}\n\n--- Extracted from Screenshots ---\n${extracted}`
          : `--- Extracted from Screenshots ---\n${extracted}`,
      }));
      showSnackbar('Gemini extracted text from uploaded screenshots into your session notes.');
    } catch (err) {
      showSnackbar(err instanceof Error ? err.message : 'Failed to analyze screenshots.');
    } finally {
      setAnalyzingScreenshots(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-xs font-medium text-[var(--md-on-surface-variant)]">
            Distraction-Free Study Workspace
          </span>
          <h1 className="font-display text-2xl md:text-3xl font-semibold text-[var(--md-on-surface)]">
            Interactive Focus Room
          </h1>
        </div>

        {/* Mode Segmented Buttons */}
        <div className="inline-flex items-center p-1 rounded-full bg-[var(--md-surface-container-high)] border border-[var(--md-outline-variant)]/50">
          {(['stopwatch', 'countdown', 'pomodoro'] as const).map((m) => (
            <button
              key={m}
              onClick={() => updateActiveTimer((prev) => ({ ...prev, mode: m }))}
              className={`px-4 py-1.5 rounded-full text-xs font-medium capitalize transition-colors cursor-pointer ${
                activeTimer.mode === m
                  ? 'bg-[var(--md-primary)] text-[var(--md-on-primary)]'
                  : 'text-[var(--md-on-surface-variant)] hover:text-[var(--md-on-surface)]'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Unverified Continuous Focus Warning Banner */}
      {activeTimer.unverifiedGapDetected && (
        <div className="p-4 rounded-[20px] bg-[var(--md-error-container)] text-[var(--md-on-error-container)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              Unverified Elapsed Interval Detected ({activeTimer.unverifiedGapMinutes} mins)
            </p>
            <p className="text-xs mt-0.5">
              Your browser slept or was inactive. Please confirm whether you were actively studying during this interval before saving.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() =>
                updateActiveTimer((prev) => ({ ...prev, unverifiedGapDetected: false }))
              }
              className="px-3.5 py-1.5 rounded-full bg-[var(--md-on-error-container)] text-[var(--md-error-container)] text-xs font-medium cursor-pointer"
            >
              Confirm Continuous Study
            </button>
            <button
              onClick={handleStopAndOpenSummary}
              className="px-3.5 py-1.5 rounded-full border border-current text-xs font-medium cursor-pointer"
            >
              Adjust Minutes Manually
            </button>
          </div>
        </div>
      )}

      {/* Pre-Study / Active Configuration Card */}
      <div className="rounded-[24px] bg-[var(--md-surface-container-low)] p-6 border border-[var(--md-outline-variant)]/40">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-xs font-medium text-[var(--md-on-surface-variant)] mb-1">
              Exam Phase
            </label>
            <select
              value={activeTimer.phase}
              onChange={(e) => {
                const nextPhase = e.target.value as ExamPhase;
                const firstSubj = allSubjects.find((s) => s.phase === nextPhase);
                updateActiveTimer((prev) => ({
                  ...prev,
                  phase: nextPhase,
                  subject: firstSubj ? firstSubj.name : prev.subject,
                }));
              }}
              className="w-full px-3.5 py-2.5 rounded-[16px] bg-[var(--md-surface)] text-sm border border-[var(--md-outline-variant)]"
            >
              <option value="Phase I">Phase I</option>
              <option value="Phase II">Phase II</option>
              <option value="Additional Categories">Additional Categories</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--md-on-surface-variant)] mb-1">
              Subject
            </label>
            <select
              value={activeTimer.subject}
              onChange={(e) =>
                updateActiveTimer((prev) => ({ ...prev, subject: e.target.value }))
              }
              className="w-full px-3.5 py-2.5 rounded-[16px] bg-[var(--md-surface)] text-sm border border-[var(--md-outline-variant)]"
            >
              {phaseSubjects.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-[var(--md-on-surface-variant)] mb-1">
              Topic (Choose existing or type new topic name)
            </label>
            <input
              type="text"
              list="focus-room-topic-list"
              value={activeTimer.topicTitle}
              onChange={(e) =>
                updateActiveTimer((prev) => ({ ...prev, topicTitle: e.target.value }))
              }
              placeholder="e.g., Functions of RBI"
              className="w-full px-3.5 py-2.5 rounded-[16px] bg-[var(--md-surface)] text-sm border border-[var(--md-outline-variant)]"
            />
            <datalist id="focus-room-topic-list">
              {subjectTopics.map((t) => (
                <option key={t.id} value={t.title} />
              ))}
            </datalist>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--md-on-surface-variant)] mb-1">
              Planned Mins
            </label>
            <input
              type="number"
              min={5}
              max={360}
              value={activeTimer.plannedMinutes}
              onChange={(e) =>
                updateActiveTimer((prev) => ({
                  ...prev,
                  plannedMinutes: Math.max(5, Number(e.target.value) || 45),
                }))
              }
              className="w-full px-3.5 py-2.5 rounded-[16px] bg-[var(--md-surface)] text-sm font-mono-tabular border border-[var(--md-outline-variant)]"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <input
            type="text"
            value={activeTimer.goal}
            onChange={(e) => updateActiveTimer((prev) => ({ ...prev, goal: e.target.value }))}
            placeholder="Session Goal: e.g., Watch Anuj Jindal lecture, capture screenshots, and summarize statutory sections"
            className="flex-1 px-3.5 py-2 rounded-[14px] bg-[var(--md-surface)] text-xs border border-[var(--md-outline-variant)]"
          />
          <label className="inline-flex items-center gap-2 text-xs text-[var(--md-on-surface-variant)] cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={breakReminderEnabled}
              onChange={(e) => setBreakReminderEnabled(e.target.checked)}
              className="rounded accent-[var(--md-primary)]"
            />
            <span>Gentle 50m break reminder</span>
          </label>
        </div>
      </div>

      {/* Main Focus Stage: Large Timer + Controls */}
      <div className="rounded-[32px] bg-[var(--md-surface-container)] p-8 md:p-10 border border-[var(--md-outline-variant)]/50 text-center space-y-6">
        <div className="space-y-1">
          <div className="flex items-center justify-center gap-2 text-xs text-[var(--md-on-surface-variant)]">
            <span>{activeTimer.phase}</span>
            <span aria-hidden="true">·</span>
            <span>{activeTimer.subject}</span>
            <span aria-hidden="true">·</span>
            <span className="capitalize">{activeTimer.mode} Mode</span>
          </div>
          <h2 className="font-display text-xl md:text-2xl font-semibold text-[var(--md-on-surface)]">
            {activeTimer.topicTitle || 'Functions of RBI'}
          </h2>
        </div>

        {/* Large Tabular Timer Display */}
        <div className="py-4">
          <div className="font-mono-tabular text-6xl sm:text-7xl md:text-8xl font-semibold tracking-tight text-[var(--md-primary)]">
            {formatDurationHMS(displaySeconds)}
          </div>
          <div className="mt-3 flex items-center justify-center gap-4 text-xs text-[var(--md-on-surface-variant)] font-mono-tabular">
            <span>Actual Focused: {formatDurationHMS(focusedSecondsTotal)}</span>
            <span aria-hidden="true">·</span>
            <span>Paused Time (Excluded): {formatDurationHMS(pausedSecondsTotal)}</span>
          </div>
          {breakReminderEnabled && focusedSecondsTotal >= 50 * 60 && (
            <p className="mt-2 text-xs font-medium text-[var(--md-primary)]">
              You have studied continuously for over 50 minutes. Consider a 5-minute hydration break.
            </p>
          )}
        </div>

        {/* Timer Action Controls */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          {!activeTimer.isRunning ? (
            <button
              onClick={handleStartTimer}
              className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-[var(--md-primary)] text-[var(--md-on-primary)] font-medium text-base shadow-sm hover:opacity-95 transition-opacity cursor-pointer"
            >
              <span className="material-symbols-rounded">play_arrow</span>
              <span>Start Focus Timer</span>
            </button>
          ) : (
            <>
              {!activeTimer.isPaused ? (
                <button
                  onClick={handlePauseTimer}
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)] font-medium text-sm cursor-pointer"
                >
                  <span className="material-symbols-rounded">pause</span>
                  <span>Pause</span>
                </button>
              ) : (
                <button
                  onClick={handleResumeTimer}
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full bg-[var(--md-primary)] text-[var(--md-on-primary)] font-medium text-sm cursor-pointer"
                >
                  <span className="material-symbols-rounded">play_arrow</span>
                  <span>Resume</span>
                </button>
              )}

              <button
                onClick={handleStopAndOpenSummary}
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full bg-[var(--md-primary-container)] text-[var(--md-on-primary-container)] font-medium text-sm cursor-pointer"
              >
                <span className="material-symbols-rounded">stop_circle</span>
                <span>Stop &amp; Review Session</span>
              </button>

              <button
                onClick={() => setConfirmDiscardOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-3.5 rounded-full border border-[var(--md-outline-variant)] text-xs font-medium text-[var(--md-error)] hover:bg-[var(--md-error-container)]/30 cursor-pointer"
              >
                <span className="material-symbols-rounded text-[18px]">delete</span>
                <span>Discard</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* In-Session Workspace: Checklist + Quick Notes & Screenshot Attachment */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Session Checklist */}
        <div className="lg:col-span-5 rounded-[24px] bg-[var(--md-surface-container-low)] p-6 border border-[var(--md-outline-variant)]/40 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-base font-semibold text-[var(--md-on-surface)]">
              Session Checklist
            </h3>
            <span className="text-xs font-mono-tabular text-[var(--md-on-surface-variant)]">
              {activeTimer.checklist.filter((c) => c.done).length}/{activeTimer.checklist.length}
            </span>
          </div>

          <form onSubmit={handleAddChecklistItem} className="flex gap-2">
            <input
              type="text"
              value={newChecklistText}
              onChange={(e) => setNewChecklistText(e.target.value)}
              placeholder="Add sub-step for this session..."
              className="flex-1 px-3 py-2 rounded-[12px] bg-[var(--md-surface)] text-xs border border-[var(--md-outline-variant)]"
            />
            <button
              type="submit"
              className="px-3.5 py-2 rounded-[12px] bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)] text-xs font-medium cursor-pointer"
            >
              Add
            </button>
          </form>

          <div className="space-y-2">
            {activeTimer.checklist.length === 0 ? (
              <p className="text-xs text-[var(--md-on-surface-variant)] py-2">
                Add study sub-targets above to track progress during this block.
              </p>
            ) : (
              activeTimer.checklist.map((item) => (
                <label
                  key={item.id}
                  className="flex items-center gap-2.5 p-2.5 rounded-[12px] bg-[var(--md-surface)] cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={() =>
                      updateActiveTimer((prev) => ({
                        ...prev,
                        checklist: prev.checklist.map((c) =>
                          c.id === item.id ? { ...c, done: !c.done } : c
                        ),
                      }))
                    }
                    className="rounded accent-[var(--md-primary)]"
                  />
                  <span
                    className={`text-xs ${
                      item.done
                        ? 'line-through text-[var(--md-on-surface-variant)]'
                        : 'text-[var(--md-on-surface)]'
                    }`}
                  >
                    {item.text}
                  </span>
                </label>
              ))
            )}
          </div>
        </div>

        {/* Quick Notes & Screenshot Capture */}
        <div className="lg:col-span-7 rounded-[24px] bg-[var(--md-surface-container-low)] p-6 border border-[var(--md-outline-variant)]/40 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-base font-semibold text-[var(--md-on-surface)]">
                Quick Session Notes &amp; Screenshots
              </h3>
              <p className="text-xs text-[var(--md-on-surface-variant)]">
                Automatically linked to this topic and saved to your Knowledge Vault.
              </p>
            </div>
            <button
              onClick={() =>
                openAiTutorWithContext(
                  activeTimer.subject,
                  activeTimer.topicTitle || 'Functions of RBI',
                  activeTimer.topicId
                )
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[var(--md-tertiary-container)] text-[var(--md-on-tertiary-container)] text-xs font-medium cursor-pointer"
            >
              <span className="material-symbols-rounded text-[16px]">psychology</span>
              <span>Ask AI Tutor</span>
            </button>
          </div>

          <textarea
            rows={5}
            value={activeTimer.quickNotes}
            onChange={(e) =>
              updateActiveTimer((prev) => ({ ...prev, quickNotes: e.target.value }))
            }
            placeholder="Jot down key RBI sections, policy rates, formulas, or lecture takeaways while studying..."
            className="w-full p-3.5 rounded-[16px] bg-[var(--md-surface)] text-sm border border-[var(--md-outline-variant)] focus:outline-none focus:ring-2 focus:ring-[var(--md-primary)]"
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--md-surface)] border border-[var(--md-outline-variant)] text-xs font-medium cursor-pointer hover:bg-[var(--md-surface-container)]">
              <span className="material-symbols-rounded text-[18px]">add_photo_alternate</span>
              <span>Attach Lecture Screenshots / PDFs ({activeTimer.sessionScreenshots.length})</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,application/pdf"
                multiple
                onChange={handleScreenshotUpload}
                className="hidden"
              />
            </label>

            {activeTimer.sessionScreenshots.length > 0 && (
              <button
                onClick={handleAnalyzeSessionScreenshots}
                disabled={analyzingScreenshots}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[var(--md-primary)] text-[var(--md-on-primary)] text-xs font-medium disabled:opacity-50 cursor-pointer"
              >
                <span className="material-symbols-rounded text-[16px]">document_scanner</span>
                <span>
                  {analyzingScreenshots
                    ? 'Extracting Screenshot Text...'
                    : 'Analyze Screenshots with Gemini'}
                </span>
              </button>
            )}
          </div>

          {activeTimer.sessionScreenshots.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              {activeTimer.sessionScreenshots.map((att) => (
                <AttachmentCard
                  key={att.id}
                  attachment={att}
                  compact
                  onZoom={(a, url) => {
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = a.fileName;
                    link.click();
                  }}
                  onRetryUpload={async (a) => {
                    const updated = await retryAttachmentUpload(a);
                    updateActiveTimer((prev) => ({
                      ...prev,
                      sessionScreenshots: prev.sessionScreenshots.map((x) =>
                        x.id === a.id ? updated : x
                      ),
                    }));
                  }}
                  onRequestRemove={async (a) => {
                    await deleteStudyAttachment(a);
                    updateActiveTimer((prev) => ({
                      ...prev,
                      sessionScreenshots: prev.sessionScreenshots.filter(
                        (x) => x.id !== a.id
                      ),
                    }));
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Discard Confirmation Dialog */}
      {confirmDiscardOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-[28px] bg-[var(--md-surface)] p-6 space-y-4 border border-[var(--md-outline-variant)]">
            <h3 className="font-display text-lg font-semibold text-[var(--md-on-surface)]">
              Discard Active Study Session?
            </h3>
            <p className="text-sm text-[var(--md-on-surface-variant)]">
              This will reset the current timer ({formatDurationHMS(focusedSecondsTotal)} focused) without logging a study session.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmDiscardOpen(false)}
                className="px-4 py-2 rounded-full border border-[var(--md-outline-variant)] text-xs font-medium cursor-pointer"
              >
                Keep Studying
              </button>
              <button
                onClick={handleDiscardSession}
                className="px-4 py-2 rounded-full bg-[var(--md-error)] text-white text-xs font-medium cursor-pointer"
              >
                Confirm Discard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Post-Study Session Summary Modal */}
      {showSummaryModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="max-w-lg w-full rounded-[28px] bg-[var(--md-surface)] p-6 md:p-8 space-y-5 border border-[var(--md-outline-variant)] shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-medium text-[var(--md-primary)]">
                  Verify &amp; Persist Study Record
                </span>
                <h3 className="font-display text-xl font-semibold text-[var(--md-on-surface)]">
                  Session Summary — {activeTimer.topicTitle || 'Functions of RBI'}
                </h3>
              </div>
              <span className="material-symbols-rounded text-[28px] text-[var(--md-primary)]">
                verified
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 p-4 rounded-[20px] bg-[var(--md-surface-container-low)]">
              <div>
                <label className="block text-xs text-[var(--md-on-surface-variant)] mb-1">
                  Confirmed Focused Minutes
                </label>
                <input
                  type="number"
                  min={1}
                  max={600}
                  value={summaryFocusedMins}
                  onChange={(e) => setSummaryFocusedMins(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full px-3 py-2 rounded-[12px] bg-[var(--md-surface)] font-mono-tabular text-base font-semibold border border-[var(--md-outline-variant)]"
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--md-on-surface-variant)] mb-1">
                  Paused Mins (Excluded)
                </label>
                <input
                  type="number"
                  disabled
                  value={summaryPausedMins}
                  className="w-full px-3 py-2 rounded-[12px] bg-[var(--md-surface-container)] font-mono-tabular text-base text-[var(--md-on-surface-variant)] border border-[var(--md-outline-variant)]/50"
                />
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[var(--md-on-surface-variant)] mb-1">
                  Session Outcome (Does not automatically mark topic Mastered)
                </label>
                <select
                  value={sessionOutcome}
                  onChange={(e) => setSessionOutcome(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-[14px] bg-[var(--md-surface-container-low)] text-sm border border-[var(--md-outline-variant)]"
                >
                  <option value="Lecture In Progress">Lecture In Progress</option>
                  <option value="Lecture & Core Notes Completed">Lecture &amp; Core Notes Completed</option>
                  <option value="Revision & Concept Consolidation">Revision &amp; Concept Consolidation</option>
                  <option value="Practice & Problem Solving">Practice &amp; Problem Solving</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--md-on-surface-variant)] mb-1">
                    Confidence Rating (1–5)
                  </label>
                  <select
                    value={confidenceRating}
                    onChange={(e) => setConfidenceRating(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-[14px] bg-[var(--md-surface-container-low)] text-sm font-mono-tabular border border-[var(--md-outline-variant)]"
                  >
                    <option value={1}>1 — Needs Immediate Review</option>
                    <option value={2}>2 — Partial Understanding</option>
                    <option value={3}>3 — Moderate Grip</option>
                    <option value={4}>4 — Confident</option>
                    <option value={5}>5 — Strong Recall</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--md-on-surface-variant)] mb-1">
                    Suggested Revision Date
                  </label>
                  <input
                    type="date"
                    value={suggestedRevDate}
                    onChange={(e) => setSuggestedRevDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-[14px] bg-[var(--md-surface-container-low)] text-sm font-mono-tabular border border-[var(--md-outline-variant)]"
                  />
                </div>
              </div>
            </div>

            <div className="text-xs text-[var(--md-on-surface-variant)] flex items-center justify-between pt-1">
              <span>Notes attached: {activeTimer.quickNotes.trim() ? 'Yes' : 'None'}</span>
              <span>Screenshots uploaded: {activeTimer.sessionScreenshots.length}</span>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3 pt-3 border-t border-[var(--md-outline-variant)]/50">
              <button
                onClick={() => setShowSummaryModal(false)}
                className="px-4 py-2.5 rounded-full border border-[var(--md-outline-variant)] text-xs font-medium cursor-pointer"
              >
                Back to Timer
              </button>
              <button
                onClick={async () => {
                  await handleConfirmSaveSession();
                  setActiveTab('practice');
                }}
                className="px-4 py-2.5 rounded-full bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)] text-xs font-medium cursor-pointer"
              >
                Save &amp; Generate 5 Practice Questions
              </button>
              <button
                onClick={handleConfirmSaveSession}
                className="px-6 py-2.5 rounded-full bg-[var(--md-primary)] text-[var(--md-on-primary)] text-xs font-medium cursor-pointer"
              >
                Confirm &amp; Save Session
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
