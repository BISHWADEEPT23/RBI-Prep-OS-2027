import React, { useState, useEffect, Suspense, lazy } from 'react';
import { getKolkataDateString, StudyProvider, useStudy } from './context/StudyContext';
import { saveFileNative } from './hooks/useElectronAPI';
import { DesktopSidebar } from './components/DesktopSidebar';
import { DesktopTopBar } from './components/DesktopTopBar';
import { DesktopLoadingSkeleton } from './components/DesktopLoadingSkeleton';
import { TimerRecoveryBanner } from './components/TimerRecoveryBanner';
import { DatabaseRecoveryScreen } from './components/DatabaseRecoveryScreen';

// ─── Route-Level Lazy Loading for Heavy Modules ─────────────────────────────
const HomeDashboard = lazy(() =>
  import('./components/HomeDashboard').then((m) => ({ default: m.HomeDashboard }))
);
const FocusRoom = lazy(() =>
  import('./components/FocusRoom').then((m) => ({ default: m.FocusRoom }))
);
const RoutinePlanner = lazy(() =>
  import('./components/RoutinePlanner').then((m) => ({ default: m.RoutinePlanner }))
);
const SubjectsTopics = lazy(() =>
  import('./components/SubjectsTopics').then((m) => ({ default: m.SubjectsTopics }))
);
const KnowledgeVault = lazy(() =>
  import('./components/KnowledgeVault').then((m) => ({ default: m.KnowledgeVault }))
);
const RevisionCenter = lazy(() =>
  import('./components/RevisionAndCurrentAffairs').then((m) => ({
    default: m.RevisionCenter,
  }))
);
const CurrentAffairsNotebook = lazy(() =>
  import('./components/RevisionAndCurrentAffairs').then((m) => ({
    default: m.CurrentAffairsNotebook,
  }))
);
const PracticeQuizEngine = lazy(() =>
  import('./components/PracticeQuizEngine').then((m) => ({
    default: m.PracticeQuizEngine,
  }))
);
const AnalyticsDashboard = lazy(() =>
  import('./components/AnalyticsDashboard').then((m) => ({
    default: m.AnalyticsDashboard,
  }))
);
const SettingsBackupImport = lazy(() =>
  import('./components/SettingsBackupImport').then((m) => ({
    default: m.SettingsBackupImport,
  }))
);
const AITutorDrawer = lazy(() =>
  import('./components/AITutorDrawer').then((m) => ({ default: m.AITutorDrawer }))
);
const AuthDiagnosticsPanel = lazy(() =>
  import('./components/AuthDiagnosticsPanel').then((m) => ({
    default: m.AuthDiagnosticsPanel,
  }))
);

