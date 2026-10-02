import type { InferResponseType } from 'hono/client'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileText,
  Gavel,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom'
import { apiClient } from '../api'
import { authClient } from '../auth/auth-client'
import {
  Button,
  cn,
  Dialog,
  EmptyState,
  Input,
  Pill,
  Select,
  Textarea,
} from '../components/ui'

type ChannelsResponse = InferResponseType<
  typeof apiClient.api.channels.$get,
  200
>
type Channel = ChannelsResponse['channels'][number]
type TemplateStatus =
  | 'APPROVED'
  | 'ARCHIVED'
  | 'DELETED'
  | 'DISABLED'
  | 'IN_APPEAL'
  | 'LIMIT_EXCEEDED'
  | 'PAUSED'
  | 'PENDING'
  | 'PENDING_DELETION'
  | 'REJECTED'
type TemplateCategory =
  'AUTHENTICATION' | 'FREE_SERVICE' | 'MARKETING' | 'UTILITY'
type CreatableCategory = Exclude<TemplateCategory, 'FREE_SERVICE'>
interface TemplateComponent {
  type: string
  format?: string
  text?: string
  example?: Record<string, unknown>
  buttons?: Array<Record<string, unknown>>
  [key: string]: unknown
}
interface MessageTemplate {
  id: string
  name?: string
  language?: string
  status?: TemplateStatus
  category?: TemplateCategory
  components?: TemplateComponent[]
  parameter_format?: 'NAMED' | 'POSITIONAL'
  message_send_ttl_seconds?: number | null
  quality_score?: {
    score?: 'GREEN' | 'RED' | 'UNKNOWN' | 'YELLOW'
    reason?: string
  }
  rejected_reason?: string
  last_updated_time?: number
}
interface TemplateForm {
  name: string
  language: string
  category: CreatableCategory
  parameterFormat: 'NAMED' | 'POSITIONAL'
  components: string
  allowCategoryChange: boolean
}

const emptyForm: TemplateForm = {
  name: '',
  language: 'en_US',
  category: 'UTILITY',
  parameterFormat: 'POSITIONAL',
  components: JSON.stringify(
    [
      {
        type: 'BODY',
        text: 'Your order {{1}} is ready.',
        example: { body_text: [['A-123']] },
      },
    ],
    null,
    2,
  ),
  allowCategoryChange: false,
}

