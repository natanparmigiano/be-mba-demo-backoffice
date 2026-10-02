import type { InferRequestType, InferResponseType } from 'hono/client'
import { LoaderCircle, Search, Send } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiClient } from '../api'
import { TemplateMessageDialog } from '../components/chat/TemplateMessageDialog'
import type {
  ComposerTemplateDraft,
  ComposerTemplatePage,
} from '../components/chat'
import {
  Button,
  cn,
  EmptyState,
  Input,
  Pill,
  Select,
  Tabs,
} from '../components/ui'

type ChannelsResponse = InferResponseType<
  typeof apiClient.api.channels.$get,
  200
>
type Channel = ChannelsResponse['channels'][number]
type SentMessage = {
  id: number
  templateName: string
  isMarketingTemplate: boolean | null
  recipient: string | null
  status: string | null
  occurredAt: string | null
  language: string | null
}
type SendTemplateRequest = InferRequestType<
  (typeof apiClient.api)['template-sends']['$post']
>['json']

export function TemplateSendingPage() {
  const { t, i18n } = useTranslation()
  const [channels, setChannels] = useState<Channel[]>([])
  const [channelId, setChannelId] = useState('')
  const [recipient, setRecipient] = useState('')
  const [deliveryApi, setDeliveryApi] = useState<'marketing' | 'messages'>(
    'messages',
  )
  const [messages, setMessages] = useState<SentMessage[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [tab, setTab] = useState<'send' | 'history'>('send')
  const [templateFilter, setTemplateFilter] = useState('')
  const [recipientFilter, setRecipientFilter] = useState('')
  const [apiFilter, setApiFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const response = await apiClient.api.channels.$get({ query: {} })
      if (!response.ok) return setError(t('shell.sendingLoadFailed'))
      const result = await response.json()
      setChannels(result.channels)
      setChannelId((current) => current || String(result.channels[0]?.id ?? ''))
    })()
  }, [t])

  const loadHistory = useCallback(
    async (cursor?: string) => {
      if (!channelId) {
        setMessages([])
        setLoading(false)
        return
      }
      setLoading(true)
      const response = await apiClient.api['template-sends'].$get({
        query: {
          channelId,
          limit: '48',
          cursor,
          templateName: templateFilter.trim() || undefined,
          recipient: recipientFilter.trim() || undefined,
          api: (apiFilter as 'messages' | 'marketing' | '') || undefined,
          status:
            (statusFilter as
              | 'accepted'
              | 'deleted'
              | 'delivered'
              | 'failed'
              | 'played'
              | 'queued'
              | 'read'
              | 'sending'
              | 'sent'
              | 'unknown'
              | '') || undefined,
        },
      })
      if (response.ok) {
        const result = await response.json()
        setMessages((current) =>
          cursor ? [...current, ...result.messages] : result.messages,
        )
        setNextCursor(result.nextCursor)
        setError(null)
      } else setError(t('shell.sendingLoadFailed'))
      setLoading(false)
    },
    [apiFilter, channelId, recipientFilter, statusFilter, t, templateFilter],
  )

  useEffect(() => {
    if (tab !== 'history') return
    const timer = window.setTimeout(() => void loadHistory(), 250)
    return () => window.clearTimeout(timer)
  }, [loadHistory, tab])

  const loadTemplates = useCallback(
    async (after?: string): Promise<ComposerTemplatePage> => {
      if (!channelId) return { templates: [], nextCursor: null }
      const response = await apiClient.api.templates.$get({
        query: {
          channelId,
          status: 'APPROVED',
          limit: '100',
          after,
        },
      })
      if (!response.ok) throw new Error(t('chatComposer.templates.loadFailed'))
      const result = await response.json()
      return {
        templates: result.templates
          .filter(
            (template) =>
              template.name && template.language && template.components,
          )
          .map((template) => ({
            id: template.id,
            name: template.name!,
            language: template.language!,
            category: template.category ?? null,
            parameterFormat: template.parameter_format ?? 'POSITIONAL',
            components: template.components!,
          })),
        nextCursor: result.paging?.cursors?.after ?? null,
      }
    },
    [channelId, t],
  )

  const sendTemplate = async (draft: ComposerTemplateDraft) => {
    const normalizedRecipient = recipient.replace(/[^0-9]/g, '')
    if (normalizedRecipient.length < 7 || normalizedRecipient.length > 15) {
      throw new Error(t('shell.sendingRecipientRequired'))
    }
    if (!channelId) throw new Error(t('templates.noChannels'))
    setSending(true)
    setError(null)
    setNotice(null)
    try {
      let template = draft.template
      if (draft.headerMedia) {
        const upload = await apiClient.api.templates[':channelId'].media.$post({
          param: { channelId },
          form: {
            kind: draft.headerMedia.kind,
            file: draft.headerMedia.file,
          },
        })
        if (!upload.ok)
          throw new Error(t('templates.contents.mediaUploadFailed'))
        const uploaded = await upload.json()
        template = {
          ...template,
          components: withHeaderMedia(
            template.components,
            draft.headerMedia.kind,
            uploaded.media.id,
          ),
        }
      }
      const response = await apiClient.api['template-sends'].$post({
        json: {
          channelId: Number(channelId),
          clientMessageId: crypto.randomUUID(),
          api: deliveryApi,
          templatePreview: draft.preview,
          message: {
            messaging_product: 'whatsapp',
            to: normalizedRecipient,
            type: 'template',
            template,
          } as SendTemplateRequest['message'],
        },
      })
      if (!response.ok) throw new Error(t('shell.sendingFailed'))
      setNotice(t('shell.sendingSuccess'))
      await loadHistory()
      setTab('history')
    } finally {
      setSending(false)
    }
  }

  return (
    <main className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header>
        <h1 className="text-2xl font-bold">{t('shell.sendingTitle')}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          {t('shell.sendingDescription')}
        </p>
      </header>

      {(error || notice) && (
        <p
          role={error ? 'alert' : 'status'}
          className={
            error
              ? 'rounded-xl bg-destructive/10 p-3 text-sm text-destructive'
              : 'rounded-xl bg-success/10 p-3 text-sm text-success'
          }
        >
          {error ?? notice}
        </p>
      )}

      <Tabs
        items={[
          { value: 'send', label: t('shell.sendingSendNowTab') },
          { value: 'history', label: t('shell.sendingHistoryTab') },
        ]}
        value={tab}
        variant="pills"
        onValueChange={setTab}
        ariaLabel={t('shell.sendingTabsLabel')}
      />

      {tab === 'send' ? (
        <section className="grid gap-5 rounded-2xl border bg-card p-5 shadow-xs sm:p-6">
          <div className="grid gap-4 rounded-xl bg-muted/35 p-4 md:grid-cols-2">
            <Select
              label={t('templates.channel')}
              value={channelId}
              onChange={(event) => setChannelId(event.currentTarget.value)}
            >
              {channels.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.waPhoneNumber || channel.waPhoneNumberId}
                </option>
              ))}
            </Select>
            <Input
              label={t('shell.sendingRecipient')}
              inputMode="tel"
              required
              value={recipient}
              onChange={(event) => setRecipient(event.currentTarget.value)}
            />
          </div>
          <fieldset className="grid gap-3">
            <legend className="text-sm font-semibold">
              {t('shell.sendingApi')}
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {(['messages', 'marketing'] as const).map((api) => (
                <label
                  key={api}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors',
                    deliveryApi === api
                      ? 'border-primary bg-primary/6 ring-2 ring-primary/10'
                      : 'border-border hover:bg-muted/45',
                  )}
                >
                  <input
                    type="radio"
                    name="delivery-api"
                    value={api}
                    checked={deliveryApi === api}
                    onChange={() => setDeliveryApi(api)}
                  />
                  <span>
                    <span className="block text-sm font-semibold">
                      {t(
                        api === 'messages'
                          ? 'shell.sendingMessagesApi'
                          : 'shell.sendingMarketingApi',
                      )}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                      {t(
                        api === 'messages'
                          ? 'shell.sendingMessagesApiDescription'
                          : 'shell.sendingMarketingApiDescription',
                      )}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <TemplateMessageDialog
            embedded
            open
            sending={sending}
            loadTemplates={loadTemplates}
            onClose={() => undefined}
            onSend={sendTemplate}
          />
        </section>
      ) : (
        <section className="grid gap-4">
          <div className="grid gap-3 rounded-2xl border bg-card p-5 lg:grid-cols-[minmax(12rem,0.7fr)_minmax(14rem,1fr)_minmax(12rem,0.8fr)_minmax(10rem,0.6fr)_minmax(10rem,0.6fr)]">
            <Select
              label={t('templates.channel')}
              value={channelId}
              onChange={(event) => setChannelId(event.currentTarget.value)}
            >
              {channels.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.waPhoneNumber || channel.waPhoneNumberId}
                </option>
              ))}
            </Select>
            <Input
              label={t('shell.sendingTemplateFilter')}
              leadingIcon={Search}
              value={templateFilter}
              onChange={(event) => setTemplateFilter(event.currentTarget.value)}
            />
            <Input
              label={t('shell.sendingRecipientColumn')}
              value={recipientFilter}
              onChange={(event) =>
                setRecipientFilter(event.currentTarget.value)
              }
            />
            <Select
              label={t('shell.sendingApi')}
              value={apiFilter}
              onChange={(event) => setApiFilter(event.currentTarget.value)}
            >
              <option value="">{t('shell.sendingAllApis')}</option>
              <option value="messages">{t('shell.sendingMessagesApi')}</option>
              <option value="marketing">
                {t('shell.sendingMarketingApi')}
              </option>
            </Select>
            <Select
              label={t('shell.sendingStatusColumn')}
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.currentTarget.value)}
            >
              <option value="">{t('shell.sendingAllStatuses')}</option>
              {[
                'accepted',
                'queued',
                'sending',
                'sent',
                'delivered',
                'read',
                'played',
                'failed',
                'deleted',
                'unknown',
              ].map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </Select>
          </div>

          {loading ? (
            <p
              className="flex items-center gap-2 text-sm text-muted-foreground"
              role="status"
            >
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
              {t('chatComposer.templates.loading')}
            </p>
          ) : messages.length === 0 ? (
            <EmptyState
              icon={<Send className="size-5" aria-hidden />}
              title={t('shell.sendingEmpty')}
              description={t('shell.sendingEmpty')}
            />
          ) : (
            <div className="overflow-x-auto rounded-2xl border bg-card shadow-xs">
              <table className="w-full min-w-[52rem] text-left text-sm">
                <thead className="border-b bg-muted/45 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-semibold">
                      {t('shell.sendingTemplateColumn')}
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      {t('templates.language')}
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      {t('shell.sendingRecipientColumn')}
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      {t('shell.sendingApi')}
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      {t('shell.sendingStatusColumn')}
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      {t('shell.sendingSentAtColumn')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {messages.map((message) => (
                    <tr key={message.id} className="hover:bg-muted/25">
                      <td className="max-w-64 truncate px-4 py-3 font-semibold">
                        {message.templateName}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {message.language ?? '—'}
                      </td>
                      <td className="px-4 py-3">{message.recipient ?? '—'}</td>
                      <td className="px-4 py-3">
                        <Pill>
                          {t(
                            message.isMarketingTemplate
                              ? 'shell.sendingMarketingApi'
                              : 'shell.sendingMessagesApi',
                          )}
                        </Pill>
                      </td>
                      <td className="px-4 py-3">
                        <Pill>{message.status ?? '—'}</Pill>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                        {message.occurredAt
                          ? new Intl.DateTimeFormat(i18n.language, {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            }).format(new Date(message.occurredAt))
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {nextCursor && (
            <Button
              className="justify-self-center"
              variant="outline"
              onClick={() => void loadHistory(nextCursor)}
            >
              {t('templates.loadMore')}
            </Button>
          )}
        </section>
      )}
    </main>
  )
}

function withHeaderMedia(
  input: unknown[] | undefined,
  kind: 'document' | 'image' | 'video',
  mediaId: string,
) {
  const components = [...(input ?? [])]
  const parameter = { type: kind, [kind]: { id: mediaId } }
  const index = components.findIndex(
    (component) =>
      typeof component === 'object' &&
      component !== null &&
      'type' in component &&
      component.type === 'header',
  )
  if (index < 0)
    return [{ type: 'header', parameters: [parameter] }, ...components]
  const header = components[index] as { type: 'header'; parameters?: unknown[] }
  components[index] = {
    ...header,
    parameters: [parameter, ...(header.parameters ?? [])],
  }
  return components
}
