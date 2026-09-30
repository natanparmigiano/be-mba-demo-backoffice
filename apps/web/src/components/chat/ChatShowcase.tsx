import {
  Check,
  Image,
  Info,
  MoreHorizontal,
  Paperclip,
  Send,
  Smile,
} from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Avatar, Button } from '../ui'
import { createInitialMessages } from './fixtures'
import { MessageRow, MessageStatusIndicator } from './MessageRenderer'
import type { ChatMessage } from './types'

export function ChatShowcase() {
  const { t, i18n } = useTranslation()
  const [sentMessages, setSentMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [lastAction, setLastAction] = useState<string | null>(null)

  const sendMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const text = chatInput.trim()
    if (!text) return

    setSentMessages((current) => [
      ...current,
      {
        id: `text-${Date.now()}`,
        type: 'text',
        direction: 'outgoing',
        sentAt: new Intl.DateTimeFormat(
          i18n.resolvedLanguage ?? i18n.language,
          {
            hour: '2-digit',
            minute: '2-digit',
          },
        ).format(new Date()),
        status: 'undelivered',
        text,
      },
    ])
    setChatInput('')
  }

  const messages = [...createInitialMessages(t), ...sentMessages]

  return (
    <div className="flex h-[clamp(36rem,calc(100dvh-8rem),52rem)] min-h-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex shrink-0 items-center gap-3 border-b px-4 py-3">
        <Avatar name="Maya Chen" status="online" size="lg" />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">Maya Chen</p>
          <p className="text-xs text-success">{t('chat.activeNow')}</p>
        </div>
        <div className="ml-auto flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-9 text-primary"
            aria-label={t('chat.conversationDetails')}
          >
            <Info className="size-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-9"
            aria-label={t('chat.conversationMenu')}
          >
            <MoreHorizontal className="size-5" />
          </Button>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b bg-muted/45 px-4 py-2.5 text-[11px] text-muted-foreground">
        <span className="font-semibold text-foreground">
          {t('chat.messageStatus')}
        </span>
        <MessageStatusIndicator status="undelivered" label />
        <MessageStatusIndicator status="delivered" label />
        <MessageStatusIndicator status="read" label />
      </div>

      {lastAction && (
        <div
          className="flex shrink-0 items-center gap-2 border-b bg-primary/8 px-4 py-2 text-xs text-primary"
          role="status"
        >
          <Check className="size-3.5" />
          {lastAction}
          <button
            className="ml-auto cursor-pointer"
            onClick={() => setLastAction(null)}
            aria-label={t('chat.dismissAction')}
          >
            ×
          </button>
        </div>
      )}

      <div
        className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto bg-background/55 px-3 py-5 sm:px-5"
        aria-live="polite"
      >
        <div className="grid w-full shrink-0 gap-4">
          <div className="mb-2 grid place-items-center text-center">
            <Avatar name="Maya Chen" size="xl" />
            <p className="mt-2 text-sm font-bold">Maya Chen</p>
            <p className="text-xs text-muted-foreground">
              {t('chat.productTeam')}
            </p>
          </div>
          {messages.map((message) => (
            <MessageRow
              key={message.id}
              message={message}
              onAction={(action) => setLastAction(action)}
            />
          ))}
        </div>
      </div>

      <form
        className="flex shrink-0 items-center gap-2 border-t p-3"
        onSubmit={sendMessage}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9 shrink-0 text-primary"
          aria-label={t('chat.attachFile')}
        >
          <Paperclip className="size-5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="hidden size-9 shrink-0 text-primary sm:inline-flex"
          aria-label={t('chat.attachImage')}
        >
          <Image className="size-5" />
        </Button>
        <div className="relative min-w-0 flex-1">
          <input
            className="h-10 w-full rounded-full bg-muted pr-10 pl-4 text-sm outline-none focus:ring-3 focus:ring-ring/20"
            value={chatInput}
            onChange={(event) => setChatInput(event.target.value)}
            placeholder={t('chat.messagePlaceholder')}
            aria-label={t('chat.message')}
          />
          <Smile className="pointer-events-none absolute top-1/2 right-3 size-5 -translate-y-1/2 text-primary" />
        </div>
        <Button
          size="icon"
          className="size-9 shrink-0"
          aria-label={t('chat.sendMessage')}
          disabled={!chatInput.trim()}
        >
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  )
}
