import { Settings, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pagination, Pill, SectionCard, SectionHeading, Tabs } from '../ui'

const tabValues = ['overview', 'activity', 'members', 'settings'] as const
type TabValue = (typeof tabValues)[number]

export function NavigationSection() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<TabValue>('overview')
  const [currentPage, setCurrentPage] = useState(1)

  return (
    <section id="navigation" className="scroll-mt-24 pt-10">
      <SectionHeading
        eyebrow={t('design.navigationEyebrow')}
        title={t('design.navigationTitle')}
        description={t('design.navigationDescription')}
      />
      <SectionCard title={t('design.navigationPatterns')}>
        <Tabs
          items={tabValues.map((tab) => ({
            value: tab,
            label: t(`design.tabs.${tab}`),
          }))}
          value={activeTab}
          onValueChange={setActiveTab}
          ariaLabel={t('design.navigationPatterns')}
        />
        <Tabs
          className="mt-4"
          items={tabValues.map((tab) => ({
            value: tab,
            label: t(`design.tabs.${tab}`),
            ...(tab === 'settings'
              ? {
                  align: 'end' as const,
                  icon: <Settings className="size-4" aria-hidden />,
                }
              : {}),
          }))}
          value={activeTab}
          variant="pills"
          onValueChange={setActiveTab}
          ariaLabel={t('design.navigationPatterns')}
        />
        <div className="flex min-h-24 items-center justify-center rounded-lg bg-muted/55 p-5 text-center text-sm text-muted-foreground">
          {t('design.showingPanel', { tab: t(`design.tabs.${activeTab}`) })}
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-2 border-t pt-6">
          <Pill>{t('design.pills.default')}</Pill>
          <Pill tone="primary" dot>
            {t('design.pills.review')}
          </Pill>
          <Pill tone="success" dot>
            {t('design.pills.approved')}
          </Pill>
          <Pill tone="warning" dot>
            {t('design.pills.pending')}
          </Pill>
          <Pill tone="danger" dot>
            {t('design.pills.blocked')}
          </Pill>
          <button className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border bg-card px-3 text-xs font-semibold hover:bg-muted">
            {t('design.pills.marketing')} <X className="size-3" />
          </button>
        </div>
        <div className="mt-6 flex items-center justify-between border-t pt-6">
          <p className="text-sm text-muted-foreground">
            {t('design.pageOf', { page: currentPage })}
          </p>
          <Pagination
            page={currentPage}
            pageCount={8}
            onPageChange={setCurrentPage}
            previousLabel={t('design.previousPage')}
            nextLabel={t('design.nextPage')}
            getPageLabel={(page) => t('design.page', { page })}
          />
        </div>
      </SectionCard>
    </section>
  )
}
