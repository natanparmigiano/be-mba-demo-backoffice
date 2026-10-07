import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiClient } from '../api'
import {
  PlaygroundOperationCard,
  type PlaygroundOperationState,
} from '../components/api-playground'
import type { PlaygroundRequestExample } from '../components/api-playground/PlaygroundRequestActions'
import { Textarea } from '@mba-desk/ui'

const readActions = [
  'getEligibility',
  'getSettings',
  'listAllowlist',
  'getBudgets',
  'listConnectors',
  'getConnector',
  'getConnectorLogs',
  'listConnectorTools',
  'getConnectorTool',
  'listSkills',
  'getSkill',
  'listUiSkills',
  'getUiSkill',
  'getBusinessInfo',
  'listFaqs',
  'getFaq',
  'listKnowledgeFiles',
  'getKnowledgeFile',
  'listKnowledgeWebsites',
  'getKnowledgeWebsite',
  'listEvaluationCases',
  'getEvaluationJob',
  'getEvaluationDetails',
  'getEvaluationSummaries',
  'getAgentEvent',
  'getAgentEventInsights',
  'getConversationTurns',
  'getConversationInsights',
  'getToolCallInsights',
] as const
const mutationActions = [
  'onboard',
  'updateSettings',
  'addAllowlistEntry',
  'removeAllowlistEntry',
  'replaceBudgets',
  'deleteAgent',
  'runTest',
  'createConnector',
  'updateConnector',
  'deleteConnector',
  'refreshMcpTools',
  'upsertConnectorApiKey',
  'upsertConnectorOAuth',
  'upsertConnectorCertificate',
  'createConnectorTool',
  'updateConnectorTool',
  'runConnectorTool',
  'deleteConnectorTool',
  'createSkill',
  'updateSkill',
  'deleteSkill',
  'createUiSkill',
  'updateUiSkill',
  'deleteUiSkill',
  'replaceBusinessInfo',
  'resetBusinessInfo',
  'createFaq',
  'updateFaq',
  'deleteFaq',
  'deleteKnowledgeFile',
  'createKnowledgeWebsite',
  'updateKnowledgeWebsite',
  'deleteKnowledgeWebsite',
  'runEvaluation',
  'sendAgentEvent',
  'transferThreadControl',
] as const
const actions = [...readActions, ...mutationActions] as const
type Action = (typeof actions)[number]
type T = ReturnType<typeof useTranslation>['t']
type Props = {
  channelId: string
  phoneNumberId: string
  businessId: string
  mutationDisabled: boolean
}

export function MbaPlayground(props: Props) {
  const { t } = useTranslation()
  return (
    <div
      className="grid gap-4"
      role="tabpanel"
      aria-label={t('apiPlayground.mba.tab')}
    >
      {actions.map((action, index) => (
        <MbaOperation
          key={action}
          {...props}
          action={action}
          defaultOpen={index === 0}
        />
      ))}
    </div>
  )
}

function MbaOperation({
  action,
  channelId,
  phoneNumberId,
  businessId,
  mutationDisabled,
  defaultOpen,
}: Props & { action: Action; defaultOpen: boolean }) {
  const { t } = useTranslation()
  const operation = useOperation()
  const defaults = actionDefaults(action)
  const [argumentJson, setArgumentJson] = useState(() =>
    JSON.stringify(defaults.arguments, null, 2),
  )
  const [optionsJson, setOptionsJson] = useState(() =>
    JSON.stringify(defaults.options, null, 2),
  )
  const request = metaRequest(
    action,
    phoneNumberId,
    businessId,
    parseJsonPreview(argumentJson),
    parseJsonPreview(optionsJson),
  )
  return (
    <PlaygroundOperationCard
      method={request.method ?? 'GET'}
      request={request}
      title={`${t('apiPlayground.mba.title')} · ${action}`}
      description={t('apiPlayground.mba.description')}
      action={t('apiPlayground.mba.action')}
      state={operation.state}
      disabled={
        !channelId ||
        ((mutationActions as readonly string[]).includes(action) &&
          mutationDisabled)
      }
      defaultOpen={defaultOpen}
      resultLabel={t('apiPlayground.result')}
      onSubmit={() =>
        void operation.run(async () =>
          readResult(
            await apiClient.api.playground.mba[':channelId'].$post({
              param: { channelId },
              json: {
                action,
                arguments: parseArray(argumentJson, t),
                options: parseObject(optionsJson, t),
              },
            }),
            t,
          ),
        )
      }
    >
      <Textarea
        label={t('apiPlayground.mba.arguments')}
        hint={t('apiPlayground.mba.argumentsHint')}
        rows={Math.max(3, Math.min(10, argumentJson.split('\n').length + 1))}
        value={argumentJson}
        onChange={(e) => setArgumentJson(e.currentTarget.value)}
      />
      <Textarea
        label={t('apiPlayground.mba.options')}
        hint={t('apiPlayground.mba.optionsHint')}
        rows={Math.max(3, Math.min(8, optionsJson.split('\n').length + 1))}
        value={optionsJson}
        onChange={(e) => setOptionsJson(e.currentTarget.value)}
      />
    </PlaygroundOperationCard>
  )
}

