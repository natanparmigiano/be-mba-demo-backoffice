import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiClient } from '../api'
import {
  PlaygroundOperationCard,
  type PlaygroundOperationState,
} from '../components/api-playground'
import { Checkbox, Input, Select, Textarea } from '@mba-desk/ui'

type ImageFormat = '' | 'PNG' | 'SVG'
type QrCodeField = (typeof QR_CODE_FIELDS)[number]['value']

const QR_CODE_FIELDS = [
  {
    value: 'code',
    labelKey: 'apiPlayground.qr.list.fieldOptions.code',
  },
  {
    value: 'prefilled_message',
    labelKey: 'apiPlayground.qr.list.fieldOptions.prefilledMessage',
  },
  {
    value: 'deep_link_url',
    labelKey: 'apiPlayground.qr.list.fieldOptions.deepLinkUrl',
  },
] as const

const META_QR_CODES_URL =
  'https://graph.facebook.com/v26.0/PHONE_NUMBER_ID/message_qrdls'

function metaQrCodeUrl(code: string) {
  return `${META_QR_CODES_URL}/${encodeURIComponent(code.trim() || 'QR_CODE')}`
}

export function QrPlayground({
  channelId,
  mutationDisabled,
}: {
  channelId: string
  mutationDisabled: boolean
}) {
  const { t } = useTranslation()

  return (
    <div
      className="grid gap-4"
      role="tabpanel"
      aria-label={t('apiPlayground.qr.tab')}
    >
      <CreateQrCodeCard channelId={channelId} disabled={mutationDisabled} />
      <GetQrCodeCard channelId={channelId} disabled={!channelId} />
      <GetQrImageCard channelId={channelId} disabled={!channelId} />
      <ListQrCodesCard channelId={channelId} disabled={!channelId} />
      <UpdateQrCodeCard channelId={channelId} disabled={mutationDisabled} />
      <DeleteQrCodeCard channelId={channelId} disabled={mutationDisabled} />
    </div>
  )
}

function CreateQrCodeCard(props: CardProps) {
  const { t } = useTranslation()
  const operation = useOperation()
  const [prefilledMessage, setPrefilledMessage] = useState('')
  const [imageFormat, setImageFormat] = useState<ImageFormat>('SVG')

  return (
    <PlaygroundOperationCard
      method="POST"
      title={t('apiPlayground.qr.create.title')}
      description={t('apiPlayground.qr.create.description')}
      action={t('apiPlayground.qr.create.action')}
      state={operation.state}
      disabled={props.disabled}
      request={{
        path: META_QR_CODES_URL,
        body: {
          prefilled_message: prefilledMessage,
          ...(imageFormat
            ? { generate_qr_image: imageFormat.toLowerCase() }
            : {}),
        },
      }}
      defaultOpen
      resultLabel={t('apiPlayground.result')}
      onSubmit={() => {
        void operation.run(async () => {
          const response = await apiClient.api.playground.qr[
            ':channelId'
          ].$post({
            param: { channelId: props.channelId },
            json: {
              prefilledMessage,
              ...(imageFormat ? { imageFormat } : {}),
            },
          })
          return readApiResult(response, t)
        })
      }}
    >
      <PrefilledMessageInput
        value={prefilledMessage}
        onChange={setPrefilledMessage}
      />
      <ImageFormatSelect
        value={imageFormat}
        onChange={setImageFormat}
        optional
      />
    </PlaygroundOperationCard>
  )
}

function GetQrCodeCard(props: CardProps) {
  const { t } = useTranslation()
  const operation = useOperation()
  const [code, setCode] = useState('')

  return (
    <PlaygroundOperationCard
      method="GET"
      title={t('apiPlayground.qr.get.title')}
      description={t('apiPlayground.qr.get.description')}
      action={t('apiPlayground.qr.get.action')}
      state={operation.state}
      disabled={props.disabled}
      request={{
        path: metaQrCodeUrl(code),
      }}
      resultLabel={t('apiPlayground.result')}
      onSubmit={() => {
        void operation.run(async () => {
          const response = await apiClient.api.playground.qr[':channelId'][
            ':code'
          ].$get({ param: { channelId: props.channelId, code } })
          return readApiResult(response, t)
        })
      }}
    >
      <QrCodeInput value={code} onChange={setCode} />
    </PlaygroundOperationCard>
  )
}

