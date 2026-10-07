import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiClient } from '../api'
import {
  PlaygroundOperationCard,
  usePlaygroundOperation,
} from '../components/api-playground'
import { Checkbox, Input, Select } from '@mba-desk/ui'

type MediaKind = keyof typeof MEDIA_OPTIONS

const MEDIA_OPTIONS = {
  audio: {
    accept: 'audio/aac,audio/amr,audio/mp4,audio/mpeg,audio/ogg',
    limit: '16 MB',
  },
  document: {
    accept:
      'application/msword,application/pdf,application/vnd.ms-excel,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain',
    limit: '100 MB',
  },
  image: { accept: 'image/jpeg,image/png', limit: '5 MB' },
  sticker: { accept: 'image/webp', limit: '100 KB' },
  video: { accept: 'video/3gpp,video/mp4', limit: '16 MB' },
} as const

export function MediaPlayground({
  channelId,
  phoneNumberId,
  mutationDisabled,
}: {
  channelId: string
  phoneNumberId: string
  mutationDisabled: boolean
}) {
  const { t } = useTranslation()

  return (
    <div
      className="grid gap-4"
      role="tabpanel"
      aria-label={t('apiPlayground.media.tab')}
    >
      <UploadMediaCard
        {...{ channelId, phoneNumberId }}
        disabled={mutationDisabled}
      />
      <MediaMetadataCard
        {...{ channelId, phoneNumberId }}
        disabled={!channelId}
      />
      <DownloadMediaCard
        {...{ channelId, phoneNumberId }}
        disabled={!channelId}
      />
      <DeleteMediaCard
        {...{ channelId, phoneNumberId }}
        disabled={mutationDisabled}
      />
    </div>
  )
}

function UploadMediaCard(props: CardProps) {
  const { t } = useTranslation()
  const operation = usePlaygroundOperation()
  const [kind, setKind] = useState<MediaKind>('image')
  const [file, setFile] = useState<File | null>(null)
  const option = MEDIA_OPTIONS[kind]

  return (
    <PlaygroundOperationCard
      method="POST"
      request={{
        path: graphMediaPath(props.phoneNumberId || 'PHONE_NUMBER_ID', 'media'),
        contentType: 'multipart/form-data',
        body: {
          messaging_product: 'whatsapp',
          file: file
            ? { name: file.name, type: file.type, size: file.size }
            : {
                name: `<${kind.toUpperCase()}_FILE>`,
                type: option.accept.split(',')[0],
              },
        },
      }}
      title={t('apiPlayground.media.upload.title')}
      description={t('apiPlayground.media.upload.description')}
      action={t('apiPlayground.media.upload.action')}
      state={operation.state}
      disabled={props.disabled}
      defaultOpen
      resultLabel={t('apiPlayground.result')}
      onSubmit={() => {
        void operation.run(async () => {
          if (!file) {
            throw new Error(t('apiPlayground.media.upload.fileRequired'))
          }
          const response = await apiClient.api.playground.media[':channelId'][
            'upload'
          ].$post({
            param: { channelId: props.channelId },
            form: { kind, file },
          })
          return readApiResult(response, t)
        })
      }}
    >
      <Select
        label={t('apiPlayground.media.upload.kind')}
        value={kind}
        onChange={(event) => {
          setKind(event.currentTarget.value as MediaKind)
          setFile(null)
        }}
      >
        {(Object.keys(MEDIA_OPTIONS) as MediaKind[]).map((value) => (
          <option key={value} value={value}>
            {t(`apiPlayground.media.kinds.${value}`)}
          </option>
        ))}
      </Select>
      <Input
        key={kind}
        type="file"
        accept={option.accept}
        label={t('apiPlayground.media.upload.file')}
        hint={t('apiPlayground.media.upload.fileHint', {
          types: option.accept,
          limit: option.limit,
        })}
        required
        onChange={(event) => setFile(event.currentTarget.files?.[0] ?? null)}
      />
    </PlaygroundOperationCard>
  )
}

