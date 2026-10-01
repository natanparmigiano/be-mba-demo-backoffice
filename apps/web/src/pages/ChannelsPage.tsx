import {
  ArrowLeft,
  Check,
  Clipboard,
  Eye,
  EyeOff,
  AlertTriangle,
  KeyRound,
  LoaderCircle,
  Pencil,
  Phone,
  Plus,
  QrCode,
  RadioTower,
  RefreshCw,
  Trash2,
  Webhook,
} from 'lucide-react'
import type { InferResponseType } from 'hono/client'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type SubmitEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { apiClient } from '../api'
import { authClient } from '../auth/auth-client'
import {
  emptyChannelQrState,
  fetchChannelQrState,
  type ChannelQrState,
} from '../channel-qr'
import { ChannelQrCode } from '../components/channel-qr-code'
import {
  ConversationalComponentsSettingsCard,
  QrCodesSettingsCard,
} from '../components/channel-management-cards'
import { SettingsCard } from '../components/settings-card'
import {
  Button,
  cn,
  Dialog,
  EmptyState,
  Input,
  Pill,
  Tabs,
  Textarea,
} from '../components/ui'

interface ChannelSummary {
  id: number
  type: 'whatsapp'
  waPhoneNumber: string
  waPhoneNumberId: string
  waWabaId: string
  waBusinessId: string
  waAppId: string
  webhookForwardUrls: string[]
  hasWaAppSecret: boolean
  hasWaWebhookVerifyToken: boolean
  hasWaSystemUserAccessToken: boolean
  createdAt: string
  updatedAt: string
}

interface ChannelFormValues {
  waPhoneNumber: string
  waPhoneNumberId: string
  waWabaId: string
  waBusinessId: string
  waAppId: string
  waAppSecret: string
  waWebhookVerifyToken: string
  waSystemUserAccessToken: string
  webhookForwardUrls: string
}

type ChannelDialog =
  | 'create'
  | 'edit'
  | 'delete'
  | 'set-webhook'
  | 'qr-code'
  | 'register-number'
  | 'deregister-number'
  | null
type RegistrationStatus = 'loading' | 'registered' | 'unregistered' | 'error'
interface RegistrationState {
  status: RegistrationStatus
  providerStatus: string | null
  displayPhoneNumber: string | null
  verifiedName: string | null
}
type ChannelDeletionPreview = InferResponseType<
  (typeof apiClient.api.channels)[':id']['deletion-impact']['$get'],
  200
>['impact']

const emptyForm: ChannelFormValues = {
  waPhoneNumber: '',
  waPhoneNumberId: '',
  waWabaId: '',
  waBusinessId: '',
  waAppId: '',
  waAppSecret: '',
  waWebhookVerifyToken: '',
  waSystemUserAccessToken: '',
  webhookForwardUrls: '',
}

