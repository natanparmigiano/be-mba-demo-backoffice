import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiClient } from '../api'
import {
  PlaygroundOperationCard,
  type PlaygroundOperationState,
} from '../components/api-playground'
import { Input, Textarea } from '@mba-desk/ui'

type Props = { channelId: string; wabaId: string; mutationDisabled: boolean }
type T = ReturnType<typeof useTranslation>['t']

export function TemplatesPlayground({
  channelId,
  wabaId,
  mutationDisabled,
}: Props) {
  const { t } = useTranslation()
  return (
    <div
      className="grid gap-4"
      role="tabpanel"
      aria-label={t('apiPlayground.templates.tab')}
    >
      <CreateTemplate
        channelId={channelId}
        wabaId={wabaId}
        disabled={mutationDisabled}
      />
      <ListTemplates
        channelId={channelId}
        wabaId={wabaId}
        disabled={!channelId}
      />
      <GetTemplate channelId={channelId} disabled={!channelId} />
      <GetNamespace
        channelId={channelId}
        wabaId={wabaId}
        disabled={!channelId}
      />
      <UpdateTemplate channelId={channelId} disabled={mutationDisabled} />
      <DeleteTemplate
        channelId={channelId}
        wabaId={wabaId}
        disabled={mutationDisabled}
      />
    </div>
  )
}

function CreateTemplate({
  channelId,
  wabaId,
  disabled,
}: {
  channelId: string
  wabaId: string
  disabled: boolean
}) {
  const { t } = useTranslation()
  const operation = useOperation()
  const [payload, setPayload] = useState(
    JSON.stringify(
      {
        name: 'order_ready',
        language: 'en_US',
        category: 'UTILITY',
        components: [{ type: 'BODY', text: 'Your order {{1}} is ready.' }],
      },
      null,
      2,
    ),
  )
  return (
    <PlaygroundOperationCard
      method="POST"
      request={{
        path: metaWabaPath(wabaId, 'message_templates'),
        body: requestPayload(payload),
      }}
      title={t('apiPlayground.templates.create.title')}
      description={t('apiPlayground.templates.create.description')}
      action={t('apiPlayground.templates.create.action')}
      state={operation.state}
      disabled={disabled}
      defaultOpen
      resultLabel={t('apiPlayground.result')}
      onSubmit={() =>
        void operation.run(async () =>
          result(
            await apiClient.api.playground.templates[':channelId'].$post({
              param: { channelId },
              json: { input: parsePayload(payload, t) },
            }),
            t,
          ),
        )
      }
    >
      <JsonInput value={payload} onChange={setPayload} />
    </PlaygroundOperationCard>
  )
}

