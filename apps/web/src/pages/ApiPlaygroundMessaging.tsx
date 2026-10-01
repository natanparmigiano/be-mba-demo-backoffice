import type { InferRequestType } from 'hono/client'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiClient } from '../api'
import { Checkbox, Input, Textarea } from '../components/ui'
import {
  PlaygroundOperationCard,
  type PlaygroundOperationState,
} from '../components/api-playground/PlaygroundOperationCard'

type SendMessageInput = InferRequestType<
  (typeof apiClient.api.playground.messaging)[':channelId']['send']['$post']
>['json']
type MediaKind = 'audio' | 'document' | 'image' | 'sticker' | 'video'

export function MessagingPlayground({
  channelId,
  disabled,
}: {
  channelId: string
  disabled: boolean
}) {
  const { t } = useTranslation()

  return (
    <div
      className="grid gap-4"
      role="tabpanel"
      aria-label={t('apiPlayground.messaging.tab')}
    >
      <TextMessageCard channelId={channelId} disabled={disabled} />
      <MediaMessageCard
        kind="image"
        accept="image/*"
        channelId={channelId}
        disabled={disabled}
        hasCaption
      />
      <MediaMessageCard
        kind="video"
        accept="video/*"
        channelId={channelId}
        disabled={disabled}
        hasCaption
      />
      <MediaMessageCard
        kind="audio"
        accept="audio/*"
        channelId={channelId}
        disabled={disabled}
        hasVoice
      />
      <MediaMessageCard
        kind="document"
        channelId={channelId}
        disabled={disabled}
        hasCaption
        hasFileName
      />
      <MediaMessageCard
        kind="sticker"
        accept="image/webp"
        channelId={channelId}
        disabled={disabled}
      />
      <LocationMessageCard channelId={channelId} disabled={disabled} />
      <JsonMessageCard
        kind="contacts"
        channelId={channelId}
        disabled={disabled}
        initialJson={JSON.stringify(
          [
            {
              name: { formatted_name: 'Ada Lovelace', first_name: 'Ada' },
              phones: [{ phone: '+15551234567', type: 'CELL' }],
            },
          ],
          null,
          2,
        )}
      />
      <JsonMessageCard
        kind="interactive"
        channelId={channelId}
        disabled={disabled}
        initialJson={JSON.stringify(
          {
            type: 'button',
            body: { text: 'Choose an option' },
            action: {
              buttons: [
                {
                  type: 'reply',
                  reply: { id: 'confirm', title: 'Confirm' },
                },
              ],
            },
          },
          null,
          2,
        )}
      />
      <TemplateMessageCard channelId={channelId} disabled={disabled} />
      <ReactionMessageCard channelId={channelId} disabled={disabled} />
      <MessageActionCard
        kind="markRead"
        channelId={channelId}
        disabled={disabled}
      />
      <MessageActionCard
        kind="typingIndicator"
        channelId={channelId}
        disabled={disabled}
      />
    </div>
  )
}

function TextMessageCard(props: CardProps) {
  const { t } = useTranslation()
  const operation = useOperation()
  const [to, setTo] = useState('')
  const [body, setBody] = useState('')
  const [replyTo, setReplyTo] = useState('')
  const [previewUrl, setPreviewUrl] = useState(false)

  return (
    <PlaygroundOperationCard
      method="POST"
      title={t('apiPlayground.messaging.text.title')}
      description={t('apiPlayground.messaging.text.description')}
      action={t('apiPlayground.messaging.text.action')}
      state={operation.state}
      disabled={props.disabled}
      defaultOpen
      resultLabel={t('apiPlayground.result')}
      onSubmit={() => {
        void operation.run(() =>
          sendMessage(
            props.channelId,
            {
              messaging_product: 'whatsapp',
              to,
              type: 'text',
              text: { body, preview_url: previewUrl },
              ...messageContext(replyTo),
            },
            t,
          ),
        )
      }}
    >
      <RecipientFields
        to={to}
        replyTo={replyTo}
        onToChange={setTo}
        onReplyToChange={setReplyTo}
      />
      <Textarea
        label={t('apiPlayground.messaging.messageBody')}
        value={body}
        required
        onChange={(event) => setBody(event.currentTarget.value)}
      />
      <Checkbox
        label={t('apiPlayground.messaging.text.previewUrl')}
        checked={previewUrl}
        onChange={(event) => setPreviewUrl(event.currentTarget.checked)}
      />
    </PlaygroundOperationCard>
  )
}

