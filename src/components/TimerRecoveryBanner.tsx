import React, { useEffect, useState } from 'react';
import { getTimerRecoveryState, clearTimerRecoveryState, isElectron } from '../hooks/useElectronAPI';

interface RecoveredTimerState {
  phase?: string;
  subject?: string;
  topicTitle?: string;
  plannedMinutes?: number;
  lastHeartbeatEpochMs?: number;
}

interface TimerRecoveryBannerProps {
  onRestore?: (state: RecoveredTimerState) => void;
  onDismiss?: () => void;
}

/**
 * TimerRecoveryBanner
 *
 * Shown when the app restarts after an unexpected closure while a Focus Room
 * timer was running. Only visible in Electron; a no-op in the web PWA.
 *
 * The recovered state is surfaced so the caller (FocusRoom / App) can decide
 * whether to offer a session resume.
 */
export const TimerRecoveryBanner: React.FC<TimerRecoveryBannerProps> = ({
  onRestore,
  onDismiss,
}) => {
  const [recovered, setRecovered] = useState<RecoveredTimerState | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isElectron()) return;

    getTimerRecoveryState().then((raw) => {
      if (raw && typeof raw === 'object') {
        setRecovered(raw as RecoveredTimerState);
      }
    });
  }, []);

  if (!recovered || dismissed) return null;

  const gapMs = recovered.lastHeartbeatEpochMs
    ? Date.now() - recovered.lastHeartbeatEpochMs
    : null;
  const gapMinutes = gapMs ? Math.round(gapMs / 60_000) : null;

  const handleRestore = () => {
    onRestore?.(recovered);
    setDismissed(true);
  };

  const handleDismiss = () => {
    clearTimerRecoveryState();
    setDismissed(true);
    onDismiss?.();
  };

  return (
    <div
      role="alert"
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg"
      style={{ fontFamily: 'inherit' }}
    >
      <div
        style={{
          background: 'var(--md-sys-color-secondary-container, #dce7de)',
          color: 'var(--md-sys-color-on-secondary-container, #1a2e1f)',
          borderRadius: '16px',
          padding: '16px 20px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '1.4rem' }}>⏱️</span>
          <div style={{ flex: 1 }}>
            <strong style={{ fontSize: '0.95rem' }}>Timer Recovery</strong>
            <p style={{ margin: 0, fontSize: '0.85rem', opacity: 0.85 }}>
              {recovered.subject
                ? `A ${recovered.phase ?? 'focus'} session for "${recovered.subject}${recovered.topicTitle ? ` — ${recovered.topicTitle}` : ''}" was interrupted`
                : 'A focus timer session was interrupted'}
              {gapMinutes !== null && ` (~${gapMinutes} min ago)`}. Would you like to log the unverified gap?
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
          <button
            onClick={handleDismiss}
            style={{
              padding: '6px 16px',
              borderRadius: '20px',
              border: '1px solid currentColor',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: '0.85rem',
              opacity: 0.75,
            }}
          >
            Dismiss
          </button>
          <button
            onClick={handleRestore}
            style={{
              padding: '6px 16px',
              borderRadius: '20px',
              border: 'none',
              background: 'var(--md-sys-color-secondary, #4a7c5a)',
              color: 'var(--md-sys-color-on-secondary, #fff)',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 600,
            }}
          >
            Review &amp; Log Session
          </button>
        </div>
      </div>
    </div>
  );
};
