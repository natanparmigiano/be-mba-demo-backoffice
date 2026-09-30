import { useTranslation } from 'react-i18next'
import { ColorSwatch, SectionCard, SectionHeading } from '../ui'

export function FoundationsSection() {
  const { t } = useTranslation()

  return (
    <section id="foundations" className="scroll-mt-24 pt-10">
      <SectionHeading
        eyebrow={t('design.foundationsEyebrow')}
        title={t('design.foundationsTitle')}
        description={t('design.foundationsDescription')}
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard
          title={t('design.color')}
          description={t('design.colorDescription')}
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <ColorSwatch
              name={t('design.colors.primary')}
              variable="--primary"
              className="bg-primary"
            />
            <ColorSwatch
              name={t('design.colors.accent')}
              variable="--accent"
              className="bg-accent"
            />
            <ColorSwatch
              name={t('design.colors.success')}
              variable="--success"
              className="bg-success"
            />
            <ColorSwatch
              name={t('design.colors.warning')}
              variable="--warning"
              className="bg-warning"
            />
            <ColorSwatch
              name={t('design.colors.destructive')}
              variable="--destructive"
              className="bg-destructive"
            />
            <ColorSwatch
              name={t('design.colors.muted')}
              variable="--muted"
              className="bg-muted"
            />
          </div>
        </SectionCard>

        <SectionCard
          title={t('design.typography')}
          description={t('design.typographyDescription')}
        >
          <div className="grid gap-5">
            <div>
              <p className="text-3xl font-extrabold tracking-tight">
                {t('design.displayHeading')}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('design.displayMeta')}
              </p>
            </div>
            <div>
              <p className="text-xl font-bold">{t('design.sectionHeading')}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('design.sectionMeta')}
              </p>
            </div>
            <div>
              <p className="text-sm leading-6">{t('design.bodySample')}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('design.bodyMeta')}
              </p>
            </div>
          </div>
        </SectionCard>
      </div>
    </section>
  )
}
