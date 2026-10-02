import {
  Check,
  Image,
  Info,
  MoreHorizontal,
  Paperclip,
  Send,
  Smile,
} from 'lucide-react'
import {
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
  type Ref,
} from 'react'
import { useTranslation } from 'react-i18next'
import { Avatar, Button, cn } from '../ui'
import { createInitialMessages } from './fixtures'
import { MessageRow, MessageStatusIndicator } from './MessageRenderer'
import type { ChatMessage, ChatTimelineItem, StickerMessage } from './types'

export interface ChatShowcaseProps {
  variant?: 'showcase' | 'workspace'
  contactName?: string
  contactSubtitle?: string
  initialItems?: readonly ChatTimelineItem[]
  headerActions?: ReactNode
  notice?: ReactNode
  footer?: ReactNode
  messagesHeader?: ReactNode
  messagesViewportRef?: Ref<HTMLDivElement>
  composerHeader?: ReactNode
  showProfileIntro?: boolean
  showStatusLegend?: boolean
  showHeaderActions?: boolean
  showComposer?: boolean
  emptyState?: ReactNode
  messagePlaceholder?: string
  onConversationRendered?: () => void
  onMessageReaction?: (
    providerMessageId: string,
    emoji: string,
  ) => Promise<void>
  onSaveSticker?: (message: StickerMessage) => Promise<void>
  className?: string
}

export function ChatShowcase({
  variant = 'showcase',
  contactName,
  contactSubtitle,
  initialItems,
  headerActions,
  notice,
  footer,
  messagesHeader,
  messagesViewportRef,
  composerHeader,
  showProfileIntro = true,
  showStatusLegend = true,
  showHeaderActions = true,
  showComposer = true,
  emptyState,
  messagePlaceholder,
  onConversationRendered,
  onMessageReaction,
  onSaveSticker,
  className,
}: ChatShowcaseProps = {}) {
  const { t, i18n } = useTranslation()
  const [sentMessages, setSentMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [lastAction, setLastAction] = useState<string | null>(null)
  const resolvedContactName = contactName ?? t('chat.contactName')

  useEffect(() => {
    setSentMessages([])
    setChatInput('')
    setLastAction(null)
  }, [contactName])

  useEffect(() => {
    onConversationRendered?.()
  }, [onConversationRendered])

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
        text,
      },
    ])
    setChatInput('')
  }

  const timelineItems: ChatTimelineItem[] = [
    ...(initialItems ?? createInitialMessages(t)),
    ...sentMessages,
  ]

  return (
    <div
      className={cn(
        'flex min-h-0 flex-col overflow-hidden bg-card',
        variant === 'showcase'
          ? 'h-[clamp(36rem,calc(100dvh-8rem),52rem)] rounded-xl border shadow-sm'
          : 'h-full max-h-full',
        className,
      )}
    >
      <div
        ref={messagesViewportRef}
        className={cn(
          'flex shrink-0 items-center gap-3 border-b',
          variant === 'showcase' ? 'px-4 py-3' : 'h-14 px-3',
        )}
      >
        <Avatar
          name={resolvedContactName}
          status={variant === 'showcase' ? 'online' : undefined}
          size={variant === 'showcase' ? 'lg' : 'md'}
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{resolvedContactName}</p>
          <p
            className={cn(
              'truncate text-xs',
              variant === 'showcase' ? 'text-success' : 'text-muted-foreground',
            )}
          >
            {contactSubtitle ?? t('chat.activeNow')}
          </p>
        </div>
        {headerActions ??
          (showHeaderActions && (
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
          ))}
      </div>

      {notice}

      {showStatusLegend && (
        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b bg-muted/45 px-4 py-2.5 text-[11px] text-muted-foreground">
          <span className="font-semibold text-foreground">
            {t('chat.messageStatus')}
          </span>
          <MessageStatusIndicator status="sending" label />
          <MessageStatusIndicator status="error" label />
          <MessageStatusIndicator status="sent" label />
          <MessageStatusIndicator status="delivered" label />
          <MessageStatusIndicator status="read" label />
          <MessageStatusIndicator status="played" label />
        </div>
      )}

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
        className={cn(
          'flex min-h-0 flex-1 flex-col-reverse overflow-y-auto overscroll-contain bg-background/55 px-3 sm:px-5',
          variant === 'showcase' ? 'py-5' : 'py-3',
        )}
        aria-live="polite"
      >
        <div
          className={cn(
            'grid w-full shrink-0',
            variant === 'showcase' ? 'gap-4' : 'gap-3',
          )}
        >
          {showProfileIntro && (
            <div className="mb-2 grid place-items-center text-center">
              <Avatar name={resolvedContactName} size="xl" />
              <p className="mt-2 text-sm font-bold">{resolvedContactName}</p>
              <p className="text-xs text-muted-foreground">
                {t('chat.productTeam')}
              </p>
            </div>
          )}
          {messagesHeader}
          {timelineItems.length === 0
            ? emptyState
            : timelineItems.map((item) =>
                item.type === 'event' ? (
                  <div key={item.id} className="flex justify-center px-4 py-1">
                    <span className="inline-flex max-w-xl items-center gap-2 rounded-full border bg-card/90 px-3 py-1.5 text-center text-[11px] font-medium text-muted-foreground shadow-xs">
                      <span>{item.label}</span>
                      <time className="shrink-0 text-[10px] opacity-75">
                        {item.sentAt}
                      </time>
                    </span>
                  </div>
                ) : (
                  <MessageRow
                    key={item.id}
                    message={item}
                    incomingAvatarName={resolvedContactName}
                    onAction={(action) => setLastAction(action)}
                    onReact={onMessageReaction}
                    onSaveSticker={onSaveSticker}
                  />
                ),
              )}
        </div>
      </div>

      {footer}

      {showComposer && composerHeader}

      {showComposer && (
        <form
          className={cn(
            'flex shrink-0 items-center gap-2 border-t',
            variant === 'showcase' ? 'p-3' : 'p-2',
          )}
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
          {variant === 'showcase' && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="hidden size-9 shrink-0 text-primary sm:inline-flex"
              aria-label={t('chat.attachImage')}
            >
              <Image className="size-5" />
            </Button>
          )}
          <div className="relative min-w-0 flex-1">
            <input
              className={cn(
                'w-full rounded-full bg-muted pr-10 pl-4 text-sm outline-none focus:ring-3 focus:ring-ring/20',
                variant === 'showcase' ? 'h-10' : 'h-9',
              )}
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              placeholder={messagePlaceholder ?? t('chat.messagePlaceholder')}
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
      )}
    </div>
  )
}
