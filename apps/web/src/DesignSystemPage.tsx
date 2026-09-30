import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ButtonsSection,
  ChatSection,
  DataDisplaySection,
  DesignSystemHeader,
  DesignSystemSidebar,
  FeedbackSection,
  FormsSection,
  FoundationsSection,
  HeroSection,
  NavigationSection,
  designSystemSections,
  type DesignSystemSectionId,
} from './components/design-system'

export function DesignSystemPage() {
  const { t } = useTranslation()
  const [activeSection, setActiveSection] =
    useState<DesignSystemSectionId>('foundations')

  useEffect(() => {
    document.title = `${t('design.system')} · ${t('design.brand')}`
    document
      .querySelector<HTMLMetaElement>('meta[name="description"]')
      ?.setAttribute('content', t('design.metaDescription'))
  }, [t])

  useEffect(() => {
    const sections = designSystemSections
      .map(({ id }) => document.getElementById(id))
      .filter((section): section is HTMLElement => Boolean(section))
    const observer = new IntersectionObserver(
      (entries) => {
        const visibleSection = entries.find((entry) => entry.isIntersecting)
        if (visibleSection) {
          setActiveSection(visibleSection.target.id as DesignSystemSectionId)
        }
      },
      { rootMargin: '-18% 0px -70% 0px' },
    )

    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [])

  return (
    <div className="min-h-screen bg-background text-foreground">
      <DesignSystemHeader />
      <div className="relative mx-auto max-w-400">
        <DesignSystemSidebar activeSection={activeSection} />
        <main className="min-w-0 px-4 py-8 sm:px-6 lg:px-10 lg:py-10 xl:ml-55">
          <HeroSection />
          <FoundationsSection />
          <ButtonsSection />
          <FormsSection />
          <NavigationSection />
          <DataDisplaySection />
          <FeedbackSection />
          <ChatSection />
        </main>
      </div>
    </div>
  )
}
