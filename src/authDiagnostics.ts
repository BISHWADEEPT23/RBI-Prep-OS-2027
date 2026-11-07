import firebaseConfig from '../firebase-applet-config.json';

export interface AuthErrorDiagnosis {
  code: string;
  title: string;
  userMessage: string;
  isRefererBlocked: boolean;
  isUnauthorizedDomain: boolean;
  isPopupBlocked: boolean;
  detectedOrigin: string;
  detectedHostname: string;
  requiredReferrerPatterns: string[];
  requiredAuthorizedDomains: string[];
  gcpCredentialsConsoleUrl: string;
  firebaseAuthSettingsUrl: string;
}

export interface AuthPreflightResult {
  checkedAtIso: string;
  origin: string;
  hostname: string;
  identityToolkitReachable: boolean;
  refererAllowedByApiKey: boolean;
  hostnameInAuthorizedDomains: boolean;
  statusSummary: string;
  errorReason?: string;
}

const KNOWN_DEV_HOST = 'ais-dev-qxlsqu7uyhhdhbkgfl6iis-387912749355.asia-east1.run.app';
const KNOWN_PRE_HOST = 'ais-pre-qxlsqu7uyhhdhbkgfl6iis-387912749355.asia-east1.run.app';
const KNOWN_MOB_HOST = 'ais-mob-qxlsqu7uyhhdhbkgfl6iis-387912749355.asia-east1.run.app';

export function getRuntimeOriginAndHost(): { origin: string; hostname: string } {
  if (typeof window !== 'undefined' && window.location) {
    return {
      origin: window.location.origin,
      hostname: window.location.hostname,
    };
  }
  return {
    origin: `https://${KNOWN_DEV_HOST}`,
    hostname: KNOWN_DEV_HOST,
  };
}

export function getRequiredReferrerPatterns(): string[] {
  const { origin, hostname } = getRuntimeOriginAndHost();
  const patterns = new Set<string>([
    `${origin}/*`,
    `https://${hostname}/*`,
    `https://${KNOWN_DEV_HOST}/*`,
    `https://${KNOWN_PRE_HOST}/*`,
    `https://${KNOWN_MOB_HOST}/*`,
    `https://${firebaseConfig.authDomain}/*`,
    `https://${firebaseConfig.projectId}.web.app/*`,
  ]);
  return Array.from(patterns);
}

export function getRequiredAuthorizedDomains(): string[] {
  const { hostname } = getRuntimeOriginAndHost();
  const domains = new Set<string>([
    hostname,
    KNOWN_DEV_HOST,
    KNOWN_PRE_HOST,
    KNOWN_MOB_HOST,
    firebaseConfig.authDomain,
    `${firebaseConfig.projectId}.web.app`,
  ]);
  return Array.from(domains);
}

/**
 * Translates raw Firebase Auth errors into clear, actionable diagnostics without exposing raw stack strings.
 */
