import type { InferRequestType } from 'hono/client'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiClient } from '../api'
import {
  PlaygroundOperationCard,
  type PlaygroundOperationState,
} from '../components/api-playground'
import { Input, Select, Textarea } from '@mba-desk/ui'

type MarketingMessageRequest = InferRequestType<
  (typeof apiClient.api.playground.marketing)[':channelId']['send']['$post']
>['json']

export function MarketingPlayground({
  channelId,
  disabled,
}: {
  channelId: string
  disabled: boolean
}) {
  const { t } = useTranslation()
  const [state, setState] = useState<PlaygroundOperationState>({
    status: 'idle',
  })
  const [to, setTo] = useState('')
  const [name, setName] = useState('')
  const [language, setLanguage] = useState('en_US')
  const [components, setComponents] = useState('[]')
  const [productPolicy, setProductPolicy] = useState<
    '' | 'CLOUD_API_FALLBACK' | 'STRICT'
  >('')
  const [activitySharing, setActivitySharing] = useState<'' | 'true' | 'false'>(
    '',
  )
  const [bidMultiplier, setBidMultiplier] = useState('')

  const request = (): MarketingMessageRequest => ({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name,
      language: { code: language },
      components: parseComponents(components, t),
    },
    ...(productPolicy ? { product_policy: productPolicy } : {}),
    ...(activitySharing
      ? { message_activity_sharing: activitySharing === 'true' }
      : {}),
    ...(bidMultiplier
      ? {
          bid_spec: {
            per_message_bid_multiplier: parsePositiveNumber(bidMultiplier, t),
          },
        }
      : {}),
  })

  return (
    <div
      className="grid gap-4"
      role="tabpanel"
      aria-label={t('apiPlayground.marketing.tab')}
    >
      <PlaygroundOperationCard
        method="POST"
        request={{
          path: 'https://graph.facebook.com/v26.0/PHONE_NUMBER_ID/marketing_messages',
          body: previewRequest({
            to,
            name,
            language,
            components,
            productPolicy,
            activitySharing,
            bidMultiplier,
          }),
        }}
        title={t('apiPlayground.marketing.send.title')}
        description={t('apiPlayground.marketing.send.description')}
        action={t('apiPlayground.marketing.send.action')}
        state={state}
        disabled={disabled}
        defaultOpen
        resultLabel={t('apiPlayground.result')}
        onSubmit={() => {
          void run(async () => {
            const response = await apiClient.api.playground.marketing[
              ':channelId'
            ]['send'].$post({ param: { channelId }, json: request() })
            return readApiResult(response, t)
          }, setState)
        }}
      >
        <Input
          label={t('apiPlayground.marketing.send.to')}
          hint={t('apiPlayground.marketing.send.toHint')}
          value={to}
          required
          onChange={(event) => setTo(event.currentTarget.value)}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label={t('apiPlayground.marketing.send.templateName')}
            value={name}
            required
            onChange={(event) => setName(event.currentTarget.value)}
          />
          <Input
            label={t('apiPlayground.marketing.send.language')}
            value={language}
            required
            onChange={(event) => setLanguage(event.currentTarget.value)}
          />
        </div>
        <Textarea
          className="min-h-44 font-mono text-xs"
          label={t('apiPlayground.marketing.send.components')}
          hint={t('apiPlayground.marketing.send.componentsHint')}
          value={components}
          required
          spellCheck={false}
          onChange={(event) => setComponents(event.currentTarget.value)}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label={t('apiPlayground.marketing.send.productPolicy')}
            hint={t('apiPlayground.marketing.send.productPolicyHint')}
            value={productPolicy}
            onChange={(event) =>
              setProductPolicy(
                event.currentTarget.value as typeof productPolicy,
              )
            }
          >
            <option value="">
              {t('apiPlayground.marketing.send.providerDefault')}
            </option>
            <option value="CLOUD_API_FALLBACK">CLOUD_API_FALLBACK</option>
            <option value="STRICT">STRICT</option>
          </Select>
          <Select
            label={t('apiPlayground.marketing.send.activitySharing')}
            hint={t('apiPlayground.marketing.send.activitySharingHint')}
            value={activitySharing}
            onChange={(event) =>
              setActivitySharing(
                event.currentTarget.value as typeof activitySharing,
              )
            }
          >
            <option value="">
              {t('apiPlayground.marketing.send.providerDefault')}
            </option>
            <option value="true">
              {t('apiPlayground.marketing.send.enabled')}
            </option>
            <option value="false">
              {t('apiPlayground.marketing.send.disabled')}
            </option>
          </Select>
        </div>
        <Input
          type="number"
          min="0"
          step="any"
          label={t('apiPlayground.marketing.send.bidMultiplier')}
          hint={t('apiPlayground.marketing.send.bidMultiplierHint')}
          value={bidMultiplier}
          onChange={(event) => setBidMultiplier(event.currentTarget.value)}
        />
      </PlaygroundOperationCard>
    </div>
  )
}

function parseComponents(
  value: string,
  t: ReturnType<typeof useTranslation>['t'],
): Record<string, unknown>[] {
  try {
    const parsed = JSON.parse(value) as unknown
    if (
      !Array.isArray(parsed) ||
      parsed.some(
        (item) =>
          typeof item !== 'object' || item === null || Array.isArray(item),
      )
    ) {
      throw new Error()
    }
    return parsed as Record<string, unknown>[]
  } catch {
    throw new Error(t('apiPlayground.marketing.send.componentsInvalid'))
  }
}

function parsePositiveNumber(
  value: string,
  t: ReturnType<typeof useTranslation>['t'],
) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(t('apiPlayground.marketing.send.bidMultiplierInvalid'))
  }
  return number
}

function previewRequest(input: {
  to: string
  name: string
  language: string
  components: string
  productPolicy: '' | 'CLOUD_API_FALLBACK' | 'STRICT'
  activitySharing: '' | 'true' | 'false'
  bidMultiplier: string
}): Record<string, unknown> {
  let components: unknown = input.components
  try {
    components = JSON.parse(input.components) as unknown
  } catch {
    // Preserve invalid text in request previews until form validation runs.
  }
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: input.to,
    type: 'template',
    template: {
      name: input.name,
      language: { code: input.language },
      components,
    },
    ...(input.productPolicy ? { product_policy: input.productPolicy } : {}),
    ...(input.activitySharing
      ? { message_activity_sharing: input.activitySharing === 'true' }
      : {}),
    ...(input.bidMultiplier
      ? {
          bid_spec: {
            per_message_bid_multiplier:
              Number(input.bidMultiplier) || input.bidMultiplier,
          },
        }
      : {}),
  }
}

async function run(
  request: () => Promise<unknown>,
  setState: (state: PlaygroundOperationState) => void,
) {
  setState({ status: 'loading' })
  try {
    setState({ status: 'success', result: await request() })
  } catch (error) {
    setState({
      status: 'error',
      message: error instanceof Error ? error.message : 'Request failed',
    })
  }
}

async function readApiResult(
  response: Response,
  t: ReturnType<typeof useTranslation>['t'],
): Promise<unknown> {
  const body = (await response.json()) as {
    result?: unknown
    message?: string
  }
  if (!response.ok) {
    throw new Error(body.message ?? t('apiPlayground.operationFailed'))
  }
  if (!('result' in body)) {
    throw new Error(t('apiPlayground.unexpectedResponse'))
  }
  return body.result
}
