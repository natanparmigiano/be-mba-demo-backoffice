import {
  ContactRound,
  FileText,
  Headphones,
  Image as ImageIcon,
  LayoutTemplate,
  MapPin,
  Mic,
  Plus,
  Send,
  Smile,
  Square,
  Sticker,
  Video,
  X,
} from 'lucide-react'
import OpusRecorder from 'opus-recorder'
import encoderWorkerUrl from 'opus-recorder/dist/encoderWorker.min.js?url'
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import {
  Button,
  Dialog,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
} from '../ui'
import { EmojiPickerPanel, type StickerLibraryItem } from './EmojiPicker'
import {
  TemplateMessageDialog,
  type ComposerTemplateDraft,
  type ComposerTemplatePage,
} from './TemplateMessageDialog'

export type ComposerMediaKind =
  'audio' | 'document' | 'image' | 'sticker' | 'video'

export type ChatComposerDraft =
  | { type: 'text'; text: string }
  | {
      type: 'media'
      kind: ComposerMediaKind
      file: File
      caption?: string
      voice?: boolean
    }
  | {
      type: 'contacts'
      contacts: Array<{
        name: {
          formatted_name: string
          first_name?: string
          last_name?: string
        }
        phones?: Array<{ phone: string; type: 'CELL' }>
        emails?: Array<{ email: string; type: 'WORK' }>
        org?: { company?: string }
      }>
    }
  | {
      type: 'location'
      location: {
        latitude: number
        longitude: number
        name?: string
        address?: string
      }
    }
  | ComposerTemplateDraft

type ComposerDialog = 'contact' | 'location' | 'template' | null

const WAVEFORM_BAR_COUNT = 48
const EMPTY_WAVEFORM = Array.from({ length: WAVEFORM_BAR_COUNT }, () => 0.08)

const MEDIA_ACCEPT: Record<ComposerMediaKind, string> = {
  audio: 'audio/aac,audio/amr,audio/mp4,audio/mpeg,audio/ogg',
  document:
    '.doc,.docx,.pdf,.ppt,.pptx,.xls,.xlsx,.txt,application/msword,application/pdf,text/plain',
  image: 'image/jpeg,image/png',
  sticker: 'image/webp',
  video: 'video/3gpp,video/mp4',
}