export function ChannelsPage() {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const { channelId: channelIdParam } = useParams<{ channelId: string }>()
  const isCreatePage = location.pathname === '/channels/new'
  const routeChannelId = parsePositiveInteger(channelIdParam ?? null)
  const isFormPage = isCreatePage || channelIdParam !== undefined
  const activeOrganizationQuery = authClient.useActiveOrganization()
  const activeMemberRoleQuery = authClient.useActiveMemberRole()
  const activeOrganization = activeOrganizationQuery.data
  const canManage = (activeMemberRoleQuery.data?.role ?? '')
    .split(',')
    .map((role) => role.trim())
    .some((role) => role === 'owner' || role === 'admin')

  const [channels, setChannels] = useState<ChannelSummary[]>([])
  const [registrationStates, setRegistrationStates] = useState<
    Record<number, RegistrationState>
  >({})
  const [qrStates, setQrStates] = useState<Record<number, ChannelQrState>>({})
  const [dialog, setDialog] = useState<ChannelDialog>(null)
  const [selectedChannel, setSelectedChannel] = useState<ChannelSummary | null>(
    null,
  )
  const [form, setForm] = useState<ChannelFormValues>(emptyForm)
  const [isLoading, setIsLoading] = useState(true)
  const [isBusy, setIsBusy] = useState(false)
  const [isRegistrationBusy, setIsRegistrationBusy] = useState(false)
  const [registrationPin, setRegistrationPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [deletionPreview, setDeletionPreview] =
    useState<ChannelDeletionPreview | null>(null)
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [isLoadingDeletionPreview, setIsLoadingDeletionPreview] =
    useState(false)
  const deletionPreviewRequestId = useRef(0)

  useEffect(() => {
    document.title = `${t('channels.title')} · ${t('design.brand')}`
    document
      .querySelector<HTMLMetaElement>('meta[name="description"]')
      ?.setAttribute('content', t('channels.metaDescription'))
  }, [t])

  const refreshChannels = useCallback(async () => {
    if (!activeOrganization?.id) {
      setChannels([])
      setRegistrationStates({})
      setQrStates({})
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const response = await apiClient.api.channels.$get()
      if (!response.ok)
        throw new Error(
          await readApiError(response, t('channels.requestFailed')),
        )
      const data = await response.json()
      setChannels(data.channels)
      setRegistrationStates(
        Object.fromEntries(
          data.channels.map((channel) => [
            channel.id,
            emptyRegistrationState('loading'),
          ]),
        ),
      )
      setQrStates(
        Object.fromEntries(
          data.channels.map((channel) => [
            channel.id,
            emptyChannelQrState('loading'),
          ]),
        ),
      )
      await Promise.all(
        data.channels.map(async (channel) => {
          const [state, qrState] = await Promise.all([
            fetchRegistrationState(channel.id),
            fetchChannelQrState(channel.id),
          ])
          setRegistrationStates((current) => ({
            ...current,
            [channel.id]: state,
          }))
          setQrStates((current) => ({
            ...current,
            [channel.id]: qrState,
          }))
        }),
      )
    } catch (reason) {
      setError(getErrorMessage(reason, t('channels.operationFailed')))
    } finally {
      setIsLoading(false)
    }
  }, [activeOrganization?.id, t])

  useEffect(() => {
    void refreshChannels()
  }, [refreshChannels])

  const closeDialog = () => {
    if (isBusy || isRegistrationBusy) return
    deletionPreviewRequestId.current += 1
    setDialog(null)
    setSelectedChannel(null)
    setDialogError(null)
    setDeletionPreview(null)
    setDeleteConfirmation('')
    setRegistrationPin('')
    setIsLoadingDeletionPreview(false)
    if (isFormPage) navigate('/channels')
  }

  const openCreateDialog = () => {
    setForm({ ...emptyForm, waWebhookVerifyToken: generateVerifyToken() })
    setSelectedChannel(null)
    setDialogError(null)
    navigate('/channels/new')
  }

  const openEditDialog = useCallback(
    (channel: ChannelSummary) => {
      setSelectedChannel(channel)
      setForm({
        waPhoneNumber: channel.waPhoneNumber,
        waPhoneNumberId: channel.waPhoneNumberId,
        waWabaId: channel.waWabaId,
        waBusinessId: channel.waBusinessId,
        waAppId: channel.waAppId,
        waAppSecret: '',
        waWebhookVerifyToken: '',
        waSystemUserAccessToken: '',
        webhookForwardUrls: channel.webhookForwardUrls.join('\n'),
      })
      setDialogError(null)
      setRegistrationPin('')
      navigate(`/channels/${channel.id}`)
    },
    [navigate],
  )

  useEffect(() => {
    if (isCreatePage) {
      setForm({ ...emptyForm, waWebhookVerifyToken: generateVerifyToken() })
      setSelectedChannel(null)
      setDialogError(null)
      setDialog('create')
      return
    }
    const requestedChannelId = routeChannelId
    if (!requestedChannelId) return
    const requestedChannel = channels.find(
      (channel) => channel.id === requestedChannelId,
    )
    if (!requestedChannel) return
    setSelectedChannel(requestedChannel)
    setForm({
      waPhoneNumber: requestedChannel.waPhoneNumber,
      waPhoneNumberId: requestedChannel.waPhoneNumberId,
      waWabaId: requestedChannel.waWabaId,
      waBusinessId: requestedChannel.waBusinessId,
      waAppId: requestedChannel.waAppId,
      waAppSecret: '',
      waWebhookVerifyToken: '',
      waSystemUserAccessToken: '',
      webhookForwardUrls: requestedChannel.webhookForwardUrls.join('\n'),
    })
    setDialogError(null)
    setRegistrationPin('')
    setDialog('edit')
  }, [channels, isCreatePage, routeChannelId])

  const openDeleteDialog = async (channel: ChannelSummary) => {
    const requestId = ++deletionPreviewRequestId.current
    setSelectedChannel(channel)
    setDeletionPreview(null)
    setDeleteConfirmation('')
    setDialogError(null)
    setIsLoadingDeletionPreview(true)
    setDialog('delete')

    try {
      const response = await apiClient.api.channels[':id'][
        'deletion-impact'
      ].$get({ param: { id: String(channel.id) } })
      if (!response.ok) {
        throw new Error(
          await readApiError(response, t('channels.deletionPreviewFailed')),
        )
      }
      if (deletionPreviewRequestId.current !== requestId) return
      setDeletionPreview((await response.json()).impact)
    } catch (reason) {
      if (deletionPreviewRequestId.current === requestId) {
        setDialogError(
          getErrorMessage(reason, t('channels.deletionPreviewFailed')),
        )
      }
    } finally {
      if (deletionPreviewRequestId.current === requestId) {
        setIsLoadingDeletionPreview(false)
      }
    }
  }

  const saveChannel = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsBusy(true)
    setDialogError(null)
    setNotice(null)

    try {
      const values = trimForm(form)
      let response: Response
      if (isCreatePage) {
        response = await apiClient.api.channels.$post({ json: values })
      } else if (selectedChannel) {
        const secrets = {
          ...(values.waAppSecret ? { waAppSecret: values.waAppSecret } : {}),
          ...(values.waWebhookVerifyToken
            ? { waWebhookVerifyToken: values.waWebhookVerifyToken }
            : {}),
          ...(values.waSystemUserAccessToken
            ? { waSystemUserAccessToken: values.waSystemUserAccessToken }
            : {}),
        }
        response = await apiClient.api.channels[':id'].$patch({
          param: { id: String(selectedChannel.id) },
          json: {
            waPhoneNumber: values.waPhoneNumber,
            waPhoneNumberId: values.waPhoneNumberId,
            waWabaId: values.waWabaId,
            waBusinessId: values.waBusinessId,
            waAppId: values.waAppId,
            webhookForwardUrls: values.webhookForwardUrls,
            ...secrets,
          },
        })
      } else {
        throw new Error(t('channels.noChannelSelected'))
      }

      if (!response.ok)
        throw new Error(
          await readApiError(response, t('channels.requestFailed')),
        )
      await refreshChannels()
      setDialog(null)
      setSelectedChannel(null)
      setNotice(
        isCreatePage
          ? t('channels.channelCreated')
          : t('channels.channelUpdated'),
      )
      navigate('/channels')
    } catch (reason) {
      setDialogError(getErrorMessage(reason, t('channels.operationFailed')))
    } finally {
      setIsBusy(false)
    }
  }

  const deleteChannel = async () => {
    if (
      !selectedChannel ||
      !deletionPreview ||
      deleteConfirmation !== deletionPreview.confirmationText
    ) {
      return
    }
    setIsBusy(true)
    setDialogError(null)
    setNotice(null)

    try {
      const response = await apiClient.api.channels[':id'].$delete({
        param: { id: String(selectedChannel.id) },
        json: { confirmation: deleteConfirmation },
      })
      if (!response.ok)
        throw new Error(
          await readApiError(response, t('channels.requestFailed')),
        )
      await refreshChannels()
      setDialog(null)
      setSelectedChannel(null)
      setDeletionPreview(null)
      setDeleteConfirmation('')
      setNotice(t('channels.channelDeleted'))
    } catch (reason) {
      setDialogError(getErrorMessage(reason, t('channels.operationFailed')))
    } finally {
      setIsBusy(false)
    }
  }

  const setChannelWebhook = async () => {
    if (!selectedChannel) return
    const callbackUrl = `${window.location.origin}/api/wa-cloud/webhook/${selectedChannel.id}`
    setIsBusy(true)
    setDialogError(null)
    setNotice(null)

    try {
      const response = await apiClient.api.channels[':id']['set-webhook'].$post(
        {
          param: { id: String(selectedChannel.id) },
          json: { callbackUrl },
        },
      )
      if (!response.ok)
        throw new Error(
          await readApiError(response, t('channels.requestFailed')),
        )
      const result = await response.json()
      setDialog(null)
      setSelectedChannel(null)
      setNotice(t('channels.webhookSet', { url: result.callbackUrl }))
    } catch (reason) {
      setDialogError(getErrorMessage(reason, t('channels.operationFailed')))
    } finally {
      setIsBusy(false)
    }
  }

  const openRegistrationDialog = (
    channel: ChannelSummary,
    status: RegistrationStatus,
  ) => {
    if (status !== 'registered' && status !== 'unregistered') return
    setSelectedChannel(channel)
    setRegistrationPin('')
    setDialogError(null)
    setDialog(status === 'registered' ? 'deregister-number' : 'register-number')
  }

  const updateRegistration = async (
    action: 'register' | 'deregister',
    closeAfter: boolean,
  ) => {
    if (!selectedChannel) return
    if (action === 'register' && !/^\d{6}$/.test(registrationPin)) return
    setIsRegistrationBusy(true)
    setDialogError(null)
    setNotice(null)
    try {
      const response =
        action === 'register'
          ? await apiClient.api.channels[':id'].registration.register.$post({
              param: { id: String(selectedChannel.id) },
              json: { pin: registrationPin },
            })
          : await apiClient.api.channels[':id'].registration.deregister.$post({
              param: { id: String(selectedChannel.id) },
            })
      if (!response.ok) {
        throw new Error(
          await readApiError(response, t('channels.registration.failed')),
        )
      }
      const state = await fetchRegistrationState(selectedChannel.id)
      setRegistrationStates((current) => ({
        ...current,
        [selectedChannel.id]: state,
      }))
      setRegistrationPin('')
      setNotice(
        t(
          action === 'register'
            ? 'channels.registration.registeredNotice'
            : 'channels.registration.deregisteredNotice',
        ),
      )
      if (closeAfter) {
        setDialog(null)
        setSelectedChannel(null)
      }
    } catch (reason) {
      setDialogError(getErrorMessage(reason, t('channels.registration.failed')))
    } finally {
      setIsRegistrationBusy(false)
    }
  }

  if (isFormPage) {
    if (!isCreatePage && isLoading && !selectedChannel) {
      return (
        <div className="grid min-h-80 place-items-center" role="status">
          <LoaderCircle
            className="size-7 animate-spin text-primary"
            aria-hidden
          />
          <span className="sr-only">{t('channels.loadingChannels')}</span>
        </div>
      )
    }
    if (!isCreatePage && !selectedChannel) {
      return (
        <EmptyState
          icon={<RadioTower className="size-5" aria-hidden />}
          title={t('channels.noChannelSelected')}
          description={t('channels.noChannelsDescription')}
          action={
            <Button onClick={() => navigate('/channels')}>
              <ArrowLeft className="size-4" aria-hidden />
              {t('channels.backToChannels')}
            </Button>
          }
        />
      )
    }

    return (
      <ChannelFormPage
        mode={isCreatePage ? 'create' : 'edit'}
        open
        form={form}
        setForm={setForm}
        isBusy={isBusy}
        error={dialogError}
        canManage={canManage}
        registrationPin={registrationPin}
        registrationState={
          selectedChannel
            ? (registrationStates[selectedChannel.id] ??
              emptyRegistrationState('loading'))
            : emptyRegistrationState('loading')
        }
        qrState={
          selectedChannel
            ? (qrStates[selectedChannel.id] ?? emptyChannelQrState('loading'))
            : emptyChannelQrState('loading')
        }
        channelId={selectedChannel?.id ?? null}
        isRegistrationBusy={isRegistrationBusy}
        setRegistrationPin={setRegistrationPin}
        onClose={closeDialog}
        onRegister={() => void updateRegistration('register', false)}
        onDeregister={() => void updateRegistration('deregister', false)}
        onQrCreated={() => {
          if (!selectedChannel) return
          setQrStates((current) => ({
            ...current,
            [selectedChannel.id]: emptyChannelQrState('loading'),
          }))
          void fetchChannelQrState(selectedChannel.id).then((state) =>
            setQrStates((current) => ({
              ...current,
              [selectedChannel.id]: state,
            })),
          )
        }}
        onSubmit={(event) => void saveChannel(event)}
      />
    )
  }

  return (
    <div className="grid gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold tracking-[0.12em] text-primary uppercase">
            {t('channels.eyebrow')}
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight">
            {t('channels.title')}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {t('channels.description', {
              organization:
                activeOrganization?.name ?? t('channels.activeOrganization'),
            })}
          </p>
        </div>
        {canManage && (
          <Button
            className="self-start sm:self-auto"
            onClick={openCreateDialog}
          >
            <Plus className="size-4" aria-hidden />
            {t('channels.newChannel')}
          </Button>
        )}
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

      <section className="rounded-2xl border bg-card p-5 sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold">{t('channels.connectedChannels')}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {t('channels.channelCount', { count: channels.length })}
            </p>
          </div>
          <Button
            className="size-9"
            variant="ghost"
            size="icon"
            disabled={isLoading}
            onClick={() => void refreshChannels()}
            aria-label={t('channels.refreshChannels')}
          >
            <RefreshCw
              className={cn('size-4', isLoading && 'animate-spin')}
              aria-hidden
            />
          </Button>
        </div>

        {isLoading && channels.length === 0 ? (
          <div className="grid gap-4 lg:grid-cols-2" role="status">
            <span className="sr-only">{t('channels.loadingChannels')}</span>
            {[0, 1].map((item) => (
              <div
                key={item}
                className="h-80 animate-pulse rounded-2xl bg-muted"
              />
            ))}
          </div>
        ) : channels.length === 0 ? (
          <EmptyState
            icon={<RadioTower className="size-5" aria-hidden />}
            title={t('channels.noChannels')}
            description={t('channels.noChannelsDescription')}
            action={
              canManage ? (
                <Button size="sm" onClick={openCreateDialog}>
                  <Plus className="size-4" aria-hidden />
                  {t('channels.createChannel')}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid items-stretch gap-4 lg:grid-cols-2">
            {channels.map((channel) => (
              <ChannelCard
                key={channel.id}
                channel={channel}
                canManage={canManage}
                registrationState={
                  registrationStates[channel.id] ??
                  emptyRegistrationState('loading')
                }
                onError={setError}
                onEdit={() => openEditDialog(channel)}
                onSetWebhook={() => {
                  setSelectedChannel(channel)
                  setDialogError(null)
                  setDialog('set-webhook')
                }}
                onDelete={() => void openDeleteDialog(channel)}
                onShowQrCode={() => {
                  setSelectedChannel(channel)
                  setDialog('qr-code')
                }}
                onRegistrationAction={() =>
                  openRegistrationDialog(
                    channel,
                    registrationStates[channel.id]?.status ?? 'loading',
                  )
                }
              />
            ))}
          </div>
        )}
      </section>

      <Dialog
        open={dialog === 'qr-code'}
        onOpenChange={(open) => !open && closeDialog()}
        title={t('channels.qr.dialogTitle')}
        description={t('channels.qr.dialogDescription', {
          phone: selectedChannel?.waPhoneNumber,
        })}
        icon={<DialogIcon icon={<QrCode className="size-5" />} />}
      >
        <div className="grid w-full gap-4">
          <ChannelQrCode
            className="border-0 bg-transparent p-0"
            phoneNumber={selectedChannel?.waPhoneNumber ?? ''}
            size="large"
            state={
              selectedChannel
                ? (qrStates[selectedChannel.id] ??
                  emptyChannelQrState('loading'))
                : emptyChannelQrState('loading')
            }
          />
          <div className="flex justify-end">
            <Button variant="ghost" onClick={closeDialog}>
              {t('channels.qr.close')}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={dialog === 'register-number'}
        onOpenChange={(open) => !open && closeDialog()}
        title={t('channels.registration.registerTitle')}
        description={t('channels.registration.registerDescription', {
          phone: selectedChannel?.waPhoneNumber,
        })}
        icon={<DialogIcon icon={<Phone className="size-5" />} />}
      >
        <div className="grid w-full gap-4">
          <Input
            autoComplete="off"
            autoFocus
            disabled={isRegistrationBusy}
            error={
              registrationPin && !/^\d{6}$/.test(registrationPin)
                ? t('channels.registration.pinError')
                : undefined
            }
            inputMode="numeric"
            label={t('channels.registration.pin')}
            maxLength={6}
            value={registrationPin}
            onChange={(event) =>
              setRegistrationPin(event.target.value.replace(/\D/g, ''))
            }
          />
          <DialogError message={dialogError} />
          <div className="flex justify-end gap-2">
            <Button
              disabled={isRegistrationBusy}
              variant="ghost"
              onClick={closeDialog}
            >
              {t('channels.cancel')}
            </Button>
            <Button
              disabled={!/^\d{6}$/.test(registrationPin)}
              isLoading={isRegistrationBusy}
              onClick={() => void updateRegistration('register', true)}
            >
              {t('channels.registration.register')}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={dialog === 'deregister-number'}
        onOpenChange={(open) => !open && closeDialog()}
        title={t('channels.registration.deregisterTitle')}
        description={t('channels.registration.deregisterDescription', {
          phone: selectedChannel?.waPhoneNumber,
        })}
        icon={<DialogIcon icon={<AlertTriangle className="size-5" />} danger />}
      >
        <div className="grid w-full gap-4">
          <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm leading-6 text-destructive">
            {t('channels.registration.deregisterWarning')}
          </p>
          <DialogError message={dialogError} />
          <div className="flex justify-end gap-2">
            <Button
              disabled={isRegistrationBusy}
              variant="ghost"
              onClick={closeDialog}
            >
              {t('channels.cancel')}
            </Button>
            <Button
              isLoading={isRegistrationBusy}
              variant="danger"
              onClick={() => void updateRegistration('deregister', true)}
            >
              {t('channels.registration.deregister')}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={dialog === 'set-webhook'}
        onOpenChange={(open) => !open && closeDialog()}
        title={t('channels.setWebhookTitle')}
        description={t('channels.setWebhookDescription')}
        icon={<DialogIcon icon={<Webhook className="size-5" />} />}
      >
        <div className="grid w-full gap-4">
          <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm leading-6 text-warning-foreground">
            {t('channels.setWebhookWarning', {
              appId: selectedChannel?.waAppId,
            })}
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs font-semibold text-muted-foreground">
              {t('channels.newWebhookUrl')}
            </p>
            <code className="mt-1 block break-all text-xs">
              {selectedChannel
                ? `${window.location.origin}/api/wa-cloud/webhook/${selectedChannel.id}`
                : ''}
            </code>
          </div>
          <DialogError message={dialogError} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" disabled={isBusy} onClick={closeDialog}>
              {t('channels.cancel')}
            </Button>
            <Button isLoading={isBusy} onClick={() => void setChannelWebhook()}>
              {t('channels.setWebhook')}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={dialog === 'delete'}
        onOpenChange={(open) => !open && closeDialog()}
        title={t('channels.deleteTitle')}
        description={t('channels.deleteDescription', {
          channel: selectedChannel?.waPhoneNumber ?? t('channels.thisChannel'),
        })}
        icon={<DialogIcon icon={<Trash2 className="size-5" />} danger />}
      >
        <div className="grid w-full gap-4">
          {isLoadingDeletionPreview ? (
            <p
              className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground"
              role="status"
            >
              {t('channels.loadingDeletionPreview')}
            </p>
          ) : deletionPreview ? (
            <>
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm leading-6 text-destructive">
                {t('channels.deleteWarning')}
              </div>
              <dl className="grid grid-cols-3 gap-2">
                <DeletionImpact
                  label={t('channels.deletionImpact.contacts')}
                  value={deletionPreview.contacts}
                />
                <DeletionImpact
                  label={t('channels.deletionImpact.messages')}
                  value={deletionPreview.messages}
                />
                <DeletionImpact
                  label={t('channels.deletionImpact.groups')}
                  value={deletionPreview.groups}
                />
              </dl>
              <Input
                autoComplete="off"
                autoFocus
                disabled={isBusy}
                hint={t('channels.deleteConfirmationHint', {
                  confirmation: deletionPreview.confirmationText,
                })}
                label={t('channels.deleteConfirmationLabel')}
                value={deleteConfirmation}
                onChange={(event) => setDeleteConfirmation(event.target.value)}
              />
              <p className="text-xs leading-5 text-muted-foreground">
                {t('channels.metaDataUnaffected')}
              </p>
            </>
          ) : null}
          <DialogError message={dialogError} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" disabled={isBusy} onClick={closeDialog}>
              {t('channels.cancel')}
            </Button>
            <Button
              variant="danger"
              disabled={
                !deletionPreview ||
                deleteConfirmation !== deletionPreview.confirmationText
              }
              isLoading={isBusy}
              onClick={() => void deleteChannel()}
            >
              {t('channels.deleteChannel')}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}

function DeletionImpact({ label, value }: { label: string; value: number }) {
  return (
    <div className="grid min-w-0 rounded-xl border bg-muted/25 p-3 text-center">
      <dt
        className="order-2 mt-1 truncate text-[11px] text-muted-foreground"
        title={label}
      >
        {label}
      </dt>
      <dd className="order-1 text-xl font-black tabular-nums">{value}</dd>
    </div>
  )
}

function ChannelCard({
  channel,
  canManage,
  registrationState,
  onError,
  onEdit,
  onSetWebhook,
  onDelete,
  onShowQrCode,
  onRegistrationAction,
}: {
  channel: ChannelSummary
  canManage: boolean
  registrationState: RegistrationState
  onError: (message: string) => void
  onEdit: () => void
  onSetWebhook: () => void
  onDelete: () => void
  onShowQrCode: () => void
  onRegistrationAction: () => void
}) {
  const { t, i18n } = useTranslation()
  const webhookUrl = `${window.location.origin}/api/wa-cloud/webhook/${channel.id}`
  const [verifyToken, setVerifyToken] = useState<string | null>(null)
  const [isTokenVisible, setIsTokenVisible] = useState(false)
  const [isLoadingToken, setIsLoadingToken] = useState(false)
  const [copiedField, setCopiedField] = useState<'url' | 'token' | null>(null)

  useEffect(() => {
    setVerifyToken(null)
    setIsTokenVisible(false)
  }, [channel.updatedAt])

  const loadVerifyToken = async () => {
    if (verifyToken) return verifyToken
    setIsLoadingToken(true)
    try {
      const response = await apiClient.api.channels[':id']['verify-token'].$get(
        {
          param: { id: String(channel.id) },
        },
      )
      if (!response.ok)
        throw new Error(
          await readApiError(response, t('channels.requestFailed')),
        )
      const result = await response.json()
      setVerifyToken(result.token)
      return result.token
    } catch (reason) {
      onError(getErrorMessage(reason, t('channels.operationFailed')))
      return null
    } finally {
      setIsLoadingToken(false)
    }
  }

  const copyValue = async (field: 'url' | 'token') => {
    const value = field === 'url' ? webhookUrl : await loadVerifyToken()
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopiedField(field)
      window.setTimeout(() => setCopiedField(null), 1800)
    } catch {
      onError(
        t(
          field === 'url'
            ? 'channels.copyWebhookUrlFailed'
            : 'channels.copyVerifyTokenFailed',
        ),
      )
    }
  }

  const toggleVerifyToken = async () => {
    if (isTokenVisible) {
      setIsTokenVisible(false)
      return
    }
    if (await loadVerifyToken()) setIsTokenVisible(true)
  }

  return (
    <article className="min-w-0 overflow-hidden rounded-2xl border bg-background shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b p-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-success/12 text-success">
            <Phone className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-lg font-bold">
                {channel.waPhoneNumber}
              </h3>
              <Pill tone="success" dot>
                {t('channels.whatsApp')}
              </Pill>
            </div>
          </div>
        </div>
        <div className="flex gap-1">
          <Button
            className="size-8"
            variant="ghost"
            size="icon"
            onClick={onShowQrCode}
            aria-label={t('channels.qr.openNamed', {
              channel: channel.waPhoneNumber,
            })}
          >
            <QrCode className="size-4" aria-hidden />
          </Button>
          {canManage && (
            <>
              <Button
                className="size-8"
                variant="ghost"
                size="icon"
                onClick={onEdit}
                aria-label={t('channels.editNamed', {
                  channel: channel.waPhoneNumber,
                })}
              >
                <Pencil className="size-4" aria-hidden />
              </Button>
              <Button
                className="size-8 text-destructive"
                variant="ghost"
                size="icon"
                onClick={onDelete}
                aria-label={t('channels.deleteNamed', {
                  channel: channel.waPhoneNumber,
                })}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="p-5">
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <ChannelDatum
            label={t('channels.phoneNumberId')}
            value={channel.waPhoneNumberId}
          />
          <ChannelDatum label={t('channels.wabaId')} value={channel.waWabaId} />
          <ChannelDatum
            label={t('channels.businessId')}
            value={channel.waBusinessId}
          />
          <ChannelDatum label={t('channels.appId')} value={channel.waAppId} />
          <ChannelDatum
            label={t('channels.forwarding')}
            value={t('channels.endpointCount', {
              count: channel.webhookForwardUrls.length,
            })}
          />
        </dl>

        <RegistrationSummary
          className="mt-5"
          canManage={canManage}
          state={registrationState}
          onAction={onRegistrationAction}
        />

        <div className="mt-5 grid gap-3 rounded-xl border bg-card p-3.5">
          <ChannelSecretField
            label={t('channels.webhookUrl')}
            value={webhookUrl}
            copied={copiedField === 'url'}
            onCopy={() => void copyValue('url')}
          />
          <div className="h-px bg-border" />
          <ChannelSecretField
            label={t('channels.webhookVerifyToken')}
            value={
              canManage
                ? isTokenVisible
                  ? (verifyToken ?? '')
                  : '••••••••••••••••••••••••'
                : t('channels.managersOnly')
            }
            copied={copiedField === 'token'}
            disabled={!canManage || isLoadingToken}
            onCopy={() => void copyValue('token')}
            reveal={
              canManage
                ? {
                    visible: isTokenVisible,
                    loading: isLoadingToken,
                    onToggle: () => void toggleVerifyToken(),
                  }
                : undefined
            }
          />
          {canManage && (
            <div className="flex items-center justify-between gap-3 border-t pt-3">
              <p className="text-xs leading-5 text-muted-foreground">
                {t('channels.applyWebhookHint')}
              </p>
              <Button size="sm" variant="secondary" onClick={onSetWebhook}>
                <Webhook className="size-4" aria-hidden />
                {t('channels.setWebhook')}
              </Button>
            </div>
          )}
        </div>

        <div
          className="mt-5 flex flex-wrap gap-2"
          aria-label={t('channels.credentials')}
        >
          <CredentialPill configured={channel.hasWaAppSecret}>
            {t('channels.appSecret')}
          </CredentialPill>
          <CredentialPill configured={channel.hasWaWebhookVerifyToken}>
            {t('channels.verifyToken')}
          </CredentialPill>
          <CredentialPill configured={channel.hasWaSystemUserAccessToken}>
            {t('channels.accessToken')}
          </CredentialPill>
        </div>
      </div>

      <footer className="border-t bg-muted/25 px-5 py-3 text-xs text-muted-foreground">
        {t('channels.updatedChannel', {
          date: formatDate(
            channel.updatedAt,
            i18n.resolvedLanguage ?? i18n.language,
          ),
          id: channel.id,
        })}
      </footer>
    </article>
  )
}

function ChannelSecretField({
  label,
  value,
  copied,
  disabled = false,
  reveal,
  onCopy,
}: {
  label: string
  value: string
  copied: boolean
  disabled?: boolean
  reveal?: { visible: boolean; loading: boolean; onToggle: () => void }
  onCopy: () => void
}) {
  const { t } = useTranslation()

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-muted-foreground">{label}</p>
        <code
          className="mt-1 block truncate text-xs text-foreground"
          title={value}
        >
          {value}
        </code>
      </div>
      <div className="flex shrink-0 gap-1">
        {reveal && (
          <Button
            className="size-8"
            variant="ghost"
            size="icon"
            isLoading={reveal.loading}
            disabled={disabled}
            onClick={reveal.onToggle}
            aria-label={
              reveal.visible
                ? t('channels.hideVerifyToken')
                : t('channels.showVerifyToken')
            }
          >
            {reveal.visible ? (
              <EyeOff className="size-4" aria-hidden />
            ) : (
              <Eye className="size-4" aria-hidden />
            )}
          </Button>
        )}
        <Button
          className="size-8"
          variant="ghost"
          size="icon"
          disabled={disabled}
          onClick={onCopy}
          aria-label={t('channels.copyField', { field: label })}
        >
          {copied ? (
            <Check className="size-4 text-success" aria-hidden />
          ) : (
            <Clipboard className="size-4" aria-hidden />
          )}
        </Button>
      </div>
    </div>
  )
}

function ChannelDatum({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-1 truncate font-mono text-xs" title={value}>
        {value}
      </dd>
    </div>
  )
}

function RegistrationSummary({
  state,
  canManage,
  className,
  onAction,
}: {
  state: RegistrationState
  canManage: boolean
  className?: string
  onAction: () => void
}) {
  const { t } = useTranslation()
  const canAct =
    canManage &&
    (state.status === 'registered' || state.status === 'unregistered')
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3',
        registrationStatusClasses(state.status),
        className,
      )}
    >
      <RadioTower className="size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold">{t('channels.registration.title')}</p>
        <p className="mt-0.5 text-xs">
          {t(`channels.registration.status.${state.status}`)}
          {state.providerStatus ? ` · ${state.providerStatus}` : ''}
        </p>
      </div>
      {canAct && (
        <Button
          size="sm"
          variant={state.status === 'registered' ? 'danger' : 'secondary'}
          onClick={onAction}
        >
          {t(
            state.status === 'registered'
              ? 'channels.registration.deregister'
              : 'channels.registration.register',
          )}
        </Button>
      )}
    </div>
  )
}

