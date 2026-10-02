import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiClient } from '../api'
import {
  PlaygroundOperationCard,
  type PlaygroundOperationState,
} from '../components/api-playground/PlaygroundOperationCard'
import { Input } from '../components/ui'

type Props = { channelId: string }
type T = ReturnType<typeof useTranslation>['t']

export function WabaPlayground({ channelId }: Props) {
  const { t } = useTranslation()
  return (
    <div
      className="grid gap-4"
      role="tabpanel"
      aria-label={t('apiPlayground.waba.tab')}
    >
      <GetAccount channelId={channelId} />
      <ListAccounts channelId={channelId} kind="owned" />
      <ListAccounts channelId={channelId} kind="shared" />
    </div>
  )
}

function GetAccount({ channelId }: Props) {
  const { t } = useTranslation()
  const operation = useOperation()
  const [wabaId, setWabaId] = useState('')
  return (
    <PlaygroundOperationCard
      method="GET"
      title={t('apiPlayground.waba.get.title')}
      description={t('apiPlayground.waba.get.description')}
      action={t('apiPlayground.waba.get.action')}
      state={operation.state}
      disabled={!channelId || !wabaId}
      defaultOpen
      resultLabel={t('apiPlayground.result')}
      onSubmit={() =>
        void operation.run(async () =>
          result(
            await apiClient.api.playground.waba[':channelId'].accounts[
              ':wabaId'
            ].$get({ param: { channelId, wabaId } }),
            t,
          ),
        )
      }
    >
      <Input
        label={t('apiPlayground.waba.wabaId')}
        hint={t('apiPlayground.waba.wabaIdHint')}
        value={wabaId}
        required
        onChange={(event) => setWabaId(event.currentTarget.value)}
      />
    </PlaygroundOperationCard>
  )
}

function ListAccounts({
  channelId,
  kind,
}: Props & { kind: 'owned' | 'shared' }) {
  const { t } = useTranslation()
  const operation = useOperation()
  const [businessId, setBusinessId] = useState('')
  const [limit, setLimit] = useState('100')
  const [before, setBefore] = useState('')
  const [after, setAfter] = useState('')
  const prefix = `apiPlayground.waba.${kind}` as const
  return (
    <PlaygroundOperationCard
      method="GET"
      title={t(`${prefix}.title`)}
      description={t(`${prefix}.description`)}
      action={t(`${prefix}.action`)}
      state={operation.state}
      disabled={!channelId || !businessId}
      resultLabel={t('apiPlayground.result')}
      onSubmit={() =>
        void operation.run(async () => {
          const route =
            apiClient.api.playground.waba[':channelId'].businesses[
              ':businessId'
            ][kind]
          return result(
            await route.$get({
              param: { channelId, businessId },
              query: {
                ...(limit ? { limit } : {}),
                ...(before ? { before } : {}),
                ...(after ? { after } : {}),
              },
            }),
            t,
          )
        })
      }
    >
      <Input
        label={t('apiPlayground.waba.businessId')}
        hint={t('apiPlayground.waba.businessIdHint')}
        value={businessId}
        required
        onChange={(event) => setBusinessId(event.currentTarget.value)}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <Input
          type="number"
          min={1}
          max={1000}
          label={t('apiPlayground.waba.limit')}
          value={limit}
          onChange={(event) => setLimit(event.currentTarget.value)}
        />
        <Input
          label={t('apiPlayground.waba.before')}
          hint={t('apiPlayground.waba.cursorHint')}
          value={before}
          onChange={(event) => setBefore(event.currentTarget.value)}
        />
        <Input
          label={t('apiPlayground.waba.after')}
          hint={t('apiPlayground.waba.cursorHint')}
          value={after}
          onChange={(event) => setAfter(event.currentTarget.value)}
        />
      </div>
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

async function result(response: Response, t: T): Promise<unknown> {
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
