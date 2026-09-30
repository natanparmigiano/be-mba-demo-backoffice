import {
  Archive,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  File,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  List,
  LocateFixed,
  Mail,
  MapPin,
  Music2,
  Pause,
  Phone,
  Play,
} from 'lucide-react'
import type { TFunction } from 'i18next'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Avatar, cn } from '../ui'
import type {
  AudioMessage,
  ButtonsMessage,
  CarouselMessage,
  ChatMessage,
  ContactMessage,
  DocumentMessage,
  ListMessage,
  LocationMessage,
  LocationRequestMessage,
  MessageStatus,
  UrlButtonMessage,
  VoiceMessage,
} from './types'

export function MessageRow({
  message,
  onAction,
}: {
  message: ChatMessage
  onAction: (label: string) => void
}) {
  const isOutgoing = message.direction === 'outgoing'
  const isSticker = message.type === 'sticker'

  return (
    <div className={cn('flex items-end gap-2', isOutgoing && 'justify-end')}>
      {!isOutgoing && <Avatar name="Maya Chen" size="sm" className="mb-1" />}
      <div className="max-w-[88%] sm:max-w-[78%]">
        <div
          className={cn(
            'overflow-hidden text-sm shadow-xs',
            !isSticker && 'rounded-2xl',
            !isSticker && isOutgoing && 'rounded-br-md bg-chat-outgoing',
            !isSticker && !isOutgoing && 'rounded-bl-md bg-chat-incoming',
          )}
        >
          <MessageContent message={message} onAction={onAction} />
          {!isSticker && <MessageMeta message={message} />}
        </div>
        {isSticker && <MessageMeta message={message} />}
      </div>
    </div>
  )
}

function MessageContent({
  message,
  onAction,
}: {
  message: ChatMessage
  onAction: (label: string) => void
}) {
  const { t } = useTranslation()

  switch (message.type) {
    case 'text':
      return <p className="px-3.5 pt-2.5 leading-5">{message.text}</p>
    case 'image':
      return (
        <div className="p-1.5 pb-0">
          <img
            className="aspect-video w-full rounded-xl object-cover"
            src={message.url}
            alt={message.alt}
          />
          {message.caption && (
            <p className="px-2 pt-2 leading-5">{message.caption}</p>
          )}
        </div>
      )
    case 'video':
      return (
        <div className="p-1.5 pb-0">
          <video
            className="aspect-video w-full rounded-xl bg-black object-cover"
            controls
            preload="metadata"
          >
            <source src={message.url} type="video/mp4" />
            {t('chat.videoUnsupported')}
          </video>
          {message.caption && (
            <p className="px-2 pt-2 leading-5">{message.caption}</p>
          )}
        </div>
      )
    case 'document':
      return <DocumentContent message={message} />
    case 'voice':
      return <VoiceContent message={message} />
    case 'audio':
      return <AudioContent message={message} />
    case 'location':
      return <LocationContent message={message} />
    case 'contact':
      return <ContactContent message={message} onAction={onAction} />
    case 'location-request':
      return <LocationRequestContent message={message} onAction={onAction} />
    case 'sticker':
      return (
        <img
          className="size-36 rounded-3xl object-cover shadow-md"
          src={message.url}
          alt={message.alt}
        />
      )
    case 'buttons':
      return <ButtonsContent message={message} onAction={onAction} />
    case 'list':
      return <ListContent message={message} onAction={onAction} />
    case 'url-button':
      return <UrlButtonContent message={message} />
    case 'carousel':
      return <CarouselContent message={message} onAction={onAction} />
  }
}

function MessageMeta({ message }: { message: ChatMessage }) {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-6 items-center gap-2 px-3.5 pb-2 pt-1 text-[10px] text-muted-foreground">
      {message.reactions && message.reactions.length > 0 && (
        <div
          className="flex items-center gap-1"
          aria-label={t('chat.messageReactions')}
        >
          {message.reactions.map((reaction) => (
            <span
              key={reaction.emoji}
              className="inline-flex h-5 items-center gap-0.5 rounded-full border bg-card px-1.5 text-[11px] shadow-xs"
            >
              {reaction.emoji}
              {reaction.count && reaction.count > 1 ? (
                <span>{reaction.count}</span>
              ) : null}
            </span>
          ))}
        </div>
      )}
      <span className="ml-auto">{message.sentAt}</span>
      {message.direction === 'outgoing' && message.status && (
        <MessageStatusIndicator status={message.status} />
      )}
    </div>
  )
}

