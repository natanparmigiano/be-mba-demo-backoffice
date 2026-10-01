import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiClient } from '../api'
import {
  PlaygroundOperationCard,
  type PlaygroundOperationState,
} from '../components/api-playground/PlaygroundOperationCard'
import { Input, Textarea } from '../components/ui'

type Action =
  | 'create'
  | 'list'
  | 'get'
  | 'preview'
  | 'migrate'
  | 'updateMetadata'
  | 'uploadJson'
  | 'listAssets'
  | 'publish'
  | 'deprecate'
  | 'delete'
  | 'metric'
  | 'getEncryptionKey'
  | 'setEncryptionKey'
type T = ReturnType<typeof useTranslation>['t']
const operations: Array<{
  action: Action
  method: 'GET' | 'POST' | 'DELETE'
  flowId?: boolean
  payload: object
}> = [
  {
    action: 'create',
    method: 'POST',
    payload: {
      name: 'Book an appointment',
      categories: ['APPOINTMENT_BOOKING'],
    },
  },
  {
    action: 'list',
    method: 'GET',
    payload: { fields: ['id', 'name', 'status', 'categories'], limit: 50 },
  },
  {
    action: 'get',
    method: 'GET',
    flowId: true,
    payload: {
      fields: ['id', 'name', 'status', 'categories', 'validation_errors'],
    },
  },
  {
    action: 'preview',
    method: 'GET',
    flowId: true,
    payload: { invalidate: false, unixTimestamp: false },
  },
  {
    action: 'migrate',
    method: 'POST',
    payload: {
      source_waba_id: 'SOURCE_WABA_ID',
      source_flow_names: ['Flow name'],
    },
  },
  {
    action: 'updateMetadata',
    method: 'POST',
    flowId: true,
    payload: { name: 'Updated flow name', categories: ['OTHER'] },
  },
  {
    action: 'uploadJson',
    method: 'POST',
    flowId: true,
    payload: { document: { version: '7.1', screens: [] } },
  },
  { action: 'listAssets', method: 'GET', flowId: true, payload: {} },
  { action: 'publish', method: 'POST', flowId: true, payload: {} },
  { action: 'deprecate', method: 'POST', flowId: true, payload: {} },
  { action: 'delete', method: 'DELETE', flowId: true, payload: {} },
  {
    action: 'metric',
    method: 'GET',
    flowId: true,
    payload: {
      name: 'ENDPOINT_AVAILABILITY',
      granularity: 'DAY',
      since: '2026-09-01',
      until: '2026-10-01',
    },
  },
  { action: 'getEncryptionKey', method: 'GET', payload: {} },
  {
    action: 'setEncryptionKey',
    method: 'POST',
    payload: {
      business_public_key:
        '-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----',
    },
  },
]

export function FlowsPlayground({
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
      aria-label={t('apiPlayground.flows.tab')}
    >
      {operations.map((operation, index) => (
        <FlowOperation
          key={operation.action}
          {...operation}
          channelId={channelId}
          mutationDisabled={mutationDisabled}
          defaultOpen={index === 0}
        />
      ))}
    </div>
  )
}

function FlowOperation({
  action,
  method,
  flowId: needsFlowId = false,
  payload: initialPayload,
  channelId,
  mutationDisabled,
  defaultOpen,
}: (typeof operations)[number] & {
  channelId: string
  mutationDisabled: boolean
  defaultOpen: boolean
}) {
  const { t } = useTranslation()
  const request = useOperation()
  const [flowId, setFlowId] = useState('')
  const [payload, setPayload] = useState(
    JSON.stringify(initialPayload, null, 2),
  )
  const readOnly = method === 'GET'
  return (
    <PlaygroundOperationCard
      method={method}
      buttonVariant={method === 'DELETE' ? 'danger' : undefined}
      title={t(`apiPlayground.flows.operations.${action}`)}
      description={t('apiPlayground.flows.operationDescription')}
      action={t('apiPlayground.flows.execute')}
      state={request.state}
      disabled={
        !channelId ||
        (!readOnly && mutationDisabled) ||
        (needsFlowId && !flowId)
      }
      defaultOpen={defaultOpen}
      resultLabel={t('apiPlayground.result')}
      onSubmit={() =>
        void request.run(async () =>
          readResult(
            await apiClient.api.playground.flows[':channelId'].$post({
              param: { channelId },
              json: {
                action,
                ...(flowId ? { flowId } : {}),
                input: parsePayload(payload, t),
              },
            }),
            t,
          ),
        )
      }
    >
      {needsFlowId && (
        <Input
          label={t('apiPlayground.flows.flowId')}
          required
          value={flowId}
          onChange={(event) => setFlowId(event.currentTarget.value)}
        />
      )}
      <Textarea
        label={t('apiPlayground.flows.payload')}
        hint={t('apiPlayground.flows.payloadHint')}
        rows={8}
        value={payload}
        onChange={(event) => setPayload(event.currentTarget.value)}
      />
    </PlaygroundOperationCard>
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
    /* localized below */
  }
  throw new Error(t('apiPlayground.flows.validJson'))
}
async function readResult(response: Response, t: T) {
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