export function ChatComposer({
  disabled = false,
  outsideCustomerServiceWindow = false,
  addSticker,
  loadStickers,
  loadTemplates,
  resolveSticker,
  onSend,
}: {
  disabled?: boolean
  outsideCustomerServiceWindow?: boolean
  addSticker: (file: File) => Promise<StickerLibraryItem>
  loadStickers: () => Promise<StickerLibraryItem[]>
  loadTemplates: (after?: string) => Promise<ComposerTemplatePage>
  resolveSticker: (sticker: StickerLibraryItem) => Promise<File>
  onSend: (draft: ChatComposerDraft) => Promise<void>
}) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const [media, setMedia] = useState<{
    file: File
    kind: ComposerMediaKind
    voice?: boolean
  } | null>(null)
  const [dialog, setDialog] = useState<ComposerDialog>(null)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [waveform, setWaveform] = useState(EMPTY_WAVEFORM)
  const [voicePreviewUrl, setVoicePreviewUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const pendingMediaKind = useRef<ComposerMediaKind>('image')
  const recorderRef = useRef<OpusRecorder | null>(null)
  const recordingStreamRef = useRef<MediaStream | null>(null)
  const recordingAudioContextRef = useRef<AudioContext | null>(null)
  const waveformFrameRef = useRef<number | null>(null)

  const stopRecordingAnalysis = (reset = true) => {
    if (waveformFrameRef.current !== null) {
      cancelAnimationFrame(waveformFrameRef.current)
      waveformFrameRef.current = null
    }
    const audioContext = recordingAudioContextRef.current
    recordingAudioContextRef.current = null
    if (audioContext && audioContext.state !== 'closed') {
      void audioContext.close()
    }
    if (reset) setWaveform(EMPTY_WAVEFORM)
  }

  const startRecordingAnalysis = (
    stream: MediaStream,
  ): MediaStreamAudioSourceNode => {
    stopRecordingAnalysis()
    const audioContext = new AudioContext()
    const source = audioContext.createMediaStreamSource(stream)
    const analyser = audioContext.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.72
    source.connect(analyser)
    recordingAudioContextRef.current = audioContext
    if (audioContext.state === 'suspended') {
      void audioContext.resume().catch(() => undefined)
    }
    const frequencies = new Uint8Array(analyser.frequencyBinCount)
    let lastUpdate = 0

    const sample = (time: number) => {
      if (time - lastUpdate >= 40) {
        analyser.getByteFrequencyData(frequencies)
        const usefulBins = Math.max(
          WAVEFORM_BAR_COUNT,
          Math.floor(frequencies.length * 0.72),
        )
        setWaveform(
          Array.from({ length: WAVEFORM_BAR_COUNT }, (_, index) => {
            const start = Math.floor((index * usefulBins) / WAVEFORM_BAR_COUNT)
            const end = Math.max(
              start + 1,
              Math.floor(((index + 1) * usefulBins) / WAVEFORM_BAR_COUNT),
            )
            let peak = 0
            for (let bin = start; bin < end; bin += 1) {
              peak = Math.max(peak, frequencies[bin] ?? 0)
            }
            return Math.max(0.08, peak / 255)
          }),
        )
        lastUpdate = time
      }
      waveformFrameRef.current = requestAnimationFrame(sample)
    }
    waveformFrameRef.current = requestAnimationFrame(sample)
    return source
  }

  useEffect(() => {
    if (!isRecording) return
    const timer = window.setInterval(
      () => setRecordingSeconds((value) => value + 1),
      1_000,
    )
    return () => window.clearInterval(timer)
  }, [isRecording])

  useEffect(() => {
    if (!media?.voice) {
      setVoicePreviewUrl(null)
      return
    }
    const previewUrl = URL.createObjectURL(media.file)
    setVoicePreviewUrl(previewUrl)
    return () => URL.revokeObjectURL(previewUrl)
  }, [media])

  useEffect(
    () => () => {
      if (recorderRef.current) {
        recorderRef.current.ondataavailable = () => undefined
        recorderRef.current.onstop = () => undefined
      }
      recorderRef.current?.close()
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop())
      if (waveformFrameRef.current !== null) {
        cancelAnimationFrame(waveformFrameRef.current)
      }
      const audioContext = recordingAudioContextRef.current
      if (audioContext && audioContext.state !== 'closed') {
        void audioContext.close()
      }
    },
    [],
  )

  const runSend = async (
    draft: ChatComposerDraft,
    propagateError = false,
  ): Promise<boolean> => {
    if (
      disabled ||
      isSending ||
      (outsideCustomerServiceWindow && draft.type !== 'template')
    ) {
      return false
    }
    setIsSending(true)
    setError(null)
    try {
      await onSend(draft)
      return true
    } catch (reason) {
      const message =
        reason instanceof Error ? reason.message : t('chatComposer.sendFailed')
      if (propagateError) throw new Error(message)
      setError(message)
      return false
    } finally {
      setIsSending(false)
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const caption = media?.voice ? '' : text.trim()
    if (media) {
      if (
        await runSend({
          type: 'media',
          kind: media.kind,
          file: media.file,
          voice: media.voice,
          ...(caption ? { caption } : {}),
        })
      ) {
        setMedia(null)
        setText('')
      }
      return
    }
    if (!caption) return
    if (await runSend({ type: 'text', text: caption })) setText('')
  }

  const chooseMedia = (kind: ComposerMediaKind) => {
    pendingMediaKind.current = kind
    if (fileInputRef.current) {
      fileInputRef.current.accept = MEDIA_ACCEPT[kind]
      fileInputRef.current.value = ''
      fileInputRef.current.click()
    }
  }

  const selectedFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    if (file) {
      setMedia({ file, kind: pendingMediaKind.current })
      setError(null)
      inputRef.current?.focus()
    }
  }

  const insertEmoji = (emoji: string) => {
    const input = inputRef.current
    const start = input?.selectionStart ?? text.length
    const end = input?.selectionEnd ?? start
    setText(`${text.slice(0, start)}${emoji}${text.slice(end)}`)
    requestAnimationFrame(() => {
      input?.focus()
      input?.setSelectionRange(start + emoji.length, start + emoji.length)
    })
  }

  const startRecording = async () => {
    if (
      !navigator.mediaDevices?.getUserMedia ||
      !OpusRecorder.isRecordingSupported()
    ) {
      setError(t('chatComposer.recordingUnsupported'))
      return
    }
    let recorder: OpusRecorder | null = null
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      recordingStreamRef.current = stream
      const sourceNode = startRecordingAnalysis(stream)
      let encodedAudio: Uint8Array | null = null
      recorder = new OpusRecorder({
        encoderApplication: 2048,
        encoderBitRate: 24_000,
        encoderComplexity: 5,
        encoderPath: encoderWorkerUrl,
        encoderSampleRate: 48_000,
        monitorGain: 0,
        numberOfChannels: 1,
        sourceNode,
        streamPages: false,
      })
      recorderRef.current = recorder
      recorder.ondataavailable = (data) => {
        encodedAudio = data
      }
      recorder.onstop = () => {
        if (encodedAudio?.byteLength) {
          const encodedBytes = new Uint8Array(encodedAudio.byteLength)
          encodedBytes.set(encodedAudio)
          const blob = new Blob([encodedBytes.buffer], { type: 'audio/ogg' })
          setMedia({
            kind: 'audio',
            voice: true,
            file: new File([blob], `voice-${Date.now()}.ogg`, {
              type: 'audio/ogg',
            }),
          })
          setText('')
        } else {
          setError(t('chatComposer.recordingEncodingFailed'))
        }
        stream.getTracks().forEach((track) => track.stop())
        recordingStreamRef.current = null
        recorderRef.current = null
        stopRecordingAnalysis()
        setIsRecording(false)
      }
      setError(null)
      setRecordingSeconds(0)
      setIsRecording(true)
      await recorder.start()
    } catch (reason) {
      if (recorder) {
        recorder.ondataavailable = () => undefined
        recorder.onstop = () => undefined
        recorder.close()
      }
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop())
      recordingStreamRef.current = null
      stopRecordingAnalysis()
      setIsRecording(false)
      setError(
        reason instanceof DOMException && reason.name === 'NotAllowedError'
          ? t('chatComposer.microphoneDenied')
          : t('chatComposer.recordingEncodingFailed'),
      )
    }
  }

  const stopRecording = () => recorderRef.current?.stop()
  const canSend = Boolean(media || text.trim()) && !isRecording

  return (
    <>
      <div className="shrink-0 border-t bg-card">
        {outsideCustomerServiceWindow && (
          <p className="px-3 pt-3 text-center text-xs text-muted-foreground">
            {t('chatComposer.outsideCustomerServiceWindow')}
          </p>
        )}
        {media && (
          <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2 text-xs">
            <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
              {mediaIcon(media.kind)}
            </span>
            {media.voice && voicePreviewUrl ? (
              <div className="min-w-0 flex-1">
                <span className="mb-1 block font-semibold">
                  {t('chatComposer.voicePreview')}
                </span>
                <audio
                  className="h-9 w-full max-w-md"
                  controls
                  preload="metadata"
                  src={voicePreviewUrl}
                  aria-label={t('chatComposer.voicePreview')}
                />
              </div>
            ) : (
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">
                  {media.file.name}
                </span>
                <span className="text-muted-foreground">
                  {formatBytes(media.file.size)}
                </span>
              </span>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label={t('chatComposer.removeAttachment')}
              onClick={() => setMedia(null)}
            >
              <X className="size-4" aria-hidden />
            </Button>
          </div>
        )}
        {error && (
          <p
            className="border-b bg-destructive/8 px-3 py-2 text-xs text-destructive"
            role="alert"
          >
            {error}
          </p>
        )}
        <form
          className="flex items-center gap-2 p-2 sm:p-3"
          onSubmit={(event) => void submit(event)}
        >
          <input
            ref={fileInputRef}
            type="file"
            hidden
            onChange={selectedFile}
          />
          <AttachmentMenu
            disabled={
              disabled ||
              outsideCustomerServiceWindow ||
              isSending ||
              isRecording ||
              Boolean(media?.voice)
            }
            onMedia={chooseMedia}
            onDialog={setDialog}
          />
          <EmojiPicker
            disabled={
              disabled ||
              outsideCustomerServiceWindow ||
              isSending ||
              isRecording ||
              Boolean(media?.voice)
            }
            addSticker={addSticker}
            loadStickers={loadStickers}
            onSelect={insertEmoji}
            onSelectSticker={async (sticker) => {
              const file = await resolveSticker(sticker)
              await runSend({ type: 'media', kind: 'sticker', file }, true)
            }}
          />
          {outsideCustomerServiceWindow ? (
            <Button
              type="button"
              className="h-11 min-w-0 flex-1 rounded-2xl"
              onClick={() => setDialog('template')}
            >
              <LayoutTemplate className="size-4" aria-hidden />
              {t('chatComposer.sendTemplateMessage')}
            </Button>
          ) : isRecording ? (
            <div
              className="flex h-11 min-w-0 flex-1 items-center gap-3 rounded-2xl border bg-background px-4 text-primary"
              role="status"
              aria-label={t('chatComposer.recording', {
                seconds: formatDuration(recordingSeconds),
              })}
            >
              <span className="size-2 shrink-0 animate-pulse rounded-full bg-destructive" />
              <time className="w-10 shrink-0 font-mono text-xs font-semibold text-foreground">
                {formatDuration(recordingSeconds)}
              </time>
              <span
                className="flex h-7 min-w-0 flex-1 items-center gap-px overflow-hidden"
                aria-hidden
              >
                {waveform.map((level, index) => (
                  <span
                    key={index}
                    className="min-w-px flex-1 rounded-full bg-current transition-[height] duration-75"
                    style={{ height: `${Math.max(3, level * 26)}px` }}
                  />
                ))}
              </span>
            </div>
          ) : media?.voice ? (
            <div className="flex h-11 min-w-0 flex-1 items-center rounded-2xl border bg-background px-4 text-sm font-medium text-muted-foreground">
              {t('chatComposer.voiceReady')}
            </div>
          ) : (
            <input
              ref={inputRef}
              className="h-11 min-w-0 flex-1 rounded-2xl border bg-background px-4 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring/15 disabled:opacity-60"
              value={text}
              disabled={disabled || isSending}
              placeholder={
                media
                  ? t('chatComposer.captionPlaceholder')
                  : t('chatComposer.placeholder')
              }
              aria-label={t('chatComposer.message')}
              onChange={(event) => setText(event.currentTarget.value)}
            />
          )}
          {outsideCustomerServiceWindow ? (
            <Button
              type="button"
              size="icon"
              className="size-11 shrink-0 rounded-2xl"
              disabled
              aria-label={t('chatComposer.recordAudio')}
            >
              <Mic className="size-5" aria-hidden />
            </Button>
          ) : isRecording ? (
            <Button
              type="button"
              size="icon"
              variant="danger"
              className="size-11 shrink-0 rounded-2xl"
              aria-label={t('chatComposer.stopRecording')}
              onClick={stopRecording}
            >
              <Square className="size-4 fill-current" aria-hidden />
            </Button>
          ) : canSend ? (
            <Button
              type="submit"
              size="icon"
              className="size-11 shrink-0 rounded-2xl"
              isLoading={isSending}
              aria-label={t('chatComposer.send')}
            >
              <Send className="size-4" aria-hidden />
            </Button>
          ) : (
            <Button
              type="button"
              size="icon"
              className="size-11 shrink-0 rounded-2xl"
              disabled={disabled || isSending}
              aria-label={t('chatComposer.recordAudio')}
              onClick={() => void startRecording()}
            >
              <Mic className="size-5" aria-hidden />
            </Button>
          )}
        </form>
      </div>

      <StructuredMessageDialog
        kind={dialog === 'template' ? null : dialog}
        sending={isSending}
        onClose={() => setDialog(null)}
        onSend={async (draft) => {
          if (await runSend(draft, true)) setDialog(null)
        }}
      />
      <TemplateMessageDialog
        open={dialog === 'template'}
        sending={isSending}
        loadTemplates={loadTemplates}
        onClose={() => setDialog(null)}
        onSend={async (draft) => {
          if (await runSend(draft, true)) setDialog(null)
        }}
      />
    </>
  )
}

function AttachmentMenu({
  disabled,
  onMedia,
  onDialog,
}: {
  disabled: boolean
  onMedia: (kind: ComposerMediaKind) => void
  onDialog: (kind: Exclude<ComposerDialog, null>) => void
}) {
  const { t } = useTranslation()
  return (
    <Menu>
      <MenuTrigger
        disabled={disabled}
        className="grid size-11 shrink-0 place-items-center rounded-2xl border bg-background text-muted-foreground hover:bg-muted"
        aria-label={t('chatComposer.attach')}
      >
        <Plus className="size-5" aria-hidden />
      </MenuTrigger>
      <MenuContent
        align="start"
        side="top"
        className="grid min-w-64 grid-cols-2"
      >
        <MenuItem onClick={() => onMedia('image')}>
          <ImageIcon className="size-4" />
          {t('chatComposer.types.image')}
        </MenuItem>
        <MenuItem onClick={() => onMedia('video')}>
          <Video className="size-4" />
          {t('chatComposer.types.video')}
        </MenuItem>
        <MenuItem onClick={() => onMedia('document')}>
          <FileText className="size-4" />
          {t('chatComposer.types.document')}
        </MenuItem>
        <MenuItem onClick={() => onMedia('audio')}>
          <Headphones className="size-4" />
          {t('chatComposer.types.audio')}
        </MenuItem>
        <MenuItem onClick={() => onDialog('contact')}>
          <ContactRound className="size-4" />
          {t('chatComposer.types.contact')}
        </MenuItem>
        <MenuItem onClick={() => onDialog('location')}>
          <MapPin className="size-4" />
          {t('chatComposer.types.location')}
        </MenuItem>
        <MenuItem onClick={() => onDialog('template')}>
          <LayoutTemplate className="size-4" />
          {t('chatComposer.types.template')}
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}

function EmojiPicker({
  disabled,
  addSticker,
  loadStickers,
  onSelect,
  onSelectSticker,
}: {
  disabled: boolean
  addSticker: (file: File) => Promise<StickerLibraryItem>
  loadStickers: () => Promise<StickerLibraryItem[]>
  onSelect: (emoji: string) => void
  onSelectSticker: (sticker: StickerLibraryItem) => Promise<void>
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [stickers, setStickers] = useState<StickerLibraryItem[]>([])
  const [stickersLoading, setStickersLoading] = useState(false)
  const [stickerError, setStickerError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('pointerdown', closeOnOutsidePress)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    let active = true
    setStickersLoading(true)
    setStickerError(null)
    void loadStickers()
      .then((items) => {
        if (active) setStickers(items)
      })
      .catch((reason: unknown) => {
        if (active) {
          setStickerError(
            reason instanceof Error
              ? reason.message
              : t('chatComposer.stickerLibraryFailed'),
          )
        }
      })
      .finally(() => {
        if (active) setStickersLoading(false)
      })
    return () => {
      active = false
    }
  }, [loadStickers, open, t])

  const handleAddSticker = async (file: File) => {
    setStickersLoading(true)
    setStickerError(null)
    try {
      const sticker = await addSticker(file)
      setStickers((current) => [
        sticker,
        ...current.filter((item) => item.id !== sticker.id),
      ])
    } catch (reason) {
      setStickerError(
        reason instanceof Error
          ? reason.message
          : t('chatComposer.stickerLibraryFailed'),
      )
    } finally {
      setStickersLoading(false)
    }
  }

  const handleSelectSticker = async (sticker: StickerLibraryItem) => {
    setStickerError(null)
    try {
      await onSelectSticker(sticker)
      setOpen(false)
    } catch (reason) {
      setStickerError(
        reason instanceof Error ? reason.message : t('chatComposer.sendFailed'),
      )
    }
  }

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-2xl border bg-background text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/25 disabled:cursor-default disabled:opacity-50"
        aria-label={t('chatComposer.emoji')}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Smile className="size-5" aria-hidden />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={t('chatComposer.emojiTitle')}
          className="absolute bottom-full left-0 z-50 mb-2"
        >
          <EmojiPickerPanel
            disabled={disabled}
            stickers={stickers}
            stickersLoading={stickersLoading}
            stickerError={stickerError}
            onAddSticker={handleAddSticker}
            onSelect={onSelect}
            onSelectSticker={handleSelectSticker}
          />
        </div>
      )}
    </div>
  )
}