function MediaMessageCard({
  kind,
  accept,
  channelId,
  disabled,
  hasCaption = false,
  hasFileName = false,
  hasVoice = false,
}: CardProps & {
  kind: MediaKind
  accept?: string
  hasCaption?: boolean
  hasFileName?: boolean
  hasVoice?: boolean
}) {
  const { t } = useTranslation()
  const operation = useOperation()
  const [to, setTo] = useState('')
  const [replyTo, setReplyTo] = useState('')
  const [caption, setCaption] = useState('')
  const [fileName, setFileName] = useState('')
  const [voice, setVoice] = useState(false)
  const [file, setFile] = useState<File | null>(null)

  const submit = async () => {
    if (!file) throw new Error(t('apiPlayground.messaging.media.fileRequired'))
    const link = await uploadMedia(channelId, file, t)
    const base = {
      messaging_product: 'whatsapp' as const,
      to,
      ...messageContext(replyTo),
    }
    let message: SendMessageInput
    switch (kind) {
      case 'audio':
        message = { ...base, type: 'audio', audio: { link, voice } }
        break
      case 'document':
        message = {
          ...base,
          type: 'document',
          document: {
            link,
            ...(caption.trim() ? { caption } : {}),
            filename: fileName.trim() || file.name,
          },
        }
        break
      case 'image':
        message = {
          ...base,
          type: 'image',
          image: { link, ...(caption.trim() ? { caption } : {}) },
        }
        break
      case 'sticker':
        message = { ...base, type: 'sticker', sticker: { link } }
        break
      case 'video':
        message = {
          ...base,
          type: 'video',
          video: { link, ...(caption.trim() ? { caption } : {}) },
        }
        break
    }
    return sendMessage(channelId, message, t)
  }

  return (
    <PlaygroundOperationCard
      method="POST"
      title={t(`apiPlayground.messaging.${kind}.title`)}
      description={t(`apiPlayground.messaging.${kind}.description`)}
      action={t(`apiPlayground.messaging.${kind}.action`)}
      state={operation.state}
      disabled={disabled}
      resultLabel={t('apiPlayground.result')}
      onSubmit={() => void operation.run(submit)}
    >
      <RecipientFields
        to={to}
        replyTo={replyTo}
        onToChange={setTo}
        onReplyToChange={setReplyTo}
      />
      <Input
        type="file"
        accept={accept}
        label={t('apiPlayground.messaging.media.file')}
        hint={t('apiPlayground.messaging.media.fileHint')}
        required
        onChange={(event) => setFile(event.currentTarget.files?.[0] ?? null)}
      />
      {hasCaption && (
        <Input
          label={t('apiPlayground.messaging.caption')}
          value={caption}
          onChange={(event) => setCaption(event.currentTarget.value)}
        />
      )}
      {hasFileName && (
        <Input
          label={t('apiPlayground.messaging.document.fileName')}
          hint={t('apiPlayground.messaging.document.fileNameHint')}
          value={fileName}
          onChange={(event) => setFileName(event.currentTarget.value)}
        />
      )}
      {hasVoice && (
        <Checkbox
          label={t('apiPlayground.messaging.audio.voice')}
          checked={voice}
          onChange={(event) => setVoice(event.currentTarget.checked)}
        />
      )}
    </PlaygroundOperationCard>
  )
}

