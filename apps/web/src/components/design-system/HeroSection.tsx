import { useTranslation } from 'react-i18next'
import { Pill } from '@mba-desk/ui'

export function HeroSection() {
  const { t } = useTranslation()

  return (
    <section className="relative overflow-hidden rounded-2xl bg-primary px-6 py-8 text-primary-foreground shadow-lg shadow-primary/15 sm:px-10 sm:py-10">
      <div className="absolute -top-20 -right-12 size-64 rounded-full bg-white/10" />
      <div className="absolute -right-4 -bottom-24 size-48 rounded-full border-30 border-white/8" />
      <div className="relative max-w-2xl">
        <Pill className="bg-white/15 text-white" dot>
          {t('design.heroBadge')}
        </Pill>
        <h1 className="mt-5 text-3xl font-extrabold tracking-[-0.035em] sm:text-4xl">
          {t('design.heroTitle')}
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-primary-foreground/80 sm:text-base">
          {t('design.heroDescription')}
        </p>
      </div>
    </section>
  )
}
