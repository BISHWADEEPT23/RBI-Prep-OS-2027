import React, { useEffect, useMemo, useState } from 'react';
import {
  addDaysToDateStr,
  getKolkataDateString,
  getKolkataGreeting,
  useStudy,
} from '../context/StudyContext';
import { ExamPhase, RoutineTaskRecord } from '../types';
import { StudyProgressDashboard } from './StudyProgressDashboard';
import { DesktopLoadingSkeleton } from './DesktopLoadingSkeleton';

interface HomeDashboardProps {
  searchQuery?: string;
  selectedSubjectFilter?: string | null;
  onSelectSubjectFilter?: (subject: string | null) => void;
}

const QUICK_SUBJECT_CHIPS = [
  'Finance',
  'Management',
  'Economic and Social Issues (ESI)',
  'Quantitative Aptitude',
  'Reasoning Ability',
  'English Language',
  'Current Affairs',
];

function getShortSubjectLabel(subject: string): string {
  if (subject === 'Economic and Social Issues (ESI)') return 'ESI';
  if (subject === 'Quantitative Aptitude') return 'Quant';
  if (subject === 'Reasoning Ability') return 'Reasoning';
  if (subject === 'English Language') return 'English';
  return subject;
}

export const HomeDashboard: React.FC<HomeDashboardProps> = ({
  searchQuery = '',
  selectedSubjectFilter = null,
  onSelectSubjectFilter,
}) => {
  const {
    allSubjects,
    topics,
    sessions,
    tasks,
    notes,
    revisions,
    recommendations,
    setActiveTab,
    startFocusForTopic,
    saveRoutineTask,
    deleteRoutineTask,
    saveStudySession,
    saveTopic,
    showSnackbar,
    dbReady,
    isHydrating,
    prefs,
    updatePrefs,
  } = useStudy();

  const todayStr = getKolkataDateString();
  const greeting = getKolkataGreeting();

  // Calendar state
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => {
    const [y, m] = todayStr.split('-').map(Number);
    return new Date(y, (m || 1) - 1, 1);
  });

  // Quick Task Addition state (restoring last selected subject)
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [selectedChipSubject, setSelectedChipSubject] = useState<string>(
    prefs.lastSelectedSubject || 'Finance'
  );
  const [newTaskTime, setNewTaskTime] = useState('18:30');
  const [newTaskDuration, setNewTaskDuration] = useState(45);

  // Inline Task Editing state
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskTitle, setEditingTaskTitle] = useState('');

  // Embedded Mint Forest Focus Timer widget state (restoring last selected subject)
  const [widgetMinutes, setWidgetMinutes] = useState<number>(30);
  const [widgetSecondsLeft, setWidgetSecondsLeft] = useState<number>(30 * 60);
  const [widgetRunning, setWidgetRunning] = useState<boolean>(false);
  const [widgetElapsedSec, setWidgetElapsedSec] = useState<number>(0);
  const [widgetSubject, setWidgetSubject] = useState<string>(
    prefs.lastSelectedSubject || 'Finance'
  );
  const [widgetTopicTitle, setWidgetTopicTitle] = useState<string>(
    topics[0]?.title || 'Functions of RBI'
  );
  const [isSavingWidgetSession, setIsSavingWidgetSession] = useState<boolean>(false);

  // Sync restored subject if changed in prefs
  useEffect(() => {
    if (prefs.lastSelectedSubject && prefs.lastSelectedSubject !== selectedChipSubject) {
      setSelectedChipSubject(prefs.lastSelectedSubject);
      setWidgetSubject(prefs.lastSelectedSubject);
    }
  }, [prefs.lastSelectedSubject]);

  // Keep widget topic synced if topics load
  useEffect(() => {
    if (!widgetTopicTitle && topics.length > 0) {
      setWidgetTopicTitle(topics[0].title);
    }
  }, [topics, widgetTopicTitle]);

  // Countdown tick for the embedded dashboard focus timer
  useEffect(() => {
    if (!widgetRunning) return;
    const interval = window.setInterval(() => {
      setWidgetSecondsLeft((prev) => {
        if (prev <= 1) {
          setWidgetRunning(false);
          return 0;
        }
        return prev - 1;
      });
      setWidgetElapsedSec((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [widgetRunning]);

  const adjustWidgetMinutes = (delta: number) => {
    const nextMins = Math.min(180, Math.max(5, widgetMinutes + delta));
    setWidgetMinutes(nextMins);
    setWidgetRunning(false);
    setWidgetSecondsLeft(nextMins * 60);
    setWidgetElapsedSec(0);
  };

  const formatWidgetTimer = (totalSec: number) => {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleLogWidgetSession = async () => {
    if (isSavingWidgetSession) return;
    setIsSavingWidgetSession(true);
    try {
      const focusedMins = Math.max(1, Math.round(widgetElapsedSec / 60) || widgetMinutes);
      const cleanTopicTitle = widgetTopicTitle.trim() || 'Functions of RBI';
      const matchedSubject = allSubjects.find((s) => s.name === widgetSubject);
      const phase: ExamPhase = matchedSubject?.phase || 'Phase II';

      let existingTopic = topics.find(
        (t) =>
          t.subject === widgetSubject &&
          t.title.toLowerCase() === cleanTopicTitle.toLowerCase()
      );
      if (!existingTopic) {
        existingTopic = await saveTopic({
          phase,
          subject: widgetSubject,
          chapter: 'Core Syllabus',
          title: cleanTopicTitle,
          status: 'In Progress',
          studyMinutes: 0,
          confidence: 3,
        });
      }

      await saveStudySession(
        {
          phase,
          subject: widgetSubject,
          topicId: existingTopic.id,
          topicTitle: existingTopic.title,
          goal: `Dashboard Focus Timer (${widgetMinutes}m block)`,
          timerMode: 'countdown',
          plannedMinutes: widgetMinutes,
          focusedMinutes: focusedMins,
          pausedMinutes: 0,
          outcome: 'Completed',
          confidence: 4,
          notesSummary: `Completed ${focusedMins} min focus session from dashboard widget.`,
          sessionDate: todayStr,
        },
        true
      );

      setWidgetRunning(false);
      setWidgetSecondsLeft(widgetMinutes * 60);
      setWidgetElapsedSec(0);
      showSnackbar(`Logged ${focusedMins} mins on "${existingTopic.title}" & scheduled revision!`);
    } finally {
      setIsSavingWidgetSession(false);
    }
  };

  const handleOpenInFullFocusRoom = async () => {
    const cleanTopicTitle = widgetTopicTitle.trim() || 'Functions of RBI';
    const matchedSubject = allSubjects.find((s) => s.name === widgetSubject);
    const phase: ExamPhase = matchedSubject?.phase || 'Phase II';

    let existingTopic = topics.find(
      (t) =>
        t.subject === widgetSubject &&
        t.title.toLowerCase() === cleanTopicTitle.toLowerCase()
    );
    if (!existingTopic) {
      existingTopic = await saveTopic({
        phase,
        subject: widgetSubject,
        chapter: 'Core Syllabus',
        title: cleanTopicTitle,
        status: 'In Progress',
        studyMinutes: 0,
        confidence: 3,
      });
    }
    startFocusForTopic(
      phase,
      widgetSubject,
      existingTopic.title,
      existingTopic.id,
      widgetMinutes,
      `Focused study block on ${existingTopic.title}`
    );
  };

  // Tasks & Revisions filtering
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const tasksForSelectedDate = useMemo(() => {
    return tasks.filter((t) => {
      const matchesDate = normalizedQuery ? true : t.date === selectedDate;
      const matchesSubject = selectedSubjectFilter
        ? t.subject.toLowerCase() === selectedSubjectFilter.toLowerCase()
        : true;
      const matchesSearch = normalizedQuery
        ? t.title.toLowerCase().includes(normalizedQuery) ||
          t.subject.toLowerCase().includes(normalizedQuery)
        : true;
      return matchesDate && matchesSubject && matchesSearch;
    });
  }, [tasks, selectedDate, selectedSubjectFilter, normalizedQuery]);

  const matchingNotesForSearch = useMemo(() => {
    if (!normalizedQuery) return [];
    return notes.filter(
      (n) =>
        n.title.toLowerCase().includes(normalizedQuery) ||
        n.content.toLowerCase().includes(normalizedQuery) ||
        n.topicTitle.toLowerCase().includes(normalizedQuery) ||
        n.subject.toLowerCase().includes(normalizedQuery)
    );
  }, [notes, normalizedQuery]);

  const todayTasksCount = useMemo(
    () => tasks.filter((t) => t.date === todayStr && t.status !== 'completed').length,
    [tasks, todayStr]
  );

  const todayFocusedMinutes = useMemo(
    () =>
      sessions
        .filter((s) => s.sessionDate === todayStr)
        .reduce((acc, s) => acc + s.focusedMinutes, 0),
    [sessions, todayStr]
  );

  const pendingRevisions = useMemo(
    () => revisions.filter((r) => r.status !== 'completed' && r.dueDate <= selectedDate),
    [revisions, selectedDate]
  );

  // Dates that have tasks or sessions for calendar dots
  const datesWithActivity = useMemo(() => {
    const set = new Set<string>();
    tasks.forEach((t) => set.add(t.date));
    sessions.forEach((s) => set.add(s.sessionDate));
    revisions.forEach((r) => {
      if (r.status !== 'completed') set.add(r.dueDate);
    });
    return set;
  }, [tasks, sessions, revisions]);

  // Calendar grid generation (Monday-first)
  const calendarDays = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDayOfMonth = new Date(year, month, 1);
    const totalDays = new Date(year, month + 1, 0).getDate();
    const startOffset = (firstDayOfMonth.getDay() + 6) % 7; // Monday = 0

    const cells: Array<{ dayNum: number | null; dateStr: string }> = [];
    for (let i = 0; i < startOffset; i++) {
      cells.push({ dayNum: null, dateStr: `empty-${i}` });
    }
    for (let d = 1; d <= totalDays; d++) {
      const mStr = String(month + 1).padStart(2, '0');
      const dStr = String(d).padStart(2, '0');
      cells.push({ dayNum: d, dateStr: `${year}-${mStr}-${dStr}` });
    }
    return cells;
  }, [calendarMonth]);

  const monthLabel = calendarMonth.toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const handleQuickAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    await saveRoutineTask({
      title: newTaskTitle.trim(),
      category: selectedChipSubject === 'Current Affairs' ? 'current_affairs' : 'lesson',
      subject: selectedChipSubject,
      date: selectedDate,
      startTime: newTaskTime || '18:30',
      durationMinutes: newTaskDuration || 45,
      priority: 'medium',
      status: 'planned',
    });
    setNewTaskTitle('');
  };

  const handleToggleTaskComplete = async (task: RoutineTaskRecord) => {
    await saveRoutineTask({
      ...task,
      id: task.id,
      status: task.status === 'completed' ? 'planned' : 'completed',
    });
  };

  const handleSaveTaskEdit = async (task: RoutineTaskRecord) => {
    if (!editingTaskTitle.trim()) return;
    await saveRoutineTask({
      ...task,
      id: task.id,
      title: editingTaskTitle.trim(),
    });
    setEditingTaskId(null);
  };

  // Up next items derived from user's tasks, revisions, or recommendations
  const nextPrimaryTask = tasks.find((t) => t.date >= todayStr && t.status !== 'completed');
  const nextRecommendation = recommendations[0];

  if (isHydrating && !dbReady) {
    return <DesktopLoadingSkeleton title="Hydrating study progress from local storage..." />;
  }

  return (
    <div className="space-y-4">
      {/* Real-time Persistent Progress Dashboard Card */}
      <StudyProgressDashboard
        onOpenFocus={handleOpenInFullFocusRoom}
        onOpenRoutine={() => setActiveTab('routine')}
        onOpenPractice={() => setActiveTab('practice')}
        onOpenRevision={() => setActiveTab('revision')}
        onSelectSubjectFilter={(subj) => {
          if (onSelectSubjectFilter) onSelectSubjectFilter(subj);
          if (subj) {
            setSelectedChipSubject(subj);
            setWidgetSubject(subj);
            updatePrefs({ lastSelectedSubject: subj }).catch(() => {});
          }
        }}
      />

      <div className="rbi-dashboard-grid">
      {/* 1. Top-Left Mint Landscape Hero Banner */}
      <section className="rbi-hero" aria-label="Daily overview banner">
        <div>
          <h1 className="text-[28px] sm:text-[32px] font-bold tracking-tight text-[#1e2c2a] m-0">
            {greeting}! 👋
          </h1>
          <p className="mt-1.5 mb-3.5 text-[#304945] text-[15px] font-medium">
            You have <strong>{todayTasksCount}</strong> study task{todayTasksCount === 1 ? '' : 's'} for today
            {todayFocusedMinutes > 0 && (
              <span> · <strong>{todayFocusedMinutes}m</strong> focused today</span>
            )}
          </p>
        </div>

        {/* Up Next White Card Inside Hero */}
        <div className="rbi-upnext">
          <div className="flex items-center justify-between mb-1.5">
            <h3 className="m-0 text-[15px] font-bold text-[#1e2c2a]">Up next</h3>
            <button
              type="button"
              onClick={() => setActiveTab('routine')}
              className="text-[11px] font-semibold text-[#158e7f] hover:underline cursor-pointer"
            >
              Routine planner →
            </button>
          </div>

          <div
            onClick={() => {
              if (nextPrimaryTask) {
                startFocusForTopic(
                  'Phase II',
                  nextPrimaryTask.subject,
                  nextPrimaryTask.title,
                  nextPrimaryTask.topicId,
                  nextPrimaryTask.durationMinutes
                );
              } else {
                handleOpenInFullFocusRoom();
              }
            }}
            className="grid grid-cols-[95px_1fr_auto] items-center gap-2 text-[12px] py-1.5 border-t border-[#f0f0f0] text-[#555] hover:text-[#158e7f] cursor-pointer transition-colors"
          >
            <span className="font-mono-tabular font-semibold text-[#2d3a38]">
              {nextPrimaryTask ? `${nextPrimaryTask.startTime} (${nextPrimaryTask.durationMinutes}m)` : '18:30 – 19:30'}
            </span>
            <span className="truncate font-medium text-[#222]">
              {nextPrimaryTask
                ? `${getShortSubjectLabel(nextPrimaryTask.subject)}: ${nextPrimaryTask.title}`
                : 'Finance: Functions of RBI & Monetary Policy'}
            </span>
            <span className="text-[11px] font-semibold text-[#158e7f]">Focus ▶</span>
          </div>

          <div
            onClick={() =>
              setActiveTab(nextRecommendation ? nextRecommendation.actionTab : 'vault')
            }
            className="grid grid-cols-[95px_1fr_auto] items-center gap-2 text-[12px] py-1.5 border-t border-[#f0f0f0] text-[#555] hover:text-[#158e7f] cursor-pointer transition-colors"
          >
            <span className="font-mono-tabular font-semibold text-[#2d3a38]">
              {pendingRevisions.length > 0 ? `${pendingRevisions.length} due today` : '20:00 – 21:00'}
            </span>
            <span className="truncate font-medium text-[#222]">
              {nextRecommendation
                ? `${nextRecommendation.priorityLabel}: ${nextRecommendation.title}`
                : 'Knowledge Vault: Screenshot OCR & Anuj Jindal Notes'}
            </span>
            <span className="text-[11px] font-semibold text-[#158e7f]">Open →</span>
          </div>
        </div>

        {/* CSS Mint Landscape Hills & Pine Trees */}
        <div className="rbi-hills" aria-hidden="true" />
        <div className="rbi-tree one" aria-hidden="true" />
        <div className="rbi-tree two" aria-hidden="true" />
      </section>

      {/* 2. Top-Right Interactive Month Calendar */}
      <section className="rbi-panel flex flex-col justify-between" aria-label="Study calendar">
        <div>
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() =>
                setCalendarMonth(
                  new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1)
                )
              }
              aria-label="Previous month"
              className="w-7 h-7 rounded-lg hover:bg-[#f0f3f2] text-[#333] font-bold cursor-pointer flex items-center justify-center"
            >
              ‹
            </button>
            <div className="flex items-center gap-2">
              <h3 className="m-0 text-[15px] font-bold text-[#222]">{monthLabel}</h3>
              {selectedDate !== todayStr && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDate(todayStr);
                    const [y, m] = todayStr.split('-').map(Number);
                    setCalendarMonth(new Date(y, (m || 1) - 1, 1));
                  }}
                  className="text-[11px] px-2 py-0.5 rounded-full bg-[#def4ef] text-[#0c695d] font-semibold cursor-pointer"
                >
                  Today
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() =>
                setCalendarMonth(
                  new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1)
                )
              }
              aria-label="Next month"
              className="w-7 h-7 rounded-lg hover:bg-[#f0f3f2] text-[#333] font-bold cursor-pointer flex items-center justify-center"
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-[#777] mb-1">
            <span>Mon</span>
            <span>Tue</span>
            <span>Wed</span>
            <span>Thu</span>
            <span>Fri</span>
            <span>Sat</span>
            <span>Sun</span>
          </div>

          <div className="grid grid-cols-7 text-center gap-y-1">
            {calendarDays.map((cell) => {
              if (cell.dayNum === null) {
                return <span key={cell.dateStr} className="py-1.5 text-[12px]" />;
              }
              const isSelected = cell.dateStr === selectedDate;
              const isToday = cell.dateStr === todayStr;
              const hasActivity = datesWithActivity.has(cell.dateStr);

              return (
                <button
                  key={cell.dateStr}
                  type="button"
                  onClick={() => setSelectedDate(cell.dateStr)}
                  className={`relative py-1.5 text-[12px] rounded-lg transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[#199989] text-white font-bold shadow-xs'
                      : isToday
                      ? 'bg-[#def4ef] text-[#0c695d] font-bold'
                      : 'text-[#333] hover:bg-[#f1f5f4]'
                  }`}
                >
                  {cell.dayNum}
                  {hasActivity && (
                    <span
                      className={`block text-[10px] leading-[4px] mt-0.5 ${
                        isSelected ? 'text-white' : 'text-[#158e7f]'
                      }`}
                    >
                      •
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-3 pt-2.5 border-t border-[#f0f0f0] flex items-center justify-between text-[11px] text-[#666]">
          <span>
            Selected: <strong className="text-[#222]">{selectedDate}</strong>
          </span>
          <button
            type="button"
            onClick={() => setActiveTab('analytics')}
            className="text-[#158e7f] font-semibold hover:underline cursor-pointer"
          >
            View Analytics →
          </button>
        </div>
      </section>

      {/* 3. Bottom-Left Stack: Quick Add Task + Subject Chips + Task Checklist */}
      <section className="flex flex-col gap-3" aria-label="Study tasks">
        {/* Quick Task Input Bar */}
        <form
          onSubmit={handleQuickAddTask}
          className="bg-white rounded-[12px] px-3 py-2 flex items-center gap-2 border border-black/5 shadow-2xs"
        >
          <span className="text-[#158e7f] font-bold text-base">＋</span>
          <input
            type="text"
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            placeholder={`Add study task for ${selectedDate === todayStr ? 'today' : selectedDate} (e.g., Anuj Jindal Finance Lecture)`}
            className="border-0 outline-none flex-1 text-[13px] text-[#222] bg-transparent"
          />
          <input
            type="time"
            value={newTaskTime}
            onChange={(e) => setNewTaskTime(e.target.value)}
            aria-label="Planned start time"
            className="text-[11px] text-[#555] border border-[#e5e5e5] rounded-md px-1.5 py-1 font-mono-tabular"
          />
          <button
            type="submit"
            title="Add study task"
            className="w-7 h-7 rounded-lg bg-[#199989] text-white text-xs flex items-center justify-center hover:opacity-95 cursor-pointer shrink-0"
          >
            ➤
          </button>
        </form>

        {/* Subject Selection & Filter Chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          {QUICK_SUBJECT_CHIPS.map((subj) => {
            const isSelectedForNewTask = selectedChipSubject === subj;
            return (
              <button
                key={subj}
                type="button"
                onClick={() => {
                  setSelectedChipSubject(subj);
                  if (onSelectSubjectFilter && selectedSubjectFilter === subj) {
                    onSelectSubjectFilter(null);
                  }
                }}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors cursor-pointer ${
                  isSelectedForNewTask
                    ? 'bg-[#199989] text-white font-semibold'
                    : 'bg-[#e6f3f1] text-[#0c695d] hover:bg-[#d5ece8]'
                }`}
              >
                {getShortSubjectLabel(subj)}
              </button>
            );
          })}
          {selectedSubjectFilter && onSelectSubjectFilter && (
            <button
              type="button"
              onClick={() => onSelectSubjectFilter(null)}
              className="px-2.5 py-1 rounded-full text-[11px] bg-[#ffe8e5] text-[#a12c22] font-semibold cursor-pointer"
            >
              Filter: {getShortSubjectLabel(selectedSubjectFilter)} ×
            </button>
          )}
        </div>

        {/* Today's Study Tasks Panel */}
        <div className="rbi-panel flex-1">
          <div className="flex items-center justify-between mb-2">
            <h3 className="m-0 text-[16px] font-bold text-[#222]">
              { normalizedQuery
                ? `Search results for "${searchQuery}"`
                : selectedDate === todayStr
                ? "Today's study tasks"
                : `Study tasks for ${selectedDate}`}
            </h3>
            <span className="text-[11px] font-semibold text-[#666]">
              {tasksForSelectedDate.length} item{tasksForSelectedDate.length === 1 ? '' : 's'}
            </span>
          </div>

          {tasksForSelectedDate.length === 0 && pendingRevisions.length === 0 ? (
            <div className="py-6 text-center text-[#777] text-[13px]">
              <p className="m-0 font-medium text-[#444]">
                No tasks scheduled for {selectedDate === todayStr ? 'today' : selectedDate} yet.
              </p>
              <p className="mt-1 text-[12px] text-[#777]">
                Type a study task above (picked tagged under{' '}
                <strong>{getShortSubjectLabel(selectedChipSubject)}</strong>) and press ➤.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#efefef]">
              {tasksForSelectedDate.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between py-2.5 gap-2.5 text-[13px]"
                >
                  <label className="flex items-start gap-2.5 flex-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={task.status === 'completed'}
                      onChange={() => handleToggleTaskComplete(task)}
                      className="mt-1 accent-[#199989] cursor-pointer"
                    />
                    <div className="flex-1 min-w-0">
                      {editingTaskId === task.id ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={editingTaskTitle}
                            onChange={(e) => setEditingTaskTitle(e.target.value)}
                            className="px-2 py-0.5 text-[13px] border border-[#199989] rounded-md flex-1"
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveTaskEdit(task)}
                            className="text-[11px] font-semibold text-[#158e7f] cursor-pointer"
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        <div
                          className={`font-medium truncate ${
                            task.status === 'completed'
                              ? 'line-through text-[#888]'
                              : 'text-[#222]'
                          }`}
                        >
                          {task.title}
                        </div>
                      )}
                      <div className="text-[11px] text-[#6b6b6b] mt-0.5">
                        {getShortSubjectLabel(task.subject)} • {task.startTime} ({task.durationMinutes}m)
                        {task.date !== selectedDate && ` • ${task.date}`}
                      </div>
                    </div>
                  </label>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setWidgetSubject(task.subject);
                        setWidgetTopicTitle(task.title);
                        setWidgetMinutes(task.durationMinutes || 30);
                        setWidgetSecondsLeft((task.durationMinutes || 30) * 60);
                        setWidgetRunning(true);
                      }}
                      title="Start in Focus Timer widget"
                      className="px-2 py-0.5 rounded-md bg-[#def4ef] text-[#0c695d] text-[11px] font-semibold hover:bg-[#cdece5] cursor-pointer"
                    >
                      ▶ Timer
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingTaskId(task.id);
                        setEditingTaskTitle(task.title);
                      }}
                      title="Edit task"
                      className="text-[11px] text-[#777] hover:text-[#222] px-1 cursor-pointer"
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                         saveRoutineTask({
                          ...task,
                          id: task.id,
                          date: addDaysToDateStr(task.date, 1),
                          status: 'rescheduled',
                        })
                      }
                      title="Move to tomorrow (+1d)"
                      className="text-[11px] text-[#777] hover:text-[#222] px-1 cursor-pointer"
                    >
                      +1d
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteRoutineTask(task.id)}
                      title="Delete task"
                      className="text-[#888] hover:text-[#c53030] font-bold px-1 cursor-pointer"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}

              {/* Due Spaced Repetition Revisions */}
              {pendingRevisions.map((rev) => (
                <div
                  key={rev.id}
                  className="flex items-center justify-between py-2.5 gap-2.5 text-[13px] bg-[#f7fbf9] -mx-2 px-2 rounded-lg mt-1"
                >
                  <div>
                    <div className="font-semibold text-[#0c695d]">
                      🌿 Revision Due: {rev.topicTitle}
                    </div>
                    <div className="text-[11px] text-[#5c7672]">
                      {getShortSubjectLabel(rev.subject)} • {rev.stageLabel} • Due {rev.dueDate}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('revision')}
                    className="px-2.5 py-1 rounded-full bg-[#199989] text-white text-[11px] font-semibold cursor-pointer shrink-0"
                  >
                    Review
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Matching Vault Notes when searching from topbar */}
          {normalizedQuery && matchingNotesForSearch.length > 0 && (
            <div className="mt-4 pt-3 border-t border-[#eaeaea]">
              <h4 className="m-0 mb-2 text-[12px] font-bold text-[#158e7f] uppercase tracking-wider">
                Matching Vault Notes ({matchingNotesForSearch.length})
              </h4>
              <div className="space-y-1.5">
                {matchingNotesForSearch.slice(0, 4).map((note) => (
                  <div
                    key={note.id}
                    onClick={() => setActiveTab('vault')}
                    className="p-2 rounded-lg bg-[#f6faf9] hover:bg-[#eaf4f2] cursor-pointer flex items-center justify-between text-[12px]"
                  >
                    <div className="truncate">
                      <strong className="text-[#1e2c2a]">{note.title}</strong>{' '}
                      <span className="text-[#666]">
                        ({getShortSubjectLabel(note.subject)} · {note.topicTitle})
                      </span>
                    </div>
                    <span className="text-[#158e7f] font-semibold shrink-0 ml-2">Open Vault →</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 4. Bottom-Right Stack: Mint Forest Focus Timer Card */}
      <section className="flex flex-col" aria-label="Focus timer widget">
        <div className="rbi-timer-card flex-1 flex flex-col justify-between">
          <div className="relative z-10">
            <div className="flex items-center justify-between">
              <h3 className="m-0 text-[16px] font-bold text-[#1d3934]">Focus timer</h3>
              <button
                type="button"
                onClick={handleOpenInFullFocusRoom}
                className="text-[11px] font-semibold text-[#0c695d] bg-white/80 hover:bg-white px-2.5 py-1 rounded-full cursor-pointer transition-colors"
              >
                Full Focus Room ↗
              </button>
            </div>

            {/* Subject & Topic Selector inside Timer Card */}
            <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-left">
              <select
                value={widgetSubject}
                onChange={(e) => setWidgetSubject(e.target.value)}
                aria-label="Focus subject"
                className="px-2.5 py-1.5 rounded-lg bg-white/85 text-[#1d3934] text-[12px] font-medium border border-black/5 outline-none"
              >
                {allSubjects.map((s) => (
                  <option key={s.id} value={s.name}>
                    {getShortSubjectLabel(s.name)}
                  </option>
                ))}
              </select>
              <input
                type="text"
                list="dashboard-timer-topics"
                value={widgetTopicTitle}
                onChange={(e) => setWidgetTopicTitle(e.target.value)}
                placeholder="Topic (e.g., Functions of RBI)"
                aria-label="Focus topic"
                className="px-2.5 py-1.5 rounded-lg bg-white/85 text-[#1d3934] text-[12px] font-medium border border-black/5 outline-none"
              />
              <datalist id="dashboard-timer-topics">
                {topics
                  .filter((t) => t.subject === widgetSubject)
                  .map((t) => (
                    <option key={t.id} value={t.title} />
                  ))}
              </datalist>
            </div>

            {/* − 30:00 + Timer Controls */}
            <div className="flex items-center justify-center gap-3.5 my-3.5">
              <button
                type="button"
                onClick={() => adjustWidgetMinutes(-5)}
                aria-label="Decrease timer by 5 minutes"
                className="w-[34px] h-[34px] rounded-[10px] bg-white text-[#1d3934] font-bold text-base shadow-2xs hover:bg-[#f7f7f7] cursor-pointer"
              >
                −
              </button>
              <div className="rbi-timer-readout">
                {formatWidgetTimer(widgetSecondsLeft)}
              </div>
              <button
                type="button"
                onClick={() => adjustWidgetMinutes(5)}
                aria-label="Increase timer by 5 minutes"
                className="w-[34px] h-[34px] rounded-[10px] bg-white text-[#1d3934] font-bold text-base shadow-2xs hover:bg-[#f7f7f7] cursor-pointer"
              >
                +
              </button>
            </div>

            {/* Start / Pause + Save Session Buttons */}
            <div className="flex items-center justify-center gap-2 relative z-10">
              <button
                type="button"
                onClick={() => setWidgetRunning((prev) => !prev)}
                className="px-5 py-2 rounded-[10px] bg-white text-[#1d3934] font-bold text-[13px] shadow-2xs hover:bg-[#f8f8f8] cursor-pointer"
              >
                {widgetRunning
                  ? 'Ⅱ Pause'
                  : widgetSecondsLeft < widgetMinutes * 60
                  ? '▶ Resume'
                  : '▶ Start'}
              </button>

              {(widgetElapsedSec >= 10 || widgetSecondsLeft < widgetMinutes * 60) && (
                <button
                  type="button"
                  disabled={isSavingWidgetSession}
                  onClick={handleLogWidgetSession}
                  className="px-3.5 py-2 rounded-[10px] bg-[#199989] text-white font-semibold text-[12px] shadow-2xs hover:opacity-95 cursor-pointer disabled:opacity-50"
                >
                  {isSavingWidgetSession ? 'Saving...' : '✓ Log Session'}
                </button>
              )}
            </div>
          </div>

          {/* Pine Forest Silhouette at bottom of Timer Card */}
          <div className="rbi-forest" aria-hidden="true" />
        </div>
      </section>
    </div>
  </div>
  );
};