function LocationMessageCard(props: CardProps) {
  const { t } = useTranslation()
  const operation = useOperation()
  const [to, setTo] = useState('')
  const [replyTo, setReplyTo] = useState('')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')

  return (
    <PlaygroundOperationCard
      method="POST"
      title={t('apiPlayground.messaging.location.title')}
      description={t('apiPlayground.messaging.location.description')}
      action={t('apiPlayground.messaging.location.action')}
      state={operation.state}
      disabled={props.disabled}
      resultLabel={t('apiPlayground.result')}
      onSubmit={() => {
        void operation.run(() =>
          sendMessage(
            props.channelId,
            {
              messaging_product: 'whatsapp',
              to,
              type: 'location',
              location: {
                latitude: Number(latitude),
                longitude: Number(longitude),
                ...(name.trim() ? { name } : {}),
                ...(address.trim() ? { address } : {}),
              },
              ...messageContext(replyTo),
            },
            t,
          ),
        )
      }}
    >
      <RecipientFields
        to={to}
        replyTo={replyTo}
        onToChange={setTo}
        onReplyToChange={setReplyTo}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          type="number"
          step="any"
          min="-90"
          max="90"
          label={t('apiPlayground.messaging.location.latitude')}
          value={latitude}
          required
          onChange={(event) => setLatitude(event.currentTarget.value)}
        />
        <Input
          type="number"
          step="any"
          min="-180"
          max="180"
          label={t('apiPlayground.messaging.location.longitude')}
          value={longitude}
          required
          onChange={(event) => setLongitude(event.currentTarget.value)}
        />
        <Input
          label={t('apiPlayground.messaging.location.name')}
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
        />
        <Input
          label={t('apiPlayground.messaging.location.address')}
          value={address}
          onChange={(event) => setAddress(event.currentTarget.value)}
        />
      </div>
    </PlaygroundOperationCard>
  )
}

function JsonMessageCard({
  kind,
  channelId,
  disabled,
  initialJson,
}: CardProps & {
  kind: 'contacts' | 'interactive'
  initialJson: string
}) {
  const { t } = useTranslation()
  const operation = useOperation()
  const [to, setTo] = useState('')
  const [replyTo, setReplyTo] = useState('')
  const [json, setJson] = useState(initialJson)

  const submit = () => {
    const value = parseJsonInput(json, t)
    const base = {
      messaging_product: 'whatsapp' as const,
      to,
      ...messageContext(replyTo),
    }
    return sendMessage(
      channelId,
      (kind === 'contacts'
        ? { ...base, type: 'contacts', contacts: value }
        : {
            ...base,
            type: 'interactive',
            interactive: value,
          }) as SendMessageInput,
      t,
    )
  }

  return (
    <PlaygroundOperationCard
      method="POST"
      title={t(`apiPlayground.messaging.${kind}.title`)}
      description={t(`apiPlayground.messaging.${kind}.description`)}
      action={t(`apiPlayground.messaging.${kind}.action`)}
      state={operation.state}
      disabled={disabled}
      resultLabel={t('apiPlayground.result')}
      onSubmit={() => void operation.run(submit)}
    >
      <RecipientFields
        to={to}
        replyTo={replyTo}
        onToChange={setTo}
        onReplyToChange={setReplyTo}
      />
      <Textarea
        className="min-h-52 font-mono text-xs"
        label={t(`apiPlayground.messaging.${kind}.payload`)}
        hint={t('apiPlayground.messaging.validJson')}
        value={json}
        required
        spellCheck={false}
        onChange={(event) => setJson(event.currentTarget.value)}
      />
    </PlaygroundOperationCard>
  )
}

