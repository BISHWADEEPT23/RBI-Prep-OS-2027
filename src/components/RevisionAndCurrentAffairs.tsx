import React, { useState } from 'react';
import { addDaysToDateStr, getKolkataDateString, useStudy } from '../context/StudyContext';
import { makeSafeId } from '../firebase';
import { CurrentAffairRecord } from '../types';

export const RevisionCenter: React.FC = () => {
  const {
    prefs,
    allSubjects,
    topics,
    revisions,
    saveRevisionItem,
    completeRevisionItem,
    updatePrefs,
  } = useStudy();

  const todayStr = getKolkataDateString();
  const [filterTab, setFilterTab] = useState<'due' | 'overdue' | 'upcoming' | 'completed'>('due');

  // Schedule Revision Form state
  const [selectedSubject, setSelectedSubject] = useState('Finance');
  const [topicTitleInput, setTopicTitleInput] = useState('Functions of RBI');
  const [intervalDays, setIntervalDays] = useState(1);
  const [dueDateInput, setDueDateInput] = useState(() => addDaysToDateStr(todayStr, 1));
  const [confidenceInput, setConfidenceInput] = useState(4);

  const categorized = {
    due: revisions.filter((r) => r.status !== 'completed' && r.dueDate === todayStr),
    overdue: revisions.filter((r) => r.status !== 'completed' && r.dueDate < todayStr),
    upcoming: revisions.filter((r) => r.status !== 'completed' && r.dueDate > todayStr),
    completed: revisions.filter((r) => r.status === 'completed'),
  };

  const handleScheduleNewRevision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topicTitleInput.trim()) return;
    const matchedTopic = topics.find(
      (t) =>
        t.subject === selectedSubject &&
        t.title.toLowerCase() === topicTitleInput.trim().toLowerCase()
    );
    await saveRevisionItem({
      topicId: matchedTopic?.id || makeSafeId('topic'),
      topicTitle: topicTitleInput.trim(),
      subject: selectedSubject,
      phase: matchedTopic?.phase || 'Phase II',
      intervalDays,
      stageLabel: `Day ${intervalDays} Review`,
      dueDate: dueDateInput,
      status:
        dueDateInput < todayStr
          ? 'overdue'
          : dueDateInput === todayStr
          ? 'due'
          : 'upcoming',
      confidence: confidenceInput,
      lastAccuracy: matchedTopic?.practiceAccuracy,
      recommendationReason: `Deterministic Day ${intervalDays} spaced repetition scheduled manually (Confidence ${confidenceInput}/5${
        typeof matchedTopic?.practiceAccuracy === 'number'
          ? `, Latest Quiz Accuracy ${matchedTopic.practiceAccuracy}%`
          : ''
      }).`,
    });
    if (dueDateInput > todayStr) setFilterTab('upcoming');
    else if (dueDateInput === todayStr) setFilterTab('due');
  };

  const displayedList = categorized[filterTab];

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-xs font-medium text-[var(--md-on-surface-variant)]">
            Spaced Repetition Intervals: Day {prefs.revisionIntervals.join(' · Day ')}
          </span>
          <h1 className="font-display text-2xl md:text-3xl font-semibold text-[var(--md-on-surface)]">
            Revision Center
          </h1>
        </div>
      </div>

      {/* Schedule Revision Form */}
      <form
        onSubmit={handleScheduleNewRevision}
        className="rounded-[24px] bg-[var(--md-surface-container-low)] p-6 border border-[var(--md-outline-variant)]/40 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end"
      >
        <div className="sm:col-span-3">
          <label className="block text-xs font-medium text-[var(--md-on-surface-variant)] mb-1">
            Subject
          </label>
          <select
            value={selectedSubject}
            onChange={(e) => setSelectedSubject(e.target.value)}
            className="w-full px-3 py-2.5 rounded-[14px] bg-[var(--md-surface)] text-sm border border-[var(--md-outline-variant)]"
          >
            {allSubjects.map((s) => (
              <option key={s.id} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-3">
          <label className="block text-xs font-medium text-[var(--md-on-surface-variant)] mb-1">
            Topic to Revise
          </label>
          <input
            type="text"
            required
            value={topicTitleInput}
            onChange={(e) => setTopicTitleInput(e.target.value)}
            placeholder="e.g., Functions of RBI"
            className="w-full px-3.5 py-2.5 rounded-[14px] bg-[var(--md-surface)] text-sm border border-[var(--md-outline-variant)]"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-[var(--md-on-surface-variant)] mb-1">
            Stage Interval
          </label>
          <select
            value={intervalDays}
            onChange={(e) => {
              const d = Number(e.target.value);
              setIntervalDays(d);
              setDueDateInput(addDaysToDateStr(todayStr, d));
            }}
            className="w-full px-3 py-2.5 rounded-[14px] bg-[var(--md-surface)] text-sm font-mono-tabular border border-[var(--md-outline-variant)]"
          >
            {prefs.revisionIntervals.map((d) => (
              <option key={d} value={d}>
                Day {d}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-[var(--md-on-surface-variant)] mb-1">
            Due Date
          </label>
          <input
            type="date"
            value={dueDateInput}
            onChange={(e) => setDueDateInput(e.target.value)}
            className="w-full px-3 py-2.5 rounded-[14px] bg-[var(--md-surface)] text-sm font-mono-tabular border border-[var(--md-outline-variant)]"
          />
        </div>

        <div className="sm:col-span-2">
          <button
            type="submit"
            className="w-full py-2.5 px-4 rounded-full bg-[var(--md-primary)] text-[var(--md-on-primary)] text-xs font-medium cursor-pointer"
          >
            Schedule Review
          </button>
        </div>
      </form>

      {/* Status Filter Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(
          [
            { key: 'due', label: 'Due Today', count: categorized.due.length },
            { key: 'overdue', label: 'Overdue', count: categorized.overdue.length },
            { key: 'upcoming', label: 'Upcoming', count: categorized.upcoming.length },
            { key: 'completed', label: 'Completed', count: categorized.completed.length },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilterTab(tab.key)}
            className={`p-4 rounded-[20px] text-left border transition-colors cursor-pointer ${
              filterTab === tab.key
                ? 'bg-[var(--md-primary-container)] text-[var(--md-on-primary-container)] border-[var(--md-primary)]'
                : 'bg-[var(--md-surface-container-low)] text-[var(--md-on-surface)] border-[var(--md-outline-variant)]/40'
            }`}
          >
            <p className="text-xs opacity-80">{tab.label}</p>
            <p className="font-mono-tabular text-2xl font-semibold mt-1">{tab.count}</p>
          </button>
        ))}
      </div>

      {/* Revision List */}
      <div className="rounded-[24px] bg-[var(--md-surface-container-low)] p-6 border border-[var(--md-outline-variant)]/40">
        {displayedList.length === 0 ? (
          <p className="text-xs text-[var(--md-on-surface-variant)] py-8 text-center">
            No revision records in the &ldquo;{filterTab}&rdquo; queue. Schedule a revision above or complete a Focus Room session.
          </p>
        ) : (
          <div className="space-y-3">
            {displayedList.map((rev) => (
              <div
                key={rev.id}
                className="p-4 rounded-[18px] bg-[var(--md-surface)] border border-[var(--md-outline-variant)]/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs text-[var(--md-on-surface-variant)] font-mono-tabular">
                    <span className="font-sans font-semibold text-[var(--md-primary)]">
                      {rev.stageLabel}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-sans">{rev.subject}</span>
                    <span aria-hidden="true">·</span>
                    <span>Due: {rev.dueDate}</span>
                  </div>
                  <h3 className="text-base font-semibold text-[var(--md-on-surface)]">
                    {rev.topicTitle}
                  </h3>
                  <p className="text-xs text-[var(--md-on-surface-variant)]">
                    {rev.recommendationReason}
                  </p>
                </div>

                {rev.status !== 'completed' && (
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      onClick={() => completeRevisionItem(rev.id, 4, true)}
                      className="px-4 py-2 rounded-full bg-[var(--md-primary)] text-[var(--md-on-primary)] text-xs font-medium cursor-pointer"
                    >
                      Mark Reviewed &amp; Advance Stage
                    </button>
                    <button
                      onClick={() =>
                        saveRevisionItem({
                          ...rev,
                          id: rev.id,
                          dueDate: addDaysToDateStr(rev.dueDate, 2),
                          status: 'upcoming',
                        })
                      }
                      className="px-3 py-2 rounded-full border border-[var(--md-outline-variant)] text-xs font-medium cursor-pointer"
                    >
                       Snooze +2d
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export const CurrentAffairsNotebook: React.FC = () => {
  const { currentAffairs, saveCurrentAffair, deleteCurrentAffair } = useStudy();

  const todayStr = getKolkataDateString();
  const [date, setDate] = useState(todayStr);
  const [headline, setHeadline] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [summary, setSummary] = useState('');
  const [keyFacts, setKeyFacts] = useState('');
  const [regulatoryRelevance, setRegulatoryRelevance] = useState('');
  const [esiConnection, setEsiConnection] = useState('');
  const [financeConnection, setFinanceConnection] = useState('');
  const [revisionStatus, setRevisionStatus] =
    useState<CurrentAffairRecord['revisionStatus']>('Unreviewed');
  const [filterMonth, setFilterMonth] = useState('All');

  const monthsAvailable = Array.from(new Set(currentAffairs.map((c) => c.monthTag)));
  const filteredEntries =
    filterMonth === 'All'
      ? currentAffairs
      : currentAffairs.filter((c) => c.monthTag === filterMonth);

  const handleSaveEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!headline.trim() || !summary.trim()) return;
    await saveCurrentAffair({
      date,
      monthTag: date.slice(0, 7),
      headline: headline.trim(),
      sourceUrl: sourceUrl.trim() || undefined,
      summary: summary.trim(),
      keyFacts: keyFacts.trim() || undefined,
      regulatoryRelevance: regulatoryRelevance.trim() || undefined,
      esiConnection: esiConnection.trim() || undefined,
      financeConnection: financeConnection.trim() || undefined,
      revisionStatus,
    });
    setHeadline('');
    setSummary('');
    setKeyFacts('');
    setRegulatoryRelevance('');
    setEsiConnection('');
    setFinanceConnection('');
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-xs font-medium text-[var(--md-on-surface-variant)]">
            Official RBI Circulars, PIB &amp; Regulatory Developments
          </span>
          <h1 className="font-display text-2xl md:text-3xl font-semibold text-[var(--md-on-surface)]">
            Current Affairs Notebook
          </h1>
        </div>

        <select
          value={filterMonth}
          onChange={(e) => setFilterMonth(e.target.value)}
          className="px-4 py-2 rounded-full bg-[var(--md-surface-container)] text-xs font-mono-tabular border border-[var(--md-outline-variant)]"
        >
          <option value="All">All Months ({currentAffairs.length})</option>
          {monthsAvailable.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      {/* Add Current Affairs Entry Form */}
      <form
        onSubmit={handleSaveEntry}
        className="rounded-[24px] bg-[var(--md-surface-container-low)] p-6 border border-[var(--md-outline-variant)]/40 space-y-4"
      >
        <h2 className="font-display text-lg font-semibold text-[var(--md-on-surface)]">
          Log Daily Current Affairs / RBI Notification
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-[var(--md-on-surface-variant)] mb-1">
              Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 rounded-[12px] bg-[var(--md-surface)] text-sm font-mono-tabular border border-[var(--md-outline-variant)]"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs text-[var(--md-on-surface-variant)] mb-1">
              Headline / RBI Notification Title
            </label>
            <input
              type="text"
              required
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder="e.g., RBI Master Direction on FinTech Self-Regulatory Organizations"
              className="w-full px-3.5 py-2 rounded-[12px] bg-[var(--md-surface)] text-sm border border-[var(--md-outline-variant)]"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--md-on-surface-variant)] mb-1">
              Source URL (Official RBI/PIB)
            </label>
            <input
              type="url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://rbi.org.in/..."
              className="w-full px-3 py-2 rounded-[12px] bg-[var(--md-surface)] text-xs border border-[var(--md-outline-variant)]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-[var(--md-on-surface-variant)] mb-1">
              Summary
            </label>
            <textarea
              rows={3}
              required
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Core policy update and context..."
              className="w-full p-3 rounded-[12px] bg-[var(--md-surface)] text-xs border border-[var(--md-outline-variant)]"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--md-on-surface-variant)] mb-1">
              Key Facts, Figures &amp; Thresholds
            </label>
            <textarea
              rows={3}
              value={keyFacts}
              onChange={(e) => setKeyFacts(e.target.value)}
              placeholder="Net worth limits, effective dates, committee names..."
              className="w-full p-3 rounded-[12px] bg-[var(--md-surface)] text-xs border border-[var(--md-outline-variant)]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-[var(--md-on-surface-variant)] mb-1">
              Regulatory Relevance
            </label>
            <input
              type="text"
              value={regulatoryRelevance}
              onChange={(e) => setRegulatoryRelevance(e.target.value)}
              placeholder="e.g., Payment & Settlement Systems Act"
              className="w-full px-3 py-2 rounded-[12px] bg-[var(--md-surface)] text-xs border border-[var(--md-outline-variant)]"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--md-on-surface-variant)] mb-1">
              ESI Syllabus Connection
            </label>
            <input
              type="text"
              value={esiConnection}
              onChange={(e) => setEsiConnection(e.target.value)}
              placeholder="e.g., Financial Inclusion & Digital Economy"
              className="w-full px-3 py-2 rounded-[12px] bg-[var(--md-surface)] text-xs border border-[var(--md-outline-variant)]"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--md-on-surface-variant)] mb-1">
              Finance Syllabus Connection
            </label>
            <input
              type="text"
              value={financeConnection}
              onChange={(e) => setFinanceConnection(e.target.value)}
              placeholder="e.g., FinTech Regulation & SROs"
              className="w-full px-3 py-2 rounded-[12px] bg-[var(--md-surface)] text-xs border border-[var(--md-outline-variant)]"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            className="px-6 py-2.5 rounded-full bg-[var(--md-primary)] text-[var(--md-on-primary)] text-xs font-medium cursor-pointer"
          >
            Save Current Affairs Entry
          </button>
        </div>
      </form>

      {/* Current Affairs Entries */}
      <div className="space-y-4">
        {filteredEntries.length === 0 ? (
          <div className="py-10 text-center rounded-[24px] bg-[var(--md-surface-container-low)] border border-dashed border-[var(--md-outline-variant)] p-6">
            <p className="text-sm font-medium text-[var(--md-on-surface)]">
              No Current Affairs entries logged yet
            </p>
            <p className="text-xs text-[var(--md-on-surface-variant)] mt-1">
              Record RBI press releases, notifications, and PIB updates above alongside their ESI and Finance syllabus linkages.
            </p>
          </div>
        ) : (
          filteredEntries.map((entry) => (
            <article
              key={entry.id}
              className="rounded-[24px] bg-[var(--md-surface-container-low)] p-6 border border-[var(--md-outline-variant)]/40 space-y-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-xs text-[var(--md-on-surface-variant)] font-mono-tabular">
                    <span>{entry.date}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-sans font-medium text-[var(--md-primary)]">
                      {entry.revisionStatus}
                    </span>
                  </div>
                  <h3 className="font-display text-lg font-semibold text-[var(--md-on-surface)] mt-0.5">
                    {entry.headline}
                  </h3>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={entry.revisionStatus}
                    onChange={(e) =>
                      saveCurrentAffair({
                        ...entry,
                        id: entry.id,
                        revisionStatus: e.target.value as CurrentAffairRecord['revisionStatus'],
                      })
                    }
                    className="px-3 py-1 rounded-[10px] bg-[var(--md-surface)] text-xs border border-[var(--md-outline-variant)]"
                  >
                    <option value="Unreviewed">Unreviewed</option>
                    <option value="Reviewed Once">Reviewed Once</option>
                    <option value="Revised & Mastered">Revised &amp; Mastered</option>
                  </select>
                  <button
                    onClick={() => deleteCurrentAffair(entry.id)}
                    className="text-xs text-[var(--md-error)] hover:underline px-2 cursor-pointer"
                  >
                    Delete
                  </button>
                </div>
              </div>

              <p className="text-sm text-[var(--md-on-surface)] whitespace-pre-wrap">
                {entry.summary}
              </p>

              {(entry.regulatoryRelevance || entry.esiConnection || entry.financeConnection) && (
                <div className="pt-2 border-t border-[var(--md-outline-variant)]/40 flex flex-wrap gap-4 text-xs text-[var(--md-on-surface-variant)]">
                  {entry.regulatoryRelevance && (
                    <span>
                      <strong>Regulatory:</strong> {entry.regulatoryRelevance}
                    </span>
                  )}
                  {entry.esiConnection && (
                    <span>
                      <strong>ESI Link:</strong> {entry.esiConnection}
                    </span>
                  )}
                  {entry.financeConnection && (
                    <span>
                      <strong>Finance Link:</strong> {entry.financeConnection}
                    </span>
                  )}
                </div>
              )}
            </article>
          ))
        )}
      </div>
    </div>
  );
};
