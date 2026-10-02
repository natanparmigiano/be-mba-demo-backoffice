import type { TFunction } from 'i18next'
import type { InferResponseType } from 'hono/client'
import {
  Bot,
  Hand,
  LoaderCircle,
  MessagesSquare,
  RefreshCw,
  UserRound,
  WifiOff,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiClient } from '../api'
import { authClient } from '../auth/auth-client'
import {
  ChatComposer,
  ChatShowcase,
  type ChatComposerDraft,
  type ChatMessage,
  type ChatTimelineItem,
  type ComposerTemplatePage,
  type ContactValue,
  type MessageReaction,
  type ReplyActions,
  type StickerLibraryItem,
  type StickerMessage,
} from '../components/chat'
import { Avatar, Button, cn, Pill } from '../components/ui'

type ChatsResponse = InferResponseType<typeof apiClient.api.chats.$get, 200>
type ChatSummary = ChatsResponse['chats'][number]
type ChatDetailResponse = InferResponseType<
  (typeof apiClient.api.chats)[':id']['$get'],
  200
>
type ChatTemplatesResponse = InferResponseType<
  (typeof apiClient.api.chats)[':id']['templates']['$get'],
  200
>
type TimelineResponse = InferResponseType<
  (typeof apiClient.api.chats)[':id']['timeline']['$get'],
  200
>
type ApiTimelineItem = TimelineResponse['items'][number]
type ChatMessageRequest = Parameters<
  (typeof apiClient.api.chats)[':id']['messages']['$post']
>[0]['json']
type Handler = ChatSummary['handledBy']
type HandoffError = { chatId: number; message: string }
type RealtimeState = 'idle' | 'connecting' | 'connected' | 'disconnected'

const CHAT_PAGE_SIZE = 30
const TIMELINE_PAGE_SIZE = 50
const CUSTOMER_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1_000

