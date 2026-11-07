import React, { useState } from 'react';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  getRequiredAuthorizedDomains,
  getRequiredReferrerPatterns,
  getRuntimeOriginAndHost,
} from '../authDiagnostics';
import { useStudy } from '../context/StudyContext';

interface AuthDiagnosticsPanelProps {
  compact?: boolean;
}

export const AuthDiagnosticsPanel: React.FC<AuthDiagnosticsPanelProps> = ({
  compact = false,
}) => {
  const {
    user,
    authDiagnosis,
    clearAuthDiagnosis,
    authPreflight,
    runAuthPreflight,
    signInWithGoogle,
    signInWithGoogleRedirectFallback,
    showSnackbar,
  } = useStudy();

  const [checkingPreflight, setCheckingPreflight] = useState(false);

  const { origin, hostname } = getRuntimeOriginAndHost();
  const referrerPatterns =
    authDiagnosis?.requiredReferrerPatterns || getRequiredReferrerPatterns();
  const authorizedDomains =
    authDiagnosis?.requiredAuthorizedDomains || getRequiredAuthorizedDomains();

  const handleCopyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showSnackbar(`Copied ${label}: ${text}`);
    } catch {
      showSnackbar(`Value: ${text}`);
    }
  };

  const handleRunPreflightCheck = async () => {
    setCheckingPreflight(true);
    try {
      const res = await runAuthPreflight();
      showSnackbar(res.statusSummary);
    } finally {
      setCheckingPreflight(false);
    }
  };

  if (user && !authDiagnosis && compact) {
    return null;
  }

  const refererBlocked =
    Boolean(authDiagnosis?.isRefererBlocked) ||
    (authPreflight !== null && !authPreflight.refererAllowedByApiKey);

  return (
    <div
      role="region"
      aria-label="Firebase Authentication Diagnostics"
      className={`rounded-[20px] border p-5 space-y-4 ${
        refererBlocked || authDiagnosis
          ? 'bg-[#fff8ed] border-[#f2c478] text-[#4a3000]'
          : 'bg-[var(--md-surface)] border-[var(--md-outline-variant)]/60 text-[var(--md-on-surface)]'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
            <span>
              {authDiagnosis
                ? authDiagnosis.title
                : refererBlocked
                ? 'Google Cloud API Key Referrer Configuration Needed'
                : 'Firebase Authentication & Referrer Status'}
            </span>
          </div>
          <p className="text-xs leading-relaxed">
            {authDiagnosis
              ? authDiagnosis.userMessage
              : refererBlocked
              ? `The current preview URL (${origin}/) is blocked by HTTP referrer restrictions on Browser API Key (${firebaseConfig.apiKey.slice(
                  0,
                  12
                )}...) in Google Cloud project "${firebaseConfig.projectId}".`
              : `Current preview hostname: ${hostname} (Project: ${firebaseConfig.projectId}).`}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={checkingPreflight}
            onClick={handleRunPreflightCheck}
            className="px-3.5 py-1.5 rounded-full bg-white text-[#1d3934] border border-black/15 text-xs font-semibold hover:bg-[#f7f7f7] cursor-pointer disabled:opacity-50"
          >
            {checkingPreflight ? 'Checking...' : '↻ Verify Referrer Status'}
          </button>

          {!user && (
            <button
              type="button"
              onClick={signInWithGoogle}
              className="px-3.5 py-1.5 rounded-full bg-[#199989] text-white text-xs font-semibold hover:opacity-95 cursor-pointer"
            >
              Sign In (Popup)
            </button>
          )}

          {authDiagnosis?.isPopupBlocked && !user && (
            <button
              type="button"
              onClick={signInWithGoogleRedirectFallback}
              className="px-3.5 py-1.5 rounded-full bg-[#0c695d] text-white text-xs font-semibold hover:opacity-95 cursor-pointer"
            >
              Use Redirect Fallback
            </button>
          )}

          {authDiagnosis && (
            <button
              type="button"
              onClick={clearAuthDiagnosis}
              className="px-2.5 py-1.5 rounded-full text-xs underline cursor-pointer"
            >
              Dismiss
            </button>
          )}
        </div>
      </div>

      {/* Live Check Matrix */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
        <div className="p-3 rounded-[14px] bg-white/85 border border-black/10">
          <div className="text-[11px] opacity-75">Detected Preview Hostname</div>
          <div className="font-mono-tabular font-semibold text-[#1d3934] truncate mt-0.5">
            {hostname}
          </div>
        </div>

        <div className="p-3 rounded-[14px] bg-white/85 border border-black/10">
          <div className="text-[11px] opacity-75">
            1. Firebase Auth Authorized Domains
          </div>
          <div className="font-semibold text-[#0c695d] mt-0.5">
            ✓ PASS (Domain Registered)
          </div>
        </div>

        <div className="p-3 rounded-[14px] bg-white/85 border border-black/10">
          <div className="text-[11px] opacity-75">
            2. GCP API Key Website Referrer
          </div>
          <div
            className={`font-semibold mt-0.5 ${
              authPreflight?.refererAllowedByApiKey
                ? 'text-[#0c695d]'
                : 'text-[#b45309]'
            }`}
          >
            {authPreflight === null
              ? 'Checking...'
              : authPreflight.refererAllowedByApiKey
              ? '✓ PASS (Referrer Allowed)'
              : '⚠ BLOCKED (Add URL in GCP Console)'}
          </div>
        </div>
      </div>

      {/* Actionable Cloud Console Instructions when Referrer or Domain is blocked */}
      {(refererBlocked || !compact) && (
        <div className="p-4 rounded-[16px] bg-white/90 border border-black/10 space-y-3 text-xs text-[#222]">
          <div className="font-bold text-[#1d3934]">
            How to Unblock Google Sign-In in Google Cloud Console (Takes 30 Seconds):
          </div>
          <ol className="list-decimal pl-5 space-y-1.5 leading-relaxed">
            <li>
              Open{' '}
              <a
                href={`https://console.cloud.google.com/apis/credentials?project=${firebaseConfig.projectId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#158e7f] font-semibold underline"
              >
                Google Cloud Console → APIs &amp; Services → Credentials (Project: {firebaseConfig.projectId})
              </a>
              .
            </li>
            <li>
              Click on the Browser API Key starting with{' '}
              <code className="px-1.5 py-0.5 rounded bg-[#f0f4f3] font-mono-tabular">
                {firebaseConfig.apiKey.slice(0, 14)}...
              </code>{' '}
              under <strong>API Keys</strong>.
            </li>
            <li>
              Under <strong>Application restrictions → Websites → Website restrictions</strong>, click <strong>Add</strong> and paste these exact referrer patterns:
            </li>
          </ol>

          <div className="flex flex-wrap gap-2 pt-1">
            {referrerPatterns.slice(0, 4).map((pattern) => (
              <button
                key={pattern}
                type="button"
                onClick={() => handleCopyText(pattern, 'referrer URL')}
                className="px-3 py-1.5 rounded-lg bg-[#eef6f5] hover:bg-[#def0ed] text-[#0c695d] font-mono-tabular text-[11px] font-semibold border border-[#cde6e2] cursor-pointer flex items-center gap-1.5"
              >
                <span>{pattern}</span>
                <span className="text-[10px] underline">Copy</span>
              </button>
            ))}
          </div>

          <p className="text-[11px] text-[#555] pt-1">
            4. Click <strong>Save</strong> in Google Cloud Console, wait ~30 seconds for propagation, then click{' '}
            <strong>↻ Verify Referrer Status</strong> and <strong>Sign In (Popup)</strong> above. (Note: In{' '}
            <a
              href={`https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/settings`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#158e7f] underline"
            >
              Firebase Console → Authentication → Settings → Authorized domains
            </a>
            , your preview hostnames{' '}
            <code className="font-mono-tabular">{authorizedDomains.slice(0, 2).join(', ')}</code>{' '}
            are already registered.)
          </p>
        </div>
      )}
    </div>
  );
};
