import React, { useRef, useEffect } from 'react';
import { NavigationTab, WorkspaceMode } from '../types';

export interface DesktopTopBarProps {
  activeTab: NavigationTab;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  isOnline: boolean;
  workspaceMode: WorkspaceMode;
  onOpenFocus: () => void;
  onOpenSettings: () => void;
  onExportSummary: () => void;
  onShowDueNotification: () => void;
  onToggleAiDrawer: () => void;
  dailyGoalMinutes: number;
}

const SECTION_TITLES: Record<NavigationTab, string> = {
  home: 'Dashboard',
  routine: 'Study Planner',
  subjects: 'Subjects & Topics',
  focus: 'Focus Room',
  vault: 'Knowledge Vault',
  practice: 'Quiz & Mock Tests',
  revision: 'Revision Center',
  current_affairs: 'Current Affairs',
  analytics: 'Analytics',
  settings: 'Settings & Storage',
};

export const DesktopTopBar: React.FC<DesktopTopBarProps> = ({
  activeTab,
  searchQuery,
  onSearchChange,
  isOnline,
  workspaceMode,
  onOpenFocus,
  onOpenSettings,
  onExportSummary,
  onShowDueNotification,
  onToggleAiDrawer,
}) => {
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Global Ctrl+F listener to focus search input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <header className="h-[62px] px-4 lg:px-6 bg-[#fbfdfc] dark:bg-[#121917] border-b border-neutral-200/80 dark:border-neutral-800 flex items-center justify-between gap-4 shrink-0 z-10 select-none">
      {/* Current Module Title */}
      <div className="flex items-center gap-3 shrink-0">
        <h1 className="text-[17px] font-bold text-neutral-900 dark:text-neutral-100 m-0 tracking-tight flex items-center gap-2">
          <span>{SECTION_TITLES[activeTab]}</span>
        </h1>
        <span className="hidden xl:inline-block text-[11px] font-semibold text-[#427968] bg-[#427968]/10 px-2 py-0.5 rounded-full">
          RBI Grade B 2027
        </span>
      </div>

      {/* Global Search Bar with Ctrl+F badge */}
      <div className="flex-1 max-w-md relative">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-neutral-100/80 dark:bg-neutral-800/70 border border-neutral-200/80 dark:border-neutral-700/80 focus-within:border-[#427968] focus-within:ring-2 focus-within:ring-[#427968]/20 transition-all">
          <span className="text-neutral-400 text-xs shrink-0">⌕</span>
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search syllabus, notes, or routine tasks..."
            aria-label="Search syllabus, notes, or routine tasks"
            className="w-full bg-transparent border-0 outline-none text-[13px] text-neutral-800 dark:text-neutral-200 placeholder:text-neutral-400"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer"
            >
              ✕
            </button>
          ) : (
            <kbd className="hidden sm:inline-block text-[10px] font-mono text-neutral-400 bg-neutral-200/60 dark:bg-neutral-700 px-1.5 py-0.5 rounded border border-neutral-300 dark:border-neutral-600">
              Ctrl+F
            </kbd>
          )}
        </div>
      </div>

      {/* Right Controls & Quick Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {!isOnline && (
          <span
            title="Running in Offline Mode — All study sessions and notes are safely stored in IndexedDB"
            className="px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800 text-[11px] font-semibold flex items-center gap-1.5"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            <span>Offline</span>
          </span>
        )}

        {/* Local Storage Indicator */}
        <span
          title="Authoritative Local Storage active on this device"
          className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60 text-[11px] font-semibold"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span>Local Device</span>
        </span>

        {/* Quick Focus Button */}
        <button
          type="button"
          onClick={onOpenFocus}
          title="Quick Start Focus Timer (Ctrl+3)"
          className="px-3 py-1.5 rounded-lg bg-[#427968] hover:bg-[#346254] text-white text-[12px] font-semibold flex items-center gap-1.5 shadow-xs transition-colors"
        >
          <span>⏱</span>
          <span className="hidden sm:inline">Focus</span>
        </button>

        {/* Quick Export Summary Button */}
        <button
          type="button"
          onClick={onExportSummary}
          title="Export workspace summary JSON"
          className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 text-[12px] font-medium transition-colors"
        >
          <span>⇧</span>
          <span className="hidden lg:inline ml-1.5">Backup</span>
        </button>

        {/* Today's due items badge */}
        <button
          type="button"
          onClick={onShowDueNotification}
          title="Check tasks & revisions due today"
          className="w-8 h-8 rounded-lg bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 text-sm flex items-center justify-center transition-colors"
        >
          🔔
        </button>

        {/* AI Tutor Drawer Toggle */}
        <button
          type="button"
          onClick={onToggleAiDrawer}
          title="Toggle Gemini AI Study Assistant"
          className="px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 border border-emerald-300/80 dark:border-emerald-700/80 text-emerald-800 dark:text-emerald-300 text-[12px] font-semibold flex items-center gap-1 transition-colors"
        >
          <span>✦</span>
          <span className="hidden md:inline">AI Tutor</span>
        </button>

        {/* Settings Avatar */}
        <button
          type="button"
          onClick={onOpenSettings}
          title="Workspace Settings (Ctrl+,)"
          className="w-8 h-8 rounded-full bg-[#427968]/20 hover:bg-[#427968]/30 text-[#427968] flex items-center justify-center text-xs font-bold border border-[#427968]/30 transition-colors"
        >
          ⚙
        </button>
      </div>
    </header>
  );
};
