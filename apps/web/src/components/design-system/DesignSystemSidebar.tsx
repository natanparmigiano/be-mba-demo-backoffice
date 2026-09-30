import { Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../ui'
import { designSystemSections, type DesignSystemSectionId } from './sections'

export function DesignSystemSidebar({
  activeSection,
}: {
  activeSection: DesignSystemSectionId
}) {
  const { t } = useTranslation()

  return (
    <div className="absolute inset-y-0 left-0 hidden w-55 border-r xl:block">
      <aside className="sticky top-16 h-[calc(100dvh-4rem)] px-4 py-7">
        <p className="px-3 text-[11px] font-bold tracking-[0.12em] text-muted-foreground uppercase">
          {t('design.components')}
        </p>
        <nav className="mt-3 grid gap-1" aria-label={t('design.components')}>
          {designSystemSections.map((section) => (
            <a
              key={section.id}
              className={cn(
                'rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-muted hover:text-foreground',
                activeSection === section.id
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground',
              )}
              href={`#${section.id}`}
            >
              {t(section.translationKey)}
            </a>
          ))}
        </nav>

        <div className="absolute right-4 bottom-6 left-4 rounded-xl bg-muted p-4">
          <Sparkles className="size-5 text-primary" />
          <p className="mt-3 text-sm font-semibold">
            {t('design.consistencyTitle')}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {t('design.consistencyText')}
          </p>
        </div>
      </aside>
    </div>
  )
}