function MediaMetadataCard(props: CardProps) {
  const { t } = useTranslation()
  const operation = usePlaygroundOperation()
  const [mediaId, setMediaId] = useState('')

  return (
    <PlaygroundOperationCard
      method="GET"
      request={{
        path: graphMediaPath(mediaId || '<MEDIA_ID>'),
        query: { phone_number_id: props.phoneNumberId || 'PHONE_NUMBER_ID' },
      }}
      title={t('apiPlayground.media.metadata.title')}
      description={t('apiPlayground.media.metadata.description')}
      action={t('apiPlayground.media.metadata.action')}
      state={operation.state}
      disabled={props.disabled}
      resultLabel={t('apiPlayground.result')}
      onSubmit={() => {
        void operation.run(async () => {
          const response = await apiClient.api.playground.media[':channelId'][
            ':mediaId'
          ].$get({ param: { channelId: props.channelId, mediaId } })
          return readApiResult(response, t)
        })
      }}
    >
      <MediaIdInput value={mediaId} onChange={setMediaId} />
    </PlaygroundOperationCard>
  )
}

function DownloadMediaCard(props: CardProps) {
  const { t } = useTranslation()
  const operation = usePlaygroundOperation()
  const [mediaId, setMediaId] = useState('')

  return (
    <PlaygroundOperationCard
      method="GET"
      request={{
        path: graphMediaPath(mediaId || '<MEDIA_ID>'),
        query: { phone_number_id: props.phoneNumberId || 'PHONE_NUMBER_ID' },
      }}
      title={t('apiPlayground.media.download.title')}
      description={t('apiPlayground.media.download.description')}
      action={t('apiPlayground.media.download.action')}
      state={operation.state}
      disabled={props.disabled}
      resultLabel={t('apiPlayground.result')}
      onSubmit={() => {
        void operation.run(async () => {
          const response = await apiClient.api.playground.media[':channelId'][
            ':mediaId'
          ].download.$get({
            param: { channelId: props.channelId, mediaId },
          })
          if (!response.ok) throw new Error(await readApiError(response, t))

          const blob = await response.blob()
          const fileName =
            response.headers
              .get('content-disposition')
              ?.match(/filename="?([^";]+)"?/i)?.[1] ?? mediaId
          const objectUrl = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = objectUrl
          link.download = fileName
          document.body.append(link)
          link.click()
          link.remove()
          window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)

          return {
            mediaId,
            fileName,
            contentType: blob.type || null,
            size: blob.size,
          }
        })
      }}
    >
      <MediaIdInput value={mediaId} onChange={setMediaId} />
    </PlaygroundOperationCard>
  )
}

function DeleteMediaCard(props: CardProps) {
  const { t } = useTranslation()
  const operation = usePlaygroundOperation()
  const [mediaId, setMediaId] = useState('')
  const [confirmed, setConfirmed] = useState(false)

  return (
    <PlaygroundOperationCard
      method="DELETE"
      request={{
        path: graphMediaPath(mediaId || '<MEDIA_ID>'),
        query: { phone_number_id: props.phoneNumberId || 'PHONE_NUMBER_ID' },
      }}
      title={t('apiPlayground.media.delete.title')}
      description={t('apiPlayground.media.delete.description')}
      action={t('apiPlayground.media.delete.action')}
      state={operation.state}
      disabled={props.disabled || !confirmed}
      buttonVariant="danger"
      resultLabel={t('apiPlayground.result')}
      onSubmit={() => {
        void operation.run(async () => {
          const response = await apiClient.api.playground.media[':channelId'][
            ':mediaId'
          ].$delete({ param: { channelId: props.channelId, mediaId } })
          return readApiResult(response, t)
        })
      }}
    >
      <MediaIdInput value={mediaId} onChange={setMediaId} />
      <Checkbox
        label={t('apiPlayground.media.delete.confirm')}
        checked={confirmed}
        onChange={(event) => setConfirmed(event.currentTarget.checked)}
      />
    </PlaygroundOperationCard>
  )
}

function MediaIdInput({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const { t } = useTranslation()
  return (
    <Input
      label={t('apiPlayground.media.mediaId')}
      hint={t('apiPlayground.media.mediaIdHint')}
      value={value}
      required
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  )
}

interface CardProps {
  channelId: string
  phoneNumberId: string
  disabled: boolean
}

function graphMediaPath(...segments: string[]) {
  return `https://graph.facebook.com/v26.0/${segments
    .map(encodeURIComponent)
    .join('/')}`
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

async function readApiError(
  response: Response,
  t: ReturnType<typeof useTranslation>['t'],
): Promise<string> {
  try {
    return (
      readMessage((await response.json()) as unknown) ??
      t('apiPlayground.requestFailed', { status: response.status })
    )
  } catch {
    return t('apiPlayground.requestFailed', { status: response.status })
  }
}

function readMessage(value: unknown): string | undefined {
  return typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    typeof value.message === 'string'
    ? value.message
    : undefined
}
