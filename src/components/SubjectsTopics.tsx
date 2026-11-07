import React, { useState } from 'react';
import { useStudy } from '../context/StudyContext';
import { ExamPhase, TopicRecord, TopicStatus } from '../types';

const TOPIC_STATUSES: TopicStatus[] = [
  'Not Started',
  'In Progress',
  'Lecture Completed',
  'Practice Completed',
  'Revision Due',
  'Mastered',
];

const OFFICIAL_SYLLABUS_REFERENCE: Record<string, string[]> = {
  Finance: [
    'Functions of RBI & Monetary Policy Framework',
    'Financial System in India — Regulators (RBI, SEBI, IRDAI, PFRDA, IFSCA)',
    'Primary & Secondary Markets (Debt, Equity, Forex, Money Market)',
    'Risk Management in Banking Sector & Basel Norms (Basel I, II, III)',
    'Financial Inclusion, Digital Payments & FinTech Initiatives',
    'Union Budget, Fiscal Policy & FRBM Act',
  ],
  'Economic and Social Issues': [
    'Measurement of Growth: National Income & Per Capita Income',
    'Poverty Alleviation & Employment Generation in India',
    'Monetary and Fiscal Policy Reforms since 1991',
    'Balance of Payments, Foreign Trade & IMF/World Bank/WTO',
    'Social Structure in India: Demographics, Urbanization & Migration',
  ],
  Management: [
    'Fundamentals of Management & Organizational Behavior',
    'Motivation Theories (Maslow, Herzberg, McGregor, Vroom)',
    'Leadership Styles & Theories (Blake & Mouton, Fiedler, Path-Goal)',
    'Corporate Governance & Business Ethics',
    'Communication Process, Barriers & Role of IT',
  ],
};

