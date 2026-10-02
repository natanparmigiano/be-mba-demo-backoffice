import type { InferResponseType } from 'hono/client'
import { Braces, Download, RefreshCw, Webhook } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiClient } from '../api'
import { authClient } from '../auth/auth-client'
import { Button, EmptyState, Input, Select } from '../components/ui'

type Response = InferResponseType<typeof apiClient.api.webhooks.$get, 200>
type WebhookRow = Response['webhooks'][number]
type ChannelsResponse = InferResponseType<
  typeof apiClient.api.channels.$get,
  200
>

export function WebhooksPage() {
  const { t, i18n } = useTranslation()
  const organizationId = authClient.useActiveOrganization().data?.id
  const [rows, setRows] = useState<WebhookRow[]>([])
  const [channels, setChannels] = useState<ChannelsResponse['channels']>([])
  const [channelId, setChannelId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const sentinel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    document.title = `${t('webhooks.title')} · ${t('design.brand')}`
  }, [t])

  useEffect(() => {
    if (!organizationId) return
    let cancelled = false
    void apiClient.api.channels.$get().then(async (response) => {
      if (response.ok && !cancelled)
        setChannels((await response.json()).channels)
    })
    return () => {
      cancelled = true
    }
  }, [organizationId])

  useEffect(() => {
    setRows([])
    setCursor(null)
    setVersion((value) => value + 1)
  }, [organizationId, channelId, from, to])

  useEffect(() => {
    if (!organizationId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    const query = {
      limit: '30',
      ...(channelId ? { channelId } : {}),
      ...(from ? { from: new Date(from).toISOString() } : {}),
      ...(to ? { to: new Date(to).toISOString() } : {}),
      ...(cursor ? { cursor } : {}),
    }
    void apiClient.api.webhooks
      .$get({ query })
      .then(async (response) => {
        if (!response.ok) throw new Error(t('webhooks.loadFailed'))
        const data = await response.json()
        if (!cancelled) {
          setRows((current) =>
            cursor ? [...current, ...data.webhooks] : data.webhooks,
          )
          setCursor(data.nextCursor)
        }
      })
      .catch(() => {
        if (!cancelled) setError(t('webhooks.loadFailed'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // version intentionally represents refresh and cursor advances.
  }, [organizationId, version])

  useEffect(() => {
    const element = sentinel.current
    if (!element || !cursor || loading) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setVersion((value) => value + 1)
      },
      { rootMargin: '300px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [cursor, loading])

  const formatter = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  })
  const canExport = Boolean(channelId && from && to && from <= to)

  const exportWebhooks = async () => {
    if (!canExport) return
    setExporting(true)
    setError(null)
    try {
      const response = await apiClient.api.webhooks.export.$get({
        query: {
          channelId,
          from: new Date(from).toISOString(),
          to: new Date(to).toISOString(),
        },
      })
      if (!response.ok) throw new Error(t('webhooks.exportFailed'))
      const blobUrl = URL.createObjectURL(await response.blob())
      const disposition = response.headers.get('content-disposition') ?? ''
      const filename =
        /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'webhooks.jsonl'
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = filename
      link.click()
      URL.revokeObjectURL(blobUrl)
    } catch {
      setError(t('webhooks.exportFailed'))
    } finally {
      setExporting(false)
    }
  }

  return (
    <main className="mx-auto w-full max-w-7xl p-5 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('webhooks.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('webhooks.description')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={!canExport || exporting}
            onClick={() => void exportWebhooks()}
            title={!canExport ? t('webhooks.exportHint') : undefined}
          >
            <Download className="size-4" />
            {exporting ? t('webhooks.exporting') : t('webhooks.export')}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setRows([])
              setCursor(null)
              setVersion((v) => v + 1)
            }}
          >
            <RefreshCw className="size-4" />
            {t('webhooks.refresh')}
          </Button>
        </div>
      </div>
      <section
        className="mt-6 grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-3"
        aria-label={t('webhooks.filters')}
      >
        <Select
          label={t('webhooks.channel')}
          value={channelId}
          onChange={(e) => setChannelId(e.target.value)}
        >
          <option value="">{t('webhooks.allChannels')}</option>
          {channels.map((channel) => (
            <option key={channel.id} value={channel.id}>
              {channel.name} — {channel.waPhoneNumber}
            </option>
          ))}
        </Select>
        <Input
          type="datetime-local"
          label={t('webhooks.from')}
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <Input
          type="datetime-local"
          label={t('webhooks.to')}
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
      </section>
      {error && (
        <p className="mt-5 rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="mt-5 grid gap-3">
        {rows.map((row) => (
          <article key={row.id} className="rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Webhook className="size-4" />
                </span>
                <div>
                  <p className="font-mono text-sm font-semibold">#{row.id}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.channelPhoneNumber} ·{' '}
                    {formatter.format(new Date(row.arrivedAt))}
                  </p>
                </div>
              </div>
              <div className="flex gap-4 text-right text-xs">
                <span>
                  <b className="block text-sm text-foreground">
                    {row.processingTimeMs} ms
                  </b>
                  {t('webhooks.processing')}
                </span>
                <span>
                  <b className="block text-sm text-foreground">
                    {row.totalTimeMs} ms
                  </b>
                  {t('webhooks.total')}
                </span>
              </div>
            </div>
            <details className="mt-3 border-t pt-3">
              <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
                <Braces className="size-4" />
                {t('webhooks.payload')}
              </summary>
              <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-muted p-4 text-xs">
                {JSON.stringify(row.payload, null, 2)}
              </pre>
            </details>
          </article>
        ))}
        {!loading && !error && rows.length === 0 && (
          <EmptyState
            icon={<Webhook className="size-5" />}
            title={t('webhooks.empty')}
            description={t('webhooks.emptyDescription')}
          />
        )}
        {loading && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t('webhooks.loading')}
          </p>
        )}
        <div ref={sentinel} className="h-px" aria-hidden />
      </div>
    </main>
  )
}