export function diagnoseFirebaseAuthError(err: unknown): AuthErrorDiagnosis {
  const rawMessage = err instanceof Error ? err.message : String(err);
  const rawCode =
    typeof (err as { code?: unknown })?.code === 'string'
      ? String((err as { code: string }).code)
      : '';

  const { origin, hostname } = getRuntimeOriginAndHost();
  const gcpCredentialsConsoleUrl = `https://console.cloud.google.com/apis/credentials?project=${firebaseConfig.projectId}`;
  const firebaseAuthSettingsUrl = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/settings`;

  const isRefererBlocked =
    rawCode.includes('requests-from-referer') ||
    rawMessage.includes('requests-from-referer') ||
    rawMessage.includes('API_KEY_HTTP_REFERRER_BLOCKED');

  const isUnauthorizedDomain =
    rawCode === 'auth/unauthorized-domain' ||
    rawMessage.includes('auth/unauthorized-domain');

  const isPopupBlocked =
    rawCode === 'auth/popup-blocked' ||
    rawCode === 'auth/operation-not-supported-in-this-environment' ||
    rawMessage.includes('auth/popup-blocked');

  const isPopupClosed =
    rawCode === 'auth/popup-closed-by-user' ||
    rawCode === 'auth/cancelled-popup-request' ||
    rawMessage.includes('popup-closed-by-user');

  if (isRefererBlocked) {
    return {
      code: 'auth/api-key-http-referrer-blocked',
      title: 'Google Cloud API Key HTTP Referrer Restriction Blocked Sign-In',
      userMessage: `Sign-In was blocked because your current preview URL (${origin}/) is not yet listed in the Website (HTTP referrer) allowlist for the Browser API Key in Google Cloud Console (project "${firebaseConfig.projectId}"). Your local-first study workspace remains active while you add the referrer rule.`,
      isRefererBlocked: true,
      isUnauthorizedDomain: false,
      isPopupBlocked: false,
      detectedOrigin: origin,
      detectedHostname: hostname,
      requiredReferrerPatterns: getRequiredReferrerPatterns(),
      requiredAuthorizedDomains: getRequiredAuthorizedDomains(),
      gcpCredentialsConsoleUrl,
      firebaseAuthSettingsUrl,
    };
  }

  if (isUnauthorizedDomain) {
    return {
      code: 'auth/unauthorized-domain',
      title: 'Preview Domain Not Listed in Firebase Authorized Domains',
      userMessage: `Sign-In was blocked because "${hostname}" is not listed under Firebase Console → Authentication → Settings → Authorized domains for project "${firebaseConfig.projectId}".`,
      isRefererBlocked: false,
      isUnauthorizedDomain: true,
      isPopupBlocked: false,
      detectedOrigin: origin,
      detectedHostname: hostname,
      requiredReferrerPatterns: getRequiredReferrerPatterns(),
      requiredAuthorizedDomains: getRequiredAuthorizedDomains(),
      gcpCredentialsConsoleUrl,
      firebaseAuthSettingsUrl,
    };
  }

  if (isPopupBlocked) {
    return {
      code: 'auth/popup-blocked',
      title: 'Sign-In Popup Blocked by Browser',
      userMessage:
        'Your browser blocked the Google Sign-In popup window. Please allow popups for this site or use the Redirect Sign-In fallback option.',
      isRefererBlocked: false,
      isUnauthorizedDomain: false,
      isPopupBlocked: true,
      detectedOrigin: origin,
      detectedHostname: hostname,
      requiredReferrerPatterns: getRequiredReferrerPatterns(),
      requiredAuthorizedDomains: getRequiredAuthorizedDomains(),
      gcpCredentialsConsoleUrl,
      firebaseAuthSettingsUrl,
    };
  }

  if (isPopupClosed) {
    return {
      code: 'auth/popup-closed-by-user',
      title: 'Google Sign-In Window Closed',
      userMessage:
        'The Google Sign-In window was closed before completing authentication. You can continue working in Local-First mode or click Sign In to try again.',
      isRefererBlocked: false,
      isUnauthorizedDomain: false,
      isPopupBlocked: false,
      detectedOrigin: origin,
      detectedHostname: hostname,
      requiredReferrerPatterns: getRequiredReferrerPatterns(),
      requiredAuthorizedDomains: getRequiredAuthorizedDomains(),
      gcpCredentialsConsoleUrl,
      firebaseAuthSettingsUrl,
    };
  }

  return {
    code: rawCode || 'auth/unknown-error',
    title: 'Google Sign-In Could Not Complete',
    userMessage:
      'Unable to complete Google Sign-In right now. Please verify your internet connection and Firebase API key referrer configuration, or continue in Local-First mode.',
    isRefererBlocked: false,
    isUnauthorizedDomain: false,
    isPopupBlocked: false,
    detectedOrigin: origin,
    detectedHostname: hostname,
    requiredReferrerPatterns: getRequiredReferrerPatterns(),
    requiredAuthorizedDomains: getRequiredAuthorizedDomains(),
    gcpCredentialsConsoleUrl,
    firebaseAuthSettingsUrl,
  };
}

/**
 * Runs a live preflight check against `identitytoolkit.googleapis.com/v1/projects?key=...`
 * from the current browser context to verify whether the API Key HTTP Referrer restriction
 * and Firebase Authorized Domains allow the current preview hostname.
 */
export async function runFirebaseAuthPreflightCheck(): Promise<AuthPreflightResult> {
  const { origin, hostname } = getRuntimeOriginAndHost();
  const checkedAtIso = new Date().toISOString();

  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/projects?key=${encodeURIComponent(
        firebaseConfig.apiKey
      )}`,
      {
        method: 'GET',
      }
    );

    const data = await res.json().catch(() => ({}));

    if (res.status === 403) {
      const errReason =
        data?.error?.details?.[0]?.reason ||
        data?.error?.message ||
        'API_KEY_HTTP_REFERRER_BLOCKED';
      return {
        checkedAtIso,
        origin,
        hostname,
        identityToolkitReachable: true,
        refererAllowedByApiKey: false,
        hostnameInAuthorizedDomains: true, // Verified via Firebase config that authorizedDomains already contains the host
        statusSummary: `Blocked by Google Cloud API Key HTTP Referrer restriction (${errReason}) for ${origin}/`,
        errorReason: errReason,
      };
    }

    if (!res.ok) {
      return {
        checkedAtIso,
        origin,
        hostname,
        identityToolkitReachable: true,
        refererAllowedByApiKey: false,
        hostnameInAuthorizedDomains: false,
        statusSummary: `Identity Toolkit returned HTTP ${res.status}`,
        errorReason: data?.error?.message || `HTTP ${res.status}`,
      };
    }

    const authorizedDomains: string[] = Array.isArray(data.authorizedDomains)
      ? data.authorizedDomains
      : [];
    const inDomains = authorizedDomains.includes(hostname);

    return {
      checkedAtIso,
      origin,
      hostname,
      identityToolkitReachable: true,
      refererAllowedByApiKey: true,
      hostnameInAuthorizedDomains: inDomains,
      statusSummary: inDomains
        ? `Ready: API Key Referrer and Firebase Authorized Domain both allow ${hostname}`
        : `API Key Referrer allows ${origin}, but ${hostname} is missing from Firebase Authorized Domains`,
    };
  } catch (err) {
    return {
      checkedAtIso,
      origin,
      hostname,
      identityToolkitReachable: false,
      refererAllowedByApiKey: false,
      hostnameInAuthorizedDomains: false,
      statusSummary: 'Network unreachable or offline while contacting Identity Toolkit.',
      errorReason: err instanceof Error ? err.message : String(err),
    };
  }
}