export function MessageStatusIndicator({
  status,
  label = false,
}: {
  status: MessageStatus
  label?: boolean
}) {
  const { t } = useTranslation()
  const labels: Record<MessageStatus, string> = {
    undelivered: t('chat.status.undelivered'),
    delivered: t('chat.status.delivered'),
    read: t('chat.status.read'),
  }
  const Icon = status === 'undelivered' ? Check : CheckCheck

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1',
        status === 'read' && 'text-status-read',
      )}
      title={labels[status]}
    >
      <Icon className="size-3.5" aria-hidden />
      {label && <span>{labels[status]}</span>}
      {!label && <span className="sr-only">{labels[status]}</span>}
    </span>
  )
}

function DocumentContent({ message }: { message: DocumentMessage }) {
  const { t } = useTranslation()
  const { icon: Icon, label, color } = documentStyle(message.mimeType, t)

  return (
    <div className="px-2 pt-2">
      <div className="flex items-center gap-3 rounded-xl bg-card/75 p-3">
        <span
          className={cn(
            'grid size-11 shrink-0 place-items-center rounded-lg',
            color,
          )}
        >
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{message.fileName}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {label}
            {message.size ? ` · ${message.size}` : ''}
          </p>
        </div>
        <button
          className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-primary hover:bg-primary/10"
          aria-label={t('chat.download', { file: message.fileName })}
        >
          <Download className="size-4" />
        </button>
      </div>
      {message.caption && (
        <p className="px-1 pt-2 leading-5">{message.caption}</p>
      )}
    </div>
  )
}

function documentStyle(mimeType: string, t: TFunction) {
  if (mimeType === 'application/pdf') {
    return {
      icon: FileText,
      label: t('chat.fileTypes.pdf'),
      color: 'bg-destructive/10 text-destructive',
    }
  }
  if (
    mimeType.includes('spreadsheet') ||
    mimeType.includes('excel') ||
    mimeType === 'text/csv'
  ) {
    return {
      icon: FileSpreadsheet,
      label: t('chat.fileTypes.spreadsheet'),
      color: 'bg-success/12 text-success',
    }
  }
  if (mimeType.startsWith('image/')) {
    return {
      icon: FileImage,
      label: t('chat.fileTypes.image'),
      color: 'bg-primary/10 text-primary',
    }
  }
  if (mimeType.includes('zip') || mimeType.includes('compressed')) {
    return {
      icon: Archive,
      label: t('chat.fileTypes.archive'),
      color: 'bg-warning/15 text-warning-foreground',
    }
  }
  if (
    mimeType.includes('json') ||
    mimeType.includes('javascript') ||
    mimeType.startsWith('text/')
  ) {
    return {
      icon: FileCode2,
      label: t('chat.fileTypes.code'),
      color: 'bg-accent/10 text-accent',
    }
  }

  return {
    icon: File,
    label: t('chat.fileTypes.file'),
    color: 'bg-muted text-muted-foreground',
  }
}

