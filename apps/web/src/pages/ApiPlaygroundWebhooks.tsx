import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiClient } from '../api'
import {
  PlaygroundOperationCard,
  type PlaygroundOperationState,
} from '../components/api-playground/PlaygroundOperationCard'
import { Textarea } from '../components/ui'

type T = ReturnType<typeof useTranslation>['t']

const exampleWebhook = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'WABA_ID',
      changes: [
        {
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: {
              display_phone_number: '15551234567',
              phone_number_id: 'PHONE_NUMBER_ID',
            },
            contacts: [{ wa_id: '15557654321' }],
            messages: [
              {
                from: '15557654321',
                id: 'wamid.MESSAGE_ID',
                timestamp: '1790899200',
                type: 'text',
                text: { body: 'Hello' },
              },
            ],
          },
        },
      ],
    },
  ],
}

export function WebhooksPlayground({ channelId }: { channelId: string }) {
  const { t } = useTranslation()
  const request = useOperation()
  const [payload, setPayload] = useState(
    JSON.stringify(exampleWebhook, null, 2),
  )

  return (
    <div
      className="grid gap-4"
      role="tabpanel"
      aria-label={t('apiPlayground.webhooks.tab')}
    >
      <PlaygroundOperationCard
        method="POST"
        title={t('apiPlayground.webhooks.operations.validate')}
        description={t('apiPlayground.webhooks.description')}
        action={t('apiPlayground.webhooks.execute')}
        state={request.state}
        disabled={!channelId}
        defaultOpen
        resultLabel={t('apiPlayground.result')}
        request={{
          path: 'https://your-domain.example/webhooks/whatsapp',
          body: parsePayloadExample(payload),
          auth: 'none',
        }}
        onSubmit={() =>
          void request.run(async () =>
            readResult(
              await apiClient.api.playground.webhooks[
                ':channelId'
              ].validate.$post({
                param: { channelId },
                json: { payload: parsePayload(payload, t) },
              }),
              t,
            ),
          )
        }
      >
        <Textarea
          label={t('apiPlayground.webhooks.payload')}
          hint={t('apiPlayground.webhooks.payloadHint')}
          rows={18}
          value={payload}
          onChange={(event) => setPayload(event.currentTarget.value)}
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
    run: async (operation: () => Promise<unknown>) => {
      setState({ status: 'loading' })
      try {
        setState({ status: 'success', result: await operation() })
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

function parsePayload(value: string, t: T): unknown {
  try {
    return JSON.parse(value) as unknown
  } catch {
    throw new Error(t('apiPlayground.webhooks.invalidJson'))
  }
}

function parsePayloadExample(value: string): unknown {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}

async function readResult(response: Response, t: T) {
  const body: unknown = await response.json()
  if (!response.ok) {
    throw new Error(
      validationMessage(body) ??
        message(body) ??
        t('apiPlayground.requestFailed', { status: response.status }),
    )
  }
  if (typeof body !== 'object' || body === null || !('result' in body))
    throw new Error(t('apiPlayground.unexpectedResponse'))
  return body.result
}

function validationMessage(value: unknown) {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('issues' in value) ||
    !Array.isArray(value.issues)
  )
    return undefined
  const issues = (value as { issues: unknown[] }).issues
    .map((issue) => {
      if (typeof issue !== 'object' || issue === null) return undefined
      const path =
        'path' in issue && Array.isArray(issue.path)
          ? issue.path.join('.')
          : undefined
      const detail =
        'message' in issue && typeof issue.message === 'string'
          ? issue.message
          : undefined
      return detail ? `${path ? `${path}: ` : ''}${detail}` : undefined
    })
    .filter((issue): issue is string => issue !== undefined)
  return issues.length > 0 ? issues.join('\n') : undefined
}

function message(value: unknown) {
  return typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    typeof value.message === 'string'
    ? value.message
    : undefined
}