function ListTemplates({
  channelId,
  wabaId,
  disabled,
}: {
  channelId: string
  wabaId: string
  disabled: boolean
}) {
  const { t } = useTranslation()
  const operation = useOperation()
  const [name, setName] = useState('')
  const [language, setLanguage] = useState('')
  const [fields, setFields] = useState(
    'id,name,language,status,category,components',
  )
  return (
    <PlaygroundOperationCard
      method="GET"
      request={{
        path: metaWabaPath(wabaId, 'message_templates'),
        query: {
          name: name || undefined,
          language: language || undefined,
          fields,
          limit: '50',
        },
      }}
      title={t('apiPlayground.templates.list.title')}
      description={t('apiPlayground.templates.list.description')}
      action={t('apiPlayground.templates.list.action')}
      state={operation.state}
      disabled={disabled}
      resultLabel={t('apiPlayground.result')}
      onSubmit={() =>
        void operation.run(async () =>
          result(
            await apiClient.api.playground.templates[':channelId'].$get({
              param: { channelId },
              query: {
                name: name || undefined,
                language: language || undefined,
                fields,
                limit: '50',
              },
            }),
            t,
          ),
        )
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label={t('apiPlayground.templates.name')}
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
        />
        <Input
          label={t('apiPlayground.templates.language')}
          value={language}
          onChange={(e) => setLanguage(e.currentTarget.value)}
        />
      </div>
      <Input
        label={t('apiPlayground.templates.fields')}
        hint={t('apiPlayground.templates.fieldsHint')}
        value={fields}
        onChange={(e) => setFields(e.currentTarget.value)}
      />
    </PlaygroundOperationCard>
  )
}

function GetTemplate({
  channelId,
  disabled,
}: {
  channelId: string
  disabled: boolean
}) {
  const { t } = useTranslation()
  const operation = useOperation()
  const [templateId, setTemplateId] = useState('')
  const [fields, setFields] = useState(
    'id,name,language,status,category,components',
  )
  return (
    <PlaygroundOperationCard
      method="GET"
      request={{
        path: metaNodePath(templateId, 'TEMPLATE_ID'),
        query: { fields },
      }}
      title={t('apiPlayground.templates.get.title')}
      description={t('apiPlayground.templates.get.description')}
      action={t('apiPlayground.templates.get.action')}
      state={operation.state}
      disabled={disabled || !templateId}
      resultLabel={t('apiPlayground.result')}
      onSubmit={() =>
        void operation.run(async () =>
          result(
            await apiClient.api.playground.templates[':channelId'][
              ':templateId'
            ].$get({ param: { channelId, templateId }, query: { fields } }),
            t,
          ),
        )
      }
    >
      <IdInput value={templateId} onChange={setTemplateId} />
      <Input
        label={t('apiPlayground.templates.fields')}
        value={fields}
        onChange={(e) => setFields(e.currentTarget.value)}
      />
    </PlaygroundOperationCard>
  )
}

function GetNamespace({
  channelId,
  wabaId,
  disabled,
}: {
  channelId: string
  wabaId: string
  disabled: boolean
}) {
  const { t } = useTranslation()
  const operation = useOperation()
  return (
    <PlaygroundOperationCard
      method="GET"
      request={{
        path: metaWabaPath(wabaId),
        query: { fields: 'message_template_namespace' },
      }}
      title={t('apiPlayground.templates.namespace.title')}
      description={t('apiPlayground.templates.namespace.description')}
      action={t('apiPlayground.templates.namespace.action')}
      state={operation.state}
      disabled={disabled}
      resultLabel={t('apiPlayground.result')}
      onSubmit={() =>
        void operation.run(async () =>
          result(
            await apiClient.api.playground.templates[
              ':channelId'
            ].namespace.$get({ param: { channelId } }),
            t,
          ),
        )
      }
    />
  )
}

function UpdateTemplate({
  channelId,
  disabled,
}: {
  channelId: string
  disabled: boolean
}) {
  const { t } = useTranslation()
  const operation = useOperation()
  const [templateId, setTemplateId] = useState('')
  const [payload, setPayload] = useState(
    JSON.stringify({ message_send_ttl_seconds: 7200 }, null, 2),
  )
  return (
    <PlaygroundOperationCard
      method="POST"
      request={{
        path: metaNodePath(templateId, 'TEMPLATE_ID'),
        body: requestPayload(payload),
      }}
      title={t('apiPlayground.templates.update.title')}
      description={t('apiPlayground.templates.update.description')}
      action={t('apiPlayground.templates.update.action')}
      state={operation.state}
      disabled={disabled || !templateId}
      resultLabel={t('apiPlayground.result')}
      onSubmit={() =>
        void operation.run(async () =>
          result(
            await apiClient.api.playground.templates[':channelId'][
              ':templateId'
            ].$post({
              param: { channelId, templateId },
              json: { input: parsePayload(payload, t) },
            }),
            t,
          ),
        )
      }
    >
      <IdInput value={templateId} onChange={setTemplateId} />
      <JsonInput value={payload} onChange={setPayload} />
    </PlaygroundOperationCard>
  )
}

function DeleteTemplate({
  channelId,
  wabaId,
  disabled,
}: {
  channelId: string
  wabaId: string
  disabled: boolean
}) {
  const { t } = useTranslation()
  const operation = useOperation()
  const [templateId, setTemplateId] = useState('')
  const [name, setName] = useState('')
  return (
    <PlaygroundOperationCard
      method="DELETE"
      request={{
        path: metaWabaPath(wabaId, 'message_templates'),
        query: {
          hsm_id: templateId || 'TEMPLATE_ID',
          name: name || 'TEMPLATE_NAME',
        },
      }}
      buttonVariant="danger"
      title={t('apiPlayground.templates.delete.title')}
      description={t('apiPlayground.templates.delete.description')}
      action={t('apiPlayground.templates.delete.action')}
      state={operation.state}
      disabled={disabled || !templateId || !name}
      resultLabel={t('apiPlayground.result')}
      onSubmit={() =>
        void operation.run(async () =>
          result(
            await apiClient.api.playground.templates[':channelId'][
              ':templateId'
            ].$delete({ param: { channelId, templateId }, json: { name } }),
            t,
          ),
        )
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <IdInput value={templateId} onChange={setTemplateId} />
        <Input
          label={t('apiPlayground.templates.name')}
          value={name}
          required
          onChange={(e) => setName(e.currentTarget.value)}
        />
      </div>
    </PlaygroundOperationCard>
  )
}

function IdInput({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const { t } = useTranslation()
  return (
    <Input
      label={t('apiPlayground.templates.templateId')}
      value={value}
      required
      onChange={(e) => onChange(e.currentTarget.value)}
    />
  )
}
function JsonInput({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const { t } = useTranslation()
  return (
    <Textarea
      label={t('apiPlayground.templates.payload')}
      hint={t('apiPlayground.templates.validJson')}
      rows={8}
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
    />
  )
}
function useOperation() {
  const { t } = useTranslation()
  const [state, setState] = useState<PlaygroundOperationState>({
    status: 'idle',
  })
  return {
    state,
    run: async (request: () => Promise<unknown>) => {
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
    },
  }
}
function parsePayload(value: string, t: T): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value)
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed))
      return parsed as Record<string, unknown>
  } catch {
    /* use localized error */
  }
  throw new Error(t('apiPlayground.templates.validJson'))
}
function requestPayload(value: string): unknown {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}
function metaWabaPath(wabaId: string, edge?: string) {
  const base = `https://graph.facebook.com/v26.0/${encodeURIComponent(wabaId || 'WABA_ID')}`
  return edge ? `${base}/${edge}` : base
}
function metaNodePath(value: string, fallback: string) {
  return `https://graph.facebook.com/v26.0/${encodeURIComponent(value || fallback)}`
}
async function result(response: Response, t: T) {
  const body: unknown = await response.json()
  if (!response.ok)
    throw new Error(
      message(body) ??
        t('apiPlayground.requestFailed', { status: response.status }),
    )
  if (typeof body !== 'object' || body === null || !('result' in body))
    throw new Error(t('apiPlayground.unexpectedResponse'))
  return body.result
}
function message(value: unknown) {
  return typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    typeof value.message === 'string'
    ? value.message
    : undefined
}
