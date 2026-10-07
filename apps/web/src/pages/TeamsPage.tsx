import type { InferResponseType } from 'hono/client'
import {
  Pencil,
  Plus,
  RefreshCw,
  SearchX,
  Star,
  Trash2,
  UsersRound,
} from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { apiClient } from '../api'
import { authClient } from '../auth/auth-client'
import {
  Avatar,
  Button,
  Checkbox,
  cn,
  Dialog,
  EmptyState,
  Input,
  SearchBox,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui'

type TeamsResponse = InferResponseType<typeof apiClient.api.teams.$get, 200>
type TeamSummary = TeamsResponse['teams'][number]
type OrganizationMember = TeamsResponse['organizationMembers'][number]

interface TeamForm {
  name: string
  slug: string
  color: string
  userIds: string[]
}

const DEFAULT_TEAM_COLOR = '#0866ff'
const emptyTeamForm: TeamForm = {
  name: '',
  slug: '',
  color: DEFAULT_TEAM_COLOR,
  userIds: [],
}

export function TeamsPage() {
  const { t, i18n } = useTranslation()
  const activeOrganizationQuery = authClient.useActiveOrganization()
  const activeMemberRoleQuery = authClient.useActiveMemberRole()
  const activeOrganizationId = activeOrganizationQuery.data?.id
  const canManage = (activeMemberRoleQuery.data?.role ?? '')
    .split(',')
    .map((role) => role.trim())
    .some((role) => role === 'owner' || role === 'admin')
  const [teams, setTeams] = useState<TeamSummary[]>([])
  const [organizationMembers, setOrganizationMembers] = useState<
    OrganizationMember[]
  >([])
  const [search, setSearch] = useState('')
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<TeamSummary | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TeamSummary | null>(null)
  const [form, setForm] = useState<TeamForm>(emptyTeamForm)
  const [slugWasEdited, setSlugWasEdited] = useState(false)

  useEffect(() => {
    document.title = `${t('teams.title')} · ${t('design.brand')}`
    document
      .querySelector<HTMLMetaElement>('meta[name="description"]')
      ?.setAttribute('content', t('teams.metaDescription'))
  }, [t])

  useEffect(() => {
    if (!activeOrganizationId) {
      setTeams([])
      setOrganizationMembers([])
      setIsLoading(false)
      return
    }

    let ignore = false
    setIsLoading(true)
    setError(null)
    void (async () => {
      try {
        const response = await apiClient.api.teams.$get()
        if (!response.ok) {
          throw new Error(await readApiError(response, t('teams.loadFailed')))
        }
        const result = await response.json()
        if (!ignore) {
          setTeams(result.teams)
          setOrganizationMembers(result.organizationMembers)
        }
      } catch (reason) {
        if (!ignore) setError(getErrorMessage(reason, t('teams.loadFailed')))
      } finally {
        if (!ignore) setIsLoading(false)
      }
    })()

    return () => {
      ignore = true
    }
  }, [activeOrganizationId, refreshVersion, t])

  useEffect(() => {
    closeForm()
    setDeleteTarget(null)
    setNotice(null)
  }, [activeOrganizationId])

  const visibleTeams = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase()
    if (!normalizedSearch) return teams
    return teams.filter(
      (team) =>
        team.name.toLocaleLowerCase().includes(normalizedSearch) ||
        team.slug.toLocaleLowerCase().includes(normalizedSearch) ||
        team.members.some(
          (member) =>
            member.name.toLocaleLowerCase().includes(normalizedSearch) ||
            member.email.toLocaleLowerCase().includes(normalizedSearch),
        ),
    )
  }, [search, teams])

  const openCreateDialog = () => {
    setForm(emptyTeamForm)
    setSlugWasEdited(false)
    setDialogError(null)
    setIsCreateOpen(true)
  }

  const openEditDialog = (team: TeamSummary) => {
    setForm({
      name: team.name,
      slug: team.slug,
      color: team.color,
      userIds: team.members.map((member) => member.id),
    })
    setSlugWasEdited(true)
    setDialogError(null)
    setEditTarget(team)
  }

  const closeForm = () => {
    setIsCreateOpen(false)
    setEditTarget(null)
    setForm(emptyTeamForm)
    setSlugWasEdited(false)
    setDialogError(null)
  }

  const changeName = (name: string) => {
    setForm((current) => ({
      ...current,
      name,
      slug: slugWasEdited ? current.slug : toSlug(name),
    }))
  }

  const toggleMember = (userId: string, checked: boolean) => {
    setForm((current) => ({
      ...current,
      userIds: checked
        ? [...current.userIds, userId]
        : current.userIds.filter((value) => value !== userId),
    }))
  }

  const saveTeam = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsBusy(true)
    setDialogError(null)
    setNotice(null)
    try {
      const payload = {
        name: form.name,
        slug: form.slug,
        color: form.color,
        userIds: form.userIds,
      }
      const response = editTarget
        ? await apiClient.api.teams[':id'].$patch({
            param: { id: editTarget.id },
            json: payload,
          })
        : await apiClient.api.teams.$post({ json: payload })
      if (!response.ok) {
        throw new Error(
          await readApiError(response, t('teams.operationFailed')),
        )
      }
      setNotice(editTarget ? t('teams.teamUpdated') : t('teams.teamCreated'))
      closeForm()
      setRefreshVersion((version) => version + 1)
    } catch (reason) {
      setDialogError(getErrorMessage(reason, t('teams.operationFailed')))
    } finally {
      setIsBusy(false)
    }
  }

  const deleteTeam = async () => {
    if (!deleteTarget) return
    setIsBusy(true)
    setDialogError(null)
    setNotice(null)
    try {
      const response = await apiClient.api.teams[':id'].$delete({
        param: { id: deleteTarget.id },
      })
      if (!response.ok) {
        throw new Error(
          await readApiError(response, t('teams.operationFailed')),
        )
      }
      setDeleteTarget(null)
      setNotice(t('teams.teamDeleted'))
      setRefreshVersion((version) => version + 1)
    } catch (reason) {
      setDialogError(getErrorMessage(reason, t('teams.operationFailed')))
    } finally {
      setIsBusy(false)
    }
  }

  const makeDefaultTeam = async (selectedTeam: TeamSummary) => {
    setIsBusy(true)
    setDialogError(null)
    setNotice(null)
    try {
      const response = await apiClient.api.teams[':id'].default.$post({
        param: { id: selectedTeam.id },
      })
      if (!response.ok) {
        throw new Error(
          await readApiError(response, t('teams.operationFailed')),
        )
      }
      const result = await response.json()
      setTeams((current) =>
        current.map((team) =>
          team.id === result.team.id
            ? result.team
            : { ...team, isDefault: false },
        ),
      )
      setEditTarget((current) =>
        current?.id === result.team.id ? result.team : current,
      )
      setNotice(t('teams.defaultUpdated'))
    } catch (reason) {
      const message = getErrorMessage(reason, t('teams.operationFailed'))
      if (editTarget?.id === selectedTeam.id) setDialogError(message)
      else setError(message)
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <div className="grid gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold tracking-[0.12em] text-primary uppercase">
            {t('teams.eyebrow')}
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight">
            {t('teams.title')}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {t('teams.description')}
          </p>
        </div>
        <div className="flex gap-2 self-start sm:self-auto">
          <Button
            variant="outline"
            disabled={isLoading}
            onClick={() => setRefreshVersion((version) => version + 1)}
          >
            <RefreshCw
              className={cn('size-4', isLoading && 'animate-spin')}
              aria-hidden
            />
            {t('teams.refresh')}
          </Button>
          {canManage && (
            <Button onClick={openCreateDialog}>
              <Plus className="size-4" aria-hidden />
              {t('teams.addTeam')}
            </Button>
          )}
        </div>
      </header>

      {notice && (
        <p
          className="rounded-xl border border-success/30 bg-success/10 p-3 text-sm text-success"
          role="status"
        >
          {notice}
        </p>
      )}
      {error && (
        <p
          className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}

      <section className="grid gap-4 rounded-2xl border bg-card p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-bold">{t('teams.directory')}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {t('teams.teamCount', { count: visibleTeams.length })}
            </p>
          </div>
          <SearchBox
            className="w-full sm:max-w-sm"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('teams.searchPlaceholder')}
            aria-label={t('teams.searchLabel')}
          />
        </div>

        {isLoading && teams.length === 0 ? (
          <div className="grid gap-2" role="status">
            <span className="sr-only">{t('teams.loading')}</span>
            {[0, 1, 2].map((row) => (
              <div
                key={row}
                className="h-16 animate-pulse rounded-lg bg-muted"
              />
            ))}
          </div>
        ) : visibleTeams.length === 0 ? (
          <EmptyState
            icon={
              search ? (
                <SearchX className="size-5" aria-hidden />
              ) : (
                <UsersRound className="size-5" aria-hidden />
              )
            }
            title={search ? t('teams.noMatches') : t('teams.noTeams')}
            description={
              search
                ? t('teams.noMatchesDescription')
                : t('teams.noTeamsDescription')
            }
            action={
              !search && canManage ? (
                <Button size="sm" onClick={openCreateDialog}>
                  <Plus className="size-4" aria-hidden />
                  {t('teams.addTeam')}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('teams.team')}</TableHead>
                <TableHead>{t('teams.slug')}</TableHead>
                <TableHead>{t('teams.members')}</TableHead>
                <TableHead>{t('teams.updated')}</TableHead>
                <TableHead className="text-right">
                  {t('teams.actions')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleTeams.map((team) => (
                <TableRow key={team.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span
                        className="size-3 shrink-0 rounded-full ring-2 ring-border ring-offset-2 ring-offset-card"
                        style={{ backgroundColor: team.color }}
                        aria-hidden
                      />
                      <div>
                        <p className="flex items-center gap-1.5 font-semibold">
                          {team.name}
                          {team.isDefault && (
                            <Star
                              className="size-3.5 fill-warning text-warning"
                              aria-label={t('teams.defaultNamed', {
                                name: team.name,
                              })}
                            />
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {team.color}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <code className="rounded bg-muted px-2 py-1 text-xs">
                      {team.slug}
                    </code>
                  </TableCell>
                  <TableCell>
                    {team.members.length === 0 ? (
                      <span className="text-sm text-muted-foreground">
                        {t('teams.noMembers')}
                      </span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="flex -space-x-2">
                          {team.members.slice(0, 3).map((member) => (
                            <Avatar
                              key={member.id}
                              className="ring-2 ring-card"
                              name={member.name || member.email}
                              size="sm"
                            />
                          ))}
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {t('teams.memberCount', {
                            count: team.members.length,
                          })}
                        </span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {formatDate(team.updatedAt, i18n.language)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {canManage && (
                        <>
                          <Button
                            className="size-8"
                            size="icon"
                            variant="ghost"
                            disabled={team.isDefault || isBusy}
                            aria-label={
                              team.isDefault
                                ? t('teams.defaultNamed', { name: team.name })
                                : t('teams.makeDefaultNamed', {
                                    name: team.name,
                                  })
                            }
                            onClick={() => void makeDefaultTeam(team)}
                          >
                            <Star
                              className={cn(
                                'size-4',
                                team.isDefault && 'fill-warning text-warning',
                              )}
                              aria-hidden
                            />
                          </Button>
                          <Button
                            className="size-8"
                            size="icon"
                            variant="ghost"
                            aria-label={t('teams.editNamed', {
                              name: team.name,
                            })}
                            onClick={() => openEditDialog(team)}
                          >
                            <Pencil className="size-4" aria-hidden />
                          </Button>
                          <Button
                            className="size-8"
                            size="icon"
                            variant="ghost"
                            aria-label={t('teams.deleteNamed', {
                              name: team.name,
                            })}
                            onClick={() => {
                              setDialogError(null)
                              setDeleteTarget(team)
                            }}
                          >
                            <Trash2 className="size-4" aria-hidden />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <Dialog
        size="lg"
        open={isCreateOpen || Boolean(editTarget)}
        onOpenChange={(open) => !open && closeForm()}
        title={editTarget ? t('teams.editTitle') : t('teams.addTitle')}
        description={
          editTarget ? t('teams.editDescription') : t('teams.addDescription')
        }
        icon={
          <span
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"
            aria-hidden
          >
            <UsersRound className="size-5" />
          </span>
        }
      >
        <form
          className="grid w-full gap-4"
          onSubmit={(event) => void saveTeam(event)}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              required
              autoFocus
              label={t('teams.name')}
              value={form.name}
              maxLength={100}
              onChange={(event) => changeName(event.target.value)}
            />
            <Input
              required
              label={t('teams.slug')}
              hint={t('teams.slugHint')}
              value={form.slug}
              maxLength={80}
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              onChange={(event) => {
                setSlugWasEdited(true)
                setForm((current) => ({
                  ...current,
                  slug: toSlug(event.target.value),
                }))
              }}
            />
          </div>
          <Input
            required
            label={t('teams.color')}
            hint={t('teams.colorHint')}
            type="color"
            value={form.color}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                color: event.target.value,
              }))
            }
          />
          <div className="grid gap-1.5 text-sm">
            <label className="font-semibold" htmlFor="team-default">
              {t('teams.default')}
            </label>
            <div className="flex">
              <input
                id="team-default"
                className="h-10 min-w-0 flex-1 rounded-l-lg border border-input bg-muted px-3.5 text-sm text-foreground shadow-xs outline-none"
                readOnly
                aria-describedby="team-default-description"
                value={
                  editTarget?.isDefault
                    ? t('teams.defaultValue')
                    : t('teams.notDefaultValue')
                }
              />
              <Button
                className="rounded-l-none border-l-0"
                type="button"
                variant="outline"
                disabled={!editTarget || editTarget.isDefault || isBusy}
                onClick={() => {
                  if (editTarget) void makeDefaultTeam(editTarget)
                }}
              >
                <Star className="size-4" aria-hidden />
                {t('teams.makeDefault')}
              </Button>
            </div>
            <span
              id="team-default-description"
              className="min-h-4 text-xs leading-4 text-muted-foreground"
            >
              {editTarget
                ? t('teams.defaultHint')
                : t('teams.saveBeforeDefault')}
            </span>
          </div>
          <fieldset className="grid gap-3 rounded-xl border bg-muted/20 p-4">
            <legend className="px-1 text-sm font-semibold">
              {t('teams.members')}
            </legend>
            <p className="text-xs leading-5 text-muted-foreground">
              {t('teams.membersHint')}
            </p>
            {organizationMembers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('teams.noOrganizationMembers')}
              </p>
            ) : (
              <div className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">
                {organizationMembers.map((member) => (
                  <Checkbox
                    key={member.id}
                    className="w-full rounded-lg border bg-card p-3"
                    checked={form.userIds.includes(member.id)}
                    disabled={isBusy}
                    label={member.name || member.email}
                    description={`${member.email} · ${translateRole(member.role, t)}`}
                    onChange={(event) =>
                      toggleMember(member.id, event.target.checked)
                    }
                  />
                ))}
              </div>
            )}
          </fieldset>
          <DialogError message={dialogError} />
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button
              type="button"
              variant="ghost"
              disabled={isBusy}
              onClick={closeForm}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" isLoading={isBusy}>
              {editTarget ? t('teams.saveTeam') : t('teams.createTeam')}
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !isBusy) {
            setDeleteTarget(null)
            setDialogError(null)
          }
        }}
        title={t('teams.deleteTitle')}
        description={t('teams.deleteDescription', {
          name: deleteTarget?.name ?? '',
        })}
        icon={
          <span
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-destructive/10 text-destructive"
            aria-hidden
          >
            <Trash2 className="size-5" />
          </span>
        }
      >
        <div className="grid w-full gap-4">
          <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {t('teams.deleteWarning')}
          </p>
          <DialogError message={dialogError} />
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button
              variant="ghost"
              disabled={isBusy}
              onClick={() => setDeleteTarget(null)}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              isLoading={isBusy}
              onClick={() => void deleteTeam()}
            >
              {t('teams.deleteTeam')}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}

function DialogError({ message }: { message: string | null }) {
  return message ? (
    <p
      className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive"
      role="alert"
    >
      {message}
    </p>
  ) : null
}

function toSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function translateRole(
  role: string,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  const normalizedRole = role.split(',')[0]?.trim()
  if (normalizedRole === 'owner') return t('organizations.roles.owner')
  if (normalizedRole === 'admin') return t('organizations.roles.admin')
  return t('organizations.roles.member')
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