export function TemplatesPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const params = useParams<{ channelId: string; templateId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeOrganization = authClient.useActiveOrganization()
  const activeRole = authClient.useActiveMemberRole()
  const canManage = (activeRole.data?.role ?? '')
    .split(',')
    .map((role) => role.trim())
    .some((role) => role === 'owner' || role === 'admin')
  const isCreate = location.pathname === '/templates/new'
  const isEditor = isCreate || params.templateId !== undefined

  const [channels, setChannels] = useState<Channel[]>([])
  const [channelId, setChannelId] = useState(
    searchParams.get('channelId') ?? '',
  )
  const [templates, setTemplates] = useState<MessageTemplate[]>([])
  const [selectedTemplate, setSelectedTemplate] =
    useState<MessageTemplate | null>(null)
  const [form, setForm] = useState<TemplateForm>(emptyForm)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState('')
  const [after, setAfter] = useState<string | undefined>()
  const [isLoading, setIsLoading] = useState(true)
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<MessageTemplate | null>(null)

  useEffect(() => {
    document.title = `${t('templates.title')} · ${t('design.brand')}`
    document
      .querySelector<HTMLMetaElement>('meta[name="description"]')
      ?.setAttribute('content', t('templates.metaDescription'))
  }, [t])

  useEffect(() => {
    if (!activeOrganization.data?.id) return
    void (async () => {
      try {
        const response = await apiClient.api.channels.$get()
        if (!response.ok) throw new Error(await apiError(response))
        const data = await response.json()
        setChannels(data.channels)
        const routeChannel = params.channelId
        const preferred = routeChannel ?? channelId
        setChannelId(
          data.channels.some((item) => String(item.id) === preferred)
            ? preferred
            : String(data.channels[0]?.id ?? ''),
        )
      } catch (reason) {
        setError(errorMessage(reason, t('templates.requestFailed')))
      }
    })()
  }, [activeOrganization.data?.id, channelId, params.channelId, t])

  const loadTemplates = useCallback(
    async (append = false) => {
      if (!channelId || isEditor) {
        setIsLoading(false)
        return
      }
      setIsLoading(true)
      setError(null)
      try {
        const response = await apiClient.api.templates.$get({
          query: {
            channelId,
            name: search.trim() || undefined,
            category: (category as TemplateCategory | '') || undefined,
            status: (status as TemplateStatus | '') || undefined,
            limit: '50',
            after: append ? after : undefined,
          },
        })
        if (!response.ok) throw new Error(await apiError(response))
        const data = await response.json()
        const incoming = data.templates as MessageTemplate[]
        setTemplates((current) =>
          append ? [...current, ...incoming] : incoming,
        )
        setAfter(data.paging?.cursors?.after)
      } catch (reason) {
        setError(errorMessage(reason, t('templates.requestFailed')))
      } finally {
        setIsLoading(false)
      }
    },
    [after, category, channelId, isEditor, search, status, t],
  )

  useEffect(() => {
    const timer = window.setTimeout(() => void loadTemplates(false), 250)
    return () => window.clearTimeout(timer)
  }, [loadTemplates])

  useEffect(() => {
    if (!params.channelId || !params.templateId) {
      if (isCreate) {
        setForm(emptyForm)
        setSelectedTemplate(null)
        setIsLoading(false)
      }
      return
    }
    setIsLoading(true)
    void (async () => {
      try {
        const response = await apiClient.api.templates[':channelId'][
          ':templateId'
        ].$get({
          param: {
            channelId: params.channelId!,
            templateId: params.templateId!,
          },
        })
        if (!response.ok) throw new Error(await apiError(response))
        const data = await response.json()
        const template = data.template as MessageTemplate
        setSelectedTemplate(template)
        setForm({
          name: template.name ?? '',
          language: template.language ?? '',
          category:
            template.category === 'FREE_SERVICE'
              ? 'UTILITY'
              : (template.category ?? 'UTILITY'),
          parameterFormat: template.parameter_format ?? 'POSITIONAL',
          components: JSON.stringify(template.components ?? [], null, 2),
          allowCategoryChange: false,
        })
      } catch (reason) {
        setError(errorMessage(reason, t('templates.requestFailed')))
      } finally {
        setIsLoading(false)
      }
    })()
  }, [isCreate, params.channelId, params.templateId, t])

  const saveTemplate = async (event: FormEvent) => {
    event.preventDefault()
    if (!channelId || !canManage) return
    setIsBusy(true)
    setError(null)
    try {
      const components = parseComponents(
        form.components,
        t,
        form.parameterFormat,
        form.category,
      )
      const response = isCreate
        ? await apiClient.api.templates[':channelId'].$post({
            param: { channelId },
            json: {
              name: form.name,
              language: form.language,
              category: form.category,
              parameter_format: form.parameterFormat,
              components,
              allow_category_change: form.allowCategoryChange,
            },
          })
        : await apiClient.api.templates[':channelId'][':templateId'].$patch({
            param: { channelId, templateId: params.templateId! },
            json: {
              category: form.category,
              parameter_format: form.parameterFormat,
              components,
              allow_category_change: form.allowCategoryChange,
            },
          })
      if (!response.ok) throw new Error(await apiError(response))
      void navigate(`/templates?channelId=${encodeURIComponent(channelId)}`, {
        replace: true,
      })
    } catch (reason) {
      setError(errorMessage(reason, t('templates.requestFailed')))
    } finally {
      setIsBusy(false)
    }
  }

  const deleteTemplate = async () => {
    if (!deleteTarget?.id || !deleteTarget.name || !channelId) return
    setIsBusy(true)
    try {
      const response = await apiClient.api.templates[':channelId'][
        ':templateId'
      ].$delete({
        param: { channelId, templateId: deleteTarget.id },
        json: { name: deleteTarget.name },
      })
      if (!response.ok) throw new Error(await apiError(response))
      setDeleteTarget(null)
      setNotice(t('templates.deletedNotice'))
      await loadTemplates(false)
    } catch (reason) {
      setError(errorMessage(reason, t('templates.requestFailed')))
    } finally {
      setIsBusy(false)
    }
  }

  if (isEditor) {
    return (
      <TemplateEditor
        form={form}
        setForm={setForm}
        template={selectedTemplate}
        channels={channels}
        channelId={channelId}
        setChannelId={setChannelId}
        isCreate={isCreate}
        canManage={canManage}
        isLoading={isLoading}
        isBusy={isBusy}
        error={error}
        onBack={() => void navigate(`/templates?channelId=${channelId}`)}
        onSubmit={(event) => void saveTemplate(event)}
      />
    )
  }

  return (
    <div className="grid gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold tracking-[0.12em] text-primary uppercase">
            {t('templates.eyebrow')}
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight">
            {t('templates.title')}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {t('templates.description')}
          </p>
        </div>
        {canManage && channels.length > 0 && (
          <Button
            onClick={() =>
              void navigate(
                `/templates/new?channelId=${encodeURIComponent(channelId)}`,
              )
            }
          >
            <Plus className="size-4" aria-hidden />
            {t('templates.newTemplate')}
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

      <section className="grid gap-4 rounded-2xl border bg-card p-5 sm:p-6">
        <div className="grid gap-3 lg:grid-cols-[minmax(14rem,0.8fr)_minmax(16rem,1.4fr)_repeat(2,minmax(10rem,0.7fr))_auto]">
          <Select
            label={t('templates.channel')}
            value={channelId}
            onChange={(event) => {
              setChannelId(event.currentTarget.value)
              setSearchParams({ channelId: event.currentTarget.value })
            }}
          >
            {channels.map((channel) => (
              <option key={channel.id} value={channel.id}>
                {channel.name} — {channel.waPhoneNumber}
              </option>
            ))}
          </Select>
          <Input
            label={t('templates.search')}
            value={search}
            leadingIcon={Search}
            onChange={(event) => setSearch(event.currentTarget.value)}
          />
          <Select
            label={t('templates.category')}
            value={category}
            onChange={(event) => setCategory(event.currentTarget.value)}
          >
            <option value="">{t('templates.allCategories')}</option>
            {['AUTHENTICATION', 'MARKETING', 'UTILITY'].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
          <Select
            label={t('templates.status')}
            value={status}
            onChange={(event) => setStatus(event.currentTarget.value)}
          >
            <option value="">{t('templates.allStatuses')}</option>
            {[
              'APPROVED',
              'PENDING',
              'REJECTED',
              'PAUSED',
              'DISABLED',
              'ARCHIVED',
            ].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
          <div className="grid gap-1.5 text-sm">
            <span className="min-h-6" aria-hidden />
            <Button
              variant="outline"
              disabled={isLoading || !channelId}
              onClick={() => void loadTemplates(false)}
              aria-label={t('templates.refresh')}
            >
              <RefreshCw
                className={cn('size-4', isLoading && 'animate-spin')}
                aria-hidden
              />
            </Button>
            <span className="min-h-4" aria-hidden />
          </div>
        </div>

        {!channelId ? (
          <EmptyState
            icon={<FileText className="size-5" aria-hidden />}
            title={t('templates.noChannels')}
            description={t('templates.noChannelsDescription')}
          />
        ) : isLoading && templates.length === 0 ? (
          <div
            className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
            role="status"
          >
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="h-64 animate-pulse rounded-2xl bg-muted"
              />
            ))}
          </div>
        ) : templates.length === 0 ? (
          <EmptyState
            icon={<FileText className="size-5" aria-hidden />}
            title={t('templates.empty')}
            description={t('templates.emptyDescription')}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {templates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                canManage={canManage}
                onEdit={() =>
                  void navigate(
                    `/templates/${channelId}/${encodeURIComponent(template.id)}`,
                  )
                }
                onDelete={() => setDeleteTarget(template)}
              />
            ))}
          </div>
        )}
        {after && (
          <Button
            className="justify-self-center"
            variant="outline"
            disabled={isLoading}
            onClick={() => void loadTemplates(true)}
          >
            {t('templates.loadMore')}
          </Button>
        )}
      </section>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t('templates.deleteTitle')}
        description={t('templates.deleteDescription', {
          name: deleteTarget?.name ?? '',
        })}
        icon={
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-destructive/10 text-destructive">
            <AlertTriangle className="size-5" aria-hidden />
          </span>
        }
      >
        <Button
          variant="ghost"
          disabled={isBusy}
          onClick={() => setDeleteTarget(null)}
        >
          {t('templates.cancel')}
        </Button>
        <Button
          variant="danger"
          isLoading={isBusy}
          onClick={() => void deleteTemplate()}
        >
          <Trash2 className="size-4" aria-hidden />
          {t('templates.deleteAction')}
        </Button>
      </Dialog>
    </div>
  )
}

