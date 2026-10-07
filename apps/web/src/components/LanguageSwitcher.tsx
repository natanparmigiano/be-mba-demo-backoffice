import { useTranslation } from 'react-i18next'
import { LANGUAGE_OVERRIDE_STORAGE_KEY } from '../i18n'

const languages = [
  { code: 'en', badge: 'EN', flag: '🇺🇸', labelKey: 'common.english' },
  { code: 'pt', badge: 'PT', flag: '🇧🇷', labelKey: 'common.portuguese' },
  { code: 'es', badge: 'ES', flag: '🇪🇸', labelKey: 'common.spanish' },
  { code: 'fr', badge: 'FR', flag: '🇫🇷', labelKey: 'common.french' },
  { code: 'zh', badge: 'CN', flag: '🇨🇳', labelKey: 'common.chinese' },
] as const

type LanguageCode = (typeof languages)[number]['code']

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation()
  const currentLanguage = (i18n.resolvedLanguage ?? i18n.language).split('-')[0]
  const selectedLanguage =
    languages.find(({ code }) => code === currentLanguage) ?? languages[0]

  const selectLanguage = (language: LanguageCode) => {
    try {
      localStorage.setItem(LANGUAGE_OVERRIDE_STORAGE_KEY, language)
    } catch {
      // The selection still applies for this session when storage is blocked.
    }

    void i18n.changeLanguage(language)
  }

  return (
    <label
      className="relative inline-flex items-center"
      title={t('common.language')}
    >
      <span className="sr-only">{t('common.language')}</span>
      <select
        className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
        value={selectedLanguage.code}
        onChange={(event) => selectLanguage(event.target.value as LanguageCode)}
        aria-label={t('common.language')}
      >
        {languages.map(({ code, flag, labelKey }) => (
          <option key={code} value={code}>
            {flag} {t(labelKey)}
          </option>
        ))}
      </select>
      <span
        className="inline-flex size-10 items-center justify-center rounded-full border bg-card text-xs font-bold uppercase text-foreground shadow-sm transition peer-hover:bg-muted peer-focus-visible:ring-3 peer-focus-visible:ring-ring/20"
        aria-hidden
      >
        <span className="text-base leading-none">{selectedLanguage.flag}</span>
        <span className="sr-only">{selectedLanguage.badge}</span>
      </span>
    </label>
  )
}
