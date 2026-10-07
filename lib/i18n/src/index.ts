import 'i18next'
import { ar } from './locales/ar'
import { de } from './locales/de'
import { en } from './locales/en'
import { es } from './locales/es'
import { fr } from './locales/fr'
import { hi } from './locales/hi'
import { id } from './locales/id'
import { it } from './locales/it'
import { ja } from './locales/ja'
import { ko } from './locales/ko'
import { pt } from './locales/pt'
import { ru } from './locales/ru'
import { th } from './locales/th'
import { vi } from './locales/vi'
import { zhTW } from './locales/zh-TW'
import { zh } from './locales/zh'

export const LANGUAGE_OVERRIDE_STORAGE_KEY = 'mba-language-override'
export const defaultNS = 'translation'

export const resources = {
  en: { translation: en },
  pt: { translation: pt },
  es: { translation: es },
  fr: { translation: fr },
  zh: { translation: zh },
  ar: { translation: ar },
  de: { translation: de },
  hi: { translation: hi },
  id: { translation: id },
  it: { translation: it },
  ja: { translation: ja },
  ko: { translation: ko },
  ru: { translation: ru },
  th: { translation: th },
  vi: { translation: vi },
  'zh-TW': { translation: zhTW },
} as const

export const supportedLanguages = Object.keys(
  resources,
) as Array<keyof typeof resources>

export const languageDefinitions = [
  { code: 'en', badge: 'EN', flag: '🇺🇸', labelKey: 'common.english' },
  { code: 'pt', badge: 'PT', flag: '🇧🇷', labelKey: 'common.portuguese' },
  { code: 'es', badge: 'ES', flag: '🇪🇸', labelKey: 'common.spanish' },
  { code: 'fr', badge: 'FR', flag: '🇫🇷', labelKey: 'common.french' },
  { code: 'zh', badge: 'CN', flag: '🇨🇳', labelKey: 'common.chinese' },
  { code: 'ar-AR', badge: 'AR', flag: '🇸🇦', labelKey: 'common.arabic' },
  { code: 'de-DE', badge: 'DE', flag: '🇩🇪', labelKey: 'common.german' },
  { code: 'hi-IN', badge: 'HI', flag: '🇮🇳', labelKey: 'common.hindi' },
  { code: 'id-ID', badge: 'ID', flag: '🇮🇩', labelKey: 'common.indonesian' },
  { code: 'it-IT', badge: 'IT', flag: '🇮🇹', labelKey: 'common.italian' },
  { code: 'ja-JP', badge: 'JA', flag: '🇯🇵', labelKey: 'common.japanese' },
  { code: 'ko-KR', badge: 'KO', flag: '🇰🇷', labelKey: 'common.korean' },
  { code: 'ru-RU', badge: 'RU', flag: '🇷🇺', labelKey: 'common.russian' },
  { code: 'th-TH', badge: 'TH', flag: '🇹🇭', labelKey: 'common.thai' },
  { code: 'vi-VN', badge: 'VI', flag: '🇻🇳', labelKey: 'common.vietnamese' },
  {
    code: 'zh-TW',
    badge: 'TW',
    flag: '🇹🇼',
    labelKey: 'common.traditionalChinese',
  },
] as const

export type LanguageCode = (typeof languageDefinitions)[number]['code']
export type LanguageDefinition = (typeof languageDefinitions)[number]

export function normalizeLanguage(language: string): string {
  return language.replace('_', '-')
}

export function isRtlLanguage(language: string): boolean {
  return normalizeLanguage(language).split('-')[0] === 'ar'
}

export function resolveLanguageDefinition(
  language: string,
): LanguageDefinition {
  const normalizedLanguage = normalizeLanguage(language)
  return (
    languageDefinitions.find(({ code }) => code === normalizedLanguage) ??
    languageDefinitions.find(
      ({ code }) => code.split('-')[0] === normalizedLanguage.split('-')[0],
    ) ??
    languageDefinitions[0]
  )
}

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: typeof defaultNS
    resources: (typeof resources)['en']['translation']
    returnNull: false
  }
}
