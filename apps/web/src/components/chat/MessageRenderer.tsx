import {
  Archive,
  Building2,
  CalendarDays,
  Check,
  CheckCheck,
  Clock3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  Download,
  ExternalLink,
  File,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  Forward,
  List,
  Link as LinkIcon,
  LocateFixed,
  LoaderCircle,
  Mail,
  MapPin,
  Maximize2,
  Music2,
  Pause,
  Phone,
  Play,
  Sparkles,
  Sticker as StickerIcon,
  SmilePlus,
  Volume2,
  X,
} from 'lucide-react'
import type { TFunction } from 'i18next'
import type { Map as MapLibreMap, StyleSpecification } from 'maplibre-gl'
import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Avatar, Button, cn, Dialog } from '../ui'
import { LightboxImage } from './ImageLightbox'
import { EmojiPickerPanel } from './EmojiPicker'
import { WhatsAppText } from './WhatsAppText'
import type {
  AudioMessage,
  ButtonsMessage,
  CarouselMessage,
  ChatMessage,
  ContactAddress,
  ContactMessage,
  DocumentMessage,
  ListMessage,
  LocationMessage,
  LocationRequestMessage,
  MessageStatus,
  StickerMessage,
  UrlButtonMessage,
  VoiceMessage,
} from './types'

export function MessageRow({
  message,
  onAction,
  onReact,
  onSaveSticker,
  incomingAvatarName,
}: {
  message: ChatMessage
  onAction: (label: string) => void
  onReact?: (providerMessageId: string, emoji: string) => Promise<void>
  onSaveSticker?: (message: StickerMessage) => Promise<void>
  incomingAvatarName?: string
}) {
  const { t } = useTranslation()
  const [reactionMenuPoint, setReactionMenuPoint] = useState<{
    x: number
    y: number
  } | null>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  const isOutgoing = message.direction === 'outgoing'
  const isSticker = message.type === 'sticker'
  const senderName = message.senderName ?? incomingAvatarName
  const canReact = Boolean(message.providerMessageId && onReact)
  const canSaveSticker =
    isSticker && message.direction === 'incoming' && Boolean(onSaveSticker)
  const hasMessageActions = canReact || canSaveSticker

  const openReactionMenu = (x: number, y: number) => {
    if (!hasMessageActions) return
    setReactionMenuPoint({ x, y })
  }

  return (
    <div
      ref={rowRef}
      className={cn(
        'flex items-end gap-2 outline-none',
        isOutgoing && 'justify-end',
        hasMessageActions && 'focus-visible:ring-2 focus-visible:ring-ring/30',
      )}
      tabIndex={hasMessageActions ? 0 : undefined}
      aria-haspopup={hasMessageActions ? 'menu' : undefined}
      onContextMenu={(event) => {
        if (!hasMessageActions) return
        event.preventDefault()
        openReactionMenu(event.clientX, event.clientY)
      }}
      onKeyDown={(event) => {
        if (
          !hasMessageActions ||
          (event.key !== 'ContextMenu' &&
            !(event.shiftKey && event.key === 'F10'))
        ) {
          return
        }
        event.preventDefault()
        const bounds = event.currentTarget.getBoundingClientRect()
        openReactionMenu(bounds.left + bounds.width / 2, bounds.top + 24)
      }}
    >
      {!isOutgoing && (
        <Avatar
          name={senderName ?? t('chat.contactName')}
          size="sm"
          className="mb-1"
        />
      )}
      <div className="max-w-[88%] sm:max-w-[78%]">
        <div
          className={cn(
            'overflow-hidden text-sm',
            !isSticker && 'rounded-2xl shadow-xs',
            !isSticker && isOutgoing && 'rounded-br-md bg-chat-outgoing',
            !isSticker && !isOutgoing && 'rounded-bl-md bg-chat-incoming',
          )}
        >
          {!isOutgoing && message.senderName && !isSticker && (
            <p className="px-3.5 pt-2 text-xs font-semibold text-primary">
              {message.senderName}
            </p>
          )}
          <ForwardingIndicator message={message} isSticker={isSticker} />
          <MessageContent message={message} onAction={onAction} />
          {!isSticker && <MessageMeta message={message} />}
        </div>
        {isSticker && <MessageMeta message={message} />}
      </div>
      {reactionMenuPoint && hasMessageActions
        ? createPortal(
            <MessageReactionMenu
              point={reactionMenuPoint}
              onClose={() => {
                setReactionMenuPoint(null)
                rowRef.current?.focus()
              }}
              onReact={
                message.providerMessageId && onReact
                  ? (emoji) => onReact(message.providerMessageId!, emoji)
                  : undefined
              }
              onSaveSticker={
                isSticker && onSaveSticker
                  ? async () => {
                      await onSaveSticker(message)
                      onAction(t('chat.stickerSaved'))
                    }
                  : undefined
              }
            />,
            document.body,
          )
        : null}
    </div>
  )
}