function metaRequest(
  action: Action,
  phone: string,
  businessId: string,
  argumentValue: unknown,
  optionValue: unknown,
): PlaygroundRequestExample {
  const args = Array.isArray(argumentValue) ? argumentValue : []
  const options = object(optionValue)
  const id = (index: number, fallback: string) =>
    typeof args[index] === 'string' && args[index]
      ? String(args[index])
      : fallback
  const input = (index: number) => object(args[index])
  const url = (base: string, ...parts: string[]) =>
    `https://api.facebook.com/${[base, ...parts].map(encodeURIComponent).join('/')}`
  const entity = (...parts: string[]) =>
    url(phone || 'PHONE_NUMBER_ID', ...parts)
  const business = (...parts: string[]) =>
    url(businessId || 'BUSINESS_ID', ...parts)
  const req = (
    method: PlaygroundRequestExample['method'],
    path: string,
    body?: unknown,
    query?: Record<string, unknown>,
  ): PlaygroundRequestExample => ({
    method,
    path,
    headers: {
      'X-API-Version': path.endsWith('/thread_control') ? '1.0.0' : '2.0.0',
    },
    ...(body === undefined ? {} : { body }),
    ...(query && Object.keys(query).length ? { query } : {}),
  })
  const query = queryOptions(action, options)
  switch (action) {
    case 'getEligibility':
      return req('GET', entity('agent_eligibility'))
    case 'onboard':
      return req('POST', entity('agent_onboarding'), input(0))
    case 'getSettings':
      return req('GET', entity('agent_config', 'settings'), undefined, query)
    case 'updateSettings':
      return req('PUT', entity('agent_config', 'settings'), input(0), query)
    case 'listAllowlist':
      return req('GET', entity('agent_config', 'allowlist'))
    case 'addAllowlistEntry':
      return req('POST', entity('agent_config', 'allowlist'), input(0))
    case 'removeAllowlistEntry':
      return req(
        'DELETE',
        entity('agent_config', 'allowlist', id(0, 'ENTRY_ID')),
      )
    case 'getBudgets':
      return req('GET', business('agent_budget'))
    case 'replaceBudgets':
      return req('POST', business('agent_budget'), {
        budgets: Array.isArray(args[0]) ? args[0] : [],
      })
    case 'deleteAgent':
      return req('DELETE', entity('delete_agent'))
    case 'runTest':
      return req('POST', entity('agent_test'), input(0))
    case 'listConnectors':
      return req('GET', entity('agent_connectors'))
    case 'getConnector':
      return req('GET', entity('agent_connectors', id(0, 'CONNECTOR_ID')))
    case 'createConnector':
      return req('POST', entity('agent_connectors'), input(0))
    case 'updateConnector':
      return req(
        'PUT',
        entity('agent_connectors', id(0, 'CONNECTOR_ID')),
        input(1),
      )
    case 'deleteConnector':
      return req('DELETE', entity('agent_connectors', id(0, 'CONNECTOR_ID')))
    case 'getConnectorLogs':
      return req(
        'GET',
        entity('agent_connectors', id(0, 'CONNECTOR_ID'), 'logs'),
        undefined,
        query,
      )
    case 'refreshMcpTools':
      return req(
        'POST',
        entity('agent_connectors', id(0, 'CONNECTOR_ID'), 'refreshMCPTools'),
      )
    case 'upsertConnectorApiKey':
      return req(
        'POST',
        entity('agent_connectors', id(0, 'CONNECTOR_ID'), 'upsertApiKey'),
        input(1),
      )
    case 'upsertConnectorOAuth':
      return req(
        'POST',
        entity('agent_connectors', id(0, 'CONNECTOR_ID'), 'upsertOAuth'),
        input(1),
      )
    case 'upsertConnectorCertificate':
      return req(
        'POST',
        entity('agent_connectors', id(0, 'CONNECTOR_ID'), 'upsertCertificate'),
        input(1),
      )
    case 'listConnectorTools':
      return req(
        'GET',
        entity('agent_connectors', id(0, 'CONNECTOR_ID'), 'tools'),
      )
    case 'getConnectorTool':
      return req(
        'GET',
        entity(
          'agent_connectors',
          id(0, 'CONNECTOR_ID'),
          'tools',
          id(1, 'TOOL_ID'),
        ),
      )
    case 'createConnectorTool':
      return req(
        'POST',
        entity('agent_connectors', id(0, 'CONNECTOR_ID'), 'tools'),
        connectorToolInput(input(1)),
      )
    case 'updateConnectorTool':
      return req(
        'PUT',
        entity(
          'agent_connectors',
          id(0, 'CONNECTOR_ID'),
          'tools',
          id(1, 'TOOL_ID'),
        ),
        connectorToolInput(input(2)),
      )
    case 'runConnectorTool': {
      const value = input(2).input ?? {}
      return req(
        'POST',
        entity(
          'agent_connectors',
          id(0, 'CONNECTOR_ID'),
          'tools',
          id(1, 'TOOL_ID'),
          'run',
        ),
        { input: typeof value === 'string' ? value : JSON.stringify(value) },
      )
    }
    case 'deleteConnectorTool':
      return req(
        'DELETE',
        entity(
          'agent_connectors',
          id(0, 'CONNECTOR_ID'),
          'tools',
          id(1, 'TOOL_ID'),
        ),
      )
    case 'listSkills':
      return req('GET', entity('agent_config', 'skills'), undefined, query)
    case 'getSkill':
      return req('GET', entity('agent_config', 'skills', id(0, 'SKILL_ID')))
    case 'createSkill':
      return req('POST', entity('agent_config', 'skills'), input(0), query)
    case 'updateSkill':
      return req(
        'PUT',
        entity('agent_config', 'skills', id(0, 'SKILL_ID')),
        input(1),
      )
    case 'deleteSkill':
      return req('DELETE', entity('agent_config', 'skills', id(0, 'SKILL_ID')))
    case 'listUiSkills':
      return req('GET', entity('agent-ui-skills'), undefined, query)
    case 'getUiSkill':
      return req('GET', entity('agent-ui-skills', id(0, 'INSTRUCTION_ID')))
    case 'createUiSkill':
      return req('POST', entity('agent-ui-skills'), input(0))
    case 'updateUiSkill':
      return req(
        'PUT',
        entity('agent-ui-skills', id(0, 'INSTRUCTION_ID')),
        input(1),
      )
    case 'deleteUiSkill':
      return req('DELETE', entity('agent-ui-skills', id(0, 'INSTRUCTION_ID')))
    case 'getBusinessInfo':
      return req('GET', entity('agent_config', 'business_info'))
    case 'replaceBusinessInfo':
      return req('PUT', entity('agent_config', 'business_info'), input(0))
    case 'resetBusinessInfo':
      return req('DELETE', entity('agent_config', 'business_info'))
    case 'listFaqs':
      return req('GET', entity('agent_config', 'faq'))
    case 'getFaq':
      return req('GET', entity('agent_config', 'faq', id(0, 'FAQ_ID')))
    case 'createFaq':
      return req('POST', entity('agent_config', 'faq'), input(0))
    case 'updateFaq':
      return req(
        'PUT',
        entity('agent_config', 'faq', id(0, 'FAQ_ID')),
        input(1),
      )
    case 'deleteFaq':
      return req('DELETE', entity('agent_config', 'faq', id(0, 'FAQ_ID')))
    case 'listKnowledgeFiles':
      return req('GET', entity('agent_config', 'files'))
    case 'getKnowledgeFile':
      return req('GET', entity('agent_config', 'files', id(0, 'FILE_ID')))
    case 'deleteKnowledgeFile':
      return req('DELETE', entity('agent_config', 'files', id(0, 'FILE_ID')))
    case 'listKnowledgeWebsites':
      return req('GET', entity('agent_config', 'websites'))
    case 'getKnowledgeWebsite':
      return req('GET', entity('agent_config', 'websites', id(0, 'WEBSITE_ID')))
    case 'createKnowledgeWebsite':
      return req('POST', entity('agent_config', 'websites'), input(0))
    case 'updateKnowledgeWebsite':
      return req(
        'PUT',
        entity('agent_config', 'websites', id(0, 'WEBSITE_ID')),
        input(1),
      )
    case 'deleteKnowledgeWebsite':
      return req(
        'DELETE',
        entity('agent_config', 'websites', id(0, 'WEBSITE_ID')),
      )
    case 'listEvaluationCases':
      return req('GET', entity('agent-eval', 'cases'))
    case 'runEvaluation':
      return req(
        'POST',
        entity('agent-eval', 'run'),
        {},
        { eval_case_ids: list(input(0).evalCaseIds) },
      )
    case 'getEvaluationJob':
      return req('GET', entity('agent-eval', 'run'), undefined, {
        job_id: id(0, 'JOB_ID'),
      })
    case 'getEvaluationDetails':
      return req('GET', entity('agent-eval', 'details'), undefined, {
        eval_ids: list(args[0]),
      })
    case 'getEvaluationSummaries':
      return req('GET', entity('agent-eval', 'summary'), undefined, {
        summary_ids: list(args[0]),
      })
    case 'sendAgentEvent': {
      const body = input(0)
      const event = object(body.event)
      return req('POST', entity('agent_event'), {
        ...body,
        event: {
          ...event,
          payload:
            typeof event.payload === 'string'
              ? event.payload
              : JSON.stringify(event.payload ?? {}),
        },
      })
    }
    case 'getAgentEvent':
      return req('GET', entity('agent_event', id(0, 'AGENT_EVENT_ID')))
    case 'getAgentEventInsights':
      return req(
        'GET',
        entity('insights', 'agent_events'),
        undefined,
        queryOptions(action, input(0)),
      )
    case 'getConversationTurns':
      return req(
        'GET',
        entity('insights', 'conversations', 'turns'),
        undefined,
        queryOptions(action, input(0)),
      )
    case 'getConversationInsights':
      return req(
        'GET',
        entity('insights', 'conversations'),
        undefined,
        queryOptions(action, input(0)),
      )
    case 'getToolCallInsights':
      return req(
        'GET',
        entity('insights', 'tool_calls'),
        undefined,
        queryOptions(action, input(0)),
      )
    case 'transferThreadControl':
      return req(
        'POST',
        `https://api.facebook.com/business/whatsapp/phone_numbers/${encodeURIComponent(phone || 'PHONE_NUMBER_ID')}/thread_control`,
        { messaging_product: 'whatsapp', ...input(0) },
      )
  }
}