function GetQrImageCard(props: CardProps) {
  const { t } = useTranslation()
  const operation = useOperation()
  const [code, setCode] = useState('')
  const [format, setFormat] = useState<ImageFormat>('SVG')

  return (
    <PlaygroundOperationCard
      method="GET"
      title={t('apiPlayground.qr.image.title')}
      description={t('apiPlayground.qr.image.description')}
      action={t('apiPlayground.qr.image.action')}
      state={operation.state}
      disabled={props.disabled}
      request={{
        path: META_QR_CODES_URL,
        query: {
          fields: `code,prefilled_message,deep_link_url,qr_image_url.format(${format})`,
          code: code || 'QR_CODE',
        },
      }}
      resultLabel={t('apiPlayground.result')}
      onSubmit={() => {
        void operation.run(async () => {
          if (!format) return
          const response = await apiClient.api.playground.qr[':channelId'][
            ':code'
          ].image.$get({
            param: { channelId: props.channelId, code },
            query: { format },
          })
          return readApiResult(response, t)
        })
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <QrCodeInput value={code} onChange={setCode} />
        <ImageFormatSelect value={format} onChange={setFormat} />
      </div>
    </PlaygroundOperationCard>
  )
}

function ListQrCodesCard(props: CardProps) {
  const { t } = useTranslation()
  const operation = useOperation()
  const [fields, setFields] = useState<QrCodeField[]>(
    QR_CODE_FIELDS.map((field) => field.value),
  )
  const [imageFormat, setImageFormat] = useState<ImageFormat>('')
  const [limit, setLimit] = useState('100')
  const [before, setBefore] = useState('')
  const [after, setAfter] = useState('')

  const toggleField = (field: QrCodeField, checked: boolean) => {
    setFields((current) =>
      checked
        ? [...current, field]
        : current.filter((selected) => selected !== field),
    )
  }

  return (
    <PlaygroundOperationCard
      method="GET"
      title={t('apiPlayground.qr.list.title')}
      description={t('apiPlayground.qr.list.description')}
      action={t('apiPlayground.qr.list.action')}
      state={operation.state}
      disabled={props.disabled}
      request={{
        path: META_QR_CODES_URL,
        query: {
          ...(fields.length > 0 || imageFormat
            ? {
                fields: [
                  'code',
                  ...fields.filter((field) => field !== 'code'),
                  ...(imageFormat
                    ? [`qr_image_url.format(${imageFormat})`]
                    : []),
                ].join(','),
              }
            : {}),
          ...(limit ? { limit } : {}),
          ...(before ? { before } : {}),
          ...(after ? { after } : {}),
        },
      }}
      resultLabel={t('apiPlayground.result')}
      onSubmit={() => {
        void operation.run(async () => {
          const response = await apiClient.api.playground.qr[':channelId'].$get(
            {
              param: { channelId: props.channelId },
              query: {
                ...(fields.length > 0 ? { fields: fields.join(',') } : {}),
                ...(imageFormat ? { imageFormat } : {}),
                ...(limit ? { limit } : {}),
                ...(before ? { before } : {}),
                ...(after ? { after } : {}),
              },
            },
          )
          return readApiResult(response, t)
        })
      }}
    >
      <fieldset className="grid gap-3">
        <legend className="text-sm font-semibold">
          {t('apiPlayground.qr.list.fields')}
        </legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {QR_CODE_FIELDS.map((field) => (
            <Checkbox
              key={field.value}
              className="w-full rounded-xl border bg-background p-3 transition-colors hover:border-primary/40"
              label={t(field.labelKey)}
              description={field.value}
              checked={fields.includes(field.value)}
              onChange={(event) =>
                toggleField(field.value, event.currentTarget.checked)
              }
            />
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <ImageFormatSelect
          value={imageFormat}
          onChange={setImageFormat}
          optional
        />
        <Input
          type="number"
          min={1}
          max={1000}
          label={t('apiPlayground.qr.list.limit')}
          value={limit}
          onChange={(event) => setLimit(event.currentTarget.value)}
        />
        <Input
          label={t('apiPlayground.qr.list.before')}
          hint={t('apiPlayground.qr.list.cursorHint')}
          value={before}
          onChange={(event) => setBefore(event.currentTarget.value)}
        />
        <Input
          label={t('apiPlayground.qr.list.after')}
          hint={t('apiPlayground.qr.list.cursorHint')}
          value={after}
          onChange={(event) => setAfter(event.currentTarget.value)}
        />
      </div>
    </PlaygroundOperationCard>
  )
}

function UpdateQrCodeCard(props: CardProps) {
  const { t } = useTranslation()
  const operation = useOperation()
  const [code, setCode] = useState('')
  const [prefilledMessage, setPrefilledMessage] = useState('')

  return (
    <PlaygroundOperationCard
      method="POST"
      title={t('apiPlayground.qr.update.title')}
      description={t('apiPlayground.qr.update.description')}
      action={t('apiPlayground.qr.update.action')}
      state={operation.state}
      disabled={props.disabled}
      request={{
        path: META_QR_CODES_URL,
        body: {
          code: code || 'QR_CODE',
          prefilled_message: prefilledMessage,
        },
      }}
      resultLabel={t('apiPlayground.result')}
      onSubmit={() => {
        void operation.run(async () => {
          const response = await apiClient.api.playground.qr[':channelId'][
            ':code'
          ].$post({
            param: { channelId: props.channelId, code },
            json: { prefilledMessage },
          })
          return readApiResult(response, t)
        })
      }}
    >
      <QrCodeInput value={code} onChange={setCode} />
      <PrefilledMessageInput
        value={prefilledMessage}
        onChange={setPrefilledMessage}
      />
    </PlaygroundOperationCard>
  )
}

function DeleteQrCodeCard(props: CardProps) {
  const { t } = useTranslation()
  const operation = useOperation()
  const [code, setCode] = useState('')
  const [confirmed, setConfirmed] = useState(false)

  return (
    <PlaygroundOperationCard
      method="DELETE"
      title={t('apiPlayground.qr.delete.title')}
      description={t('apiPlayground.qr.delete.description')}
      action={t('apiPlayground.qr.delete.action')}
      state={operation.state}
      disabled={props.disabled || !confirmed}
      request={{
        path: metaQrCodeUrl(code),
      }}
      buttonVariant="danger"
      resultLabel={t('apiPlayground.result')}
      onSubmit={() => {
        void operation.run(async () => {
          const response = await apiClient.api.playground.qr[':channelId'][
            ':code'
          ].$delete({ param: { channelId: props.channelId, code } })
          return readApiResult(response, t)
        })
      }}
    >
      <QrCodeInput value={code} onChange={setCode} />
      <Checkbox
        label={t('apiPlayground.qr.delete.confirm')}
        checked={confirmed}
        onChange={(event) => setConfirmed(event.currentTarget.checked)}
      />
    </PlaygroundOperationCard>
  )
}

function QrCodeInput({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const { t } = useTranslation()
  return (
    <Input
      label={t('apiPlayground.qr.code')}
      hint={t('apiPlayground.qr.codeHint')}
      value={value}
      maxLength={256}
      required
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  )
}

function PrefilledMessageInput({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const { t } = useTranslation()
  return (
    <Textarea
      label={t('apiPlayground.qr.prefilledMessage')}
      hint={t('apiPlayground.qr.prefilledMessageHint')}
      value={value}
      maxLength={4096}
      required
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  )
}

function ImageFormatSelect({
  value,
  onChange,
  optional = false,
}: {
  value: ImageFormat
  onChange: (value: ImageFormat) => void
  optional?: boolean
}) {
  const { t } = useTranslation()
  return (
    <Select
      label={t('apiPlayground.qr.imageFormat')}
      hint={t('apiPlayground.qr.imageFormatHint')}
      value={value}
      required={!optional}
      onChange={(event) => onChange(event.currentTarget.value as ImageFormat)}
    >
      {optional && <option value="">{t('apiPlayground.qr.noImage')}</option>}
      <option value="SVG">SVG</option>
      <option value="PNG">PNG</option>
    </Select>
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
