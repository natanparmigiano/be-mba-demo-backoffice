import type { InferResponseType } from 'hono/client'
import { Bot, Phone, RadioTower, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { apiClient } from '../api'
import { authClient } from '../auth/auth-client'
import {
  emptyChannelQrState,
  fetchChannelQrState,
  type ChannelQrState,
} from '../channel-qr'
import { ChannelQrCode } from '../components/channel-qr-code'
import {
  Button,
  cn,
  EmptyState,
  InlineFeedback,
  PageHeader,
  Pill,
} from '@mba-desk/ui'

type ChannelsResponse = InferResponseType<
  typeof apiClient.api.channels.$get,
  200
>
type ChannelSummary = ChannelsResponse['channels'][number]
type AgentStatus =
  'loading' | 'not_configured' | 'enabled' | 'disabled' | 'error'
type RegistrationStatus = 'loading' | 'registered' | 'unregistered' | 'error'
interface RegistrationState {
  status: RegistrationStatus
  providerStatus: string | null
}

export function AgentsPage() {
  const { t, i18n } = useTranslation()
  const activeOrganizationQuery = authClient.useActiveOrganization()
  const activeOrganization = activeOrganizationQuery.data
  const [channels, setChannels] = useState<ChannelSummary[]>([])
  const [agentStatuses, setAgentStatuses] = useState<
    Record<number, AgentStatus>
  >({})
  const [registrationStates, setRegistrationStates] = useState<
    Record<number, RegistrationState>
  >({})
  const [qrStates, setQrStates] = useState<Record<number, ChannelQrState>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(0)

  useEffect(() => {
    document.title = `${t('agents.title')} · ${t('design.brand')}`
    document
      .querySelector<HTMLMetaElement>('meta[name="description"]')
      ?.setAttribute('content', t('agents.metaDescription'))
  }, [t])

  const refreshChannels = useCallback(async () => {
    const currentRequestId = ++requestId.current
    if (!activeOrganization?.id) {
      setChannels([])
      setAgentStatuses({})
      setRegistrationStates({})
      setQrStates({})
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const response = await apiClient.api.channels.$get()
      if (!response.ok) throw new Error(t('agents.loadFailed'))
      const nextChannels = (await response.json()).channels
      if (requestId.current !== currentRequestId) return
      setChannels(nextChannels)
      setAgentStatuses(
        Object.fromEntries(
          nextChannels.map((channel) => [channel.id, 'loading']),
        ),
      )
      setRegistrationStates(
        Object.fromEntries(
          nextChannels.map((channel) => [
            channel.id,
            { status: 'loading', providerStatus: null },
          ]),
        ),
      )
      setQrStates(
        Object.fromEntries(
          nextChannels.map((channel) => [
            channel.id,
            emptyChannelQrState('loading'),
          ]),
        ),
      )
      await Promise.all(
        nextChannels.map(async (channel) => {
          const [status, registration, qrState] = await Promise.all([
            fetchAgentStatus(channel.id),
            fetchRegistrationState(channel.id),
            fetchChannelQrState(channel.id),
          ])
          if (requestId.current === currentRequestId) {
            setAgentStatuses((current) => ({
              ...current,
              [channel.id]: status,
            }))
            setRegistrationStates((current) => ({
              ...current,
              [channel.id]: registration,
            }))
            setQrStates((current) => ({
              ...current,
              [channel.id]: qrState,
            }))
          }
        }),
      )
    } catch (reason) {
      setError(getErrorMessage(reason, t('agents.loadFailed')))
    } finally {
      setIsLoading(false)
    }
  }, [activeOrganization?.id, t])

  useEffect(() => {
    void refreshChannels()
  }, [refreshChannels])

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow={t('agents.eyebrow')}
        title={t('agents.title')}
        titleStyle="strong"
        description={t('agents.description', {
          organization:
            activeOrganization?.name ?? t('agents.activeOrganization'),
        })}
        actions={
          <Button
            variant="outline"
            disabled={isLoading}
            onClick={() => void refreshChannels()}
          >
            <RefreshCw
              className={cn('size-4', isLoading && 'animate-spin')}
              aria-hidden
            />
            {t('agents.refresh')}
          </Button>
        }
      />

      {error && <InlineFeedback tone="error">{error}</InlineFeedback>}

      <section className="rounded-2xl border bg-card p-5 sm:p-6">
        <div className="mb-5">
          <h2 className="font-bold">{t('agents.channelGrid')}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t('agents.channelCount', { count: channels.length })}
          </p>
        </div>

        {isLoading && channels.length === 0 ? (
          <div className="grid gap-4 lg:grid-cols-2" role="status">
            <span className="sr-only">{t('agents.loading')}</span>
            {[0, 1].map((item) => (
              <div
                key={item}
                className="h-60 animate-pulse rounded-2xl bg-muted"
              />
            ))}
          </div>
        ) : channels.length === 0 ? (
          <EmptyState
            icon={<Bot className="size-5" aria-hidden />}
            title={t('agents.empty')}
            description={t('agents.emptyDescription')}
          />
        ) : (
          <div className="grid items-stretch gap-4 lg:grid-cols-2">
            {channels.map((channel) => (
              <ChannelAgentCard
                key={channel.id}
                channel={channel}
                locale={i18n.language}
                registration={
                  registrationStates[channel.id] ?? {
                    status: 'loading',
                    providerStatus: null,
                  }
                }
                qrState={qrStates[channel.id] ?? emptyChannelQrState('loading')}
                status={agentStatuses[channel.id] ?? 'loading'}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function ChannelAgentCard({
  channel,
  locale,
  registration,
  qrState,
  status,
}: {
  channel: ChannelSummary
  locale: string
  registration: RegistrationState
  qrState: ChannelQrState
  status: AgentStatus
}) {
  const { t } = useTranslation()
  return (
    <Link
      className="rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      to={`/agents/${channel.id}`}
      aria-label={t('agents.openChannel', { phone: channel.name })}
    >
      <article className="h-full overflow-hidden rounded-2xl border bg-background shadow-xs transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
        <div className="flex items-start gap-3 border-b p-5">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
            <Phone className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-lg font-bold">{channel.name}</h3>
              <Pill tone="success" dot>
                {t('agents.whatsApp')}
              </Pill>
            </div>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {channel.waPhoneNumber}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('agents.updated', {
                date: new Intl.DateTimeFormat(locale, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(new Date(channel.updatedAt)),
              })}
            </p>
          </div>
        </div>
        <dl className="grid gap-4 p-5">
          <ChannelDatum
            label={t('agents.phoneNumberId')}
            value={channel.waPhoneNumberId}
          />
          <ChannelDatum label={t('agents.wabaId')} value={channel.waWabaId} />
          <ChannelDatum label={t('agents.appId')} value={channel.waAppId} />
        </dl>
        <ChannelQrCode
          className="mx-5 mb-5"
          phoneNumber={channel.waPhoneNumber}
          size="small"
          state={qrState}
        />
        <div className="grid border-t sm:grid-cols-2">
          <div
            className={cn(
              'flex items-center justify-center gap-2 px-5 py-4 text-center text-sm font-semibold',
              agentStatusClasses(status),
            )}
          >
            <Bot className="size-4 shrink-0" aria-hidden />
            <span>{t(`agents.status.${status}`)}</span>
          </div>
          <div
            className={cn(
              'flex items-center justify-center gap-2 border-t px-5 py-4 text-center text-sm font-semibold sm:border-t-0 sm:border-l',
              registrationStatusClasses(registration.status),
            )}
          >
            <RadioTower className="size-4 shrink-0" aria-hidden />
            <span>
              {t(`channels.registration.status.${registration.status}`)}
              {registration.providerStatus
                ? ` · ${registration.providerStatus}`
                : ''}
            </span>
          </div>
        </div>
      </article>
    </Link>
  )
}

function agentStatusClasses(status: AgentStatus): string {
  if (status === 'enabled') return 'bg-success/12 text-success'
  if (status === 'disabled') return 'bg-destructive/10 text-destructive'
  if (status === 'not_configured') return 'bg-muted text-muted-foreground'
  if (status === 'error') return 'bg-destructive/10 text-destructive'
  return 'bg-muted/30 text-muted-foreground'
}

function registrationStatusClasses(status: RegistrationStatus): string {
  if (status === 'registered') return 'bg-success/12 text-success'
  if (status === 'unregistered') return 'bg-warning/12 text-warning'
  if (status === 'error') return 'bg-destructive/10 text-destructive'
  return 'bg-muted/30 text-muted-foreground'
}

async function fetchAgentStatus(channelId: number): Promise<AgentStatus> {
  try {
    const response = await apiClient.api.channels[':id']['agent-settings'].$get(
      { param: { id: String(channelId) } },
    )
    return response.ok ? (await response.json()).status : 'error'
  } catch {
    return 'error'
  }
}

async function fetchRegistrationState(
  channelId: number,
): Promise<RegistrationState> {
  try {
    const response = await apiClient.api.channels[':id'].registration.$get({
      param: { id: String(channelId) },
    })
    if (!response.ok) return { status: 'error', providerStatus: null }
    const registration = await response.json()
    return {
      status: registration.status,
      providerStatus: registration.providerStatus,
    }
  } catch {
    return { status: 'error', providerStatus: null }
  }
}

function ChannelDatum({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-1 truncate text-sm font-medium" title={value}>
        {value}
      </dd>
    </div>
  )
}

function getErrorMessage(reason: unknown, fallback: string): string {
  return reason instanceof Error && reason.message ? reason.message : fallback
}