export function ChatWorkspace() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { chatId: routeChatId } = useParams<{ chatId?: string }>()
  const selectedId = parseChatRouteId(routeChatId)
  const hasInvalidRouteChatId = routeChatId !== undefined && selectedId === null
  const activeOrganizationQuery = authClient.useActiveOrganization()
  const activeOrganizationId = activeOrganizationQuery.data?.id
  const [chats, setChats] = useState<ChatSummary[]>([])
  const [nextChatCursor, setNextChatCursor] = useState<string | null>(null)
  const [timelineItems, setTimelineItems] = useState<ApiTimelineItem[]>([])
  const [timelineChatId, setTimelineChatId] = useState<number | null>(null)
  const [nextTimelineCursor, setNextTimelineCursor] = useState<string | null>(
    null,
  )
  const [isLoadingChats, setIsLoadingChats] = useState(true)
  const [isLoadingMoreChats, setIsLoadingMoreChats] = useState(false)
  const [isLoadingTimeline, setIsLoadingTimeline] = useState(false)
  const [isLoadingOlder, setIsLoadingOlder] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const [timelineError, setTimelineError] = useState<string | null>(null)
  const [selectedChatError, setSelectedChatError] = useState<string | null>(
    null,
  )
  const [isLoadingSelectedChat, setIsLoadingSelectedChat] = useState(false)
  const [handoffChatId, setHandoffChatId] = useState<number | null>(null)
  const [handoffError, setHandoffError] = useState<HandoffError | null>(null)
  const [realtimeState, setRealtimeState] = useState<RealtimeState>('idle')
  const [realtimeGeneration, setRealtimeGeneration] = useState(0)
  const chatRequestId = useRef(0)
  const selectedChatRequestId = useRef(0)
  const timelineRequestId = useRef(0)
  const chatPageInFlightRef = useRef<string | null>(null)
  const timelinePageInFlightRef = useRef<string | null>(null)
  const chatViewportRef = useRef<HTMLDivElement>(null)
  const chatPrefetchRef = useRef<HTMLDivElement>(null)
  const timelineViewportRef = useRef<HTMLDivElement>(null)
  const timelinePrefetchRef = useRef<HTMLDivElement>(null)
  const realtimeRefreshTimerRef = useRef<ReturnType<typeof setTimeout>>(null)
  const realtimeTimelineRefreshRef = useRef(false)
  const selectedIdRef = useRef(selectedId)

  selectedIdRef.current = selectedId

  const refreshInbox = useCallback(
    async (preserveChatId: number | null): Promise<boolean> => {
      const requestId = ++chatRequestId.current
      setChatError(null)
      chatPageInFlightRef.current = null

      try {
        const [result, selected] = await Promise.all([
          fetchChats(undefined, t('chatWorkspace.loadFailed')),
          preserveChatId
            ? fetchChat(preserveChatId, t('chatWorkspace.chatNotFound'))
            : Promise.resolve(undefined),
        ])
        if (chatRequestId.current !== requestId) return false

        setChats(mergeSelectedChat(result.chats, selected))
        setSelectedChatError(null)
        setNextChatCursor(result.nextCursor)
        return true
      } catch (reason) {
        if (chatRequestId.current === requestId) {
          setChatError(getErrorMessage(reason, t('chatWorkspace.loadFailed')))
        }
        return false
      }
    },
    [t],
  )

  const refreshChatRegion = useCallback(
    async (chatId: number): Promise<boolean> => {
      const chatRequest = ++chatRequestId.current
      const timelineRequest = ++timelineRequestId.current
      setChatError(null)
      setTimelineError(null)
      chatPageInFlightRef.current = null
      timelinePageInFlightRef.current = null

      try {
        const [chatResult, selected, timelineResult] = await Promise.all([
          fetchChats(undefined, t('chatWorkspace.loadFailed')),
          fetchChat(chatId, t('chatWorkspace.chatNotFound')),
          fetchTimeline(
            chatId,
            undefined,
            t('chatWorkspace.timelineLoadFailed'),
          ),
        ])
        if (
          chatRequestId.current !== chatRequest ||
          timelineRequestId.current !== timelineRequest
        ) {
          return false
        }

        setChats(mergeSelectedChat(chatResult.chats, selected))
        setSelectedChatError(null)
        setNextChatCursor(chatResult.nextCursor)
        setTimelineItems(timelineResult.items)
        setTimelineChatId(chatId)
        setNextTimelineCursor(timelineResult.nextCursor)
        return true
      } catch (reason) {
        if (
          chatRequestId.current === chatRequest &&
          timelineRequestId.current === timelineRequest
        ) {
          const message = getErrorMessage(
            reason,
            t('chatWorkspace.timelineLoadFailed'),
          )
          setChatError(message)
          setTimelineError(message)
        }
        return false
      }
    },
    [t],
  )

  useEffect(() => {
    document.title = `${t('chatWorkspace.title')} · ${t('design.brand')}`
    document
      .querySelector<HTMLMetaElement>('meta[name="description"]')
      ?.setAttribute('content', t('chatWorkspace.metaDescription'))
  }, [t])

  useEffect(() => {
    const requestId = ++chatRequestId.current
    setChats([])
    setNextChatCursor(null)
    setChatError(null)
    setIsLoadingMoreChats(false)
    chatPageInFlightRef.current = null

    if (!activeOrganizationId) {
      setIsLoadingChats(false)
      return
    }

    setIsLoadingChats(true)
    void (async () => {
      try {
        const result = await fetchChats(
          undefined,
          t('chatWorkspace.loadFailed'),
        )
        if (chatRequestId.current !== requestId) return
        setChats((current) =>
          mergeSelectedChat(
            result.chats,
            current.find((chat) => chat.id === selectedIdRef.current),
          ),
        )
        setNextChatCursor(result.nextCursor)
      } catch (reason) {
        if (chatRequestId.current === requestId) {
          setChatError(getErrorMessage(reason, t('chatWorkspace.loadFailed')))
        }
      } finally {
        if (chatRequestId.current === requestId) setIsLoadingChats(false)
      }
    })()
  }, [activeOrganizationId, t])

  useEffect(() => {
    const requestId = ++selectedChatRequestId.current
    setSelectedChatError(null)

    if (!activeOrganizationId || !selectedId) {
      setIsLoadingSelectedChat(false)
      return
    }

    setIsLoadingSelectedChat(true)
    void (async () => {
      try {
        const selected = await fetchChat(
          selectedId,
          t('chatWorkspace.chatNotFound'),
        )
        if (selectedChatRequestId.current !== requestId) return
        setChats((current) => mergeSelectedChat(current, selected))
      } catch (reason) {
        if (selectedChatRequestId.current === requestId) {
          setSelectedChatError(
            getErrorMessage(reason, t('chatWorkspace.chatNotFound')),
          )
        }
      } finally {
        if (selectedChatRequestId.current === requestId) {
          setIsLoadingSelectedChat(false)
        }
      }
    })()
  }, [activeOrganizationId, selectedId, t])

  useEffect(() => {
    const requestId = ++timelineRequestId.current
    setTimelineItems([])
    setTimelineChatId(null)
    setNextTimelineCursor(null)
    setTimelineError(null)
    setIsLoadingOlder(false)
    timelinePageInFlightRef.current = null

    if (!selectedId) {
      setIsLoadingTimeline(false)
      return
    }

    setIsLoadingTimeline(true)
    void (async () => {
      try {
        const result = await fetchTimeline(
          selectedId,
          undefined,
          t('chatWorkspace.timelineLoadFailed'),
        )
        if (timelineRequestId.current !== requestId) return
        setTimelineItems(result.items)
        setTimelineChatId(selectedId)
        setNextTimelineCursor(result.nextCursor)
      } catch (reason) {
        if (timelineRequestId.current === requestId) {
          setTimelineError(
            getErrorMessage(reason, t('chatWorkspace.timelineLoadFailed')),
          )
        }
      } finally {
        if (timelineRequestId.current === requestId) {
          setIsLoadingTimeline(false)
        }
      }
    })()
  }, [selectedId, t])

  useEffect(() => {
    if (
      !activeOrganizationId ||
      isLoadingChats ||
      (selectedId !== null &&
        (timelineChatId !== selectedId || isLoadingTimeline))
    ) {
      setRealtimeState('idle')
      return
    }

    let disposed = false
    const source = new EventSource('/api/chats/events', {
      withCredentials: true,
    })
    setRealtimeState('connecting')

    const refresh = (refreshTimeline: boolean) => {
      realtimeTimelineRefreshRef.current ||= refreshTimeline
      if (realtimeRefreshTimerRef.current) {
        clearTimeout(realtimeRefreshTimerRef.current)
      }
      realtimeRefreshTimerRef.current = setTimeout(() => {
        realtimeRefreshTimerRef.current = null
        const chatId = selectedIdRef.current
        const shouldRefreshTimeline = realtimeTimelineRefreshRef.current
        realtimeTimelineRefreshRef.current = false
        if (chatId && shouldRefreshTimeline) {
          void refreshChatRegion(chatId)
        } else {
          void refreshInbox(chatId)
        }
      }, 75)
    }

    source.addEventListener('ready', () => {
      if (disposed) return
      setRealtimeState('connected')
      // Close the snapshot/subscription race with one refresh after the
      // server confirms that the PubSub subscription is active.
      refresh(true)
    })
    source.addEventListener('chat-update', (event) => {
      refresh(realtimeEventChatId(event) === selectedIdRef.current)
    })
    source.onerror = () => {
      if (disposed) return
      source.close()
      setRealtimeState('disconnected')
    }

    return () => {
      disposed = true
      source.close()
      if (realtimeRefreshTimerRef.current) {
        clearTimeout(realtimeRefreshTimerRef.current)
        realtimeRefreshTimerRef.current = null
      }
      realtimeTimelineRefreshRef.current = false
    }
  }, [
    activeOrganizationId,
    isLoadingChats,
    isLoadingTimeline,
    realtimeGeneration,
    refreshInbox,
    refreshChatRegion,
    selectedId,
    timelineChatId,
  ])

  const selectedChat = chats.find((chat) => chat.id === selectedId) ?? null
  const isOutsideCustomerServiceWindow = useCustomerServiceWindowExpired(
    selectedChat?.latestInboundMessageAt ?? null,
  )
  const loadSelectedTemplates = useCallback(
    (after?: string) => {
      if (selectedId === null) {
        return Promise.reject(new Error(t('chatWorkspace.chatNotFound')))
      }
      return fetchChatTemplates(
        selectedId,
        after,
        t('chatComposer.templates.loadFailed'),
      )
    },
    [selectedId, t],
  )
  const loadStickers = useCallback(
    () => fetchStickerLibrary(t('chatComposer.stickerLibraryFailed')),
    [t],
  )
  const addSticker = useCallback((file: File) => saveStickerFile(file, t), [t])
  const resolveSticker = useCallback(
    (sticker: StickerLibraryItem) =>
      fetchStickerFile(sticker, t('chatComposer.stickerLibraryFailed')),
    [t],
  )
  const unavailableChatMessage = hasInvalidRouteChatId
    ? t('chatWorkspace.invalidChatLink')
    : selectedChatError
  const latestRenderedInboundProviderMessageId = useMemo(() => {
    if (timelineChatId !== selectedId || isLoadingTimeline) return undefined
    for (let index = timelineItems.length - 1; index >= 0; index -= 1) {
      const item = timelineItems[index]
      if (
        item?.itemType === 'message' &&
        item.direction === 'inbound' &&
        item.providerMessageId
      ) {
        return item.providerMessageId
      }
    }
    return null
  }, [isLoadingTimeline, selectedId, timelineChatId, timelineItems])
  const markRenderedConversationRead = useCallback(() => {
    if (
      !selectedId ||
      !activeOrganizationId ||
      latestRenderedInboundProviderMessageId === undefined
    ) {
      return
    }
    const chatId = selectedId
    void markChatRead(chatId).then((read) => {
      if (!read) return
      setChats((current) =>
        current.map((chat) =>
          chat.id === chatId ? { ...chat, unreadMessageCount: 0 } : chat,
        ),
      )
      setTimelineItems((current) =>
        current.map((item) =>
          item.itemType === 'message' &&
          item.direction === 'inbound' &&
          item.status === 'delivered'
            ? { ...item, status: 'read' }
            : item,
        ),
      )
    })
  }, [activeOrganizationId, latestRenderedInboundProviderMessageId, selectedId])
  const renderedTimeline = useMemo(() => {
    const items = timelineChatId === selectedId ? timelineItems : []
    const reactions = collectMessageReactions(items)
    return items.flatMap((item) =>
      item.itemType === 'message' && item.messageType === 'reaction'
        ? []
        : [
            toChatTimelineItem(
              item,
              t,
              i18n.resolvedLanguage ?? i18n.language,
              selectedChat?.kind === 'group',
              item.itemType === 'message' && item.providerMessageId
                ? reactions.get(item.providerMessageId)
                : undefined,
            ),
          ],
    )
  }, [
    i18n.language,
    i18n.resolvedLanguage,
    selectedChat?.kind,
    selectedId,
    t,
    timelineChatId,
    timelineItems,
  ])

  const loadMoreChats = async () => {
    const cursor = nextChatCursor
    if (
      !cursor ||
      isLoadingMoreChats ||
      chatPageInFlightRef.current === cursor
    ) {
      return
    }
    const requestId = chatRequestId.current
    chatPageInFlightRef.current = cursor
    setIsLoadingMoreChats(true)
    setChatError(null)
    try {
      const result = await fetchChats(cursor, t('chatWorkspace.loadFailed'))
      if (chatRequestId.current !== requestId) return
      setChats((current) => reconcileChatPage(current, result.chats))
      setNextChatCursor(result.nextCursor)
    } catch (reason) {
      if (chatRequestId.current === requestId) {
        setChatError(getErrorMessage(reason, t('chatWorkspace.loadFailed')))
      }
    } finally {
      if (chatPageInFlightRef.current === cursor) {
        chatPageInFlightRef.current = null
      }
      if (chatRequestId.current === requestId) setIsLoadingMoreChats(false)
    }
  }

  const loadOlderTimeline = async () => {
    const cursor = nextTimelineCursor
    const requestKey = selectedId && cursor ? `${selectedId}:${cursor}` : null
    if (
      !selectedId ||
      !cursor ||
      !requestKey ||
      isLoadingOlder ||
      timelinePageInFlightRef.current === requestKey
    ) {
      return
    }
    const requestId = timelineRequestId.current
    timelinePageInFlightRef.current = requestKey
    setIsLoadingOlder(true)
    setTimelineError(null)
    try {
      const result = await fetchTimeline(
        selectedId,
        cursor,
        t('chatWorkspace.timelineLoadFailed'),
      )
      if (timelineRequestId.current !== requestId) return
      setTimelineItems((current) =>
        mergeUnique(result.items, current, timelineKey),
      )
      setNextTimelineCursor(result.nextCursor)
    } catch (reason) {
      if (timelineRequestId.current === requestId) {
        setTimelineError(
          getErrorMessage(reason, t('chatWorkspace.timelineLoadFailed')),
        )
      }
    } finally {
      if (timelinePageInFlightRef.current === requestKey) {
        timelinePageInFlightRef.current = null
      }
      if (timelineRequestId.current === requestId) setIsLoadingOlder(false)
    }
  }

  const changeHandler = async (chat: ChatSummary) => {
    if (handoffChatId !== null) return

    const handledBy: Handler = chat.handledBy === 'mba' ? 'application' : 'mba'
    setHandoffChatId(chat.id)
    setHandoffError(null)
    try {
      const response = await apiClient.api.chats[':id'].handoff.$patch({
        param: { id: String(chat.id) },
        json: { handledBy },
      })
      if (!response.ok) {
        throw new Error(
          await readApiError(response, t('chatWorkspace.handoffFailed')),
        )
      }
      const result = await response.json()
      setChats((current) =>
        current.map((item) =>
          item.id === chat.id ? { ...item, handledBy: result.handledBy } : item,
        ),
      )
    } catch (reason) {
      setHandoffError({
        chatId: chat.id,
        message: getErrorMessage(reason, t('chatWorkspace.handoffFailed')),
      })
    } finally {
      setHandoffChatId((current) => (current === chat.id ? null : current))
    }
  }

  const reconnectRealtime = async () => {
    if (realtimeState === 'connecting') return
    setRealtimeState('connecting')
    if (selectedId) {
      await refreshChatRegion(selectedId)
    } else {
      await refreshInbox(null)
    }
    setRealtimeGeneration((current) => current + 1)
  }

  useCursorPrefetch(
    chatViewportRef,
    chatPrefetchRef,
    nextChatCursor,
    () => void loadMoreChats(),
    '0px 0px 240px 0px',
  )
  useCursorPrefetch(
    timelineViewportRef,
    timelinePrefetchRef,
    nextTimelineCursor,
    () => void loadOlderTimeline(),
    '320px 0px 0px 0px',
  )

  return (
    <section className="grid h-full max-h-full min-h-0 grid-rows-[16rem_minmax(0,1fr)] overflow-hidden bg-card lg:grid-cols-[22rem_minmax(0,1fr)] lg:grid-rows-1">
      <h1 className="sr-only">{t('chatWorkspace.title')}</h1>

      <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden border-b bg-card lg:border-r lg:border-b-0">
        <div className="flex h-14 shrink-0 flex-col justify-center border-b px-4">
          <p className="font-bold">{t('chatWorkspace.inbox')}</p>
          <p className="text-xs text-muted-foreground">
            {t('chatWorkspace.inboxDescription')}
          </p>
        </div>

        {chatError && (
          <p
            className="m-3 rounded-lg bg-destructive/10 p-3 text-xs text-destructive"
            role="alert"
          >
            {chatError}
          </p>
        )}

        <div
          ref={chatViewportRef}
          className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain p-2"
        >
          {isLoadingChats ? (
            <LoadingState label={t('chatWorkspace.loadingChats')} />
          ) : chats.length === 0 ? (
            <div className="grid h-full place-items-center px-6 text-center text-sm text-muted-foreground">
              <div>
                <MessagesSquare
                  className="mx-auto mb-3 size-8 opacity-50"
                  aria-hidden
                />
                {t('chatWorkspace.noConversations')}
              </div>
            </div>
          ) : (
            <ul className="grid min-w-0 gap-1">
              {chats.map((chat) => {
                const name = chatName(chat, t)
                return (
                  <li key={chat.id} className="min-w-0">
                    <Link
                      to={`/chat/${chat.id}`}
                      className={cn(
                        'flex min-w-0 w-full cursor-pointer items-start gap-2.5 overflow-hidden rounded-lg px-2.5 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/25',
                        selectedId === chat.id
                          ? 'bg-primary/10'
                          : 'hover:bg-muted/60',
                      )}
                      aria-current={selectedId === chat.id ? 'page' : undefined}
                    >
                      <Avatar name={name} size="md" />
                      <span className="min-w-0 flex-1 overflow-hidden">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-sm font-bold">
                            {name}
                          </span>
                          <span className="ml-auto flex shrink-0 items-center gap-2">
                            {chat.unreadMessageCount > 0 && (
                              <span
                                className="grid min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground"
                                aria-label={t('chatWorkspace.unreadCount', {
                                  count: chat.unreadMessageCount,
                                })}
                                title={t('chatWorkspace.unreadCount', {
                                  count: chat.unreadMessageCount,
                                })}
                              >
                                {chat.unreadMessageCount > 99
                                  ? '99+'
                                  : chat.unreadMessageCount}
                              </span>
                            )}
                            <time className="shrink-0 text-[10px] text-muted-foreground">
                              {formatChatTime(
                                chat.latestMessage?.occurredAt ??
                                  chat.updatedAt,
                                i18n.resolvedLanguage ?? i18n.language,
                              )}
                            </time>
                          </span>
                        </span>
                        <span className="mt-0.5 block max-w-full truncate text-xs text-muted-foreground">
                          {messagePreview(chat, t)}
                        </span>
                        <span className="mt-1.5 flex min-w-0 items-center gap-1.5">
                          <HandlerPill handler={chat.handledBy} />
                          <Pill>{t(`chatWorkspace.kinds.${chat.kind}`)}</Pill>
                        </span>
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}

          {nextChatCursor && (
            <div
              ref={chatPrefetchRef}
              className="flex h-10 items-center justify-center"
              role={isLoadingMoreChats ? 'status' : undefined}
            >
              {isLoadingMoreChats && (
                <LoaderCircle className="size-4 animate-spin" aria-hidden />
              )}
              <span className="sr-only">
                {t('chatWorkspace.loadMoreChats')}
              </span>
            </div>
          )}
        </div>
      </aside>

      <div className="h-full min-h-0 min-w-0 overflow-hidden bg-background/55">
        {selectedChat ? (
          <ChatShowcase
            key={selectedChat.id}
            variant="workspace"
            contactName={chatName(selectedChat, t)}
            contactSubtitle={`${chatRemoteIdentity(selectedChat)} · ${selectedChat.channel.waPhoneNumber}`}
            initialItems={renderedTimeline}
            messagesViewportRef={timelineViewportRef}
            onConversationRendered={
              !isLoadingTimeline && timelineChatId === selectedChat.id
                ? markRenderedConversationRead
                : undefined
            }
            showProfileIntro={false}
            showStatusLegend={false}
            showComposer={false}
            footer={
              selectedChat.handledBy === 'application' ? (
                <ChatComposer
                  outsideCustomerServiceWindow={isOutsideCustomerServiceWindow}
                  addSticker={addSticker}
                  loadStickers={loadStickers}
                  loadTemplates={loadSelectedTemplates}
                  resolveSticker={resolveSticker}
                  onSend={async (draft) => {
                    await sendChatDraft(selectedChat.id, draft, t)
                    await refreshChatRegion(selectedChat.id)
                  }}
                />
              ) : undefined
            }
            onMessageReaction={
              selectedChat.handledBy === 'application'
                ? async (providerMessageId, emoji) => {
                    await sendMessageReaction(
                      selectedChat.id,
                      providerMessageId,
                      emoji,
                      t,
                    )
                    await refreshChatRegion(selectedChat.id)
                  }
                : undefined
            }
            onSaveSticker={async (message: StickerMessage) => {
              const response = await fetch(message.url)
              if (!response.ok) {
                throw new Error(t('chat.stickerSaveFailed'))
              }
              const blob = await response.blob()
              const source = new File([blob], `received-${message.id}.webp`, {
                type: blob.type,
              })
              await saveStickerFile(source, t, true)
            }}
            headerActions={
              <div className="ml-auto flex shrink-0 items-center gap-2">
                <OwnerIndicator handler={selectedChat.handledBy} />
                <Button
                  type="button"
                  size="sm"
                  variant={
                    selectedChat.handledBy === 'mba' ? 'primary' : 'outline'
                  }
                  isLoading={handoffChatId === selectedChat.id}
                  onClick={() => void changeHandler(selectedChat)}
                >
                  {selectedChat.handledBy === 'mba' ? (
                    <Hand className="size-3.5" aria-hidden />
                  ) : (
                    <Bot className="size-3.5" aria-hidden />
                  )}
                  {t(
                    selectedChat.handledBy === 'mba'
                      ? 'chatWorkspace.takeControl'
                      : 'chatWorkspace.passToAi',
                  )}
                </Button>
              </div>
            }
            notice={
              realtimeState === 'disconnected' ? (
                <div
                  className="flex shrink-0 items-center gap-3 border-b border-warning/35 bg-warning/10 px-3 py-2.5 text-xs text-foreground"
                  role="alert"
                >
                  <WifiOff
                    className="size-4 shrink-0 text-warning"
                    aria-hidden
                  />
                  <p className="min-w-0 flex-1">
                    <span className="font-semibold">
                      {t('chatWorkspace.realtimeDisconnected')}
                    </span>{' '}
                    <span className="text-muted-foreground">
                      {t('chatWorkspace.realtimeDisconnectedDescription')}
                    </span>
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void reconnectRealtime()}
                  >
                    <RefreshCw className="size-3.5" aria-hidden />
                    {t('chatWorkspace.reconnect')}
                  </Button>
                </div>
              ) : undefined
            }
            messagesHeader={
              <>
                {handoffError?.chatId === selectedChat.id && (
                  <p
                    className="mx-auto max-w-md rounded-lg bg-destructive/10 p-3 text-center text-xs text-destructive"
                    role="alert"
                  >
                    {handoffError.message}
                  </p>
                )}
                {nextTimelineCursor && (
                  <div
                    ref={timelinePrefetchRef}
                    className="flex h-8 items-center justify-center"
                    role={isLoadingOlder ? 'status' : undefined}
                  >
                    {isLoadingOlder && (
                      <LoaderCircle
                        className="size-4 animate-spin"
                        aria-hidden
                      />
                    )}
                    <span className="sr-only">
                      {t('chatWorkspace.loadOlderMessages')}
                    </span>
                  </div>
                )}
                {timelineError && (
                  <p
                    className="mx-auto max-w-md rounded-lg bg-destructive/10 p-3 text-center text-xs text-destructive"
                    role="alert"
                  >
                    {timelineError}
                  </p>
                )}
              </>
            }
            emptyState={
              isLoadingTimeline || timelineChatId !== selectedChat.id ? (
                <LoadingState label={t('chatWorkspace.loadingTimeline')} />
              ) : (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  {t('chatWorkspace.emptyTimeline')}
                </p>
              )
            }
          />
        ) : selectedId !== null || hasInvalidRouteChatId ? (
          <div className="grid h-full place-items-center px-6 text-center">
            {isLoadingChats || isLoadingSelectedChat ? (
              <LoadingState label={t('chatWorkspace.loadingSelectedChat')} />
            ) : (
              <div className="max-w-sm">
                <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-destructive/10 text-destructive">
                  <MessagesSquare className="size-7" aria-hidden />
                </span>
                <h2 className="mt-4 text-lg font-bold text-foreground">
                  {t('chatWorkspace.chatUnavailableTitle')}
                </h2>
                <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                  {unavailableChatMessage ??
                    t('chatWorkspace.chatUnavailableDescription')}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-4"
                  onClick={() => void navigate('/chat', { replace: true })}
                >
                  {t('chatWorkspace.returnToInbox')}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="grid h-full place-items-center px-6 text-center">
            {isLoadingChats ? (
              <LoadingState label={t('chatWorkspace.loadingChats')} />
            ) : (
              <div className="max-w-sm">
                <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <MessagesSquare className="size-7" aria-hidden />
                </span>
                <h2 className="mt-4 text-lg font-bold text-foreground">
                  {t('chatWorkspace.selectConversationTitle')}
                </h2>
                <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                  {t('chatWorkspace.selectConversationDescription')}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

function useCustomerServiceWindowExpired(
  latestInboundMessageAt: string | null,
): boolean {
  const expiresAt = latestInboundMessageAt
    ? new Date(latestInboundMessageAt).getTime() + CUSTOMER_SERVICE_WINDOW_MS
    : 0
  const [expired, setExpired] = useState(
    () => !expiresAt || Date.now() >= expiresAt,
  )

  useEffect(() => {
    const nextExpired = !expiresAt || Date.now() >= expiresAt
    setExpired(nextExpired)
    if (nextExpired) return

    const timeout = window.setTimeout(
      () => setExpired(true),
      Math.min(expiresAt - Date.now(), 2_147_483_647),
    )
    return () => window.clearTimeout(timeout)
  }, [expiresAt])

  return expired
}

function HandlerPill({ handler }: { handler: Handler }) {
  const { t } = useTranslation()
  return (
    <Pill tone={handler === 'mba' ? 'primary' : 'success'}>
      {handler === 'mba' ? (
        <Bot className="size-3" aria-hidden />
      ) : (
        <UserRound className="size-3" aria-hidden />
      )}
      {t(`chatWorkspace.handlers.${handler}`)}
    </Pill>
  )
}

function OwnerIndicator({ handler }: { handler: Handler }) {
  const { t } = useTranslation()
  const owner = t(`chatWorkspace.handlers.${handler}`)

  return (
    <div
      className="flex h-9 items-center gap-2 rounded-lg border bg-card px-2 sm:px-2.5"
      aria-label={t('chatWorkspace.handledBy', { handler: owner })}
    >
      <span
        className={cn(
          'grid size-6 place-items-center rounded-full',
          handler === 'mba'
            ? 'bg-primary/10 text-primary'
            : 'bg-success/12 text-success',
        )}
      >
        {handler === 'mba' ? (
          <Bot className="size-3.5" aria-hidden />
        ) : (
          <UserRound className="size-3.5" aria-hidden />
        )}
      </span>
      <span className="leading-tight">
        <span className="hidden text-[9px] font-semibold tracking-wide text-muted-foreground uppercase sm:block">
          {t('chatWorkspace.owner')}
        </span>
        <span className="block text-xs font-bold">{owner}</span>
      </span>
    </div>
  )
}

function LoadingState({ label }: { label: string }) {
  return (
    <div
      className="flex h-full min-h-24 items-center justify-center gap-2 text-sm text-muted-foreground"
      role="status"
    >
      <LoaderCircle className="size-4 animate-spin" aria-hidden />
      {label}
    </div>
  )
}

async function fetchChats(
  cursor: string | undefined,
  fallback: string,
): Promise<ChatsResponse> {
  const response = await apiClient.api.chats.$get({
    query: {
      limit: String(CHAT_PAGE_SIZE),
      ...(cursor ? { cursor } : {}),
    },
  })
  if (!response.ok) {
    throw new Error(await readApiError(response, fallback))
  }
  return response.json()
}

async function fetchChat(
  chatId: number,
  notFoundFallback: string,
): Promise<ChatDetailResponse['chat']> {
  const response = await apiClient.api.chats[':id'].$get({
    param: { id: String(chatId) },
  })
  if (!response.ok) {
    throw new Error(
      response.status === 404
        ? notFoundFallback
        : await readApiError(response, notFoundFallback),
    )
  }
  return (await response.json()).chat
}

async function fetchTimeline(
  chatId: number,
  cursor: string | undefined,
  fallback: string,
): Promise<TimelineResponse> {
  const response = await apiClient.api.chats[':id'].timeline.$get({
    param: { id: String(chatId) },
    query: {
      limit: String(TIMELINE_PAGE_SIZE),
      ...(cursor ? { cursor } : {}),
    },
  })
  if (!response.ok) {
    throw new Error(await readApiError(response, fallback))
  }
  return response.json()
}

async function markChatRead(chatId: number): Promise<boolean> {
  const response = await apiClient.api.chats[':id'].read.$patch({
    param: { id: String(chatId) },
  })
  return response.ok
}

async function sendChatDraft(
  chatId: number,
  draft: ChatComposerDraft,
  t: TFunction,
): Promise<void> {
  let message: ChatMessageRequest['message']
  let mediaFilePath: string | undefined
  let mediaMimeType: string | undefined

  if (draft.type === 'media') {
    const uploaded = await uploadComposerMedia(chatId, draft, t)
    mediaFilePath = uploaded.key
    mediaMimeType = uploaded.contentType
    const media = { id: uploaded.id }
    if (draft.kind === 'image') {
      message = {
        messaging_product: 'whatsapp',
        to: '',
        type: 'image',
        image: {
          ...media,
          ...(draft.caption ? { caption: draft.caption } : {}),
        },
      }
    } else if (draft.kind === 'video') {
      message = {
        messaging_product: 'whatsapp',
        to: '',
        type: 'video',
        video: {
          ...media,
          ...(draft.caption ? { caption: draft.caption } : {}),
        },
      }
    } else if (draft.kind === 'document') {
      message = {
        messaging_product: 'whatsapp',
        to: '',
        type: 'document',
        document: {
          ...media,
          filename: draft.file.name,
          ...(draft.caption ? { caption: draft.caption } : {}),
        },
      }
    } else if (draft.kind === 'sticker') {
      message = {
        messaging_product: 'whatsapp',
        to: '',
        type: 'sticker',
        sticker: media,
      }
    } else {
      message = {
        messaging_product: 'whatsapp',
        to: '',
        type: 'audio',
        audio: { ...media, ...(draft.voice ? { voice: true } : {}) },
      }
    }
  } else if (draft.type === 'text') {
    message = {
      messaging_product: 'whatsapp',
      to: '',
      type: 'text',
      text: {
        body: draft.text,
        preview_url: /https?:\/\//i.test(draft.text),
      },
    }
  } else if (draft.type === 'contacts') {
    message = {
      messaging_product: 'whatsapp',
      to: '',
      type: 'contacts',
      contacts: draft.contacts,
    }
  } else if (draft.type === 'location') {
    message = {
      messaging_product: 'whatsapp',
      to: '',
      type: 'location',
      location: draft.location,
    }
  } else {
    let template = draft.template
    if (draft.headerMedia) {
      const uploaded = await uploadComposerMedia(
        chatId,
        {
          type: 'media',
          kind: draft.headerMedia.kind,
          file: draft.headerMedia.file,
        },
        t,
      )
      mediaFilePath = uploaded.key
      mediaMimeType = uploaded.contentType
      template = {
        ...template,
        components: withTemplateHeaderMedia(
          template.components,
          draft.headerMedia.kind,
          uploaded.id,
        ),
      }
    }
    message = {
      messaging_product: 'whatsapp',
      to: '',
      type: 'template',
      template,
    } as ChatMessageRequest['message']
  }

  const response = await apiClient.api.chats[':id'].messages.$post({
    param: { id: String(chatId) },
    json: {
      clientMessageId: crypto.randomUUID(),
      message,
      ...(draft.type === 'template' ? { templatePreview: draft.preview } : {}),
      ...(mediaFilePath ? { mediaFilePath } : {}),
      ...(mediaMimeType ? { mediaMimeType } : {}),
    },
  })
  if (!response.ok) {
    throw new Error(await readApiError(response, t('chatComposer.sendFailed')))
  }
}

async function fetchChatTemplates(
  chatId: number,
  after: string | undefined,
  fallback: string,
): Promise<ComposerTemplatePage> {
  const response = await apiClient.api.chats[':id'].templates.$get({
    param: { id: String(chatId) },
    query: {
      limit: '100',
      ...(after ? { after } : {}),
    },
  })
  if (!response.ok) throw new Error(await readApiError(response, fallback))
  const result: ChatTemplatesResponse = await response.json()
  return {
    templates: result.templates.map((template) => ({
      ...template,
      components: template.components,
    })),
    nextCursor: result.nextCursor,
  }
}

function withTemplateHeaderMedia(
  input: unknown[] | undefined,
  kind: 'document' | 'image' | 'video',
  mediaId: string,
): unknown[] {
  const components = [...(input ?? [])]
  const parameter = { type: kind, [kind]: { id: mediaId } }
  const headerIndex = components.findIndex(
    (component) =>
      typeof component === 'object' &&
      component !== null &&
      'type' in component &&
      component.type === 'header',
  )
  if (headerIndex < 0)
    return [{ type: 'header', parameters: [parameter] }, ...components]
  const current = components[headerIndex] as {
    type: 'header'
    parameters?: unknown[]
  }
  components[headerIndex] = {
    ...current,
    parameters: [parameter, ...(current.parameters ?? [])],
  }
  return components
}

async function sendMessageReaction(
  chatId: number,
  providerMessageId: string,
  emoji: string,
  t: TFunction,
): Promise<void> {
  const response = await apiClient.api.chats[':id'].messages.$post({
    param: { id: String(chatId) },
    json: {
      clientMessageId: crypto.randomUUID(),
      message: {
        messaging_product: 'whatsapp',
        to: '',
        type: 'reaction',
        reaction: { message_id: providerMessageId, emoji },
      },
    },
  })
  if (!response.ok) {
    throw new Error(await readApiError(response, t('chat.reactionSendFailed')))
  }
}

async function uploadComposerMedia(
  chatId: number,
  draft: Extract<ChatComposerDraft, { type: 'media' }>,
  t: TFunction,
): Promise<{
  id: string
  key: string
  contentType: string
}> {
  const contentType = composerMediaContentType(draft.kind, draft.file)
  if (!contentType) throw new Error(t('chatComposer.unsupportedMedia'))
  const metadata = {
    kind: draft.kind,
    fileName: draft.file.name,
    contentType,
    size: draft.file.size,
    ...(draft.voice ? { voice: true as const } : {}),
  }
  const signedResponse = await apiClient.api.chats[':id']['media-upload'].$post(
    {
      param: { id: String(chatId) },
      json: metadata,
    } as Parameters<
      (typeof apiClient.api.chats)[':id']['media-upload']['$post']
    >[0],
  )
  if (!signedResponse.ok) {
    throw new Error(
      await readApiError(signedResponse, t('chatComposer.uploadFailed')),
    )
  }
  const signed = (await signedResponse.json()).result
  const uploadResponse = await fetch(signed.uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': contentType },
    body: draft.file,
  })
  if (!uploadResponse.ok) throw new Error(t('chatComposer.uploadFailed'))

  const completeResponse = await apiClient.api.chats[':id'].media.$post({
    param: { id: String(chatId) },
    json: { ...metadata, key: signed.key },
  } as Parameters<(typeof apiClient.api.chats)[':id']['media']['$post']>[0])
  if (!completeResponse.ok) {
    throw new Error(
      await readApiError(completeResponse, t('chatComposer.uploadFailed')),
    )
  }
  const completed = (await completeResponse.json()).result
  return {
    id: completed.id,
    key: completed.key,
    contentType: completed.contentType,
  }
}

function composerMediaContentType(
  kind: Extract<ChatComposerDraft, { type: 'media' }>['kind'],
  file: File,
): string | undefined {
  const declared = file.type.split(';')[0]?.toLowerCase()
  const extension = file.name.split('.').at(-1)?.toLowerCase()
  const byExtension: Record<string, string> = {
    aac: 'audio/aac',
    amr: 'audio/amr',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    m4a: 'audio/mp4',
    mp3: 'audio/mpeg',
    mp4: kind === 'audio' ? 'audio/mp4' : 'video/mp4',
    ogg: 'audio/ogg',
    pdf: 'application/pdf',
    png: 'image/png',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '3gp': 'video/3gpp',
    txt: 'text/plain',
    webp: 'image/webp',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }
  const allowed: Record<typeof kind, ReadonlySet<string>> = {
    audio: new Set([
      'audio/aac',
      'audio/amr',
      'audio/mp4',
      'audio/mpeg',
      'audio/ogg',
    ]),
    document: new Set([
      'application/msword',
      'application/pdf',
      'application/vnd.ms-excel',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
    ]),
    image: new Set(['image/jpeg', 'image/png']),
    sticker: new Set(['image/webp']),
    video: new Set(['video/3gpp', 'video/mp4']),
  }
  const inferred = extension ? byExtension[extension] : undefined
  if (declared && allowed[kind].has(declared)) return declared
  return inferred && allowed[kind].has(inferred) ? inferred : undefined
}

async function fetchStickerLibrary(
  fallbackMessage: string,
): Promise<StickerLibraryItem[]> {
  const response = await apiClient.api.stickers.$get()
  if (!response.ok)
    throw new Error(await readApiError(response, fallbackMessage))
  return (await response.json()).stickers
}

async function fetchStickerFile(
  sticker: StickerLibraryItem,
  fallbackMessage: string,
): Promise<File> {
  const response = await fetch(sticker.url)
  if (!response.ok) throw new Error(fallbackMessage)
  return new File([await response.blob()], `sticker-${sticker.id}.webp`, {
    type: 'image/webp',
  })
}

async function saveStickerFile(
  source: File,
  t: TFunction,
  preserveWebp = false,
): Promise<StickerLibraryItem> {
  const sticker =
    preserveWebp && source.type === 'image/webp'
      ? source
      : await convertStickerToWebp(source, t)
  const response = await fetch('/api/stickers', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'image/webp' },
    body: sticker,
  })
  if (!response.ok) {
    throw new Error(
      await readApiError(response, t('chatComposer.stickerLibraryFailed')),
    )
  }
  const result = (await response.json()) as { sticker: StickerLibraryItem }
  return result.sticker
}

async function convertStickerToWebp(source: File, t: TFunction): Promise<Blob> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(source)
  } catch {
    throw new Error(t('chatComposer.invalidSticker'))
  }
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 512
    const context = canvas.getContext('2d')
    if (!context) throw new Error(t('chatComposer.invalidSticker'))
    const scale = Math.min(512 / bitmap.width, 512 / bitmap.height)
    const width = bitmap.width * scale
    const height = bitmap.height * scale
    context.drawImage(
      bitmap,
      (512 - width) / 2,
      (512 - height) / 2,
      width,
      height,
    )

    let converted: Blob | null = null
    for (let quality = 0.9; quality >= 0.3; quality -= 0.1) {
      converted = await canvasToBlob(
        canvas,
        quality,
        t('chatComposer.webpUnsupported'),
      )
      if (converted.size <= 100_000) break
    }
    if (!converted || converted.type !== 'image/webp') {
      throw new Error(t('chatComposer.webpUnsupported'))
    }
    if (converted.size > 100_000) {
      throw new Error(t('chatComposer.stickerTooLarge'))
    }
    return converted
  } finally {
    bitmap.close()
  }
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  quality: number,
  errorMessage: string,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error(errorMessage))
      },
      'image/webp',
      quality,
    )
  })
}