function TemplateMessageCard(props: CardProps) {
  const { t } = useTranslation()
  const operation = useOperation()
  const [to, setTo] = useState('')
  const [replyTo, setReplyTo] = useState('')
  const [name, setName] = useState('')
  const [language, setLanguage] = useState('en_US')
  const [components, setComponents] = useState('[]')

  const submit = () => {
    const parsed = parseJsonInput(components, t)
    return sendMessage(
      props.channelId,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name,
          language: { code: language },
          components: parsed,
        },
        ...messageContext(replyTo),
      } as SendMessageInput,
      t,
    )
  }

  return (
    <PlaygroundOperationCard
      method="POST"
      title={t('apiPlayground.messaging.template.title')}
      description={t('apiPlayground.messaging.template.description')}
      action={t('apiPlayground.messaging.template.action')}
      state={operation.state}
      disabled={props.disabled}
      resultLabel={t('apiPlayground.result')}
      onSubmit={() => void operation.run(submit)}
    >
      <RecipientFields
        to={to}
        replyTo={replyTo}
        onToChange={setTo}
        onReplyToChange={setReplyTo}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label={t('apiPlayground.messaging.template.name')}
          value={name}
          required
          onChange={(event) => setName(event.currentTarget.value)}
        />
        <Input
          label={t('apiPlayground.messaging.template.language')}
          value={language}
          required
          onChange={(event) => setLanguage(event.currentTarget.value)}
        />
      </div>
      <Textarea
        className="min-h-44 font-mono text-xs"
        label={t('apiPlayground.messaging.template.components')}
        hint={t('apiPlayground.messaging.validJson')}
        value={components}
        required
        spellCheck={false}
        onChange={(event) => setComponents(event.currentTarget.value)}
      />
    </PlaygroundOperationCard>
  )
}

function ReactionMessageCard(props: CardProps) {
  const { t } = useTranslation()
  const operation = useOperation()
  const [to, setTo] = useState('')
  const [messageId, setMessageId] = useState('')
  const [emoji, setEmoji] = useState('👍')

  return (
    <PlaygroundOperationCard
      method="POST"
      title={t('apiPlayground.messaging.reaction.title')}
      description={t('apiPlayground.messaging.reaction.description')}
      action={t('apiPlayground.messaging.reaction.action')}
      state={operation.state}
      disabled={props.disabled}
      resultLabel={t('apiPlayground.result')}
      onSubmit={() => {
        void operation.run(() =>
          sendMessage(
            props.channelId,
            {
              messaging_product: 'whatsapp',
              to,
              type: 'reaction',
              reaction: { message_id: messageId, emoji },
            },
            t,
          ),
        )
      }}
    >
      <Input
        label={t('apiPlayground.messaging.recipient')}
        value={to}
        required
        onChange={(event) => setTo(event.currentTarget.value)}
      />
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
        <Input
          label={t('apiPlayground.messaging.messageId')}
          value={messageId}
          required
          onChange={(event) => setMessageId(event.currentTarget.value)}
        />
        <Input
          label={t('apiPlayground.messaging.reaction.emoji')}
          value={emoji}
          required
          onChange={(event) => setEmoji(event.currentTarget.value)}
        />
      </div>
    </PlaygroundOperationCard>
  )
}

function MessageActionCard({
  kind,
  channelId,
  disabled,
}: CardProps & { kind: 'markRead' | 'typingIndicator' }) {
  const { t } = useTranslation()
  const operation = useOperation()
  const [messageId, setMessageId] = useState('')

  return (
    <PlaygroundOperationCard
      method="POST"
      title={t(`apiPlayground.messaging.${kind}.title`)}
      description={t(`apiPlayground.messaging.${kind}.description`)}
      action={t(`apiPlayground.messaging.${kind}.action`)}
      state={operation.state}
      disabled={disabled}
      resultLabel={t('apiPlayground.result')}
      onSubmit={() => {
        void operation.run(async () => {
          const endpoint = apiClient.api.playground.messaging[':channelId']
          const response =
            kind === 'markRead'
              ? await endpoint['mark-read'].$post({
                  param: { channelId },
                  json: { messageId },
                })
              : await endpoint['typing-indicator'].$post({
                  param: { channelId },
                  json: { messageId },
                })
          return readApiResult(response, t)
        })
      }}
    >
      <Input
        label={t('apiPlayground.messaging.messageId')}
        value={messageId}
        required
        onChange={(event) => setMessageId(event.currentTarget.value)}
      />
    </PlaygroundOperationCard>
  )
}

