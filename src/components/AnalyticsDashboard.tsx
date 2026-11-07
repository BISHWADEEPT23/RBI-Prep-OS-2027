import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { addDaysToDateStr, getKolkataDateString, useStudy } from '../context/StudyContext';
import { ExamPhase } from '../types';

export const AnalyticsDashboard: React.FC = () => {
  const {
    allSubjects,
    topics,
    sessions,
    tasks,
    quizzes,
    revisions,
    recommendations,
    setActiveTab,
  } = useStudy();

  const todayStr = getKolkataDateString();
  const [phaseFilter, setPhaseFilter] = useState<'All' | ExamPhase>('All');
  const [subjectFilter, setSubjectFilter] = useState<string>('All');
  const [daysWindow, setDaysWindow] = useState<7 | 14 | 30>(14);

  const cutoffDate = addDaysToDateStr(todayStr, -(daysWindow - 1));

  const filteredSessions = useMemo(
    () =>
      sessions.filter((s) => {
        if (s.sessionDate < cutoffDate) return false;
        if (phaseFilter !== 'All' && s.phase !== phaseFilter) return false;
        if (subjectFilter !== 'All' && s.subject !== subjectFilter) return false;
        return true;
      }),
    [sessions, cutoffDate, phaseFilter, subjectFilter]
  );

  const filteredTopics = useMemo(
    () =>
      topics.filter((t) => {
        if (phaseFilter !== 'All' && t.phase !== phaseFilter) return false;
        if (subjectFilter !== 'All' && t.subject !== subjectFilter) return false;
        return true;
      }),
    [topics, phaseFilter, subjectFilter]
  );

  // KPI Aggregations from persisted records
  const todayMins = sessions
    .filter((s) => s.sessionDate === todayStr)
    .reduce((a, b) => a + b.focusedMinutes, 0);

  const weekStart = addDaysToDateStr(todayStr, -6);
  const weeklyHours = (
    sessions
      .filter((s) => s.sessionDate >= weekStart && s.sessionDate <= todayStr)
      .reduce((a, b) => a + b.focusedMinutes, 0) / 60
  ).toFixed(1);

  const monthStart = addDaysToDateStr(todayStr, -29);
  const monthlyHours = (
    sessions
      .filter((s) => s.sessionDate >= monthStart && s.sessionDate <= todayStr)
      .reduce((a, b) => a + b.focusedMinutes, 0) / 60
  ).toFixed(1);

  const completedRevisionsCount = revisions.filter((r) => r.status === 'completed').length;
  const revisionAdherencePct =
    revisions.length > 0
      ? Math.round((completedRevisionsCount / revisions.length) * 100)
      : 0;

  const backlogTasks = tasks.filter(
    (t) => (t.date < todayStr && t.status === 'planned') || t.status === 'missed'
  );
  const backlogMinutesEstimate = backlogTasks.reduce((a, b) => a + b.durationMinutes, 0);

  // Daily Planned vs Actual Chart Data
  const dailyComparisonData = useMemo(() => {
    const arr: { date: string; actualMins: number; plannedMins: number }[] = [];
    for (let i = daysWindow - 1; i >= 0; i--) {
      const d = addDaysToDateStr(todayStr, -i);
      const actualMins = filteredSessions
        .filter((s) => s.sessionDate === d)
        .reduce((a, b) => a + b.focusedMinutes, 0);
      const plannedMins = tasks
        .filter(
          (tk) =>
            tk.date === d &&
            (subjectFilter === 'All' || tk.subject === subjectFilter)
        )
        .reduce((a, b) => a + b.durationMinutes, 0);
      arr.push({
        date: d.slice(5),
        actualMins,
        plannedMins,
      });
    }
    return arr;
  }, [daysWindow, todayStr, filteredSessions, tasks, subjectFilter]);

  // Subject-wise Time Distribution
  const subjectDistributionData = useMemo(() => {
    const map: Record<string, number> = {};
    filteredSessions.forEach((s) => {
      map[s.subject] = (map[s.subject] || 0) + s.focusedMinutes;
    });
    return Object.entries(map)
      .map(([subject, minutes]) => ({
        subject,
        minutes,
        hours: Number((minutes / 60).toFixed(2)),
      }))
      .sort((a, b) => b.minutes - a.minutes);
  }, [filteredSessions]);

  // Quiz & Mock Score Trends
  const quizTrendData = useMemo(() => {
    return [...quizzes]
      .filter((q) => subjectFilter === 'All' || q.subject === subjectFilter)
      .reverse()
      .map((q, idx) => ({
        attempt: `#${idx + 1} (${q.attemptDate.slice(5)})`,
        accuracy: q.accuracy,
        topic: q.topicTitle,
      }));
  }, [quizzes, subjectFilter]);

  // Weak-Topic Rankings (sorted by lowest accuracy or lowest confidence)
  const weakTopicsRanking = useMemo(() => {
    return [...filteredTopics]
      .sort((a, b) => {
        const accA = typeof a.practiceAccuracy === 'number' ? a.practiceAccuracy : 50;
        const accB = typeof b.practiceAccuracy === 'number' ? b.practiceAccuracy : 50;
        if (accA !== accB) return accA - accB;
        return a.confidence - b.confidence;
      })
      .slice(0, 6);
  }, [filteredTopics]);

  // 28-Day Consistency Calendar
  const consistencyDays = useMemo(() => {
    const days: { date: string; minutes: number }[] = [];
    for (let i = 27; i >= 0; i--) {
      const d = addDaysToDateStr(todayStr, -i);
      const mins = sessions
        .filter((s) => s.sessionDate === d)
        .reduce((a, b) => a + b.focusedMinutes, 0);
      days.push({ date: d, minutes: mins });
    }
    return days;
  }, [sessions, todayStr]);

  const handleExportSessionsCsv = () => {
    const header =
      'SessionID,Date,Phase,Subject,Topic,FocusedMinutes,PausedMinutes,Confidence,Outcome\n';
    const rows = sessions
      .map(
        (s) =>
          `"${s.id}","${s.sessionDate}","${s.phase}","${s.subject}","${s.topicTitle.replace(/"/g, '""')}",${s.focusedMinutes},${s.pausedMinutes},${s.confidence},"${(s.outcome || '').replace(/"/g, '""')}"`
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rbi_prep_os_sessions_${todayStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Header & Filters */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-xs font-medium text-[var(--md-on-surface-variant)]">
            100% Grounded in Persisted Study Records · Zero Fabricated Metrics
          </span>
          <h1 className="font-display text-2xl md:text-3xl font-semibold text-[var(--md-on-surface)]">
            Performance Analytics
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={phaseFilter}
            onChange={(e) => setPhaseFilter(e.target.value as 'All' | ExamPhase)}
            className="px-3.5 py-2 rounded-full bg-[var(--md-surface-container)] text-xs font-medium border border-[var(--md-outline-variant)]"
          >
            <option value="All">All Phases</option>
            <option value="Phase I">Phase I</option>
            <option value="Phase II">Phase II</option>
            <option value="Additional Categories">Additional Categories</option>
          </select>

          <select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            className="px-3.5 py-2 rounded-full bg-[var(--md-surface-container)] text-xs font-medium border border-[var(--md-outline-variant)]"
          >
            <option value="All">All Subjects</option>
            {allSubjects.map((s) => (
              <option key={s.id} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>

          <select
            value={daysWindow}
            onChange={(e) => setDaysWindow(Number(e.target.value) as 7 | 14 | 30)}
            className="px-3.5 py-2 rounded-full bg-[var(--md-surface-container)] text-xs font-mono-tabular border border-[var(--md-outline-variant)]"
          >
            <option value={7}>Last 7 Days</option>
            <option value={14}>Last 14 Days</option>
            <option value={30}>Last 30 Days</option>
          </select>

          <button
            onClick={handleExportSessionsCsv}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[var(--md-primary)] text-[var(--md-on-primary)] text-xs font-medium cursor-pointer"
          >
            <span className="material-symbols-rounded text-[16px]">download</span>
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Top Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-4 rounded-[20px] bg-[var(--md-surface-container-low)] border border-[var(--md-outline-variant)]/40">
          <p className="text-xs text-[var(--md-on-surface-variant)]">Today Studied</p>
          <p className="font-mono-tabular text-2xl font-semibold text-[var(--md-on-surface)] mt-1">
            {todayMins}m
          </p>
        </div>
        <div className="p-4 rounded-[20px] bg-[var(--md-surface-container-low)] border border-[var(--md-outline-variant)]/40">
          <p className="text-xs text-[var(--md-on-surface-variant)]">7-Day Hours</p>
          <p className="font-mono-tabular text-2xl font-semibold text-[var(--md-on-surface)] mt-1">
            {weeklyHours}h
          </p>
        </div>
        <div className="p-4 rounded-[20px] bg-[var(--md-surface-container-low)] border border-[var(--md-outline-variant)]/40">
          <p className="text-xs text-[var(--md-on-surface-variant)]">30-Day Hours</p>
          <p className="font-mono-tabular text-2xl font-semibold text-[var(--md-on-surface)] mt-1">
            {monthlyHours}h
          </p>
        </div>
        <div className="p-4 rounded-[20px] bg-[var(--md-surface-container-low)] border border-[var(--md-outline-variant)]/40">
          <p className="text-xs text-[var(--md-on-surface-variant)]">Revision Adherence</p>
          <p className="font-mono-tabular text-2xl font-semibold text-[var(--md-primary)] mt-1">
            {revisions.length > 0 ? `${revisionAdherencePct}%` : '—'}
          </p>
        </div>
        <div className="p-4 rounded-[20px] bg-[var(--md-surface-container-low)] border border-[var(--md-outline-variant)]/40">
          <p className="text-xs text-[var(--md-on-surface-variant)]">Backlog Estimate</p>
          <p className="font-mono-tabular text-2xl font-semibold text-[var(--md-on-surface)] mt-1">
            {backlogMinutesEstimate}m
          </p>
        </div>
      </div>

      {/* Planned vs Actual Study Time + Subject Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 rounded-[24px] bg-[var(--md-surface-container-low)] p-6 border border-[var(--md-outline-variant)]/40 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-[var(--md-on-surface)]">
              Planned vs. Actual Study Duration (Minutes)
            </h2>
            <span className="text-xs text-[var(--md-on-surface-variant)] font-mono-tabular">
              {filteredSessions.length} session(s)
            </span>
          </div>

          {sessions.length === 0 && tasks.length === 0 ? (
            <div className="h-56 flex flex-col items-center justify-center text-center p-4 rounded-[18px] bg-[var(--md-surface)] border border-dashed border-[var(--md-outline-variant)]">
              <p className="text-sm font-medium text-[var(--md-on-surface)]">
                No study sessions logged yet
              </p>
              <p className="text-xs text-[var(--md-on-surface-variant)] mt-1">
                Complete a session in the Focus Room to populate your daily study chart.
              </p>
              <button
                onClick={() => setActiveTab('focus')}
                className="mt-3 px-4 py-1.5 rounded-full bg-[var(--md-primary)] text-[var(--md-on-primary)] text-xs font-medium cursor-pointer"
              >
                Open Focus Room
              </button>
            </div>
          ) : (
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyComparisonData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="plannedMins" name="Planned (m)" fill="var(--md-outline-variant)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="actualMins" name="Actual Focused (m)" fill="var(--md-primary)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Subject-Wise Time Distribution */}
        <div className="lg:col-span-5 rounded-[24px] bg-[var(--md-surface-container-low)] p-6 border border-[var(--md-outline-variant)]/40 space-y-4">
          <h2 className="font-display text-base font-semibold text-[var(--md-on-surface)]">
            Subject-Wise Study Distribution
          </h2>
          {subjectDistributionData.length === 0 ? (
            <div className="h-56 flex flex-col items-center justify-center text-center p-4 rounded-[18px] bg-[var(--md-surface)] border border-dashed border-[var(--md-outline-variant)]">
              <p className="text-xs text-[var(--md-on-surface-variant)]">
                Subject distribution will appear as soon as you save your first Focus Room session.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {subjectDistributionData.map((row) => (
                <div key={row.subject} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-[var(--md-on-surface)]">{row.subject}</span>
                    <span className="font-mono-tabular text-[var(--md-on-surface-variant)]">
                      {row.minutes} mins ({row.hours}h)
                    </span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-[var(--md-surface-container-high)] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[var(--md-primary)]"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round(
                            (row.minutes / Math.max(1, subjectDistributionData[0].minutes)) * 100
                          )
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quiz Accuracy Trend + Weak-Topic Rankings */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 rounded-[24px] bg-[var(--md-surface-container-low)] p-6 border border-[var(--md-outline-variant)]/40 space-y-4">
          <h2 className="font-display text-base font-semibold text-[var(--md-on-surface)]">
            Quiz &amp; Assessment Accuracy Trend (%)
          </h2>
          {quizTrendData.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-center p-4 rounded-[18px] bg-[var(--md-surface)] border border-dashed border-[var(--md-outline-variant)]">
              <p className="text-xs text-[var(--md-on-surface-variant)]">
                No quiz attempts recorded yet. Complete a practice quiz to track your score trend.
              </p>
            </div>
          ) : (
            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={quizTrendData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="attempt" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="accuracy"
                    name="Accuracy %"
                    stroke="var(--md-primary)"
                    strokeWidth={3}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Weak-Topic Rankings */}
        <div className="lg:col-span-6 rounded-[24px] bg-[var(--md-surface-container-low)] p-6 border border-[var(--md-outline-variant)]/40 space-y-4">
          <h2 className="font-display text-base font-semibold text-[var(--md-on-surface)]">
            Topic Coverage &amp; Weak-Topic Rankings
          </h2>
          {weakTopicsRanking.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-center p-4 rounded-[18px] bg-[var(--md-surface)] border border-dashed border-[var(--md-outline-variant)]">
              <p className="text-xs text-[var(--md-on-surface-variant)]">
                Add topics in Subjects &amp; Topics to view weak-topic rankings by accuracy and confidence.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--md-outline-variant)]/40">
              {weakTopicsRanking.map((t) => (
                <div key={t.id} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <p className="font-semibold text-[var(--md-on-surface)]">{t.title}</p>
                    <p className="text-[var(--md-on-surface-variant)]">
                      {t.subject} · {t.status}
                    </p>
                  </div>
                  <div className="text-right font-mono-tabular">
                    <p className="font-semibold text-[var(--md-primary)]">
                      {typeof t.practiceAccuracy === 'number' ? `${t.practiceAccuracy}% Acc` : 'No Quiz'}
                    </p>
                    <p className="text-[var(--md-on-surface-variant)]">
                      Conf {t.confidence}/5 · {t.studyMinutes}m
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 28-Day Study Consistency Calendar */}
      <div className="rounded-[24px] bg-[var(--md-surface-container-low)] p-6 border border-[var(--md-outline-variant)]/40 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-[var(--md-on-surface)]">
            28-Day Study Consistency Calendar
          </h2>
          <span className="text-xs text-[var(--md-on-surface-variant)] font-mono-tabular">
            Active days: {consistencyDays.filter((d) => d.minutes > 0).length} / 28
          </span>
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
          {consistencyDays.map((d) => (
            <div
              key={d.date}
              className={`p-2.5 rounded-[14px] border text-xs font-mono-tabular ${
                d.minutes >= 60
                  ? 'bg-[var(--md-primary)] text-[var(--md-on-primary)] border-[var(--md-primary)]'
                  : d.minutes > 0
                  ? 'bg-[var(--md-primary-container)] text-[var(--md-on-primary-container)] border-[var(--md-primary)]/40'
                  : 'bg-[var(--md-surface)] text-[var(--md-on-surface-variant)] border-[var(--md-outline-variant)]/40'
              }`}
            >
              <div className="text-[10px] opacity-80">{d.date.slice(5)}</div>
              <div className="font-semibold mt-0.5">{d.minutes}m</div>
            </div>
          ))}
        </div>
      </div>

      {/* Explainable Study Recommendations */}
      <div className="rounded-[24px] bg-[var(--md-surface-container-low)] p-6 border border-[var(--md-outline-variant)]/40 space-y-3">
        <h2 className="font-display text-base font-semibold text-[var(--md-on-surface)]">
          Transparent Study Recommendation Engine
        </h2>
        {recommendations.length === 0 ? (
          <p className="text-xs text-[var(--md-on-surface-variant)]">
            No overdue revisions or low-accuracy alerts triggered yet.
          </p>
        ) : (
          <div className="space-y-2.5">
            {recommendations.map((rec) => (
              <div
                key={rec.id}
                className="p-4 rounded-[16px] bg-[var(--md-surface)] border border-[var(--md-outline-variant)]/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div>
                  <p className="text-sm font-semibold text-[var(--md-on-surface)]">
                    {rec.title} ({rec.subject})
                  </p>
                  <p className="text-xs text-[var(--md-on-surface-variant)] mt-0.5">
                    {rec.reason}
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab(rec.actionTab)}
                  className="px-4 py-1.5 rounded-full bg-[var(--md-primary)] text-[var(--md-on-primary)] text-xs font-medium shrink-0 cursor-pointer"
                >
                  Open
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