function chatName(chat: ChatSummary, t: TFunction): string {
  if (chat.kind === 'group') {
    return (
      chat.group?.subject ??
      chat.group?.providerGroupId ??
      t('chatWorkspace.unknownGroup')
    )
  }
  return (
    chat.contact?.profileName ??
    chat.contact?.profileUsername ??
    chat.contact?.waId ??
    chat.contact?.userId ??
    t('chatWorkspace.unknownContact')
  )
}

function chatRemoteIdentity(chat: ChatSummary): string {
  return chat.kind === 'group'
    ? (chat.group?.providerGroupId ?? String(chat.id))
    : (chat.contact?.waId ?? chat.contact?.userId ?? String(chat.id))
}

const inboxPreviewMessageTypes = [
  'audio',
  'button',
  'contacts',
  'document',
  'edit',
  'image',
  'interactive',
  'location',
  'order',
  'reaction',
  'revoke',
  'sticker',
  'system',
  'template',
  'text',
  'unknown',
  'unsupported',
  'video',
] as const

type InboxPreviewMessageType = (typeof inboxPreviewMessageTypes)[number]

function messagePreview(chat: ChatSummary, t: TFunction): string {
  const message = chat.latestMessage
  if (!message) return t('chatWorkspace.noMessages')
  if (message.preview) return message.preview

  const messageType = inboxPreviewMessageTypes.includes(
    message.messageType as InboxPreviewMessageType,
  )
    ? (message.messageType as InboxPreviewMessageType)
    : 'unknown'
  const sender =
    message.direction === 'outbound'
      ? t('chatWorkspace.inboxPreviews.you')
      : chat.kind === 'group'
        ? t('chatWorkspace.inboxPreviews.groupParticipant')
        : chatName(chat, t)

  return t('chatWorkspace.inboxPreviews.sent', {
    sender,
    content: t(`chatWorkspace.inboxPreviews.types.${messageType}`),
  })
}

