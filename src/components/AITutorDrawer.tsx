import React, { useEffect, useState } from 'react';
import { authenticatedAiFetch, getAiAvailabilityMessage } from '../aiApi';
import { useStudy } from '../context/StudyContext';

const TUTOR_ACTIONS = [
  { id: 'explain_concept', label: 'Explain a Concept' },
  { id: 'explain_simply', label: 'Explain Simply' },
  { id: 'explain_depth', label: 'Explain in Depth' },
  { id: 'generate_examples', label: 'Generate Examples' },
  { id: 'summarize_notes', label: 'Summarize Notes' },
  { id: 'extract_screenshot', label: 'Extract Screenshot Text' },
  { id: 'generate_questions', label: 'Generate Practice Questions' },
  { id: 'identify_gaps', label: 'Identify Knowledge Gaps' },
  { id: 'create_revision', label: 'Create Revision Notes' },
  { id: 'compare_concepts', label: 'Compare Related Concepts' },
];

interface StructuredTutorResult {
  title: string;
  groundedInUserNotes: string;
  citedNoteTitles: string[];
  aiExplanation: string;
  externalVerifiedContext: string;
  keyTakeaways: string[];
  modelUsed?: string;
}

export const AITutorDrawer: React.FC = () => {
  const {
    aiDrawerOpen,
    setAiDrawerOpen,
    aiContextTopic,
    allSubjects,
    notes,
    saveVaultNote,
    saveAIInteraction,
    showSnackbar,
    isOnline,
    aiStatus,
    refreshAiStatus,
  } = useStudy();

  const [actionType, setActionType] = useState('explain_concept');
  const [subject, setSubject] = useState('Finance');
  const [topic, setTopic] = useState('Functions of RBI');
  const [promptInput, setPromptInput] = useState('');
  const [includeNotesContext, setIncludeNotesContext] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<StructuredTutorResult | null>(null);

  useEffect(() => {
    if (aiContextTopic) {
      setSubject(aiContextTopic.subject);
      setTopic(aiContextTopic.topicTitle);
    }
  }, [aiContextTopic]);

  useEffect(() => {
    if (aiDrawerOpen) {
      refreshAiStatus().catch(() => {});
    }
  }, [aiDrawerOpen, refreshAiStatus]);

  if (!aiDrawerOpen) return null;

  const matchingNotes = notes.filter(
    (n) =>
      n.subject === subject ||
      n.topicTitle.toLowerCase().includes(topic.toLowerCase())
  );

  const handleRunTutor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOnline || aiStatus.state === 'OFFLINE') {
      setErrorMsg(
        'AI Tutor needs an internet connection. Your notes and study tools remain available offline.'
      );
      return;
    }
    setLoading(true);
    setErrorMsg(null);

    try {
      const notesContext = includeNotesContext
        ? (matchingNotes.length > 0 ? matchingNotes : notes.slice(0, 4)).map((n) => ({
            title: n.title,
            subject: n.subject,
            topicTitle: n.topicTitle,
            content: n.content,
          }))
        : [];

      const response = await authenticatedAiFetch('/api/ai/tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType,
          subject,
          topic,
          prompt: promptInput || `${actionType.replace('_', ' ')} for ${topic} (${subject})`,
          notesContext,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Gemini AI Tutor request failed.');
      }

      setResult(data);
      await saveAIInteraction({
        actionType,
        subject,
        topicTitle: topic,
        prompt: promptInput || topic,
        responseText: data.aiExplanation || '',
        sourceNoteTitles: Array.isArray(data.citedNoteTitles) ? data.citedNoteTitles.join(', ') : '',
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error communicating with AI Tutor.');
    } finally {
      setLoading(false);
      refreshAiStatus().catch(() => {});
    }
  };

  const handleSaveAsNewNote = async () => {
    if (!result) return;
    await saveVaultNote({
      title: `${result.title} (AI Study Companion Note)`,
      subject,
      topicTitle: topic,
      sourceType: 'note',
      content: `### 1. Grounded in Your Saved Notes\n${result.groundedInUserNotes}\n\n### 2. Concept Synthesis & Explanation\n${result.aiExplanation}\n\n### 3. RBI Statutory & Macroeconomic Context\n${result.externalVerifiedContext}\n\n### Key Revision Takeaways\n${(result.keyTakeaways || []).map((k) => `- ${k}`).join('\n')}`,
      tagsCsv: `${subject}, ${topic}, AI Tutor Synthesis`,
      attachments: [],
      version: 1,
      history: [],
    });
    showSnackbar('Saved AI Tutor response as a new note without overwriting your original notes.');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex justify-end">
      <aside
        aria-label="Gemini AI Study Assistant"
        className="w-full max-w-xl bg-[var(--md-surface)] text-[var(--md-on-surface)] h-full shadow-2xl border-l border-[var(--md-outline-variant)] flex flex-col justify-between overflow-hidden"
      >
        {/* Top Bar */}
        <div className="p-5 border-b border-[var(--md-outline-variant)]/50 flex items-center justify-between bg-[var(--md-surface-container-low)]">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-rounded text-[24px] text-[var(--md-primary)]">
              psychology
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-base font-semibold">
                  Gemini AI Study Assistant
                </h2>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    aiStatus.state === 'AVAILABLE' && isOnline
                      ? 'bg-[#def4ef] text-[#0c695d]'
                      : 'bg-[#fff4d6] text-[#7a5200]'
                  }`}
                >
                  {isOnline ? aiStatus.state : 'OFFLINE'}
                </span>
              </div>
              <p className="text-[11px] text-[var(--md-on-surface-variant)]">
                Grounded in your local Knowledge Vault · Works without Google Sign-In
              </p>
            </div>
          </div>

          <button
            onClick={() => setAiDrawerOpen(false)}
            className="px-3 py-1.5 rounded-full bg-[var(--md-surface-container-high)] text-xs font-medium cursor-pointer"
          >
            Close
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {(!isOnline || aiStatus.state !== 'AVAILABLE') && (
            <div className="p-3.5 rounded-[14px] bg-[#fff4d6] text-[#7a5200] border border-[#f5d98e] text-xs">
              {getAiAvailabilityMessage(isOnline ? aiStatus.state : 'OFFLINE')}
            </div>
          )}

          <form onSubmit={handleRunTutor} className="space-y-4">
            {/* 10 Action Mode Chips */}
            <div>
              <label className="block text-xs font-medium text-[var(--md-on-surface-variant)] mb-2">
                Select Study Assistant Capability
              </label>
              <div className="flex flex-wrap gap-1.5">
                {TUTOR_ACTIONS.map((act) => (
                  <button
                    key={act.id}
                    type="button"
                    onClick={() => setActionType(act.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                      actionType === act.id
                        ? 'bg-[var(--md-primary)] text-[var(--md-on-primary)]'
                        : 'bg-[var(--md-surface-container)] text-[var(--md-on-surface-variant)] hover:text-[var(--md-on-surface)]'
                    }`}
                  >
                    {act.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[var(--md-on-surface-variant)] mb-1">
                  Subject
                </label>
                <select
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-3 py-2 rounded-[12px] bg-[var(--md-surface-container-low)] text-xs border border-[var(--md-outline-variant)]"
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
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="w-full px-3 py-2 rounded-[12px] bg-[var(--md-surface-container-low)] text-xs border border-[var(--md-outline-variant)]"
                />
              </div>
            </div>

            {/* Disclosure & Grounding Control */}
            <label className="flex items-start gap-2.5 p-3 rounded-[14px] bg-[var(--md-surface-container-low)] border border-[var(--md-outline-variant)]/50 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={includeNotesContext}
                onChange={(e) => setIncludeNotesContext(e.target.checked)}
                className="mt-0.5 rounded accent-[var(--md-primary)]"
              />
              <div>
                <span className="font-medium text-[var(--md-on-surface)]">
                  Authorize retrieval context from my saved Knowledge Vault notes ({matchingNotes.length > 0 ? matchingNotes.length : notes.slice(0, 4).length} matching notes)
                </span>
                <p className="text-[11px] text-[var(--md-on-surface-variant)] mt-0.5">
                  Your personal notes are only sent when this toggle is enabled.
                </p>
              </div>
            </label>

            <div>
              <label className="block text-xs font-medium text-[var(--md-on-surface-variant)] mb-1">
                Specific Question or Concept Prompt
              </label>
              <textarea
                rows={3}
                value={promptInput}
                onChange={(e) => setPromptInput(e.target.value)}
                placeholder="e.g., Compare Repo Rate, SDF, and MSF under RBI's Liquidity Adjustment Facility..."
                className="w-full p-3 rounded-[14px] bg-[var(--md-surface-container-low)] text-sm border border-[var(--md-outline-variant)]"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-full bg-[var(--md-primary)] text-[var(--md-on-primary)] text-xs font-medium disabled:opacity-50 cursor-pointer"
            >
              {loading ? 'Synthesizing Grounded Response...' : 'Run Gemini Study Tutor'}
            </button>
          </form>

          {errorMsg && (
            <div className="p-4 rounded-[16px] bg-[var(--md-error-container)] text-[var(--md-on-error-container)] text-xs">
              {errorMsg}
            </div>
          )}

          {/* Epistemologically Separated Response Layers */}
          {result && (
            <div className="space-y-4 pt-3 border-t border-[var(--md-outline-variant)]/50">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-base font-semibold text-[var(--md-on-surface)]">
                  {result.title}
                </h3>
                <button
                  onClick={handleSaveAsNewNote}
                  className="px-3.5 py-1.5 rounded-full bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)] text-xs font-medium cursor-pointer"
                >
                  Save as New Vault Note
                </button>
              </div>

              {/* Layer 1: Directly Supported by User-Provided Sources */}
              <div className="p-4 rounded-[18px] bg-[var(--md-primary-container)]/40 border border-[var(--md-primary)]/40 space-y-1.5">
                <div className="text-xs font-semibold text-[var(--md-primary)]">
                  1. Directly Supported by Your Uploaded Notes
                </div>
                <p className="text-xs text-[var(--md-on-surface)] whitespace-pre-wrap leading-relaxed">
                  {result.groundedInUserNotes}
                </p>
                {result.citedNoteTitles && result.citedNoteTitles.length > 0 && (
                  <p className="text-[11px] text-[var(--md-on-surface-variant)] pt-1">
                    Supporting Vault Notes: {result.citedNoteTitles.join(' · ')}
                  </p>
                )}
              </div>

              {/* Layer 2: AI Explanation or Inference */}
              <div className="p-4 rounded-[18px] bg-[var(--md-surface-container-low)] border border-[var(--md-outline-variant)]/50 space-y-1.5">
                <div className="text-xs font-semibold text-[var(--md-on-surface)]">
                  2. AI Pedagogical Explanation &amp; Synthesis
                </div>
                <p className="text-xs text-[var(--md-on-surface)] whitespace-pre-wrap leading-relaxed">
                  {result.aiExplanation}
                </p>
              </div>

              {/* Layer 3: Externally Verified RBI / Statutory Information */}
              <div className="p-4 rounded-[18px] bg-[var(--md-surface-container-low)] border border-[var(--md-outline-variant)]/50 space-y-1.5">
                <div className="text-xs font-semibold text-[var(--md-on-surface)]">
                  3. Statutory &amp; Official RBI Framework Reference
                </div>
                <p className="text-xs text-[var(--md-on-surface)] whitespace-pre-wrap leading-relaxed">
                  {result.externalVerifiedContext}
                </p>
              </div>

              {/* Key Takeaways */}
              {result.keyTakeaways && result.keyTakeaways.length > 0 && (
                <div className="p-4 rounded-[18px] bg-[var(--md-surface-container)] space-y-2">
                  <div className="text-xs font-semibold text-[var(--md-on-surface)]">
                    Rapid Revision Takeaways
                  </div>
                  <ul className="list-disc pl-4 space-y-1 text-xs text-[var(--md-on-surface)]">
                    {result.keyTakeaways.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
};
