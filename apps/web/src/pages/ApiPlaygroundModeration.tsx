import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiClient } from '../api'
import {
  PlaygroundOperationCard,
  type PlaygroundOperationState,
} from '../components/api-playground/PlaygroundOperationCard'
import { Input, Textarea } from '../components/ui'

type Props = { channelId: string; mutationDisabled: boolean }
type T = ReturnType<typeof useTranslation>['t']

const graphBlockUsersPath =
  'https://graph.facebook.com/v26.0/PHONE_NUMBER_ID/block_users'

export function ModerationPlayground({ channelId, mutationDisabled }: Props) {
  const { t } = useTranslation()
  return (
    <div
      className="grid gap-4"
      role="tabpanel"
      aria-label={t('apiPlayground.moderation.tab')}
    >
      <ListBlockedUsers channelId={channelId} disabled={!channelId} />
      <ModerateUsers
        operation="block"
        channelId={channelId}
        disabled={mutationDisabled}
      />
      <ModerateUsers
        operation="unblock"
        channelId={channelId}
        disabled={mutationDisabled}
      />
    </div>
  )
}

function ListBlockedUsers({ channelId, disabled }: CardProps) {
  const { t } = useTranslation()
  const request = useOperation()
  const [limit, setLimit] = useState('100')
  const [before, setBefore] = useState('')
  const [after, setAfter] = useState('')
  return (
    <PlaygroundOperationCard
      method="GET"
      title={t('apiPlayground.moderation.list.title')}
      description={t('apiPlayground.moderation.list.description')}
      action={t('apiPlayground.moderation.list.action')}
      state={request.state}
      disabled={disabled}
      request={{
        path: graphBlockUsersPath,
        query: {
          ...(limit ? { limit } : {}),
          ...(before ? { before } : {}),
          ...(after ? { after } : {}),
        },
      }}
      defaultOpen
      resultLabel={t('apiPlayground.result')}
      onSubmit={() =>
        void request.run(async () =>
          readResult(
            await apiClient.api.playground.moderation[':channelId'].$get({
              param: { channelId },
              query: {
                ...(limit ? { limit } : {}),
                ...(before ? { before } : {}),
                ...(after ? { after } : {}),
              },
            }),
            t,
          ),
        )
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Input
          type="number"
          min={1}
          max={1000}
          label={t('apiPlayground.moderation.list.limit')}
          value={limit}
          onChange={(event) => setLimit(event.currentTarget.value)}
        />
        <Input
          label={t('apiPlayground.moderation.list.before')}
          hint={t('apiPlayground.moderation.list.cursorHint')}
          value={before}
          onChange={(event) => setBefore(event.currentTarget.value)}
        />
        <Input
          label={t('apiPlayground.moderation.list.after')}
          hint={t('apiPlayground.moderation.list.cursorHint')}
          value={after}
          onChange={(event) => setAfter(event.currentTarget.value)}
        />
      </div>
    </PlaygroundOperationCard>
  )
}

function ModerateUsers({
  operation,
  channelId,
  disabled,
}: CardProps & {
  operation: 'block' | 'unblock'
}) {
  const { t } = useTranslation()
  const request = useOperation()
  const [users, setUsers] = useState('')
  const prefix = `apiPlayground.moderation.${operation}` as const
  const parsedUsers = users
    .split(/[\n,]/)
    .map((user) => user.trim())
    .filter(Boolean)
  return (
    <PlaygroundOperationCard
      method={operation === 'block' ? 'POST' : 'DELETE'}
      title={t(`${prefix}.title`)}
      description={t(`${prefix}.description`)}
      action={t(`${prefix}.action`)}
      state={request.state}
      disabled={disabled}
      request={{
        path: graphBlockUsersPath,
        body: {
          messaging_product: 'whatsapp',
          block_users: parsedUsers,
        },
      }}
      resultLabel={t('apiPlayground.result')}
      onSubmit={() =>
        void request.run(async () => {
          const parsedUsers = parseUsers(users, t)
          const route =
            apiClient.api.playground.moderation[':channelId'][operation]
          return readResult(
            await route.$post({
              param: { channelId },
              json: { users: parsedUsers },
            }),
            t,
          )
        })
      }
    >
      <Textarea
        label={t('apiPlayground.moderation.users')}
        hint={t('apiPlayground.moderation.usersHint')}
        rows={6}
        value={users}
        onChange={(event) => setUsers(event.currentTarget.value)}
      />
    </PlaygroundOperationCard>
  )
}

type CardProps = { channelId: string; disabled: boolean }

function parseUsers(value: string, t: T) {
  const users = value
    .split(/[\n,]/)
    .map((user) => user.trim())
    .filter(Boolean)
  if (users.length === 0) {
    throw new Error(t('apiPlayground.moderation.usersRequired'))
  }
  if (users.length > 1_000) {
    throw new Error(t('apiPlayground.moderation.tooManyUsers'))
  }
  return users
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