function realtimeEventChatId(event: Event): number | undefined {
  if (!(event instanceof MessageEvent) || typeof event.data !== 'string') {
    return undefined
  }
  try {
    const payload: unknown = JSON.parse(event.data)
    if (
      typeof payload !== 'object' ||
      payload === null ||
      !('chatId' in payload) ||
      typeof payload.chatId !== 'number' ||
      !Number.isSafeInteger(payload.chatId) ||
      payload.chatId <= 0
    ) {
      return undefined
    }
    return payload.chatId
  } catch {
    return undefined
  }
}

function toChatTimelineItem(
  item: ApiTimelineItem,
  t: TFunction,
  locale: string,
  showSenderName: boolean,
  reactions?: MessageReaction[],
): ChatTimelineItem {
  const sentAt = formatTimelineTime(item.occurredAt, locale)
  if (item.itemType === 'event') {
    return {
      id: `event-${item.id}`,
      type: 'event',
      sentAt,
      label: eventLabel(item, t),
    }
  }

  const base = {
    id: `message-${item.id}`,
    providerMessageId: item.providerMessageId ?? undefined,
    direction: item.direction === 'outbound' ? 'outgoing' : 'incoming',
    aiGenerated: item.aiGenerated,
    sentAt,
    senderName: showSenderName ? timelineSenderName(item) : undefined,
    status: messageStatus(item.status),
    reactions,
    forwarded: item.forwarded ?? undefined,
    frequentlyForwarded: item.frequentlyForwarded ?? undefined,
  } as const
  const fallbackText =
    item.text ??
    t(`chatWorkspace.messageTypes.${item.messageType ?? 'unknown'}`)
  const messageType = editedMessageType(item) ?? item.messageType

  switch (messageType) {
    case 'image':
      return item.media?.url
        ? {
            ...base,
            type: 'image',
            url: item.media.url,
            alt: item.media.caption ?? t('chatWorkspace.messageTypes.image'),
            caption: item.media.caption ?? undefined,
          }
        : textMessage(base, fallbackText)
    case 'video':
      return item.media?.url
        ? {
            ...base,
            type: 'video',
            url: item.media.url,
            mimeType: item.media.mimeType ?? undefined,
            caption: item.media.caption ?? undefined,
          }
        : textMessage(base, fallbackText)
    case 'document':
      return {
        ...base,
        type: 'document',
        fileName:
          item.media?.fileName ??
          item.text ??
          t('chatWorkspace.messageTypes.document'),
        mimeType: item.media?.mimeType ?? 'application/octet-stream',
        url: item.media?.url ?? undefined,
        caption: item.media?.caption ?? undefined,
      }
    case 'audio':
      return item.media?.voice
        ? {
            ...base,
            type: 'voice',
            url: item.media.url ?? undefined,
          }
        : {
            ...base,
            type: 'audio',
            url: item.media?.url ?? undefined,
            title:
              item.media?.fileName ?? t('chatWorkspace.messageTypes.audio'),
          }
    case 'location': {
      const location = asRecord(item.locationData)
      const latitude = getNumber(location, 'latitude')
      const longitude = getNumber(location, 'longitude')
      return latitude !== undefined && longitude !== undefined
        ? {
            ...base,
            type: 'location',
            latitude,
            longitude,
            name:
              getString(location, 'name') ??
              t('chatWorkspace.messageTypes.location'),
            address: getString(location, 'address') ?? '',
          }
        : textMessage(base, fallbackText)
    }
    case 'contacts': {
      const contacts = toContactValues(item.contactData)
      return contacts.length > 0
        ? { ...base, type: 'contact', contacts }
        : textMessage(base, fallbackText)
    }
    case 'sticker':
      return item.media?.url
        ? {
            ...base,
            type: 'sticker',
            url: item.media.url,
            alt: t('chatWorkspace.messageTypes.sticker'),
          }
        : textMessage(base, fallbackText)
    case 'interactive':
      return interactiveMessage(item, base, fallbackText, t)
    case 'template': {
      const template = asRecord(item.templateData)
      const language = asRecord(template?.language)
      const name =
        getString(template, 'name') ?? t('chatWorkspace.messageTypes.template')
      return {
        ...base,
        type: 'template',
        name,
        language: getString(language, 'code'),
        preview: item.text && item.text !== name ? item.text : undefined,
      }
    }
    default:
      return textMessage(base, fallbackText)
  }
}