function queryOptions(action: Action, value: Record<string, unknown>) {
  const names: Record<string, string> = {
    agentId: 'agent_id',
    startTime: 'start_time',
    endTime: 'end_time',
    toolId: 'tool_id',
    includeStats: 'include_stats',
    summaryOnly: 'summary_only',
    topN: 'top_n',
    userPhoneNumber: 'user_phone_number',
    startTimestampMs: 'start_timestamp_ms',
    endTimestampMs: 'end_timestamp_ms',
    startDate: 'start_date',
    endDate: 'end_date',
    eventType: 'event_type',
    toolName: 'tool_name',
  }
  const keys =
    action === 'getConnectorLogs'
      ? [
          'startTime',
          'endTime',
          'limit',
          'toolId',
          'includeStats',
          'summaryOnly',
          'topN',
        ]
      : action === 'getConversationTurns'
        ? [
            'userPhoneNumber',
            'startTimestampMs',
            'endTimestampMs',
            'before',
            'after',
            'limit',
          ]
        : [
            'agentId',
            'before',
            'after',
            'limit',
            'startDate',
            'endDate',
            'eventType',
            'toolName',
            'metrics',
          ]
  return Object.fromEntries(
    keys
      .filter((key) => value[key] !== undefined)
      .map((key) => [names[key] ?? key, value[key]]),
  )
}

