import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiClient } from '../api'
import {
  PlaygroundOperationCard,
  type PlaygroundOperationState,
} from '../components/api-playground/PlaygroundOperationCard'
import { Textarea } from '../components/ui'

type Action =
  | 'messaging'
  | 'conversation'
  | 'pricing'
  | 'template'
  | 'templateGroup'
  | 'call'
  | 'group'
  | 'enableTemplate'
type T = ReturnType<typeof useTranslation>['t']
const operations: Array<{
  action: Action
  method: 'GET' | 'POST'
  payload: object
}> = [
  {
    action: 'messaging',
    method: 'GET',
    payload: { start: 1790812800, end: 1793404800, granularity: 'DAY' },
  },
  {
    action: 'conversation',
    method: 'GET',
    payload: {
      start: 1790812800,
      end: 1793404800,
      granularity: 'DAILY',
      metricTypes: ['CONVERSATION', 'COST'],
    },
  },
  {
    action: 'pricing',
    method: 'GET',
    payload: {
      start: 1790812800,
      end: 1793404800,
      granularity: 'DAILY',
      metricTypes: ['COST', 'VOLUME'],
      dimensions: ['PRICING_CATEGORY', 'COUNTRY', 'TIER'],
    },
  },
  {
    action: 'template',
    method: 'GET',
    payload: {
      start: '2026-10-01',
      end: '2026-10-31',
      granularity: 'DAILY',
      templateIds: ['TEMPLATE_ID'],
      metricTypes: ['SENT', 'DELIVERED', 'READ', 'CLICKED'],
      useWabaTimezone: true,
    },
  },
  {
    action: 'templateGroup',
    method: 'GET',
    payload: {
      start: '2026-10-01',
      end: '2026-10-31',
      granularity: 'DAILY',
      templateGroupIds: ['TEMPLATE_GROUP_ID'],
      metricTypes: ['SENT', 'DELIVERED', 'READ'],
      useWabaTimezone: true,
    },
  },
  {
    action: 'call',
    method: 'GET',
    payload: {
      start: 1790812800,
      end: 1793404800,
      granularity: 'DAILY',
      metricTypes: ['COUNT', 'AVERAGE_DURATION'],
    },
  },
  {
    action: 'group',
    method: 'GET',
    payload: {
      start: 1790812800,
      end: 1793404800,
      groupIds: ['GROUP_ID'],
      metricTypes: ['SENT', 'DELIVERED', 'READ'],
      granularity: 'DAILY',
    },
  },
  { action: 'enableTemplate', method: 'POST', payload: {} },
]

export function AnalyticsPlayground({
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
      aria-label={t('apiPlayground.analytics.tab')}
    >
      {operations.map((operation, index) => (
        <AnalyticsOperation
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

function AnalyticsOperation({
  action,
  method,
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
  const [payload, setPayload] = useState(
    JSON.stringify(initialPayload, null, 2),
  )
  const mutates = action === 'enableTemplate'
  return (
    <PlaygroundOperationCard
      method={method}
      title={t(`apiPlayground.analytics.operations.${action}`)}
      description={t(
        mutates
          ? 'apiPlayground.analytics.enableDescription'
          : 'apiPlayground.analytics.operationDescription',
      )}
      action={t('apiPlayground.analytics.execute')}
      state={request.state}
      disabled={!channelId || (mutates && mutationDisabled)}
      defaultOpen={defaultOpen}
      resultLabel={t('apiPlayground.result')}
      onSubmit={() =>
        void request.run(async () =>
          readResult(
            await apiClient.api.playground.analytics[':channelId'].$post({
              param: { channelId },
              json: { action, input: parsePayload(payload, t) },
            }),
            t,
          ),
        )
      }
    >
      <Textarea
        label={t('apiPlayground.analytics.payload')}
        hint={t('apiPlayground.analytics.payloadHint')}
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
    /* use localized error */
  }
  throw new Error(t('apiPlayground.analytics.payloadHint'))
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
