import {
  Check,
  Clipboard,
  Eye,
  EyeOff,
  AlertTriangle,
  KeyRound,
  Pencil,
  Phone,
  Plus,
  RadioTower,
  RefreshCw,
  Trash2,
  Webhook,
} from 'lucide-react'
import { useCallback, useEffect, useState, type SubmitEvent } from 'react'
import { apiClient } from '../api'
import { authClient } from '../auth/auth-client'
import { Button, cn, Dialog, EmptyState, Input, Pill } from '../components/ui'

interface ChannelSummary {
  id: number
  type: 'whatsapp'
  waPhoneNumber: string
  waPhoneNumberId: string
  waWabaId: string
  waBusinessId: string
  waAppId: string
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
}

type ChannelDialog = 'create' | 'edit' | 'delete' | 'set-webhook' | null

const emptyForm: ChannelFormValues = {
  waPhoneNumber: '',
  waPhoneNumberId: '',
  waWabaId: '',
  waBusinessId: '',
  waAppId: '',
  waAppSecret: '',
  waWebhookVerifyToken: '',
  waSystemUserAccessToken: '',
}

export function ChannelsPage() {
  const activeOrganizationQuery = authClient.useActiveOrganization()
  const activeMemberRoleQuery = authClient.useActiveMemberRole()
  const activeOrganization = activeOrganizationQuery.data
  const canManage = (activeMemberRoleQuery.data?.role ?? '')
    .split(',')
    .map((role) => role.trim())
    .some((role) => role === 'owner' || role === 'admin')

  const [channels, setChannels] = useState<ChannelSummary[]>([])
  const [dialog, setDialog] = useState<ChannelDialog>(null)
  const [selectedChannel, setSelectedChannel] = useState<ChannelSummary | null>(
    null,
  )
  const [form, setForm] = useState<ChannelFormValues>(emptyForm)
  const [isLoading, setIsLoading] = useState(true)
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [dialogError, setDialogError] = useState<string | null>(null)

  const refreshChannels = useCallback(async () => {
    if (!activeOrganization?.id) {
      setChannels([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const response = await apiClient.api.channels.$get()
      if (!response.ok) throw new Error(await readApiError(response))
      const data = await response.json()
      setChannels(data.channels)
    } catch (reason) {
      setError(getErrorMessage(reason))
    } finally {
      setIsLoading(false)
    }
  }, [activeOrganization?.id])

  useEffect(() => {
    void refreshChannels()
  }, [refreshChannels])

  const closeDialog = () => {
    if (isBusy) return
    setDialog(null)
    setSelectedChannel(null)
    setDialogError(null)
  }

  const openCreateDialog = () => {
    setForm({ ...emptyForm, waWebhookVerifyToken: generateVerifyToken() })
    setSelectedChannel(null)
    setDialogError(null)
    setDialog('create')
  }

  const openEditDialog = (channel: ChannelSummary) => {
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
    })
    setDialogError(null)
    setDialog('edit')
  }

  const saveChannel = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsBusy(true)
    setDialogError(null)
    setNotice(null)

    try {
      const values = trimForm(form)
      let response: Response
      if (dialog === 'create') {
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
            ...secrets,
          },
        })
      } else {
        throw new Error('No channel selected.')
      }

      if (!response.ok) throw new Error(await readApiError(response))
      await refreshChannels()
      setDialog(null)
      setSelectedChannel(null)
      setNotice(dialog === 'create' ? 'Channel created.' : 'Channel updated.')
    } catch (reason) {
      setDialogError(getErrorMessage(reason))
    } finally {
      setIsBusy(false)
    }
  }

  const deleteChannel = async () => {
    if (!selectedChannel) return
    setIsBusy(true)
    setDialogError(null)
    setNotice(null)

    try {
      const response = await apiClient.api.channels[':id'].$delete({
        param: { id: String(selectedChannel.id) },
      })
      if (!response.ok) throw new Error(await readApiError(response))
      await refreshChannels()
      setDialog(null)
      setSelectedChannel(null)
      setNotice('Channel deleted.')
    } catch (reason) {
      setDialogError(getErrorMessage(reason))
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
      if (!response.ok) throw new Error(await readApiError(response))
      const result = await response.json()
      setDialog(null)
      setSelectedChannel(null)
      setNotice(`${result.message}: ${result.callbackUrl}`)
    } catch (reason) {
      setDialogError(getErrorMessage(reason))
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <div className="grid gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold tracking-[0.12em] text-primary uppercase">
            Workspace channels
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight">
            Channels
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Manage the WhatsApp Cloud API connections for{' '}
            <span className="font-semibold text-foreground">
              {activeOrganization?.name ?? 'your active organization'}
            </span>
            .
          </p>
        </div>
        {canManage && (
          <Button
            className="self-start sm:self-auto"
            onClick={openCreateDialog}
          >
            <Plus className="size-4" aria-hidden />
            New channel
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
            <h2 className="font-bold">Connected channels</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {channels.length} {channels.length === 1 ? 'channel' : 'channels'}
            </p>
          </div>
          <Button
            className="size-9"
            variant="ghost"
            size="icon"
            disabled={isLoading}
            onClick={() => void refreshChannels()}
            aria-label="Refresh channels"
          >
            <RefreshCw
              className={cn('size-4', isLoading && 'animate-spin')}
              aria-hidden
            />
          </Button>
        </div>

        {isLoading && channels.length === 0 ? (
          <div className="flex flex-wrap gap-4" role="status">
            <span className="sr-only">Loading channels</span>
            {[0, 1].map((item) => (
              <div
                key={item}
                className="h-80 min-w-72 flex-1 basis-96 animate-pulse rounded-2xl bg-muted"
              />
            ))}
          </div>
        ) : channels.length === 0 ? (
          <EmptyState
            icon={<RadioTower className="size-5" aria-hidden />}
            title="No channels yet"
            description="Connect a WhatsApp number to start receiving webhooks for this organization."
            action={
              canManage ? (
                <Button size="sm" onClick={openCreateDialog}>
                  <Plus className="size-4" aria-hidden />
                  Create channel
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="flex flex-wrap items-stretch gap-4">
            {channels.map((channel) => (
              <ChannelCard
                key={channel.id}
                channel={channel}
                canManage={canManage}
                onError={setError}
                onEdit={() => openEditDialog(channel)}
                onSetWebhook={() => {
                  setSelectedChannel(channel)
                  setDialogError(null)
                  setDialog('set-webhook')
                }}
                onDelete={() => {
                  setSelectedChannel(channel)
                  setDialogError(null)
                  setDialog('delete')
                }}
              />
            ))}
          </div>
        )}
      </section>

      <ChannelFormDialog
        mode="create"
        open={dialog === 'create'}
        form={form}
        setForm={setForm}
        isBusy={isBusy}
        error={dialogError}
        onClose={closeDialog}
        onSubmit={(event) => void saveChannel(event)}
      />
      <ChannelFormDialog
        mode="edit"
        open={dialog === 'edit'}
        form={form}
        setForm={setForm}
        isBusy={isBusy}
        error={dialogError}
        onClose={closeDialog}
        onSubmit={(event) => void saveChannel(event)}
      />

      <Dialog
        open={dialog === 'set-webhook'}
        onOpenChange={(open) => !open && closeDialog()}
        title="Set this webhook for the WABA?"
        description="This overrides the callback URL for the entire WhatsApp Business Account, not only this phone number."
        icon={<DialogIcon icon={<AlertTriangle className="size-5" />} danger />}
      >
        <div className="grid w-full gap-4">
          <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm leading-6 text-warning-foreground">
            All webhook events for WABA{' '}
            <strong>{selectedChannel?.waWabaId}</strong> will be pointed to this
            application. Other integrations using the current callback may stop
            receiving events.
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs font-semibold text-muted-foreground">
              New webhook URL
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
              Cancel
            </Button>
            <Button
              variant="danger"
              isLoading={isBusy}
              onClick={() => void setChannelWebhook()}
            >
              Set webhook
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={dialog === 'delete'}
        onOpenChange={(open) => !open && closeDialog()}
        title="Delete channel?"
        description={`This removes ${selectedChannel?.waPhoneNumber ?? 'this channel'} from the active organization. Channels with persisted messages or contacts cannot be deleted.`}
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
              onClick={() => void deleteChannel()}
            >
              Delete channel
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}

function ChannelCard({
  channel,
  canManage,
  onError,
  onEdit,
  onSetWebhook,
  onDelete,
}: {
  channel: ChannelSummary
  canManage: boolean
  onError: (message: string) => void
  onEdit: () => void
  onSetWebhook: () => void
  onDelete: () => void
}) {
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
      if (!response.ok) throw new Error(await readApiError(response))
      const result = await response.json()
      setVerifyToken(result.token)
      return result.token
    } catch (reason) {
      onError(getErrorMessage(reason))
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
      onError(`Could not copy the webhook ${field}.`)
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
    <article className="min-w-72 flex-1 basis-[30rem] overflow-hidden rounded-2xl border bg-background shadow-xs">
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
                WhatsApp
              </Pill>
            </div>
          </div>
        </div>
        {canManage && (
          <div className="flex gap-1">
            <Button
              className="size-8"
              variant="ghost"
              size="icon"
              onClick={onEdit}
              aria-label={`Edit ${channel.waPhoneNumber}`}
            >
              <Pencil className="size-4" aria-hidden />
            </Button>
            <Button
              className="size-8 text-destructive"
              variant="ghost"
              size="icon"
              onClick={onDelete}
              aria-label={`Delete ${channel.waPhoneNumber}`}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>
        )}
      </div>

      <div className="p-5">
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <ChannelDatum
            label="Phone number ID"
            value={channel.waPhoneNumberId}
          />
          <ChannelDatum label="WABA ID" value={channel.waWabaId} />
          <ChannelDatum label="Business ID" value={channel.waBusinessId} />
          <ChannelDatum label="App ID" value={channel.waAppId} />
        </dl>

        <div className="mt-5 grid gap-3 rounded-xl border bg-card p-3.5">
          <ChannelSecretField
            label="Webhook URL"
            value={webhookUrl}
            copied={copiedField === 'url'}
            onCopy={() => void copyValue('url')}
          />
          <div className="h-px bg-border" />
          <ChannelSecretField
            label="Webhook verify token"
            value={
              canManage
                ? isTokenVisible
                  ? (verifyToken ?? '')
                  : '••••••••••••••••••••••••'
                : 'Restricted to organization managers'
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
                Apply this URL and verify token to the WABA.
              </p>
              <Button size="sm" variant="secondary" onClick={onSetWebhook}>
                <Webhook className="size-4" aria-hidden />
                Set webhook
              </Button>
            </div>
          )}
        </div>

        <div className="mt-5 flex flex-wrap gap-2" aria-label="Credentials">
          <CredentialPill configured={channel.hasWaAppSecret}>
            App secret
          </CredentialPill>
          <CredentialPill configured={channel.hasWaWebhookVerifyToken}>
            Verify token
          </CredentialPill>
          <CredentialPill configured={channel.hasWaSystemUserAccessToken}>
            Access token
          </CredentialPill>
        </div>
      </div>

      <footer className="border-t bg-muted/25 px-5 py-3 text-xs text-muted-foreground">
        Updated {formatDate(channel.updatedAt)} · Channel #{channel.id}
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
              reveal.visible ? 'Hide verify token' : 'Show verify token'
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
          aria-label={`Copy ${label.toLowerCase()}`}
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

function CredentialPill({
  configured,
  children,
}: {
  configured: boolean
  children: React.ReactNode
}) {
  return (
    <Pill tone={configured ? 'primary' : 'warning'}>
      <KeyRound className="size-3" aria-hidden />
      {children}: {configured ? 'configured' : 'missing'}
    </Pill>
  )
}

function ChannelFormDialog({
  mode,
  open,
  form,
  setForm,
  isBusy,
  error,
  onClose,
  onSubmit,
}: {
  mode: 'create' | 'edit'
  open: boolean
  form: ChannelFormValues
  setForm: React.Dispatch<React.SetStateAction<ChannelFormValues>>
  isBusy: boolean
  error: string | null
  onClose: () => void
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => void
}) {
  const isEditing = mode === 'edit'
  const update = (field: keyof ChannelFormValues, value: string) =>
    setForm((current) => ({ ...current, [field]: value }))

  return (
    <Dialog
      size="xl"
      open={open}
      onOpenChange={(nextOpen) => !nextOpen && onClose()}
      title={isEditing ? 'Edit channel' : 'Create a channel'}
      description={
        isEditing
          ? 'Update the WhatsApp identifiers or replace individual credentials.'
          : 'Enter the WhatsApp Cloud API details for this organization.'
      }
      icon={
        <DialogIcon
          icon={
            isEditing ? (
              <Pencil className="size-5" />
            ) : (
              <RadioTower className="size-5" />
            )
          }
        />
      }
    >
      <form className="grid w-full gap-5" onSubmit={onSubmit}>
        <fieldset
          className="grid gap-4 rounded-xl border bg-muted/25 p-4 sm:grid-cols-2 lg:grid-cols-3"
          disabled={isBusy}
        >
          <legend className="col-span-full px-1 text-sm font-bold">
            Channel identity
          </legend>
          <Input
            label="Display phone number"
            hint="Include the country code."
            value={form.waPhoneNumber}
            onChange={(event) => update('waPhoneNumber', event.target.value)}
            autoFocus
            required
          />
          <Input
            label="Phone number ID"
            inputMode="numeric"
            value={form.waPhoneNumberId}
            onChange={(event) => update('waPhoneNumberId', event.target.value)}
            required
          />
          <Input
            label="WhatsApp Business Account ID"
            value={form.waWabaId}
            onChange={(event) => update('waWabaId', event.target.value)}
            required
          />
          <Input
            label="Business portfolio ID"
            value={form.waBusinessId}
            onChange={(event) => update('waBusinessId', event.target.value)}
            required
          />
          <Input
            label="Meta app ID"
            value={form.waAppId}
            onChange={(event) => update('waAppId', event.target.value)}
            required
          />
        </fieldset>

        <fieldset
          className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-3"
          disabled={isBusy}
        >
          <legend className="col-span-full px-1 text-sm font-bold">
            Credentials
          </legend>
          <Input
            label="Meta app secret"
            type="password"
            autoComplete="new-password"
            hint={
              isEditing
                ? 'Leave blank to keep the current secret.'
                : 'Used to verify webhook signatures.'
            }
            value={form.waAppSecret}
            onChange={(event) => update('waAppSecret', event.target.value)}
            required={!isEditing}
          />
          <Input
            label="Webhook verify token"
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
                Generate
              </Button>
            }
            type="password"
            autoComplete="new-password"
            hint={
              isEditing
                ? 'Leave blank to keep the current token.'
                : 'Copy this into the Meta webhook configuration.'
            }
            value={form.waWebhookVerifyToken}
            onChange={(event) =>
              update('waWebhookVerifyToken', event.target.value)
            }
            required={!isEditing}
          />
          <div className="sm:col-span-2 lg:col-span-1">
            <Input
              label="System user access token"
              type="password"
              autoComplete="new-password"
              hint={
                isEditing
                  ? 'Leave blank to keep the current token.'
                  : 'Used for Cloud API calls.'
              }
              value={form.waSystemUserAccessToken}
              onChange={(event) =>
                update('waSystemUserAccessToken', event.target.value)
              }
              required={!isEditing}
            />
          </div>
        </fieldset>

        <DialogError message={error} />
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button
            type="button"
            variant="ghost"
            disabled={isBusy}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button type="submit" isLoading={isBusy}>
            {isEditing ? 'Save changes' : 'Create channel'}
          </Button>
        </div>
      </form>
    </Dialog>
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

function trimForm(form: ChannelFormValues): ChannelFormValues {
  return {
    waPhoneNumber: form.waPhoneNumber.trim(),
    waPhoneNumberId: form.waPhoneNumberId.trim(),
    waWabaId: form.waWabaId.trim(),
    waBusinessId: form.waBusinessId.trim(),
    waAppId: form.waAppId.trim(),
    waAppSecret: form.waAppSecret.trim(),
    waWebhookVerifyToken: form.waWebhookVerifyToken.trim(),
    waSystemUserAccessToken: form.waSystemUserAccessToken.trim(),
  }
}

async function readApiError(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => undefined)
  return isRecord(body) && typeof body.message === 'string'
    ? body.message
    : `Request failed (${response.status}).`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
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

function getErrorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : 'The operation failed.'
}
