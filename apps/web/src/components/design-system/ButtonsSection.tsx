import {
  ArrowDownToLine,
  MoreHorizontal,
  Plus,
  Settings,
  Trash2,
  UserPlus,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button, SectionCard, SectionHeading } from '../ui'

export function ButtonsSection() {
  const { t } = useTranslation()

  return (
    <section id="buttons" className="scroll-mt-24 pt-10">
      <SectionHeading
        eyebrow={t('design.actionsEyebrow')}
        title={t('design.buttonsTitle')}
        description={t('design.buttonsDescription')}
      />
      <SectionCard
        title={t('design.variants')}
        description={t('design.variantsDescription')}
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button>
            <Plus className="size-4" />
            {t('design.createRecord')}
          </Button>
          <Button variant="secondary">
            <UserPlus className="size-4" />
            {t('design.invite')}
          </Button>
          <Button variant="outline">
            <ArrowDownToLine className="size-4" />
            {t('design.export')}
          </Button>
          <Button variant="ghost">
            <MoreHorizontal className="size-4" />
            {t('design.more')}
          </Button>
          <Button variant="success">{t('design.success')}</Button>
          <Button variant="danger">
            <Trash2 className="size-4" />
            {t('design.delete')}
          </Button>
          <Button disabled>{t('design.disabled')}</Button>
          <Button variant="outline" isLoading>
            {t('design.saving')}
          </Button>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3 border-t pt-6">
          <Button size="sm">{t('design.small')}</Button>
          <Button size="md">{t('design.medium')}</Button>
          <Button size="lg">{t('design.largeAction')}</Button>
          <Button size="icon" aria-label={t('design.settings')}>
            <Settings className="size-5" />
          </Button>
        </div>
        <div className="mt-6 border-t pt-6">
          <p className="mb-3 text-xs font-semibold text-muted-foreground">
            {t('design.fullWidthSecondary')}
          </p>
          <Button variant="secondary" className="w-full">
            {t('design.updateProfile')}
          </Button>
        </div>
      </SectionCard>
    </section>
  )
}