function TemplateCard({
  template,
  canManage,
  onEdit,
  onDelete,
}: {
  template: MessageTemplate
  canManage: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  return (
    <article className="flex min-h-64 flex-col rounded-2xl border bg-background p-5 shadow-xs transition hover:border-primary/30 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-bold">{template.name ?? template.id}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {template.language ?? '—'} · {template.category ?? '—'}
          </p>
        </div>
        <StatusPill status={template.status} />
      </div>
      <div className="mt-4 flex-1 rounded-xl bg-[#efeae2] p-3 dark:bg-muted">
        <TemplateBubble components={template.components ?? []} compact />
      </div>
      {template.rejected_reason && (
        <p className="mt-3 text-xs text-destructive">
          {t('templates.rejectedReason')}: {template.rejected_reason}
        </p>
      )}
      {canManage && (
        <div className="mt-4 flex justify-end gap-2 border-t pt-3">
          <Button size="sm" variant="ghost" onClick={onEdit}>
            <Pencil className="size-4" aria-hidden />
            {t('templates.edit')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="size-4" aria-hidden />
            {t('templates.deleteAction')}
          </Button>
        </div>
      )}
    </article>
  )
}

function TemplateEditor(props: {
  form: TemplateForm
  setForm: (form: TemplateForm) => void
  template: MessageTemplate | null
  channels: Channel[]
  channelId: string
  setChannelId: (value: string) => void
  isCreate: boolean
  canManage: boolean
  isLoading: boolean
  isBusy: boolean
  error: string | null
  onBack: () => void
  onSubmit: (event: FormEvent) => void
}) {
  const { t } = useTranslation()
  const components = useMemo(
    () => previewComponents(props.form.components),
    [props.form.components],
  )
  if (props.isLoading && !props.isCreate) {
    return (
      <div className="grid min-h-80 place-items-center" role="status">
        <LoaderCircle
          className="size-7 animate-spin text-primary"
          aria-hidden
        />
      </div>
    )
  }
  return (
    <form className="grid gap-6" onSubmit={props.onSubmit}>
      <header className="flex items-start gap-4">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={props.onBack}
        >
          <ArrowLeft className="size-5" aria-hidden />
        </Button>
        <div>
          <p className="text-xs font-bold tracking-[0.12em] text-primary uppercase">
            {t('templates.eyebrow')}
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight">
            {t(
              props.isCreate ? 'templates.createTitle' : 'templates.editTitle',
            )}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('templates.editorDescription')}
          </p>
        </div>
      </header>
      {props.error && (
        <p
          className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          role="alert"
        >
          {props.error}
        </p>
      )}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)]">
        <section className="grid gap-5 rounded-2xl border bg-card p-5 sm:p-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label={t('templates.channel')}
              value={props.channelId}
              disabled={!props.isCreate}
              onChange={(event) =>
                props.setChannelId(event.currentTarget.value)
              }
            >
              {props.channels.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.name} — {channel.waPhoneNumber}
                </option>
              ))}
            </Select>
            <Select
              label={t('templates.category')}
              value={props.form.category}
              onChange={(event) =>
                props.setForm({
                  ...props.form,
                  category: event.currentTarget.value as CreatableCategory,
                })
              }
            >
              <option value="AUTHENTICATION">AUTHENTICATION</option>
              <option value="MARKETING">MARKETING</option>
              <option value="UTILITY">UTILITY</option>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label={t('templates.name')}
              hint={t('templates.nameHint')}
              value={props.form.name}
              disabled={!props.isCreate}
              required
              pattern="[a-z0-9_]+"
              onChange={(event) =>
                props.setForm({
                  ...props.form,
                  name: event.currentTarget.value
                    .toLowerCase()
                    .replace(/[^a-z0-9_]/g, '_'),
                })
              }
            />
            <Input
              label={t('templates.language')}
              value={props.form.language}
              disabled={!props.isCreate}
              required
              onChange={(event) =>
                props.setForm({
                  ...props.form,
                  language: event.currentTarget.value,
                })
              }
            />
          </div>
          <Select
            label={t('templates.parameterFormat')}
            value={props.form.parameterFormat}
            onChange={(event) =>
              props.setForm({
                ...props.form,
                parameterFormat: event.currentTarget.value as
                  'NAMED' | 'POSITIONAL',
              })
            }
          >
            <option value="POSITIONAL">POSITIONAL</option>
            <option value="NAMED">NAMED</option>
          </Select>
          <TemplateComponentBuilder
            value={props.form.components}
            parameterFormat={props.form.parameterFormat}
            channelId={props.channelId}
            onChange={(components) =>
              props.setForm({ ...props.form, components })
            }
          />
          <label className="flex items-start gap-3 rounded-xl border bg-background p-3 text-sm">
            <input
              className="mt-0.5 size-4 accent-primary"
              type="checkbox"
              checked={props.form.allowCategoryChange}
              onChange={(event) =>
                props.setForm({
                  ...props.form,
                  allowCategoryChange: event.currentTarget.checked,
                })
              }
            />
            <span>
              <span className="block font-semibold">
                {t('templates.allowCategoryChange')}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {t('templates.allowCategoryChangeHint')}
              </span>
            </span>
          </label>
          <div className="flex justify-end gap-3 border-t pt-5">
            <Button
              type="button"
              variant="ghost"
              disabled={props.isBusy}
              onClick={props.onBack}
            >
              {t('templates.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={!props.canManage || !props.channelId}
              isLoading={props.isBusy}
            >
              {t(
                props.isCreate
                  ? 'templates.createAction'
                  : 'templates.saveAction',
              )}
            </Button>
          </div>
        </section>
        <div className="grid content-start gap-4">
          <section className="rounded-2xl border bg-card p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-bold">{t('templates.preview')}</h2>
              {props.template?.status && (
                <StatusPill status={props.template.status} />
              )}
            </div>
            <div className="mt-4 min-h-72 rounded-2xl bg-[#efeae2] p-4 dark:bg-muted">
              <TemplateBubble components={components} />
            </div>
          </section>
          <LifecycleCard template={props.template} />
        </div>
      </div>
    </form>
  )
}