function VoiceContent({ message }: { message: VoiceMessage }) {
  const { t } = useTranslation()
  const [isPlaying, setIsPlaying] = useState(false)
  const progressIndex = Math.round(
    message.waveform.length * ((message.progress ?? 0) / 100),
  )

  return (
    <div className="flex min-w-64 items-center gap-3 px-3 pt-3">
      <button
        className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-full bg-primary text-primary-foreground"
        onClick={() => setIsPlaying((playing) => !playing)}
        aria-label={t(isPlaying ? 'chat.pauseVoice' : 'chat.playVoice')}
      >
        {isPlaying ? (
          <Pause className="size-4 fill-current" />
        ) : (
          <Play className="ml-0.5 size-4 fill-current" />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <div
          className="flex h-9 items-center gap-0.75"
          aria-label={t('chat.voiceWaveform')}
        >
          {message.waveform.map((height, index) => (
            <span
              key={`${height}-${index}`}
              className={cn(
                'w-0.75 rounded-full',
                index < progressIndex ? 'bg-primary' : 'bg-muted-foreground/35',
              )}
              style={{ height: `${Math.max(16, height)}%` }}
            />
          ))}
        </div>
        <span className="text-[10px] text-muted-foreground">
          {message.duration} · {t('chat.voiceMessage')}
        </span>
      </div>
    </div>
  )
}

function AudioContent({ message }: { message: AudioMessage }) {
  const { t } = useTranslation()
  const [isPlaying, setIsPlaying] = useState(false)

  return (
    <div className="flex min-w-64 items-center gap-3 px-3 pt-3">
      <button
        className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-lg bg-accent/12 text-accent"
        onClick={() => setIsPlaying((playing) => !playing)}
        aria-label={t(isPlaying ? 'chat.pauseAudio' : 'chat.playAudio')}
      >
        {isPlaying ? (
          <Pause className="size-5 fill-current" />
        ) : (
          <Music2 className="size-5" />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{message.title}</p>
        <p className="text-xs text-muted-foreground">
          {message.artist ?? t('chat.audio')} · {message.duration}
        </p>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted-foreground/20">
          <div
            className={cn(
              'h-full rounded-full bg-accent transition-all',
              isPlaying ? 'w-2/5' : 'w-0',
            )}
          />
        </div>
      </div>
    </div>
  )
}

function LocationContent({ message }: { message: LocationMessage }) {
  const { t } = useTranslation()

  return (
    <div className="p-1.5 pb-0">
      <div className="relative h-36 overflow-hidden rounded-xl bg-[linear-gradient(32deg,transparent_48%,color-mix(in_oklab,var(--primary)_18%,transparent)_49%,color-mix(in_oklab,var(--primary)_18%,transparent)_52%,transparent_53%),linear-gradient(145deg,transparent_45%,color-mix(in_oklab,var(--success)_20%,transparent)_46%,color-mix(in_oklab,var(--success)_20%,transparent)_55%,transparent_56%)] bg-muted">
        <div className="absolute inset-0 bg-[linear-gradient(color-mix(in_oklab,var(--border)_60%,transparent)_1px,transparent_1px),linear-gradient(90deg,color-mix(in_oklab,var(--border)_60%,transparent)_1px,transparent_1px)] bg-[size:26px_26px]" />
        <span className="absolute top-1/2 left-1/2 grid size-10 -translate-1/2 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-card/70">
          <MapPin className="size-5 fill-current" />
        </span>
        <span className="absolute right-2 bottom-2 rounded-md bg-card/90 px-2 py-1 text-[9px] text-muted-foreground shadow-xs">
          {t('chat.mapPreview')}
        </span>
      </div>
      <div className="px-2 pt-2">
        <p className="font-semibold">{message.name}</p>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
          {message.address}
        </p>
        <p className="mt-1 font-mono text-[10px] text-muted-foreground">
          {message.latitude}, {message.longitude}
        </p>
      </div>
    </div>
  )
}

function ContactContent({
  message,
  onAction,
}: {
  message: ContactMessage
  onAction: (label: string) => void
}) {
  const { t } = useTranslation()
  const contact = message.contacts[0]
  if (!contact) return null

  return (
    <div className="min-w-72 px-3 pt-3">
      <div className="flex items-center gap-3 border-b pb-3">
        <Avatar name={contact.formattedName} size="lg" />
        <div className="min-w-0">
          <p className="truncate font-bold">{contact.formattedName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {contact.title}
            {contact.organization ? ` · ${contact.organization}` : ''}
          </p>
        </div>
      </div>
      <div className="grid gap-2.5 py-3 text-xs">
        {contact.phones.map((phone) => (
          <ContactLine
            key={phone.value}
            icon={Phone}
            value={phone.value}
            label={t(`chat.contactLabels.${phone.label}`)}
          />
        ))}
        {contact.emails?.map((email) => (
          <ContactLine
            key={email.value}
            icon={Mail}
            value={email.value}
            label={t(`chat.contactLabels.${email.label}`)}
          />
        ))}
        {contact.addresses?.slice(0, 1).map((address) => (
          <ContactLine
            key={`${address.street}-${address.city}`}
            icon={MapPin}
            value={[address.street, address.city, address.region]
              .filter(Boolean)
              .join(', ')}
            label={t(`chat.contactLabels.${address.label}`)}
          />
        ))}
      </div>
      <button
        className="w-full cursor-pointer border-t py-2.5 text-center text-sm font-semibold text-primary hover:bg-primary/5"
        onClick={() =>
          onAction(t('chat.openedContact', { name: contact.formattedName }))
        }
      >
        {t('chat.viewContact')}
      </button>
    </div>
  )
}

function ContactLine({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Phone
  value: string
  label: string
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{value}</span>
      <span className="text-[9px] font-semibold text-muted-foreground">
        {label}
      </span>
    </div>
  )
}

function LocationRequestContent({
  message,
  onAction,
}: {
  message: LocationRequestMessage
  onAction: (label: string) => void
}) {
  const { t } = useTranslation()

  return (
    <div className="min-w-64 px-3 pt-3">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <LocateFixed className="size-5" />
        </span>
        <p className="pt-0.5 leading-5">{message.prompt}</p>
      </div>
      <button
        className="mt-3 w-full cursor-pointer border-t py-2.5 text-center text-sm font-semibold text-primary hover:bg-primary/5"
        onClick={() => onAction(t('chat.locationRequested'))}
      >
        <MapPin className="mr-1.5 inline size-4" />
        {message.buttonLabel}
      </button>
    </div>
  )
}

function ButtonsContent({
  message,
  onAction,
}: {
  message: ButtonsMessage
  onAction: (label: string) => void
}) {
  const { t } = useTranslation()
  const twoButtons = message.buttons.length === 2

  return (
    <div className="min-w-64 px-3 pt-3">
      <p className="leading-5">{message.text}</p>
      {message.footer && (
        <p className="mt-2 text-[10px] text-muted-foreground">
          {message.footer}
        </p>
      )}
      <div
        className={cn(
          'mt-3 grid border-t',
          twoButtons ? 'grid-cols-2 divide-x' : 'grid-cols-1 divide-y',
        )}
      >
        {message.buttons.map((button) => (
          <button
            key={button.id}
            className="cursor-pointer px-2 py-2.5 text-center text-sm font-semibold text-primary hover:bg-primary/5"
            onClick={() =>
              onAction(t('chat.actionSelected', { action: button.title }))
            }
          >
            {button.title}
          </button>
        ))}
      </div>
    </div>
  )
}

function ListContent({
  message,
  onAction,
}: {
  message: ListMessage
  onAction: (label: string) => void
}) {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="min-w-72 px-3 pt-3">
      <p className="font-bold">{message.title}</p>
      <p className="mt-1 leading-5">{message.text}</p>
      <button
        className="mt-3 flex w-full cursor-pointer items-center justify-center gap-2 border-t py-2.5 text-sm font-semibold text-primary hover:bg-primary/5"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-label={t('chat.listExpand')}
      >
        <List className="size-4" />
        {message.buttonLabel}
        <ChevronDown
          className={cn('size-4 transition-transform', isOpen && 'rotate-180')}
        />
      </button>
      {isOpen && (
        <div className="mb-1 max-h-72 overflow-y-auto rounded-lg border bg-card p-1.5 shadow-lg">
          {message.sections.map((section) => (
            <div key={section.title}>
              <p className="px-2.5 pt-2.5 pb-1 text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
                {section.title}
              </p>
              {section.rows.map((row) => (
                <button
                  key={row.id}
                  className="block w-full cursor-pointer rounded-md px-2.5 py-2 text-left hover:bg-muted"
                  onClick={() =>
                    onAction(t('chat.actionSelected', { action: row.title }))
                  }
                >
                  <span className="block text-sm font-semibold">
                    {row.title}
                  </span>
                  {row.description && (
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {row.description}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function UrlButtonContent({ message }: { message: UrlButtonMessage }) {
  return (
    <div className="min-w-64 px-3 pt-3">
      <p className="leading-5">{message.text}</p>
      <a
        className="mt-3 flex w-full items-center justify-center gap-2 border-t py-2.5 text-sm font-semibold text-primary hover:bg-primary/5"
        href={message.url}
        target="_blank"
        rel="noreferrer"
      >
        <ExternalLink className="size-4" />
        {message.label}
      </a>
    </div>
  )
}

function CarouselContent({
  message,
  onAction,
}: {
  message: CarouselMessage
  onAction: (label: string) => void
}) {
  const { t } = useTranslation()
  const [index, setIndex] = useState(0)
  const item = message.items[index]
  if (!item) return null

  return (
    <div className="w-72 p-1.5 pb-0 sm:w-80">
      <div className="overflow-hidden rounded-xl bg-card/70">
        <img
          className="aspect-video w-full object-cover"
          src={item.imageUrl}
          alt={item.imageAlt}
        />
        <div className="p-3">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-bold">{item.title}</p>
              {item.description && (
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {item.description}
                </p>
              )}
            </div>
            <span className="text-[10px] text-muted-foreground">
              {index + 1}/{message.items.length}
            </span>
          </div>
          {item.button && (
            <button
              className="mt-3 w-full cursor-pointer border-t pt-2.5 text-center text-sm font-semibold text-primary"
              onClick={() =>
                onAction(
                  t('chat.actionSelected', { action: item.button?.title }),
                )
              }
            >
              {item.button.title}
            </button>
          )}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between px-1">
        <button
          className="grid size-7 cursor-pointer place-items-center rounded-full bg-card shadow-xs disabled:opacity-35"
          disabled={index === 0}
          onClick={() => setIndex((current) => Math.max(0, current - 1))}
          aria-label={t('chat.previousCard')}
        >
          <ChevronLeft className="size-4" />
        </button>
        <div className="flex gap-1.5">
          {message.items.map((carouselItem, itemIndex) => (
            <button
              key={carouselItem.id}
              className={cn(
                'size-1.5 cursor-pointer rounded-full transition-all',
                index === itemIndex
                  ? 'w-4 bg-primary'
                  : 'bg-muted-foreground/35',
              )}
              onClick={() => setIndex(itemIndex)}
              aria-label={t('chat.showCard', { title: carouselItem.title })}
            />
          ))}
        </div>
        <button
          className="grid size-7 cursor-pointer place-items-center rounded-full bg-card shadow-xs disabled:opacity-35"
          disabled={index === message.items.length - 1}
          onClick={() =>
            setIndex((current) =>
              Math.min(message.items.length - 1, current + 1),
            )
          }
          aria-label={t('chat.nextCard')}
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  )
}