function MessageReactionMenu({
  point,
  onClose,
  onReact,
  onSaveSticker,
}: {
  point: { x: number; y: number }
  onClose: () => void
  onReact?: (emoji: string) => Promise<void>
  onSaveSticker?: () => Promise<void>
}) {
  const { t } = useTranslation()
  const rootRef = useRef<HTMLDivElement>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [position, setPosition] = useState(point)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const bounds = root.getBoundingClientRect()
    setPosition({
      x: Math.max(8, Math.min(point.x, window.innerWidth - bounds.width - 8)),
      y: Math.max(8, Math.min(point.y, window.innerHeight - bounds.height - 8)),
    })
    if (!showPicker) {
      root.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    }
  }, [point, showPicker])

  useEffect(() => {
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onClose()
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', closeOnOutsidePress)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose])

  const sendReaction = async (emoji: string) => {
    if (sending || !onReact) return
    setSending(true)
    setError(null)
    try {
      await onReact(emoji)
      onClose()
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t('chat.reactionSendFailed'),
      )
      setSending(false)
    }
  }

  const saveSticker = async () => {
    if (sending || !onSaveSticker) return
    setSending(true)
    setError(null)
    try {
      await onSaveSticker()
      onClose()
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t('chat.stickerSaveFailed'),
      )
      setSending(false)
    }
  }

  return (
    <div
      ref={rootRef}
      className="fixed z-[100]"
      style={{ left: position.x, top: position.y }}
    >
      {showPicker && onReact ? (
        <div role="dialog" aria-label={t('chat.chooseReaction')}>
          {error && (
            <p
              className="mb-1 max-w-[23rem] rounded-xl border border-destructive/20 bg-card px-3 py-2 text-xs text-destructive shadow-lg"
              role="alert"
            >
              {error}
            </p>
          )}
          <EmojiPickerPanel disabled={sending} onSelect={sendReaction} />
        </div>
      ) : (
        <div
          role="menu"
          aria-label={t('chat.messageActions')}
          className="min-w-44 rounded-xl border bg-card p-1.5 text-card-foreground shadow-xl"
        >
          {onReact && (
            <button
              type="button"
              role="menuitem"
              className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              onClick={() => setShowPicker(true)}
            >
              <SmilePlus className="size-4" aria-hidden />
              {t('chat.reactToMessage')}
            </button>
          )}
          {onSaveSticker && (
            <button
              type="button"
              role="menuitem"
              className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              disabled={sending}
              onClick={() => void saveSticker()}
            >
              <StickerIcon className="size-4" aria-hidden />
              {t('chat.saveSticker')}
            </button>
          )}
        </div>
      )}
      {sending && (
        <span className="pointer-events-none absolute top-3 right-3 text-primary">
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          <span className="sr-only">{t('chat.status.sending')}</span>
        </span>
      )}
    </div>
  )
}

