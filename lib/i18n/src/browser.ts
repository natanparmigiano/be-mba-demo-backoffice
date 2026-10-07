import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import {
  defaultNS,
  isRtlLanguage,
  LANGUAGE_OVERRIDE_STORAGE_KEY,
  normalizeLanguage,
  resources,
  supportedLanguages,
} from './index'

if (!i18n.isInitialized) {
  void i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources,
      defaultNS,
      supportedLngs: supportedLanguages,
      fallbackLng: 'en',
      load: 'all',
      interpolation: { escapeValue: false },
      returnNull: false,
      detection: {
        order: ['localStorage', 'navigator'],
        caches: [],
        lookupLocalStorage: LANGUAGE_OVERRIDE_STORAGE_KEY,
      },
      react: { useSuspense: false },
    })
}

const updateDocumentLanguage = (language: string) => {
  if (typeof document === 'undefined') return
  const normalizedLanguage = normalizeLanguage(language)
  document.documentElement.lang = normalizedLanguage
  document.documentElement.dir = isRtlLanguage(normalizedLanguage)
    ? 'rtl'
    : 'ltr'
}

updateDocumentLanguage(i18n.resolvedLanguage ?? i18n.language ?? 'en')
i18n.on('languageChanged', updateDocumentLanguage)

export default i18n
