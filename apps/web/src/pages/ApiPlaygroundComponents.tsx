import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiClient } from '../api'
import {
  PlaygroundOperationCard,
  type PlaygroundOperationState,
} from '../components/api-playground/PlaygroundOperationCard'
import { Textarea } from '../components/ui'

type Props = { channelId: string; mutationDisabled: boolean }
type T = ReturnType<typeof useTranslation>['t']

const defaultPayload = JSON.stringify(
  {
    prompts: ['Track my order', 'Show me current offers'],
    commands: [
      {
        commandName: 'shipping_options',
        commandDescription: 'Show available shipping options',
      },
    ],
  },
  null,
  2,
)

export function ComponentsPlayground({ channelId, mutationDisabled }: Props) {
  const { t } = useTranslation()
  return (
    <div
      className="grid gap-4"
      role="tabpanel"
      aria-label={t('apiPlayground.components.tab')}
    >
      <GetComponents channelId={channelId} disabled={!channelId} />
      <SetComponents channelId={channelId} disabled={mutationDisabled} />
    </div>
  )
}

function SetComponents({
  channelId,
  disabled,
}: {
  channelId: string
  disabled: boolean
}) {
  const { t } = useTranslation()
  const request = useOperation()
  const [payload, setPayload] = useState(defaultPayload)
  return (
    <PlaygroundOperationCard
      method="POST"
      title={t('apiPlayground.components.set.title')}
      description={t('apiPlayground.components.set.description')}
      action={t('apiPlayground.components.set.action')}
      state={request.state}
      disabled={disabled}
      resultLabel={t('apiPlayground.result')}
      onSubmit={() =>
        void request.run(async () =>
          readResult(
            await apiClient.api.playground.components[':channelId'].$post({
              param: { channelId },
              json: parsePayload(payload, t),
            }),
            t,
          ),
        )
      }
    >
      <Textarea
        label={t('apiPlayground.components.payload')}
        hint={t('apiPlayground.components.payloadHint')}
        rows={12}
        value={payload}
        onChange={(event) => setPayload(event.currentTarget.value)}
      />
    </PlaygroundOperationCard>
  )
}

function GetComponents({
  channelId,
  disabled,
}: {
  channelId: string
  disabled: boolean
}) {
  const { t } = useTranslation()
  const request = useOperation()
  return (
    <PlaygroundOperationCard
      method="GET"
      title={t('apiPlayground.components.get.title')}
      description={t('apiPlayground.components.get.description')}
      action={t('apiPlayground.components.get.action')}
      state={request.state}
      disabled={disabled}
      defaultOpen
      resultLabel={t('apiPlayground.result')}
      onSubmit={() =>
        void request.run(async () =>
          readResult(
            await apiClient.api.playground.components[':channelId'].$get({
              param: { channelId },
            }),
            t,
          ),
        )
      }
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

function parsePayload(value: string, t: T) {
  try {
    const parsed: unknown = JSON.parse(value)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed)
    ) {
      return parsed as {
        prompts?: string[]
        commands?: Array<{ commandName: string; commandDescription: string }>
      }
    }
  } catch {
    /* use the localized validation message */
  }
  throw new Error(t('apiPlayground.components.validJson'))
}

async function readResult(response: Response, t: T) {
  const body: unknown = await response.json()
  if (!response.ok) {
    throw new Error(
      message(body) ??
        t('apiPlayground.requestFailed', { status: response.status }),
    )
  }
  if (typeof body !== 'object' || body === null || !('result' in body)) {
    throw new Error(t('apiPlayground.unexpectedResponse'))
  }
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
