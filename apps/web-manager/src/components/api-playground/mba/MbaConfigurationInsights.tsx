import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiClient } from '../../../api'
import { PlaygroundOperationCard, type PlaygroundOperationState } from '..'
import type { PlaygroundRequestExample } from '../PlaygroundRequestActions'
import { Checkbox, Input, Textarea } from '@mba-desk/ui'

export type MbaFolderProps = {
  channelId: string
  phoneNumberId: string
  businessId: string
  mutationDisabled: boolean
}

type Action =
  | 'getEligibility'
  | 'onboard'
  | 'getSettings'
  | 'updateSettings'
  | 'listAllowlist'
  | 'addAllowlistEntry'
  | 'removeAllowlistEntry'
  | 'getBudgets'
  | 'replaceBudgets'
  | 'deleteAgent'
  | 'getAgentEventInsights'
  | 'getConversationTurns'
  | 'getConversationInsights'
  | 'getToolCallInsights'
  | 'transferThreadControl'

type T = ReturnType<typeof useTranslation>['t']
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

const descriptions: Record<string, string> = {
  'Get Agent Eligibility':
    'Checks whether the selected phone number can use a Business Agent.',
  'Onboard Agent':
    'Creates and activates a Business Agent for the selected phone number.',
  'Get Agent Settings':
    'Retrieves the current Business Agent configuration and rollout settings.',
  'Update Agent Settings':
    'Updates the Business Agent configuration using the supplied settings.',
  'List Allowlist Entries':
    'Lists consumers currently allowed to interact with the Business Agent.',
  'Add Allowlist Entry':
    'Adds a consumer phone number to the Business Agent allowlist.',
  'Remove Allowlist Entry':
    'Removes an existing consumer entry from the allowlist.',
  'Get Agent Budgets': 'Retrieves the configured Business Agent usage budgets.',
  'Replace Agent Budgets':
    'Replaces the complete set of Business Agent budget rules.',
  'Delete Agent':
    'Permanently deletes the Business Agent configuration for this phone number.',
  'Get Agent Event Insights':
    'Returns event-processing metrics for the selected date range and event type.',
  'Get Conversation Turns':
    'Lists recorded turns for a consumer conversation with pagination.',
  'Get Conversation Insights':
    'Returns conversation and handoff metrics for the selected date range.',
  'Get Tool Call Insights':
    'Returns invocation metrics for a connector tool over the selected date range.',
  'Transfer Thread Control':
    'Releases the conversation thread to the specified recipient.',
  'Take Thread Control':
    'Takes ownership of the conversation thread for the Business Agent.',
}

const exportPathPart = (part: string) =>
  part.startsWith('{{') && part.endsWith('}}') ? part : encodeURIComponent(part)

const agentConfigurationEntityUrl = (...parts: string[]) =>
  `https://api.facebook.com/{{Phone-Number-ID}}/${parts
    .map(exportPathPart)
    .join('/')}`

const agentConfigurationBusinessUrl = (...parts: string[]) =>
  `https://api.facebook.com/{{Business-ID}}/${parts
    .map(exportPathPart)
    .join('/')}`

function request(
  method: HttpMethod,
  path: string,
  body?: unknown,
  query?: Record<string, unknown>,
  version = '2.0.0',
): PlaygroundRequestExample {
  return {
    method,
    path,
    headers: { 'X-API-Version': version },
    ...(body === undefined ? {} : { body }),
    ...(query && Object.keys(query).length ? { query } : {}),
  }
}

function compact(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, item]) => item !== '' && item !== undefined,
    ),
  )
}

function numberOrUndefined(value: string) {
  return value === '' ? undefined : Number(value)
}

function jsonObject(value: string, label: string) {
  const parsed: unknown = JSON.parse(value)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    throw new Error(`${label} must be a JSON object`)
  return parsed as Record<string, unknown>
}

function jsonArray(value: string, label: string) {
  const parsed: unknown = JSON.parse(value)
  if (!Array.isArray(parsed)) throw new Error(`${label} must be a JSON array`)
  return parsed as unknown[]
}