// Meta's connector-tool write contract requires nested schema nodes to be
// JSON strings, even though the library deliberately exposes normal objects.
function connectorToolInput(input: Record<string, unknown>) {
  const definition = object(input.request_definition)
  const body = object(definition.body)
  const params = object(body.params)
  if (!Object.keys(params).length) return input
  return {
    ...input,
    request_definition: {
      ...definition,
      body: {
        ...body,
        params: Object.fromEntries(
          Object.entries(params).map(([name, node]) => [
            name,
            encodeConnectorToolBodyNode(object(node)),
          ]),
        ),
      },
    },
  }
}

function encodeConnectorToolBodyNode(
  node: Record<string, unknown>,
): Record<string, unknown> {
  const { items, properties, ...fields } = node
  return {
    ...fields,
    ...(properties === undefined
      ? {}
      : {
          properties: Object.fromEntries(
            Object.entries(object(properties)).map(([name, child]) => [
              name,
              JSON.stringify(encodeConnectorToolBodyNode(object(child))),
            ]),
          ),
        }),
    ...(items === undefined
      ? {}
      : { items: JSON.stringify(encodeConnectorToolBodyNode(object(items))) }),
  }
}

function actionDefaults(action: Action): {
  arguments: unknown[]
  options: Record<string, unknown>
} {
  const oneId: readonly Action[] = [
    'getConnector',
    'getConnectorLogs',
    'refreshMcpTools',
    'listConnectorTools',
    'getSkill',
    'getUiSkill',
    'getFaq',
    'getKnowledgeFile',
    'getKnowledgeWebsite',
    'getEvaluationJob',
    'getAgentEvent',
    'removeAllowlistEntry',
    'deleteConnector',
    'deleteSkill',
    'deleteUiSkill',
    'deleteFaq',
    'deleteKnowledgeFile',
    'deleteKnowledgeWebsite',
  ]
  const idInput: readonly Action[] = [
    'updateConnector',
    'upsertConnectorApiKey',
    'upsertConnectorOAuth',
    'upsertConnectorCertificate',
    'createConnectorTool',
    'updateSkill',
    'updateUiSkill',
    'updateFaq',
    'updateKnowledgeWebsite',
  ]
  if (['getConnectorTool', 'deleteConnectorTool'].includes(action))
    return { arguments: ['CONNECTOR_ID', 'TOOL_ID'], options: {} }
  if (action === 'updateConnectorTool')
    return { arguments: ['CONNECTOR_ID', 'TOOL_ID', {}], options: {} }
  if (action === 'runConnectorTool')
    return {
      arguments: ['CONNECTOR_ID', 'TOOL_ID', { input: {} }],
      options: {},
    }
  if (oneId.includes(action)) return { arguments: ['RESOURCE_ID'], options: {} }
  if (idInput.includes(action))
    return { arguments: ['RESOURCE_ID', {}], options: {} }
  if (action === 'replaceBudgets') return { arguments: [[]], options: {} }
  if (action === 'getEvaluationDetails' || action === 'getEvaluationSummaries')
    return { arguments: [['ID']], options: {} }
  if (action === 'runEvaluation')
    return { arguments: [{ evalCaseIds: ['EVAL_CASE_ID'] }], options: {} }
  if (
    action === 'getAgentEventInsights' ||
    action === 'getConversationInsights' ||
    action === 'getToolCallInsights'
  )
    return {
      arguments: [{ startDate: '2026-01-01', endDate: '2026-01-07' }],
      options: {},
    }
  if (action === 'getConversationTurns')
    return {
      arguments: [{ userPhoneNumber: '+15551234567', limit: 50 }],
      options: {},
    }
  if ((mutationActions as readonly string[]).includes(action))
    return { arguments: [{}], options: {} }
  return { arguments: [], options: {} }
}

function object(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}
function list(value: unknown) {
  return Array.isArray(value) ? value.join(',') : ''
}
function parseJsonPreview(value: string): unknown {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}
function parseArray(value: string, t: T): unknown[] {
  const parsed = parseJsonPreview(value)
  if (Array.isArray(parsed)) return parsed
  throw new Error(t('apiPlayground.mba.argumentsHint'))
}
function parseObject(value: string, t: T): Record<string, unknown> {
  const parsed = parseJsonPreview(value)
  const result = object(parsed)
  if (parsed === result) return result
  throw new Error(t('apiPlayground.mba.optionsHint'))
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
async function readResult(response: Response, t: T) {
  const body: unknown = await response.json()
  if (!response.ok)
    throw new Error(
      (typeof object(body).message === 'string'
        ? String(object(body).message)
        : undefined) ??
        t('apiPlayground.requestFailed', { status: response.status }),
    )
  if (!('result' in object(body)))
    throw new Error(t('apiPlayground.unexpectedResponse'))
  return object(body).result
}
