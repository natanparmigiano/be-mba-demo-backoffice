import { useTranslation } from 'react-i18next'
import { ChatShowcase } from '../chat'
import { SectionCard, SectionHeading } from '../ui'

export function ChatSection() {
  const { t } = useTranslation()

  return (
    <section id="chat" className="scroll-mt-24 pt-10 pb-16">
      <SectionHeading
        eyebrow={t('design.communication')}
        title={t('design.chatTitle')}
        description={t('design.chatDescription')}
      />
      <SectionCard
        title={t('design.messageRenderer')}
        description={t('design.messageRendererDescription')}
        className="mx-auto max-w-3xl"
      >
        <ChatShowcase />
      </SectionCard>
    </section>
  )
}
