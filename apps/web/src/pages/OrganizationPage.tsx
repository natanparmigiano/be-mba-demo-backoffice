import {
  Building2,
  Check,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react'
import { useCallback, useEffect, useState, type SubmitEvent } from 'react'
import { authClient } from '../auth/auth-client'
import {
  Avatar,
  Button,
  cn,
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

interface MemberSummary {
  id: string
  organizationId: string
  role: string
  userId: string
  user: {
    email: string
    name: string
  }
}

type OrganizationDialog =
  'create' | 'invite' | 'rename' | 'delete' | 'remove-member' | null

interface RunOptions {
  closeDialog?: boolean
  refreshMembers?: boolean
}

export function OrganizationPage() {
  const organizationsQuery = authClient.useListOrganizations()
  const activeOrganizationQuery = authClient.useActiveOrganization()
  const activeMemberRoleQuery = authClient.useActiveMemberRole()
  const organizations = organizationsQuery.data ?? []
  const activeOrganization = activeOrganizationQuery.data
  const activeRoles = (activeMemberRoleQuery.data?.role ?? '')
    .split(',')
    .map((role) => role.trim())
  const canManage = activeRoles.some((role) =>
    ['owner', 'admin'].includes(role),
  )
  const canDelete = activeRoles.includes('owner')

  const [members, setMembers] = useState<MemberSummary[]>([])
  const [dialog, setDialog] = useState<OrganizationDialog>(null)
  const [organizationName, setOrganizationName] = useState('')
  const [organizationSlug, setOrganizationSlug] = useState('')
  const [slugWasEdited, setSlugWasEdited] = useState(false)
  const [renameName, setRenameName] = useState('')
  const [invitationEmail, setInvitationEmail] = useState('')
  const [invitationRole, setInvitationRole] = useState<'admin' | 'member'>(
    'member',
  )
  const [memberToRemove, setMemberToRemove] = useState<MemberSummary | null>(
    null,
  )
  const [isBusy, setIsBusy] = useState(false)
  const [isLoadingMembers, setIsLoadingMembers] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dialogError, setDialogError] = useState<string | null>(null)

  const refreshOrganization = useCallback(async () => {
    if (!activeOrganization?.id) {
      setMembers([])
      return
    }

    setIsLoadingMembers(true)
    try {
      const membersResult = await authClient.organization.listMembers({
        query: { organizationId: activeOrganization.id, limit: 100 },
      })

      if (membersResult.error) throw new Error(membersResult.error.message)
      setMembers(membersResult.data?.members ?? [])
    } finally {
      setIsLoadingMembers(false)
    }
  }, [activeOrganization?.id])

  useEffect(() => {
    void refreshOrganization().catch((reason: unknown) => {
      setError(getErrorMessage(reason))
    })
  }, [refreshOrganization])

  const run = async (
    action: () => Promise<void>,
    success: string,
    { closeDialog = false, refreshMembers = true }: RunOptions = {},
  ) => {
    setIsBusy(true)
    setError(null)
    setDialogError(null)
    setNotice(null)

    try {
      await action()
      await Promise.all([
        organizationsQuery.refetch(),
        activeOrganizationQuery.refetch(),
      ])
      if (refreshMembers) await refreshOrganization()
      if (closeDialog) setDialog(null)
      setNotice(success)
    } catch (reason) {
      const message = getErrorMessage(reason)
      if (dialog) setDialogError(message)
      else setError(message)
    } finally {
      setIsBusy(false)
    }
  }

  const openDialog = (nextDialog: Exclude<OrganizationDialog, null>) => {
    setDialogError(null)
    setDialog(nextDialog)
  }

  const closeDialog = () => {
    if (isBusy) return
    setDialog(null)
    setDialogError(null)
    setMemberToRemove(null)
  }

  const createOrganization = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    void run(
      async () => {
        const result = await authClient.organization.create({
          name: organizationName.trim(),
          slug: organizationSlug.trim(),
        })
        if (result.error) throw new Error(result.error.message)
        if (!result.data) throw new Error('The organization was not created.')

        const activeResult = await authClient.organization.setActive({
          organizationId: result.data.id,
        })
        if (activeResult.error) throw new Error(activeResult.error.message)

        setOrganizationName('')
        setOrganizationSlug('')
        setSlugWasEdited(false)
      },
      'Organization created.',
      { closeDialog: true, refreshMembers: false },
    )
  }

  const inviteMember = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!activeOrganization) return

    void run(
      async () => {
        const result = await authClient.organization.inviteMember({
          email: invitationEmail.trim(),
          role: invitationRole,
          organizationId: activeOrganization.id,
        })
        if (result.error) throw new Error(result.error.message)
        setInvitationEmail('')
        setInvitationRole('member')
      },
      'Invitation created.',
      { closeDialog: true },
    )
  }

  const renameOrganization = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!activeOrganization) return

    void run(
      async () => {
        const result = await authClient.organization.update({
          organizationId: activeOrganization.id,
          data: { name: renameName.trim() },
        })
        if (result.error) throw new Error(result.error.message)
      },
      'Organization renamed.',
      { closeDialog: true, refreshMembers: false },
    )
  }

  const deleteOrganization = () => {
    if (!activeOrganization) return

    void run(
      async () => {
        const result = await authClient.organization.delete({
          organizationId: activeOrganization.id,
        })
        if (result.error) throw new Error(result.error.message)
      },
      'Organization deleted.',
      { closeDialog: true, refreshMembers: false },
    )
  }

  const removeMember = () => {
    if (!activeOrganization || !memberToRemove) return

    void run(
      async () => {
        const result = await authClient.organization.removeMember({
          memberIdOrEmail: memberToRemove.id,
          organizationId: activeOrganization.id,
        })
        if (result.error) throw new Error(result.error.message)
        setMemberToRemove(null)
      },
      'Member removed.',
      { closeDialog: true },
    )
  }

  return (
    <div className="grid gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold tracking-[0.12em] text-primary uppercase">
            Workspace access
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight">
            Organizations
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Choose the workspace you want to manage, invite members, and control
            their access.
          </p>
        </div>
        <Button
          className="self-start sm:self-auto"
          onClick={() => openDialog('create')}
        >
          <Plus className="size-4" aria-hidden />
          New organization
        </Button>
      </header>

      {(error || notice) && (
        <p
          className={cn(
            'rounded-xl border p-3 text-sm',
            error
              ? 'border-destructive/30 bg-destructive/10 text-destructive'
              : 'border-success/30 bg-success/10 text-success',
          )}
          role="status"
        >
          {error ?? notice}
        </p>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <section className="overflow-hidden rounded-2xl border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3.5">
            <div>
              <h2 className="text-sm font-bold">Your organizations</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {organizations.length}{' '}
                {organizations.length === 1 ? 'workspace' : 'workspaces'}
              </p>
            </div>
            <Button
              className="size-8"
              variant="ghost"
              size="icon"
              disabled={isBusy}
              onClick={() => void organizationsQuery.refetch()}
              aria-label="Refresh organizations"
            >
              <RefreshCw className="size-4" aria-hidden />
            </Button>
          </div>

          <div className="grid gap-1 p-2">
            {organizations.map((organization) => {
              const isActive = organization.id === activeOrganization?.id

              return (
                <button
                  key={organization.id}
                  type="button"
                  className={cn(
                    'group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/25',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-muted/70',
                  )}
                  aria-pressed={isActive}
                  disabled={isBusy || isActive}
                  onClick={() =>
                    void run(
                      async () => {
                        const result = await authClient.organization.setActive({
                          organizationId: organization.id,
                        })
                        if (result.error) throw new Error(result.error.message)
                      },
                      `${organization.name} is now active.`,
                      { refreshMembers: false },
                    )
                  }
                >
                  <span
                    className={cn(
                      'grid size-9 shrink-0 place-items-center rounded-lg',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground group-hover:text-foreground',
                    )}
                  >
                    <Building2 className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">
                      {organization.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {organization.slug}
                    </span>
                  </span>
                  {isActive && (
                    <Check className="size-4 shrink-0" aria-hidden />
                  )}
                </button>
              )
            })}
          </div>
        </section>

        {activeOrganization ? (
          <section className="overflow-hidden rounded-2xl border bg-card">
            <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div className="flex min-w-0 items-center gap-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Building2 className="size-6" aria-hidden />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-xl font-bold">
                      {activeOrganization.name}
                    </h2>
                    <Pill tone="primary" dot>
                      Active
                    </Pill>
                  </div>
                  <p className="mt-1 truncate text-sm text-muted-foreground">
                    {activeOrganization.slug}
                  </p>
                </div>
              </div>

              {canManage && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setRenameName(activeOrganization.name)
                      openDialog('rename')
                    }}
                  >
                    <Pencil className="size-3.5" aria-hidden />
                    Rename
                  </Button>
                  <Button size="sm" onClick={() => openDialog('invite')}>
                    <UserPlus className="size-3.5" aria-hidden />
                    Invite member
                  </Button>
                  {canDelete && (
                    <Button
                      className="size-8 text-destructive"
                      variant="ghost"
                      size="icon"
                      onClick={() => openDialog('delete')}
                      aria-label={`Delete ${activeOrganization.name}`}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  )}
                </div>
              )}
            </div>

            <div className="border-t p-5 sm:p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold">Members</h3>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {members.length}{' '}
                    {members.length === 1 ? 'person' : 'people'} in this
                    organization
                  </p>
                </div>
                <Button
                  className="size-8"
                  variant="ghost"
                  size="icon"
                  disabled={isLoadingMembers}
                  onClick={() => void refreshOrganization()}
                  aria-label="Refresh members"
                >
                  <RefreshCw
                    className={cn('size-4', isLoadingMembers && 'animate-spin')}
                    aria-hidden
                  />
                </Button>
              </div>

              {isLoadingMembers && members.length === 0 ? (
                <div className="grid gap-2" role="status">
                  <span className="sr-only">Loading members</span>
                  {[0, 1, 2].map((item) => (
                    <div
                      key={item}
                      className="h-14 animate-pulse rounded-lg bg-muted"
                    />
                  ))}
                </div>
              ) : members.length === 0 ? (
                <EmptyState
                  icon={<Users className="size-5" aria-hidden />}
                  title="No members yet"
                  description="Invite someone to collaborate in this organization."
                  action={
                    canManage ? (
                      <Button size="sm" onClick={() => openDialog('invite')}>
                        <UserPlus className="size-4" aria-hidden />
                        Invite member
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Member</TableHead>
                      <TableHead>Organization role</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.map((member) => (
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
                          <Select
                            className="min-w-32"
                            aria-label={`Role for ${member.user.name}`}
                            value={member.role}
                            disabled={
                              isBusy || !canManage || member.role === 'owner'
                            }
                            onChange={(event) =>
                              void run(async () => {
                                const result =
                                  await authClient.organization.updateMemberRole(
                                    {
                                      memberId: member.id,
                                      organizationId: activeOrganization.id,
                                      role: event.target.value,
                                    },
                                  )
                                if (result.error)
                                  throw new Error(result.error.message)
                              }, 'Member role updated.')
                            }
                          >
                            <option value="owner">Owner</option>
                            <option value="admin">Admin</option>
                            <option value="member">Member</option>
                          </Select>
                        </TableCell>
                        <TableCell className="text-right">
                          {canManage && member.role !== 'owner' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 text-destructive"
                              disabled={isBusy}
                              aria-label={`Remove ${member.user.name}`}
                              onClick={() => {
                                setMemberToRemove(member)
                                openDialog('remove-member')
                              }}
                            >
                              <Trash2 className="size-4" aria-hidden />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </section>
        ) : (
          <EmptyState
            icon={<Building2 className="size-5" aria-hidden />}
            title="No organization selected"
            description="Choose an organization to view its members and settings."
          />
        )}
      </div>

      <Dialog
        open={dialog === 'create'}
        onOpenChange={(open) => !open && closeDialog()}
        title="Create an organization"
        description="Set up a separate workspace for members and backoffice data."
        icon={<DialogIcon icon={<Building2 className="size-5" />} />}
      >
        <form className="grid w-full gap-4" onSubmit={createOrganization}>
          <Input
            label="Organization name"
            value={organizationName}
            onChange={(event) => {
              const name = event.target.value
              setOrganizationName(name)
              if (!slugWasEdited) setOrganizationSlug(toSlug(name))
            }}
            autoFocus
            required
            disabled={isBusy}
          />
          <Input
            label="Slug"
            hint="Used in URLs and integrations."
            value={organizationSlug}
            onChange={(event) => {
              setSlugWasEdited(true)
              setOrganizationSlug(toSlug(event.target.value))
            }}
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            required
            disabled={isBusy}
          />
          <DialogError message={dialogError} />
          <DialogActions
            onCancel={closeDialog}
            isBusy={isBusy}
            submit="Create"
          />
        </form>
      </Dialog>

      <Dialog
        open={dialog === 'invite'}
        onOpenChange={(open) => !open && closeDialog()}
        title="Invite a member"
        description={`Send an invitation to join ${activeOrganization?.name ?? 'this organization'}.`}
        icon={<DialogIcon icon={<UserPlus className="size-5" />} />}
      >
        <form className="grid w-full gap-4" onSubmit={inviteMember}>
          <Input
            label="Email address"
            type="email"
            value={invitationEmail}
            onChange={(event) => setInvitationEmail(event.target.value)}
            autoFocus
            required
            disabled={isBusy}
          />
          <Select
            label="Organization role"
            value={invitationRole}
            onChange={(event) =>
              setInvitationRole(event.target.value as 'admin' | 'member')
            }
            disabled={isBusy}
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </Select>
          <DialogError message={dialogError} />
          <DialogActions
            onCancel={closeDialog}
            isBusy={isBusy}
            submit="Create invitation"
          />
        </form>
      </Dialog>

      <Dialog
        open={dialog === 'rename'}
        onOpenChange={(open) => !open && closeDialog()}
        title="Rename organization"
        description="Update the display name. The organization slug will stay the same."
        icon={<DialogIcon icon={<Pencil className="size-5" />} />}
      >
        <form className="grid w-full gap-4" onSubmit={renameOrganization}>
          <Input
            label="Organization name"
            value={renameName}
            onChange={(event) => setRenameName(event.target.value)}
            autoFocus
            required
            disabled={isBusy}
          />
          <DialogError message={dialogError} />
          <DialogActions onCancel={closeDialog} isBusy={isBusy} submit="Save" />
        </form>
      </Dialog>

      <Dialog
        open={dialog === 'delete'}
        onOpenChange={(open) => !open && closeDialog()}
        title="Delete organization?"
        description={`This permanently deletes ${activeOrganization?.name ?? 'this organization'} and removes access for every member.`}
        icon={<DialogIcon icon={<Trash2 className="size-5" />} danger />}
      >
        <div className="grid w-full gap-4">
          <DialogError message={dialogError} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" disabled={isBusy} onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              variant="danger"
              isLoading={isBusy}
              onClick={deleteOrganization}
            >
              Delete organization
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={dialog === 'remove-member'}
        onOpenChange={(open) => !open && closeDialog()}
        title="Remove member?"
        description={`${memberToRemove?.user.name ?? 'This member'} will immediately lose access to ${activeOrganization?.name ?? 'this organization'}.`}
        icon={<DialogIcon icon={<Trash2 className="size-5" />} danger />}
      >
        <div className="grid w-full gap-4">
          <DialogError message={dialogError} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" disabled={isBusy} onClick={closeDialog}>
              Cancel
            </Button>
            <Button variant="danger" isLoading={isBusy} onClick={removeMember}>
              Remove member
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}

function DialogIcon({
  icon,
  danger = false,
}: {
  icon: React.ReactNode
  danger?: boolean
}) {
  return (
    <span
      className={cn(
        'grid size-10 shrink-0 place-items-center rounded-xl',
        danger
          ? 'bg-destructive/10 text-destructive'
          : 'bg-primary/10 text-primary',
      )}
      aria-hidden
    >
      {icon}
    </span>
  )
}

function DialogActions({
  onCancel,
  isBusy,
  submit,
}: {
  onCancel: () => void
  isBusy: boolean
  submit: string
}) {
  return (
    <div className="flex justify-end gap-2">
      <Button
        type="button"
        variant="ghost"
        disabled={isBusy}
        onClick={onCancel}
      >
        Cancel
      </Button>
      <Button type="submit" isLoading={isBusy}>
        {submit}
      </Button>
    </div>
  )
}

function DialogError({ message }: { message: string | null }) {
  return message ? (
    <p
      className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
      role="alert"
    >
      {message}
    </p>
  ) : null
}

function toSlug(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function getErrorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : 'The operation failed.'
}
