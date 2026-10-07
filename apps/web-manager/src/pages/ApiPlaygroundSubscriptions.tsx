import type { InferResponseType } from 'hono/client'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiClient } from '../api'
import {
  PlaygroundOperationCard,
  type PlaygroundOperationState,
} from '../components/api-playground'
import { Checkbox, Input } from '@mba-desk/ui'

type Props = {
  channelId: string
  appId: string
  wabaId: string
  mutationDisabled: boolean
}
type T = ReturnType<typeof useTranslation>['t']
type FieldsResponse = InferResponseType<
  typeof apiClient.api.playground.subscriptions.fields.$get,
  200
>
type SubscriptionField = FieldsResponse['fields'][number]

export function SubscriptionsPlayground({
  channelId,
  appId,
  wabaId,
  mutationDisabled,
}: Props) {
  const { t } = useTranslation()
  const [availableFields, setAvailableFields] = useState<SubscriptionField[]>(
    [],
  )
  const [selectedFields, setSelectedFields] = useState<SubscriptionField[]>([])

  useEffect(() => {
    let active = true
    void apiClient.api.playground.subscriptions.fields
      .$get()
      .then(async (response) => {
        if (!response.ok) return
        const body = await response.json()
        if (!active) return
        setAvailableFields([...body.fields])
        setSelectedFields([...body.recommendedFields])
      })
    return () => {
      active = false
    }
  }, [])

  return (
    <div
      className="grid gap-4"
      role="tabpanel"
      aria-label={t('apiPlayground.subscriptions.tab')}
    >
      <RegisterAppWebhook
        channelId={channelId}
        appId={appId}
        disabled={mutationDisabled}
        availableFields={availableFields}
        selectedFields={selectedFields}
        onSelectedFieldsChange={setSelectedFields}
      />
      <ListAppRegistration
        channelId={channelId}
        appId={appId}
        disabled={!channelId}
      />
      <Subscribe
        channelId={channelId}
        wabaId={wabaId}
        disabled={mutationDisabled}
      />
      <ListSubscriptions
        channelId={channelId}
        wabaId={wabaId}
        disabled={!channelId}
      />
      <OverrideCallback
        channelId={channelId}
        wabaId={wabaId}
        disabled={mutationDisabled}
      />
      <Unsubscribe
        channelId={channelId}
        wabaId={wabaId}
        disabled={mutationDisabled}
      />
    </div>
  )
}

function RegisterAppWebhook({
  channelId,
  appId,
  disabled,
  availableFields,
  selectedFields,
  onSelectedFieldsChange,
}: CardProps & {
  appId: string
  availableFields: SubscriptionField[]
  selectedFields: SubscriptionField[]
  onSelectedFieldsChange: (fields: SubscriptionField[]) => void
}) {
  const { t } = useTranslation()
  const operation = useOperation()
  const [callbackUrl, setCallbackUrl] = useState('')
  const [verifyToken, setVerifyToken] = useState('')
  return (
    <PlaygroundOperationCard
      method="POST"
      title={t('apiPlayground.subscriptions.appRegistration.title')}
      description={t('apiPlayground.subscriptions.appRegistration.description')}
      action={t('apiPlayground.subscriptions.appRegistration.action')}
      state={operation.state}
      request={{
        path: `https://graph.facebook.com/v26.0/${appId || 'APP_ID'}/subscriptions`,
        auth: 'none',
        contentType: 'application/x-www-form-urlencoded',
        body: {
          object: 'whatsapp_business_account',
          callback_url: callbackUrl,
          verify_token: verifyToken,
          fields: selectedFields.join(','),
          access_token: `${appId || 'APP_ID'}|APP_SECRET`,
        },
      }}
      disabled={
        disabled || !callbackUrl || !verifyToken || selectedFields.length === 0
      }
      defaultOpen
      resultLabel={t('apiPlayground.result')}
      onSubmit={() =>
        void operation.run(async () =>
          result(
            await apiClient.api.playground.subscriptions[':channelId'][
              'app-registration'
            ].$post({
              param: { channelId },
              json: {
                callbackUrl,
                verifyToken,
                fields: selectedFields,
              },
            }),
            t,
          ),
        )
      }
    >
      <Input
        type="url"
        label={t('apiPlayground.subscriptions.callbackUrl')}
        hint={t('apiPlayground.subscriptions.callbackUrlHint')}
        value={callbackUrl}
        required
        onChange={(event) => setCallbackUrl(event.currentTarget.value)}
      />
      <Input
        label={t('apiPlayground.subscriptions.verifyToken')}
        hint={t('apiPlayground.subscriptions.verifyTokenHint')}
        value={verifyToken}
        required
        onChange={(event) => setVerifyToken(event.currentTarget.value)}
      />
      <fieldset className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <legend className="text-sm font-semibold">
            {t('apiPlayground.subscriptions.fields')}
          </legend>
          <span className="text-xs text-muted-foreground">
            {t('apiPlayground.subscriptions.selectedFields', {
              count: selectedFields.length,
            })}
          </span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {availableFields.map((field) => (
            <Checkbox
              key={field}
              label={field}
              checked={selectedFields.includes(field)}
              onChange={(event) =>
                onSelectedFieldsChange(
                  event.currentTarget.checked
                    ? [...selectedFields, field]
                    : selectedFields.filter((value) => value !== field),
                )
              }
            />
          ))}
        </div>
      </fieldset>
    </PlaygroundOperationCard>
  )
}

