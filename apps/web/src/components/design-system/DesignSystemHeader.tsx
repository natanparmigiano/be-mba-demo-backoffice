import { Bell } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import signifierUrl from '../../assets/signifier.png'
import { LanguageSwitcher } from '../LanguageSwitcher'
import { ThemeSwitcher } from '../theme/ThemeSwitcher'
import { Avatar, Button, SearchBox, Toast, useTimedToast } from '../ui'
import { designSystemSections } from './sections'

export function DesignSystemHeader() {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const { message, showToast, dismissToast } = useTimedToast()

  const searchComponents = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return

    const match = designSystemSections.find(
      (section) =>
        String(t(section.translationKey))
          .toLowerCase()
          .includes(normalizedQuery) ||
        section.searchAliases.includes(normalizedQuery),
    )

    if (match) {
      document.getElementById(match.id)?.scrollIntoView({ behavior: 'smooth' })
      return
    }

    showToast({
      title: t('design.noComponent'),
      description: t('design.noComponentDescription', { query: query.trim() }),
    })
  }

  return (
    <>
      <header className="sticky top-0 z-30 border-b bg-topbar backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-400 items-center gap-3 px-4 sm:px-6 lg:px-8">
          <a
            className="flex min-w-0 items-center gap-3"
            href="/design-system"
            aria-label={t('design.brand')}
          >
            <img
              className="size-9 shrink-0 rounded-xl object-cover"
              src={signifierUrl}
              alt=""
            />
            <span className="hidden min-w-0 sm:block">
              <span className="block truncate text-sm font-bold">
                {t('design.brand')}
              </span>
              <span className="block text-[11px] text-muted-foreground">
                {t('design.system')}
              </span>
            </span>
          </a>

          <form
            className="ml-auto hidden w-full max-w-sm md:block"
            onSubmit={searchComponents}
            role="search"
          >
            <SearchBox
              placeholder={t('design.searchComponents')}
              aria-label={t('design.searchComponents')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </form>

          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <LanguageSwitcher />
            <ThemeSwitcher />
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('design.notifications')}
            onClick={() =>
              showToast({
                title: t('design.caughtUp'),
                description: t('design.noNotifications'),
              })
            }
          >
            <span className="relative">
              <Bell className="size-5" />
              <span className="absolute -top-1 -right-1 size-2 rounded-full bg-destructive ring-2 ring-card" />
            </span>
          </Button>
          <Avatar name={t('design.demoAccountName')} status="online" />
        </div>
      </header>

      <Toast
        message={message}
        onDismiss={dismissToast}
        dismissLabel={t('design.dismissNotification')}
      />
    </>
  )
}
