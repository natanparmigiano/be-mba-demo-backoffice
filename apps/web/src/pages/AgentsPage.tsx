import type { InferResponseType } from 'hono/client'
import { Bot, Phone, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { apiClient } from '../api'
import { authClient } from '../auth/auth-client'
import { Button, cn, EmptyState, Pill } from '../components/ui'

type ChannelsResponse = InferResponseType<
  typeof apiClient.api.channels.$get,
  200
>
type ChannelSummary = ChannelsResponse['channels'][number]
type AgentStatus =
  'loading' | 'not_configured' | 'enabled' | 'disabled' | 'error'

export function AgentsPage() {
  const { t, i18n } = useTranslation()
  const activeOrganizationQuery = authClient.useActiveOrganization()
  const activeOrganization = activeOrganizationQuery.data
  const [channels, setChannels] = useState<ChannelSummary[]>([])
  const [agentStatuses, setAgentStatuses] = useState<
    Record<number, AgentStatus>
  >({})
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
      await Promise.all(
        nextChannels.map(async (channel) => {
          let status: AgentStatus = 'error'
          try {
            const settingsResponse = await apiClient.api.channels[':id'][
              'agent-settings'
            ].$get({ param: { id: String(channel.id) } })
            if (settingsResponse.ok) {
              status = (await settingsResponse.json()).status
            }
          } catch {
            status = 'error'
          } finally {
            if (requestId.current === currentRequestId) {
              setAgentStatuses((current) => ({
                ...current,
                [channel.id]: status,
              }))
            }
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
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold tracking-[0.12em] text-primary uppercase">
            {t('agents.eyebrow')}
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight">
            {t('agents.title')}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {t('agents.description', {
              organization:
                activeOrganization?.name ?? t('agents.activeOrganization'),
            })}
          </p>
        </div>
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
      </header>

      {error && (
        <p
          className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}

      <section className="rounded-2xl border bg-card p-5 sm:p-6">
        <div className="mb-5">
          <h2 className="font-bold">{t('agents.channelGrid')}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t('agents.channelCount', { count: channels.length })}
          </p>
        </div>

        {isLoading && channels.length === 0 ? (
          <div
            className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
            role="status"
          >
            <span className="sr-only">{t('agents.loading')}</span>
            {[0, 1, 2].map((item) => (
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
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {channels.map((channel) => (
              <ChannelAgentCard
                key={channel.id}
                channel={channel}
                locale={i18n.language}
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
  status,
}: {
  channel: ChannelSummary
  locale: string
  status: AgentStatus
}) {
  const { t } = useTranslation()
  return (
    <Link
      className="rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      to={`/agents/${channel.id}`}
      aria-label={t('agents.openChannel', { phone: channel.waPhoneNumber })}
    >
      <article className="h-full overflow-hidden rounded-2xl border bg-background shadow-xs transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
        <div className="flex items-start gap-3 border-b p-5">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
            <Phone className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-lg font-bold">
                {channel.waPhoneNumber}
              </h3>
              <Pill tone="success" dot>
                {t('agents.whatsApp')}
              </Pill>
            </div>
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
        <div
          className={cn(
            'flex items-center justify-center gap-2 border-t px-5 py-4 text-sm font-semibold',
            agentStatusClasses(status),
          )}
        >
          <Bot className="size-4" aria-hidden />
          <span>{t(`agents.status.${status}`)}</span>
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
