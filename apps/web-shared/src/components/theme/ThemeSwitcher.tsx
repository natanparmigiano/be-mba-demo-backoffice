import { Monitor, Moon, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@mba-desk/ui'

export function ThemeSwitcher() {
  const { t } = useTranslation()
  const { theme, setTheme } = useTheme()
  const Icon = theme === 'system' ? Monitor : theme === 'dark' ? Moon : Sun

  return (
    <label
      className="relative grid size-9 cursor-pointer place-items-center rounded-full border bg-card text-muted-foreground transition hover:bg-muted hover:text-foreground focus-within:ring-3 focus-within:ring-ring/20"
      title={t('common.theme')}
    >
      <Icon className="pointer-events-none size-4" aria-hidden />
      <span className="sr-only">{t('common.theme')}</span>
      <select
        className="absolute inset-0 cursor-pointer opacity-0"
        value={theme}
        onChange={(event) => {
          const value = event.target.value
          setTheme(value === 'light' || value === 'dark' ? value : 'system')
        }}
        aria-label={t('common.theme')}
      >
        <option value="system">{t('common.systemTheme')}</option>
        <option value="light">{t('common.lightTheme')}</option>
        <option value="dark">{t('common.darkTheme')}</option>
      </select>
    </label>
  )
}