function useOperation() {
  const { t } = useTranslation()
  const [state, setState] = useState<PlaygroundOperationState>({
    status: 'idle',
  })
  return {
    state,
    run: async (callback: () => Promise<unknown>) => {
      setState({ status: 'loading' })
      try {
        setState({ status: 'success', result: await callback() })
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
  const record =
    typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>)
      : {}
  if (!response.ok)
    throw new Error(
      typeof record.message === 'string'
        ? record.message
        : t('apiPlayground.requestFailed', { status: response.status }),
    )
  if (!('result' in record))
    throw new Error(t('apiPlayground.unexpectedResponse'))
  return record.result
}

function Card({
  props,
  action,
  title,
  method,
  metaRequest,
  arguments: args = [],
  options = {},
  mutation = false,
  defaultOpen = false,
  children,
}: {
  props: MbaFolderProps
  action: Action
  title: string
  method: HttpMethod
  metaRequest: PlaygroundRequestExample
  arguments?: unknown[]
  options?: Record<string, unknown>
  mutation?: boolean
  defaultOpen?: boolean
  children?: React.ReactNode
}) {
  const { t } = useTranslation()
  const operation = useOperation()
  return (
    <PlaygroundOperationCard
      method={method}
      request={metaRequest}
      title={title}
      description={descriptions[title] ?? t('apiPlayground.mba.description')}
      action={t('apiPlayground.mba.action')}
      state={operation.state}
      disabled={!props.channelId || (mutation && props.mutationDisabled)}
      defaultOpen={defaultOpen}
      resultLabel={t('apiPlayground.result')}
      onSubmit={() =>
        void operation.run(async () =>
          readResult(
            await apiClient.api.playground.mba[':channelId'].$post({
              param: { channelId: props.channelId },
              json: { action, arguments: args, options },
            }),
            t,
          ),
        )
      }
    >
      {children}
    </PlaygroundOperationCard>
  )
}

export function MbaAgentConfigurationFolder(props: MbaFolderProps) {
  const [agentId, setAgentId] = useState('')
  const [settings, setSettings] = useState(
    '{\n  "rollout": { "enabled": false },\n  "ai_audience": "ALLOWLISTED_ONLY",\n  "handoff": { "enabled": true, "message_selection": "DEFAULT" },\n  "followup": { "enabled": false, "followup_interval_in_seconds": 0 },\n  "never_say_phrases": []\n}',
  )
  const [consumerPhone, setConsumerPhone] = useState('')
  const [entryId, setEntryId] = useState('')
  const [budgets, setBudgets] = useState(
    '[\n  {\n    "unit_type": "ai_turn",\n    "time_window": "one_day",\n    "max_budget": 1000\n  }\n]',
  )
  const settingsBody = (() => {
    try {
      return jsonObject(settings, 'Agent settings')
    } catch {
      return {}
    }
  })()
  const budgetBody = (() => {
    try {
      return jsonArray(budgets, 'Budgets')
    } catch {
      return []
    }
  })()
  return (
    <div className="grid gap-4">
      <Card
        props={props}
        action="getEligibility"
        title="Get Agent Eligibility"
        method="GET"
        metaRequest={request(
          'GET',
          agentConfigurationEntityUrl('agent_eligibility'),
        )}
        defaultOpen
      />
      <Card
        props={props}
        action="onboard"
        title="Onboard Agent"
        method="POST"
        mutation
        arguments={[]}
        metaRequest={request(
          'POST',
          agentConfigurationEntityUrl('agent_onboarding'),
          {},
        )}
      />
      <Card
        props={props}
        action="getSettings"
        title="Get Agent Settings"
        method="GET"
        options={compact({ agentId })}
        metaRequest={request(
          'GET',
          agentConfigurationEntityUrl('agent_config', 'settings'),
          undefined,
          { agent_id: agentId || '{{MBA-Agent-ID}}' },
        )}
      >
        <Input
          label="Agent ID"
          hint="Optional agent settings ID"
          value={agentId}
          onChange={(event) => setAgentId(event.currentTarget.value)}
        />
      </Card>
      <Card
        props={props}
        action="updateSettings"
        title="Update Agent Settings"
        method="PUT"
        mutation
        arguments={[settingsBody]}
        options={compact({ agentId })}
        metaRequest={request(
          'PUT',
          agentConfigurationEntityUrl('agent_config', 'settings'),
          settingsBody,
          { agent_id: agentId || '{{MBA-Agent-ID}}' },
        )}
      >
        <Input
          label="Agent ID"
          hint="Optional agent settings ID"
          value={agentId}
          onChange={(event) => setAgentId(event.currentTarget.value)}
        />
        <Textarea
          label="Agent settings JSON"
          hint="Allowed fields: rollout, ai_audience, handoff, followup, never_say_phrases"
          rows={12}
          value={settings}
          onChange={(event) => setSettings(event.currentTarget.value)}
        />
      </Card>
      <Card
        props={props}
        action="listAllowlist"
        title="List Allowlist Entries"
        method="GET"
        metaRequest={request(
          'GET',
          agentConfigurationEntityUrl('agent_config', 'allowlist'),
        )}
      />
      <Card
        props={props}
        action="addAllowlistEntry"
        title="Add Allowlist Entry"
        method="POST"
        mutation
        arguments={[{ consumer_phone_number: consumerPhone }]}
        metaRequest={request(
          'POST',
          agentConfigurationEntityUrl('agent_config', 'allowlist'),
          {
            consumer_phone_number:
              consumerPhone || '{{Recipient-Phone-Number}}',
          },
        )}
      >
        <Input
          label="Recipient phone number"
          hint="E.164 format"
          required
          value={consumerPhone}
          onChange={(event) => setConsumerPhone(event.currentTarget.value)}
        />
      </Card>
      <Card
        props={props}
        action="removeAllowlistEntry"
        title="Remove Allowlist Entry"
        method="DELETE"
        mutation
        arguments={[entryId]}
        metaRequest={request(
          'DELETE',
          agentConfigurationEntityUrl(
            'agent_config',
            'allowlist',
            entryId || '{{MBA-Allowlist-Entry-ID}}',
          ),
        )}
      >
        <Input
          label="Allowlist entry ID"
          required
          value={entryId}
          onChange={(event) => setEntryId(event.currentTarget.value)}
        />
      </Card>
      <Card
        props={props}
        action="getBudgets"
        title="Get Agent Budgets"
        method="GET"
        metaRequest={request(
          'GET',
          agentConfigurationBusinessUrl('agent_budget'),
        )}
      />
      <Card
        props={props}
        action="replaceBudgets"
        title="Replace Agent Budgets"
        method="POST"
        mutation
        arguments={[budgetBody]}
        metaRequest={request(
          'POST',
          agentConfigurationBusinessUrl('agent_budget'),
          { budgets: budgetBody },
        )}
      >
        <Textarea
          label="Budgets JSON array"
          hint="Each budget accepts budget_id, unit_type, time_window, and max_budget"
          rows={10}
          value={budgets}
          onChange={(event) => setBudgets(event.currentTarget.value)}
        />
      </Card>
      <Card
        props={props}
        action="deleteAgent"
        title="Delete Agent"
        method="DELETE"
        mutation
        metaRequest={request(
          'DELETE',
          agentConfigurationEntityUrl('delete_agent'),
        )}
      />
    </div>
  )
}

export function MbaInsightsFolder(props: MbaFolderProps) {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [eventType, setEventType] = useState('')
  const [userPhoneNumber, setUserPhoneNumber] = useState('')
  const [startTimestampMs, setStartTimestampMs] = useState('')
  const [endTimestampMs, setEndTimestampMs] = useState('')
  const [before, setBefore] = useState('')
  const [after, setAfter] = useState('')
  const [limit, setLimit] = useState('25')
  const [aiThreads, setAiThreads] = useState(true)
  const [aiHandoffs, setAiHandoffs] = useState(true)
  const [toolName, setToolName] = useState('')
  const dateFields = (
    <div className="grid gap-4 sm:grid-cols-2">
      <Input
        label="Start date"
        type="date"
        required
        value={startDate}
        onChange={(event) => setStartDate(event.currentTarget.value)}
      />
      <Input
        label="End date"
        type="date"
        required
        value={endDate}
        onChange={(event) => setEndDate(event.currentTarget.value)}
      />
    </div>
  )
  const dateOptions = compact({ startDate, endDate })
  return (
    <div className="grid gap-4">
      <Card
        props={props}
        action="getAgentEventInsights"
        title="Get Agent Event Insights"
        method="GET"
        arguments={[compact({ ...dateOptions, eventType })]}
        metaRequest={request(
          'GET',
          agentConfigurationEntityUrl('insights', 'agent_events'),
          undefined,
          compact({
            start_date: startDate || '{{MBA-Start-Date}}',
            end_date: endDate || '{{MBA-End-Date}}',
            event_type: eventType,
          }),
        )}
        defaultOpen
      >
        {dateFields}
        <Input
          label="Event type"
          hint="Optional event type filter"
          value={eventType}
          onChange={(event) => setEventType(event.currentTarget.value)}
        />
      </Card>
      <Card
        props={props}
        action="getConversationTurns"
        title="Get Conversation Turns"
        method="GET"
        arguments={[
          compact({
            userPhoneNumber,
            startTimestampMs: numberOrUndefined(startTimestampMs),
            endTimestampMs: numberOrUndefined(endTimestampMs),
            before,
            after,
            limit: numberOrUndefined(limit),
          }),
        ]}
        metaRequest={request(
          'GET',
          agentConfigurationEntityUrl('insights', 'conversations', 'turns'),
          undefined,
          compact({
            user_phone_number: userPhoneNumber || '{{MBA-Consumer-ID}}',
            start_timestamp_ms: startTimestampMs,
            end_timestamp_ms: endTimestampMs,
            before,
            after,
            limit,
          }),
        )}
      >
        <Input
          label="Consumer ID"
          hint="Digits-only phone number, BSUID, or Agent Test conversation ID"
          required
          value={userPhoneNumber}
          onChange={(event) => setUserPhoneNumber(event.currentTarget.value)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Start timestamp (ms)"
            type="number"
            value={startTimestampMs}
            onChange={(event) => setStartTimestampMs(event.currentTarget.value)}
          />
          <Input
            label="End timestamp (ms)"
            type="number"
            value={endTimestampMs}
            onChange={(event) => setEndTimestampMs(event.currentTarget.value)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            label="Before cursor"
            value={before}
            onChange={(event) => setBefore(event.currentTarget.value)}
          />
          <Input
            label="After cursor"
            value={after}
            onChange={(event) => setAfter(event.currentTarget.value)}
          />
          <Input
            label="Limit"
            type="number"
            min="1"
            value={limit}
            onChange={(event) => setLimit(event.currentTarget.value)}
          />
        </div>
      </Card>
      <Card
        props={props}
        action="getConversationInsights"
        title="Get Conversation Insights"
        method="GET"
        arguments={[
          {
            ...dateOptions,
            metrics: [
              ...(aiThreads ? ['ai_threads'] : []),
              ...(aiHandoffs ? ['ai_handoffs'] : []),
            ],
          },
        ]}
        metaRequest={request(
          'GET',
          agentConfigurationEntityUrl('insights', 'conversations'),
          undefined,
          {
            start_date: startDate || '{{MBA-Start-Date}}',
            end_date: endDate || '{{MBA-End-Date}}',
            metrics: [
              ...(aiThreads ? ['ai_threads'] : []),
              ...(aiHandoffs ? ['ai_handoffs'] : []),
            ],
          },
        )}
      >
        {dateFields}
        <div className="flex flex-wrap gap-5">
          <Checkbox
            label="AI threads"
            checked={aiThreads}
            onChange={(event) => setAiThreads(event.currentTarget.checked)}
          />
          <Checkbox
            label="AI handoffs"
            checked={aiHandoffs}
            onChange={(event) => setAiHandoffs(event.currentTarget.checked)}
          />
        </div>
      </Card>
      <Card
        props={props}
        action="getToolCallInsights"
        title="Get Tool Call Insights"
        method="GET"
        arguments={[compact({ ...dateOptions, toolName })]}
        metaRequest={request(
          'GET',
          agentConfigurationEntityUrl('insights', 'tool_calls'),
          undefined,
          compact({
            start_date: startDate || '{{MBA-Start-Date}}',
            end_date: endDate || '{{MBA-End-Date}}',
            tool_name: toolName,
          }),
        )}
      >
        {dateFields}
        <Input
          label="Tool name"
          hint="Optional connector tool name filter"
          value={toolName}
          onChange={(event) => setToolName(event.currentTarget.value)}
        />
      </Card>
    </div>
  )
}

function ThreadControlCard({
  props,
  title,
  action,
  defaultOpen,
}: {
  props: MbaFolderProps
  title: string
  action: 'take' | 'release'
  defaultOpen?: boolean
}) {
  const [to, setTo] = useState('')
  const body = compact({
    messaging_product: 'whatsapp',
    action,
    to: to || '{{MBA-Consumer-ID}}',
  })
  return (
    <Card
      props={props}
      action="transferThreadControl"
      title={title}
      method="POST"
      mutation
      defaultOpen={defaultOpen}
      arguments={[compact({ action, to })]}
      metaRequest={request(
        'POST',
        'https://api.facebook.com/business/whatsapp/phone_numbers/{{Phone-Number-ID}}/thread_control',
        body,
        undefined,
        '1.0.0',
      )}
    >
      <Input
        label="Consumer ID"
        hint="WhatsApp consumer identifier receiving the thread control change"
        required
        value={to}
        onChange={(event) => setTo(event.currentTarget.value)}
      />
    </Card>
  )
}

export function MbaThreadControlFolder(props: MbaFolderProps) {
  return (
    <div className="grid gap-4">
      <ThreadControlCard
        props={props}
        title="Transfer Thread Control"
        action="release"
        defaultOpen
      />
      <ThreadControlCard
        props={props}
        title="Take Thread Control"
        action="take"
      />
    </div>
  )
}