function TemplateComponentBuilder({
  value,
  parameterFormat,
  channelId,
  onChange,
}: {
  value: string
  parameterFormat: 'NAMED' | 'POSITIONAL'
  channelId: string
  onChange: (value: string) => void
}) {
  const { t } = useTranslation()
  const [isUploadingMedia, setIsUploadingMedia] = useState(false)
  const [mediaError, setMediaError] = useState<string | null>(null)
  const [uploadedFileName, setUploadedFileName] = useState('')
  const components = previewComponents(value)
  const header = components.find((component) => component.type === 'HEADER')
  const body = components.find((component) => component.type === 'BODY') ?? {
    type: 'BODY',
    text: '',
  }
  const footer = components.find((component) => component.type === 'FOOTER')
  const buttons = components.find((component) => component.type === 'BUTTONS')
  const advanced = components.filter(
    (component) =>
      !['HEADER', 'BODY', 'FOOTER', 'BUTTONS'].includes(component.type),
  )

  const commit = (next: TemplateComponent[]) =>
    onChange(JSON.stringify(next, null, 2))
  const replace = (type: string, component?: TemplateComponent) => {
    const next = components.filter((item) => item.type !== type)
    if (component) {
      const order = ['HEADER', 'BODY', 'FOOTER', 'BUTTONS']
      next.push(component)
      next.sort(
        (left, right) =>
          (order.indexOf(left.type) < 0 ? 99 : order.indexOf(left.type)) -
          (order.indexOf(right.type) < 0 ? 99 : order.indexOf(right.type)),
      )
    }
    commit(next)
  }
  const updateButtons = (nextButtons: Array<Record<string, unknown>>) =>
    replace(
      'BUTTONS',
      nextButtons.length
        ? { type: 'BUTTONS', buttons: nextButtons }
        : undefined,
    )

  return (
    <fieldset className="grid gap-4">
      <div>
        <legend className="font-bold">{t('templates.contents.title')}</legend>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {t('templates.contents.description')}
        </p>
      </div>

      <ComponentSection
        title={t('templates.contents.header')}
        optional
        enabled={Boolean(header)}
        onToggle={(enabled) =>
          replace(
            'HEADER',
            enabled ? { type: 'HEADER', format: 'TEXT', text: '' } : undefined,
          )
        }
      >
        {header && (
          <div className="grid gap-3">
            <Select
              label={t('templates.contents.headerType')}
              value={header.format ?? 'TEXT'}
              onChange={(event) => {
                const format = event.currentTarget.value
                replace(
                  'HEADER',
                  format === 'TEXT'
                    ? { type: 'HEADER', format, text: '' }
                    : format === 'LOCATION'
                      ? { type: 'HEADER', format }
                      : {
                          type: 'HEADER',
                          format,
                          example: { header_handle: [] },
                        },
                )
              }}
            >
              {['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT', 'LOCATION'].map(
                (format) => (
                  <option key={format} value={format}>
                    {format}
                  </option>
                ),
              )}
            </Select>
            {header.format === 'TEXT' && (
              <>
                <Input
                  label={t('templates.contents.headerText')}
                  value={header.text ?? ''}
                  maxLength={60}
                  onChange={(event) =>
                    replace('HEADER', {
                      ...header,
                      text: event.currentTarget.value,
                    })
                  }
                />
                <ParameterExamples
                  text={header.text ?? ''}
                  example={header.example}
                  parameterFormat={parameterFormat}
                  location="header"
                  onChange={(example) =>
                    replace('HEADER', { ...header, example })
                  }
                />
              </>
            )}
            {header.format &&
              ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(header.format) && (
                <div className="grid gap-2">
                  <Input
                    key={header.format}
                    type="file"
                    label={t('templates.contents.mediaFile')}
                    hint={t('templates.contents.mediaFileHint')}
                    accept={mediaAccept(header.format)}
                    required={!mediaHandle(header.example)}
                    disabled={isUploadingMedia || !channelId}
                    error={mediaError ?? undefined}
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0]
                      if (!file) return
                      setIsUploadingMedia(true)
                      setMediaError(null)
                      void uploadTemplateMedia(
                        channelId,
                        header.format as 'IMAGE' | 'VIDEO' | 'DOCUMENT',
                        file,
                        t,
                      )
                        .then((mediaId) => {
                          setUploadedFileName(file.name)
                          replace('HEADER', {
                            ...header,
                            example: {
                              ...(header.example ?? {}),
                              header_handle: [mediaId],
                            },
                          })
                        })
                        .catch((reason: unknown) =>
                          setMediaError(
                            errorMessage(
                              reason,
                              t('templates.contents.mediaUploadFailed'),
                            ),
                          ),
                        )
                        .finally(() => setIsUploadingMedia(false))
                    }}
                  />
                  {(isUploadingMedia || mediaHandle(header.example)) && (
                    <p
                      className="flex items-center gap-2 text-xs text-muted-foreground"
                      role="status"
                    >
                      {isUploadingMedia ? (
                        <LoaderCircle
                          className="size-3.5 animate-spin"
                          aria-hidden
                        />
                      ) : (
                        <CheckCircle2
                          className="size-3.5 text-success"
                          aria-hidden
                        />
                      )}
                      {isUploadingMedia
                        ? t('templates.contents.mediaUploading')
                        : t('templates.contents.mediaUploaded', {
                            name:
                              uploadedFileName ||
                              t('templates.contents.existingMedia'),
                          })}
                    </p>
                  )}
                </div>
              )}
          </div>
        )}
      </ComponentSection>

      <ComponentSection title={t('templates.contents.body')}>
        <div className="grid gap-3">
          <Textarea
            label={t('templates.contents.bodyText')}
            hint={t('templates.contents.bodyHint', {
              example:
                parameterFormat === 'NAMED' ? '{{customer_name}}' : '{{1}}',
            })}
            value={body.text ?? ''}
            rows={5}
            maxLength={1024}
            required
            onChange={(event) =>
              replace('BODY', { ...body, text: event.currentTarget.value })
            }
          />
          <ParameterExamples
            text={body.text ?? ''}
            example={body.example}
            parameterFormat={parameterFormat}
            location="body"
            onChange={(example) => replace('BODY', { ...body, example })}
          />
        </div>
      </ComponentSection>

      <ComponentSection
        title={t('templates.contents.footer')}
        optional
        enabled={Boolean(footer)}
        onToggle={(enabled) =>
          replace('FOOTER', enabled ? { type: 'FOOTER', text: '' } : undefined)
        }
      >
        {footer && (
          <Input
            label={t('templates.contents.footerText')}
            value={footer.text ?? ''}
            maxLength={60}
            onChange={(event) =>
              replace('FOOTER', {
                ...footer,
                text: event.currentTarget.value,
              })
            }
          />
        )}
      </ComponentSection>

      <ComponentSection title={t('templates.contents.buttons')} optional>
        <div className="grid gap-3">
          {(buttons?.buttons ?? []).map((button, index) => (
            <ButtonEditor
              key={index}
              button={button}
              index={index}
              onChange={(next) =>
                updateButtons(
                  (buttons?.buttons ?? []).map((current, currentIndex) =>
                    currentIndex === index ? next : current,
                  ),
                )
              }
              onRemove={() =>
                updateButtons(
                  (buttons?.buttons ?? []).filter(
                    (_, currentIndex) => currentIndex !== index,
                  ),
                )
              }
            />
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-self-start"
            disabled={(buttons?.buttons?.length ?? 0) >= 10}
            onClick={() =>
              updateButtons([
                ...(buttons?.buttons ?? []),
                { type: 'QUICK_REPLY', text: '' },
              ])
            }
          >
            <Plus className="size-4" aria-hidden />
            {t('templates.contents.addButton')}
          </Button>
        </div>
      </ComponentSection>

      <details className="rounded-xl border bg-background p-4">
        <summary className="cursor-pointer text-sm font-semibold">
          {t('templates.contents.advanced')}
        </summary>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          {t('templates.contents.advancedHint')}
        </p>
        <AdvancedComponentsEditor
          value={advanced}
          onChange={(nextAdvanced) =>
            commit([
              ...components.filter((component) =>
                ['HEADER', 'BODY', 'FOOTER', 'BUTTONS'].includes(
                  component.type,
                ),
              ),
              ...nextAdvanced,
            ])
          }
        />
      </details>
    </fieldset>
  )
}

function AdvancedComponentsEditor({
  value,
  onChange,
}: {
  value: TemplateComponent[]
  onChange: (value: TemplateComponent[]) => void
}) {
  const { t } = useTranslation()
  const serialized = JSON.stringify(value, null, 2)
  const [raw, setRaw] = useState(serialized)
  const [invalid, setInvalid] = useState(false)
  useEffect(() => setRaw(serialized), [serialized])
  return (
    <Textarea
      className="mt-3 min-h-48 font-mono text-xs"
      label={t('templates.contents.advancedJson')}
      error={invalid ? t('templates.contents.advancedInvalid') : undefined}
      value={raw}
      spellCheck={false}
      onChange={(event) => {
        const next = event.currentTarget.value
        setRaw(next)
        try {
          const parsed = JSON.parse(next) as unknown
          if (
            !Array.isArray(parsed) ||
            parsed.some((component) => !isRecord(component))
          ) {
            setInvalid(true)
            return
          }
          setInvalid(false)
          onChange(parsed as TemplateComponent[])
        } catch {
          setInvalid(true)
        }
      }}
    />
  )
}

function ComponentSection({
  title,
  optional = false,
  enabled = true,
  onToggle,
  children,
}: {
  title: string
  optional?: boolean
  enabled?: boolean
  onToggle?: (enabled: boolean) => void
  children?: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <section className="rounded-xl border bg-background p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold">{title}</h3>
          {optional && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t('templates.contents.optional')}
            </p>
          )}
        </div>
        {onToggle && (
          <Button
            type="button"
            size="sm"
            variant={enabled ? 'ghost' : 'outline'}
            onClick={() => onToggle(!enabled)}
          >
            {enabled
              ? t('templates.contents.remove')
              : t('templates.contents.add')}
          </Button>
        )}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </section>
  )
}

