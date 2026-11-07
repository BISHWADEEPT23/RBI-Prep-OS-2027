import React, { useMemo, useState } from 'react';
import { addDaysToDateStr, getKolkataDateString, useStudy } from '../context/StudyContext';
import { RoutineTaskRecord } from '../types';

export const RoutinePlanner: React.FC = () => {
  const {
    prefs,
    allSubjects,
    tasks,
    sessions,
    updatePrefs,
    saveRoutineTask,
    deleteRoutineTask,
    startFocusForTopic,
    showSnackbar,
  } = useStudy();

  const todayStr = getKolkataDateString();
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [leaveOverrides, setLeaveOverrides] = useState<Record<string, boolean>>({});
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);

  // Undo / Redo stack for routine modifications
  const [undoStack, setUndoStack] = useState<RoutineTaskRecord[]>([]);

  // New Task Form
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<RoutineTaskRecord['category']>('lesson');
  const [subject, setSubject] = useState('Finance');
  const [startTime, setStartTime] = useState('19:30');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [priority, setPriority] = useState<RoutineTaskRecord['priority']>('high');
  const [isRecurring, setIsRecurring] = useState(false);

  // Generate 7-day week window around selectedDate
  const weekDates = useMemo(() => {
    const list: string[] = [];
    for (let i = -1; i <= 5; i++) {
      list.push(addDaysToDateStr(selectedDate, i));
    }
    return list;
  }, [selectedDate]);

  // Generate 28-day month grid
  const monthDates = useMemo(() => {
    const list: string[] = [];
    for (let i = -7; i < 21; i++) {
      list.push(addDaysToDateStr(todayStr, i));
    }
    return list;
  }, [todayStr]);

  const isWorkday = (dateStr: string) => {
    if (leaveOverrides[dateStr]) return false;
    const [y, m, d] = dateStr.split('-').map(Number);
    const dayOfWeek = new Date(y, (m || 1) - 1, d || 1).getDay();
    return prefs.workDays.includes(dayOfWeek);
  };

  // Calculate realistic available study minutes for a given date
  const getAvailableMinutesForDate = (dateStr: string) => {
    return isWorkday(dateStr) ? 240 : 480; // 4h max realistic on office days, 8h on weekends/holidays
  };

  // Detect time-block conflicts on selectedDate
  const timeToMins = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };

  const dayTasks = useMemo(
    () =>
      tasks
        .filter((t) => t.date === selectedDate)
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [tasks, selectedDate]
  );

  const dayActualSessions = useMemo(
    () => sessions.filter((s) => s.sessionDate === selectedDate),
    [sessions, selectedDate]
  );

  const officeConflictWarning = useMemo(() => {
    if (!isWorkday(selectedDate)) return null;
    const offStart = timeToMins(prefs.officeStart);
    const offEnd = timeToMins(prefs.officeEnd);
    const conflicting = dayTasks.find((tk) => {
      const st = timeToMins(tk.startTime);
      const en = st + tk.durationMinutes;
      return st < offEnd && en > offStart;
    });
    return conflicting
      ? `Task "${conflicting.title}" (${conflicting.startTime}) overlaps with your configured office hours (${prefs.officeStart}–${prefs.officeEnd}). Toggle Leave/Holiday Override if you are off duty.`
      : null;
  }, [dayTasks, selectedDate, prefs.officeStart, prefs.officeEnd, leaveOverrides]);

  // Missed / Backlog tasks from past dates
  const backlogTasks = useMemo(
    () =>
      tasks.filter(
        (t) =>
          (t.date < todayStr && t.status === 'planned') || t.status === 'missed'
      ),
    [tasks, todayStr]
  );

  const handleCreateRoutineTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await saveRoutineTask({
      title: title.trim(),
      category,
      subject,
      date: selectedDate,
      startTime,
      durationMinutes,
      priority,
      status: 'planned',
      isRecurring,
    });
    if (isRecurring) {
      // Also create for +1 day and +2 days if recurring checked
      await saveRoutineTask({
        title: title.trim(),
        category,
        subject,
        date: addDaysToDateStr(selectedDate, 1),
        startTime,
        durationMinutes,
        priority,
        status: 'planned',
        isRecurring: true,
      });
    }
    setTitle('');
  };

  const handleResizeDuration = async (task: RoutineTaskRecord, deltaMins: number) => {
    setUndoStack((prev) => [task, ...prev.slice(0, 9)]);
    const nextDuration = Math.min(Math.max(15, task.durationMinutes + deltaMins), 240);
    await saveRoutineTask({
      ...task,
      id: task.id,
      durationMinutes: nextDuration,
    });
  };

  const handleApproveBacklogReschedule = async () => {
    for (const b of backlogTasks) {
      setUndoStack((prev) => [b, ...prev.slice(0, 9)]);
      await saveRoutineTask({
        ...b,
        id: b.id,
        date: todayStr,
        status: 'rescheduled',
      });
    }
    showSnackbar(`Approved & rescheduled ${backlogTasks.length} backlog tasks to today.`);
  };

  const handleUndoLastChange = async () => {
    const last = undoStack[0];
    if (!last) return;
    setUndoStack((prev) => prev.slice(1));
    await saveRoutineTask(last);
    showSnackbar(`Reverted change to "${last.title}".`);
  };

  const handleDropTaskOnDate = async (targetDate: string) => {
    if (!draggedTaskId) return;
    const task = tasks.find((t) => t.id === draggedTaskId);
    if (task && task.date !== targetDate) {
      setUndoStack((prev) => [task, ...prev.slice(0, 9)]);
      await saveRoutineTask({
        ...task,
        id: task.id,
        date: targetDate,
        status: 'rescheduled',
      });
      showSnackbar(`Moved "${task.title}" to ${targetDate}.`);
    }
    setDraggedTaskId(null);
  };

  const plannedTotalMins = dayTasks.reduce((acc, t) => acc + t.durationMinutes, 0);
  const actualTotalMins = dayActualSessions.reduce((acc, s) => acc + s.focusedMinutes, 0);
  const availableMins = getAvailableMinutesForDate(selectedDate);

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-xs font-medium text-[var(--md-on-surface-variant)]">
            Working Professional Calendar ({prefs.officeStart} – {prefs.officeEnd} Office Hours)
          </span>
          <h1 className="font-display text-2xl md:text-3xl font-semibold text-[var(--md-on-surface)]">
            Interactive Routine Planner
          </h1>
        </div>

        <div className="flex items-center gap-2.5">
          {undoStack.length > 0 && (
            <button
              onClick={handleUndoLastChange}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-[var(--md-outline-variant)] text-xs font-medium cursor-pointer"
            >
              <span className="material-symbols-rounded text-[16px]">undo</span>
              <span>Undo</span>
            </button>
          )}

          <div className="inline-flex p-1 rounded-full bg-[var(--md-surface-container-high)] border border-[var(--md-outline-variant)]/50">
            <button
              onClick={() => setViewMode('week')}
              className={`px-4 py-1.5 rounded-full text-xs font-medium cursor-pointer ${
                viewMode === 'week'
                  ? 'bg-[var(--md-primary)] text-[var(--md-on-primary)]'
                  : 'text-[var(--md-on-surface-variant)]'
              }`}
            >
              Weekly View
            </button>
            <button
              onClick={() => setViewMode('month')}
              className={`px-4 py-1.5 rounded-full text-xs font-medium cursor-pointer ${
                viewMode === 'month'
                  ? 'bg-[var(--md-primary)] text-[var(--md-on-primary)]'
                  : 'text-[var(--md-on-surface-variant)]'
              }`}
            >
              Monthly Grid
            </button>
          </div>
        </div>
      </div>

      {/* Backlog Detection & Approval Banner */}
      {backlogTasks.length > 0 && (
        <div className="p-4 rounded-[20px] bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              {backlogTasks.length} Missed or Unfinished Backlog Task(s) Detected
            </p>
            <p className="text-xs opacity-85">
              Approve rescheduling to move past unfinished study blocks into today&apos;s plan without losing history.
            </p>
          </div>
          <button
            onClick={handleApproveBacklogReschedule}
            className="px-4 py-2 rounded-full bg-[var(--md-primary)] text-[var(--md-on-primary)] text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer"
          >
            Approve &amp; Reschedule to Today
          </button>
        </div>
      )}

      {/* Conflict Warning */}
      {officeConflictWarning && (
        <div className="p-4 rounded-[20px] bg-[var(--md-error-container)] text-[var(--md-on-error-container)] text-xs font-medium">
          {officeConflictWarning}
        </div>
      )}

      {/* Calendar Strip (Drag-and-Drop Target Dates) */}
      <div
        className={`grid gap-2.5 ${
          viewMode === 'week' ? 'grid-cols-2 sm:grid-cols-7' : 'grid-cols-2 sm:grid-cols-4 md:grid-cols-7'
        }`}
      >
        {(viewMode === 'week' ? weekDates : monthDates).map((dStr) => {
          const dTasks = tasks.filter((t) => t.date === dStr);
          const dMins = dTasks.reduce((a, b) => a + b.durationMinutes, 0);
          const isSelected = dStr === selectedDate;
          const isToday = dStr === todayStr;
          const workday = isWorkday(dStr);

          return (
            <div
              key={dStr}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDropTaskOnDate(dStr)}
              onClick={() => setSelectedDate(dStr)}
              className={`p-3.5 rounded-[20px] border transition-colors cursor-pointer ${
                isSelected
                  ? 'bg-[var(--md-primary-container)] text-[var(--md-on-primary-container)] border-[var(--md-primary)]'
                  : 'bg-[var(--md-surface-container-low)] text-[var(--md-on-surface)] border-[var(--md-outline-variant)]/40 hover:bg-[var(--md-surface-container)]'
              }`}
            >
              <div className="flex items-center justify-between text-[11px] opacity-80 font-mono-tabular">
                <span>{dStr.slice(5)}</span>
                <span>{isToday ? 'Today' : workday ? 'Office' : 'Off/Wknd'}</span>
              </div>
              <p className="font-mono-tabular text-sm font-semibold mt-1.5">
                {dMins}m planned
              </p>
              <p className="text-[11px] opacity-75 mt-0.5">{dTasks.length} block(s)</p>
            </div>
          );
        })}
      </div>

      {/* Selected Day Detail & Office Hours Configuration */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Schedule New Block + Office Hours Config */}
        <div className="lg:col-span-5 space-y-5">
          <form
            onSubmit={handleCreateRoutineTask}
            className="rounded-[24px] bg-[var(--md-surface-container-low)] p-6 border border-[var(--md-outline-variant)]/40 space-y-4"
          >
            <h2 className="font-display text-lg font-semibold text-[var(--md-on-surface)]">
              Add Study Block for {selectedDate}
            </h2>

            <div>
              <label className="block text-xs font-medium text-[var(--md-on-surface-variant)] mb-1">
                Block Title
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Functions of RBI — Anuj Jindal Lecture + Notes"
                className="w-full px-3.5 py-2.5 rounded-[14px] bg-[var(--md-surface)] text-sm border border-[var(--md-outline-variant)]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[var(--md-on-surface-variant)] mb-1">
                  Subject
                </label>
                <select
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-3 py-2 rounded-[14px] bg-[var(--md-surface)] text-sm border border-[var(--md-outline-variant)]"
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
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as RoutineTaskRecord['category'])}
                  className="w-full px-3 py-2 rounded-[14px] bg-[var(--md-surface)] text-sm border border-[var(--md-outline-variant)]"
                >
                  <option value="lesson">Lecture / Lesson</option>
                  <option value="revision">Revision</option>
                  <option value="practice">Practice Quiz</option>
                  <option value="current_affairs">Current Affairs</option>
                  <option value="mock">Mock Test</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-[var(--md-on-surface-variant)] mb-1">
                  Start Time
                </label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-[14px] bg-[var(--md-surface)] text-sm font-mono-tabular border border-[var(--md-outline-variant)]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--md-on-surface-variant)] mb-1">
                  Duration (m)
                </label>
                <input
                  type="number"
                  min={15}
                  max={240}
                  step={15}
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value) || 45)}
                  className="w-full px-3 py-2 rounded-[14px] bg-[var(--md-surface)] text-sm font-mono-tabular border border-[var(--md-outline-variant)]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--md-on-surface-variant)] mb-1">
                  Priority
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as RoutineTaskRecord['priority'])}
                  className="w-full px-3 py-2 rounded-[14px] bg-[var(--md-surface)] text-sm border border-[var(--md-outline-variant)]"
                >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-[var(--md-on-surface-variant)] cursor-pointer">
              <input
                type="checkbox"
                checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
                className="rounded accent-[var(--md-primary)]"
              />
              <span>Repeat block across consecutive days</span>
            </label>

            <button
              type="submit"
              className="w-full py-2.5 rounded-full bg-[var(--md-primary)] text-[var(--md-on-primary)] text-xs font-medium cursor-pointer"
            >
              Schedule Study Block
            </button>
          </form>

          {/* Office Hours & Leave Override Card */}
          <div className="rounded-[24px] bg-[var(--md-surface-container-low)] p-5 border border-[var(--md-outline-variant)]/40 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold text-[var(--md-on-surface)]">
                Office Hours &amp; Holiday Override
              </h3>
              <label className="inline-flex items-center gap-1.5 text-xs text-[var(--md-primary)] font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(leaveOverrides[selectedDate])}
                  onChange={(e) =>
                    setLeaveOverrides((prev) => ({
                      ...prev,
                      [selectedDate]: e.target.checked,
                    }))
                  }
                  className="rounded accent-[var(--md-primary)]"
                />
                <span>Mark {selectedDate} as Leave/Holiday</span>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-[var(--md-on-surface-variant)] mb-1">
                  Office Start
                </label>
                <input
                  type="time"
                  value={prefs.officeStart}
                  onChange={(e) => updatePrefs({ officeStart: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-[12px] bg-[var(--md-surface)] text-xs font-mono-tabular border border-[var(--md-outline-variant)]"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[var(--md-on-surface-variant)] mb-1">
                  Office End
                </label>
                <input
                  type="time"
                  value={prefs.officeEnd}
                  onChange={(e) => updatePrefs({ officeEnd: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-[12px] bg-[var(--md-surface)] text-xs font-mono-tabular border border-[var(--md-outline-variant)]"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right: Planned vs Actual Timeline for Selected Date */}
        <div className="lg:col-span-7 rounded-[24px] bg-[var(--md-surface-container-low)] p-6 border border-[var(--md-outline-variant)]/40 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="text-xs text-[var(--md-on-surface-variant)]">
                Drag blocks to any date above to reschedule
              </span>
              <h2 className="font-display text-xl font-semibold text-[var(--md-on-surface)]">
                Schedule for {selectedDate}
              </h2>
            </div>

            <div className="text-right font-mono-tabular text-xs text-[var(--md-on-surface-variant)]">
              <div>
                Planned: <strong className="text-[var(--md-on-surface)]">{plannedTotalMins}m</strong> / Realistic Cap: {availableMins}m
              </div>
              <div>
                Actual Studied: <strong className="text-[var(--md-primary)]">{actualTotalMins}m</strong>
              </div>
            </div>
          </div>

          {dayTasks.length === 0 ? (
            <div className="p-8 rounded-[20px] bg-[var(--md-surface)] border border-dashed border-[var(--md-outline-variant)] text-center">
              <p className="text-sm font-medium text-[var(--md-on-surface)]">
                No study blocks planned for {selectedDate}
              </p>
              <p className="text-xs text-[var(--md-on-surface-variant)] mt-1">
                Use the form on the left to add morning (pre-9:00 AM) or evening (post-6:00 PM) study blocks.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {dayTasks.map((tk) => (
                <div
                  key={tk.id}
                  draggable
                  onDragStart={() => setDraggedTaskId(tk.id)}
                  className="p-4 rounded-[18px] bg-[var(--md-surface)] border border-[var(--md-outline-variant)]/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-grab active:cursor-grabbing"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs text-[var(--md-on-surface-variant)] font-mono-tabular">
                      <span>{tk.startTime}</span>
                      <span aria-hidden="true">·</span>
                      <span>{tk.durationMinutes} mins</span>
                      <span aria-hidden="true">·</span>
                      <span>{tk.subject}</span>
                      <span aria-hidden="true">·</span>
                      <span className="capitalize font-sans font-medium text-[var(--md-primary)]">
                        {tk.status}
                      </span>
                    </div>
                    <p
                      className={`text-sm font-semibold ${
                        tk.status === 'completed'
                          ? 'line-through text-[var(--md-on-surface-variant)]'
                          : 'text-[var(--md-on-surface)]'
                      }`}
                    >
                      {tk.title}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => handleResizeDuration(tk, -15)}
                      title="Decrease duration by 15m"
                      className="px-2 py-1 rounded-[8px] border border-[var(--md-outline-variant)] text-xs font-mono-tabular cursor-pointer"
                    >
                      -15m
                    </button>
                    <button
                      onClick={() => handleResizeDuration(tk, 15)}
                      title="Increase duration by 15m"
                      className="px-2 py-1 rounded-[8px] border border-[var(--md-outline-variant)] text-xs font-mono-tabular cursor-pointer"
                    >
                      +15m
                    </button>
                    <button
                      onClick={() =>
                        startFocusForTopic('Phase II', tk.subject, tk.title, tk.topicId, tk.durationMinutes)
                      }
                      className="px-3 py-1 rounded-full bg-[var(--md-primary)] text-[var(--md-on-primary)] text-xs font-medium cursor-pointer"
                    >
                      Start
                    </button>
                    <button
                      onClick={() =>
                        saveRoutineTask({
                          ...tk,
                          id: tk.id,
                          status: tk.status === 'completed' ? 'planned' : 'completed',
                        })
                      }
                      className="px-2.5 py-1 rounded-full bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)] text-xs font-medium cursor-pointer"
                    >
                      {tk.status === 'completed' ? 'Reopen' : 'Done'}
                    </button>
                    <button
                      onClick={() => deleteRoutineTask(tk.id)}
                      className="text-xs text-[var(--md-error)] hover:underline px-1.5 cursor-pointer"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Actual Verified Sessions Logged on Selected Date */}
          {dayActualSessions.length > 0 && (
            <div className="pt-4 border-t border-[var(--md-outline-variant)]/40 space-y-2">
              <h3 className="text-xs font-semibold text-[var(--md-on-surface-variant)]">
                Actual Logged Focus Sessions on {selectedDate}
              </h3>
              {dayActualSessions.map((sess) => (
                <div
                  key={sess.id}
                  className="p-3 rounded-[14px] bg-[var(--md-primary-container)]/50 text-[var(--md-on-surface)] flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="font-semibold">{sess.topicTitle}</span>
                    <span aria-hidden="true"> · </span>
                    <span>{sess.subject}</span>
                  </div>
                  <span className="font-mono-tabular font-semibold text-[var(--md-primary)]">
                    {sess.focusedMinutes}m verified
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
