import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { apiClient } from '../../../api'
import { Input, Textarea } from '@mba-desk/ui'
import {
  PlaygroundOperationCard,
  type PlaygroundOperationState,
} from '..'
import type { PlaygroundRequestExample } from '../PlaygroundRequestActions'
import type { MbaFolderProps } from './MbaConfigurationInsights'

type Action =
  | 'runTest'
  | 'sendAgentEvent'
  | 'getAgentEvent'
  | 'listEvaluationCases'
  | 'runEvaluation'
  | 'getEvaluationJob'
  | 'getEvaluationDetails'
  | 'getEvaluationSummaries'

type T = ReturnType<typeof useTranslation>['t']
type Method = 'GET' | 'POST' | 'PUT' | 'DELETE'

const descriptions: Record<string, string> = {
  'Run Agent Test':
    'Sends a synchronous test message through the full agent pipeline. Use the returned conversation ID to continue a multi-turn test.',
  'Send Agent Event':
    'Submits a business event for asynchronous handling in an existing consumer conversation.',
  'Get Agent Event Status':
    'Retrieves the processing status of a previously submitted agent event.',
  'List Evaluation Cases':
    'Lists the evaluation scenarios available for this Business Agent.',
  'Run Evaluation':
    'Starts an asynchronous evaluation job for the selected evaluation cases.',
  'Get Evaluation Job': 'Retrieves the current status of an evaluation job.',
  'Get Evaluation Details':
    'Returns per-conversation results for the selected evaluation IDs.',
  'Get Evaluation Summary':
    'Returns aggregate reports for the selected evaluation summary IDs.',
}

const encodePathPart = (part: string) =>
  part.startsWith('{{') && part.endsWith('}}') ? part : encodeURIComponent(part)

const endpoint = (...parts: string[]) =>
  `https://api.facebook.com/${['{{Phone-Number-ID}}', ...parts]
    .map(encodePathPart)
    .join('/')}`

const request = (
  method: Method,
  path: string,
  body?: unknown,
  query?: Record<string, unknown>,
): PlaygroundRequestExample => ({
  method,
  path,
  headers: { 'X-API-Version': '2.0.0' },
  ...(body === undefined ? {} : { body }),
  ...(query && Object.keys(query).length ? { query } : {}),
})

function csv(value: string, label: string) {
  const values = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  if (!values.length) throw new Error(`${label} is required`)
  return values
}

function jsonPayload(value: string) {
  const parsed: unknown = JSON.parse(value)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Event payload must be a JSON object')
  }
  return parsed as Record<string, unknown>
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
  if (!response.ok) {
    throw new Error(
      typeof record.message === 'string'
        ? record.message
        : t('apiPlayground.requestFailed', { status: response.status }),
    )
  }
  if (!('result' in record)) {
    throw new Error(t('apiPlayground.unexpectedResponse'))
  }
  return record.result
}