function ParameterExamples({
  text,
  example,
  parameterFormat,
  location,
  onChange,
}: {
  text: string
  example?: Record<string, unknown>
  parameterFormat: 'NAMED' | 'POSITIONAL'
  location: 'header' | 'body'
  onChange: (example: Record<string, unknown>) => void
}) {
  const { t } = useTranslation()
  const keys = placeholders(text, parameterFormat)
  if (!keys.length) return null
  const values = exampleValues(example, parameterFormat, location, keys)
  return (
    <div className="grid gap-2 rounded-lg border border-dashed p-3">
      <p className="text-xs font-semibold">
        {t('templates.contents.exampleValues')}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {keys.map((key, index) => (
          <Input
            key={key}
            label={`{{${key}}}`}
            value={values[index] ?? ''}
            required
            onChange={(event) => {
              const next = [...values]
              next[index] = event.currentTarget.value
              onChange(
                buildExample(parameterFormat, location, keys, next, example),
              )
            }}
          />
        ))}
      </div>
    </div>
  )
}

function ButtonEditor({
  button,
  index,
  onChange,
  onRemove,
}: {
  button: Record<string, unknown>
  index: number
  onChange: (button: Record<string, unknown>) => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const type = typeof button.type === 'string' ? button.type : 'QUICK_REPLY'
  const field = (name: string) =>
    typeof button[name] === 'string' ? button[name] : ''
  return (
    <div className="grid gap-3 rounded-xl border p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wide">
          {t('templates.contents.buttonNumber', { number: index + 1 })}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 text-destructive"
          onClick={onRemove}
          aria-label={t('templates.contents.removeButton')}
        >
          <X className="size-4" aria-hidden />
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label={t('templates.contents.buttonType')}
          value={type}
          onChange={(event) =>
            onChange({ type: event.currentTarget.value, text: '' })
          }
        >
          {['QUICK_REPLY', 'URL', 'PHONE_NUMBER', 'COPY_CODE', 'FLOW'].map(
            (value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ),
          )}
        </Select>
        <Input
          label={t('templates.contents.buttonText')}
          value={field('text')}
          required={type !== 'COPY_CODE'}
          maxLength={25}
          onChange={(event) =>
            onChange({ ...button, text: event.currentTarget.value })
          }
        />
      </div>
      {type === 'URL' && (
        <Input
          label={t('templates.contents.url')}
          value={field('url')}
          required
          onChange={(event) =>
            onChange({ ...button, url: event.currentTarget.value })
          }
        />
      )}
      {type === 'PHONE_NUMBER' && (
        <Input
          label={t('templates.contents.phoneNumber')}
          value={field('phone_number')}
          required
          onChange={(event) =>
            onChange({ ...button, phone_number: event.currentTarget.value })
          }
        />
      )}
      {type === 'COPY_CODE' && (
        <Input
          label={t('templates.contents.codeExample')}
          value={field('example')}
          required
          onChange={(event) =>
            onChange({ ...button, example: event.currentTarget.value })
          }
        />
      )}
      {type === 'FLOW' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label={t('templates.contents.flowId')}
            value={field('flow_id')}
            onChange={(event) =>
              onChange({ ...button, flow_id: event.currentTarget.value })
            }
          />
          <Input
            label={t('templates.contents.flowName')}
            value={field('flow_name')}
            onChange={(event) =>
              onChange({ ...button, flow_name: event.currentTarget.value })
            }
          />
        </div>
      )}
    </div>
  )
}

