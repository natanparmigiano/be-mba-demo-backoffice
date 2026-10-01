import type { InferResponseType } from 'hono/client'
import {
  Check,
  ChevronLeft,
  Copy,
  Package,
  Plus,
  RefreshCw,
  Save,
  Server,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useState, type SubmitEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { apiClient } from '../api'
import { authClient } from '../auth/auth-client'
import {
  Button,
  Checkbox,
  Dialog,
  EmptyState,
  Input,
  Textarea,
} from '../components/ui'

type McpsResponse = InferResponseType<
  typeof apiClient.api.runner.mcps.$get,
  200
>
type McpSummary = McpsResponse['mcps'][number]
type McpResponse = InferResponseType<
  (typeof apiClient.api.runner.mcps)[':id']['$get'],
  200
>
type FunctionsResponse = InferResponseType<
  typeof apiClient.api.runner.functions.$get,
  200
>
type FunctionSummary = FunctionsResponse['functions'][number]

export function McpsPage() {
  const { t, i18n } = useTranslation()
  const activeOrganizationQuery = authClient.useActiveOrganization()
  const activeMemberRoleQuery = authClient.useActiveMemberRole()
  const activeOrganizationId = activeOrganizationQuery.data?.id
  const canManage = (activeMemberRoleQuery.data?.role ?? '')
    .split(',')
    .map((role) => role.trim())
    .some((role) => role === 'owner' || role === 'admin')

  const [mcps, setMcps] = useState<McpSummary[]>([])
  const [functions, setFunctions] = useState<FunctionSummary[]>([])
  const [selectedMcpId, setSelectedMcpId] = useState<number | 'new' | null>(
    null,
  )
  const [details, setDetails] = useState<McpResponse['mcp'] | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [functionIds, setFunctionIds] = useState<number[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingDetails, setIsLoadingDetails] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [endpointCopied, setEndpointCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    document.title = `${t('mcps.title')} · ${t('design.brand')}`
    document
      .querySelector<HTMLMetaElement>('meta[name="description"]')
      ?.setAttribute('content', t('mcps.metaDescription'))
  }, [t])

  const refresh = useCallback(async () => {
    if (!activeOrganizationId) {
      setMcps([])
      setFunctions([])
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const [mcpsResponse, functionsResponse] = await Promise.all([
        apiClient.api.runner.mcps.$get(),
        apiClient.api.runner.functions.$get(),
      ])
      if (!mcpsResponse.ok || !functionsResponse.ok) {
        throw new Error(t('mcps.loadFailed'))
      }
      setMcps((await mcpsResponse.json()).mcps)
      setFunctions((await functionsResponse.json()).functions)
    } catch (reason) {
      setError(getErrorMessage(reason, t('mcps.loadFailed')))
    } finally {
      setIsLoading(false)
    }
  }, [activeOrganizationId, t])

  useEffect(() => {
    setSelectedMcpId(null)
    setDetails(null)
    void refresh()
  }, [refresh])

  const openMcp = async (mcpId: number) => {
    setSelectedMcpId(mcpId)
    setDetails(null)
    setIsLoadingDetails(true)
    setError(null)
    setNotice(null)
    try {
      const response = await apiClient.api.runner.mcps[':id'].$get({
        param: { id: String(mcpId) },
      })
      if (!response.ok) {
        throw new Error(
          await readApiError(response, t('mcps.detailLoadFailed')),
        )
      }
      const mcp = (await response.json()).mcp
      setDetails(mcp)
      setName(mcp.name)
      setDescription(mcp.description ?? '')
      setFunctionIds(mcp.functions.map((item) => item.id))
    } catch (reason) {
      setError(getErrorMessage(reason, t('mcps.detailLoadFailed')))
    } finally {
      setIsLoadingDetails(false)
    }
  }

  const openNewMcp = () => {
    setSelectedMcpId('new')
    setDetails(null)
    setName('')
    setDescription('')
    setFunctionIds([])
    setError(null)
    setNotice(null)
  }

  const saveMcp = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (selectedMcpId === null || functionIds.length === 0) return
    setIsSaving(true)
    setError(null)
    setNotice(null)
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        functionIds,
      }
      const response =
        selectedMcpId === 'new'
          ? await apiClient.api.runner.mcps.$post({ json: payload })
          : await apiClient.api.runner.mcps[':id'].$patch({
              param: { id: String(selectedMcpId) },
              json: payload,
            })
      if (!response.ok) {
        throw new Error(await readApiError(response, t('mcps.saveFailed')))
      }
      const saved = (await response.json()).mcp
      setSelectedMcpId(saved.id)
      setDetails(saved)
      setName(saved.name)
      setDescription(saved.description ?? '')
      setFunctionIds(saved.functions.map((item) => item.id))
      setNotice(t(selectedMcpId === 'new' ? 'mcps.created' : 'mcps.saved'))
      await refresh()
    } catch (reason) {
      setError(getErrorMessage(reason, t('mcps.saveFailed')))
    } finally {
      setIsSaving(false)
    }
  }

  const deleteMcp = async () => {
    if (typeof selectedMcpId !== 'number') return
    setIsDeleting(true)
    setError(null)
    try {
      const response = await apiClient.api.runner.mcps[':id'].$delete({
        param: { id: String(selectedMcpId) },
      })
      if (!response.ok) {
        throw new Error(await readApiError(response, t('mcps.deleteFailed')))
      }
      setDeleteOpen(false)
      setSelectedMcpId(null)
      setDetails(null)
      setNotice(t('mcps.deleted'))
      await refresh()
    } catch (reason) {
      setError(getErrorMessage(reason, t('mcps.deleteFailed')))
    } finally {
      setIsDeleting(false)
    }
  }

  const toggleFunction = (functionId: number, checked: boolean) => {
    setFunctionIds((current) =>
      checked
        ? [...current, functionId]
        : current.filter((id) => id !== functionId),
    )
  }

  const copyEndpoint = async () => {
    if (typeof selectedMcpId !== 'number') return
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/api/mcp/${selectedMcpId}`,
      )
      setEndpointCopied(true)
      window.setTimeout(() => setEndpointCopied(false), 2_000)
    } catch {
      setError(t('mcps.endpointCopyFailed'))
    }
  }

  if (selectedMcpId !== null) {
    const isNew = selectedMcpId === 'new'
    return (
      <div className="grid gap-6">
        <header className="flex flex-wrap items-center gap-4">
          <Button
            aria-label={t('mcps.back')}
            size="icon"
            variant="ghost"
            onClick={() => {
              setSelectedMcpId(null)
              setDetails(null)
              setError(null)
              setNotice(null)
            }}
          >
            <ChevronLeft className="size-5" />
          </Button>
          <span className="grid size-12 place-items-center rounded-xl bg-primary/12 text-primary">
            <Package className="size-6" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold tracking-[0.12em] text-primary uppercase">
              {t('mcps.eyebrow')}
            </p>
            <h1 className="mt-1 truncate text-3xl font-black tracking-tight">
              {isNew ? t('mcps.createTitle') : (details?.name ?? name)}
            </h1>
          </div>
        </header>

        {(error || notice) && (
          <p
            className={
              error
                ? 'rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive'
                : 'rounded-xl border border-success/30 bg-success/10 p-3 text-sm text-success'
            }
            role="status"
          >
            {error ?? notice}
          </p>
        )}

        {isLoadingDetails ? (
          <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
            {t('mcps.loadingDetails')}
          </p>
        ) : !isNew && !details ? null : (
          <>
            {!isNew && typeof selectedMcpId === 'number' && (
              <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
                <div className="flex items-start gap-4 p-5 sm:p-6">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
                    <Server className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-bold">{t('mcps.endpointTitle')}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t('mcps.endpointDescription')}
                    </p>
                  </div>
                </div>
                <div className="flex items-end gap-3 border-t bg-muted/10 p-5 sm:p-6">
                  <div className="min-w-0 flex-1">
                    <Input
                      label={t('mcps.endpointLabel')}
                      readOnly
                      value={`${window.location.origin}/api/mcp/${selectedMcpId}`}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void copyEndpoint()}
                  >
                    {endpointCopied ? (
                      <Check className="size-4" aria-hidden />
                    ) : (
                      <Copy className="size-4" aria-hidden />
                    )}
                    {t(
                      endpointCopied
                        ? 'mcps.endpointCopied'
                        : 'mcps.endpointCopy',
                    )}
                  </Button>
                </div>
                <p className="border-t px-5 py-4 text-xs text-muted-foreground sm:px-6">
                  {t('mcps.endpointAuthHint')}
                </p>
              </section>
            )}

            <form
              className="overflow-hidden rounded-xl border bg-card shadow-xs"
              onSubmit={(event) => void saveMcp(event)}
            >
              <div className="grid gap-5 p-5 sm:p-6">
                <div>
                  <h2 className="font-bold">{t('mcps.formTitle')}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t('mcps.formDescription')}
                  </p>
                </div>
                <Input
                  disabled={!canManage || isSaving}
                  error={
                    name && !isSnakeCaseName(name)
                      ? t('mcps.nameError')
                      : undefined
                  }
                  hint={t('mcps.nameHint')}
                  label={t('mcps.name')}
                  maxLength={128}
                  required
                  value={name}
                  onChange={(event) =>
                    setName(toSnakeCaseName(event.target.value))
                  }
                />
                <Textarea
                  disabled={!canManage || isSaving}
                  label={t('mcps.descriptionLabel')}
                  maxLength={2_000}
                  rows={4}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
                <fieldset disabled={!canManage || isSaving}>
                  <legend className="text-sm font-semibold">
                    {t('mcps.functions')}
                  </legend>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('mcps.functionsHint')}
                  </p>
                  <div className="mt-3 grid gap-2 rounded-xl border p-4 sm:grid-cols-2">
                    {functions.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {t('mcps.noFunctions')}
                      </p>
                    ) : (
                      functions.map((item) => (
                        <div
                          className="rounded-lg border bg-background p-3"
                          key={item.id}
                        >
                          <Checkbox
                            checked={functionIds.includes(item.id)}
                            label={item.name}
                            onChange={(event) =>
                              toggleFunction(item.id, event.target.checked)
                            }
                          />
                          {item.description && (
                            <p className="mt-1 pl-6 text-xs text-muted-foreground">
                              {item.description}
                            </p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </fieldset>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/10 p-5">
                {canManage && !isNew ? (
                  <Button
                    type="button"
                    variant="danger"
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 className="size-4" />
                    {t('mcps.delete')}
                  </Button>
                ) : (
                  <span />
                )}
                {canManage ? (
                  <Button
                    disabled={
                      functionIds.length === 0 || !isSnakeCaseName(name)
                    }
                    isLoading={isSaving}
                    type="submit"
                  >
                    <Save className="size-4" />
                    {t(isNew ? 'mcps.create' : 'mcps.save')}
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t('mcps.managersOnly')}
                  </p>
                )}
              </div>
            </form>
          </>
        )}

        <Dialog
          description={t('mcps.deleteDescription', { name: details?.name })}
          dismissible={!isDeleting}
          open={deleteOpen}
          title={t('mcps.deleteTitle')}
          onOpenChange={(open) => !isDeleting && setDeleteOpen(open)}
        >
          <div className="flex justify-end gap-2">
            <Button
              disabled={isDeleting}
              variant="ghost"
              onClick={() => setDeleteOpen(false)}
            >
              {t('mcps.cancel')}
            </Button>
            <Button
              isLoading={isDeleting}
              variant="danger"
              onClick={() => void deleteMcp()}
            >
              {t('mcps.confirmDelete')}
            </Button>
          </div>
        </Dialog>
      </div>
    )
  }

  return (
    <div className="grid gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold tracking-[0.12em] text-primary uppercase">
            {t('mcps.eyebrow')}
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight">
            {t('mcps.title')}
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            {t('mcps.description')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void refresh()}>
            <RefreshCw className="size-4" />
            {t('mcps.refresh')}
          </Button>
          {canManage && (
            <Button disabled={functions.length === 0} onClick={openNewMcp}>
              <Plus className="size-4" />
              {t('mcps.new')}
            </Button>
          )}
        </div>
      </header>

      {(error || notice) && (
        <p
          className={
            error
              ? 'rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive'
              : 'rounded-xl border border-success/30 bg-success/10 p-3 text-sm text-success'
          }
          role="status"
        >
          {error ?? notice}
        </p>
      )}

      <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <div className="flex items-center justify-between gap-4 border-b px-5 py-4">
          <div>
            <h2 className="font-bold">{t('mcps.directory')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('mcps.count', { count: mcps.length })}
            </p>
          </div>
        </div>
        {isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">
            {t('mcps.loading')}
          </p>
        ) : mcps.length === 0 ? (
          <div className="p-6">
            <EmptyState
              action={
                canManage && functions.length > 0 ? (
                  <Button onClick={openNewMcp}>
                    <Plus className="size-4" />
                    {t('mcps.create')}
                  </Button>
                ) : undefined
              }
              description={
                functions.length === 0
                  ? t('mcps.emptyNeedsFunctions')
                  : t('mcps.emptyDescription')
              }
              icon={<Package className="size-6" />}
              title={t('mcps.empty')}
            />
          </div>
        ) : (
          <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
            {mcps.map((mcp) => (
              <button
                className="group flex min-h-40 flex-col overflow-hidden rounded-xl border bg-background text-left transition hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/25"
                key={mcp.id}
                type="button"
                onClick={() => void openMcp(mcp.id)}
              >
                <div className="flex items-start gap-3 p-5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
                    <Package className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold group-hover:text-primary">
                      {mcp.name}
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {mcp.description || t('mcps.noDescription')}
                    </p>
                    <p className="mt-3 line-clamp-2 text-xs font-medium text-foreground/80">
                      {mcp.functionNames.length > 0
                        ? mcp.functionNames.join(', ')
                        : t('mcps.noFunctions')}
                    </p>
                  </div>
                </div>
                <div className="mt-auto flex items-center justify-between gap-3 border-t bg-muted/20 px-5 py-3 text-xs text-muted-foreground">
                  <span>
                    {t('mcps.functionCount', { count: mcp.functionCount })}
                  </span>
                  <span>
                    {t('mcps.updated', {
                      date: formatDate(mcp.updatedAt, i18n.language),
                    })}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function formatDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
    new Date(value),
  )
}

function isSnakeCaseName(value: string): boolean {
  return value.length <= 128 && /^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(value)
}

function toSnakeCaseName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+/, '')
}

async function readApiError(response: Response, fallback: string) {
  try {
    const body = (await response.clone().json()) as { message?: unknown }
    return typeof body.message === 'string' ? body.message : fallback
  } catch {
    return fallback
  }
}

function getErrorMessage(reason: unknown, fallback: string): string {
  return reason instanceof Error && reason.message ? reason.message : fallback
}