function registrationStatusClasses(status: RegistrationStatus): string {
  if (status === 'registered')
    return 'border-success/30 bg-success/10 text-success'
  if (status === 'unregistered')
    return 'border-warning/30 bg-warning/10 text-warning'
  if (status === 'error')
    return 'border-destructive/30 bg-destructive/10 text-destructive'
  return 'bg-muted/30 text-muted-foreground'
}

function CredentialPill({
  configured,
  children,
}: {
  configured: boolean
  children: React.ReactNode
}) {
  const { t } = useTranslation()

  return (
    <Pill tone={configured ? 'primary' : 'warning'}>
      <KeyRound className="size-3" aria-hidden />
      {children}:{' '}
      {configured ? t('channels.configured') : t('channels.missing')}
    </Pill>
  )
}

function ChannelFormPage({
  mode,
  open,
  form,
  setForm,
  isBusy,
  error,
  canManage,
  registrationPin,
  registrationState,
  qrState,
  channelId,
  isRegistrationBusy,
  setRegistrationPin,
  onClose,
  onRegister,
  onDeregister,
  onQrCreated,
  onSubmit,
}: {
  mode: 'create' | 'edit'
  open: boolean
  form: ChannelFormValues
  setForm: React.Dispatch<React.SetStateAction<ChannelFormValues>>
  isBusy: boolean
  error: string | null
  canManage: boolean
  registrationPin: string
  registrationState: RegistrationState
  qrState: ChannelQrState
  channelId: number | null
  isRegistrationBusy: boolean
  setRegistrationPin: (pin: string) => void
  onClose: () => void
  onRegister?: () => void
  onDeregister?: () => void
  onQrCreated?: () => void
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => void
}) {
  const { t } = useTranslation()
  const isEditing = mode === 'edit'
  const [activeTab, setActiveTab] = useState<
    | 'identity'
    | 'registration'
    | 'qr'
    | 'components'
    | 'webhook'
    | 'credentials'
  >('identity')
  const update = (field: keyof ChannelFormValues, value: string) =>
    setForm((current) => ({ ...current, [field]: value }))

  if (!open) return null

  const formFooter = canManage ? (
    <Button type="submit" disabled={isRegistrationBusy} isLoading={isBusy}>
      {isEditing ? t('channels.saveChanges') : t('channels.createChannel')}
    </Button>
  ) : (
    <p className="text-sm text-muted-foreground">
      {t('channels.managersOnly')}
    </p>
  )

  return (
    <div className="grid gap-6">
      <header className="flex items-start gap-4">
        <Button
          aria-label={t('channels.backToChannels')}
          size="icon"
          type="button"
          variant="ghost"
          onClick={onClose}
        >
          <ArrowLeft className="size-5" aria-hidden />
        </Button>
        <div>
          <p className="text-xs font-bold tracking-[0.12em] text-primary uppercase">
            {t('channels.eyebrow')}
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight">
            {isEditing
              ? t('channels.editChannel')
              : t('channels.createChannelTitle')}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {isEditing
              ? t('channels.editChannelDescription')
              : t('channels.createChannelDescription')}
          </p>
        </div>
      </header>

      <Tabs
        ariaLabel={t('channels.tabs.label')}
        items={[
          { value: 'identity', label: t('channels.tabs.identity') },
          ...(isEditing
            ? [
                {
                  value: 'registration' as const,
                  label: t('channels.tabs.registration'),
                },
                { value: 'qr' as const, label: t('channels.tabs.qr') },
                {
                  value: 'components' as const,
                  label: t('channels.tabs.components'),
                },
              ]
            : []),
          { value: 'webhook', label: t('channels.tabs.webhook') },
          { value: 'credentials', label: t('channels.tabs.credentials') },
        ]}
        variant="pills"
        value={activeTab}
        onValueChange={setActiveTab}
      />

      <form className="grid w-full gap-5" onSubmit={onSubmit}>
        {activeTab === 'identity' && (
          <SettingsCard
            icon={<RadioTower className="size-5" aria-hidden />}
            title={t('channels.channelIdentity')}
            description={t('channels.identityDescription')}
            bodyClassName="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            disabled={isBusy}
            error={error}
            footer={formFooter}
          >
            <Input
              label={t('channels.displayPhoneNumber')}
              hint={t('channels.countryCodeHint')}
              value={form.waPhoneNumber}
              onChange={(event) => update('waPhoneNumber', event.target.value)}
              autoFocus
              required
            />
            <Input
              label={t('channels.phoneNumberId')}
              inputMode="numeric"
              value={form.waPhoneNumberId}
              onChange={(event) =>
                update('waPhoneNumberId', event.target.value)
              }
              required
            />
            <Input
              label={t('channels.whatsAppBusinessAccountId')}
              value={form.waWabaId}
              onChange={(event) => update('waWabaId', event.target.value)}
              required
            />
            <Input
              label={t('channels.businessPortfolioId')}
              value={form.waBusinessId}
              onChange={(event) => update('waBusinessId', event.target.value)}
              required
            />
            <Input
              label={t('channels.metaAppId')}
              value={form.waAppId}
              onChange={(event) => update('waAppId', event.target.value)}
              required
            />
          </SettingsCard>
        )}

        {isEditing && activeTab === 'registration' && (
          <SettingsCard
            icon={<Phone className="size-5" aria-hidden />}
            title={t('channels.registration.title')}
            description={t('channels.registration.cardDescription')}
            disabled={isBusy || isRegistrationBusy}
            error={error}
          >
            <RegistrationSummary
              canManage={false}
              state={registrationState}
              onAction={() => undefined}
            />
            {(registrationState.verifiedName ||
              registrationState.displayPhoneNumber) && (
              <dl className="grid gap-3 sm:grid-cols-2">
                {registrationState.verifiedName && (
                  <ChannelDatum
                    label={t('channels.registration.verifiedName')}
                    value={registrationState.verifiedName}
                  />
                )}
                {registrationState.displayPhoneNumber && (
                  <ChannelDatum
                    label={t('channels.displayPhoneNumber')}
                    value={registrationState.displayPhoneNumber}
                  />
                )}
              </dl>
            )}
            {canManage && registrationState.status === 'unregistered' && (
              <div className="flex flex-col items-end gap-3 sm:flex-row">
                <div className="w-full flex-1">
                  <Input
                    autoComplete="off"
                    error={
                      registrationPin && !/^\d{6}$/.test(registrationPin)
                        ? t('channels.registration.pinError')
                        : undefined
                    }
                    inputMode="numeric"
                    label={t('channels.registration.pin')}
                    maxLength={6}
                    value={registrationPin}
                    onChange={(event) =>
                      setRegistrationPin(event.target.value.replace(/\D/g, ''))
                    }
                  />
                </div>
                <Button
                  className="w-full sm:mb-[1.375rem] sm:w-auto"
                  disabled={!/^\d{6}$/.test(registrationPin)}
                  isLoading={isRegistrationBusy}
                  type="button"
                  onClick={onRegister}
                >
                  {t('channels.registration.register')}
                </Button>
              </div>
            )}
            {canManage && registrationState.status === 'registered' && (
              <div className="flex justify-end">
                <Button
                  isLoading={isRegistrationBusy}
                  type="button"
                  variant="danger"
                  onClick={onDeregister}
                >
                  {t('channels.registration.deregister')}
                </Button>
              </div>
            )}
          </SettingsCard>
        )}

        {isEditing && activeTab === 'qr' && (
          <QrCodesSettingsCard
            channelId={channelId!}
            phoneNumber={form.waPhoneNumber}
            canManage={canManage}
            state={qrState}
            onChanged={() => onQrCreated?.()}
          />
        )}

        {isEditing && activeTab === 'components' && (
          <ConversationalComponentsSettingsCard
            channelId={channelId!}
            canManage={canManage}
          />
        )}

        {activeTab === 'webhook' && (
          <SettingsCard
            icon={<Webhook className="size-5" aria-hidden />}
            title={t('channels.webhookForwarding')}
            description={t('channels.webhookDescription')}
            disabled={isBusy}
            error={error}
            footer={formFooter}
          >
            <Textarea
              label={t('channels.forwardUrls')}
              hint={t('channels.forwardUrlsHint')}
              placeholder={
                'https://example.com/webhooks/whatsapp\nhttps://backup.example.com/hooks'
              }
              value={form.webhookForwardUrls}
              onChange={(event) =>
                update('webhookForwardUrls', event.target.value)
              }
            />
          </SettingsCard>
        )}

        {activeTab === 'credentials' && (
          <SettingsCard
            icon={<KeyRound className="size-5" aria-hidden />}
            title={t('channels.credentials')}
            description={t('channels.credentialsDescription')}
            bodyClassName="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            disabled={isBusy}
            error={error}
            footer={formFooter}
          >
            <Input
              label={t('channels.metaAppSecret')}
              type="password"
              autoComplete="new-password"
              hint={
                isEditing
                  ? t('channels.keepCurrentSecret')
                  : t('channels.appSecretHint')
              }
              value={form.waAppSecret}
              onChange={(event) => update('waAppSecret', event.target.value)}
              required={!isEditing}
            />
            <Input
              label={t('channels.webhookVerifyToken')}
              labelAction={
                <Button
                  className="h-6 px-2"
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    update('waWebhookVerifyToken', generateVerifyToken())
                  }
                >
                  {t('channels.generate')}
                </Button>
              }
              type="password"
              autoComplete="new-password"
              hint={
                isEditing
                  ? t('channels.keepCurrentToken')
                  : t('channels.verifyTokenHint')
              }
              value={form.waWebhookVerifyToken}
              onChange={(event) =>
                update('waWebhookVerifyToken', event.target.value)
              }
              required={!isEditing}
            />
            <div className="sm:col-span-2 lg:col-span-1">
              <Input
                label={t('channels.systemUserAccessToken')}
                type="password"
                autoComplete="new-password"
                hint={
                  isEditing
                    ? t('channels.keepCurrentToken')
                    : t('channels.accessTokenHint')
                }
                value={form.waSystemUserAccessToken}
                onChange={(event) =>
                  update('waSystemUserAccessToken', event.target.value)
                }
                required={!isEditing}
              />
            </div>
          </SettingsCard>
        )}
      </form>
    </div>
  )
}