type MessageBase = Pick<
  ChatMessage,
  | 'id'
  | 'direction'
  | 'aiGenerated'
  | 'sentAt'
  | 'senderName'
  | 'status'
  | 'reactions'
  | 'forwarded'
  | 'frequentlyForwarded'
>

function textMessage(base: MessageBase, text: string): ChatMessage {
  return { ...base, type: 'text', text }
}

function editedMessageType(
  item: Extract<ApiTimelineItem, { itemType: 'message' }>,
): string | undefined {
  if (item.messageType !== 'edit') return undefined
  return getString(asRecord(asRecord(item.editData)?.message), 'type')
}

function interactiveMessage(
  item: Extract<ApiTimelineItem, { itemType: 'message' }>,
  base: MessageBase,
  fallbackText: string,
  t: TFunction,
): ChatMessage {
  const interactive = asRecord(item.interactiveData)
  const type = getString(interactive, 'type')
  const body = getString(asRecord(interactive?.body), 'text') ?? fallbackText
  const footer = getString(asRecord(interactive?.footer), 'text')
  const action = asRecord(interactive?.action)

  if (type === 'button') {
    const buttons = toReplyActions(action?.buttons)
    if (buttons) {
      return { ...base, type: 'buttons', text: body, footer, buttons }
    }
  }

  if (type === 'list') {
    const sections = getRecords(action?.sections).map((section, index) => ({
      title:
        getString(section, 'title') ??
        `${t('chatWorkspace.messageTypes.interactive')} ${index + 1}`,
      rows: getRecords(section.rows).flatMap((row) => {
        const id = getString(row, 'id')
        const title = getString(row, 'title')
        return id && title
          ? [{ id, title, description: getString(row, 'description') }]
          : []
      }),
    }))
    const buttonLabel = getString(action, 'button')
    if (buttonLabel && sections.some((section) => section.rows.length > 0)) {
      return {
        ...base,
        type: 'list',
        title:
          getString(asRecord(interactive?.header), 'text') ??
          t('chatWorkspace.messageTypes.interactive'),
        text: body,
        buttonLabel,
        sections,
      }
    }
  }

  if (type === 'cta_url') {
    const parameters = asRecord(action?.parameters)
    const label = getString(parameters, 'display_text')
    const url = safeHttpUrl(getString(parameters, 'url'))
    if (label && url) {
      return { ...base, type: 'url-button', text: body, label, url }
    }
  }

  if (type === 'location_request_message') {
    return {
      ...base,
      type: 'location-request',
      prompt: body,
      buttonLabel: t('chat.sendLocation'),
    }
  }

  return textMessage(base, fallbackText)
}

