import React from 'react';

interface DesktopLoadingSkeletonProps {
  title?: string;
}

export const DesktopLoadingSkeleton: React.FC<DesktopLoadingSkeletonProps> = ({ title }) => {
  return (
    <div className="w-full h-full p-4 lg:p-6 space-y-6 animate-pulse">
      {/* Header bar skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-48 bg-[#427968]/20 rounded-lg" />
          <div className="h-4 w-72 bg-neutral-200 dark:bg-neutral-800 rounded-md" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-24 bg-neutral-200 dark:bg-neutral-800 rounded-lg" />
          <div className="h-9 w-32 bg-[#427968]/30 rounded-lg" />
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="p-4 rounded-2xl bg-white dark:bg-[#1a2320] border border-neutral-200/70 dark:border-neutral-800 space-y-3"
          >
            <div className="flex justify-between items-center">
              <div className="h-4 w-20 bg-neutral-200 dark:bg-neutral-700 rounded" />
              <div className="h-6 w-6 rounded-full bg-[#427968]/20" />
            </div>
            <div className="h-8 w-16 bg-[#427968]/30 rounded" />
            <div className="h-3 w-28 bg-neutral-200 dark:bg-neutral-700 rounded" />
          </div>
        ))}
      </div>

      {/* Main Content Skeleton Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 p-6 rounded-2xl bg-white dark:bg-[#1a2320] border border-neutral-200/70 dark:border-neutral-800 space-y-4 min-h-[360px]">
          <div className="h-5 w-36 bg-neutral-200 dark:bg-neutral-700 rounded" />
          <div className="h-48 w-full bg-[#427968]/10 rounded-xl" />
          <div className="space-y-2">
            <div className="h-4 w-full bg-neutral-200 dark:bg-neutral-700 rounded" />
            <div className="h-4 w-3/4 bg-neutral-200 dark:bg-neutral-700 rounded" />
          </div>
        </div>

        <div className="p-6 rounded-2xl bg-white dark:bg-[#1a2320] border border-neutral-200/70 dark:border-neutral-800 space-y-4 min-h-[360px]">
          <div className="h-5 w-28 bg-neutral-200 dark:bg-neutral-700 rounded" />
          <div className="space-y-3">
            {[1, 2, 3, 4].map((j) => (
              <div key={j} className="flex items-center gap-3 p-2 rounded-lg bg-neutral-50 dark:bg-neutral-800/50">
                <div className="h-8 w-8 rounded-full bg-[#427968]/20 shrink-0" />
                <div className="space-y-1.5 flex-1">
                  <div className="h-3.5 w-32 bg-neutral-200 dark:bg-neutral-700 rounded" />
                  <div className="h-2.5 w-20 bg-neutral-200 dark:bg-neutral-700 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