function emptyRegistrationState(status: RegistrationStatus): RegistrationState {
  return {
    status,
    providerStatus: null,
    displayPhoneNumber: null,
    verifiedName: null,
  }
}

async function fetchRegistrationState(
  channelId: number,
): Promise<RegistrationState> {
  try {
    const response = await apiClient.api.channels[':id'].registration.$get({
      param: { id: String(channelId) },
    })
    if (!response.ok) return emptyRegistrationState('error')
    const registration = await response.json()
    return {
      status: registration.status,
      providerStatus: registration.providerStatus,
      displayPhoneNumber: registration.displayPhoneNumber,
      verifiedName: registration.verifiedName,
    }
  } catch {
    return emptyRegistrationState('error')
  }
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

function trimForm(form: ChannelFormValues) {
  return {
    waPhoneNumber: form.waPhoneNumber.trim(),
    waPhoneNumberId: form.waPhoneNumberId.trim(),
    waWabaId: form.waWabaId.trim(),
    waBusinessId: form.waBusinessId.trim(),
    waAppId: form.waAppId.trim(),
    waAppSecret: form.waAppSecret.trim(),
    waWebhookVerifyToken: form.waWebhookVerifyToken.trim(),
    waSystemUserAccessToken: form.waSystemUserAccessToken.trim(),
    webhookForwardUrls: form.webhookForwardUrls
      .split(/\r?\n/)
      .map((url) => url.trim())
      .filter(Boolean),
  }
}

async function readApiError(
  response: Response,
  fallback: string,
): Promise<string> {
  await response.json().catch(() => undefined)
  return `${fallback} (${response.status}).`
}

function formatDate(value: string, language: string): string {
  return new Intl.DateTimeFormat(language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function generateVerifyToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  )
}

function parsePositiveInteger(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function getErrorMessage(_reason: unknown, fallback: string): string {
  return fallback
}