function toReplyActions(value: unknown): ReplyActions | undefined {
  const buttons = getRecords(value)
    .flatMap((button) => {
      const reply = asRecord(button.reply)
      const id = getString(reply, 'id')
      const title = getString(reply, 'title')
      return id && title ? [{ id, title }] : []
    })
    .slice(0, 3)

  return buttons.length >= 1 && buttons.length <= 3
    ? (buttons as unknown as ReplyActions)
    : undefined
}

function toContactValues(value: unknown): ContactValue[] {
  return getRecords(value).flatMap((contact) => {
    const name = asRecord(contact.name)
    const formattedName = getString(name, 'formatted_name')
    if (!formattedName) return []
    const organization = asRecord(contact.org)

    return [
      {
        formattedName,
        givenName: getString(name, 'first_name'),
        familyName: getString(name, 'last_name'),
        organization: getString(organization, 'company'),
        title: getString(organization, 'title'),
        birthday: getString(contact, 'birthday'),
        phones: getRecords(contact.phones).flatMap((phone) => {
          const value = getString(phone, 'phone') ?? getString(phone, 'wa_id')
          return value
            ? [{ label: contactLabel(getString(phone, 'type')), value }]
            : []
        }),
        emails: getRecords(contact.emails).flatMap((email) => {
          const value = getString(email, 'email')
          return value
            ? [{ label: contactLabel(getString(email, 'type')), value }]
            : []
        }),
        addresses: getRecords(contact.addresses).map((address) => ({
          label: addressLabel(getString(address, 'type')),
          street: getString(address, 'street'),
          city: getString(address, 'city'),
          region: getString(address, 'state'),
          postalCode: getString(address, 'zip'),
          country: getString(address, 'country'),
        })),
        urls: getRecords(contact.urls).flatMap((url) => {
          const value = getString(url, 'url')
          return value
            ? [{ label: contactLabel(getString(url, 'type')), value }]
            : []
        }),
      },
    ]
  })
}

