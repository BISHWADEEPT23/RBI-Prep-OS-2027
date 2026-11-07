import React from 'react';
import { NavigationTab, SubjectCategory } from '../types';

export interface DesktopSidebarProps {
  activeTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  allSubjects: SubjectCategory[];
  selectedSubjectFilter: string | null;
  onSelectSubjectFilter: (name: string | null) => void;
  onOpenAiTutor: () => void;
}

interface NavItemDef {
  tab: NavigationTab;
  label: string;
  icon: string;
  shortcut?: string;
  isAiDrawer?: boolean;
}

const NAV_ITEMS: NavItemDef[] = [
  { tab: 'home', label: 'Dashboard', icon: '⬟', shortcut: 'Ctrl+1' },
  { tab: 'routine', label: 'Study Planner', icon: '▦', shortcut: 'Ctrl+2' },
  { tab: 'subjects', label: 'Subjects & Topics', icon: '☑' },
  { tab: 'focus', label: 'Focus Room', icon: '⏱', shortcut: 'Ctrl+3' },
  { tab: 'vault', label: 'Knowledge Vault', icon: '▤', shortcut: 'Ctrl+4' },
  { tab: 'practice', label: 'Quiz & Mock Tests', icon: '🎯' },
  { tab: 'revision', label: 'Revision Center', icon: '🌿' },
  { tab: 'current_affairs', label: 'Current Affairs', icon: '📰' },
  { tab: 'analytics', label: 'Analytics', icon: '📊' },
  { tab: 'settings', label: 'Settings', icon: '⚙', shortcut: 'Ctrl+,' },
];

const SUBJECT_DOT_COLORS = [
  '#427968',
  '#22a5a0',
  '#6bc453',
  '#d4a359',
  '#ec4899',
  '#3b82f6',
  '#8b5cf6',
  '#14b8a6',
];

function getShortSubjectName(name: string): string {
  if (name.includes('Economic and Social')) return 'ESI';
  if (name.includes('Quantitative')) return 'Quant';
  if (name.includes('Reasoning')) return 'Reasoning';
  if (name.includes('English')) return 'English';
  if (name.includes('Finance')) return 'Finance';
  if (name.includes('Management')) return 'Management';
  return name.slice(0, 14);
}

export const DesktopSidebar: React.FC<DesktopSidebarProps> = ({
  activeTab,
  onSelectTab,
  collapsed,
  onToggleCollapse,
  allSubjects,
  selectedSubjectFilter,
  onSelectSubjectFilter,
  onOpenAiTutor,
}) => {
  return (
    <aside
      aria-label="Desktop application navigation"
      className={`h-full flex flex-col shrink-0 transition-all duration-200 border-r border-neutral-200/80 dark:border-neutral-800 bg-[#fbfdfc] dark:bg-[#121917] select-none z-20 ${
        collapsed ? 'w-[72px]' : 'w-[240px]'
      }`}
    >
      {/* Brand Header */}
      <div className="h-[62px] flex items-center px-4 border-b border-neutral-200/60 dark:border-neutral-800/80 justify-between">
        <div className="flex items-center gap-3 overflow-hidden">
          <img
            src="./assets/icons/app-256.png"
            alt="RBI Prep OS logo"
            className="w-8 h-8 rounded-lg shrink-0 object-contain shadow-xs"
            onError={(e) => {
              // Fallback to pwa icon if path differs
              (e.currentTarget as HTMLImageElement).src = './pwa-192x192.png';
            }}
          />
          {!collapsed && (
            <div className="truncate">
              <span className="font-bold text-[15px] tracking-tight text-[#1a2e26] dark:text-[#e4ece8] block leading-tight">
                RBI Prep OS
              </span>
              <span className="text-[10px] uppercase font-semibold tracking-wider text-[#427968] block">
                2027 Command Center
              </span>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onToggleCollapse}
          title={collapsed ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)'}
          className="w-7 h-7 rounded-md flex items-center justify-center text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
        >
          {collapsed ? '▶' : '◀'}
        </button>
      </div>

      {/* Main Navigation List */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-3 space-y-1">
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.tab;
          return (
            <button
              key={item.tab}
              type="button"
              onClick={() => onSelectTab(item.tab)}
              title={collapsed ? `${item.label} ${item.shortcut ? `(${item.shortcut})` : ''}` : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all text-[13px] font-medium relative group ${
                isActive
                  ? 'bg-[#427968] text-white shadow-xs font-semibold'
                  : 'text-neutral-700 dark:text-neutral-300 hover:bg-[#427968]/10 hover:text-[#2a5548] dark:hover:text-white'
              } ${collapsed ? 'justify-center px-0' : ''}`}
            >
              <span className={`text-base shrink-0 ${isActive ? 'text-white' : 'text-[#427968]'}`}>
                {item.icon}
              </span>

              {!collapsed && (
                <>
                  <span className="truncate flex-1">{item.label}</span>
                  {item.shortcut && (
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400 group-hover:text-neutral-600'
                      }`}
                    >
                      {item.shortcut}
                    </span>
                  )}
                </>
              )}
            </button>
          );
        })}

        {/* AI Assistant Quick Launcher in Sidebar */}
        <div className="pt-2">
          <button
            type="button"
            onClick={onOpenAiTutor}
            title={collapsed ? 'Open Gemini AI Study Assistant' : undefined}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all text-[13px] font-medium text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 border border-emerald-200/60 dark:border-emerald-800/60 ${
              collapsed ? 'justify-center px-0' : ''
            }`}
          >
            <span className="text-base text-emerald-600 dark:text-emerald-400">✦</span>
            {!collapsed && <span className="truncate font-semibold flex-1">AI Study Assistant</span>}
          </button>
        </div>

        {/* Quick Subject Filter (Expanded Mode Only) */}
        {!collapsed && allSubjects.length > 0 && (
          <div className="pt-4 border-t border-neutral-200/60 dark:border-neutral-800/80 mt-3">
            <div className="flex items-center justify-between px-2 pb-1.5 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
              <span>Syllabus Filter</span>
              {selectedSubjectFilter && (
                <button
                  type="button"
                  onClick={() => onSelectSubjectFilter(null)}
                  className="text-[10px] text-[#427968] hover:underline cursor-pointer lowercase"
                >
                  clear
                </button>
              )}
            </div>
            <div className="space-y-0.5 max-h-40 overflow-y-auto">
              {allSubjects.map((subj, idx) => {
                const color = SUBJECT_DOT_COLORS[idx % SUBJECT_DOT_COLORS.length];
                const isSelected = selectedSubjectFilter === subj.name;
                return (
                  <button
                    key={subj.id}
                    type="button"
                    onClick={() => onSelectSubjectFilter(isSelected ? null : subj.name)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[12px] transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#427968]/15 text-[#2a5548] dark:text-[#a0d2c3] font-semibold'
                        : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800/60'
                    }`}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span className="truncate">{getShortSubjectName(subj.name)}</span>
                    </span>
                    {isSelected && <span className="text-[10px] text-[#427968]">✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </nav>

      {/* Footer Area */}
      <div className="p-3 border-t border-neutral-200/60 dark:border-neutral-800/80 text-center">
        {!collapsed ? (
          <div className="flex items-center justify-between text-[11px] text-neutral-400 px-1">
            <span>v1.1.0 Desktop</span>
            <span className="text-emerald-700 dark:text-emerald-400 font-medium">✓ Local-First</span>
          </div>
        ) : (
          <span className="text-[10px] text-emerald-700 dark:text-emerald-400 block font-mono">
            ●
          </span>
        )}
      </div>
    </aside>
  );
};
