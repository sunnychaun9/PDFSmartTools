/**
 * Internationalization (i18n) Infrastructure
 *
 * Provides localization support using react-native-localize for device locale detection.
 * Translation files are loaded from ./translations/.
 *
 * Supported languages:
 * - en: English (default)
 * - hi: Hindi
 * - pt: Portuguese
 * - es: Spanish
 * - id: Indonesian
 * - de: German
 *
 * TODO: Install dependency:
 *   npm install react-native-localize
 */

import { I18nManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createTaggedLogger } from '../logging/logger';

const log = createTaggedLogger('i18n');

const STORAGE_KEY = '@app_language';

export type SupportedLanguage = 'en' | 'hi' | 'pt' | 'es' | 'id' | 'de';

export const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  en: 'English',
  hi: 'हिन्दी',
  pt: 'Português',
  es: 'Español',
  id: 'Bahasa Indonesia',
  de: 'Deutsch',
};

// Translation files (lazy loaded)
const translations: Record<SupportedLanguage, () => Record<string, string>> = {
  en: () => require('./translations/en.json'),
  hi: () => require('./translations/hi.json'),
  pt: () => require('./translations/pt.json'),
  es: () => require('./translations/es.json'),
  id: () => require('./translations/id.json'),
  de: () => require('./translations/de.json'),
};

let currentLanguage: SupportedLanguage = 'en';
let currentTranslations: Record<string, string> = {};
let isInitialized = false;

/**
 * Detect device language and match to supported languages
 */
function detectDeviceLanguage(): SupportedLanguage {
  try {
    const localize = require('react-native-localize');
    const locales = localize.getLocales();
    if (locales && locales.length > 0) {
      const deviceLang = locales[0].languageCode as string;
      if (deviceLang in translations) {
        return deviceLang as SupportedLanguage;
      }
    }
  } catch {
    // react-native-localize not installed yet
  }
  return 'en';
}

/**
 * Initialize i18n system.
 * Loads user preference or detects device language.
 */
export async function initializeI18n(): Promise<void> {
  if (isInitialized) return;

  try {
    // Check for user language preference
    const savedLang = await AsyncStorage.getItem(STORAGE_KEY);
    if (savedLang && savedLang in translations) {
      currentLanguage = savedLang as SupportedLanguage;
    } else {
      currentLanguage = detectDeviceLanguage();
    }

    // Load translations
    currentTranslations = translations[currentLanguage]();
    isInitialized = true;
    log.info(`Initialized with language: ${currentLanguage}`);
  } catch (error) {
    currentLanguage = 'en';
    currentTranslations = translations.en();
    isInitialized = true;
    log.warn('Failed to initialize i18n, defaulting to English');
  }
}

/**
 * Translate a key to the current language.
 * Falls back to English if key not found in current language.
 * Falls back to the key itself if not found in English either.
 */
export function t(key: string, params?: Record<string, string | number>): string {
  let text = currentTranslations[key];

  // Fallback to English
  if (!text && currentLanguage !== 'en') {
    try {
      const enTranslations = translations.en();
      text = enTranslations[key];
    } catch {}
  }

  // Fallback to key itself
  if (!text) return key;

  // Replace parameters: {{name}} → value
  if (params) {
    Object.entries(params).forEach(([param, value]) => {
      text = text.replace(new RegExp(`\\{\\{${param}\\}\\}`, 'g'), String(value));
    });
  }

  return text;
}

/**
 * Get current language
 */
export function getCurrentLanguage(): SupportedLanguage {
  return currentLanguage;
}

/**
 * Set language and persist preference
 */
export async function setLanguage(lang: SupportedLanguage): Promise<void> {
  if (!(lang in translations)) {
    log.warn(`Unsupported language: ${lang}`);
    return;
  }

  currentLanguage = lang;
  currentTranslations = translations[lang]();
  await AsyncStorage.setItem(STORAGE_KEY, lang);
  log.info(`Language changed to: ${lang}`);
}

/**
 * Get list of available languages
 */
export function getAvailableLanguages(): Array<{ code: SupportedLanguage; name: string }> {
  return Object.entries(LANGUAGE_NAMES).map(([code, name]) => ({
    code: code as SupportedLanguage,
    name,
  }));
}