function contactLabel(
  value: string | undefined,
): 'CELL' | 'HOME' | 'WORK' | 'OTHER' {
  if (value === 'HOME' || value === 'WORK') return value
  if (value === 'CELL' || value === 'MAIN' || value === 'IPHONE') return 'CELL'
  return 'OTHER'
}

function addressLabel(value: string | undefined): 'HOME' | 'WORK' | 'OTHER' {
  return value === 'HOME' || value === 'WORK' ? value : 'OTHER'
}

function collectMessageReactions(
  items: readonly ApiTimelineItem[],
): ReadonlyMap<string, MessageReaction[]> {
  const grouped = new Map<string, Map<string, number>>()

  for (const item of items) {
    if (item.itemType !== 'message' || item.messageType !== 'reaction') continue
    const reaction = asRecord(item.reactionData)
    const target =
      item.targetMessageId ??
      getString(reaction, 'message_id') ??
      getString(reaction, 'messsage_id')
    const emoji = getString(reaction, 'emoji')
    if (!target || !emoji) continue
    const counts = grouped.get(target) ?? new Map<string, number>()
    counts.set(emoji, (counts.get(emoji) ?? 0) + 1)
    grouped.set(target, counts)
  }

  return new Map(
    [...grouped].map(([target, counts]) => [
      target,
      [...counts].map(([emoji, count]) => ({ emoji, count })),
    ]),
  )
}