function StructuredMessageDialog({
  kind,
  sending,
  onClose,
  onSend,
}: {
  kind: ComposerDialog
  sending: boolean
  onClose: () => void
  onSend: (draft: ChatComposerDraft) => Promise<void>
}) {
  const { t } = useTranslation()
  const [fields, setFields] = useState<Record<string, string>>({})
  const [dialogError, setDialogError] = useState<string | null>(null)

  useEffect(() => {
    setFields({})
    setDialogError(null)
  }, [kind])
  if (!kind) return null

  const update = (name: string, value: string) =>
    setFields((current) => ({ ...current, [name]: value }))
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setDialogError(null)
    try {
      if (kind === 'contact') {
        const formattedName = fields.name?.trim()
        if (!formattedName) return
        const [firstName, ...remainingNames] = formattedName.split(/\s+/)
        const lastName = remainingNames.join(' ')
        await onSend({
          type: 'contacts',
          contacts: [
            {
              name: {
                formatted_name: formattedName,
                first_name: firstName,
                ...(lastName ? { last_name: lastName } : {}),
              },
              ...(fields.phone?.trim()
                ? {
                    phones: [
                      { phone: fields.phone.trim(), type: 'CELL' as const },
                    ],
                  }
                : {}),
              ...(fields.email?.trim()
                ? {
                    emails: [
                      { email: fields.email.trim(), type: 'WORK' as const },
                    ],
                  }
                : {}),
              ...(fields.company?.trim()
                ? { org: { company: fields.company.trim() } }
                : {}),
            },
          ],
        })
      }
      if (kind === 'location') {
        const latitude = Number(fields.latitude)
        const longitude = Number(fields.longitude)
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return
        await onSend({
          type: 'location',
          location: {
            latitude,
            longitude,
            ...(fields.name?.trim() ? { name: fields.name.trim() } : {}),
            ...(fields.address?.trim()
              ? { address: fields.address.trim() }
              : {}),
          },
        })
      }
    } catch (reason) {
      setDialogError(
        reason instanceof Error ? reason.message : t('chatComposer.sendFailed'),
      )
    }
  }

  const useCurrentLocation = () => {
    navigator.geolocation?.getCurrentPosition((position) => {
      setFields((current) => ({
        ...current,
        latitude: String(position.coords.latitude),
        longitude: String(position.coords.longitude),
      }))
    })
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t(`chatComposer.dialogs.${kind}.title`)}
      description={t(`chatComposer.dialogs.${kind}.description`)}
    >
      <form
        className="grid w-full gap-4"
        onSubmit={(event) => void submit(event)}
      >
        {dialogError && (
          <p
            className="rounded-lg bg-destructive/8 p-3 text-xs text-destructive"
            role="alert"
          >
            {dialogError}
          </p>
        )}
        {kind === 'contact' && (
          <>
            <Input
              label={t('chatComposer.fields.name')}
              required
              value={fields.name ?? ''}
              onChange={(event) => update('name', event.currentTarget.value)}
            />
            <Input
              label={t('chatComposer.fields.phone')}
              value={fields.phone ?? ''}
              onChange={(event) => update('phone', event.currentTarget.value)}
            />
            <Input
              label={t('chatComposer.fields.email')}
              type="email"
              value={fields.email ?? ''}
              onChange={(event) => update('email', event.currentTarget.value)}
            />
            <Input
              label={t('chatComposer.fields.company')}
              value={fields.company ?? ''}
              onChange={(event) => update('company', event.currentTarget.value)}
            />
          </>
        )}
        {kind === 'location' && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label={t('chatComposer.fields.latitude')}
                required
                inputMode="decimal"
                value={fields.latitude ?? ''}
                onChange={(event) =>
                  update('latitude', event.currentTarget.value)
                }
              />
              <Input
                label={t('chatComposer.fields.longitude')}
                required
                inputMode="decimal"
                value={fields.longitude ?? ''}
                onChange={(event) =>
                  update('longitude', event.currentTarget.value)
                }
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={useCurrentLocation}
            >
              <MapPin className="size-4" />
              {t('chatComposer.useCurrentLocation')}
            </Button>
            <Input
              label={t('chatComposer.fields.locationName')}
              value={fields.name ?? ''}
              onChange={(event) => update('name', event.currentTarget.value)}
            />
            <Input
              label={t('chatComposer.fields.address')}
              value={fields.address ?? ''}
              onChange={(event) => update('address', event.currentTarget.value)}
            />
          </>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {t('chatComposer.cancel')}
          </Button>
          <Button type="submit" isLoading={sending}>
            {t('chatComposer.send')}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

function mediaIcon(kind: ComposerMediaKind) {
  const Icon =
    kind === 'image'
      ? ImageIcon
      : kind === 'video'
        ? Video
        : kind === 'document'
          ? FileText
          : kind === 'sticker'
            ? Sticker
            : Headphones
  return <Icon className="size-4" aria-hidden />
}

function formatDuration(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function formatBytes(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`
  if (bytes < 1_024 * 1_024) return `${(bytes / 1_024).toFixed(1)} KB`
  return `${(bytes / (1_024 * 1_024)).toFixed(1)} MB`
}
