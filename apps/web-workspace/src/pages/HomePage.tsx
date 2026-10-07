import type { InferResponseType } from 'hono/client'
import {
  ArrowRight,
  CheckCheck,
  ContactRound,
  MessagesSquare,
  RefreshCw,
  Users,
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

export function HomePage() {
  const { t, i18n } = useTranslation()
  const organization = authClient.useActiveOrganization().data
  const [channels, setChannels] = useState<Channel[]>([])
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(
    null,
  )
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
  ]

  const features = [
    {
      to: '/chat',
      icon: MessagesSquare,
      title: t('home.features.chat'),
      description: t('home.features.chatDescription'),
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
        <div className="grid gap-3 sm:grid-cols-2">
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
              to="/organization"
              label={t('home.references.organization')}
            />
            <QuickLink to="/groups" label={t('home.references.groups')} />
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