const AppShell: React.FC = () => {
  const {
    user,
    syncMode,
    workspaceMode,
    isOnline,
    dbReady,
    isHydrating,
    dbError,
    retryDatabaseConnection,
    restoreWorkspaceJson,
    activeTab,
    setActiveTab,
    aiDrawerOpen,
    setAiDrawerOpen,
    allSubjects,
    tasks,
    revisions,
    prefs,
    exportWorkspaceJson,
    pendingRetry,
    clearPendingRetry,
    authDiagnosis,
    snackbarMessage,
    showSnackbar,
    signInWithGoogle,
  } = useStudy();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const todayStr = getKolkataDateString();

  // ── Global Windows 11 Desktop Keyboard Shortcuts ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing inside form inputs
      const target = e.target as HTMLElement;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case '1':
            e.preventDefault();
            setActiveTab('home');
            break;
          case '2':
            e.preventDefault();
            setActiveTab('routine');
            break;
          case '3':
            e.preventDefault();
            setActiveTab('focus');
            break;
          case '4':
            e.preventDefault();
            setActiveTab('vault');
            break;
          case ',':
            e.preventDefault();
            setActiveTab('settings');
            break;
          case 'b':
          case 'B':
            e.preventDefault();
            setSidebarCollapsed((prev) => !prev);
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setActiveTab]);

  const handleExportSummary = async () => {
    const payload = exportWorkspaceJson();
    const blob = new Blob([payload], { type: 'application/json' });
    const filename = `rbi-prep-summary-${todayStr}.json`;
    await saveFileNative(blob, filename);
    showSnackbar('Exported RBI Prep OS workspace summary JSON.');
  };

  const handleShowDueNotification = () => {
    const dueTasks = tasks.filter((t) => t.date === todayStr && t.status !== 'completed').length;
    const dueRevs = revisions.filter(
      (r) => r.status !== 'completed' && r.dueDate <= todayStr
    ).length;
    showSnackbar(
      `Today's status: ${dueTasks} pending task(s) and ${dueRevs} due revision(s).`
    );
  };

  const renderActiveDestination = () => {
    switch (activeTab) {
      case 'home':
        return (
          <HomeDashboard
            searchQuery={searchQuery}
            selectedSubjectFilter={selectedSubjectFilter}
            onSelectSubjectFilter={setSelectedSubjectFilter}
          />
        );
      case 'focus':
        return <FocusRoom />;
      case 'routine':
        return <RoutinePlanner />;
      case 'subjects':
        return <SubjectsTopics />;
      case 'vault':
        return <KnowledgeVault />;
      case 'revision':
        return <RevisionCenter />;
      case 'practice':
        return <PracticeQuizEngine />;
      case 'current_affairs':
        return <CurrentAffairsNotebook />;
      case 'analytics':
        return <AnalyticsDashboard />;
      case 'settings':
        return <SettingsBackupImport />;
      default:
        return (
          <HomeDashboard
            searchQuery={searchQuery}
            selectedSubjectFilter={selectedSubjectFilter}
            onSelectSubjectFilter={setSelectedSubjectFilter}
          />
        );
    }
  };

  // If database fails to open, show recovery screen with non-destructive retry and restore options
  if (dbError) {
    return (
      <DatabaseRecoveryScreen
        error={dbError}
        onRetry={retryDatabaseConnection}
        onRestoreContent={async (content) => {
          await restoreWorkspaceJson(content);
          await retryDatabaseConnection();
        }}
      />
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-[#f4f7f5] dark:bg-[#0c1210] text-neutral-900 dark:text-neutral-100 font-sans select-none">
      {/* Timer Recovery Banner — Electron only, shown after unexpected restart */}
      <TimerRecoveryBanner
        onRestore={() => setActiveTab('focus')}
        onDismiss={() => {}}
      />

      {/* Explicit Error Escalation & Retry Save Banner */}
      {pendingRetry && (
        <div
          role="alert"
          className="mx-4 my-2 rounded-xl bg-[#ffe8e5] text-[#8a1f17] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 border border-[#f5c2bc] shadow-xs shrink-0 z-30"
        >
          <div className="text-xs">
            <strong>Database Write Warning ({pendingRetry.description}):</strong> Your input is
            safely preserved in your workspace buffer.
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => pendingRetry.retryFn()}
              className="px-3 py-1 rounded-full bg-[#8a1f17] text-white text-xs font-semibold cursor-pointer"
            >
              Retry Save
            </button>
            <button
              type="button"
              onClick={clearPendingRetry}
              className="px-3 py-1 rounded-full border border-[#8a1f17]/40 text-xs cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {authDiagnosis && workspaceMode === 'CLOUD_SYNC' && (
        <div className="mx-4 my-2 shrink-0 z-30">
          <Suspense fallback={null}>
            <AuthDiagnosticsPanel />
          </Suspense>
        </div>
      )}

      {/* Top Application Header Bar */}
      <DesktopTopBar
        activeTab={activeTab}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        isOnline={isOnline}
        workspaceMode={workspaceMode}
        onOpenFocus={() => setActiveTab('focus')}
        onOpenSettings={() => setActiveTab('settings')}
        onExportSummary={handleExportSummary}
        onShowDueNotification={handleShowDueNotification}
        onToggleAiDrawer={() => setAiDrawerOpen(!aiDrawerOpen)}
        dailyGoalMinutes={prefs.dailyGoalMinutes}
      />

      {/* Main Desktop Two-Panel Layout */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        {/* Windows 11 Desktop Navigation Sidebar */}
        <div className="hidden lg:block h-full">
          <DesktopSidebar
            activeTab={activeTab}
            onSelectTab={setActiveTab}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
            allSubjects={allSubjects}
            selectedSubjectFilter={selectedSubjectFilter}
            onSelectSubjectFilter={setSelectedSubjectFilter}
            onOpenAiTutor={() => setAiDrawerOpen(true)}
          />
        </div>

        {/* Mobile/Tablet Off-Canvas Sidebar */}
        {mobileMenuOpen && (
          <div
            className="lg:hidden fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex"
            onClick={() => setMobileMenuOpen(false)}
          >
            <div
              className="w-[260px] h-full bg-white dark:bg-[#121917] shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <DesktopSidebar
                activeTab={activeTab}
                onSelectTab={(tab) => {
                  setActiveTab(tab);
                  setMobileMenuOpen(false);
                }}
                collapsed={false}
                onToggleCollapse={() => setMobileMenuOpen(false)}
                allSubjects={allSubjects}
                selectedSubjectFilter={selectedSubjectFilter}
                onSelectSubjectFilter={setSelectedSubjectFilter}
                onOpenAiTutor={() => {
                  setAiDrawerOpen(true);
                  setMobileMenuOpen(false);
                }}
              />
            </div>
          </div>
        )}

        {/* Fluid Desktop Workspace / Active Destination View */}
        <main className="flex-1 h-full overflow-y-auto bg-[#f4f7f5] dark:bg-[#0c1210] p-3 sm:p-5 lg:p-6 select-text focus:outline-none">
          <Suspense fallback={<DesktopLoadingSkeleton title={activeTab} />}>
            {!dbReady ? (
              <DesktopLoadingSkeleton title="Hydrating persistent progress from local database..." />
            ) : (
              renderActiveDestination()
            )}
          </Suspense>
        </main>
      </div>

      {/* Snackbar Notifications */}
      {snackbarMessage && (
        <div
          role="status"
          className="fixed left-1/2 -translate-x-1/2 bottom-6 z-50 px-5 py-2.5 rounded-xl bg-[#1d3934] text-white text-xs font-medium shadow-lg border border-white/10 animate-fade-in"
        >
          {snackbarMessage}
        </div>
      )}

      {/* Contextual Gemini AI Tutor Drawer */}
      <Suspense fallback={null}>
        <AITutorDrawer />
      </Suspense>
    </div>
  );
};

export default function App() {
  return (
    <StudyProvider>
      <AppShell />
    </StudyProvider>
  );
}