function ListAppRegistration({ channelId, appId, disabled }: CardProps) {
  const { t } = useTranslation()
  const operation = useOperation()
  return (
    <PlaygroundOperationCard
      method="GET"
      title={t('apiPlayground.subscriptions.appList.title')}
      description={t('apiPlayground.subscriptions.appList.description')}
      action={t('apiPlayground.subscriptions.appList.action')}
      state={operation.state}
      request={{
        path: `https://graph.facebook.com/v26.0/${appId || 'APP_ID'}/subscriptions`,
        auth: 'none',
        query: { access_token: `${appId || 'APP_ID'}|APP_SECRET` },
      }}
      disabled={disabled}
      resultLabel={t('apiPlayground.result')}
      onSubmit={() =>
        void operation.run(async () =>
          result(
            await apiClient.api.playground.subscriptions[':channelId'][
              'app-registration'
            ].$get({ param: { channelId } }),
            t,
          ),
        )
      }
    />
  )
}

function Subscribe({ channelId, wabaId, disabled }: CardProps) {
  const { t } = useTranslation()
  const operation = useOperation()
  return (
    <PlaygroundOperationCard
      method="POST"
      title={t('apiPlayground.subscriptions.subscribe.title')}
      description={t('apiPlayground.subscriptions.subscribe.description')}
      action={t('apiPlayground.subscriptions.subscribe.action')}
      state={operation.state}
      request={{
        path: `https://graph.facebook.com/v26.0/${wabaId || 'WABA_ID'}/subscribed_apps`,
        auth: 'none',
        headers: { Authorization: 'Bearer ACCESS_TOKEN' },
      }}
      disabled={disabled}
      resultLabel={t('apiPlayground.result')}
      onSubmit={() =>
        void operation.run(async () =>
          result(
            await apiClient.api.playground.subscriptions[':channelId'].$post({
              param: { channelId },
            }),
            t,
          ),
        )
      }
    />
  )
}

function ListSubscriptions({ channelId, wabaId, disabled }: CardProps) {
  const { t } = useTranslation()
  const operation = useOperation()
  return (
    <PlaygroundOperationCard
      method="GET"
      title={t('apiPlayground.subscriptions.list.title')}
      description={t('apiPlayground.subscriptions.list.description')}
      action={t('apiPlayground.subscriptions.list.action')}
      state={operation.state}
      request={{
        path: `https://graph.facebook.com/v26.0/${wabaId || 'WABA_ID'}/subscribed_apps`,
        auth: 'none',
        headers: { Authorization: 'Bearer ACCESS_TOKEN' },
      }}
      disabled={disabled}
      resultLabel={t('apiPlayground.result')}
      onSubmit={() =>
        void operation.run(async () =>
          result(
            await apiClient.api.playground.subscriptions[':channelId'].$get({
              param: { channelId },
            }),
            t,
          ),
        )
      }
    />
  )
}

