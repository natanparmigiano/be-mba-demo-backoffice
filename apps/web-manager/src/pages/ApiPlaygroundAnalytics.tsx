import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiClient } from '../api'
import {
  PlaygroundOperationCard,
  usePlaygroundOperation,
} from '../components/api-playground'
import { Textarea } from '@mba-desk/ui'

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
  const request = usePlaygroundOperation()
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
      request={metaAnalyticsRequest(action, parseExamplePayload(payload))}
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
function parseExamplePayload(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value)
    return typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

const graphWabaPath = 'https://graph.facebook.com/v26.0/WABA_ID'

function metaAnalyticsRequest(action: Action, input: Record<string, unknown>) {
  if (action === 'enableTemplate') {
    return {
      method: 'POST' as const,
      path: graphWabaPath,
      query: { is_enabled_for_insights: true },
    }
  }
  if (action === 'template' || action === 'templateGroup') {
    const template = action === 'template'
    return {
      method: 'GET' as const,
      path: `${graphWabaPath}/${template ? 'template_analytics' : 'template_group_analytics'}`,
      query: compact({
        start: input.start,
        end: input.end,
        granularity: lower(input.granularity),
        use_waba_timezone: input.useWabaTimezone,
        [template ? 'template_ids' : 'template_group_ids']: numericIdList(
          input[template ? 'templateIds' : 'templateGroupIds'],
        ),
        metric_types: lowerList(input.metricTypes),
        ...(template ? { product_type: lower(input.productType) } : {}),
      }),
    }
  }
  if (action === 'group') {
    return {
      method: 'GET' as const,
      path: `${graphWabaPath}/group_analytics`,
      query: compact({
        start: input.start,
        end: input.end,
        granularity: lower(input.granularity ?? 'DAILY'),
        group_ids: jsonList(input.groupIds),
        metric_types: jsonList(input.metricTypes, true),
      }),
    }
  }
  return {
    method: 'GET' as const,
    path: graphWabaPath,
    query: {
      fields: fieldExpression(fieldName(action), fieldFilters(action, input)),
    },
  }
}

function fieldName(action: Action) {
  if (action === 'messaging') return 'analytics'
  if (action === 'conversation') return 'conversation_analytics'
  if (action === 'pricing') return 'pricing_analytics'
  return 'call_analytics'
}

function fieldFilters(
  action: Action,
  input: Record<string, unknown>,
): Array<[string, unknown]> {
  const common = [
    ['start', input.start],
    ['end', input.end],
    ['granularity', input.granularity],
    ['phone_numbers', input.phoneNumbers],
    ['country_codes', input.countryCodes],
  ] as Array<[string, unknown]>
  if (action === 'messaging') {
    return [...common, ['product_types', input.productTypes]]
  }
  if (action === 'conversation') {
    return [
      ...common,
      ['metric_types', input.metricTypes],
      ['conversation_categories', input.conversationCategories],
      ['conversation_types', input.conversationTypes],
      ['conversation_directions', input.conversationDirections],
      ['dimensions', input.dimensions],
    ]
  }
  if (action === 'pricing') {
    return [
      ...common,
      ['metric_types', input.metricTypes],
      ['pricing_types', input.pricingTypes],
      ['pricing_categories', input.pricingCategories],
      ['dimensions', input.dimensions],
    ]
  }
  return [
    ...common,
    ['directions', input.directions],
    ['dimensions', input.dimensions],
    ['metric_types', input.metricTypes],
  ]
}

function fieldExpression(field: string, filters: Array<[string, unknown]>) {
  return filters.reduce(
    (expression, [name, value]) =>
      value === undefined
        ? expression
        : `${expression}.${name}(${typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : JSON.stringify(value)})`,
    field,
  )
}

function compact(values: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  )
}

function lower(value: unknown) {
  return typeof value === 'string' ? value.toLowerCase() : undefined
}

function lowerList(value: unknown) {
  return Array.isArray(value)
    ? value
        .map(String)
        .map((item) => item.toLowerCase())
        .join(',')
    : undefined
}

function numericIdList(value: unknown) {
  return Array.isArray(value) ? `[${value.map(String).join(',')}]` : undefined
}

function jsonList(value: unknown, uppercase = false) {
  return Array.isArray(value)
    ? JSON.stringify(
        value.map((item) =>
          uppercase ? String(item).toUpperCase() : String(item),
        ),
      )
    : undefined
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
