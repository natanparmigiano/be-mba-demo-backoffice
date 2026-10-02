import { useTranslation } from 'react-i18next'
import { ChatComposer, ChatShowcase } from '../chat'
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
        <ChatShowcase
          showComposer={false}
          footer={
            <ChatComposer
              addSticker={() =>
                Promise.resolve({
                  id: Date.now(),
                  url: 'data:image/webp;base64,',
                })
              }
              loadStickers={() => Promise.resolve([])}
              loadTemplates={() =>
                Promise.resolve({
                  templates: [
                    {
                      id: 'order-ready-pt-br',
                      name: 'order_ready',
                      language: 'pt_BR',
                      category: 'UTILITY',
                      parameterFormat: 'NAMED',
                      components: [
                        {
                          type: 'HEADER',
                          format: 'TEXT',
                          text: 'Order update',
                        },
                        {
                          type: 'BODY',
                          text: 'Hello {{customer_name}}, order {{order_number}} is ready.',
                          example: {
                            body_text_named_params: [
                              { param_name: 'customer_name', example: 'Maya' },
                              { param_name: 'order_number', example: '1042' },
                            ],
                          },
                        },
                        { type: 'FOOTER', text: 'MBA Support' },
                      ],
                    },
                  ],
                  nextCursor: null,
                })
              }
              resolveSticker={() =>
                Promise.resolve(
                  new File([], 'sticker.webp', { type: 'image/webp' }),
                )
              }
              onSend={() => Promise.resolve()}
            />
          }
          onMessageReaction={() => Promise.resolve()}
        />
      </SectionCard>
    </section>
  )
}
