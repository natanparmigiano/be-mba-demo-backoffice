import {
  Ban,
  Building2,
  ChevronRight,
  KeyRound,
  LogOut,
  Pencil,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react'
import type { TFunction } from 'i18next'
import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
  type SubmitEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { authClient } from '../auth/auth-client'
import { useAuth } from '../auth/AuthProvider'
import { apiClient } from '../api'
import {
  Avatar,
  Button,
  Dialog,
  EmptyState,
  Input,
  Pill,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui'

interface AdminUser {
  id: string
  name: string
  email: string
  role?: string | null
  banned?: boolean | null
  banReason?: string | null
}

interface AdminOrganizationSummary {
  id: string
  name: string
  slug: string
  createdAt: string
  memberCount: number
  currentUserRole: string | null
}

interface AdminOrganizationDetails extends AdminOrganizationSummary {
  members: Array<{
    id: string
    role: string
    userId: string
    user: {
      email: string
      name: string
    }
  }>
}

export function AdminPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { session, user: currentUser, refetch } = useAuth()
  const organizationMembershipsQuery = authClient.useListOrganizations()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [search, setSearch] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'admin' | 'user'>('user')
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [organizations, setOrganizations] = useState<
    AdminOrganizationSummary[]
  >([])
  const [organizationSearch, setOrganizationSearch] = useState('')
  const [organizationQuery, setOrganizationQuery] = useState('')
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<
    string | null
  >(null)
  const [selectedOrganization, setSelectedOrganization] =
    useState<AdminOrganizationDetails | null>(null)
  const [isLoadingOrganizations, setIsLoadingOrganizations] = useState(false)
  const [isLoadingOrganization, setIsLoadingOrganization] = useState(false)
  const [isJoiningOrganization, setIsJoiningOrganization] = useState(false)
  const [isDeletingOrganization, setIsDeletingOrganization] = useState(false)
  const [isDeleteOrganizationOpen, setIsDeleteOrganizationOpen] =
    useState(false)
  const [organizationError, setOrganizationError] = useState<string | null>(
    null,
  )

  useEffect(() => {
    document.title = `${t('admin.title')} · ${t('design.brand')}`
    document
      .querySelector<HTMLMetaElement>('meta[name="description"]')
      ?.setAttribute('content', t('admin.metaDescription'))
  }, [t])

  const loadUsers = useCallback(async () => {
    const result = await authClient.admin.listUsers({
      query: {
        limit: 100,
        sortBy: 'name',
        sortDirection: 'asc',
        ...(search.trim()
          ? {
              searchValue: search.trim(),
              searchField: 'name' as const,
              searchOperator: 'contains' as const,
            }
          : {}),
      },
    })
    if (result.error) throw new Error(result.error.message)
    setUsers(result.data?.users ?? [])
  }, [search])

  useEffect(() => {
    void loadUsers().catch((reason: unknown) => {
      setError(getErrorMessage(reason, t('admin.operationFailed')))
    })
  }, [loadUsers, t])

  const loadOrganizations = useCallback(async () => {
    setIsLoadingOrganizations(true)
    setOrganizationError(null)
    try {
      const response = await apiClient.api.admin.organizations.$get({
        query: { search: organizationQuery },
      })
      if (!response.ok)
        throw new Error(
          await getResponseError(response, t('admin.requestFailed')),
        )
      setOrganizations(await response.json())
    } catch (reason) {
      setOrganizationError(getErrorMessage(reason, t('admin.operationFailed')))
    } finally {
      setIsLoadingOrganizations(false)
    }
  }, [organizationQuery, t])

  useEffect(() => {
    void loadOrganizations()
  }, [loadOrganizations])

  const loadOrganization = async (organizationId: string) => {
    setSelectedOrganizationId(organizationId)
    setSelectedOrganization(null)
    setOrganizationError(null)
    setIsLoadingOrganization(true)
    try {
      const response = await apiClient.api.admin.organizations[':id'].$get({
        param: { id: organizationId },
      })
      if (!response.ok)
        throw new Error(
          await getResponseError(response, t('admin.requestFailed')),
        )
      setSelectedOrganization(await response.json())
    } catch (reason) {
      setOrganizationError(getErrorMessage(reason, t('admin.operationFailed')))
    } finally {
      setIsLoadingOrganization(false)
    }
  }

  const addSelfAsOrganizationAdmin = async () => {
    if (!selectedOrganizationId) return
    setIsJoiningOrganization(true)
    setOrganizationError(null)
    try {
      const response = await apiClient.api.admin.organizations[
        ':id'
      ].members.self.$post({
        param: { id: selectedOrganizationId },
      })
      if (!response.ok)
        throw new Error(
          await getResponseError(response, t('admin.requestFailed')),
        )
      await Promise.all([
        loadOrganizations(),
        loadOrganization(selectedOrganizationId),
        organizationMembershipsQuery.refetch(),
      ])
      setNotice(t('admin.nowOrganizationAdmin'))
    } catch (reason) {
      setOrganizationError(getErrorMessage(reason, t('admin.operationFailed')))
    } finally {
      setIsJoiningOrganization(false)
    }
  }

  const manageSelectedOrganization = async () => {
    if (!selectedOrganizationId) return
    setIsJoiningOrganization(true)
    setOrganizationError(null)
    try {
      const result = await authClient.organization.setActive({
        organizationId: selectedOrganizationId,
      })
      if (result.error) throw new Error(result.error.message)
      await refetch()
      void navigate('/organization')
    } catch (reason) {
      setOrganizationError(getErrorMessage(reason, t('admin.operationFailed')))
    } finally {
      setIsJoiningOrganization(false)
    }
  }

  const deleteSelectedOrganization = async () => {
    if (!selectedOrganizationId) return
    setIsDeletingOrganization(true)
    setOrganizationError(null)

    try {
      const response = await apiClient.api.admin.organizations[':id'].$delete({
        param: { id: selectedOrganizationId },
      })
      if (!response.ok)
        throw new Error(
          await getResponseError(response, t('admin.requestFailed')),
        )

      if (session?.session.activeOrganizationId === selectedOrganizationId) {
        const activeResult = await authClient.organization.setActive({
          organizationId: null,
        })
        if (activeResult.error) throw new Error(activeResult.error.message)
      }

      await Promise.all([
        loadOrganizations(),
        organizationMembershipsQuery.refetch(),
        refetch(),
      ])
      setSelectedOrganizationId(null)
      setSelectedOrganization(null)
      setIsDeleteOrganizationOpen(false)
      setNotice(t('admin.organizationDeleted'))
    } catch (reason) {
      setOrganizationError(getErrorMessage(reason, t('admin.operationFailed')))
    } finally {
      setIsDeletingOrganization(false)
    }
  }

  const run = async (action: () => Promise<void>, success: string) => {
    setIsBusy(true)
    setError(null)
    setNotice(null)
    try {
      await action()
      await loadUsers()
      setNotice(success)
    } catch (reason) {
      setError(getErrorMessage(reason, t('admin.operationFailed')))
    } finally {
      setIsBusy(false)
    }
  }

  const createUser = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    void run(async () => {
      const result = await authClient.admin.createUser({
        name: name.trim(),
        email: email.trim(),
        password,
        role,
      })
      if (result.error) throw new Error(result.error.message)
      setName('')
      setEmail('')
      setPassword('')
      setRole('user')
      setIsCreateUserOpen(false)
    }, t('admin.userCreated'))
  }

  return (
    <div className="grid gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold tracking-[0.12em] text-primary uppercase">
            {t('admin.eyebrow')}
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight">
            {t('admin.title')}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('admin.description')}
          </p>
        </div>
        <Button
          className="self-start sm:self-auto"
          onClick={() => {
            setError(null)
            setIsCreateUserOpen(true)
          }}
        >
          <UserPlus className="size-4" aria-hidden />
          {t('admin.addUser')}
        </Button>
      </header>

      {(error || notice) && (
        <p
          className={`rounded-xl border p-3 text-sm ${
            error
              ? 'border-destructive/30 bg-destructive/10 text-destructive'
              : 'border-success/30 bg-success/10 text-success'
          }`}
          role="status"
        >
          {error ?? notice}
        </p>
      )}

      <section className="grid gap-4 rounded-2xl border bg-card p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-bold">{t('admin.users')}</h2>
            <p className="text-sm text-muted-foreground">
              {t('admin.usersDescription')}
            </p>
          </div>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              void loadUsers()
            }}
          >
            <Input
              aria-label={t('admin.searchUsersLabel')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('admin.searchUsers')}
            />
            <Button
              type="submit"
              variant="outline"
              aria-label={t('admin.search')}
            >
              <Search className="size-4" />
            </Button>
          </form>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('admin.user')}</TableHead>
              <TableHead>{t('admin.role')}</TableHead>
              <TableHead>{t('admin.status')}</TableHead>
              <TableHead className="text-right">{t('admin.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => {
              const isSelf = user.id === currentUser?.id
              return (
                <TableRow key={user.id}>
                  <TableCell>
                    <p className="font-semibold">{user.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {user.email}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Select
                      aria-label={t('admin.applicationRoleFor', {
                        name: user.name,
                      })}
                      value={user.role ?? 'user'}
                      disabled={isBusy || isSelf}
                      onChange={(event) =>
                        void run(async () => {
                          const result = await authClient.admin.setRole({
                            userId: user.id,
                            role: event.target.value as 'admin' | 'user',
                          })
                          if (result.error)
                            throw new Error(result.error.message)
                        }, t('admin.applicationRoleUpdated'))
                      }
                    >
                      <option value="user">{t('admin.roles.user')}</option>
                      <option value="admin">{t('admin.roles.admin')}</option>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        user.banned
                          ? 'bg-destructive/10 text-destructive'
                          : 'bg-success/10 text-success'
                      }`}
                    >
                      {user.banned
                        ? t('admin.statuses.banned')
                        : t('admin.statuses.active')}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isBusy || isSelf || Boolean(user.banned)}
                        onClick={() =>
                          void run(async () => {
                            const result =
                              await authClient.admin.impersonateUser({
                                userId: user.id,
                              })
                            if (result.error)
                              throw new Error(result.error.message)
                            await refetch()
                            void navigate('/', { replace: true })
                          }, t('admin.impersonationStarted'))
                        }
                      >
                        {t('admin.impersonate')}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8"
                        disabled={isBusy}
                        aria-label={t('admin.renameNamed', { name: user.name })}
                        onClick={() => {
                          const nextName = window.prompt(
                            t('admin.userName'),
                            user.name,
                          )
                          if (!nextName?.trim()) return
                          void run(async () => {
                            const result = await authClient.admin.updateUser({
                              userId: user.id,
                              data: { name: nextName.trim() },
                            })
                            if (result.error)
                              throw new Error(result.error.message)
                          }, t('admin.userUpdated'))
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8"
                        disabled={isBusy}
                        aria-label={t('admin.resetPasswordFor', {
                          name: user.name,
                        })}
                        onClick={() => {
                          const newPassword = window.prompt(
                            t('admin.newPasswordFor', { email: user.email }),
                          )
                          if (!newPassword) return
                          void run(async () => {
                            const result =
                              await authClient.admin.setUserPassword({
                                userId: user.id,
                                newPassword,
                              })
                            if (result.error)
                              throw new Error(result.error.message)
                          }, t('admin.passwordUpdated'))
                        }}
                      >
                        <KeyRound className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8"
                        disabled={isBusy || isSelf}
                        aria-label={t('admin.revokeSessionsFor', {
                          name: user.name,
                        })}
                        onClick={() =>
                          void run(async () => {
                            const result =
                              await authClient.admin.revokeUserSessions({
                                userId: user.id,
                              })
                            if (result.error)
                              throw new Error(result.error.message)
                          }, t('admin.sessionsRevoked'))
                        }
                      >
                        <LogOut className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8"
                        disabled={isBusy || isSelf}
                        aria-label={
                          user.banned
                            ? t('admin.unbanNamed', { name: user.name })
                            : t('admin.banNamed', { name: user.name })
                        }
                        onClick={() =>
                          void run(
                            async () => {
                              const result = user.banned
                                ? await authClient.admin.unbanUser({
                                    userId: user.id,
                                  })
                                : await authClient.admin.banUser({
                                    userId: user.id,
                                    banReason: t('admin.banReason'),
                                  })
                              if (result.error)
                                throw new Error(result.error.message)
                            },
                            user.banned
                              ? t('admin.userUnbanned')
                              : t('admin.userBanned'),
                          )
                        }
                      >
                        <Ban className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 text-destructive"
                        disabled={isBusy || isSelf}
                        aria-label={t('admin.removeNamed', { name: user.name })}
                        onClick={() => {
                          if (
                            !window.confirm(
                              t('admin.confirmRemove', { email: user.email }),
                            )
                          )
                            return
                          void run(async () => {
                            const result = await authClient.admin.removeUser({
                              userId: user.id,
                            })
                            if (result.error)
                              throw new Error(result.error.message)
                          }, t('admin.userRemoved'))
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </section>

      <section className="grid gap-4 rounded-2xl border bg-card p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-bold">{t('admin.organizations')}</h2>
            <p className="text-sm text-muted-foreground">
              {t('admin.organizationsDescription')}
            </p>
          </div>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              setOrganizationQuery(organizationSearch.trim())
            }}
          >
            <Input
              aria-label={t('admin.searchOrganizations')}
              value={organizationSearch}
              onChange={(event) => setOrganizationSearch(event.target.value)}
              placeholder={t('admin.searchOrganizations')}
            />
            <Button
              type="submit"
              variant="outline"
              aria-label={t('admin.search')}
            >
              <Search className="size-4" aria-hidden />
            </Button>
          </form>
        </div>

        {organizationError && !selectedOrganizationId && (
          <p
            className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive"
            role="alert"
          >
            {organizationError}
          </p>
        )}

        {isLoadingOrganizations ? (
          <div
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
            role="status"
          >
            <span className="sr-only">{t('admin.loadingOrganizations')}</span>
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="h-24 animate-pulse rounded-xl bg-muted"
              />
            ))}
          </div>
        ) : organizations.length === 0 ? (
          <EmptyState
            icon={<Building2 className="size-5" aria-hidden />}
            title={t('admin.noOrganizations')}
            description={
              organizationQuery
                ? t('admin.noOrganizationsSearchHint')
                : t('admin.noOrganizationsHint')
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {organizations.map((organization) => (
              <button
                key={organization.id}
                type="button"
                className="group flex items-center gap-3 rounded-xl border p-4 text-left transition-colors hover:border-primary/30 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/25"
                onClick={() => void loadOrganization(organization.id)}
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Building2 className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">
                    {organization.name}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {organization.slug} · {organization.memberCount}{' '}
                    {t('admin.memberCount', {
                      count: organization.memberCount,
                    })}
                  </span>
                  <span className="mt-2 block">
                    <Pill
                      tone={
                        organization.currentUserRole ? 'primary' : 'neutral'
                      }
                    >
                      {organization.currentUserRole
                        ? t('admin.yourRole', {
                            role: translateOrganizationRole(
                              organization.currentUserRole,
                              t,
                            ),
                          })
                        : t('admin.notMember')}
                    </Pill>
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </button>
            ))}
          </div>
        )}
      </section>

      <Dialog
        open={isCreateUserOpen}
        onOpenChange={(open) => {
          if (!open && !isBusy) setIsCreateUserOpen(false)
        }}
        title={t('admin.addUser')}
        description={t('admin.addUserDescription')}
        icon={
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <UserPlus className="size-5" aria-hidden />
          </span>
        }
      >
        <form className="grid w-full gap-4" onSubmit={createUser}>
          <Input
            label={t('admin.name')}
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
            required
            disabled={isBusy}
          />
          <Input
            label={t('admin.email')}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            disabled={isBusy}
          />
          <Input
            label={t('admin.temporaryPassword')}
            type="password"
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            disabled={isBusy}
          />
          <Select
            label={t('admin.applicationRole')}
            value={role}
            onChange={(event) =>
              setRole(event.target.value as 'admin' | 'user')
            }
            disabled={isBusy}
          >
            <option value="user">{t('admin.roles.user')}</option>
            <option value="admin">{t('admin.roles.admin')}</option>
          </Select>
          {error && (
            <p
              className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={isBusy}
              onClick={() => {
                setIsCreateUserOpen(false)
                setError(null)
              }}
            >
              {t('admin.cancel')}
            </Button>
            <Button type="submit" isLoading={isBusy}>
              {t('admin.addUser')}
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={selectedOrganizationId !== null && !isDeleteOrganizationOpen}
        onOpenChange={(open) => {
          if (!open && !isJoiningOrganization) {
            setSelectedOrganizationId(null)
            setSelectedOrganization(null)
            setOrganizationError(null)
          }
        }}
        className="max-w-3xl"
        title={selectedOrganization?.name ?? t('admin.organizationDetails')}
        description={
          selectedOrganization
            ? t('admin.organizationDetailsDescription', {
                slug: selectedOrganization.slug,
              })
            : t('admin.loadingOrganizationDetails')
        }
        icon={
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Building2 className="size-5" aria-hidden />
          </span>
        }
      >
        <div className="grid w-full gap-5">
          {isLoadingOrganization ? (
            <div className="grid gap-3" role="status">
              <span className="sr-only">
                {t('admin.loadingOrganizationDetails')}
              </span>
              <div className="h-20 animate-pulse rounded-xl bg-muted" />
              <div className="h-48 animate-pulse rounded-xl bg-muted" />
            </div>
          ) : selectedOrganization ? (
            <>
              <section className="grid gap-3 rounded-xl bg-muted/55 p-4 sm:grid-cols-3">
                <OrganizationDetail label={t('admin.name')}>
                  {selectedOrganization.name}
                </OrganizationDetail>
                <OrganizationDetail label={t('admin.slug')}>
                  {selectedOrganization.slug}
                </OrganizationDetail>
                <OrganizationDetail label={t('admin.yourAccess')}>
                  <Pill
                    tone={
                      selectedOrganization.currentUserRole
                        ? 'primary'
                        : 'neutral'
                    }
                  >
                    {selectedOrganization.currentUserRole
                      ? translateOrganizationRole(
                          selectedOrganization.currentUserRole,
                          t,
                        )
                      : t('admin.notMember')}
                  </Pill>
                </OrganizationDetail>
              </section>

              <section className="grid gap-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold">{t('admin.members')}</h3>
                    <p className="text-sm text-muted-foreground">
                      {t('admin.peopleInOrganization', {
                        count: selectedOrganization.memberCount,
                      })}
                    </p>
                  </div>
                  <Users className="size-5 text-muted-foreground" aria-hidden />
                </div>

                {selectedOrganization.members.length === 0 ? (
                  <EmptyState
                    icon={<Users className="size-5" aria-hidden />}
                    title={t('admin.noMembers')}
                    description={t('admin.noMembersDescription')}
                  />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('admin.member')}</TableHead>
                        <TableHead>{t('admin.organizationRole')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedOrganization.members.map((member) => (
                        <TableRow key={member.id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar name={member.user.name} size="sm" />
                              <div className="min-w-0">
                                <p className="truncate font-semibold">
                                  {member.user.name}
                                </p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {member.user.email}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Pill tone={roleTone(member.role)}>
                              {translateOrganizationRole(member.role, t)}
                            </Pill>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </section>
            </>
          ) : null}

          {organizationError && selectedOrganizationId && (
            <p
              className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive"
              role="alert"
            >
              {organizationError}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
            <Button
              variant="ghost"
              className="text-destructive"
              disabled={isJoiningOrganization}
              onClick={() => {
                setOrganizationError(null)
                setIsDeleteOrganizationOpen(true)
              }}
            >
              <Trash2 className="size-4" aria-hidden />
              {t('admin.deleteOrganization')}
            </Button>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="ghost"
                disabled={isJoiningOrganization}
                onClick={() => {
                  setSelectedOrganizationId(null)
                  setSelectedOrganization(null)
                  setOrganizationError(null)
                }}
              >
                {t('admin.close')}
              </Button>
              {selectedOrganization &&
                (canManageOrganization(selectedOrganization.currentUserRole) ? (
                  <Button
                    isLoading={isJoiningOrganization}
                    onClick={() => void manageSelectedOrganization()}
                  >
                    {t('admin.manageOrganization')}
                    <ChevronRight className="size-4" aria-hidden />
                  </Button>
                ) : (
                  <Button
                    isLoading={isJoiningOrganization}
                    onClick={() => void addSelfAsOrganizationAdmin()}
                  >
                    <ShieldCheck className="size-4" aria-hidden />
                    {selectedOrganization.currentUserRole
                      ? t('admin.promoteSelf')
                      : t('admin.addSelf')}
                  </Button>
                ))}
            </div>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={isDeleteOrganizationOpen}
        onOpenChange={(open) => {
          if (!open && !isDeletingOrganization) {
            setIsDeleteOrganizationOpen(false)
            setOrganizationError(null)
          }
        }}
        title={t('admin.deleteOrganizationTitle')}
        description={t('admin.deleteOrganizationDescription', {
          name: selectedOrganization?.name ?? t('admin.thisOrganization'),
        })}
        icon={
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-destructive/10 text-destructive">
            <Trash2 className="size-5" aria-hidden />
          </span>
        }
      >
        <div className="grid w-full gap-4">
          <p className="text-sm leading-6 text-muted-foreground">
            {t('admin.deleteOrganizationConstraint')}
          </p>
          {organizationError && (
            <p
              className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive"
              role="alert"
            >
              {organizationError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              disabled={isDeletingOrganization}
              onClick={() => {
                setIsDeleteOrganizationOpen(false)
                setOrganizationError(null)
              }}
            >
              {t('admin.cancel')}
            </Button>
            <Button
              variant="danger"
              isLoading={isDeletingOrganization}
              onClick={() => void deleteSelectedOrganization()}
            >
              {t('admin.deleteOrganization')}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}

function OrganizationDetail({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <div className="mt-1 truncate text-sm font-semibold">{children}</div>
    </div>
  )
}

function canManageOrganization(role: string | null) {
  return (
    role
      ?.split(',')
      .map((value) => value.trim())
      .some((value) => value === 'admin' || value === 'owner') ?? false
  )
}

function roleTone(role: string): 'primary' | 'neutral' {
  return role.split(',').some((value) => value.trim() === 'owner')
    ? 'primary'
    : 'neutral'
}

function translateOrganizationRole(role: string, t: TFunction): string {
  return role
    .split(',')
    .map((value) => {
      const normalized = value.trim()
      if (normalized === 'owner') return t('admin.organizationRoles.owner')
      if (normalized === 'admin') return t('admin.organizationRoles.admin')
      if (normalized === 'member') return t('admin.organizationRoles.member')
      return normalized
    })
    .join(', ')
}

async function getResponseError(
  response: { json: () => Promise<unknown> },
  fallback: string,
) {
  await response.json().catch(() => null)
  return fallback
}

function getErrorMessage(_reason: unknown, fallback: string): string {
  return fallback
}