function ForwardingIndicator({
  message,
  isSticker,
}: {
  message: ChatMessage
  isSticker: boolean
}) {
  const { t } = useTranslation()
  if (!message.forwarded && !message.frequentlyForwarded) return null

  const isFrequent = message.frequentlyForwarded === true
  const Icon = isFrequent ? ChevronsRight : Forward
  const label = t(isFrequent ? 'chat.frequentlyForwarded' : 'chat.forwarded')

  return (
    <p
      className={cn(
        'flex items-center gap-1 px-3.5 pt-2 text-[11px] font-medium italic text-muted-foreground',
        isSticker && 'mb-1 w-fit rounded-full border bg-card px-2 py-1',
      )}
      aria-label={label}
    >
      <Icon className="size-3" aria-hidden />
      {label}
    </p>
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
      return (
        <WhatsAppText className="px-3.5 pt-2.5 leading-5" text={message.text} />
      )
    case 'image':
      return (
        <div className="p-1.5 pb-0">
          <LightboxImage
            className="aspect-video w-full rounded-xl object-cover"
            src={message.url}
            alt={message.alt}
          />
          {message.caption && (
            <WhatsAppText
              className="px-2 pt-2 leading-5"
              text={message.caption}
            />
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
            <source src={message.url} type={message.mimeType ?? 'video/mp4'} />
            {t('chat.videoUnsupported')}
          </video>
          {message.caption && (
            <WhatsAppText
              className="px-2 pt-2 leading-5"
              text={message.caption}
            />
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
        <LightboxImage
          className="size-36 rounded-3xl object-cover"
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
  const status =
    message.status ??
    (message.direction === 'outgoing' ? ('sending' as const) : undefined)

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
      {status && <MessageStatusIndicator status={status} />}
      {message.aiGenerated && (
        <span
          className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-primary"
          aria-label={t('chat.aiGenerated')}
          title={t('chat.aiGenerated')}
        >
          <Sparkles className="size-3" aria-hidden />
          {t('chat.aiLabel')}
        </span>
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
    sending: t('chat.status.sending'),
    error: t('chat.status.error'),
    sent: t('chat.status.sent'),
    delivered: t('chat.status.delivered'),
    read: t('chat.status.read'),
    played: t('chat.status.played'),
  }
  const Icon =
    status === 'sending'
      ? Clock3
      : status === 'error'
        ? X
        : status === 'played'
          ? Volume2
          : status === 'sent'
            ? Check
            : CheckCheck

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1',
        status === 'error' && 'text-destructive',
        (status === 'read' || status === 'played') && 'text-status-read',
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
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState(false)

  const download = async () => {
    if (!message.url || isDownloading) return
    setIsDownloading(true)
    setDownloadError(false)
    try {
      await downloadFile(message.url, message.fileName)
    } catch {
      setDownloadError(true)
    } finally {
      setIsDownloading(false)
    }
  }

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
          type="button"
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-full',
            message.url
              ? 'cursor-pointer text-primary hover:bg-primary/10'
              : 'text-muted-foreground',
          )}
          disabled={!message.url || isDownloading}
          onClick={() => void download()}
          aria-label={t('chat.download', { file: message.fileName })}
          aria-busy={isDownloading}
        >
          <Download
            className={cn('size-4', isDownloading && 'animate-bounce')}
          />
        </button>
      </div>
      {downloadError && (
        <p className="px-1 pt-2 text-xs text-destructive" role="alert">
          {t('chat.downloadFailed')}
        </p>
      )}
      {message.caption && (
        <WhatsAppText className="px-1 pt-2 leading-5" text={message.caption} />
      )}
    </div>
  )
}

async function downloadFile(url: string, fileName: string): Promise<void> {
  const response = await fetch(url)
  if (!response.ok) throw new Error('Document download failed')

  const objectUrl = URL.createObjectURL(await response.blob())
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = fileName
  anchor.hidden = true
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
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
  const player = useAudioPlayer(message.url)
  const decodedWaveform = useAudioWaveform(message.url, 40)
  const waveform = decodedWaveform ?? message.waveform ?? DEFAULT_WAVEFORM
  const progress = message.url
    ? player.progress
    : Math.min(100, Math.max(0, message.progress ?? 0))
  const progressIndex = Math.round(waveform.length * (progress / 100))

  return (
    <div className="flex min-w-64 items-center gap-3 px-3 pt-3">
      <button
        type="button"
        className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-full bg-primary text-primary-foreground"
        onClick={() => void player.toggle()}
        aria-label={t(player.isPlaying ? 'chat.pauseVoice' : 'chat.playVoice')}
      >
        {player.isPlaying ? (
          <Pause className="size-4 fill-current" />
        ) : (
          <Play className="ml-0.5 size-4 fill-current" />
        )}
      </button>
      {message.url && (
        <audio
          ref={player.audioRef}
          src={message.url}
          preload="metadata"
          onLoadedMetadata={player.updateDuration}
          onDurationChange={player.updateDuration}
          onTimeUpdate={player.updateCurrentTime}
          onPlay={() => player.setIsPlaying(true)}
          onPause={() => player.setIsPlaying(false)}
          onEnded={player.reset}
        />
      )}
      <div className="min-w-0 flex-1">
        <button
          type="button"
          className="flex h-9 w-full cursor-pointer items-center gap-0.75"
          aria-label={t('chat.voiceWaveform')}
          disabled={!message.url || player.duration === 0}
          onClick={(event) => player.seekToPointer(event)}
        >
          {waveform.map((height, index) => (
            <span
              key={`${height}-${index}`}
              className={cn(
                'min-w-0 flex-1 rounded-full',
                index < progressIndex ? 'bg-primary' : 'bg-muted-foreground/35',
              )}
              style={{ height: `${Math.max(16, height)}%` }}
            />
          ))}
        </button>
        <span className="text-[10px] text-muted-foreground">
          {formatMediaTime(player.currentTime)} /{' '}
          {player.duration > 0
            ? formatMediaTime(player.duration)
            : (message.duration ?? '0:00')}{' '}
          · {t('chat.voiceMessage')}
        </span>
      </div>
    </div>
  )
}

function AudioContent({ message }: { message: AudioMessage }) {
  const { t } = useTranslation()
  const player = useAudioPlayer(message.url)
  const progress = message.url ? player.progress : player.isPlaying ? 40 : 0

  return (
    <div className="flex min-w-64 items-center gap-3 px-3 pt-3">
      <button
        type="button"
        className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-lg bg-accent/12 text-accent"
        onClick={() => void player.toggle()}
        aria-label={t(player.isPlaying ? 'chat.pauseAudio' : 'chat.playAudio')}
      >
        {player.isPlaying ? (
          <Pause className="size-5 fill-current" />
        ) : (
          <Music2 className="size-5" />
        )}
      </button>
      {message.url && (
        <audio
          ref={player.audioRef}
          src={message.url}
          preload="metadata"
          onLoadedMetadata={player.updateDuration}
          onDurationChange={player.updateDuration}
          onTimeUpdate={player.updateCurrentTime}
          onPlay={() => player.setIsPlaying(true)}
          onPause={() => player.setIsPlaying(false)}
          onEnded={player.reset}
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{message.title}</p>
        <p className="text-xs text-muted-foreground">
          {message.artist ?? t('chat.audio')}
          {' · '}
          {formatMediaTime(player.currentTime)} /{' '}
          {player.duration > 0
            ? formatMediaTime(player.duration)
            : (message.duration ?? '0:00')}
        </p>
        <div className="relative mt-2 h-4">
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-muted-foreground/20">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${progress}%` }}
            />
          </div>
          <input
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default"
            type="range"
            min="0"
            max={player.duration || 0}
            step="0.1"
            value={Math.min(player.currentTime, player.duration || 0)}
            disabled={!message.url || player.duration === 0}
            onChange={(event) => player.seek(Number(event.currentTarget.value))}
            aria-label={t('chat.seekAudio')}
          />
        </div>
      </div>
    </div>
  )
}

function useAudioPlayer(url: string | undefined) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
  }, [url])

  const toggle = async () => {
    const audio = audioRef.current
    if (!audio) {
      setIsPlaying((playing) => !playing)
      return
    }

    if (!audio.paused) {
      audio.pause()
      return
    }

    try {
      await audio.play()
    } catch {
      setIsPlaying(false)
    }
  }

  const seek = (nextTime: number) => {
    const audio = audioRef.current
    if (!audio || !Number.isFinite(nextTime)) return
    audio.currentTime = Math.min(Math.max(0, nextTime), duration)
    setCurrentTime(audio.currentTime)
  }

  return {
    audioRef,
    currentTime,
    duration,
    isPlaying,
    progress: duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0,
    reset: () => {
      setIsPlaying(false)
      setCurrentTime(0)
    },
    seek,
    seekToPointer: (event: MouseEvent<HTMLButtonElement>) => {
      if (duration <= 0) return
      const bounds = event.currentTarget.getBoundingClientRect()
      seek(((event.clientX - bounds.left) / bounds.width) * duration)
    },
    setIsPlaying,
    toggle,
    updateCurrentTime: () => setCurrentTime(audioRef.current?.currentTime ?? 0),
    updateDuration: () => {
      const nextDuration = audioRef.current?.duration
      setDuration(
        nextDuration !== undefined && Number.isFinite(nextDuration)
          ? nextDuration
          : 0,
      )
    },
  }
}

function useAudioWaveform(
  url: string | undefined,
  sampleCount: number,
): number[] | undefined {
  const [waveform, setWaveform] = useState<number[]>()

  useEffect(() => {
    if (!url) {
      setWaveform(undefined)
      return
    }

    setWaveform(undefined)
    const controller = new AbortController()
    void (async () => {
      let context: AudioContext | undefined
      try {
        const response = await fetch(url, { signal: controller.signal })
        if (!response.ok) return
        context = new AudioContext()
        const audioBuffer = await context.decodeAudioData(
          await response.arrayBuffer(),
        )
        if (!controller.signal.aborted) {
          setWaveform(calculateWaveform(audioBuffer, sampleCount))
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setWaveform(undefined)
        }
      } finally {
        await context?.close()
      }
    })()

    return () => controller.abort()
  }, [sampleCount, url])

  return waveform
}

function calculateWaveform(buffer: AudioBuffer, sampleCount: number): number[] {
  const blockSize = Math.max(1, Math.floor(buffer.length / sampleCount))
  const peaks = Array.from({ length: sampleCount }, (_, blockIndex) => {
    const start = blockIndex * blockSize
    const end = Math.min(buffer.length, start + blockSize)
    const stride = Math.max(1, Math.floor(blockSize / 256))
    let peak = 0

    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const samples = buffer.getChannelData(channel)
      for (let index = start; index < end; index += stride) {
        peak = Math.max(peak, Math.abs(samples[index] ?? 0))
      }
    }

    return peak
  })
  const maximum = Math.max(...peaks, 0.01)
  return peaks.map((peak) => 16 + (peak / maximum) * 84)
}

function formatMediaTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const wholeSeconds = Math.floor(seconds)
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, '0')}`
}

const DEFAULT_WAVEFORM = Array.from(
  { length: 40 },
  (_, index) => 24 + ((index * 29) % 68),
)

function LocationContent({ message }: { message: LocationMessage }) {
  const { t } = useTranslation()
  const [isMapOpen, setIsMapOpen] = useState(false)
  const coordinates = `${message.latitude.toFixed(6)}, ${message.longitude.toFixed(6)}`

  return (
    <>
      <div className="w-64 max-w-[72vw] p-1.5 pb-0">
        <div className="relative h-36 overflow-hidden rounded-xl bg-muted">
          <MapCanvas
            latitude={message.latitude}
            longitude={message.longitude}
            interactive={false}
            className="h-full w-full"
          />
          <button
            type="button"
            className="group absolute inset-0 cursor-pointer text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/40"
            onClick={() => setIsMapOpen(true)}
            aria-label={t('chat.expandMap', { name: message.name })}
          >
            <span className="absolute right-2 bottom-2 inline-flex items-center gap-1.5 rounded-md bg-card/90 px-2 py-1 text-[9px] text-muted-foreground shadow-xs">
              <Maximize2 className="size-3" aria-hidden />
              {t('chat.mapPreview')}
            </span>
          </button>
          <span className="absolute bottom-1 left-1 rounded-sm bg-card/85 px-1 text-[8px] text-muted-foreground">
            ©{' '}
            <a
              className="hover:underline"
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
            >
              OpenStreetMap
            </a>{' '}
            contributors
          </span>
        </div>
        <div className="px-2 pt-2">
          <p className="font-semibold">{message.name}</p>
          {message.address && (
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
              {message.address}
            </p>
          )}
          <p className="mt-1 font-mono text-[10px] text-muted-foreground">
            {coordinates}
          </p>
        </div>
      </div>

      <Dialog
        open={isMapOpen}
        onOpenChange={setIsMapOpen}
        title={message.name}
        description={t('chat.mapDescription', { coordinates })}
        icon={
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <MapPin className="size-5" aria-hidden />
          </span>
        }
        size="xl"
      >
        <div className="w-full">
          <MapCanvas
            latitude={message.latitude}
            longitude={message.longitude}
            interactive
            className="h-[min(60vh,34rem)] w-full overflow-hidden rounded-xl border"
          />
          <div className="mt-4 flex justify-end">
            <Button variant="outline" onClick={() => setIsMapOpen(false)}>
              {t('chat.close')}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  )
}

function MapCanvas({
  latitude,
  longitude,
  interactive,
  className,
}: {
  latitude: number
  longitude: number
  interactive: boolean
  className?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let disposed = false
    let map: MapLibreMap | undefined
    let resizeObserver: ResizeObserver | undefined
    let resizeFrame: number | undefined
    void import('maplibre-gl').then(({ Map, Marker, NavigationControl }) => {
      if (disposed) return
      map = new Map({
        container,
        style: createBaseMapStyle(),
        center: [longitude, latitude],
        zoom: interactive ? 15 : 14,
        interactive,
        attributionControl: interactive ? { compact: true } : false,
      })
      const markerColor = getComputedStyle(document.documentElement)
        .getPropertyValue('--primary')
        .trim()
      new Marker({ color: markerColor || '#0866ff' })
        .setLngLat([longitude, latitude])
        .addTo(map)
      if (interactive) {
        map.addControl(new NavigationControl(), 'top-right')
      }

      const resize = () => {
        if (resizeFrame !== undefined) cancelAnimationFrame(resizeFrame)
        resizeFrame = requestAnimationFrame(() => map?.resize())
      }
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(resize)
        resizeObserver.observe(container)
      }
      map.once('load', resize)
      resize()
    })

    return () => {
      disposed = true
      resizeObserver?.disconnect()
      if (resizeFrame !== undefined) cancelAnimationFrame(resizeFrame)
      map?.remove()
    }
  }, [interactive, latitude, longitude])

  return (
    <div
      ref={containerRef}
      className={className}
      aria-hidden={interactive ? undefined : true}
    />
  )
}

function createBaseMapStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      baseMap: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        maxzoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      },
    },
    layers: [
      {
        id: 'baseMap',
        type: 'raster',
        source: 'baseMap',
      },
    ],
  }
}

function ContactContent({
  message,
  onAction,
}: {
  message: ContactMessage
  onAction: (label: string) => void
}) {
  const { t } = useTranslation()
  const [isContactOpen, setIsContactOpen] = useState(false)
  const contact = message.contacts[0]
  if (!contact) return null

  return (
    <>
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
              value={formatContactAddress(address)}
              label={t(`chat.contactLabels.${address.label}`)}
            />
          ))}
        </div>
        <button
          type="button"
          className="w-full cursor-pointer border-t py-2.5 text-center text-sm font-semibold text-primary hover:bg-primary/5"
          onClick={() => {
            setIsContactOpen(true)
            onAction(t('chat.openedContact', { name: contact.formattedName }))
          }}
        >
          {t('chat.viewContact')}
        </button>
      </div>

      <Dialog
        open={isContactOpen}
        onOpenChange={setIsContactOpen}
        title={contact.formattedName}
        description={t('chat.contactDetailsDescription', {
          count: message.contacts.length,
        })}
        icon={
          <Avatar name={contact.formattedName} size="lg" className="shrink-0" />
        }
        size="lg"
      >
        <div className="w-full">
          <div className="grid max-h-[60vh] gap-4 overflow-y-auto pr-1">
            {message.contacts.map((value, index) => (
              <ContactDetails
                key={`${value.formattedName}-${index}`}
                contact={value}
              />
            ))}
          </div>
          <div className="mt-4 flex justify-end">
            <Button variant="outline" onClick={() => setIsContactOpen(false)}>
              {t('chat.close')}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  )
}

function ContactDetails({
  contact,
}: {
  contact: ContactMessage['contacts'][number]
}) {
  const { t } = useTranslation()

  return (
    <section className="rounded-xl border bg-background/60 p-4">
      <div className="flex items-center gap-3 border-b pb-3">
        <Avatar name={contact.formattedName} size="lg" />
        <div className="min-w-0">
          <h3 className="truncate font-bold">{contact.formattedName}</h3>
          {(contact.givenName || contact.familyName) && (
            <p className="truncate text-xs text-muted-foreground">
              {[contact.givenName, contact.familyName]
                .filter(Boolean)
                .join(' ')}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        {(contact.organization || contact.title) && (
          <ContactDetail
            icon={Building2}
            label={t('chat.organization')}
            value={[contact.title, contact.organization]
              .filter(Boolean)
              .join(' · ')}
          />
        )}
        {contact.birthday && (
          <ContactDetail
            icon={CalendarDays}
            label={t('chat.birthday')}
            value={contact.birthday}
          />
        )}
        {contact.phones.map((phone) => (
          <ContactDetail
            key={`phone-${phone.value}`}
            icon={Phone}
            label={t(`chat.contactLabels.${phone.label}`)}
            value={phone.value}
            href={`tel:${phone.value}`}
          />
        ))}
        {contact.emails?.map((email) => (
          <ContactDetail
            key={`email-${email.value}`}
            icon={Mail}
            label={t(`chat.contactLabels.${email.label}`)}
            value={email.value}
            href={`mailto:${email.value}`}
          />
        ))}
        {contact.addresses?.map((address, index) => (
          <ContactDetail
            key={`address-${index}-${address.street ?? ''}`}
            icon={MapPin}
            label={t(`chat.contactLabels.${address.label}`)}
            value={formatContactAddress(address)}
          />
        ))}
        {contact.urls?.map((url) => (
          <ContactDetail
            key={`url-${url.value}`}
            icon={LinkIcon}
            label={t(`chat.contactLabels.${url.label}`)}
            value={url.value}
            href={safeHttpUrl(url.value)}
            external
          />
        ))}
      </div>
    </section>
  )
}

function ContactDetail({
  icon: Icon,
  label,
  value,
  href,
  external = false,
}: {
  icon: typeof Phone
  label: string
  value: string
  href?: string
  external?: boolean
}) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
        {href ? (
          <a
            className="break-words text-primary hover:underline"
            href={href}
            target={external ? '_blank' : undefined}
            rel={external ? 'noreferrer' : undefined}
          >
            {value}
          </a>
        ) : (
          <p className="break-words">{value}</p>
        )}
      </div>
    </div>
  )
}

function formatContactAddress(address: ContactAddress): string {
  return [
    address.street,
    address.city,
    address.region,
    address.postalCode,
    address.country,
  ]
    .filter(Boolean)
    .join(', ')
}

function safeHttpUrl(value: string): string | undefined {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.toString()
      : undefined
  } catch {
    return undefined
  }
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
        <WhatsAppText className="pt-0.5 leading-5" text={message.prompt} />
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
      <WhatsAppText className="leading-5" text={message.text} />
      {message.footer && (
        <WhatsAppText
          className="mt-2 text-[10px] text-muted-foreground"
          text={message.footer}
        />
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
      <WhatsAppText className="font-bold" text={message.title} />
      <WhatsAppText className="mt-1 leading-5" text={message.text} />
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
      <WhatsAppText className="leading-5" text={message.text} />
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
        <LightboxImage
          className="aspect-video w-full object-cover"
          src={item.imageUrl}
          alt={item.imageAlt}
        />
        <div className="p-3">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <WhatsAppText className="font-bold" text={item.title} />
              {item.description && (
                <WhatsAppText
                  className="mt-1 text-xs leading-5 text-muted-foreground"
                  text={item.description}
                />
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