export const SubjectsTopics: React.FC = () => {
  const {
    allSubjects,
    topics,
    saveTopic,
    deleteTopic,
    addCustomSubject,
    startFocusForTopic,
    openAiTutorWithContext,
    setActiveTab,
  } = useStudy();

  const [selectedPhase, setSelectedPhase] = useState<ExamPhase>('Phase II');
  const [selectedSubject, setSelectedSubject] = useState<string>('Finance');

  // Create Topic Form state
  const [chapterInput, setChapterInput] = useState('RBI & Monetary Policy');
  const [titleInput, setTitleInput] = useState('');
  const [initialStatus, setInitialStatus] = useState<TopicStatus>('Not Started');

  // Custom Subject Modal state
  const [showCustomSubjectModal, setShowCustomSubjectModal] = useState(false);
  const [customSubjName, setCustomSubjName] = useState('');
  const [customSubjCode, setCustomSubjCode] = useState('');

  // Official Syllabus Reference toggle
  const [showOfficialRef, setShowOfficialRef] = useState(false);

  const phaseSubjects = allSubjects.filter((s) => s.phase === selectedPhase);
  const filteredTopics = topics.filter((t) => t.subject === selectedSubject);

  const handleCreateTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titleInput.trim()) return;
    await saveTopic({
      phase: selectedPhase,
      subject: selectedSubject,
      chapter: chapterInput.trim() || 'General',
      title: titleInput.trim(),
      status: initialStatus,
      studyMinutes: 0,
      confidence: 3,
    });
    setTitleInput('');
  };

  const handleUpdateTopicStatus = async (topic: TopicRecord, nextStatus: TopicStatus) => {
    await saveTopic({
      ...topic,
      id: topic.id,
      status: nextStatus,
    });
  };

  const handleCreateCustomSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customSubjName.trim()) return;
    await addCustomSubject(selectedPhase, customSubjName, customSubjCode);
    setSelectedSubject(customSubjName.trim());
    setCustomSubjName('');
    setCustomSubjCode('');
    setShowCustomSubjectModal(false);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-xs font-medium text-[var(--md-on-surface-variant)]">
            Exam → Phase → Subject → Chapter → Topic Hierarchy
          </span>
          <h1 className="font-display text-2xl md:text-3xl font-semibold text-[var(--md-on-surface)]">
            Subjects &amp; Topics Tracker
          </h1>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowOfficialRef((prev) => !prev)}
            className="px-4 py-2 rounded-full border border-[var(--md-outline-variant)] text-xs font-medium text-[var(--md-on-surface)] hover:bg-[var(--md-surface-container)] cursor-pointer"
          >
            {showOfficialRef ? 'Hide Official RBI Syllabus' : 'Official Syllabus Reference'}
          </button>
          <button
            onClick={() => setShowCustomSubjectModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)] text-xs font-medium cursor-pointer"
          >
            <span className="material-symbols-rounded text-[16px]">add</span>
            <span>Custom Subject</span>
          </button>
        </div>
      </div>

      {/* Phase Segmented Selector */}
      <div className="flex flex-wrap items-center gap-2">
        {(['Phase I', 'Phase II', 'Additional Categories'] as ExamPhase[]).map((phase) => (
          <button
            key={phase}
            onClick={() => {
              setSelectedPhase(phase);
              const first = allSubjects.find((s) => s.phase === phase);
              if (first) setSelectedSubject(first.name);
            }}
            className={`px-5 py-2.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
              selectedPhase === phase
                ? 'bg-[var(--md-primary)] text-[var(--md-on-primary)]'
                : 'bg-[var(--md-surface-container)] text-[var(--md-on-surface-variant)] hover:text-[var(--md-on-surface)]'
            }`}
          >
            {phase}
          </button>
        ))}
      </div>

      {/* Subject Filter Tabs within Selected Phase */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {phaseSubjects.map((subj) => {
          const subjTopics = topics.filter((t) => t.subject === subj.name);
          const subjMins = subjTopics.reduce((a, b) => a + b.studyMinutes, 0);
          const isSelected = selectedSubject === subj.name;

          return (
            <button
              key={subj.id}
              onClick={() => setSelectedSubject(subj.name)}
              className={`p-4 rounded-[20px] text-left border transition-colors cursor-pointer ${
                isSelected
                  ? 'bg-[var(--md-primary-container)] text-[var(--md-on-primary-container)] border-[var(--md-primary)]'
                  : 'bg-[var(--md-surface-container-low)] text-[var(--md-on-surface)] border-[var(--md-outline-variant)]/40 hover:bg-[var(--md-surface-container)]'
              }`}
            >
              <div className="flex items-center justify-between text-xs opacity-75 font-mono-tabular">
                <span>{subj.code}</span>
                <span>{subjTopics.length} topics</span>
              </div>
              <p className="font-display text-sm font-semibold mt-1 truncate">{subj.name}</p>
              <p className="text-xs font-mono-tabular opacity-80 mt-1">
                {(subjMins / 60).toFixed(1)} hrs logged
              </p>
            </button>
          );
        })}
      </div>

      {/* Optional Official Syllabus Reference (Separate from user-created topic list) */}
      {showOfficialRef && OFFICIAL_SYLLABUS_REFERENCE[selectedSubject] && (
        <div className="rounded-[24px] bg-[var(--md-surface-container)] p-5 border border-[var(--md-outline-variant)]/50 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-[var(--md-primary)]">
                Official RBI Grade B Reference Syllabus (Read-Only Benchmark)
              </span>
              <h3 className="font-display text-base font-semibold text-[var(--md-on-surface)]">
                {selectedSubject} — Official Syllabus Units
              </h3>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {OFFICIAL_SYLLABUS_REFERENCE[selectedSubject].map((unit) => (
              <div
                key={unit}
                className="p-3 rounded-[14px] bg-[var(--md-surface)] flex items-center justify-between gap-2 text-xs"
              >
                <span>{unit}</span>
                <button
                  onClick={() => {
                    setTitleInput(unit);
                  }}
                  className="text-[var(--md-primary)] font-medium hover:underline shrink-0 cursor-pointer"
                >
                  Use Title
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gradual Topic Creation Card */}
      <form
        onSubmit={handleCreateTopic}
        className="rounded-[24px] bg-[var(--md-surface-container-low)] p-6 border border-[var(--md-outline-variant)]/40 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end"
      >
        <div className="sm:col-span-3">
          <label className="block text-xs font-medium text-[var(--md-on-surface-variant)] mb-1">
            Chapter / Module
          </label>
          <input
            type="text"
            value={chapterInput}
            onChange={(e) => setChapterInput(e.target.value)}
            placeholder="e.g., Central Banking"
            className="w-full px-3.5 py-2.5 rounded-[14px] bg-[var(--md-surface)] text-sm border border-[var(--md-outline-variant)]"
          />
        </div>

        <div className="sm:col-span-4">
          <label className="block text-xs font-medium text-[var(--md-on-surface-variant)] mb-1">
            Topic Name (e.g., Functions of RBI)
          </label>
          <input
            type="text"
            required
            value={titleInput}
            onChange={(e) => setTitleInput(e.target.value)}
            placeholder="Type topic name..."
            className="w-full px-3.5 py-2.5 rounded-[14px] bg-[var(--md-surface)] text-sm border border-[var(--md-outline-variant)]"
          />
        </div>

        <div className="sm:col-span-3">
          <label className="block text-xs font-medium text-[var(--md-on-surface-variant)] mb-1">
            Initial Status
          </label>
          <select
            value={initialStatus}
            onChange={(e) => setInitialStatus(e.target.value as TopicStatus)}
            className="w-full px-3.5 py-2.5 rounded-[14px] bg-[var(--md-surface)] text-sm border border-[var(--md-outline-variant)]"
          >
            {TOPIC_STATUSES.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <button
            type="submit"
            className="w-full py-2.5 px-4 rounded-full bg-[var(--md-primary)] text-[var(--md-on-primary)] text-xs font-medium cursor-pointer"
          >
            Add Topic
          </button>
        </div>
      </form>

      {/* Topics List for Selected Subject */}
      <div className="rounded-[24px] bg-[var(--md-surface-container-low)] p-6 border border-[var(--md-outline-variant)]/40">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-semibold text-[var(--md-on-surface)]">
            {selectedSubject} Topics ({filteredTopics.length})
          </h2>
          <span className="text-xs text-[var(--md-on-surface-variant)]">
            Lecture completion is tracked separately from topic mastery
          </span>
        </div>

        {filteredTopics.length === 0 ? (
          <div className="py-10 text-center rounded-[20px] bg-[var(--md-surface)] border border-dashed border-[var(--md-outline-variant)] p-6">
            <p className="text-sm font-medium text-[var(--md-on-surface)]">
              No topics added to {selectedSubject} yet
            </p>
            <p className="text-xs text-[var(--md-on-surface-variant)] mt-1 max-w-md mx-auto">
              Add your first topic above (for example, &ldquo;Functions of RBI&rdquo;) as you begin studying it on Anuj Jindal.
            </p>
            <button
              onClick={() => setTitleInput('Functions of RBI')}
              className="mt-4 px-4 py-2 rounded-full bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)] text-xs font-medium cursor-pointer"
            >
              Pre-fill &ldquo;Functions of RBI&rdquo;
            </button>
          </div>
        ) : (
          <div className="divide-y divide-[var(--md-outline-variant)]/40">
            {filteredTopics.map((topic) => (
              <div
                key={topic.id}
                className="py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs text-[var(--md-on-surface-variant)]">
                    <span>{topic.chapter}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-tabular">{topic.studyMinutes} mins studied</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-tabular">
                      Accuracy: {typeof topic.practiceAccuracy === 'number' ? `${topic.practiceAccuracy}%` : 'Unattempted'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-tabular">Confidence: {topic.confidence}/5</span>
                  </div>
                  <h3 className="text-base font-semibold text-[var(--md-on-surface)]">
                    {topic.title}
                  </h3>
                  {topic.nextRevisionDate && (
                    <p className="text-xs text-[var(--md-on-surface-variant)] font-mono-tabular">
                      Next Revision Due: {topic.nextRevisionDate}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <select
                    value={topic.status}
                    onChange={(e) =>
                      handleUpdateTopicStatus(topic, e.target.value as TopicStatus)
                    }
                    aria-label={`Status for ${topic.title}`}
                    className="px-3 py-1.5 rounded-[12px] bg-[var(--md-surface)] text-xs font-medium border border-[var(--md-outline-variant)]"
                  >
                    {TOPIC_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={() =>
                      startFocusForTopic(topic.phase, topic.subject, topic.title, topic.id, 45)
                    }
                    className="px-3.5 py-1.5 rounded-full bg-[var(--md-primary)] text-[var(--md-on-primary)] text-xs font-medium cursor-pointer"
                  >
                    Start Timer
                  </button>

                  <button
                    onClick={() => openAiTutorWithContext(topic.subject, topic.title, topic.id)}
                    className="px-3.5 py-1.5 rounded-full bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)] text-xs font-medium cursor-pointer"
                  >
                    AI Tutor
                  </button>

                  <button
                    onClick={() => setActiveTab('practice')}
                    className="px-3 py-1.5 rounded-full border border-[var(--md-outline-variant)] text-xs font-medium cursor-pointer"
                  >
                    Quiz
                  </button>

                  <button
                    onClick={() => deleteTopic(topic.id)}
                    className="text-xs text-[var(--md-error)] hover:underline px-2 cursor-pointer"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Custom Subject Modal */}
      {showCustomSubjectModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateCustomSubject}
            className="max-w-md w-full rounded-[28px] bg-[var(--md-surface)] p-6 space-y-4 border border-[var(--md-outline-variant)]"
          >
            <h3 className="font-display text-lg font-semibold text-[var(--md-on-surface)]">
              Add Custom Subject to {selectedPhase}
            </h3>
            <div>
              <label className="block text-xs text-[var(--md-on-surface-variant)] mb-1">
                Subject Name
              </label>
              <input
                type="text"
                required
                value={customSubjName}
                onChange={(e) => setCustomSubjName(e.target.value)}
                placeholder="e.g., RBI Master Directions"
                className="w-full px-3.5 py-2 rounded-[14px] bg-[var(--md-surface-container-low)] text-sm border border-[var(--md-outline-variant)]"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--md-on-surface-variant)] mb-1">
                Short Code
              </label>
              <input
                type="text"
                value={customSubjCode}
                onChange={(e) => setCustomSubjCode(e.target.value)}
                placeholder="e.g., RBI-MD"
                className="w-full px-3.5 py-2 rounded-[14px] bg-[var(--md-surface-container-low)] text-sm font-mono-tabular border border-[var(--md-outline-variant)]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCustomSubjectModal(false)}
                className="px-4 py-2 rounded-full border border-[var(--md-outline-variant)] text-xs font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-full bg-[var(--md-primary)] text-[var(--md-on-primary)] text-xs font-medium cursor-pointer"
              >
                Create Subject
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
