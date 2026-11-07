import { auth } from './firebase';
import { AiAvailabilityState } from './types';

const LOCAL_WORKSPACE_ID_STORAGE_KEY = 'rbi_prep_os_2027_local_workspace_id';

interface CachedLocalToken {
  token: string;
  workspaceId: string;
  expiresAtMs: number;
}

let cachedLocalSessionToken: CachedLocalToken | null = null;

export function getOrCreateLocalWorkspaceId(): string {
  try {
    if (typeof localStorage !== 'undefined') {
      const existing = localStorage.getItem(LOCAL_WORKSPACE_ID_STORAGE_KEY);
      if (existing && /^[a-zA-Z0-9_-]{6,80}$/.test(existing)) {
        return existing;
      }
      const rand =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID().replace(/-/g, '')
          : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
      const created = `ws_${rand.slice(0, 24)}`;
      localStorage.setItem(LOCAL_WORKSPACE_ID_STORAGE_KEY, created);
      return created;
    }
  } catch {
    // Fallback below
  }
  return 'ws_default_local_workspace';
}

export interface AiStatusDetails {
  state: AiAvailabilityState;
  message: string;
  rateLimitPerMinute?: number;
  dailyQuotaPerWorkspace?: number;
}

export function getAiAvailabilityMessage(state: AiAvailabilityState): string {
  switch (state) {
    case 'AVAILABLE':
      return 'Gemini AI Study Assistant is online and ready.';
    case 'OFFLINE':
      return 'AI Tutor needs an internet connection. Your notes and study tools remain available offline.';
    case 'NOT_CONFIGURED':
      return 'Gemini AI is not configured on this server. Your notes and study tools remain available offline.';
    case 'AUTH_REQUIRED':
      return 'AI session authorization required. Your offline study tools remain available.';
    case 'RATE_LIMITED':
      return 'AI rate limit reached (10 requests/min). Please wait a moment; your local study tools remain available.';
    case 'ERROR':
    default:
      return 'AI service is temporarily unavailable. Your notes and study tools remain available offline.';
  }
}

export async function checkAiProviderStatus(): Promise<AiStatusDetails> {
  const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine;
  if (!isOnline) {
    return {
      state: 'OFFLINE',
      message: getAiAvailabilityMessage('OFFLINE'),
    };
  }

  // In packaged desktop application running from local file:// assets without dev server
  if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
    return {
      state: 'AVAILABLE',
      message: 'Desktop Local-First Mode active. Notes, study routines, and focus sessions are stored securely on this computer.',
    };
  }

  try {
    const resp = await fetch('/api/ai/status', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (resp.status === 429) {
      return {
        state: 'RATE_LIMITED',
        message: getAiAvailabilityMessage('RATE_LIMITED'),
      };
    }
    if (!resp.ok) {
      return {
        state: 'ERROR',
        message: getAiAvailabilityMessage('ERROR'),
      };
    }
    const data = await resp.json();
    const state: AiAvailabilityState =
      data.state === 'NOT_CONFIGURED' ? 'NOT_CONFIGURED' : 'AVAILABLE';
    return {
      state,
      message: data.message || getAiAvailabilityMessage(state),
      rateLimitPerMinute: data.rateLimitPerMinute,
      dailyQuotaPerWorkspace: data.dailyQuotaPerWorkspace,
    };
  } catch {
    return {
      state: 'OFFLINE',
      message: getAiAvailabilityMessage('OFFLINE'),
    };
  }
}

async function obtainSignedLocalWorkspaceToken(): Promise<{
  token: string;
  workspaceId: string;
}> {
  const workspaceId = getOrCreateLocalWorkspaceId();
  if (
    cachedLocalSessionToken &&
    cachedLocalSessionToken.workspaceId === workspaceId &&
    Date.now() + 30000 < cachedLocalSessionToken.expiresAtMs
  ) {
    return {
      token: cachedLocalSessionToken.token,
      workspaceId,
    };
  }

  const resp = await fetch('/api/ai/session-token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Workspace-Id': workspaceId,
    },
    body: JSON.stringify({ workspaceId }),
  });

  if (resp.status === 429) {
    throw new Error(getAiAvailabilityMessage('RATE_LIMITED'));
  }

  if (!resp.ok) {
    const errData = await resp.json().catch(() => ({}));
    throw new Error(
      errData.error || getAiAvailabilityMessage('AUTH_REQUIRED')
    );
  }

  const data = await resp.json();
  cachedLocalSessionToken = {
    token: data.token,
    workspaceId: data.workspaceId || workspaceId,
    expiresAtMs: data.expiresAtMs || Date.now() + 10 * 60 * 1000,
  };
  return {
    token: cachedLocalSessionToken.token,
    workspaceId: cachedLocalSessionToken.workspaceId,
  };
}

/**
 * Phase 7 — Dual-Mode Secure AI Client Wrapper:
 * - If offline, fails fast with a clear offline message ("AI Tutor needs an internet connection. Your notes and study tools remain available offline.").
 * - If the user is signed into Firebase with a verified email, attaches `Authorization: Bearer <idToken>`.
 * - If running in Local Workspace mode without Google Sign-In, acquires a short-lived HMAC-signed
 *   Local Workspace Session Token (`/api/ai/session-token`) and attaches `X-Local-Workspace-Token` + `X-Workspace-Id`.
 */
export async function authenticatedAiFetch(
  input: string,
  init: RequestInit = {}
): Promise<Response> {
  const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine;
  if (!isOnline) {
    throw new Error(getAiAvailabilityMessage('OFFLINE'));
  }

  const currentUser = auth?.currentUser || null;
  const headers = new Headers(init.headers || {});

  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (currentUser && currentUser.emailVerified) {
    const idToken = await currentUser.getIdToken();
    headers.set('Authorization', `Bearer ${idToken}`);
  } else {
    const { token, workspaceId } = await obtainSignedLocalWorkspaceToken();
    headers.set('X-Local-Workspace-Token', token);
    headers.set('X-Workspace-Id', workspaceId);
  }

  const response = await fetch(input, {
    ...init,
    headers,
  });

  // If cached local token expired early due to server restart, refresh once
  if (response.status === 401 && !currentUser) {
    cachedLocalSessionToken = null;
    const { token, workspaceId } = await obtainSignedLocalWorkspaceToken();
    headers.set('X-Local-Workspace-Token', token);
    headers.set('X-Workspace-Id', workspaceId);
    return fetch(input, {
      ...init,
      headers,
    });
  }

  return response;
}