function OverrideCallback({ channelId, wabaId, disabled }: CardProps) {
  const { t } = useTranslation()
  const operation = useOperation()
  const [callbackUrl, setCallbackUrl] = useState('')
  const [verifyToken, setVerifyToken] = useState('')
  return (
    <PlaygroundOperationCard
      method="POST"
      title={t('apiPlayground.subscriptions.override.title')}
      description={t('apiPlayground.subscriptions.override.description')}
      action={t('apiPlayground.subscriptions.override.action')}
      state={operation.state}
      request={{
        path: `https://graph.facebook.com/v26.0/${wabaId || 'WABA_ID'}/subscribed_apps`,
        auth: 'none',
        headers: { Authorization: 'Bearer ACCESS_TOKEN' },
        body: {
          override_callback_uri: callbackUrl,
          verify_token: verifyToken,
        },
      }}
      disabled={disabled || !callbackUrl || !verifyToken}
      resultLabel={t('apiPlayground.result')}
      onSubmit={() =>
        void operation.run(async () =>
          result(
            await apiClient.api.playground.subscriptions[':channelId'][
              'override-callback'
            ].$post({
              param: { channelId },
              json: { callbackUrl, verifyToken },
            }),
            t,
          ),
        )
      }
    >
      <Input
        type="url"
        label={t('apiPlayground.subscriptions.callbackUrl')}
        hint={t('apiPlayground.subscriptions.callbackUrlHint')}
        value={callbackUrl}
        required
        onChange={(event) => setCallbackUrl(event.currentTarget.value)}
      />
      <Input
        label={t('apiPlayground.subscriptions.verifyToken')}
        hint={t('apiPlayground.subscriptions.verifyTokenHint')}
        value={verifyToken}
        maxLength={2000}
        required
        onChange={(event) => setVerifyToken(event.currentTarget.value)}
      />
    </PlaygroundOperationCard>
  )
}

function Unsubscribe({ channelId, wabaId, disabled }: CardProps) {
  const { t } = useTranslation()
  const operation = useOperation()
  const [confirmed, setConfirmed] = useState(false)
  return (
    <PlaygroundOperationCard
      method="DELETE"
      title={t('apiPlayground.subscriptions.unsubscribe.title')}
      description={t('apiPlayground.subscriptions.unsubscribe.description')}
      action={t('apiPlayground.subscriptions.unsubscribe.action')}
      state={operation.state}
      request={{
        path: `https://graph.facebook.com/v26.0/${wabaId || 'WABA_ID'}/subscribed_apps`,
        auth: 'none',
        headers: { Authorization: 'Bearer ACCESS_TOKEN' },
      }}
      disabled={disabled || !confirmed}
      buttonVariant="danger"
      resultLabel={t('apiPlayground.result')}
      onSubmit={() =>
        void operation.run(async () =>
          result(
            await apiClient.api.playground.subscriptions[':channelId'].$delete({
              param: { channelId },
            }),
            t,
          ),
        )
      }
    >
      <Checkbox
        label={t('apiPlayground.subscriptions.unsubscribe.confirm')}
        checked={confirmed}
        onChange={(event) => setConfirmed(event.currentTarget.checked)}
      />
    </PlaygroundOperationCard>
  )
}

interface CardProps {
  channelId: string
  appId?: string
  wabaId?: string
  disabled: boolean
}

function useOperation() {
  const { t } = useTranslation()
  const [state, setState] = useState<PlaygroundOperationState>({
    status: 'idle',
  })
  const run = async (request: () => Promise<unknown>) => {
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
  }
  return { state, run }
}

async function result(response: Response, t: T): Promise<unknown> {
  const body: unknown = await response.json()
  if (!response.ok)
    throw new Error(
      readMessage(body) ??
        t('apiPlayground.requestFailed', { status: response.status }),
    )
  if (typeof body !== 'object' || body === null || !('result' in body))
    throw new Error(t('apiPlayground.unexpectedResponse'))
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