function LifecycleCard({ template }: { template: MessageTemplate | null }) {
  const { t } = useTranslation()
  const status = template?.status ?? 'PENDING'
  const decisionReached = status !== 'PENDING' && status !== 'IN_APPEAL'
  return (
    <section className="rounded-2xl border bg-card p-5">
      <h2 className="font-bold">{t('templates.lifecycle.title')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t('templates.lifecycle.description')}
      </p>
      <ol className="mt-5 grid gap-4">
        <LifecycleStep
          complete
          icon={<Send className="size-4" aria-hidden />}
          title={t('templates.lifecycle.submitted')}
          description={t('templates.lifecycle.submittedDescription')}
        />
        <LifecycleStep
          complete={decisionReached}
          active={status === 'PENDING' || status === 'IN_APPEAL'}
          icon={<ShieldCheck className="size-4" aria-hidden />}
          title={t('templates.lifecycle.review')}
          description={t('templates.lifecycle.reviewDescription')}
        />
        <LifecycleStep
          complete={decisionReached}
          active={decisionReached}
          icon={<Gavel className="size-4" aria-hidden />}
          title={t('templates.lifecycle.decision')}
          description={
            status === 'REJECTED'
              ? `${t('templates.rejectedReason')}: ${template?.rejected_reason ?? '—'}`
              : t('templates.lifecycle.decisionDescription')
          }
        />
      </ol>
      <p className="mt-5 rounded-xl bg-muted p-3 text-xs leading-5 text-muted-foreground">
        {t('templates.lifecycle.providerNote')}
      </p>
    </section>
  )
}

