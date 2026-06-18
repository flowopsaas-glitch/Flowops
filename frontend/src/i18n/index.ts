import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import af from './locales/af.json';
import zu from './locales/zu.json';
import xh from './locales/xh.json';

const STORAGE_KEY = 'flowops.driver_lang';

function getSavedLang(): string {
  try { return localStorage.getItem(STORAGE_KEY) ?? 'en'; } catch { return 'en'; }
}

export function setDriverLanguage(lang: string) {
  try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* ignore */ }
  void i18n.changeLanguage(lang);
}

export const DRIVER_LANGUAGES: { code: string; label: string; native: string }[] = [
  { code: 'en', label: 'English',    native: 'English'   },
  { code: 'af', label: 'Afrikaans',  native: 'Afrikaans' },
  { code: 'zu', label: 'Zulu',       native: 'isiZulu'   },
  { code: 'xh', label: 'Xhosa',      native: 'isiXhosa'  },
];

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en, driver: en.driver },
    af: { translation: en, driver: af.driver }, // fallback general strings to English
    zu: { translation: en, driver: zu.driver },
    xh: { translation: en, driver: xh.driver },
  },
  lng: getSavedLang(),
  fallbackLng: 'en',
  ns: ['translation', 'driver'],
  defaultNS: 'translation',
  interpolation: { escapeValue: false },
});

export default i18n;
