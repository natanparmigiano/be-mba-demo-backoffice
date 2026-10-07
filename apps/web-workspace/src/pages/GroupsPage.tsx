import type { InferResponseType } from 'hono/client'
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  RefreshCw,
  SearchX,
  Users,
} from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { apiClient } from '../api'
import { authClient } from '../auth/auth-client'
import {
  Button,
  cn,
  Dialog,
  EmptyState,
  InlineFeedback,
  PageHeader,
  SearchBox,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@mba-desk/ui'

type GroupsResponse = InferResponseType<typeof apiClient.api.groups.$get, 200>
type GroupSummary = GroupsResponse['groups'][number]
type GroupResponse = InferResponseType<
  (typeof apiClient.api.groups)[':id']['$get'],
  200
>
type GroupDetail = GroupResponse['group']
type ChannelsResponse = InferResponseType<
  typeof apiClient.api.channels.$get,
  200
>
type ChannelOption = Pick<
  ChannelsResponse['channels'][number],
  'id' | 'name' | 'waPhoneNumber'
>

interface GroupQuery {
  search: string
  channelId: string
  cursor?: string
  previousCursors: Array<string | undefined>
}

const PAGE_SIZE = 20

export function GroupsPage() {
  const { t, i18n } = useTranslation()
  const activeOrganizationQuery = authClient.useActiveOrganization()
  const activeOrganizationId = activeOrganizationQuery.data?.id
  const [groups, setGroups] = useState<GroupSummary[]>([])
  const [channels, setChannels] = useState<ChannelOption[]>([])
  const [searchInput, setSearchInput] = useState('')
  const [query, setQuery] = useState<GroupQuery>({
    search: '',
    channelId: '',
    previousCursors: [],
  })
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedGroup, setSelectedGroup] = useState<GroupSummary | null>(null)
  const [groupDetail, setGroupDetail] = useState<GroupDetail | null>(null)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const detailRequestId = useRef(0)

  useEffect(() => {
    document.title = `${t('groups.title')} · ${t('design.brand')}`
    document
      .querySelector<HTMLMetaElement>('meta[name="description"]')
      ?.setAttribute('content', t('groups.metaDescription'))
  }, [t])

  useEffect(() => {
    if (!activeOrganizationId) {
      setChannels([])
      return
    }

    let ignore = false
    void (async () => {
      try {
        const response = await apiClient.api.channels.$get()
        if (!response.ok) {
          throw new Error(
            await readApiError(response, t('groups.operationFailed')),
          )
        }
        const result = await response.json()
        if (!ignore) {
          setChannels(
            result.channels.map(({ id, name, waPhoneNumber }) => ({
              id,
              name,
              waPhoneNumber,
            })),
          )
        }
      } catch (reason) {
        if (!ignore) {
          setError(getErrorMessage(reason, t('groups.operationFailed')))
        }
      }
    })()

    return () => {
      ignore = true
    }
  }, [activeOrganizationId, t])

  useEffect(() => {
    if (!activeOrganizationId) {
      setGroups([])
      setNextCursor(null)
      setIsLoading(false)
      return
    }

    let ignore = false
    setIsLoading(true)
    setError(null)

    void (async () => {
      try {
        const response = await apiClient.api.groups.$get({
          query: {
            limit: String(PAGE_SIZE),
            ...(query.search ? { search: query.search } : {}),
            ...(query.channelId ? { channelId: query.channelId } : {}),
            ...(query.cursor ? { cursor: query.cursor } : {}),
          },
        })
        if (!response.ok) {
          throw new Error(
            await readApiError(response, t('groups.operationFailed')),
          )
        }
        const result = await response.json()
        if (!ignore) {
          setGroups(result.groups)
          setNextCursor(result.nextCursor)
        }
      } catch (reason) {
        if (!ignore) {
          setGroups([])
          setNextCursor(null)
          setError(getErrorMessage(reason, t('groups.operationFailed')))
        }
      } finally {
        if (!ignore) setIsLoading(false)
      }
    })()

    return () => {
      ignore = true
    }
  }, [activeOrganizationId, query, refreshVersion, t])

  const applySearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setQuery((current) => ({
      search: searchInput.trim(),
      channelId: current.channelId,
      previousCursors: [],
    }))
  }

  const selectChannel = (channelId: string) => {
    setQuery((current) => ({
      search: current.search,
      channelId,
      previousCursors: [],
    }))
  }

  const clearFilters = () => {
    setSearchInput('')
    setQuery({ search: '', channelId: '', previousCursors: [] })
  }

  const nextPage = () => {
    if (!nextCursor) return
    setQuery((current) => ({
      ...current,
      cursor: nextCursor,
      previousCursors: [...current.previousCursors, current.cursor],
    }))
  }

  const previousPage = () => {
    setQuery((current) => {
      if (current.previousCursors.length === 0) return current
      const previousCursors = current.previousCursors.slice(0, -1)
      return {
        ...current,
        cursor: current.previousCursors.at(-1),
        previousCursors,
      }
    })
  }

  const openGroup = async (group: GroupSummary) => {
    const requestId = ++detailRequestId.current
    setSelectedGroup(group)
    setGroupDetail(null)
    setDetailError(null)
    setIsLoadingDetail(true)

    try {
      const response = await apiClient.api.groups[':id'].$get({
        param: { id: String(group.id) },
      })
      if (!response.ok) {
        throw new Error(
          await readApiError(response, t('groups.detailLoadFailed')),
        )
      }
      const result = await response.json()
      if (detailRequestId.current === requestId) {
        setGroupDetail(result.group)
      }
    } catch (reason) {
      if (detailRequestId.current === requestId) {
        setDetailError(getErrorMessage(reason, t('groups.detailLoadFailed')))
      }
    } finally {
      if (detailRequestId.current === requestId) setIsLoadingDetail(false)
    }
  }

  const closeGroup = () => {
    detailRequestId.current += 1
    setSelectedGroup(null)
    setGroupDetail(null)
    setDetailError(null)
  }

  const hasFilters = Boolean(query.search || query.channelId)
  const page = query.previousCursors.length + 1

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow={t('groups.eyebrow')}
        title={t('groups.title')}
        description={t('groups.description')}
        actions={
          <Button
            variant="outline"
            disabled={isLoading}
            onClick={() => setRefreshVersion((version) => version + 1)}
          >
            <RefreshCw
              className={cn('size-4', isLoading && 'animate-spin')}
              aria-hidden
            />
            {t('groups.refresh')}
          </Button>
        }
      />

      {error && <InlineFeedback tone="error">{error}</InlineFeedback>}

      <section className="grid gap-4 rounded-2xl border bg-card p-5 sm:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="font-bold">{t('groups.directory')}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {t('groups.pageSummary', { count: groups.length, page })}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <form className="flex min-w-64 gap-2" onSubmit={applySearch}>
              <SearchBox
                className="min-w-0 flex-1"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder={t('groups.searchPlaceholder')}
                aria-label={t('groups.searchLabel')}
              />
              <Button type="submit" variant="outline">
                {t('groups.search')}
              </Button>
            </form>
            <Select
              className="min-w-48"
              value={query.channelId}
              onChange={(event) => selectChannel(event.target.value)}
              aria-label={t('groups.channelFilter')}
            >
              <option value="">{t('groups.allChannels')}</option>
              {channels.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.name} — {channel.waPhoneNumber}
                </option>
              ))}
            </Select>
            {hasFilters && (
              <Button variant="ghost" onClick={clearFilters}>
                {t('groups.clearFilters')}
              </Button>
            )}
          </div>
        </div>

        {isLoading && groups.length === 0 ? (
          <div className="grid gap-2" role="status">
            <span className="sr-only">{t('groups.loading')}</span>
            {[0, 1, 2, 3, 4].map((row) => (
              <div
                key={row}
                className="h-16 animate-pulse rounded-lg bg-muted"
              />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <EmptyState
            icon={<SearchX className="size-5" aria-hidden />}
            title={hasFilters ? t('groups.noMatches') : t('groups.noGroups')}
            description={
              hasFilters
                ? t('groups.noMatchesDescription')
                : t('groups.noGroupsDescription')
            }
            action={
              hasFilters ? (
                <Button size="sm" variant="outline" onClick={clearFilters}>
                  {t('groups.clearFilters')}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('groups.group')}</TableHead>
                <TableHead>{t('groups.providerGroupId')}</TableHead>
                <TableHead>{t('groups.channel')}</TableHead>
                <TableHead>{t('groups.lastEvent')}</TableHead>
                <TableHead>{t('groups.updated')}</TableHead>
                <TableHead className="text-right">
                  {t('groups.actions')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((group) => {
                const name = group.subject ?? t('groups.unnamed')
                return (
                  <TableRow key={group.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                          <Users className="size-4" aria-hidden />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{name}</p>
                          <p className="max-w-64 truncate text-xs text-muted-foreground">
                            {group.description ?? t('groups.noDescription')}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs">{group.providerGroupId}</code>
                    </TableCell>
                    <TableCell>
                      <p>{group.channel.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {group.channel.waPhoneNumber} ·{' '}
                        {t('groups.channelNumber', { id: group.channel.id })}
                      </p>
                    </TableCell>
                    <TableCell>
                      <p>{formatProviderValue(group.lastEventType, t)}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatProviderValue(group.lastWebhookField, t)}
                      </p>
                    </TableCell>
                    <TableCell>
                      {formatDate(group.updatedAt, i18n.language)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <Button
                          className="size-8"
                          size="icon"
                          variant="ghost"
                          aria-label={t('groups.viewNamed', { name })}
                          onClick={() => void openGroup(group)}
                        >
                          <Eye className="size-4" aria-hidden />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}

        {(groups.length > 0 || page > 1) && (
          <div className="flex items-center justify-between gap-3 border-t pt-4">
            <p className="text-sm text-muted-foreground">
              {t('groups.page', { page })}
            </p>
            <nav
              className="flex items-center gap-1"
              aria-label={t('groups.pagination')}
            >
              <Button
                className="size-9"
                size="icon"
                variant="outline"
                disabled={isLoading || query.previousCursors.length === 0}
                aria-label={t('groups.previousPage')}
                onClick={previousPage}
              >
                <ChevronLeft className="size-4" aria-hidden />
              </Button>
              <Button
                className="size-9"
                size="icon"
                variant="outline"
                disabled={isLoading || !nextCursor}
                aria-label={t('groups.nextPage')}
                onClick={nextPage}
              >
                <ChevronRight className="size-4" aria-hidden />
              </Button>
            </nav>
          </div>
        )}
      </section>

      <GroupDetailsDialog
        group={selectedGroup}
        detail={groupDetail}
        isLoading={isLoadingDetail}
        error={detailError}
        locale={i18n.language}
        onClose={closeGroup}
      />
    </div>
  )
}

function GroupDetailsDialog({
  group,
  detail,
  isLoading,
  error,
  locale,
  onClose,
}: {
  group: GroupSummary | null
  detail: GroupDetail | null
  isLoading: boolean
  error: string | null
  locale: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const name = group?.subject ?? t('groups.unnamed')

  return (
    <Dialog
      size="xl"
      open={Boolean(group)}
      onOpenChange={(open) => !open && onClose()}
      title={name}
      description={t('groups.detailDescription')}
      icon={
        <span
          className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"
          aria-hidden
        >
          <Users className="size-5" />
        </span>
      }
    >
      <div className="grid w-full gap-5">
        {isLoading && (
          <div className="grid gap-3" role="status">
            <span className="sr-only">{t('groups.loadingDetail')}</span>
            <div className="h-28 animate-pulse rounded-xl bg-muted" />
            <div className="h-44 animate-pulse rounded-xl bg-muted" />
          </div>
        )}

        {error && (
          <p
            className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive"
            role="alert"
          >
            {error}
          </p>
        )}

        {detail && (
          <>
            <dl className="grid gap-4 rounded-xl border bg-muted/20 p-4 sm:grid-cols-2 lg:grid-cols-3">
              <GroupField label={t('groups.subject')} value={detail.subject} />
              <GroupField
                label={t('groups.providerGroupId')}
                value={detail.providerGroupId}
                mono
              />
              <GroupField
                label={t('groups.channel')}
                value={`${detail.channel.name} · ${detail.channel.waPhoneNumber} · #${detail.channel.id}`}
              />
              <GroupField
                label={t('groups.descriptionField')}
                value={detail.description}
              />
              <GroupField
                label={t('groups.inviteLink')}
                value={detail.inviteLink}
                mono
              />
              <GroupField
                label={t('groups.joinApprovalMode')}
                value={formatProviderValue(detail.joinApprovalMode, t)}
              />
              <GroupField
                label={t('groups.lastWebhookField')}
                value={formatProviderValue(detail.lastWebhookField, t)}
              />
              <GroupField
                label={t('groups.lastEventType')}
                value={formatProviderValue(detail.lastEventType, t)}
              />
              <GroupField
                label={t('groups.lastEventAt')}
                value={formatOptionalDate(detail.lastEventAt, locale, t)}
              />
              <GroupField
                label={t('groups.firstSeen')}
                value={formatDate(detail.firstSeenAt, locale)}
              />
              <GroupField
                label={t('groups.updated')}
                value={formatDate(detail.updatedAt, locale)}
              />
            </dl>

            <section>
              <h3 className="text-sm font-bold">{t('groups.rawData')}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('groups.rawDataDescription')}
              </p>
              <pre className="mt-3 max-h-80 overflow-auto rounded-xl border bg-background p-4 font-mono text-xs leading-5">
                {detail.rawGroup
                  ? JSON.stringify(detail.rawGroup, null, 2)
                  : t('groups.notAvailable')}
              </pre>
            </section>
          </>
        )}

        <div className="flex justify-end border-t pt-4">
          <Button variant="outline" onClick={onClose}>
            {t('groups.close')}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

function GroupField({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string | null
  mono?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd
        className={cn('mt-1 break-words text-sm', mono && 'font-mono text-xs')}
      >
        {value ?? t('groups.notAvailable')}
      </dd>
    </div>
  )
}

function formatProviderValue(
  value: string | null,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  return value ? value.replaceAll('_', ' ') : t('groups.notAvailable')
}

function formatOptionalDate(
  value: string | null,
  locale: string,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  return value ? formatDate(value, locale) : t('groups.notAvailable')
}

function formatDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

async function readApiError(
  response: Response,
  fallback: string,
): Promise<string> {
  const body: unknown = await response.json().catch(() => undefined)
  return isRecord(body) && typeof body.message === 'string'
    ? body.message
    : `${fallback} (${response.status}).`
}

function getErrorMessage(reason: unknown, fallback: string): string {
  return reason instanceof Error ? reason.message : fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