function LifecycleStep({
  complete,
  active = false,
  icon,
  title,
  description,
}: {
  complete: boolean
  active?: boolean
  icon: ReactNode
  title: string
  description: string
}) {
  return (
    <li className="flex gap-3">
      <span
        className={cn(
          'mt-0.5 grid size-7 shrink-0 place-items-center rounded-full',
          complete
            ? 'bg-success/15 text-success'
            : active
              ? 'bg-primary/15 text-primary'
              : 'bg-muted text-muted-foreground',
        )}
      >
        {icon}
      </span>
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
          {description}
        </span>
      </span>
    </li>
  )
}

function TemplateBubble({
  components,
  compact = false,
}: {
  components: TemplateComponent[]
  compact?: boolean
}) {
  const header = components.find((item) => item.type === 'HEADER')
  const body = components.find((item) => item.type === 'BODY')
  const footer = components.find((item) => item.type === 'FOOTER')
  const buttons =
    components.find((item) => item.type === 'BUTTONS')?.buttons ?? []
  return (
    <div className="ml-auto max-w-[92%] overflow-hidden rounded-xl rounded-tr-sm bg-card shadow-sm">
      {header?.format && header.format !== 'TEXT' && (
        <div
          className={cn(
            'grid place-items-center bg-muted text-muted-foreground',
            compact ? 'h-16' : 'h-32',
          )}
        >
          <FileText className="size-6" aria-hidden />
        </div>
      )}
      <div className={cn('px-3 pt-2.5', compact && 'text-xs')}>
        {header?.text && (
          <p className="font-bold">{sampleText(header.text, header.example)}</p>
        )}
        <p className="mt-1 whitespace-pre-wrap leading-5">
          {sampleText(body?.text ?? 'Message preview', body?.example)}
        </p>
        {footer?.text && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            {footer.text}
          </p>
        )}
        <p className="mt-1 pb-1 text-right text-[10px] text-muted-foreground">
          12:34
        </p>
      </div>
      {buttons.slice(0, 3).map((button, index) => (
        <div
          key={index}
          className="border-t px-3 py-2 text-center text-xs font-semibold text-primary"
        >
          {typeof button.text === 'string'
            ? button.text
            : typeof button.type === 'string'
              ? button.type
              : 'Button'}
        </div>
      ))}
    </div>
  )
}

function StatusPill({ status }: { status?: TemplateStatus }) {
  const tone =
    status === 'APPROVED'
      ? 'success'
      : status === 'REJECTED' || status === 'DISABLED'
        ? 'danger'
        : status === 'PENDING' || status === 'IN_APPEAL'
          ? 'warning'
          : 'neutral'
  return (
    <Pill tone={tone} dot>
      {status ?? 'UNKNOWN'}
    </Pill>
  )
}

function mediaHandle(example?: Record<string, unknown>) {
  return Array.isArray(example?.header_handle) &&
    typeof example.header_handle[0] === 'string'
    ? example.header_handle[0]
    : ''
}

function mediaAccept(format: string) {
  if (format === 'IMAGE') return 'image/jpeg,image/png'
  if (format === 'VIDEO') return 'video/mp4,video/3gpp'
  return '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
}

async function uploadTemplateMedia(
  channelId: string,
  format: 'IMAGE' | 'VIDEO' | 'DOCUMENT',
  file: File,
  t: ReturnType<typeof useTranslation>['t'],
) {
  const kind = format.toLowerCase() as 'image' | 'video' | 'document'
  const response = await apiClient.api.templates[':channelId'].media.$post({
    param: { channelId },
    form: { kind, file },
  })
  if (!response.ok) throw new Error(await apiError(response))
  const body = await response.json()
  if (!body.media.id) {
    throw new Error(t('templates.contents.mediaUploadFailed'))
  }
  return body.media.id
}

function placeholders(text: string, format: 'NAMED' | 'POSITIONAL'): string[] {
  const values = [...text.matchAll(/{{\s*([^}]+?)\s*}}/g)].map((match) =>
    match[1]!.trim(),
  )
  const filtered = values.filter((value) =>
    format === 'POSITIONAL'
      ? /^\d+$/.test(value)
      : /^[a-z][a-z0-9_]*$/i.test(value) && !/^\d+$/.test(value),
  )
  return [...new Set(filtered)].sort((left, right) =>
    format === 'POSITIONAL'
      ? Number(left) - Number(right)
      : left.localeCompare(right),
  )
}

function exampleValues(
  example: Record<string, unknown> | undefined,
  format: 'NAMED' | 'POSITIONAL',
  location: 'header' | 'body',
  keys: string[],
): string[] {
  if (format === 'POSITIONAL') {
    const raw =
      location === 'body' &&
      Array.isArray(example?.body_text) &&
      Array.isArray(example.body_text[0])
        ? example.body_text[0]
        : location === 'header' && Array.isArray(example?.header_text)
          ? example.header_text
          : []
    return keys.map((_, index) =>
      typeof raw[index] === 'string' ? raw[index] : '',
    )
  }
  const raw: unknown[] =
    location === 'body' && Array.isArray(example?.body_text_named_params)
      ? (example.body_text_named_params as unknown[])
      : location === 'header' &&
          Array.isArray(example?.header_text_named_params)
        ? (example.header_text_named_params as unknown[])
        : []
  return keys.map((key) => {
    const entry = raw.find((item) => isRecord(item) && item.param_name === key)
    return isRecord(entry) && typeof entry.example === 'string'
      ? entry.example
      : ''
  })
}

function buildExample(
  format: 'NAMED' | 'POSITIONAL',
  location: 'header' | 'body',
  keys: string[],
  values: string[],
  current?: Record<string, unknown>,
): Record<string, unknown> {
  if (format === 'POSITIONAL') {
    return {
      ...(current ?? {}),
      ...(location === 'body'
        ? { body_text: [values] }
        : { header_text: values }),
    }
  }
  const named = keys.map((key, index) => ({
    param_name: key,
    example: values[index] ?? '',
  }))
  return {
    ...(current ?? {}),
    ...(location === 'body'
      ? { body_text_named_params: named }
      : { header_text_named_params: named }),
  }
}

