import type { InferResponseType } from 'hono/client'
import {
  Clock3,
  Eye,
  LoaderCircle,
  MessageSquareText,
  UsersRound,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { apiClient } from '../api'
import { authClient } from '../auth/auth-client'
import { ChatShowcase, type ChatTimelineItem } from '../components/chat'
import { Avatar, Button, Dialog } from '@mba-desk/ui'
import {
  chatName,
  collectMessageReactions,
  toChatTimelineItem,
  type ApiTimelineItem,
} from './ChatWorkspace'

type QueueResponse = InferResponseType<
  typeof apiClient.api.chats.queue.$get,
  200
>
type QueuedChat = QueueResponse['chats'][number]
type Team = InferResponseType<
  typeof apiClient.api.teams.$get,
  200
>['teams'][number]
type TimelineResponse = InferResponseType<
  (typeof apiClient.api.chats)[':id']['timeline']['$get'],
  200
>

const QUEUE_TIMELINE_SIZE = 50

export function QueuePage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const activeOrganization = authClient.useActiveOrganization()
  const [chats, setChats] = useState<QueuedChat[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [previewChat, setPreviewChat] = useState<QueuedChat | null>(null)
  const [previewItems, setPreviewItems] = useState<ApiTimelineItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)
  const [isAssigning, setIsAssigning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const loadQueue = useCallback(async () => {
    setError(null)
    try {
      const [queueResponse, teamsResponse] = await Promise.all([
        apiClient.api.chats.queue.$get(),
        apiClient.api.teams.$get(),
      ])
      if (!queueResponse.ok || !teamsResponse.ok) {
        throw new Error(t('queue.loadFailed'))
      }
      setChats((await queueResponse.json()).chats)
      setTeams((await teamsResponse.json()).teams)
    } catch {
      setError(t('queue.loadFailed'))
    } finally {
      setIsLoading(false)
    }
  }, [t])

  useEffect(() => {
    if (!activeOrganization.data?.id) return
    setIsLoading(true)
    void loadQueue()
  }, [activeOrganization.data?.id, loadQueue])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!activeOrganization.data?.id) return
    const events = new EventSource('/api/chats/events')
    let refreshTimer: ReturnType<typeof setTimeout> | undefined
    const refresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer)
      refreshTimer = setTimeout(() => void loadQueue(), 150)
    }
    events.addEventListener('chat-update', refresh)
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer)
      events.close()
    }
  }, [activeOrganization.data?.id, loadQueue])

  const columns = useMemo(() => {
    const byTeam = new Map<string | null, QueuedChat[]>()
    for (const team of teams) byTeam.set(team.id, [])
    byTeam.set(null, [])
    for (const chat of chats) {
      const key = chat.assignedTeam?.id ?? null
      const bucket = byTeam.get(key) ?? []
      bucket.push(chat)
      byTeam.set(key, bucket)
    }
    return [
      ...teams.map((team) => ({ team, chats: byTeam.get(team.id) ?? [] })),
      { team: null, chats: byTeam.get(null) ?? [] },
    ]
  }, [chats, teams])

  const openPreview = async (chat: QueuedChat) => {
    setPreviewChat(chat)
    setPreviewItems([])
    setPreviewError(null)
    setIsLoadingPreview(true)
    try {
      const response = await apiClient.api.chats[':id'].timeline.$get({
        param: { id: String(chat.id) },
        query: { limit: String(QUEUE_TIMELINE_SIZE) },
      })
      if (!response.ok) throw new Error(t('queue.previewLoadFailed'))
      const result: TimelineResponse = await response.json()
      setPreviewItems(result.items)
    } catch {
      setPreviewError(t('queue.previewLoadFailed'))
    } finally {
      setIsLoadingPreview(false)
    }
  }

  const assignAndOpen = async () => {
    if (!previewChat) return
    setIsAssigning(true)
    setPreviewError(null)
    try {
      const response = await apiClient.api.chats[':id'].assignment.$patch({
        param: { id: String(previewChat.id) },
        json: { action: 'assign', force: false },
      })
      if (!response.ok) throw new Error(t('queue.assignmentFailed'))
      void navigate(`/chat/${previewChat.id}`)
    } catch {
      setPreviewError(t('queue.assignmentFailed'))
      await loadQueue()
    } finally {
      setIsAssigning(false)
    }
  }

  const renderedPreview = useMemo<ChatTimelineItem[]>(() => {
    if (!previewChat) return []
    const reactions = collectMessageReactions(previewItems)
    return previewItems.flatMap((item) =>
      item.itemType === 'message' && item.messageType === 'reaction'
        ? []
        : [
            toChatTimelineItem(
              item,
              t,
              i18n.resolvedLanguage ?? i18n.language,
              previewChat.kind === 'group',
              item.itemType === 'message' && item.providerMessageId
                ? reactions.get(item.providerMessageId)
                : undefined,
            ),
          ],
    )
  }, [i18n.language, i18n.resolvedLanguage, previewChat, previewItems, t])

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-background p-4 sm:p-6">
      <header className="shrink-0">
        <p className="text-xs font-bold tracking-[0.14em] text-primary uppercase">
          {t('queue.eyebrow')}
        </p>
        <div className="mt-1 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{t('queue.title')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('queue.description')}
            </p>
          </div>
          <p className="shrink-0 text-sm font-semibold text-muted-foreground">
            {t('queue.waitingCount', { count: chats.length })}
          </p>
        </div>
      </header>

      {error && (
        <p
          className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}

      <div className="mt-5 min-h-0 flex-1 overflow-x-auto overflow-y-hidden pb-2">
        {isLoading ? (
          <div className="grid h-full place-items-center" role="status">
            <LoaderCircle className="size-5 animate-spin" aria-hidden />
            <span className="sr-only">{t('queue.loading')}</span>
          </div>
        ) : (
          <div className="flex h-full min-w-max gap-4">
            {columns.map(({ team, chats: teamChats }) => (
              <section
                key={team?.id ?? 'unassigned'}
                className="flex w-80 min-h-0 flex-col rounded-xl border bg-muted/25"
                aria-label={team?.name ?? t('queue.noTeam')}
              >
                <div className="flex shrink-0 items-center gap-2 border-b px-3 py-3">
                  <span
                    className="size-2.5 rounded-full bg-muted-foreground"
                    style={team ? { backgroundColor: team.color } : undefined}
                    aria-hidden
                  />
                  <h2 className="min-w-0 flex-1 truncate text-sm font-bold">
                    {team?.name ?? t('queue.noTeam')}
                  </h2>
                  <span className="rounded-full bg-card px-2 py-0.5 text-xs font-bold text-muted-foreground">
                    {teamChats.length}
                  </span>
                </div>
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                  {teamChats.length === 0 ? (
                    <p className="px-2 py-8 text-center text-xs text-muted-foreground">
                      {t('queue.emptyTeam')}
                    </p>
                  ) : (
                    teamChats.map((chat) => {
                      const name = chatName(chat, t)
                      return (
                        <article
                          key={chat.id}
                          className="relative rounded-lg border bg-card p-3 shadow-xs transition-colors hover:border-primary/40 hover:bg-primary/3"
                        >
                          <Link
                            to={`/chat/${chat.id}`}
                            className="absolute inset-0 rounded-lg focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/25"
                            aria-label={name}
                          />
                          <div className="pointer-events-none flex gap-2.5">
                            <Avatar name={name} size="md" />
                            <div className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-bold">
                                {name}
                              </span>
                              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                {chat.latestMessage?.preview ??
                                  t('chatWorkspace.noMessages')}
                              </p>
                            </div>
                          </div>
                          <div className="pointer-events-none mt-3 flex items-center gap-2 border-t pt-2.5">
                            <span className="flex min-w-0 flex-1 items-center gap-1.5 text-xs font-semibold text-warning">
                              <Clock3
                                className="size-3.5 shrink-0"
                                aria-hidden
                              />
                              {formatWaitTime(chat.handoffAt, now, t)}
                            </span>
                            <Button
                              className="pointer-events-auto relative z-10"
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => void openPreview(chat)}
                            >
                              <Eye className="size-3.5" aria-hidden />
                              {t('queue.preview')}
                            </Button>
                          </div>
                        </article>
                      )
                    })
                  )}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      <Dialog
        open={previewChat !== null}
        onOpenChange={(open) => !open && setPreviewChat(null)}
        title={previewChat ? chatName(previewChat, t) : t('queue.preview')}
        description={t('queue.previewDescription')}
        icon={
          <MessageSquareText className="mt-1 size-5 text-primary" aria-hidden />
        }
        size="xl"
        contentLayout="block"
        className="overflow-hidden"
        contentClassName="mt-0"
      >
        {previewChat && (
          <div className="mt-5 flex h-[min(40rem,calc(100dvh-12rem))] min-h-0 flex-col overflow-hidden rounded-xl border">
            <div className="min-h-0 flex-1">
              <ChatShowcase
                variant="workspace"
                contactName={chatName(previewChat, t)}
                initialItems={renderedPreview}
                showHeader={false}
                showProfileIntro={false}
                showStatusLegend={false}
                showHeaderActions={false}
                showComposer={false}
                emptyState={
                  isLoadingPreview ? (
                    <div
                      className="grid place-items-center py-10"
                      role="status"
                    >
                      <LoaderCircle
                        className="size-5 animate-spin"
                        aria-hidden
                      />
                    </div>
                  ) : (
                    <p className="py-10 text-center text-sm text-muted-foreground">
                      {t('chatWorkspace.emptyTimeline')}
                    </p>
                  )
                }
                footer={
                  <div className="grid shrink-0 gap-2 border-t bg-card p-3">
                    {previewError && (
                      <p className="text-xs text-destructive" role="alert">
                        {previewError}
                      </p>
                    )}
                    <Button
                      className="w-full"
                      type="button"
                      onClick={() => void assignAndOpen()}
                      disabled={isAssigning}
                    >
                      {isAssigning ? (
                        <LoaderCircle
                          className="size-4 animate-spin"
                          aria-hidden
                        />
                      ) : (
                        <UsersRound className="size-4" aria-hidden />
                      )}
                      {t('queue.assignAndChat')}
                    </Button>
                  </div>
                }
              />
            </div>
          </div>
        )}
      </Dialog>
    </main>
  )
}

function formatWaitTime(
  handoffAt: string | null,
  now: number,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  if (!handoffAt) return t('queue.waitUnknown')
  const minutes = Math.max(
    0,
    Math.floor((now - new Date(handoffAt).getTime()) / 60_000),
  )
  const days = Math.floor(minutes / 1_440)
  const hours = Math.floor((minutes % 1_440) / 60)
  if (days > 0) return t('queue.waitDaysHours', { days, hours })
  if (hours > 0)
    return t('queue.waitHoursMinutes', { hours, minutes: minutes % 60 })
  return t('queue.waitMinutes', { minutes })
}