function Card({
  props,
  action,
  title,
  method,
  metaRequest,
  args = () => [],
  mutation = false,
  defaultOpen = false,
  children,
}: {
  props: MbaFolderProps
  action: Action
  title: string
  method: Method
  metaRequest: PlaygroundRequestExample
  args?: () => unknown[]
  mutation?: boolean
  defaultOpen?: boolean
  children?: ReactNode
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
              json: { action, arguments: args(), options: {} },
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

export function MbaOperationsFolder(props: MbaFolderProps) {
  const [userMessage, setUserMessage] = useState('What are your opening hours?')
  const [conversationId, setConversationId] = useState('')
  const [recipient, setRecipient] = useState('')
  const [eventType, setEventType] = useState('order_shipped')
  const [eventDescription, setEventDescription] = useState(
    "The customer's order has shipped.",
  )
  const [eventPayload, setEventPayload] = useState(
    '{\n  "order_id": "12345",\n  "tracking_status": "in_transit"\n}',
  )
  const [agentEventId, setAgentEventId] = useState('')
  const [evaluationCaseIds, setEvaluationCaseIds] = useState('')
  const [evaluationJobId, setEvaluationJobId] = useState('')
  const [evaluationIds, setEvaluationIds] = useState('')
  const [evaluationSummaryIds, setEvaluationSummaryIds] = useState('')

  const testInput = {
    user_msg: userMessage,
    ...(conversationId ? { conversation_id: conversationId } : {}),
  }
  const payload = (() => {
    try {
      return jsonPayload(eventPayload)
    } catch {
      return {}
    }
  })()
  const eventInput = {
    to: recipient,
    event: {
      type: eventType,
      description: eventDescription,
      payload,
    },
  }
  const eventRequestBody = {
    ...eventInput,
    to: recipient || '{{Recipient-Phone-Number}}',
    event: { ...eventInput.event, payload: JSON.stringify(payload) },
  }
  const caseIds = evaluationCaseIds
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  const detailIds = evaluationIds
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  const summaryIds = evaluationSummaryIds
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  return (
    <div className="grid gap-4">
      <Card
        props={props}
        action="runTest"
        title="Run Agent Test"
        method="POST"
        mutation
        defaultOpen
        args={() => [testInput]}
        metaRequest={request('POST', endpoint('agent_test'), testInput)}
      >
        <Textarea
          label="User message (user_msg)"
          value={userMessage}
          onChange={(event) => setUserMessage(event.currentTarget.value)}
          required
        />
        <Input
          label="Conversation ID (conversation_id, optional)"
          value={conversationId}
          onChange={(event) => setConversationId(event.currentTarget.value)}
        />
      </Card>

      <Card
        props={props}
        action="sendAgentEvent"
        title="Send Agent Event"
        method="POST"
        mutation
        args={() => [
          {
            ...eventInput,
            event: { ...eventInput.event, payload: jsonPayload(eventPayload) },
          },
        ]}
        metaRequest={request('POST', endpoint('agent_event'), eventRequestBody)}
      >
        <Input
          label="Recipient phone number (to)"
          value={recipient}
          onChange={(event) => setRecipient(event.currentTarget.value)}
          required
        />
        <Input
          label="Event type (event.type)"
          value={eventType}
          onChange={(event) => setEventType(event.currentTarget.value)}
          maxLength={256}
          required
        />
        <Textarea
          label="Event description (event.description)"
          value={eventDescription}
          onChange={(event) => setEventDescription(event.currentTarget.value)}
          maxLength={1024}
          required
        />
        <Textarea
          label="Event payload (event.payload, JSON object)"
          value={eventPayload}
          onChange={(event) => setEventPayload(event.currentTarget.value)}
          rows={5}
          required
        />
      </Card>

      <Card
        props={props}
        action="getAgentEvent"
        title="Get Agent Event Status"
        method="GET"
        args={() => [agentEventId]}
        metaRequest={request(
          'GET',
          endpoint('agent_event', agentEventId || '{{MBA-Agent-Event-ID}}'),
        )}
      >
        <Input
          label="Agent event ID"
          placeholder="{{MBA-Agent-Event-ID}}"
          value={agentEventId}
          onChange={(event) => setAgentEventId(event.currentTarget.value)}
          required
        />
      </Card>

      <Card
        props={props}
        action="listEvaluationCases"
        title="List Evaluation Cases"
        method="GET"
        metaRequest={request('GET', endpoint('agent-eval', 'cases'))}
      />

      <Card
        props={props}
        action="runEvaluation"
        title="Run Evaluation"
        method="POST"
        mutation
        args={() => [
          {
            evalCaseIds: csv(evaluationCaseIds, 'Evaluation case IDs'),
          },
        ]}
        metaRequest={request(
          'POST',
          endpoint('agent-eval', 'run'),
          {},
          {
            eval_case_ids: caseIds.join(',') || '{{MBA-Eval-Case-IDs}}',
          },
        )}
      >
        <Input
          label="Evaluation case IDs (eval_case_ids, comma-separated)"
          placeholder="{{MBA-Eval-Case-IDs}}"
          value={evaluationCaseIds}
          onChange={(event) => setEvaluationCaseIds(event.currentTarget.value)}
          required
        />
      </Card>

      <Card
        props={props}
        action="getEvaluationJob"
        title="Get Evaluation Job"
        method="GET"
        args={() => [evaluationJobId]}
        metaRequest={request('GET', endpoint('agent-eval', 'run'), undefined, {
          job_id: evaluationJobId || '{{MBA-Eval-Job-ID}}',
        })}
      >
        <Input
          label="Evaluation job ID (job_id)"
          placeholder="{{MBA-Eval-Job-ID}}"
          value={evaluationJobId}
          onChange={(event) => setEvaluationJobId(event.currentTarget.value)}
          required
        />
      </Card>

      <Card
        props={props}
        action="getEvaluationDetails"
        title="Get Evaluation Details"
        method="GET"
        args={() => [csv(evaluationIds, 'Evaluation IDs')]}
        metaRequest={request(
          'GET',
          endpoint('agent-eval', 'details'),
          undefined,
          { eval_ids: detailIds.join(',') || '{{MBA-Eval-IDs}}' },
        )}
      >
        <Input
          label="Evaluation IDs (eval_ids, comma-separated)"
          placeholder="{{MBA-Eval-IDs}}"
          value={evaluationIds}
          onChange={(event) => setEvaluationIds(event.currentTarget.value)}
          required
        />
      </Card>

      <Card
        props={props}
        action="getEvaluationSummaries"
        title="Get Evaluation Summary"
        method="GET"
        args={() => [csv(evaluationSummaryIds, 'Evaluation summary IDs')]}
        metaRequest={request(
          'GET',
          endpoint('agent-eval', 'summary'),
          undefined,
          {
            summary_ids: summaryIds.join(',') || '{{MBA-Eval-Summary-IDs}}',
          },
        )}
      >
        <Input
          label="Evaluation summary IDs (summary_ids, comma-separated)"
          placeholder="{{MBA-Eval-Summary-IDs}}"
          value={evaluationSummaryIds}
          onChange={(event) =>
            setEvaluationSummaryIds(event.currentTarget.value)
          }
          required
        />
      </Card>
    </div>
  )
}