function sampleText(text: string, example?: Record<string, unknown>) {
  const positional: unknown[] =
    Array.isArray(example?.body_text) && Array.isArray(example.body_text[0])
      ? (example.body_text[0] as unknown[])
      : Array.isArray(example?.header_text)
        ? (example.header_text as unknown[])
        : []
  const named: unknown[] = Array.isArray(example?.body_text_named_params)
    ? (example.body_text_named_params as unknown[])
    : Array.isArray(example?.header_text_named_params)
      ? (example.header_text_named_params as unknown[])
      : []
  return text.replace(/{{\s*([^}]+)\s*}}/g, (match, key: string) => {
    const index = Number(key) - 1
    if (Number.isInteger(index) && typeof positional[index] === 'string')
      return positional[index]
    const value = named.find(
      (item): item is { param_name: string; example: string } =>
        isRecord(item) &&
        typeof item.param_name === 'string' &&
        typeof item.example === 'string' &&
        item.param_name === key.trim(),
    )
    return value?.example ?? match
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function previewComponents(value: string): TemplateComponent[] {
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? (parsed as TemplateComponent[]) : []
  } catch {
    return []
  }
}

function parseComponents(
  value: string,
  t: ReturnType<typeof useTranslation>['t'],
  parameterFormat: 'NAMED' | 'POSITIONAL',
  category: CreatableCategory,
): Array<{
  type:
    'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS' | 'CAROUSEL' | 'LIMITED_TIME_OFFER'
  [key: string]: unknown
}> {
  const parsed = previewComponents(value)
  const types = new Set([
    'HEADER',
    'BODY',
    'FOOTER',
    'BUTTONS',
    'CAROUSEL',
    'LIMITED_TIME_OFFER',
  ])
  if (!parsed.length || parsed.some((item) => !types.has(item.type)))
    throw new Error(t('templates.componentsInvalid'))
  for (const type of ['HEADER', 'BODY', 'FOOTER', 'BUTTONS']) {
    if (parsed.filter((item) => item.type === type).length > 1) {
      throw new Error(t('templates.validation.duplicateComponent', { type }))
    }
  }
  const body = parsed.find((item) => item.type === 'BODY')
  if (!body) throw new Error(t('templates.validation.bodyRequired'))
  if (
    category !== 'AUTHENTICATION' &&
    (typeof body.text !== 'string' || !body.text.trim())
  ) {
    throw new Error(t('templates.validation.bodyRequired'))
  }
  validateExamples(body, parameterFormat, 'body', t)
  const header = parsed.find((item) => item.type === 'HEADER')
  if (header?.format === 'TEXT') {
    if (typeof header.text !== 'string' || !header.text.trim()) {
      throw new Error(t('templates.validation.headerTextRequired'))
    }
    validateExamples(header, parameterFormat, 'header', t)
  }
  if (
    header?.format &&
    ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(header.format) &&
    !mediaHandle(header.example)
  ) {
    throw new Error(t('templates.validation.mediaRequired'))
  }
  const footer = parsed.find((item) => item.type === 'FOOTER')
  if (
    footer?.text &&
    (footer.text.length > 60 || /{{\s*[^}]+\s*}}/.test(footer.text))
  ) {
    throw new Error(t('templates.validation.footerInvalid'))
  }
  const buttons = parsed.find((item) => item.type === 'BUTTONS')?.buttons ?? []
  for (const button of buttons) {
    if (!validButton(button)) {
      throw new Error(t('templates.validation.buttonInvalid'))
    }
  }
  return parsed as Array<{
    type:
      | 'HEADER'
      | 'BODY'
      | 'FOOTER'
      | 'BUTTONS'
      | 'CAROUSEL'
      | 'LIMITED_TIME_OFFER'
    [key: string]: unknown
  }>
}

function validateExamples(
  component: TemplateComponent,
  format: 'NAMED' | 'POSITIONAL',
  location: 'header' | 'body',
  t: ReturnType<typeof useTranslation>['t'],
) {
  if (typeof component.text !== 'string') return
  const keys = placeholders(component.text, format)
  if (!keys.length) return
  if (
    format === 'POSITIONAL' &&
    keys.some((key, index) => Number(key) !== index + 1)
  ) {
    throw new Error(t('templates.validation.positionalVariables'))
  }
  if (
    exampleValues(component.example, format, location, keys).some(
      (example) => !example.trim(),
    )
  ) {
    throw new Error(t('templates.validation.examplesRequired'))
  }
}

function validButton(button: Record<string, unknown>) {
  if (typeof button.type !== 'string') return false
  if (
    button.type !== 'COPY_CODE' &&
    (typeof button.text !== 'string' ||
      !button.text.trim() ||
      button.text.length > 25)
  )
    return false
  if (
    button.type === 'URL' &&
    (typeof button.url !== 'string' || !/^https?:\/\//.test(button.url))
  )
    return false
  if (
    button.type === 'PHONE_NUMBER' &&
    (typeof button.phone_number !== 'string' ||
      !/^\+?[1-9]\d{6,14}$/.test(button.phone_number))
  )
    return false
  if (
    button.type === 'COPY_CODE' &&
    (typeof button.example !== 'string' || !button.example.trim())
  )
    return false
  if (
    button.type === 'FLOW' &&
    !(
      (typeof button.flow_id === 'string' && button.flow_id.trim()) ||
      (typeof button.flow_name === 'string' && button.flow_name.trim())
    )
  )
    return false
  return true
}

async function apiError(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    message?: string
  } | null
  return body?.message ?? `Request failed (${response.status})`
}

function errorMessage(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback
}
