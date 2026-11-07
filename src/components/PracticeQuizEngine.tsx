import React, { useEffect, useState } from 'react';
import { authenticatedAiFetch } from '../aiApi';
import { addDaysToDateStr, getKolkataDateString, useStudy } from '../context/StudyContext';
import { dbGetOfflineQuizQuestions } from '../db/localDb';
import { makeSafeId } from '../firebase';
import { MistakeCategory, QuizQuestionItem } from '../types';

const MISTAKE_CATEGORIES: MistakeCategory[] = [
  'Conceptual',
  'Calculation',
  'Misinterpretation',
  'Time management',
  'Guessing',
  'Knowledge gap',
];

const CURATED_RBI_FALLBACK_QUESTIONS: QuizQuestionItem[] = [
  {
    id: 'q_rbi_1',
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
];

export const PracticeQuizEngine: React.FC = () => {
  const {
    allSubjects,
    topics,
    notes,
    quizzes,
    saveQuizAttempt,
    saveRevisionItem,
    setActiveTab,
    showSnackbar,
    isOnline,
  } = useStudy();

  const [practiceTab, setPracticeTab] = useState<'mcq' | 'descriptive' | 'history'>('mcq');

  // Quiz Configuration State
  const [selectedSubject, setSelectedSubject] = useState('Finance');
  const [selectedTopic, setSelectedTopic] = useState('Functions of RBI');
  const [questionCount, setQuestionCount] = useState(5);
  const [timerEnabled, setTimerEnabled] = useState(true);
  const [generatingQuiz, setGeneratingQuiz] = useState(false);

  // Active MCQ Quiz Session State
  const [activeQuestions, setActiveQuestions] = useState<QuizQuestionItem[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [submittedCurrent, setSubmittedCurrent] = useState(false);
  const [quizFinished, setQuizFinished] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [reviewWrongOnly, setReviewWrongOnly] = useState(false);

  // Descriptive Writing State
  const [descSubject, setDescSubject] = useState('Finance');
  const [descMarks, setDescMarks] = useState<10 | 15>(15);
  const [descPrompt, setDescPrompt] = useState(
    'Discuss the developmental and regulatory functions of the Reserve Bank of India in maintaining financial stability and deepening digital financial inclusion. (15 Marks, 600 Words)'
  );
  const [descAnswer, setDescAnswer] = useState(() => {
    try {
      return localStorage.getItem('rbi_prep_os_descriptive_draft_v5') || '';
    } catch {
      return '';
    }
  });
  const [evaluatingDesc, setEvaluatingDesc] = useState(false);
  const [descFeedbackResult, setDescFeedbackResult] = useState<{
    estimatedPracticeScore: number;
    maxMarks: number;
    strengths: string[];
    missingDimensions: string[];
    structuralFeedback: string;
    modelWayForward: string;
    scoringDisclaimer: string;
  } | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem('rbi_prep_os_descriptive_draft_v5', descAnswer);
    } catch {
      // Ignore storage quota warnings on draft autosave
    }
  }, [descAnswer]);

  useEffect(() => {
    if (activeQuestions.length === 0 || quizFinished || !timerEnabled) return;
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [activeQuestions.length, quizFinished, timerEnabled]);

  const handleStartOfflineBankQuiz = async () => {
    setGeneratingQuiz(true);
    setQuizFinished(false);
    setReviewWrongOnly(false);
    setCurrentIdx(0);
    setSubmittedCurrent(false);
    setElapsedSeconds(0);
    try {
      const bankQuestions = await dbGetOfflineQuizQuestions(selectedSubject);
      const source = bankQuestions.length > 0 ? bankQuestions : CURATED_RBI_FALLBACK_QUESTIONS;
      setActiveQuestions(
        source.slice(0, questionCount).map((q) => ({
          ...q,
          selectedOption: null,
          isSkipped: false,
          isBookmarked: false,
        }))
      );
      showSnackbar(
        `Loaded ${Math.min(source.length, questionCount)} curated offline practice questions from local IndexedDB.`
      );
    } finally {
      setGeneratingQuiz(false);
    }
  };

  const handleGenerateMcqQuiz = async () => {
    if (!isOnline) {
      await handleStartOfflineBankQuiz();
      return;
    }
    setGeneratingQuiz(true);
    setQuizFinished(false);
    setReviewWrongOnly(false);
    setCurrentIdx(0);
    setSubmittedCurrent(false);
    setElapsedSeconds(0);

    try {
      const relevantNotes = notes
        .filter(
          (n) =>
            n.subject === selectedSubject ||
            n.topicTitle.toLowerCase().includes(selectedTopic.toLowerCase())
        )
        .slice(0, 4)
        .map((n) => `[${n.title}]: ${n.content}`)
        .join('\n\n');

      const response = await authenticatedAiFetch('/api/ai/generate-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: selectedSubject,
          topic: selectedTopic,
          count: questionCount,
          notesContext: relevantNotes,
        }),
      });

      const data = await response.json();
      if (response.ok && Array.isArray(data.questions) && data.questions.length > 0) {
        const mapped: QuizQuestionItem[] = data.questions.map(
          (q: Record<string, unknown>, i: number) => ({
            id: makeSafeId(`q_${i}`),
            question: String(q.question || ''),
            options: Array.isArray(q.options) ? q.options.map(String) : ['Option A', 'Option B', 'Option C', 'Option D'],
            correctIndex: typeof q.correctIndex === 'number' ? q.correctIndex : 0,
            explanation: String(q.explanation || ''),
            difficulty: String(q.difficulty || 'Phase II'),
            conceptTag: String(q.conceptTag || selectedTopic),
            groundedInNotes: Boolean(q.groundedInNotes),
            selectedOption: null,
            isSkipped: false,
            isBookmarked: false,
          })
        );
        setActiveQuestions(mapped);
        showSnackbar(`Generated ${mapped.length} practice questions from your notes & syllabus.`);
      } else {
        await handleStartOfflineBankQuiz();
      }
    } catch {
      await handleStartOfflineBankQuiz();
    } finally {
      setGeneratingQuiz(false);
    }
  };

  const currentQuestion = activeQuestions[currentIdx];

  const handleSelectOption = (optIdx: number) => {
    if (submittedCurrent) return;
    setActiveQuestions((prev) =>
      prev.map((q, i) =>
        i === currentIdx ? { ...q, selectedOption: optIdx, isSkipped: false } : q
      )
    );
  };

  const handleSubmitCurrentAnswer = () => {
    if (currentQuestion?.selectedOption === null || currentQuestion?.selectedOption === undefined) {
      showSnackbar('Select an option first, or click Skip Question.');
      return;
    }
    setSubmittedCurrent(true);
  };

  const handleSkipQuestion = () => {
    setActiveQuestions((prev) =>
      prev.map((q, i) =>
        i === currentIdx ? { ...q, selectedOption: null, isSkipped: true } : q
      )
    );
    if (currentIdx + 1 < activeQuestions.length) {
      setCurrentIdx((prev) => prev + 1);
      setSubmittedCurrent(false);
    } else {
      handleFinishAndSaveQuiz();
    }
  };

  const handleToggleBookmark = () => {
    setActiveQuestions((prev) =>
      prev.map((q, i) => (i === currentIdx ? { ...q, isBookmarked: !q.isBookmarked } : q))
    );
  };

  const handleSetMistakeCategory = (qId: string, cat: MistakeCategory) => {
    setActiveQuestions((prev) =>
      prev.map((q) => (q.id === qId ? { ...q, mistakeCategory: cat } : q))
    );
  };

  const handleNextQuestion = () => {
    if (currentIdx + 1 < activeQuestions.length) {
      setCurrentIdx((prev) => prev + 1);
      setSubmittedCurrent(false);
    } else {
      handleFinishAndSaveQuiz();
    }
  };

  const handleFinishAndSaveQuiz = async () => {
    setQuizFinished(true);
    const total = activeQuestions.length;
    const correct = activeQuestions.filter((q) => q.selectedOption === q.correctIndex).length;
    const skipped = activeQuestions.filter(
      (q) => q.isSkipped || q.selectedOption === null || q.selectedOption === undefined
    ).length;
    const incorrect = total - correct - skipped;
    const accuracy = Math.round((correct / Math.max(1, total)) * 100);

    const matchedTopic = topics.find(
      (t) =>
        t.subject === selectedSubject &&
        t.title.toLowerCase() === selectedTopic.toLowerCase()
    );

    await saveQuizAttempt({
      quizType: 'mcq',
      subject: selectedSubject,
      topicId: matchedTopic?.id,
      topicTitle: selectedTopic,
      totalQuestions: total,
      correctCount: correct,
      incorrectCount: incorrect,
      skippedCount: skipped,
      accuracy,
      durationSeconds: elapsedSeconds,
      questions: activeQuestions,
      attemptDate: getKolkataDateString(),
    });
  };

  const handleSchedulePostQuizRevision = async () => {
    const total = activeQuestions.length;
    const correct = activeQuestions.filter((q) => q.selectedOption === q.correctIndex).length;
    const accuracy = Math.round((correct / Math.max(1, total)) * 100);
    const intervalDays = accuracy < 65 ? 1 : 3;
    const dueDate = addDaysToDateStr(getKolkataDateString(), intervalDays);

    const matchedTopic = topics.find(
      (t) =>
        t.subject === selectedSubject &&
        t.title.toLowerCase() === selectedTopic.toLowerCase()
    );

    await saveRevisionItem({
      topicId: matchedTopic?.id || makeSafeId('topic'),
      topicTitle: selectedTopic,
      subject: selectedSubject,
      phase: 'Phase II',
      intervalDays,
      stageLabel: `Day ${intervalDays} Post-Quiz Review`,
      dueDate,
      status: 'upcoming',
      confidence: accuracy >= 80 ? 4 : 3,
      lastAccuracy: accuracy,
      recommendationReason: `Scheduled Day ${intervalDays} revision based on your ${accuracy}% quiz accuracy on ${selectedTopic}.`,
    });
    setActiveTab('revision');
  };

  const handleEvaluateDescriptive = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!descAnswer.trim()) return;
    setEvaluatingDesc(true);
    try {
      const response = await authenticatedAiFetch('/api/ai/descriptive-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: descSubject,
          questionPrompt: descPrompt,
          userAnswer: descAnswer,
          maxMarks: descMarks,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Evaluation failed');
      setDescFeedbackResult(data);
      const pct = Math.round(((Number(data.estimatedPracticeScore) || 0) / descMarks) * 100);
      await saveQuizAttempt({
        quizType: 'descriptive',
        subject: descSubject,
        topicTitle: 'Descriptive Writing Practice',
        totalQuestions: 1,
        correctCount: pct >= 50 ? 1 : 0,
        incorrectCount: pct >= 50 ? 0 : 1,
        skippedCount: 0,
        accuracy: pct,
        durationSeconds: 900,
        questions: [],
        descriptiveData: {
          questionPrompt: descPrompt,
          userAnswer: descAnswer,
          estimatedScore: Number(data.estimatedPracticeScore) || 0,
          maxMarks: descMarks,
          feedback: data.structuralFeedback || '',
        },
        attemptDate: getKolkataDateString(),
      });
    } catch (err) {
      showSnackbar(err instanceof Error ? err.message : 'Descriptive evaluation error.');
    } finally {
      setEvaluatingDesc(false);
    }
  };

  const wrongQuestions = activeQuestions.filter(
    (q) => q.selectedOption !== q.correctIndex
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-xs font-medium text-[var(--md-on-surface-variant)]">
            AI-Generated Practice Material · Distinct from Official RBI Examination Questions
          </span>
          <h1 className="font-display text-2xl md:text-3xl font-semibold text-[var(--md-on-surface)]">
            Practice &amp; Mock Test Engine
          </h1>
        </div>

        <div className="inline-flex p-1 rounded-full bg-[var(--md-surface-container-high)] border border-[var(--md-outline-variant)]/50">
          <button
            onClick={() => setPracticeTab('mcq')}
            className={`px-4 py-1.5 rounded-full text-xs font-medium cursor-pointer ${
              practiceTab === 'mcq'
                ? 'bg-[var(--md-primary)] text-[var(--md-on-primary)]'
                : 'text-[var(--md-on-surface-variant)]'
            }`}
          >
            Interactive MCQ Quiz
          </button>
          <button
            onClick={() => setPracticeTab('descriptive')}
            className={`px-4 py-1.5 rounded-full text-xs font-medium cursor-pointer ${
              practiceTab === 'descriptive'
                ? 'bg-[var(--md-primary)] text-[var(--md-on-primary)]'
                : 'text-[var(--md-on-surface-variant)]'
            }`}
          >
            Phase II Descriptive Writing
          </button>
          <button
            onClick={() => setPracticeTab('history')}
            className={`px-4 py-1.5 rounded-full text-xs font-medium cursor-pointer ${
              practiceTab === 'history'
                ? 'bg-[var(--md-primary)] text-[var(--md-on-primary)]'
                : 'text-[var(--md-on-surface-variant)]'
            }`}
          >
            Attempt History ({quizzes.length})
          </button>
        </div>
      </div>

      {/* TAB 1: INTERACTIVE MCQ ENGINE */}
      {practiceTab === 'mcq' && (
        <div className="space-y-6">
          {/* Quiz Generator Bar */}
          <div className="rounded-[24px] bg-[var(--md-surface-container-low)] p-6 border border-[var(--md-outline-variant)]/40 grid grid-cols-1 sm:grid-cols-12 gap-4 items-end">
            <div className="sm:col-span-3">
              <label className="block text-xs font-medium text-[var(--md-on-surface-variant)] mb-1">
                Subject
              </label>
              <select
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-[14px] bg-[var(--md-surface)] text-sm border border-[var(--md-outline-variant)]"
              >
                {allSubjects.map((s) => (
                  <option key={s.id} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-4">
              <label className="block text-xs font-medium text-[var(--md-on-surface-variant)] mb-1">
                Topic (Uses saved notes when available)
              </label>
              <input
                type="text"
                list="quiz-topics-list"
                value={selectedTopic}
                onChange={(e) => setSelectedTopic(e.target.value)}
                placeholder="e.g., Functions of RBI"
                className="w-full px-3.5 py-2.5 rounded-[14px] bg-[var(--md-surface)] text-sm border border-[var(--md-outline-variant)]"
              />
              <datalist id="quiz-topics-list">
                {topics.map((t) => (
                  <option key={t.id} value={t.title} />
                ))}
              </datalist>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-[var(--md-on-surface-variant)] mb-1">
                Questions
              </label>
              <select
                value={questionCount}
                onChange={(e) => setQuestionCount(Number(e.target.value))}
                className="w-full px-3 py-2.5 rounded-[14px] bg-[var(--md-surface)] text-sm font-mono-tabular border border-[var(--md-outline-variant)]"
              >
                <option value={5}>5 Questions</option>
                <option value={10}>10 Questions</option>
              </select>
            </div>

            <div className="sm:col-span-3 flex flex-col gap-1.5">
              <button
                onClick={handleGenerateMcqQuiz}
                disabled={generatingQuiz}
                className="w-full py-2 px-4 rounded-full bg-[var(--md-primary)] text-[var(--md-on-primary)] text-xs font-medium disabled:opacity-50 cursor-pointer"
              >
                {generatingQuiz
                  ? `Generating ${questionCount} Questions...`
                  : isOnline
                  ? 'Generate AI Practice Quiz'
                  : 'Start Offline Question Bank Quiz'}
              </button>
              <button
                type="button"
                onClick={handleStartOfflineBankQuiz}
                disabled={generatingQuiz}
                className="w-full py-1.5 px-3 rounded-full bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)] text-[11px] font-medium cursor-pointer"
              >
                Load Offline Question Bank ({questionCount} Qs)
              </button>
            </div>
          </div>

          {/* Active Question Stage (One Question at a Time) */}
          {activeQuestions.length > 0 && !quizFinished && currentQuestion && (
            <div className="rounded-[28px] bg-[var(--md-surface-container)] p-6 md:p-8 border border-[var(--md-outline-variant)]/50 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--md-outline-variant)]/40 pb-4">
                <div className="flex items-center gap-2 text-xs text-[var(--md-on-surface-variant)] font-mono-tabular">
                  <span className="font-semibold text-[var(--md-primary)]">
                    Question {currentIdx + 1} of {activeQuestions.length}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{currentQuestion.conceptTag}</span>
                  <span aria-hidden="true">·</span>
                  <span>Practice Material (Not Official RBI Paper)</span>
                </div>

                <div className="flex items-center gap-3">
                  {timerEnabled && (
                    <span className="font-mono-tabular text-xs text-[var(--md-on-surface-variant)]">
                      Elapsed: {Math.floor(elapsedSeconds / 60)}m {elapsedSeconds % 60}s
                    </span>
                  )}
                  <button
                    onClick={handleToggleBookmark}
                    className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium cursor-pointer ${
                      currentQuestion.isBookmarked
                        ? 'bg-[var(--md-primary)] text-[var(--md-on-primary)]'
                        : 'bg-[var(--md-surface)] text-[var(--md-on-surface-variant)] border border-[var(--md-outline-variant)]'
                    }`}
                  >
                    <span className="material-symbols-rounded text-[15px]">bookmark</span>
                    <span>{currentQuestion.isBookmarked ? 'Bookmarked' : 'Bookmark'}</span>
                  </button>
                </div>
              </div>

              <h2 className="font-display text-lg md:text-xl font-semibold text-[var(--md-on-surface)] leading-snug">
                {currentQuestion.question}
              </h2>

              <div className="space-y-3">
                {currentQuestion.options.map((opt, idx) => {
                  const isSelected = currentQuestion.selectedOption === idx;
                  const isCorrect = currentQuestion.correctIndex === idx;

                  let styleClass =
                    'bg-[var(--md-surface)] text-[var(--md-on-surface)] border-[var(--md-outline-variant)] hover:bg-[var(--md-surface-container-low)]';

                  if (submittedCurrent) {
                    if (isCorrect) {
                      styleClass =
                        'bg-[var(--md-primary-container)] text-[var(--md-on-primary-container)] border-[var(--md-primary)] font-semibold';
                    } else if (isSelected && !isCorrect) {
                      styleClass =
                        'bg-[var(--md-error-container)] text-[var(--md-on-error-container)] border-[var(--md-error)]';
                    }
                  } else if (isSelected) {
                    styleClass =
                      'bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)] border-[var(--md-primary)] font-medium';
                  }

                  return (
                    <button
                      key={idx}
                      onClick={() => handleSelectOption(idx)}
                      className={`w-full text-left p-4 rounded-[18px] border text-sm transition-colors flex items-center justify-between gap-3 cursor-pointer ${styleClass}`}
                    >
                      <span>
                        <strong className="font-mono-tabular mr-2">
                          {String.fromCharCode(65 + idx)}.
                        </strong>
                        {opt}
                      </span>
                      {submittedCurrent && isCorrect && (
                        <span className="text-xs font-semibold">Correct Answer</span>
                      )}
                      {submittedCurrent && isSelected && !isCorrect && (
                        <span className="text-xs font-semibold">Your Selection</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Instant Feedback & Detailed Explanation */}
              {submittedCurrent && (
                <div className="p-5 rounded-[20px] bg-[var(--md-surface)] border border-[var(--md-outline-variant)] space-y-3">
                  <div className="text-xs font-semibold text-[var(--md-primary)]">
                    Detailed Concept Explanation
                  </div>
                  <p className="text-xs text-[var(--md-on-surface)] leading-relaxed">
                    {currentQuestion.explanation}
                  </p>

                  {currentQuestion.selectedOption !== currentQuestion.correctIndex && (
                    <div className="pt-2 border-t border-[var(--md-outline-variant)]/40 flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-[var(--md-on-surface-variant)]">
                        Tag Mistake Category:
                      </span>
                      {MISTAKE_CATEGORIES.map((cat) => (
                        <button
                          key={cat}
                          onClick={() => handleSetMistakeCategory(currentQuestion.id, cat)}
                          className={`px-2.5 py-1 rounded-full text-[11px] font-medium cursor-pointer ${
                            currentQuestion.mistakeCategory === cat
                              ? 'bg-[var(--md-primary)] text-[var(--md-on-primary)]'
                              : 'bg-[var(--md-surface-container)] text-[var(--md-on-surface-variant)]'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Quiz Action Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <button
                  onClick={handleSkipQuestion}
                  className="px-4 py-2.5 rounded-full border border-[var(--md-outline-variant)] text-xs font-medium text-[var(--md-on-surface-variant)] cursor-pointer"
                >
                  Skip Question
                </button>

                <div className="flex items-center gap-3">
                  {!submittedCurrent ? (
                    <button
                      onClick={handleSubmitCurrentAnswer}
                      className="px-6 py-2.5 rounded-full bg-[var(--md-primary)] text-[var(--md-on-primary)] text-xs font-medium cursor-pointer"
                    >
                      Submit Answer
                    </button>
                  ) : (
                    <button
                      onClick={handleNextQuestion}
                      className="px-6 py-2.5 rounded-full bg-[var(--md-primary)] text-[var(--md-on-primary)] text-xs font-medium cursor-pointer"
                    >
                      {currentIdx + 1 < activeQuestions.length
                        ? 'Next Question'
                        : 'Finish & Save Attempt'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Quiz Summary & Incorrect Answer Review */}
          {quizFinished && activeQuestions.length > 0 && (
            <div className="rounded-[28px] bg-[var(--md-surface-container-low)] p-6 md:p-8 border border-[var(--md-outline-variant)]/50 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <span className="text-xs font-medium text-[var(--md-primary)]">
                    Attempt Saved to History
                  </span>
                  <h2 className="font-display text-2xl font-semibold text-[var(--md-on-surface)]">
                    Quiz Complete — {selectedTopic}
                  </h2>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    onClick={() => setReviewWrongOnly((prev) => !prev)}
                    className="px-4 py-2 rounded-full bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)] text-xs font-medium cursor-pointer"
                  >
                    {reviewWrongOnly
                      ? `Show All Questions (${activeQuestions.length})`
                      : `Review Incorrect & Skipped (${wrongQuestions.length})`}
                  </button>
                  <button
                    onClick={handleSchedulePostQuizRevision}
                    className="px-5 py-2 rounded-full bg-[var(--md-primary)] text-[var(--md-on-primary)] text-xs font-medium cursor-pointer"
                  >
                    Schedule Spaced Revision
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {(reviewWrongOnly ? wrongQuestions : activeQuestions).map((q, idx) => {
                  const isCorrect = q.selectedOption === q.correctIndex;
                  return (
                    <div
                      key={q.id}
                      className="p-5 rounded-[20px] bg-[var(--md-surface)] border border-[var(--md-outline-variant)]/50 space-y-2"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-[var(--md-on-surface)]">
                          Q{idx + 1}. {q.conceptTag}
                        </span>
                        <span
                          className={`font-semibold ${
                            isCorrect ? 'text-[var(--md-primary)]' : 'text-[var(--md-error)]'
                          }`}
                        >
                          {isCorrect ? 'Correct' : q.isSkipped ? 'Skipped' : 'Incorrect'}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-[var(--md-on-surface)]">
                        {q.question}
                      </p>
                      <p className="text-xs text-[var(--md-on-surface-variant)]">
                        Correct Option:{' '}
                        <strong className="text-[var(--md-on-surface)]">
                          {q.options[q.correctIndex]}
                        </strong>
                      </p>
                      <p className="text-xs text-[var(--md-on-surface-variant)] pt-1">
                        {q.explanation}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: PHASE II DESCRIPTIVE WRITING */}
      {practiceTab === 'descriptive' && (
        <div className="rounded-[28px] bg-[var(--md-surface-container-low)] p-6 md:p-8 border border-[var(--md-outline-variant)]/50 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="text-xs font-medium text-[var(--md-primary)]">
                AI-Assisted Practice Feedback · Distinct from Verified RBI Scoring
              </span>
              <h2 className="font-display text-xl font-semibold text-[var(--md-on-surface)]">
                Phase II Descriptive Answer Practice
              </h2>
            </div>
          </div>

          <form onSubmit={handleEvaluateDescriptive} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-[var(--md-on-surface-variant)] mb-1">
                  Paper / Subject
                </label>
                <select
                  value={descSubject}
                  onChange={(e) => setDescSubject(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-[14px] bg-[var(--md-surface)] text-sm border border-[var(--md-outline-variant)]"
                >
                  <option value="Economic and Social Issues">Economic and Social Issues (ESI)</option>
                  <option value="Finance">Finance</option>
                  <option value="Management">Management</option>
                  <option value="English Descriptive">English Descriptive</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-[var(--md-on-surface-variant)] mb-1">
                  Marks Weightage
                </label>
                <select
                  value={descMarks}
                  onChange={(e) => setDescMarks(Number(e.target.value) as 10 | 15)}
                  className="w-full px-3.5 py-2 rounded-[14px] bg-[var(--md-surface)] text-sm font-mono-tabular border border-[var(--md-outline-variant)]"
                >
                  <option value={15}>15 Marks (600 Words)</option>
                  <option value={10}>10 Marks (400 Words)</option>
                </select>
              </div>
              <div className="flex items-end">
                <span className="text-xs font-mono-tabular text-[var(--md-on-surface-variant)] pb-2">
                  Word count:{' '}
                  {descAnswer.trim() ? descAnswer.trim().split(/\s+/).length : 0} words
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs text-[var(--md-on-surface-variant)] mb-1">
                Descriptive Question Prompt
              </label>
              <input
                type="text"
                value={descPrompt}
                onChange={(e) => setDescPrompt(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-[14px] bg-[var(--md-surface)] text-sm border border-[var(--md-outline-variant)]"
              />
            </div>

            <div>
              <label className="block text-xs text-[var(--md-on-surface-variant)] mb-1">
                Your Structured Answer (Introduction → Body → RBI Data/Committees → Way Forward)
              </label>
              <textarea
                rows={9}
                required
                value={descAnswer}
                onChange={(e) => setDescAnswer(e.target.value)}
                placeholder="Type your descriptive response here..."
                className="w-full p-4 rounded-[16px] bg-[var(--md-surface)] text-sm border border-[var(--md-outline-variant)] leading-relaxed"
              />
            </div>

            <button
              type="submit"
              disabled={evaluatingDesc}
              className="px-6 py-2.5 rounded-full bg-[var(--md-primary)] text-[var(--md-on-primary)] text-xs font-medium disabled:opacity-50 cursor-pointer"
            >
              {evaluatingDesc ? 'Evaluating Descriptive Answer...' : 'Get AI Practice Feedback'}
            </button>
          </form>

          {descFeedbackResult && (
            <div className="p-5 rounded-[20px] bg-[var(--md-surface)] border border-[var(--md-outline-variant)] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--md-on-surface-variant)]">
                  {descFeedbackResult.scoringDisclaimer}
                </span>
                <span className="font-mono-tabular text-lg font-semibold text-[var(--md-primary)]">
                  Estimated Practice Score: {descFeedbackResult.estimatedPracticeScore} / {descFeedbackResult.maxMarks}
                </span>
              </div>
              <p className="text-xs text-[var(--md-on-surface)]">
                {descFeedbackResult.structuralFeedback}
              </p>
              <p className="text-xs text-[var(--md-on-surface-variant)]">
                <strong>Model Way Forward:</strong> {descFeedbackResult.modelWayForward}
              </p>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: ATTEMPT HISTORY */}
      {practiceTab === 'history' && (
        <div className="rounded-[24px] bg-[var(--md-surface-container-low)] p-6 border border-[var(--md-outline-variant)]/40">
          <h2 className="font-display text-lg font-semibold text-[var(--md-on-surface)] mb-4">
            Saved Quiz &amp; Assessment Attempts ({quizzes.length})
          </h2>
          {quizzes.length === 0 ? (
            <p className="text-xs text-[var(--md-on-surface-variant)] py-6 text-center">
              No quiz attempts recorded yet. Generate a 5-question practice quiz in the first tab to build your accuracy history.
            </p>
          ) : (
            <div className="divide-y divide-[var(--md-outline-variant)]/40">
              {quizzes.map((qz) => (
                <div
                  key={qz.id}
                  className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div>
                    <p className="text-sm font-semibold text-[var(--md-on-surface)]">
                      {qz.topicTitle} ({qz.subject})
                    </p>
                    <div className="flex items-center gap-2 text-xs text-[var(--md-on-surface-variant)] font-mono-tabular">
                      <span>{qz.attemptDate}</span>
                      <span aria-hidden="true">·</span>
                      <span className="uppercase">{qz.quizType}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {qz.correctCount}/{qz.totalQuestions} correct
                      </span>
                    </div>
                  </div>
                  <div className="font-mono-tabular text-base font-semibold text-[var(--md-primary)]">
                    {qz.accuracy}% Accuracy
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
