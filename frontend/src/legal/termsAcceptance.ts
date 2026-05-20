import {
  FLOWOPS_TERMS_EFFECTIVE_ISO,
  FLOWOPS_TERMS_VERSION,
} from './termsMeta';

const STORAGE_VERSION_KEY = 'flowops_terms_version';
const STORAGE_AT_KEY = 'flowops_terms_accepted_at';

export function hasAcceptedCurrentTerms(): boolean {
  try {
    return localStorage.getItem(STORAGE_VERSION_KEY) === FLOWOPS_TERMS_VERSION;
  } catch {
    return false;
  }
}

export function getStoredTermsAcceptance(): {
  version: string | null;
  at: string | null;
} {
  try {
    return {
      version: localStorage.getItem(STORAGE_VERSION_KEY),
      at: localStorage.getItem(STORAGE_AT_KEY),
    };
  } catch {
    return { version: null, at: null };
  }
}

export function persistTermsAcceptanceRemotePayload() {
  return {
    acceptedTermsVersion: FLOWOPS_TERMS_VERSION,
    acceptedTermsAt: new Date().toISOString(),
  };
}

export function persistTermsAcceptanceLocally() {
  try {
    localStorage.setItem(STORAGE_VERSION_KEY, FLOWOPS_TERMS_VERSION);
    localStorage.setItem(STORAGE_AT_KEY, new Date().toISOString());
  } catch {
    // ignore quota / private mode
  }
}

export function termsSummaryLine() {
  return `Version ${FLOWOPS_TERMS_VERSION} (effective ${FLOWOPS_TERMS_EFFECTIVE_ISO})`;
}
