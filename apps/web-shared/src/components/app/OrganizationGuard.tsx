import { Building2, LoaderCircle, Mail } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type SubmitEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import { apiClient } from '../../api'
import { authClient } from '../../auth/auth-client'
import { useAuth } from '../../auth/AuthProvider'
import {
  applyOrganizationPrimaryColor,
  Button,
  DEFAULT_PRIMARY_COLOR,
  Dialog,
  Input,
} from '@mba-desk/ui'
import { OrganizationLogo } from './OrganizationLogo'
import { OrganizationLogoPicker } from './OrganizationLogoPicker'
import { uploadOrganizationLogo } from './organization-logo-api'

interface PendingInvitation {
  id: string
  organizationId: string
  organizationName: string
  role: string
  expiresAt: string
}

export function OrganizationGuard({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const { refetch: refetchSession } = useAuth()
  const organizationsQuery = authClient.useListOrganizations()
  const activeOrganizationQuery = authClient.useActiveOrganization()
  const organizations = organizationsQuery.data ?? []
  const activeOrganization = activeOrganizationQuery.data
  const attemptedOrganizationId = useRef<string | null>(null)
  const [retryVersion, setRetryVersion] = useState(0)
  const [isActivating, setIsActivating] = useState(false)
  const [activationError, setActivationError] = useState<string | null>(null)
  const [organizationName, setOrganizationName] = useState('')
  const [organizationSlug, setOrganizationSlug] = useState('')
  const [primaryColor, setPrimaryColor] = useState(DEFAULT_PRIMARY_COLOR)
  const [organizationLogo, setOrganizationLogo] = useState<Blob | null>(null)
  const [slugWasEdited, setSlugWasEdited] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [creationError, setCreationError] = useState<string | null>(null)
  const [pendingInvitations, setPendingInvitations] = useState<
    PendingInvitation[]
  >([])
  const [isLoadingInvitations, setIsLoadingInvitations] = useState(true)
  const [invitationInProgress, setInvitationInProgress] = useState<
    string | null
  >(null)
  const [invitationError, setInvitationError] = useState<string | null>(null)

  const loadInvitations = useCallback(async () => {
    setIsLoadingInvitations(true)
    setInvitationError(null)
    try {
      const response = await apiClient.api['organization-invitations'].$get()
      if (!response.ok) throw new Error()
      setPendingInvitations(await response.json())
    } catch (reason) {
      setInvitationError(
        getErrorMessage(reason, t('organizations.operationFailed')),
      )
    } finally {
      setIsLoadingInvitations(false)
    }
  }, [t])

  useEffect(() => {
    void loadInvitations()
  }, [loadInvitations])

  useEffect(() => {
    if (activeOrganization) {
      applyOrganizationPrimaryColor(activeOrganization.primaryColor)
    }
  }, [activeOrganization])

  useEffect(() => {
    if (activeOrganization) {
      attemptedOrganizationId.current = null
      setActivationError(null)
      return
    }

    const firstOrganization = organizations[0]
    if (
      !firstOrganization ||
      organizationsQuery.isPending ||
      activeOrganizationQuery.isPending ||
      isCreating ||
      attemptedOrganizationId.current === firstOrganization.id
    ) {
      return
    }

    attemptedOrganizationId.current = firstOrganization.id
    setIsActivating(true)
    setActivationError(null)

    void authClient.organization
      .setActive({ organizationId: firstOrganization.id })
      .then(async (result) => {
        if (result.error) throw new Error(result.error.message)
        await Promise.all([activeOrganizationQuery.refetch(), refetchSession()])
      })
      .catch((reason: unknown) => {
        setActivationError(
          getErrorMessage(reason, t('organizations.operationFailed')),
        )
      })
      .finally(() => {
        setIsActivating(false)
      })
  }, [
    activeOrganization,
    activeOrganizationQuery,
    isCreating,
    organizations,
    organizationsQuery.isPending,
    refetchSession,
    retryVersion,
    t,
  ])

  const createOrganization = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    void submitOrganization()
  }

  const submitOrganization = async () => {
    setIsCreating(true)
    setCreationError(null)

    try {
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

      await Promise.all([
        organizationsQuery.refetch(),
        activeOrganizationQuery.refetch(),
        refetchSession(),
      ])

      setOrganizationName('')
      setOrganizationSlug('')
      setPrimaryColor(DEFAULT_PRIMARY_COLOR)
      setOrganizationLogo(null)
      setSlugWasEdited(false)
    } catch (reason) {
      setCreationError(
        getErrorMessage(reason, t('organizations.organizationNotCreated')),
      )
    } finally {
      setIsCreating(false)
    }
  }

  const respondToInvitation = async (
    invitation: PendingInvitation,
    response: 'accept' | 'reject',
  ) => {
    setInvitationInProgress(invitation.id)
    setInvitationError(null)

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
        organizationsQuery.refetch(),
        activeOrganizationQuery.refetch(),
        refetchSession(),
        loadInvitations(),
      ])
    } catch (reason) {
      setInvitationError(
        getErrorMessage(reason, t('organizations.operationFailed')),
      )
    } finally {
      setInvitationInProgress(null)
    }
  }

  const queryError =
    organizationsQuery.error ?? activeOrganizationQuery.error ?? null

  if (queryError) {
    return (
      <OrganizationStatus
        title={t('organizations.loadFailedTitle')}
        description={getErrorMessage(
          queryError,
          t('organizations.operationFailed'),
        )}
        action={
          <Button
            variant="outline"
            onClick={() => {
              void Promise.all([
                organizationsQuery.refetch(),
                activeOrganizationQuery.refetch(),
              ])
            }}
          >
            {t('organizations.tryAgain')}
          </Button>
        }
      />
    )
  }

  if (
    organizationsQuery.isPending ||
    activeOrganizationQuery.isPending ||
    (organizations.length === 0 && isLoadingInvitations) ||
    isActivating
  ) {
    return (
      <OrganizationStatus
        title={t('organizations.preparingWorkspace')}
        description={
          organizations.length === 0 && isLoadingInvitations
            ? t('organizations.pendingInvitationsDescription')
            : t('organizations.selectingOrganization')
        }
        isLoading
      />
    )
  }

  if (organizations.length > 0 && !activeOrganization) {
    return (
      <OrganizationStatus
        title={t('organizations.selectionFailedTitle')}
        description={activationError ?? t('organizations.selectToContinue')}
        action={
          <Button
            onClick={() => {
              attemptedOrganizationId.current = null
              setRetryVersion((version) => version + 1)
            }}
          >
            {t('organizations.tryAgain')}
          </Button>
        }
      />
    )
  }

  return (
    <>
      {children}
      <Dialog
        open={organizations.length === 0}
        onOpenChange={() => undefined}
        dismissible={false}
        title={t(
          pendingInvitations.length > 0
            ? 'organizations.pendingInvitations'
            : 'organizations.createTitle',
        )}
        description={
          pendingInvitations.length > 0
            ? t('organizations.pendingInvitationsDescription')
            : t('organizations.requiredDescription')
        }
        icon={<OrganizationLogo organization={null} className="size-10" />}
      >
        <form className="grid w-full gap-4" onSubmit={createOrganization}>
          {pendingInvitations.map((invitation) => (
            <article
              key={invitation.id}
              className="flex flex-col gap-3 rounded-xl border bg-background p-4 sm:flex-row sm:items-center"
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
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={invitationInProgress !== null || isCreating}
                  onClick={() => void respondToInvitation(invitation, 'reject')}
                >
                  {t('organizations.rejectInvitation')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  isLoading={invitationInProgress === invitation.id}
                  disabled={invitationInProgress !== null || isCreating}
                  onClick={() => void respondToInvitation(invitation, 'accept')}
                >
                  {t('organizations.acceptInvitation')}
                </Button>
              </div>
            </article>
          ))}
          {pendingInvitations.length > 0 && <div className="border-t" />}
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
            disabled={isCreating}
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
            disabled={isCreating}
          />
          <Input
            label={t('organizations.primaryColor')}
            hint={t('organizations.primaryColorHint')}
            type="color"
            value={primaryColor}
            onChange={(event) => setPrimaryColor(event.target.value)}
            disabled={isCreating}
          />
          <OrganizationLogoPicker
            value={organizationLogo}
            onChange={(logo) => setOrganizationLogo(logo)}
            disabled={isCreating}
          />
          {creationError && (
            <p className="text-sm text-destructive" role="alert">
              {creationError}
            </p>
          )}
          {invitationError && (
            <div className="grid gap-2" role="alert">
              <p className="text-sm text-destructive">{invitationError}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadInvitations()}
              >
                {t('organizations.tryAgain')}
              </Button>
            </div>
          )}
          <Button type="submit" isLoading={isCreating}>
            {t('organizations.createAction')}
          </Button>
        </form>
      </Dialog>
    </>
  )
}

function OrganizationStatus({
  title,
  description,
  isLoading = false,
  action,
}: {
  title: string
  description: string
  isLoading?: boolean
  action?: ReactNode
}) {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="grid max-w-md justify-items-center gap-3 text-center">
        {isLoading ? (
          <LoaderCircle className="size-7 animate-spin text-primary" />
        ) : (
          <Building2 className="size-7 text-primary" />
        )}
        <h1 className="text-lg font-bold">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
        {action}
      </div>
    </div>
  )
}

function toSlug(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function getErrorMessage(_reason: unknown, fallback: string) {
  return fallback
}
