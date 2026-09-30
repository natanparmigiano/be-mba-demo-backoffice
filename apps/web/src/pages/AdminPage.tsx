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
import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
  type SubmitEvent,
} from 'react'
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
      setError(getErrorMessage(reason))
    })
  }, [loadUsers])

  const loadOrganizations = useCallback(async () => {
    setIsLoadingOrganizations(true)
    setOrganizationError(null)
    try {
      const response = await apiClient.api.admin.organizations.$get({
        query: { search: organizationQuery },
      })
      if (!response.ok) throw new Error(await getResponseError(response))
      setOrganizations(await response.json())
    } catch (reason) {
      setOrganizationError(getErrorMessage(reason))
    } finally {
      setIsLoadingOrganizations(false)
    }
  }, [organizationQuery])

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
      if (!response.ok) throw new Error(await getResponseError(response))
      setSelectedOrganization(await response.json())
    } catch (reason) {
      setOrganizationError(getErrorMessage(reason))
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
      if (!response.ok) throw new Error(await getResponseError(response))
      await Promise.all([
        loadOrganizations(),
        loadOrganization(selectedOrganizationId),
        organizationMembershipsQuery.refetch(),
      ])
      setNotice('You are now an administrator of this organization.')
    } catch (reason) {
      setOrganizationError(getErrorMessage(reason))
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
      setOrganizationError(getErrorMessage(reason))
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
      if (!response.ok) throw new Error(await getResponseError(response))

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
      setNotice('Organization deleted.')
    } catch (reason) {
      setOrganizationError(getErrorMessage(reason))
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
      setError(getErrorMessage(reason))
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
    }, 'User created.')
  }

  return (
    <div className="grid gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold tracking-[0.12em] text-primary uppercase">
            Application administration
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight">
            Administration
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Manage organizations, application access, credentials, sessions, and
            support impersonation.
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
          Add user
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
            <h2 className="font-bold">Users</h2>
            <p className="text-sm text-muted-foreground">
              Application administrators are separate from organization owners.
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
              aria-label="Search users by name"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search users"
            />
            <Button type="submit" variant="outline" aria-label="Search">
              <Search className="size-4" />
            </Button>
          </form>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
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
                      aria-label={`Application role for ${user.name}`}
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
                        }, 'Application role updated.')
                      }
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
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
                      {user.banned ? 'Banned' : 'Active'}
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
                          }, 'Impersonation started.')
                        }
                      >
                        Impersonate
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8"
                        disabled={isBusy}
                        aria-label={`Rename ${user.name}`}
                        onClick={() => {
                          const nextName = window.prompt('User name', user.name)
                          if (!nextName?.trim()) return
                          void run(async () => {
                            const result = await authClient.admin.updateUser({
                              userId: user.id,
                              data: { name: nextName.trim() },
                            })
                            if (result.error)
                              throw new Error(result.error.message)
                          }, 'User updated.')
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8"
                        disabled={isBusy}
                        aria-label={`Reset password for ${user.name}`}
                        onClick={() => {
                          const newPassword = window.prompt(
                            `New password for ${user.email}`,
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
                          }, 'Password updated.')
                        }}
                      >
                        <KeyRound className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8"
                        disabled={isBusy || isSelf}
                        aria-label={`Revoke sessions for ${user.name}`}
                        onClick={() =>
                          void run(async () => {
                            const result =
                              await authClient.admin.revokeUserSessions({
                                userId: user.id,
                              })
                            if (result.error)
                              throw new Error(result.error.message)
                          }, 'User sessions revoked.')
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
                            ? `Unban ${user.name}`
                            : `Ban ${user.name}`
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
                                    banReason: 'Disabled by an administrator',
                                  })
                              if (result.error)
                                throw new Error(result.error.message)
                            },
                            user.banned ? 'User unbanned.' : 'User banned.',
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
                        aria-label={`Remove ${user.name}`}
                        onClick={() => {
                          if (
                            !window.confirm(`Permanently remove ${user.email}?`)
                          )
                            return
                          void run(async () => {
                            const result = await authClient.admin.removeUser({
                              userId: user.id,
                            })
                            if (result.error)
                              throw new Error(result.error.message)
                          }, 'User removed.')
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
            <h2 className="font-bold">Organizations</h2>
            <p className="text-sm text-muted-foreground">
              Find any organization, inspect its members, or join it as an
              organization administrator.
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
              aria-label="Search organizations"
              value={organizationSearch}
              onChange={(event) => setOrganizationSearch(event.target.value)}
              placeholder="Search organizations"
            />
            <Button type="submit" variant="outline" aria-label="Search">
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
            <span className="sr-only">Loading organizations</span>
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
            title="No organizations found"
            description={
              organizationQuery
                ? 'Try another organization name or slug.'
                : 'Organizations will appear here after they are created.'
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
                    {organization.memberCount === 1 ? 'member' : 'members'}
                  </span>
                  <span className="mt-2 block">
                    <Pill
                      tone={
                        organization.currentUserRole ? 'primary' : 'neutral'
                      }
                    >
                      {organization.currentUserRole
                        ? `Your role: ${organization.currentUserRole}`
                        : 'Not a member'}
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
        title="Add user"
        description="Create an email and password account with its initial application role."
        icon={
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <UserPlus className="size-5" aria-hidden />
          </span>
        }
      >
        <form className="grid w-full gap-4" onSubmit={createUser}>
          <Input
            label="Name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
            required
            disabled={isBusy}
          />
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            disabled={isBusy}
          />
          <Input
            label="Temporary password"
            type="password"
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            disabled={isBusy}
          />
          <Select
            label="Application role"
            value={role}
            onChange={(event) =>
              setRole(event.target.value as 'admin' | 'user')
            }
            disabled={isBusy}
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
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
              Cancel
            </Button>
            <Button type="submit" isLoading={isBusy}>
              Add user
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
        title={selectedOrganization?.name ?? 'Organization details'}
        description={
          selectedOrganization
            ? `Review ${selectedOrganization.slug} and its organization membership.`
            : 'Loading organization details…'
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
              <span className="sr-only">Loading organization details</span>
              <div className="h-20 animate-pulse rounded-xl bg-muted" />
              <div className="h-48 animate-pulse rounded-xl bg-muted" />
            </div>
          ) : selectedOrganization ? (
            <>
              <section className="grid gap-3 rounded-xl bg-muted/55 p-4 sm:grid-cols-3">
                <OrganizationDetail label="Name">
                  {selectedOrganization.name}
                </OrganizationDetail>
                <OrganizationDetail label="Slug">
                  {selectedOrganization.slug}
                </OrganizationDetail>
                <OrganizationDetail label="Your access">
                  <Pill
                    tone={
                      selectedOrganization.currentUserRole
                        ? 'primary'
                        : 'neutral'
                    }
                  >
                    {selectedOrganization.currentUserRole ?? 'Not a member'}
                  </Pill>
                </OrganizationDetail>
              </section>

              <section className="grid gap-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold">Members</h3>
                    <p className="text-sm text-muted-foreground">
                      {selectedOrganization.memberCount}{' '}
                      {selectedOrganization.memberCount === 1
                        ? 'person'
                        : 'people'}{' '}
                      in this organization
                    </p>
                  </div>
                  <Users className="size-5 text-muted-foreground" aria-hidden />
                </div>

                {selectedOrganization.members.length === 0 ? (
                  <EmptyState
                    icon={<Users className="size-5" aria-hidden />}
                    title="No members"
                    description="This organization does not have any members."
                  />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Member</TableHead>
                        <TableHead>Organization role</TableHead>
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
                              {member.role}
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
              Delete organization
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
                Close
              </Button>
              {selectedOrganization &&
                (canManageOrganization(selectedOrganization.currentUserRole) ? (
                  <Button
                    isLoading={isJoiningOrganization}
                    onClick={() => void manageSelectedOrganization()}
                  >
                    Manage organization
                    <ChevronRight className="size-4" aria-hidden />
                  </Button>
                ) : (
                  <Button
                    isLoading={isJoiningOrganization}
                    onClick={() => void addSelfAsOrganizationAdmin()}
                  >
                    <ShieldCheck className="size-4" aria-hidden />
                    {selectedOrganization.currentUserRole
                      ? 'Promote myself to admin'
                      : 'Add myself as admin'}
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
        title="Delete organization?"
        description={`This permanently deletes ${selectedOrganization?.name ?? 'this organization'} and removes access for every member.`}
        icon={
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-destructive/10 text-destructive">
            <Trash2 className="size-5" aria-hidden />
          </span>
        }
      >
        <div className="grid w-full gap-4">
          <p className="text-sm leading-6 text-muted-foreground">
            Organizations that still own channels or related business data
            cannot be deleted until that data is removed.
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
              Cancel
            </Button>
            <Button
              variant="danger"
              isLoading={isDeletingOrganization}
              onClick={() => void deleteSelectedOrganization()}
            >
              Delete organization
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

async function getResponseError(response: { json: () => Promise<unknown> }) {
  const body = await response.json().catch(() => null)
  if (
    body &&
    typeof body === 'object' &&
    'message' in body &&
    typeof body.message === 'string'
  ) {
    return body.message
  }
  return 'The request failed.'
}

function getErrorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : 'The operation failed.'
}
