import {
  Building2,
  Check,
  Mail,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react'
import { useCallback, useEffect, useState, type SubmitEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { apiClient } from '../api'
import { authClient } from '../auth/auth-client'
import {
  Avatar,
  Button,
  cn,
  Dialog,
  EmptyState,
  Input,
  InlineFeedback,
  PageHeader,
  Pill,
  applyOrganizationPrimaryColor,
  DEFAULT_PRIMARY_COLOR,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@mba-desk/ui'
import { OrganizationLogo } from '../components/app/OrganizationLogo'
import { OrganizationLogoPicker } from '../components/app/OrganizationLogoPicker'
import {
  removeOrganizationLogo,
  uploadOrganizationLogo,
} from '../components/app/organization-logo-api'

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

interface PendingInvitation {
  id: string
  organizationId: string
  organizationName: string
  role: string
  expiresAt: string
}

type OrganizationDialog =
  'create' | 'invite' | 'rename' | 'delete' | 'remove-member' | null

interface RunOptions {
  closeDialog?: boolean
  refreshMembers?: boolean
}

export function OrganizationPage() {
  const { t } = useTranslation()
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
  const [pendingInvitations, setPendingInvitations] = useState<
    PendingInvitation[]
  >([])
  const [isLoadingInvitations, setIsLoadingInvitations] = useState(true)
  const [invitationInProgress, setInvitationInProgress] = useState<
    string | null
  >(null)
  const [dialog, setDialog] = useState<OrganizationDialog>(null)
  const [organizationName, setOrganizationName] = useState('')
  const [organizationSlug, setOrganizationSlug] = useState('')
  const [primaryColor, setPrimaryColor] = useState(DEFAULT_PRIMARY_COLOR)
  const [organizationLogo, setOrganizationLogo] = useState<Blob | null>(null)
  const [slugWasEdited, setSlugWasEdited] = useState(false)
  const [renameName, setRenameName] = useState('')
  const [editPrimaryColor, setEditPrimaryColor] = useState(
    DEFAULT_PRIMARY_COLOR,
  )
  const [editLogo, setEditLogo] = useState<Blob | null>(null)
  const [removeEditLogo, setRemoveEditLogo] = useState(false)
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

  useEffect(() => {
    document.title = `${t('organizations.title')} · ${t('design.brand')}`
    document
      .querySelector<HTMLMetaElement>('meta[name="description"]')
      ?.setAttribute('content', t('organizations.metaDescription'))
  }, [t])

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
      setError(getErrorMessage(reason, t('organizations.operationFailed')))
    })
  }, [refreshOrganization, t])

  const refreshInvitations = useCallback(async () => {
    setIsLoadingInvitations(true)
    try {
      const response = await apiClient.api['organization-invitations'].$get()
      if (!response.ok) throw new Error()
      setPendingInvitations(await response.json())
    } finally {
      setIsLoadingInvitations(false)
    }
  }, [])

  useEffect(() => {
    void refreshInvitations().catch((reason: unknown) => {
      setError(getErrorMessage(reason, t('organizations.operationFailed')))
    })
  }, [refreshInvitations, t])

  const respondToInvitation = async (
    invitation: PendingInvitation,
    response: 'accept' | 'reject',
  ) => {
    setInvitationInProgress(invitation.id)
    setError(null)
    setNotice(null)
    try {
      const result =
        response === 'accept'
          ? await authClient.organization.acceptInvitation({
              invitationId: invitation.id,
            })
          : await authClient.organization.rejectInvitation({
              invitationId: invitation.id,
            })
      if (result.error) throw new Error(result.error.message)

      if (response === 'accept') {
        const activeResult = await authClient.organization.setActive({
          organizationId: invitation.organizationId,
        })
        if (activeResult.error) throw new Error(activeResult.error.message)
      }

      await Promise.all([
        refreshInvitations(),
        organizationsQuery.refetch(),
        activeOrganizationQuery.refetch(),
      ])
      setNotice(
        t(
          response === 'accept'
            ? 'organizations.invitationAccepted'
            : 'organizations.invitationRejected',
          { organization: invitation.organizationName },
        ),
      )
    } catch (reason) {
      setError(getErrorMessage(reason, t('organizations.operationFailed')))
    } finally {
      setInvitationInProgress(null)
    }
  }

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
      const message = getErrorMessage(
        reason,
        t('organizations.operationFailed'),
      )
      if (dialog) setDialogError(message)
      else setError(message)
    } finally {
      setIsBusy(false)
    }
  }

  const openDialog = (nextDialog: Exclude<OrganizationDialog, null>) => {
    setDialogError(null)
    if (nextDialog === 'rename' && activeOrganization) {
      setRenameName(activeOrganization.name)
      setEditPrimaryColor(
        activeOrganization.primaryColor ?? DEFAULT_PRIMARY_COLOR,
      )
      setEditLogo(null)
      setRemoveEditLogo(false)
    }
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
          primaryColor,
        })
        if (result.error) throw new Error(result.error.message)
        if (!result.data)
          throw new Error(t('organizations.organizationNotCreated'))

        if (organizationLogo) {
          await uploadOrganizationLogo(result.data.id, organizationLogo)
        }

        const activeResult = await authClient.organization.setActive({
          organizationId: result.data.id,
        })
        if (activeResult.error) throw new Error(activeResult.error.message)

        setOrganizationName('')
        setOrganizationSlug('')
        setPrimaryColor(DEFAULT_PRIMARY_COLOR)
        setOrganizationLogo(null)
        setSlugWasEdited(false)
      },
      t('organizations.created'),
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
      t('organizations.invitationCreated'),
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
          data: {
            name: renameName.trim(),
            primaryColor: editPrimaryColor,
          },
        })
        if (result.error) throw new Error(result.error.message)
        if (editLogo) {
          await uploadOrganizationLogo(activeOrganization.id, editLogo)
        } else if (removeEditLogo && activeOrganization.logo) {
          await removeOrganizationLogo(activeOrganization.id)
        }
        applyOrganizationPrimaryColor(editPrimaryColor)
      },
      t('organizations.renamed'),
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
      t('organizations.deleted'),
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
      t('organizations.memberRemoved'),
      { closeDialog: true },
    )
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow={t('organizations.eyebrow')}
        title={t('organizations.title')}
        description={t('organizations.description')}
        actions={
          <Button onClick={() => openDialog('create')}>
            <Plus className="size-4" aria-hidden />
            {t('organizations.newOrganization')}
          </Button>
        }
      />

      {(error || notice) && (
        <InlineFeedback tone={error ? 'error' : 'success'}>
          {error ?? notice}
        </InlineFeedback>
      )}

      {(isLoadingInvitations || pendingInvitations.length > 0) && (
        <section className="rounded-2xl border bg-card p-5 shadow-xs sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-bold">
                {t('organizations.pendingInvitations')}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('organizations.pendingInvitationsDescription')}
              </p>
            </div>
            <Button
              className="size-8"
              variant="ghost"
              size="icon"
              disabled={isLoadingInvitations || invitationInProgress !== null}
              onClick={() => void refreshInvitations()}
              aria-label={t('organizations.refreshInvitations')}
            >
              <RefreshCw
                className={cn('size-4', isLoadingInvitations && 'animate-spin')}
                aria-hidden
              />
            </Button>
          </div>

          {isLoadingInvitations ? (
            <div className="mt-4 h-20 animate-pulse rounded-xl bg-muted" />
          ) : (
            <div className="mt-4 grid gap-3">
              {pendingInvitations.map((invitation) => (
                <article
                  key={invitation.id}
                  className="flex flex-col gap-4 rounded-xl border bg-background p-4 sm:flex-row sm:items-center"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
                    <Mail className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">
                      {invitation.organizationName}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t('organizations.invitedAs', {
                        role: t(
                          invitation.role === 'admin'
                            ? 'organizations.roles.admin'
                            : 'organizations.roles.member',
                        ),
                      })}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={invitationInProgress !== null}
                      onClick={() =>
                        void respondToInvitation(invitation, 'reject')
                      }
                    >
                      {t('organizations.rejectInvitation')}
                    </Button>
                    <Button
                      size="sm"
                      disabled={invitationInProgress !== null}
                      onClick={() =>
                        void respondToInvitation(invitation, 'accept')
                      }
                    >
                      {t('organizations.acceptInvitation')}
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <section className="overflow-hidden rounded-2xl border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3.5">
            <div>
              <h2 className="text-sm font-bold">
                {t('organizations.yourOrganizations')}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t('organizations.workspaceCount', {
                  count: organizations.length,
                })}
              </p>
            </div>
            <Button
              className="size-8"
              variant="ghost"
              size="icon"
              disabled={isBusy}
              onClick={() => void organizationsQuery.refetch()}
              aria-label={t('organizations.refreshOrganizations')}
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
                      t('organizations.nowActive', {
                        name: organization.name,
                      }),
                      { refreshMembers: false },
                    )
                  }
                >
                  <OrganizationLogo
                    organization={organization}
                    className={cn(
                      'size-9 rounded-lg ring-1',
                      isActive ? 'ring-primary/30' : 'ring-border',
                    )}
                  />
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
                <OrganizationLogo
                  organization={activeOrganization}
                  className="size-12 ring-1 ring-primary/20"
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-xl font-bold">
                      {activeOrganization.name}
                    </h2>
                    <Pill tone="primary" dot>
                      {t('organizations.active')}
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
                    {t('organizations.renameAction')}
                  </Button>
                  <Button size="sm" onClick={() => openDialog('invite')}>
                    <UserPlus className="size-3.5" aria-hidden />
                    {t('organizations.inviteMemberAction')}
                  </Button>
                  {canDelete && (
                    <Button
                      className="size-8 text-destructive"
                      variant="ghost"
                      size="icon"
                      onClick={() => openDialog('delete')}
                      aria-label={t('organizations.deleteNamed', {
                        name: activeOrganization.name,
                      })}
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
                  <h3 className="font-bold">{t('organizations.members')}</h3>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {t('organizations.peopleInOrganization', {
                      count: members.length,
                    })}
                  </p>
                </div>
                <Button
                  className="size-8"
                  variant="ghost"
                  size="icon"
                  disabled={isLoadingMembers}
                  onClick={() => void refreshOrganization()}
                  aria-label={t('organizations.refreshMembers')}
                >
                  <RefreshCw
                    className={cn('size-4', isLoadingMembers && 'animate-spin')}
                    aria-hidden
                  />
                </Button>
              </div>

              {isLoadingMembers && members.length === 0 ? (
                <div className="grid gap-2" role="status">
                  <span className="sr-only">
                    {t('organizations.loadingMembers')}
                  </span>
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
                  title={t('organizations.noMembersYet')}
                  description={t('organizations.noMembersDescription')}
                  action={
                    canManage ? (
                      <Button size="sm" onClick={() => openDialog('invite')}>
                        <UserPlus className="size-4" aria-hidden />
                        {t('organizations.inviteMemberAction')}
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('organizations.member')}</TableHead>
                      <TableHead>
                        {t('organizations.organizationRole')}
                      </TableHead>
                      <TableHead className="text-right">
                        {t('organizations.actions')}
                      </TableHead>
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
                            aria-label={t('organizations.roleFor', {
                              name: member.user.name,
                            })}
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
                              }, t('organizations.memberRoleUpdated'))
                            }
                          >
                            <option value="owner">
                              {t('organizations.roles.owner')}
                            </option>
                            <option value="admin">
                              {t('organizations.roles.admin')}
                            </option>
                            <option value="member">
                              {t('organizations.roles.member')}
                            </option>
                          </Select>
                        </TableCell>
                        <TableCell className="text-right">
                          {canManage && member.role !== 'owner' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 text-destructive"
                              disabled={isBusy}
                              aria-label={t('organizations.removeNamed', {
                                name: member.user.name,
                              })}
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
            title={t('organizations.noSelection')}
            description={t('organizations.noSelectionDescription')}
          />
        )}
      </div>

      <Dialog
        open={dialog === 'create'}
        onOpenChange={(open) => !open && closeDialog()}
        title={t('organizations.createTitle')}
        description={t('organizations.createDescription')}
        icon={
          <OrganizationLogo
            organization={null}
            className="size-10 ring-1 ring-border"
          />
        }
      >
        <form className="grid w-full gap-4" onSubmit={createOrganization}>
          <Input
            label={t('organizations.name')}
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
            label={t('organizations.slug')}
            hint={t('organizations.slugHint')}
            value={organizationSlug}
            onChange={(event) => {
              setSlugWasEdited(true)
              setOrganizationSlug(toSlug(event.target.value))
            }}
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            required
            disabled={isBusy}
          />
          <Input
            label={t('organizations.primaryColor')}
            hint={t('organizations.primaryColorHint')}
            type="color"
            value={primaryColor}
            onChange={(event) => setPrimaryColor(event.target.value)}
            disabled={isBusy}
          />
          <OrganizationLogoPicker
            value={organizationLogo}
            onChange={(logo) => setOrganizationLogo(logo)}
            disabled={isBusy}
          />
          <DialogError message={dialogError} />
          <DialogActions
            onCancel={closeDialog}
            isBusy={isBusy}
            submit={t('organizations.create')}
          />
        </form>
      </Dialog>

      <Dialog
        open={dialog === 'invite'}
        onOpenChange={(open) => !open && closeDialog()}
        title={t('organizations.inviteTitle')}
        description={t('organizations.inviteDescription', {
          name: activeOrganization?.name ?? t('organizations.thisOrganization'),
        })}
        icon={<DialogIcon icon={<UserPlus className="size-5" />} />}
      >
        <form className="grid w-full gap-4" onSubmit={inviteMember}>
          <Input
            label={t('organizations.emailAddress')}
            type="email"
            value={invitationEmail}
            onChange={(event) => setInvitationEmail(event.target.value)}
            autoFocus
            required
            disabled={isBusy}
          />
          <Select
            label={t('organizations.organizationRole')}
            value={invitationRole}
            onChange={(event) =>
              setInvitationRole(event.target.value as 'admin' | 'member')
            }
            disabled={isBusy}
          >
            <option value="member">{t('organizations.roles.member')}</option>
            <option value="admin">{t('organizations.roles.admin')}</option>
          </Select>
          <DialogError message={dialogError} />
          <DialogActions
            onCancel={closeDialog}
            isBusy={isBusy}
            submit={t('organizations.createInvitation')}
          />
        </form>
      </Dialog>

      <Dialog
        open={dialog === 'rename'}
        onOpenChange={(open) => !open && closeDialog()}
        title={t('organizations.renameTitle')}
        description={t('organizations.renameDescription')}
        icon={
          <OrganizationLogo
            organization={activeOrganization}
            className="size-10 ring-1 ring-border"
          />
        }
      >
        <form className="grid w-full gap-4" onSubmit={renameOrganization}>
          <Input
            label={t('organizations.name')}
            value={renameName}
            onChange={(event) => setRenameName(event.target.value)}
            autoFocus
            required
            disabled={isBusy}
          />
          <Input
            label={t('organizations.primaryColor')}
            hint={t('organizations.primaryColorHint')}
            type="color"
            value={editPrimaryColor}
            onChange={(event) => setEditPrimaryColor(event.target.value)}
            disabled={isBusy}
          />
          <OrganizationLogoPicker
            organization={removeEditLogo ? null : activeOrganization}
            value={editLogo}
            onChange={(logo, removeExisting) => {
              setEditLogo(logo)
              setRemoveEditLogo(Boolean(removeExisting))
            }}
            disabled={isBusy}
          />
          <DialogError message={dialogError} />
          <DialogActions
            onCancel={closeDialog}
            isBusy={isBusy}
            submit={t('organizations.save')}
          />
        </form>
      </Dialog>

      <Dialog
        open={dialog === 'delete'}
        onOpenChange={(open) => !open && closeDialog()}
        title={t('organizations.deleteTitle')}
        description={t('organizations.deleteDescription', {
          name: activeOrganization?.name ?? t('organizations.thisOrganization'),
        })}
        icon={<DialogIcon icon={<Trash2 className="size-5" />} danger />}
      >
        <div className="grid w-full gap-4">
          <DialogError message={dialogError} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" disabled={isBusy} onClick={closeDialog}>
              {t('organizations.cancel')}
            </Button>
            <Button
              variant="danger"
              isLoading={isBusy}
              onClick={deleteOrganization}
            >
              {t('organizations.deleteAction')}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={dialog === 'remove-member'}
        onOpenChange={(open) => !open && closeDialog()}
        title={t('organizations.removeTitle')}
        description={t('organizations.removeDescription', {
          member: memberToRemove?.user.name ?? t('organizations.thisMember'),
          organization:
            activeOrganization?.name ?? t('organizations.thisOrganization'),
        })}
        icon={<DialogIcon icon={<Trash2 className="size-5" />} danger />}
      >
        <div className="grid w-full gap-4">
          <DialogError message={dialogError} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" disabled={isBusy} onClick={closeDialog}>
              {t('organizations.cancel')}
            </Button>
            <Button variant="danger" isLoading={isBusy} onClick={removeMember}>
              {t('organizations.removeAction')}
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
  const { t } = useTranslation()

  return (
    <div className="flex justify-end gap-2">
      <Button
        type="button"
        variant="ghost"
        disabled={isBusy}
        onClick={onCancel}
      >
        {t('organizations.cancel')}
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

function getErrorMessage(_reason: unknown, fallback: string): string {
  return fallback
}