function RecipientFields({
  to,
  replyTo,
  onToChange,
  onReplyToChange,
}: {
  to: string
  replyTo: string
  onToChange: (value: string) => void
  onReplyToChange: (value: string) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Input
        label={t('apiPlayground.messaging.recipient')}
        hint={t('apiPlayground.messaging.recipientHint')}
        value={to}
        required
        onChange={(event) => onToChange(event.currentTarget.value)}
      />
      <Input
        label={t('apiPlayground.messaging.replyTo')}
        hint={t('apiPlayground.messaging.replyToHint')}
        value={replyTo}
        onChange={(event) => onReplyToChange(event.currentTarget.value)}
      />
    </div>
  )
}

interface CardProps {
  channelId: string
  disabled: boolean
}

function useOperation() {
  const { t } = useTranslation()
  const [state, setState] = useState<PlaygroundOperationState>({
    status: 'idle',
  })

  const run = async (request: () => Promise<unknown>) => {
    setState({ status: 'loading' })
    try {
      setState({ status: 'success', result: await request() })
    } catch (error) {
      setState({
        status: 'error',
        message:
          error instanceof Error
            ? error.message
            : t('apiPlayground.operationFailed'),
      })
    }
  }

  return { state, run }
}

async function sendMessage(
  channelId: string,
  message: SendMessageInput,
  t: ReturnType<typeof useTranslation>['t'],
): Promise<unknown> {
  const response = await apiClient.api.playground.messaging[':channelId'][
    'send'
  ].$post({ param: { channelId }, json: message })
  return readApiResult(response, t)
}

async function uploadMedia(
  channelId: string,
  file: File,
  t: ReturnType<typeof useTranslation>['t'],
): Promise<string> {
  if (file.size > 100 * 1024 * 1024) {
    throw new Error(t('apiPlayground.messaging.media.fileTooLarge'))
  }
  const contentType = file.type || 'application/octet-stream'
  const signedResponse = await apiClient.api.playground.messaging[':channelId'][
    'media-upload'
  ].$post({
    param: { channelId },
    json: { fileName: file.name, contentType, size: file.size },
  })
  const signed = await readApiResult(signedResponse, t)
  if (
    typeof signed !== 'object' ||
    signed === null ||
    !('uploadUrl' in signed) ||
    typeof signed.uploadUrl !== 'string' ||
    !('mediaUrl' in signed) ||
    typeof signed.mediaUrl !== 'string'
  ) {
    throw new Error(t('apiPlayground.unexpectedResponse'))
  }

  const uploadResponse = await fetch(signed.uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': contentType },
    body: file,
  })
  if (!uploadResponse.ok) {
    throw new Error(t('apiPlayground.messaging.media.uploadFailed'))
  }
  return signed.mediaUrl
}

function messageContext(replyTo: string) {
  return replyTo.trim() ? { context: { message_id: replyTo.trim() } } : {}
}

function parseJsonInput(
  value: string,
  t: ReturnType<typeof useTranslation>['t'],
): unknown {
  try {
    return JSON.parse(value) as unknown
  } catch {
    throw new Error(t('apiPlayground.messaging.validJson'))
  }
}

async function readApiResult(
  response: Response,
  t: ReturnType<typeof useTranslation>['t'],
): Promise<unknown> {
  const body: unknown = await response.json()
  if (!response.ok) {
    throw new Error(
      readMessage(body) ??
        t('apiPlayground.requestFailed', { status: response.status }),
    )
  }
  if (typeof body !== 'object' || body === null || !('result' in body)) {
    throw new Error(t('apiPlayground.unexpectedResponse'))
  }
  return body.result
}

function readMessage(value: unknown): string | undefined {
  return typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    typeof value.message === 'string'
    ? value.message
    : undefined
}