function timelineSenderName(
  item: Extract<ApiTimelineItem, { itemType: 'message' }>,
): string | undefined {
  return (
    item.sender?.profileName ??
    item.sender?.profileUsername ??
    item.sender?.waId ??
    item.sender?.userId ??
    undefined
  )
}

function eventLabel(
  event: Extract<ApiTimelineItem, { itemType: 'event' }>,
  t: TFunction,
): string {
  if (event.eventType === 'handover') {
    const owner = event.newOwner ?? event.agentName
    return owner
      ? t('chatWorkspace.events.handoverTo', { owner })
      : t('chatWorkspace.events.handover')
  }

  const detail = event.providerEventType
  return detail
    ? t('chatWorkspace.events.withDetail', {
        event: t(`chatWorkspace.events.types.${event.eventType}`),
        detail,
      })
    : t(`chatWorkspace.events.types.${event.eventType}`)
}

function messageStatus(status: string | null) {
  if (status === 'played') return 'played' as const
  if (status === 'read') return 'read' as const
  if (status === 'delivered') return 'delivered' as const
  if (status === 'sent') return 'sent' as const
  if (status === 'failed' || status === 'deleted') return 'error' as const
  return undefined
}

function formatChatTime(value: string, locale: string): string {
  const date = new Date(value)
  const now = new Date()
  const options: Intl.DateTimeFormatOptions =
    date.toDateString() === now.toDateString()
      ? { hour: '2-digit', minute: '2-digit' }
      : { day: '2-digit', month: 'short' }
  return new Intl.DateTimeFormat(locale, options).format(date)
}

function formatTimelineTime(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function getRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const record = asRecord(item)
        return record ? [record] : []
      })
    : []
}

function getString(
  value: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const candidate = value?.[key]
  return typeof candidate === 'string' ? candidate : undefined
}

function getNumber(
  value: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  const candidate = value?.[key]
  return typeof candidate === 'number' && Number.isFinite(candidate)
    ? candidate
    : undefined
}

function safeHttpUrl(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.toString()
      : undefined
  } catch {
    return undefined
  }
}

function mergeUnique<Item>(
  first: readonly Item[],
  second: readonly Item[],
  key: (item: Item) => string,
): Item[] {
  const seen = new Set<string>()
  return [...first, ...second].filter((item) => {
    const itemKey = key(item)
    if (seen.has(itemKey)) return false
    seen.add(itemKey)
    return true
  })
}

function mergeSelectedChat(
  chats: readonly ChatSummary[],
  selected: ChatSummary | undefined,
): ChatSummary[] {
  if (!selected) return [...chats]
  const existingIndex = chats.findIndex((chat) => chat.id === selected.id)
  if (existingIndex < 0) return [selected, ...chats]
  return chats.map((chat, index) => (index === existingIndex ? selected : chat))
}

function reconcileChatPage(
  current: readonly ChatSummary[],
  incomingPage: readonly ChatSummary[],
): ChatSummary[] {
  const incomingIds = new Set(incomingPage.map((chat) => chat.id))
  return [
    ...current.filter((chat) => !incomingIds.has(chat.id)),
    ...incomingPage,
  ]
}

function parseChatRouteId(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function timelineKey(item: ApiTimelineItem): string {
  return `${item.itemType}:${item.id}`
}

async function readApiError(
  response: Response,
  fallback: string,
): Promise<string> {
  const body: unknown = await response.json().catch(() => undefined)
  const record = asRecord(body)
  if (record && typeof record.message === 'string') return record.message
  return fallback
}

function getErrorMessage(reason: unknown, fallback: string): string {
  return reason instanceof Error ? reason.message : fallback
}

function useCursorPrefetch(
  viewportRef: RefObject<HTMLElement | null>,
  sentinelRef: RefObject<HTMLElement | null>,
  cursor: string | null,
  loadNextPage: () => void,
  rootMargin: string,
) {
  const loadNextPageRef = useRef(loadNextPage)

  useEffect(() => {
    loadNextPageRef.current = loadNextPage
  }, [loadNextPage])

  useEffect(() => {
    const viewport = viewportRef.current
    const sentinel = sentinelRef.current
    if (!cursor || !viewport || !sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadNextPageRef.current()
        }
      },
      { root: viewport, rootMargin },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [cursor, rootMargin, sentinelRef, viewportRef])
}
