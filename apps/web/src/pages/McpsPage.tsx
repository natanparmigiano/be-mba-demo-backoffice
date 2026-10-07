import type { InferResponseType } from 'hono/client'
import {
  Check,
  ChevronLeft,
  Copy,
  Download,
  Package,
  Plus,
  RefreshCw,
  Save,
  Server,
  Trash2,
  Upload,
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
  InlineFeedback,
  PageHeader,
  Textarea,
} from '@mba-desk/ui'

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
type McpImportInspection = InferResponseType<
  (typeof apiClient.api.runner.mcps)['import']['inspect']['$post'],
  200
>['preview']

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
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [endpointCopied, setEndpointCopied] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importYaml, setImportYaml] = useState('')
  const [importFileName, setImportFileName] = useState('')
  const [importPreview, setImportPreview] =
    useState<McpImportInspection | null>(null)
  const [isInspectingImport, setIsInspectingImport] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [overwriteConfirmed, setOverwriteConfirmed] = useState(false)
  const [importInputKey, setImportInputKey] = useState(0)
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
    setDeleteError(null)
    try {
      const response = await apiClient.api.runner.mcps[':id'].$delete({
        param: { id: String(selectedMcpId) },
      })
      if (!response.ok) {
        if (response.status === 409) {
          throw new Error(t('mcps.usedByAgent'))
        }
        throw new Error(await readApiError(response, t('mcps.deleteFailed')))
      }
      setDeleteOpen(false)
      setSelectedMcpId(null)
      setDetails(null)
      setNotice(t('mcps.deleted'))
      await refresh()
    } catch (reason) {
      setDeleteError(getErrorMessage(reason, t('mcps.deleteFailed')))
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

  const exportMcp = async () => {
    if (typeof selectedMcpId !== 'number') return
    setIsExporting(true)
    setError(null)
    try {
      const response = await fetch(`/api/runner/mcps/${selectedMcpId}/export`)
      if (!response.ok) {
        throw new Error(await readApiError(response, t('mcps.exportFailed')))
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = getDownloadFileName(
        response.headers.get('content-disposition'),
        `${details?.name ?? name}.mcpx`,
      )
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
      setNotice(t('mcps.exported'))
    } catch (reason) {
      setError(getErrorMessage(reason, t('mcps.exportFailed')))
    } finally {
      setIsExporting(false)
    }
  }

  const openImport = () => {
    setImportYaml('')
    setImportFileName('')
    setImportPreview(null)
    setImportError(null)
    setOverwriteConfirmed(false)
    setImportInputKey((value) => value + 1)
    setImportOpen(true)
  }

  const selectImportFile = async (file: File | null) => {
    setImportPreview(null)
    setImportError(null)
    setOverwriteConfirmed(false)
    setImportFileName(file?.name ?? '')
    setImportYaml('')
    if (!file) return
    if (file.size === 0 || file.size > 10 * 1024 * 1024) {
      setImportError(t('mcps.importPanel.invalidSize'))
      return
    }
    try {
      setImportYaml(await file.text())
    } catch {
      setImportError(t('mcps.importPanel.readFailed'))
    }
  }

  const inspectImport = async () => {
    if (!importYaml || isInspectingImport) return
    setIsInspectingImport(true)
    setImportError(null)
    setImportPreview(null)
    setOverwriteConfirmed(false)
    try {
      const response = await apiClient.api.runner.mcps['import'][
        'inspect'
      ].$post({ json: { yaml: importYaml } })
      if (!response.ok) {
        throw new Error(
          await readApiError(response, t('mcps.importPanel.inspectFailed')),
        )
      }
      setImportPreview((await response.json()).preview)
    } catch (reason) {
      setImportError(
        getErrorMessage(reason, t('mcps.importPanel.inspectFailed')),
      )
    } finally {
      setIsInspectingImport(false)
    }
  }

  const importMcp = async () => {
    if (!importYaml || !importPreview || !importPreview.canImport) return
    if (importPreview.mode === 'overwrite' && !overwriteConfirmed) return
    setIsImporting(true)
    setImportError(null)
    try {
      const response = await apiClient.api.runner.mcps['import'].$post({
        json: {
          yaml: importYaml,
          overwrite: importPreview.mode === 'overwrite',
        },
      })
      if (!response.ok) {
        throw new Error(
          await readApiError(response, t('mcps.importPanel.importFailed')),
        )
      }
      const imported = (await response.json()).mcp
      setImportOpen(false)
      await refresh()
      await openMcp(imported.id)
      setNotice(t('mcps.importPanel.imported', { name: imported.name }))
    } catch (reason) {
      setImportError(
        getErrorMessage(reason, t('mcps.importPanel.importFailed')),
      )
    } finally {
      setIsImporting(false)
    }
  }

  const importDialog = (
    <Dialog
      dismissible={!isInspectingImport && !isImporting}
      open={importOpen}
      title={t('mcps.importPanel.title')}
      description={t('mcps.importPanel.description')}
      icon={
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
          <Upload className="size-5" aria-hidden />
        </span>
      }
      size="xl"
      onOpenChange={(open) => {
        if (!isInspectingImport && !isImporting) setImportOpen(open)
      }}
    >
      <div className="grid w-full gap-4">
        <Input
          key={importInputKey}
          accept=".mcpx,application/yaml,text/yaml,text/plain"
          disabled={isInspectingImport || isImporting}
          label={t('mcps.importPanel.file')}
          type="file"
          onChange={(event) =>
            void selectImportFile(event.target.files?.[0] ?? null)
          }
        />
        {importFileName && !importPreview && (
          <p className="text-sm text-muted-foreground">{importFileName}</p>
        )}
        {importError && (
          <p
            className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            role="alert"
          >
            {importError}
          </p>
        )}
        {importPreview && (
          <div className="grid gap-4">
            <div className="rounded-xl border bg-muted/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-bold">{importPreview.mcpName}</p>
                  <p className="text-sm text-muted-foreground">
                    {t(`mcps.importPanel.mode.${importPreview.mode}`)}
                  </p>
                </div>
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                  {t('mcps.importPanel.functionCount', {
                    count: importPreview.functions.length,
                  })}
                </span>
              </div>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">
                    {t('mcps.importPanel.executionHistory')}
                  </dt>
                  <dd className="font-semibold">
                    {importPreview.affectedExecutionCount}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    {t('mcps.importPanel.apiKeys')}
                  </dt>
                  <dd className="font-semibold">
                    {importPreview.affectedApiKeyCount}
                  </dd>
                </div>
              </dl>
            </div>
            <div className="max-h-64 overflow-y-auto rounded-xl border">
              {importPreview.functions.map((fn) => (
                <div
                  className="grid gap-1 border-b px-4 py-3 last:border-b-0 sm:grid-cols-[1fr_auto_1fr_auto] sm:items-center"
                  key={`${fn.sourceName}:${fn.targetName}`}
                >
                  <code className="truncate text-xs">{fn.sourceName}</code>
                  <span className="text-muted-foreground">→</span>
                  <code className="truncate text-xs font-bold text-primary">
                    {fn.targetName}
                  </code>
                  <span className="text-xs text-muted-foreground">
                    {t('mcps.importPanel.revisionCount', {
                      count: fn.revisionCount,
                    })}
                  </span>
                </div>
              ))}
            </div>
            {importPreview.removedFunctionNames.length > 0 && (
              <div className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
                {t('mcps.importPanel.removedFunctions', {
                  names: importPreview.removedFunctionNames.join(', '),
                })}
              </div>
            )}
            {importPreview.blockers.map((blocker) => (
              <div
                className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                key={`${blocker.code}:${blocker.functionNames.join(',')}`}
              >
                {t(`mcps.importPanel.blockers.${blocker.code}`, {
                  names: blocker.functionNames.join(', '),
                })}
              </div>
            ))}
            {importPreview.mode === 'overwrite' && importPreview.canImport && (
              <Checkbox
                checked={overwriteConfirmed}
                label={t('mcps.importPanel.confirmOverwrite', {
                  name: importPreview.mcpName,
                })}
                onChange={(event) =>
                  setOverwriteConfirmed(event.target.checked)
                }
              />
            )}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button
            disabled={isInspectingImport || isImporting}
            variant="ghost"
            onClick={() => setImportOpen(false)}
          >
            {t('mcps.cancel')}
          </Button>
          {!importPreview ? (
            <Button
              disabled={!importYaml}
              isLoading={isInspectingImport}
              onClick={() => void inspectImport()}
            >
              {t('mcps.importPanel.inspect')}
            </Button>
          ) : (
            <Button
              disabled={
                !importPreview.canImport ||
                (importPreview.mode === 'overwrite' && !overwriteConfirmed)
              }
              isLoading={isImporting}
              onClick={() => void importMcp()}
            >
              <Upload className="size-4" />
              {t('mcps.importPanel.import')}
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  )

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
          {canManage && !isNew && (
            <Button
              variant="outline"
              isLoading={isExporting}
              onClick={() => void exportMcp()}
            >
              <Download className="size-4" />
              {t('mcps.export')}
            </Button>
          )}
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
                  maxLength={512}
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
                    onClick={() => {
                      setDeleteError(null)
                      setDeleteOpen(true)
                    }}
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
          <div className="grid gap-4">
            {deleteError && (
              <p
                className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                role="alert"
              >
                {deleteError}
              </p>
            )}
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
          </div>
        </Dialog>
        {importDialog}
      </div>
    )
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow={t('mcps.eyebrow')}
        title={t('mcps.title')}
        titleStyle="strong"
        description={t('mcps.description')}
        descriptionWidth="3xl"
        compactDescription
        actions={
          <>
            <Button variant="outline" onClick={() => void refresh()}>
              <RefreshCw className="size-4" />
              {t('mcps.refresh')}
            </Button>
            {canManage && (
              <>
                <Button variant="outline" onClick={openImport}>
                  <Upload className="size-4" />
                  {t('mcps.import')}
                </Button>
                <Button disabled={functions.length === 0} onClick={openNewMcp}>
                  <Plus className="size-4" />
                  {t('mcps.new')}
                </Button>
              </>
            )}
          </>
        }
      />

      {(error || notice) && (
        <InlineFeedback tone={error ? 'error' : 'success'}>
          {error ?? notice}
        </InlineFeedback>
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
      {importDialog}
    </div>
  )
}

function getDownloadFileName(
  contentDisposition: string | null,
  fallback: string,
): string {
  const match = contentDisposition?.match(/filename="([^"]+)"/i)
  return match?.[1] ?? fallback
}

function formatDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
    new Date(value),
  )
}

function isSnakeCaseName(value: string): boolean {
  return value.length <= 512 && /^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(value)
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
