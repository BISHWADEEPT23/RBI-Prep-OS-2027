import React, { useMemo } from 'react';
import { addDaysToDateStr, getKolkataDateString, useStudy } from '../context/StudyContext';

interface StudyProgressDashboardProps {
  onOpenFocus?: () => void;
  onOpenRoutine?: () => void;
  onOpenPractice?: () => void;
  onOpenRevision?: () => void;
  onSelectSubjectFilter?: (subject: string | null) => void;
}

function formatMinutesToHours(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hrs = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

function formatSaveTimestamp(iso: string | null): string {
  if (!iso) return 'Not saved yet in this session';
  try {
    const dt = new Date(iso);
    const now = new Date();
    const diffSec = Math.round((now.getTime() - dt.getTime()) / 1000);
    if (diffSec < 10) return 'Just now (IndexedDB v2)';
    if (diffSec < 60) return `${diffSec} seconds ago`;
    return dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return iso;
  }
}

export const StudyProgressDashboard: React.FC<StudyProgressDashboardProps> = ({
  onOpenFocus,
  onOpenRoutine,
  onOpenPractice,
  onOpenRevision,
  onSelectSubjectFilter,
}) => {
  const {
    allSubjects,
    topics,
    sessions,
    quizzes,
    revisions,
    lastSaveTimeIso,
    prefs,
    setActiveTab,
  } = useStudy();

  const todayStr = getKolkataDateString();
  const weekStartStr = addDaysToDateStr(todayStr, -6);

  // 1. Total Study Hours & Sessions
  const totalStudyMinutes = useMemo(
    () => sessions.reduce((acc, s) => acc + (Number(s.focusedMinutes) || 0), 0),
    [sessions]
  );
  const totalStudyHoursFormatted = (totalStudyMinutes / 60).toFixed(1);

  // 2. Today's Study Time
  const todayStudyMinutes = useMemo(
    () =>
      sessions
        .filter((s) => s.sessionDate === todayStr)
        .reduce((acc, s) => acc + (Number(s.focusedMinutes) || 0), 0),
    [sessions, todayStr]
  );

  // 3. Weekly Study Hours (Last 7 Days)
  const weeklyStudyMinutes = useMemo(
    () =>
      sessions
        .filter((s) => s.sessionDate >= weekStartStr && s.sessionDate <= todayStr)
        .reduce((acc, s) => acc + (Number(s.focusedMinutes) || 0), 0),
    [sessions, weekStartStr, todayStr]
  );
  const weeklyStudyHoursFormatted = (weeklyStudyMinutes / 60).toFixed(1);

  // 4. Completed Syllabus Topics (Mastered, Practice Completed, or Lecture Completed)
  const completedTopicsCount = useMemo(
    () =>
      topics.filter(
        (t) =>
          t.status === 'Mastered' ||
          t.status === 'Practice Completed' ||
          t.status === 'Lecture Completed'
      ).length,
    [topics]
  );
  const totalTopicsCount = topics.length;
  const overallTopicCompletionPct =
    totalTopicsCount > 0 ? Math.round((completedTopicsCount / totalTopicsCount) * 100) : 0;

  // 5. Pending Revisions
  const dueRevisionsCount = useMemo(
    () => revisions.filter((r) => r.status !== 'completed' && r.dueDate <= todayStr).length,
    [revisions, todayStr]
  );

  // 6. Quiz & Mock Test Performance
  const totalQuizzes = quizzes.length;
  const averageAccuracy = useMemo(() => {
    if (totalQuizzes === 0) return null;
    const sum = quizzes.reduce((acc, q) => acc + (Number(q.accuracy ?? 0) || 0), 0);
    return Math.round(sum / totalQuizzes);
  }, [quizzes, totalQuizzes]);

  // 7. Recent Study Sessions
  const recentSessions = useMemo(() => sessions.slice(0, 4), [sessions]);

  // 8. Subject-wise Completion
  const subjectProgressList = useMemo(() => {
    return allSubjects.map((s) => {
      const subjTopics = topics.filter(
        (t) => t.subject.toLowerCase() === s.name.toLowerCase()
      );
      const completed = subjTopics.filter(
        (t) =>
          t.status === 'Mastered' ||
          t.status === 'Practice Completed' ||
          t.status === 'Lecture Completed'
      ).length;
      const total = subjTopics.length;
      const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
      const subjMins = sessions
        .filter((sess) => sess.subject.toLowerCase() === s.name.toLowerCase())
        .reduce((acc, sess) => acc + (Number(sess.focusedMinutes) || 0), 0);
      return {
        id: s.id,
        name: s.name,
        code: s.code,
        phase: s.phase,
        completedTopics: completed,
        totalTopics: total,
        completionPct: pct,
        studyMinutes: subjMins,
        studyHours: (subjMins / 60).toFixed(1),
      };
    });
  }, [allSubjects, topics, sessions]);

  const isEmptyState = sessions.length === 0 && quizzes.length === 0;

  return (
    <div className="bg-white dark:bg-[#121917] rounded-2xl border border-neutral-200/80 dark:border-neutral-800 p-4 sm:p-5 shadow-xs mb-5 select-text">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-neutral-100 dark:border-neutral-800">
        <div>
          <h2 className="text-[17px] font-bold text-neutral-900 dark:text-neutral-100 m-0 flex items-center gap-2">
            <span>Study Progress & Exam Mastery</span>
            <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full bg-[#427968]/15 text-[#427968] uppercase">
              Authoritative Local
            </span>
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5 m-0">
            Computed in real-time from your persistent IndexedDB records
          </p>
        </div>

        {/* Last Successful Save Indicator */}
        <div className="flex items-center gap-2 text-xs text-neutral-500 bg-neutral-50 dark:bg-neutral-800 px-3 py-1.5 rounded-xl border border-neutral-200/60 dark:border-neutral-700">
          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
          <span>Last saved:</span>
          <strong className="text-neutral-800 dark:text-neutral-200">
            {formatSaveTimestamp(lastSaveTimeIso)}
          </strong>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3 mb-5">
        {/* Total Hours */}
        <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-850 border border-neutral-200/70 dark:border-neutral-800">
          <div className="text-[11px] font-medium text-neutral-500">Total Study Time</div>
          <div className="text-lg sm:text-xl font-bold text-[#1d3934] dark:text-[#a0d2c3] mt-0.5 font-mono-tabular">
            {totalStudyHoursFormatted} <span className="text-xs font-normal">hrs</span>
          </div>
          <div className="text-[10px] text-neutral-400 mt-0.5">{sessions.length} sessions logged</div>
        </div>

        {/* Today's Focus */}
        <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-850 border border-neutral-200/70 dark:border-neutral-800">
          <div className="text-[11px] font-medium text-neutral-500">Today's Focus</div>
          <div className="text-lg sm:text-xl font-bold text-[#427968] mt-0.5 font-mono-tabular">
            {formatMinutesToHours(todayStudyMinutes)}
          </div>
          <div className="text-[10px] text-neutral-400 mt-0.5">
            Goal: {formatMinutesToHours(prefs.dailyGoalMinutes)}
          </div>
        </div>

        {/* Weekly Hours */}
        <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-850 border border-neutral-200/70 dark:border-neutral-800">
          <div className="text-[11px] font-medium text-neutral-500">Last 7 Days</div>
          <div className="text-lg sm:text-xl font-bold text-neutral-800 dark:text-neutral-200 mt-0.5 font-mono-tabular">
            {weeklyStudyHoursFormatted} <span className="text-xs font-normal">hrs</span>
          </div>
          <div className="text-[10px] text-neutral-400 mt-0.5">Rolling 7-day total</div>
        </div>

        {/* Syllabus Completed */}
        <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-850 border border-neutral-200/70 dark:border-neutral-800">
          <div className="text-[11px] font-medium text-neutral-500">Syllabus Topics</div>
          <div className="text-lg sm:text-xl font-bold text-neutral-800 dark:text-neutral-200 mt-0.5 font-mono-tabular">
            {completedTopicsCount} <span className="text-xs font-normal">/ {totalTopicsCount}</span>
          </div>
          <div className="text-[10px] text-emerald-600 font-semibold mt-0.5">
            {overallTopicCompletionPct}% Completed
          </div>
        </div>

        {/* Due Revisions */}
        <div
          onClick={onOpenRevision || (() => setActiveTab('revision'))}
          className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-850 border border-neutral-200/70 dark:border-neutral-800 hover:border-[#427968] cursor-pointer transition-colors"
        >
          <div className="text-[11px] font-medium text-neutral-500">Pending Revisions</div>
          <div className="text-lg sm:text-xl font-bold text-amber-700 dark:text-amber-400 mt-0.5 font-mono-tabular">
            {dueRevisionsCount}
          </div>
          <div className="text-[10px] text-neutral-400 mt-0.5">Due today or overdue</div>
        </div>

        {/* Quiz Performance */}
        <div
          onClick={onOpenPractice || (() => setActiveTab('practice'))}
          className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-850 border border-neutral-200/70 dark:border-neutral-800 hover:border-[#427968] cursor-pointer transition-colors"
        >
          <div className="text-[11px] font-medium text-neutral-500">Quiz Accuracy</div>
          <div className="text-lg sm:text-xl font-bold text-neutral-800 dark:text-neutral-200 mt-0.5 font-mono-tabular">
            {averageAccuracy !== null ? `${averageAccuracy}%` : '—'}
          </div>
          <div className="text-[10px] text-neutral-400 mt-0.5">
            {totalQuizzes > 0 ? `${totalQuizzes} attempts logged` : 'No attempts yet'}
          </div>
        </div>
      </div>

      {/* Main Two-Column Breakdown: Subject Completion & Recent Sessions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left Column: Subject-wise Mastery Breakdown */}
        <div className="p-3.5 rounded-xl bg-neutral-50/70 dark:bg-neutral-850/60 border border-neutral-200/60 dark:border-neutral-800">
          <div className="flex items-center justify-between mb-2.5">
            <h3 className="text-xs font-bold text-neutral-800 dark:text-neutral-200 m-0 uppercase tracking-wider">
              Subject-wise Syllabus Mastery
            </h3>
            <button
              type="button"
              onClick={() => setActiveTab('subjects')}
              className="text-[11px] font-semibold text-[#427968] hover:underline cursor-pointer"
            >
              All Topics →
            </button>
          </div>

          <div className="space-y-2.5">
            {subjectProgressList.slice(0, 6).map((subj) => (
              <div
                key={subj.id}
                onClick={() => onSelectSubjectFilter?.(subj.name)}
                className="group cursor-pointer"
              >
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium text-neutral-800 dark:text-neutral-200 group-hover:text-[#427968] transition-colors truncate">
                    {subj.name}
                  </span>
                  <div className="flex items-center gap-2 shrink-0 text-[11px] text-neutral-500">
                    <span className="font-mono-tabular">{subj.studyHours}h studied</span>
                    <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                      {subj.completedTopics}/{subj.totalTopics} ({subj.completionPct}%)
                    </span>
                  </div>
                </div>
                {/* Progress Bar */}
                <div className="w-full h-1.5 rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#427968] transition-all duration-500"
                    style={{ width: `${subj.completionPct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Recent Persistent Study Sessions */}
        <div className="p-3.5 rounded-xl bg-neutral-50/70 dark:bg-neutral-850/60 border border-neutral-200/60 dark:border-neutral-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-xs font-bold text-neutral-800 dark:text-neutral-200 m-0 uppercase tracking-wider">
                Recent Study Sessions
              </h3>
              <button
                type="button"
                onClick={onOpenFocus || (() => setActiveTab('focus'))}
                className="text-[11px] font-semibold text-[#427968] hover:underline cursor-pointer"
              >
                + Start Session
              </button>
            </div>

            {isEmptyState ? (
              <div className="py-6 text-center text-neutral-500 text-xs">
                <div className="text-xl mb-1">⏱</div>
                <p className="font-semibold text-neutral-700 dark:text-neutral-300 m-0">
                  Ready to begin your RBI Grade B 2027 prep!
                </p>
                <p className="text-[11px] mt-1 text-neutral-400">
                  Use the Focus Timer or take a Practice Quiz to start tracking your daily progress here.
                </p>
                <button
                  type="button"
                  onClick={onOpenFocus || (() => setActiveTab('focus'))}
                  className="mt-3 px-3.5 py-1.5 rounded-lg bg-[#427968] text-white font-semibold text-xs cursor-pointer shadow-xs"
                >
                  Start First Focus Session ▶
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {recentSessions.map((s) => (
                  <div
                    key={s.id}
                    className="p-2 rounded-lg bg-white dark:bg-[#121917] border border-neutral-200/50 dark:border-neutral-700/50 flex items-center justify-between text-xs"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                        {s.topicTitle || s.subject}
                      </div>
                      <div className="text-[11px] text-neutral-500 mt-0.5">
                        {s.subject} · {s.sessionDate}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 text-right">
                      <span className="font-mono-tabular font-bold text-[#427968]">
                        +{s.focusedMinutes}m
                      </span>
                      {s.confidence && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600">
                          ★ {s.confidence}/5
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-3 pt-2 border-t border-neutral-200/60 dark:border-neutral-800 flex items-center justify-between text-[11px] text-neutral-500">
            <span>Persistence: IndexedDB v2 Verified</span>
            <button
              type="button"
              onClick={() => setActiveTab('analytics')}
              className="text-[#427968] font-semibold hover:underline cursor-pointer"
            >
              Detailed Analytics & Trends →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
