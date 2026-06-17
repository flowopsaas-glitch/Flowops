import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// ── App namespace (existing, English only) ────────────────────────────────
import en from './locales/en.json';

// ── Driver namespace translations (en / af / zu / xh) ────────────────────
import driverEn from './locales/driver/en.json';
import driverAf from './locales/driver/af.json';
import driverZu from './locales/driver/zu.json';
import driverXh from './locales/driver/xh.json';

const DRIVER_LANG_KEY = 'flowops.driver.language';

/** Persist the driver's language choice across sessions. */
export function getDriverLanguage(): string {
  try {
    return localStorage.getItem(DRIVER_LANG_KEY) ?? 'en';
  } catch {
    return 'en';
  }
}

export function setDriverLanguage(lang: string) {
  try {
    localStorage.setItem(DRIVER_LANG_KEY, lang);
  } catch {
    /* ignore quota */
  }
  i18n.changeLanguage(lang);
}

export const DRIVER_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'af', label: 'Afrikaans' },
  { code: 'zu', label: 'isiZulu' },
  { code: 'xh', label: 'isiXhosa' },
];

i18n.use(initReactI18next).init({
  resources: {
    en: {
      translation: en,
      driver: driverEn,
    },
    af: {
      translation: en,   // app strings fall back to English
      driver: driverAf,
    },
    zu: {
      translation: en,
      driver: driverZu,
    },
    xh: {
      translation: en,
      driver: driverXh,
    },
  },
  // Use the driver's persisted preference so the app loads in the right language instantly.
  lng: getDriverLanguage(),
  fallbackLng: 'en',
  // Default namespace is 'translation' (existing app strings). Driver pages use 'driver'.
  defaultNS: 'translation',
  ns: ['translation', 'driver'],
  interpolation: { escapeValue: false },
});

export default i18n;
