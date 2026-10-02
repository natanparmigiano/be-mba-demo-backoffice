import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiClient } from '../api'
import {
  PlaygroundOperationCard,
  type PlaygroundOperationState,
} from '../components/api-playground/PlaygroundOperationCard'
import { Select, Textarea } from '../components/ui'

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

export function MbaPlayground({
  channelId,
  mutationDisabled,
}: {
  channelId: string
  mutationDisabled: boolean
}) {
  const { t } = useTranslation()
  const operation = useOperation()
  const [action, setAction] = useState<Action>('getEligibility')
  const [argumentJson, setArgumentJson] = useState('[]')
  const [optionsJson, setOptionsJson] = useState('{}')
  const mutates = (mutationActions as readonly string[]).includes(action)

  return (
    <div role="tabpanel" aria-label={t('apiPlayground.mba.tab')}>
      <PlaygroundOperationCard
        method="POST"
        title={t('apiPlayground.mba.title')}
        description={t('apiPlayground.mba.description')}
        action={t('apiPlayground.mba.action')}
        state={operation.state}
        disabled={!channelId || (mutates && mutationDisabled)}
        defaultOpen
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
        <Select
          label={t('apiPlayground.mba.operation')}
          hint={t('apiPlayground.mba.operationHint')}
          value={action}
          onChange={(event) => setAction(event.currentTarget.value as Action)}
        >
          {actions.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </Select>
        <Textarea
          label={t('apiPlayground.mba.arguments')}
          hint={t('apiPlayground.mba.argumentsHint')}
          rows={8}
          value={argumentJson}
          onChange={(event) => setArgumentJson(event.currentTarget.value)}
        />
        <Textarea
          label={t('apiPlayground.mba.options')}
          hint={t('apiPlayground.mba.optionsHint')}
          rows={5}
          value={optionsJson}
          onChange={(event) => setOptionsJson(event.currentTarget.value)}
        />
      </PlaygroundOperationCard>
    </div>
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
function parseArray(value: string, t: T): unknown[] {
  try {
    const parsed: unknown = JSON.parse(value)
    if (Array.isArray(parsed)) return parsed
  } catch {
    /* use localized error */
  }
  throw new Error(t('apiPlayground.mba.argumentsHint'))
}
function parseObject(value: string, t: T): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value)
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed))
      return parsed as Record<string, unknown>
  } catch {
    /* use localized error */
  }
  throw new Error(t('apiPlayground.mba.optionsHint'))
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
