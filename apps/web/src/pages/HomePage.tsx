import type { InferResponseType } from 'hono/client'
import {
  ArrowRight,
  Bot,
  CheckCheck,
  ContactRound,
  FlaskConical,
  MessagesSquare,
  RadioTower,
  RefreshCw,
  Sparkles,
  Users,
  Wrench,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { apiClient } from '../api'
import { authClient } from '../auth/auth-client'
import { Button, cn, InlineFeedback, Select } from '@mba-desk/ui'

type ChannelsResponse = InferResponseType<
  typeof apiClient.api.channels.$get,
  200
>
type Channel = ChannelsResponse['channels'][number]
type DashboardResponse = InferResponseType<
  (typeof apiClient.api.channels)[':id']['dashboard']['$get'],
  200
>
type EvaluationListResponse = InferResponseType<
  (typeof apiClient.api.channels)[':id']['agent-evals']['$get'],
  200
>

export function HomePage() {
  const { t, i18n } = useTranslation()
  const organization = authClient.useActiveOrganization().data
  const [channels, setChannels] = useState<Channel[]>([])
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(
    null,
  )
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null)
  const [evaluationCases, setEvaluationCases] = useState<
    EvaluationListResponse['cases']
  >([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingEvaluations, setIsLoadingEvaluations] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [evaluationError, setEvaluationError] = useState<string | null>(null)

  useEffect(() => {
    document.title = `${t('home.title')} · ${t('design.brand')}`
    document
      .querySelector<HTMLMetaElement>('meta[name="description"]')
      ?.setAttribute('content', t('home.metaDescription'))
  }, [t])

  const loadChannels = useCallback(async () => {
    if (!organization?.id) return
    setIsLoading(true)
    setError(null)
    try {
      const response = await apiClient.api.channels.$get()
      if (!response.ok) throw new Error()
      const nextChannels = (await response.json()).channels
      setChannels(nextChannels)
      setSelectedChannelId((current) =>
        current && nextChannels.some((channel) => channel.id === current)
          ? current
          : (nextChannels[0]?.id ?? null),
      )
    } catch {
      setError(t('home.loadFailed'))
      setIsLoading(false)
    }
  }, [organization?.id, t])

  useEffect(() => {
    void loadChannels()
  }, [loadChannels])

  const loadDashboard = useCallback(async () => {
    if (!selectedChannelId) {
      setDashboard(null)
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const response = await apiClient.api.channels[':id'].dashboard.$get({
        param: { id: String(selectedChannelId) },
        query: { days: '7' },
      })
      if (!response.ok) throw new Error()
      setDashboard(await response.json())
    } catch {
      setDashboard(null)
      setError(t('home.loadFailed'))
    } finally {
      setIsLoading(false)
    }
  }, [organization?.id, selectedChannelId, t])

  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  const loadEvaluationCases = useCallback(async () => {
    if (!selectedChannelId) {
      setEvaluationCases([])
      setEvaluationError(null)
      return
    }
    setIsLoadingEvaluations(true)
    setEvaluationError(null)
    try {
      const response = await apiClient.api.channels[':id']['agent-evals'].$get({
        param: { id: String(selectedChannelId) },
      })
      if (!response.ok) throw new Error()
      setEvaluationCases((await response.json()).cases)
    } catch {
      setEvaluationCases([])
      setEvaluationError(t('home.evals.loadFailed'))
    } finally {
      setIsLoadingEvaluations(false)
    }
  }, [selectedChannelId, t])

  useEffect(() => {
    void loadEvaluationCases()
  }, [loadEvaluationCases])

  const number = useMemo(
    () => new Intl.NumberFormat(i18n.language),
    [i18n.language],
  )
  const percent = (value: number | null | undefined) =>
    value == null
      ? t('home.notAvailable')
      : new Intl.NumberFormat(i18n.language, {
          style: 'percent',
          maximumFractionDigits: 1,
        }).format(value)

  const stats = [
    {
      icon: MessagesSquare,
      label: t('home.stats.messagesSent'),
      value: dashboard?.messaging
        ? number.format(dashboard.messaging.sent)
        : t('home.notAvailable'),
      detail: t('home.stats.lastSevenDays'),
    },
    {
      icon: CheckCheck,
      label: t('home.stats.deliveryRate'),
      value: percent(dashboard?.messaging?.deliveryRate),
      detail: dashboard?.messaging
        ? t('home.stats.deliveredCount', {
            count: number.format(dashboard.messaging.delivered),
          })
        : t('home.stats.providerUnavailable'),
    },
    {
      icon: Sparkles,
      label: t('home.stats.aiThreads'),
      value: dashboard?.agent
        ? number.format(dashboard.agent.threads)
        : t('home.notAvailable'),
      detail: dashboard?.agent
        ? t('home.stats.handoffRate', {
            rate: percent(dashboard.agent.handoffRate),
          })
        : t('home.stats.providerUnavailable'),
    },
    {
      icon: Wrench,
      label: t('home.stats.toolSuccess'),
      value: percent(dashboard?.agent?.toolSuccessRate),
      detail: dashboard?.agent
        ? t('home.stats.toolCalls', {
            count: number.format(dashboard.agent.toolCalls),
          })
        : t('home.stats.providerUnavailable'),
    },
  ]

  const features = [
    {
      to: '/chat',
      icon: MessagesSquare,
      title: t('home.features.chat'),
      description: t('home.features.chatDescription'),
    },
    {
      to: '/agents',
      icon: Bot,
      title: t('home.features.agents'),
      description: t('home.features.agentsDescription'),
    },
    {
      to: '/channels',
      icon: RadioTower,
      title: t('home.features.channels'),
      description: t('home.features.channelsDescription'),
    },
    {
      to: '/contacts',
      icon: ContactRound,
      title: t('home.features.contacts'),
      description: t('home.features.contactsDescription'),
    },
  ]

  return (
    <div className="grid gap-6">
      <section className="relative overflow-hidden rounded-3xl border bg-card px-6 py-8 shadow-xs sm:px-8 sm:py-10">
        <div className="pointer-events-none absolute -top-24 -right-20 size-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <h1 className="text-3xl font-black tracking-[-0.035em] sm:text-4xl">
              {t('home.greeting', {
                organization: organization?.name ?? t('home.workspace'),
              })}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
              {t('home.intro')}
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Select
              aria-label={t('home.channelLabel')}
              value={selectedChannelId ?? ''}
              onChange={(event) =>
                setSelectedChannelId(Number(event.target.value))
              }
              disabled={channels.length === 0}
              className="min-w-56"
            >
              {channels.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.name} — {channel.waPhoneNumber}
                </option>
              ))}
            </Select>
            <Button
              variant="outline"
              onClick={() => void loadDashboard()}
              disabled={!selectedChannelId || isLoading}
            >
              <RefreshCw
                className={cn('size-4', isLoading && 'animate-spin')}
                aria-hidden
              />
              {t('home.refresh')}
            </Button>
          </div>
        </div>
      </section>

      {error && <InlineFeedback tone="error">{error}</InlineFeedback>}

      <section aria-labelledby="overview-title">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold tracking-[0.13em] text-primary uppercase">
              {t('home.overviewEyebrow')}
            </p>
            <h2
              id="overview-title"
              className="mt-1 text-xl font-extrabold tracking-tight"
            >
              {t('home.overviewTitle')}
            </h2>
          </div>
          <span className="text-xs text-muted-foreground">
            {t('home.lastUpdatedNow')}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map(({ icon: Icon, label, value, detail }) => (
            <article
              key={label}
              className="rounded-2xl border bg-card p-5 shadow-xs"
            >
              <div className="flex items-center justify-between">
                <span className="grid size-9 place-items-center rounded-xl bg-primary/12 text-primary">
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="size-2 rounded-full bg-success" aria-hidden />
              </div>
              <p className="mt-5 text-2xl font-black tracking-tight">
                {isLoading ? '—' : value}
              </p>
              <p className="mt-1 text-sm font-semibold">{label}</p>
              <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="evaluations-title">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2
              id="evaluations-title"
              className="text-xl font-extrabold tracking-tight"
            >
              {t('home.evals.title')}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('home.evals.description')}
            </p>
          </div>
          <span className="text-xs text-muted-foreground">
            {t('home.evals.count', { count: evaluationCases.length })}
          </span>
        </div>
        {evaluationError ? (
          <InlineFeedback tone="error">{evaluationError}</InlineFeedback>
        ) : isLoadingEvaluations ? (
          <div className="grid gap-3 md:grid-cols-3" aria-busy="true">
            {[0, 1, 2].map((item) => (
              <div
                className="h-28 animate-pulse rounded-2xl border bg-card"
                key={item}
              />
            ))}
          </div>
        ) : evaluationCases.length === 0 ? (
          <p className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground shadow-xs">
            {t('home.evals.empty')}
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {evaluationCases.slice(0, 3).map((evaluation) => (
              <Link
                className="group flex items-start gap-3 rounded-2xl border bg-card p-5 shadow-xs transition-colors hover:border-primary/35 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/25"
                key={evaluation.id}
                to={`/agents/${selectedChannelId}/evals/${encodeURIComponent(evaluation.id)}`}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
                  <FlaskConical className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 font-bold group-hover:text-primary">
                    {evaluation.scenario}
                  </p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {evaluation.id}
                  </p>
                </div>
                <ArrowRight
                  className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                  aria-hidden
                />
              </Link>
            ))}
          </div>
        )}
      </section>

      <section
        className="rounded-2xl border bg-card p-5 shadow-xs sm:p-6"
        aria-labelledby="agents-title"
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 id="agents-title" className="text-lg font-extrabold">
            {t('home.agents.title')}
          </h2>
          <span className="text-xs text-muted-foreground">
            {t('home.agents.count', { count: channels.length })}
          </span>
        </div>
        {channels.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('home.agents.empty')}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {channels.map((channel) => (
              <Link
                className="group flex items-center gap-3 rounded-xl border bg-background p-4 transition-colors hover:border-primary/35 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/25"
                key={channel.id}
                to={`/agents/${channel.id}`}
                aria-label={t('home.agents.open', {
                  phone: channel.name,
                })}
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
                  <Bot className="size-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{channel.name}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {channel.waPhoneNumber} · {t('home.agents.type')}
                  </p>
                </div>
                <ArrowRight
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                  aria-hidden
                />
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
        <section
          className="rounded-2xl border bg-card p-5 shadow-xs sm:p-6"
          aria-labelledby="features-title"
        >
          <div className="mb-5">
            <h2 id="features-title" className="text-lg font-extrabold">
              {t('home.featuresTitle')}
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {features.map(({ to, icon: Icon, title, description }) => (
              <Link
                key={to}
                to={to}
                className="group rounded-xl border p-4 transition-colors hover:border-primary/35 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/25"
              >
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-primary">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-bold">{title}</h3>
                      <ArrowRight
                        className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                        aria-hidden
                      />
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {description}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <aside
          className="rounded-2xl border bg-card p-5 shadow-xs sm:p-6"
          aria-labelledby="references-title"
        >
          <h2 id="references-title" className="text-lg font-extrabold">
            {t('home.referencesTitle')}
          </h2>
          <div className="mt-5 grid gap-2">
            <QuickLink
              to="/playground"
              label={t('home.references.playground')}
            />
            <QuickLink
              to="/organization"
              label={t('home.references.organization')}
            />
            <QuickLink to="/groups" label={t('home.references.groups')} />
            <QuickLink
              to="/design-system"
              label={t('home.references.designSystem')}
            />
          </div>
          <div className="mt-6 flex items-center gap-3 rounded-xl bg-muted/60 p-4">
            <span className="grid size-9 place-items-center rounded-full bg-success/15 text-success">
              <Users className="size-4" aria-hidden />
            </span>
            <div>
              <p className="text-xl font-black">{channels.length}</p>
              <p className="text-xs text-muted-foreground">
                {t('home.configuredChannels', { count: channels.length })}
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

function QuickLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/25"
    >
      <span>{label}</span>
      <ArrowRight className="size-4" aria-hidden />
    </Link>
  )
}
