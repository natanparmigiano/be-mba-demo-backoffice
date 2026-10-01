import type { InferResponseType } from 'hono/client'
import {
  ChevronLeft,
  ChevronRight,
  ContactRound,
  Eye,
  RefreshCw,
  SearchX,
} from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { apiClient } from '../api'
import { authClient } from '../auth/auth-client'
import {
  Avatar,
  Button,
  cn,
  Dialog,
  EmptyState,
  SearchBox,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui'

type ContactsResponse = InferResponseType<
  typeof apiClient.api.contacts.$get,
  200
>
type ContactSummary = ContactsResponse['contacts'][number]
type ContactResponse = InferResponseType<
  (typeof apiClient.api.contacts)[':id']['$get'],
  200
>
type ContactDetail = ContactResponse['contact']
type ChannelsResponse = InferResponseType<
  typeof apiClient.api.channels.$get,
  200
>
type ChannelOption = Pick<
  ChannelsResponse['channels'][number],
  'id' | 'waPhoneNumber'
>

interface ContactQuery {
  search: string
  channelId: string
  cursor?: string
  previousCursors: Array<string | undefined>
}

const PAGE_SIZE = 20

export function ContactsPage() {
  const { t, i18n } = useTranslation()
  const activeOrganizationQuery = authClient.useActiveOrganization()
  const activeOrganizationId = activeOrganizationQuery.data?.id
  const [contacts, setContacts] = useState<ContactSummary[]>([])
  const [channels, setChannels] = useState<ChannelOption[]>([])
  const [searchInput, setSearchInput] = useState('')
  const [query, setQuery] = useState<ContactQuery>({
    search: '',
    channelId: '',
    previousCursors: [],
  })
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedContact, setSelectedContact] = useState<ContactSummary | null>(
    null,
  )
  const [contactDetail, setContactDetail] = useState<ContactDetail | null>(null)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const detailRequestId = useRef(0)

  useEffect(() => {
    document.title = `${t('contacts.title')} · ${t('design.brand')}`
    document
      .querySelector<HTMLMetaElement>('meta[name="description"]')
      ?.setAttribute('content', t('contacts.metaDescription'))
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
            await readApiError(response, t('contacts.operationFailed')),
          )
        }
        const result = await response.json()
        if (!ignore) {
          setChannels(
            result.channels.map(({ id, waPhoneNumber }) => ({
              id,
              waPhoneNumber,
            })),
          )
        }
      } catch (reason) {
        if (!ignore) {
          setError(getErrorMessage(reason, t('contacts.operationFailed')))
        }
      }
    })()

    return () => {
      ignore = true
    }
  }, [activeOrganizationId, t])

  useEffect(() => {
    if (!activeOrganizationId) {
      setContacts([])
      setNextCursor(null)
      setIsLoading(false)
      return
    }

    let ignore = false
    setIsLoading(true)
    setError(null)

    void (async () => {
      try {
        const response = await apiClient.api.contacts.$get({
          query: {
            limit: String(PAGE_SIZE),
            ...(query.search ? { search: query.search } : {}),
            ...(query.channelId ? { channelId: query.channelId } : {}),
            ...(query.cursor ? { cursor: query.cursor } : {}),
          },
        })
        if (!response.ok) {
          throw new Error(
            await readApiError(response, t('contacts.operationFailed')),
          )
        }
        const result = await response.json()
        if (!ignore) {
          setContacts(result.contacts)
          setNextCursor(result.nextCursor)
        }
      } catch (reason) {
        if (!ignore) {
          setContacts([])
          setNextCursor(null)
          setError(getErrorMessage(reason, t('contacts.operationFailed')))
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

  const openContact = async (contact: ContactSummary) => {
    const requestId = ++detailRequestId.current
    setSelectedContact(contact)
    setContactDetail(null)
    setDetailError(null)
    setIsLoadingDetail(true)

    try {
      const response = await apiClient.api.contacts[':id'].$get({
        param: { id: String(contact.id) },
      })
      if (!response.ok) {
        throw new Error(
          await readApiError(response, t('contacts.detailLoadFailed')),
        )
      }
      const result = await response.json()
      if (detailRequestId.current === requestId) {
        setContactDetail(result.contact)
      }
    } catch (reason) {
      if (detailRequestId.current === requestId) {
        setDetailError(getErrorMessage(reason, t('contacts.detailLoadFailed')))
      }
    } finally {
      if (detailRequestId.current === requestId) setIsLoadingDetail(false)
    }
  }

  const closeContact = () => {
    detailRequestId.current += 1
    setSelectedContact(null)
    setContactDetail(null)
    setDetailError(null)
  }

  const hasFilters = Boolean(query.search || query.channelId)
  const page = query.previousCursors.length + 1

  return (
    <div className="grid gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold tracking-[0.12em] text-primary uppercase">
            {t('contacts.eyebrow')}
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight">
            {t('contacts.title')}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {t('contacts.description')}
          </p>
        </div>
        <Button
          className="self-start sm:self-auto"
          variant="outline"
          disabled={isLoading}
          onClick={() => setRefreshVersion((version) => version + 1)}
        >
          <RefreshCw
            className={cn('size-4', isLoading && 'animate-spin')}
            aria-hidden
          />
          {t('contacts.refresh')}
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

      <section className="grid gap-4 rounded-2xl border bg-card p-5 sm:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="font-bold">{t('contacts.directory')}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {t('contacts.pageSummary', {
                count: contacts.length,
                page,
              })}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <form className="flex min-w-64 gap-2" onSubmit={applySearch}>
              <SearchBox
                className="min-w-0 flex-1"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder={t('contacts.searchPlaceholder')}
                aria-label={t('contacts.searchLabel')}
              />
              <Button type="submit" variant="outline">
                {t('contacts.search')}
              </Button>
            </form>
            <Select
              className="min-w-48"
              value={query.channelId}
              onChange={(event) => selectChannel(event.target.value)}
              aria-label={t('contacts.channelFilter')}
            >
              <option value="">{t('contacts.allChannels')}</option>
              {channels.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.waPhoneNumber}
                </option>
              ))}
            </Select>
            {hasFilters && (
              <Button variant="ghost" onClick={clearFilters}>
                {t('contacts.clearFilters')}
              </Button>
            )}
          </div>
        </div>

        {isLoading && contacts.length === 0 ? (
          <div className="grid gap-2" role="status">
            <span className="sr-only">{t('contacts.loading')}</span>
            {[0, 1, 2, 3, 4].map((row) => (
              <div
                key={row}
                className="h-16 animate-pulse rounded-lg bg-muted"
              />
            ))}
          </div>
        ) : contacts.length === 0 ? (
          <EmptyState
            icon={<SearchX className="size-5" aria-hidden />}
            title={
              hasFilters ? t('contacts.noMatches') : t('contacts.noContacts')
            }
            description={
              hasFilters
                ? t('contacts.noMatchesDescription')
                : t('contacts.noContactsDescription')
            }
            action={
              hasFilters ? (
                <Button size="sm" variant="outline" onClick={clearFilters}>
                  {t('contacts.clearFilters')}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('contacts.contact')}</TableHead>
                <TableHead>{t('contacts.identifiers')}</TableHead>
                <TableHead>{t('contacts.channel')}</TableHead>
                <TableHead>{t('contacts.firstSeen')}</TableHead>
                <TableHead>{t('contacts.lastSeen')}</TableHead>
                <TableHead className="text-right">
                  {t('contacts.actions')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.map((contact) => {
                const name = getContactName(contact, t('contacts.unknown'))
                return (
                  <TableRow key={contact.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar name={name} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {contact.profileUsername
                              ? `@${contact.profileUsername}`
                              : t('contacts.noUsername')}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="font-mono text-xs">
                        {contact.waId ?? t('contacts.notAvailable')}
                      </p>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        {contact.userId ?? t('contacts.noUserId')}
                      </p>
                    </TableCell>
                    <TableCell>
                      <p>{contact.channel.waPhoneNumber}</p>
                      <p className="text-xs text-muted-foreground">
                        {t('contacts.channelNumber', {
                          id: contact.channel.id,
                        })}
                      </p>
                    </TableCell>
                    <TableCell>
                      {formatDate(contact.firstSeenAt, i18n.language)}
                    </TableCell>
                    <TableCell>
                      {formatDate(contact.lastSeenAt, i18n.language)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <Button
                          className="size-8"
                          size="icon"
                          variant="ghost"
                          aria-label={t('contacts.viewNamed', { name })}
                          onClick={() => void openContact(contact)}
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

        {(contacts.length > 0 || page > 1) && (
          <div className="flex items-center justify-between gap-3 border-t pt-4">
            <p className="text-sm text-muted-foreground">
              {t('contacts.page', { page })}
            </p>
            <nav
              className="flex items-center gap-1"
              aria-label={t('contacts.pagination')}
            >
              <Button
                className="size-9"
                size="icon"
                variant="outline"
                disabled={isLoading || query.previousCursors.length === 0}
                aria-label={t('contacts.previousPage')}
                onClick={previousPage}
              >
                <ChevronLeft className="size-4" aria-hidden />
              </Button>
              <Button
                className="size-9"
                size="icon"
                variant="outline"
                disabled={isLoading || !nextCursor}
                aria-label={t('contacts.nextPage')}
                onClick={nextPage}
              >
                <ChevronRight className="size-4" aria-hidden />
              </Button>
            </nav>
          </div>
        )}
      </section>

      <ContactDetailsDialog
        contact={selectedContact}
        detail={contactDetail}
        isLoading={isLoadingDetail}
        error={detailError}
        locale={i18n.language}
        onClose={closeContact}
      />
    </div>
  )
}

function ContactDetailsDialog({
  contact,
  detail,
  isLoading,
  error,
  locale,
  onClose,
}: {
  contact: ContactSummary | null
  detail: ContactDetail | null
  isLoading: boolean
  error: string | null
  locale: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const name = contact
    ? getContactName(contact, t('contacts.unknown'))
    : t('contacts.unknown')

  return (
    <Dialog
      size="xl"
      open={Boolean(contact)}
      onOpenChange={(open) => !open && onClose()}
      title={name}
      description={t('contacts.detailDescription')}
      icon={
        <span
          className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"
          aria-hidden
        >
          <ContactRound className="size-5" />
        </span>
      }
    >
      <div className="grid w-full gap-5">
        {isLoading && (
          <div className="grid gap-3" role="status">
            <span className="sr-only">{t('contacts.loadingDetail')}</span>
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
              <ContactField
                label={t('contacts.profileName')}
                value={detail.profileName}
              />
              <ContactField
                label={t('contacts.username')}
                value={detail.profileUsername}
              />
              <ContactField
                label={t('contacts.whatsAppId')}
                value={detail.waId}
                mono
              />
              <ContactField
                label={t('contacts.userId')}
                value={detail.userId}
                mono
              />
              <ContactField
                label={t('contacts.parentUserId')}
                value={detail.parentUserId}
                mono
              />
              <ContactField
                label={t('contacts.input')}
                value={detail.input}
                mono
              />
              <ContactField
                label={t('contacts.identityKeyHash')}
                value={detail.identityKeyHash}
                mono
              />
              <ContactField
                label={t('contacts.channel')}
                value={`${detail.channel.waPhoneNumber} · #${detail.channel.id}`}
              />
              <ContactField
                label={t('contacts.firstSeen')}
                value={formatDate(detail.firstSeenAt, locale)}
              />
              <ContactField
                label={t('contacts.lastSeen')}
                value={formatDate(detail.lastSeenAt, locale)}
              />
            </dl>

            <section>
              <h3 className="text-sm font-bold">{t('contacts.rawData')}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('contacts.rawDataDescription')}
              </p>
              <pre className="mt-3 max-h-80 overflow-auto rounded-xl border bg-background p-4 font-mono text-xs leading-5">
                {JSON.stringify(detail.rawContact, null, 2)}
              </pre>
            </section>
          </>
        )}

        <div className="flex justify-end border-t pt-4">
          <Button variant="outline" onClick={onClose}>
            {t('contacts.close')}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

function ContactField({
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
        {value ?? t('contacts.notAvailable')}
      </dd>
    </div>
  )
}

function getContactName(contact: ContactSummary, fallback: string): string {
  return (
    contact.profileName ??
    contact.profileUsername ??
    contact.waId ??
    contact.userId ??
    fallback
  )
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
