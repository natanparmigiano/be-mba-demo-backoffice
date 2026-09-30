import { useTranslation } from 'react-i18next'
import { LANGUAGE_OVERRIDE_STORAGE_KEY } from '../i18n'

const languages = ['en', 'pt', 'es'] as const

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation()
  const currentLanguage = (i18n.resolvedLanguage ?? i18n.language).split('-')[0]
  const selectedLanguage = languages.includes(
    currentLanguage as (typeof languages)[number],
  )
    ? (currentLanguage as (typeof languages)[number])
    : 'en'

  const selectLanguage = (language: string) => {
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
        value={selectedLanguage}
        onChange={(event) => selectLanguage(event.target.value)}
        aria-label={t('common.language')}
      >
        <option value="en">{t('common.english')}</option>
        <option value="pt">{t('common.portuguese')}</option>
        <option value="es">{t('common.spanish')}</option>
      </select>
      <span
        className="inline-flex size-10 items-center justify-center rounded-full border bg-card text-xs font-bold uppercase text-foreground shadow-sm transition peer-hover:bg-muted peer-focus-visible:ring-3 peer-focus-visible:ring-ring/20"
        aria-hidden
      >
        {selectedLanguage}
      </span>
    </label>
  )
}
