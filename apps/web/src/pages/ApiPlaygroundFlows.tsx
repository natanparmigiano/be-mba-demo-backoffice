import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiClient } from '../api'
import {
  PlaygroundOperationCard,
  type PlaygroundOperationState,
} from '../components/api-playground'
import type { PlaygroundRequestExample } from '../components/api-playground/PlaygroundRequestActions'
import { Input, Textarea } from '@mba-desk/ui'

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
  wabaId,
  phoneNumberId,
  mutationDisabled,
}: {
  channelId: string
  wabaId: string
  phoneNumberId: string
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
          wabaId={wabaId}
          phoneNumberId={phoneNumberId}
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
  wabaId,
  phoneNumberId,
  mutationDisabled,
  defaultOpen,
}: (typeof operations)[number] & {
  channelId: string
  wabaId: string
  phoneNumberId: string
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
  const examplePayload = parseExamplePayload(payload)
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
      request={graphRequest(
        action,
        flowId,
        examplePayload,
        wabaId,
        phoneNumberId,
      )}
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

const GRAPH_BASE = 'https://graph.facebook.com/v26.0'

function graphRequest(
  action: Action,
  flowId: string,
  payload: unknown,
  wabaId: string,
  phoneNumberId: string,
): PlaygroundRequestExample {
  const input = asRecord(payload)
  const flowNode = `${GRAPH_BASE}/${encodeURIComponent(flowId || 'FLOW_ID')}`
  const wabaNode = `${GRAPH_BASE}/${encodeURIComponent(wabaId || 'WABA_ID')}`
  const phoneNode = `${GRAPH_BASE}/${encodeURIComponent(phoneNumberId || 'PHONE_NUMBER_ID')}`
  switch (action) {
    case 'create':
      return multipart(`${wabaNode}/flows`, {
        name: input.name,
        categories: JSON.stringify(input.categories ?? []),
        ...defined(input, ['clone_flow_id', 'endpoint_uri']),
      })
    case 'list':
      return {
        method: 'GET',
        path: `${wabaNode}/flows`,
        query: defined(input, ['fields', 'limit', 'before', 'after']),
      }
    case 'get':
      return {
        method: 'GET',
        path: flowNode,
        query: defined(input, ['fields']),
      }
    case 'preview':
      return {
        method: 'GET',
        path: flowNode,
        query: {
          fields: `preview.invalidate(${scalarString(input.invalidate, 'false')})`,
          ...(input.unixTimestamp ? { date_format: 'U' } : {}),
        },
      }
    case 'migrate':
      return multipart(`${wabaNode}/migrate_flows`, {
        source_waba_id: input.source_waba_id,
        ...(input.source_flow_names === undefined
          ? {}
          : { source_flow_names: JSON.stringify(input.source_flow_names) }),
      })
    case 'updateMetadata':
      return multipart(flowNode, {
        ...defined(input, ['name', 'endpoint_uri']),
        ...(input.categories === undefined
          ? {}
          : { categories: JSON.stringify(input.categories) }),
      })
    case 'uploadJson':
      return multipart(`${flowNode}/assets`, {
        file: { name: 'flow.json' },
        name: 'flow.json',
        asset_type: 'FLOW_JSON',
      })
    case 'listAssets':
      return {
        method: 'GET',
        path: `${flowNode}/assets`,
        query: defined(input, ['fields', 'limit', 'before', 'after']),
      }
    case 'publish':
      return { method: 'POST', path: `${flowNode}/publish` }
    case 'deprecate':
      return { method: 'POST', path: `${flowNode}/deprecate` }
    case 'delete':
      return { method: 'DELETE', path: flowNode }
    case 'metric':
      return {
        method: 'GET',
        path: flowNode,
        query: {
          fields: `metric.name(${scalarString(input.name)}).granularity(${scalarString(input.granularity)}).since(${scalarString(input.since)}).until(${scalarString(input.until)})`,
        },
      }
    case 'getEncryptionKey':
      return {
        method: 'GET',
        path: `${phoneNode}/whatsapp_business_encryption`,
      }
    case 'setEncryptionKey':
      return multipart(`${phoneNode}/whatsapp_business_encryption`, {
        business_public_key: input.business_public_key,
      })
  }
}

function scalarString(value: unknown, fallback = '') {
  if (value === undefined || value === null) return fallback
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
    return String(value)
  return JSON.stringify(value)
}

function multipart(
  path: string,
  body: Record<string, unknown>,
): PlaygroundRequestExample {
  return { method: 'POST', path, body, contentType: 'multipart/form-data' }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function defined(
  input: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> {
  return Object.fromEntries(
    keys.flatMap((key) =>
      input[key] === undefined ? [] : [[key, input[key]]],
    ),
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
function parseExamplePayload(value: string): unknown {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
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
