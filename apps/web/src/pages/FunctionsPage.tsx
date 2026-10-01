import type { InferResponseType } from 'hono/client'
import {
  AlertTriangle,
  Archive,
  Braces,
  ChevronLeft,
  Eye,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Settings2,
  Trash2,
} from 'lucide-react'
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
  type SubmitEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import { apiClient } from '../api'
import { authClient } from '../auth/auth-client'
import { useTheme } from '../components/theme/ThemeProvider'
import {
  Button,
  Checkbox,
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
  Textarea,
} from '../components/ui'

const RunnerCodeEditor = lazy(async () => {
  const module = await import('../components/runner/RunnerCodeEditor')
  return { default: module.RunnerCodeEditor }
})

type FunctionsResponse = InferResponseType<
  typeof apiClient.api.runner.functions.$get,
  200
>
type FunctionSummary = FunctionsResponse['functions'][number]
type FunctionDetailsResponse = InferResponseType<
  (typeof apiClient.api.runner.functions)[':id']['$get'],
  200
>
type FunctionRevision = FunctionDetailsResponse['revisions'][number]
type RunnerParameter = FunctionRevision['parameters'][number]
type ExecutionsResponse = InferResponseType<
  (typeof apiClient.api.runner.functions)[':id']['executions']['$get'],
  200
>
type ExecutionHistoryEntry = ExecutionsResponse['executions'][number]
type ExecutionPhase = 'idle' | 'running'

const DEFAULT_CODE = `/** @param {RunnerParameters} parameters */
async (parameters) => {
  return { ok: true }
}`

export function FunctionsPage() {
  const { t, i18n } = useTranslation()
  const { resolvedTheme } = useTheme()
  const activeOrganizationQuery = authClient.useActiveOrganization()
  const activeMemberRoleQuery = authClient.useActiveMemberRole()
  const activeOrganizationId = activeOrganizationQuery.data?.id
  const canManage = (activeMemberRoleQuery.data?.role ?? '')
    .split(',')
    .map((role) => role.trim())
    .some((role) => role === 'owner' || role === 'admin')

  const [functions, setFunctions] = useState<FunctionSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createDescription, setCreateDescription] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [selectedFunctionId, setSelectedFunctionId] = useState<number | null>(
    null,
  )
  const [details, setDetails] = useState<FunctionDetailsResponse | null>(null)
  const [isLoadingDetails, setIsLoadingDetails] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [selectedRevision, setSelectedRevision] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [code, setCode] = useState(DEFAULT_CODE)
  const [parameters, setParameters] = useState<RunnerParameter[]>([])
  const [showParameters, setShowParameters] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isReverting, setIsReverting] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const [argumentsJson, setArgumentsJson] = useState('{}')
  const [executionPhase, setExecutionPhase] = useState<ExecutionPhase>('idle')
  const [executionResult, setExecutionResult] = useState<unknown>(null)
  const [executionHistory, setExecutionHistory] = useState<
    ExecutionHistoryEntry[]
  >([])
  const [isLoadingExecutions, setIsLoadingExecutions] = useState(false)
  const [executionHistoryError, setExecutionHistoryError] = useState<
    string | null
  >(null)
  const detailRequestId = useRef(0)
  const functionsRequestId = useRef(0)
  const executionHistoryRequestId = useRef(0)

  useEffect(() => {
    document.title = `${t('functions.title')} · ${t('design.brand')}`
    document
      .querySelector<HTMLMetaElement>('meta[name="description"]')
      ?.setAttribute('content', t('functions.metaDescription'))
  }, [t])

  const refreshFunctions = useCallback(async () => {
    const requestId = ++functionsRequestId.current
    if (!activeOrganizationId) {
      setFunctions([])
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const response = await apiClient.api.runner.functions.$get()
      if (!response.ok) {
        throw new Error(
          await readApiError(response, t('functions.requestFailed')),
        )
      }
      const body = await response.json()
      if (functionsRequestId.current === requestId) setFunctions(body.functions)
    } catch (reason) {
      if (functionsRequestId.current === requestId) {
        setError(getErrorMessage(reason, t('functions.operationFailed')))
      }
    } finally {
      if (functionsRequestId.current === requestId) setIsLoading(false)
    }
  }, [activeOrganizationId, t])

  useEffect(() => {
    void refreshFunctions()
  }, [refreshFunctions])

  useEffect(() => {
    detailRequestId.current += 1
    executionHistoryRequestId.current += 1
    setSelectedFunctionId(null)
    setDetails(null)
    setExecutionHistory([])
    setIsLoadingDetails(false)
    setIsLoadingExecutions(false)
  }, [activeOrganizationId])

  const loadExecutionHistory = useCallback(
    async (functionId: number) => {
      const requestId = ++executionHistoryRequestId.current
      setIsLoadingExecutions(true)
      setExecutionHistoryError(null)
      try {
        const response = await apiClient.api.runner.functions[':id'][
          'executions'
        ].$get({ param: { id: String(functionId) } })
        if (!response.ok) {
          throw new Error(
            await readApiError(response, t('functions.historyLoadFailed')),
          )
        }
        if (executionHistoryRequestId.current === requestId) {
          setExecutionHistory((await response.json()).executions)
        }
      } catch (reason) {
        if (executionHistoryRequestId.current === requestId) {
          setExecutionHistoryError(
            getErrorMessage(reason, t('functions.historyLoadFailed')),
          )
        }
      } finally {
        if (executionHistoryRequestId.current === requestId) {
          setIsLoadingExecutions(false)
        }
      }
    },
    [t],
  )

  const applyRevision = (revision: FunctionRevision) => {
    setSelectedRevision(revision.revision)
    setCode(revision.code)
    setParameters(revision.parameters)
    setArgumentsJson(
      JSON.stringify(createExampleArguments(revision.parameters), null, 2),
    )
    setExecutionResult(null)
  }

  const loadFunction = useCallback(
    async (functionId: number) => {
      const requestId = ++detailRequestId.current
      setIsLoadingDetails(true)
      setDetailError(null)
      try {
        const detailsResponse = await apiClient.api.runner.functions[
          ':id'
        ].$get({
          param: { id: String(functionId) },
        })
        if (!detailsResponse.ok) {
          throw new Error(
            await readApiError(
              detailsResponse,
              t('functions.detailLoadFailed'),
            ),
          )
        }
        const nextDetails = await detailsResponse.json()
        if (detailRequestId.current !== requestId) return
        setDetails(nextDetails)
        setName(nextDetails.function.name)
        setDescription(nextDetails.function.description ?? '')
        applyRevision(nextDetails.function.revision)
        void loadExecutionHistory(functionId)
      } catch (reason) {
        if (detailRequestId.current === requestId) {
          setDetailError(
            getErrorMessage(reason, t('functions.detailLoadFailed')),
          )
        }
      } finally {
        if (detailRequestId.current === requestId) setIsLoadingDetails(false)
      }
    },
    [loadExecutionHistory, t],
  )

  const openFunction = (functionId: number) => {
    setSelectedFunctionId(functionId)
    setDetails(null)
    setExecutionResult(null)
    setShowParameters(false)
    void loadFunction(functionId)
  }

  const closeFunction = () => {
    if (isSaving || isReverting || isDeleting || executionPhase !== 'idle')
      return
    detailRequestId.current += 1
    setShowParameters(false)
    setSelectedFunctionId(null)
    setDetails(null)
    setExecutionHistory([])
    setDetailError(null)
  }

  const createFunction = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsCreating(true)
    setCreateError(null)
    try {
      const response = await apiClient.api.runner.functions.$post({
        json: {
          name: createName.trim(),
          description: createDescription.trim() || null,
          code: DEFAULT_CODE,
          parameters: [],
        },
      })
      if (!response.ok) {
        throw new Error(
          await readApiError(
            response,
            t('functions.requestFailed'),
            t('functions.nameConflict'),
          ),
        )
      }
      const created = (await response.json()).function
      setCreateOpen(false)
      setCreateName('')
      setCreateDescription('')
      setNotice(t('functions.created'))
      await refreshFunctions()
      openFunction(created.id)
    } catch (reason) {
      setCreateError(getErrorMessage(reason, t('functions.operationFailed')))
    } finally {
      setIsCreating(false)
    }
  }

  const saveFunction = async () => {
    if (!selectedFunctionId) return
    setIsSaving(true)
    setDetailError(null)
    try {
      const response = await apiClient.api.runner.functions[':id'].$patch({
        param: { id: String(selectedFunctionId) },
        json: {
          name: name.trim(),
          description: description.trim() || null,
          code,
          parameters,
        },
      })
      if (!response.ok) {
        throw new Error(
          await readApiError(
            response,
            t('functions.requestFailed'),
            t('functions.nameConflict'),
          ),
        )
      }
      setNotice(t('functions.saved'))
      await Promise.all([loadFunction(selectedFunctionId), refreshFunctions()])
    } catch (reason) {
      setDetailError(getErrorMessage(reason, t('functions.operationFailed')))
    } finally {
      setIsSaving(false)
    }
  }

  const restoreRevision = async () => {
    if (!selectedFunctionId || !selectedRevision) return
    setIsReverting(true)
    setDetailError(null)
    try {
      const response = await apiClient.api.runner.functions[':id'].revisions[
        ':revision'
      ].restore.$post({
        param: {
          id: String(selectedFunctionId),
          revision: String(selectedRevision),
        },
      })
      if (!response.ok) {
        throw new Error(
          await readApiError(response, t('functions.requestFailed')),
        )
      }
      setNotice(t('functions.reverted', { revision: selectedRevision }))
      await Promise.all([loadFunction(selectedFunctionId), refreshFunctions()])
    } catch (reason) {
      setDetailError(getErrorMessage(reason, t('functions.operationFailed')))
    } finally {
      setIsReverting(false)
    }
  }

  const archiveFunction = async () => {
    if (!selectedFunctionId || !window.confirm(t('functions.archiveConfirm')))
      return
    setIsSaving(true)
    setDetailError(null)
    try {
      const response = await apiClient.api.runner.functions[
        ':id'
      ].archive.$post({
        param: { id: String(selectedFunctionId) },
      })
      if (!response.ok) {
        throw new Error(
          await readApiError(response, t('functions.requestFailed')),
        )
      }
      closeFunction()
      setSelectedFunctionId(null)
      setNotice(t('functions.archived'))
      await refreshFunctions()
    } catch (reason) {
      setDetailError(getErrorMessage(reason, t('functions.operationFailed')))
    } finally {
      setIsSaving(false)
    }
  }

  const deleteFunction = async () => {
    if (!selectedFunctionId) return
    setIsDeleting(true)
    setDeleteError(null)
    try {
      const response = await apiClient.api.runner.functions[':id'].$delete({
        param: { id: String(selectedFunctionId) },
      })
      if (!response.ok) {
        throw new Error(
          await readApiError(response, t('functions.danger.failed')),
        )
      }
      setIsDeleteDialogOpen(false)
      detailRequestId.current += 1
      executionHistoryRequestId.current += 1
      setSelectedFunctionId(null)
      setDetails(null)
      setExecutionHistory([])
      setNotice(t('functions.danger.deleted'))
      await refreshFunctions()
    } catch (reason) {
      setDeleteError(getErrorMessage(reason, t('functions.danger.failed')))
    } finally {
      setIsDeleting(false)
    }
  }

  const executeFunction = async () => {
    if (!selectedFunctionId) return
    setExecutionResult(null)
    setDetailError(null)
    let argumentsValue: Record<string, unknown>
    try {
      const parsed: unknown = JSON.parse(argumentsJson)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(t('functions.argumentsMustBeObject'))
      }
      argumentsValue = parsed as Record<string, unknown>
    } catch (reason) {
      setDetailError(
        getErrorMessage(reason, t('functions.invalidArgumentsJson')),
      )
      return
    }

    setExecutionPhase('running')
    try {
      const response = await apiClient.api.runner.functions[':id'][
        'execute-ui'
      ].$post({
        param: { id: String(selectedFunctionId) },
        json: {
          arguments: argumentsValue,
          ...(selectedRevision ? { revision: selectedRevision } : {}),
        },
      })
      const body = await response.json()
      if (!('execution' in body)) {
        throw new Error(
          'message' in body && typeof body.message === 'string'
            ? body.message
            : t('functions.executionFailed'),
        )
      }
      setExecutionResult(body.execution)
      await loadExecutionHistory(selectedFunctionId)
    } catch (reason) {
      setDetailError(getErrorMessage(reason, t('functions.executionFailed')))
    } finally {
      setExecutionPhase('idle')
    }
  }

  const currentRevision = details?.function.currentRevision
  const selectedRevisionDefinition = details?.revisions.find(
    (revision) => revision.revision === selectedRevision,
  )
  const hasUnsavedChanges = details
    ? name.trim() !== details.function.name ||
      (description.trim() || null) !== details.function.description ||
      code !== selectedRevisionDefinition?.code ||
      !parametersEqual(parameters, selectedRevisionDefinition?.parameters ?? [])
    : false
  const isBusy =
    isSaving || isReverting || isDeleting || executionPhase !== 'idle'

  return (
    <div className="grid gap-6">
      {selectedFunctionId === null ? (
        <>
          <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-bold tracking-[0.12em] text-primary uppercase">
                {t('functions.eyebrow')}
              </p>
              <h1 className="mt-2 text-3xl font-extrabold tracking-tight">
                {t('functions.title')}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                {t('functions.description')}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={isLoading}
                onClick={() => void refreshFunctions()}
              >
                <RefreshCw
                  className={isLoading ? 'size-4 animate-spin' : 'size-4'}
                />
                {t('functions.refresh')}
              </Button>
              {canManage && (
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus className="size-4" />
                  {t('functions.newFunction')}
                </Button>
              )}
            </div>
          </header>

          {notice && (
            <p className="rounded-xl border border-success/30 bg-success/10 p-3 text-sm text-success">
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
            <div>
              <h2 className="font-bold">{t('functions.directory')}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('functions.functionCount', { count: functions.length })}
              </p>
            </div>
            {isLoading ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {t('functions.loading')}
              </p>
            ) : functions.length === 0 ? (
              <EmptyState
                icon={<Braces className="size-5" />}
                title={t('functions.empty')}
                description={t('functions.emptyDescription')}
                action={
                  canManage ? (
                    <Button onClick={() => setCreateOpen(true)}>
                      {t('functions.createFunction')}
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('functions.name')}</TableHead>
                    <TableHead>{t('functions.revision')}</TableHead>
                    <TableHead>{t('functions.updated')}</TableHead>
                    <TableHead className="text-right">
                      {t('functions.actions')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {functions.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <button
                          className="text-left font-semibold hover:text-primary"
                          onClick={() => openFunction(item.id)}
                        >
                          {item.name}
                        </button>
                        <p className="mt-1 max-w-xl truncate text-xs text-muted-foreground">
                          {item.description || t('functions.noDescription')}
                        </p>
                      </TableCell>
                      <TableCell>v{item.currentRevision}</TableCell>
                      <TableCell>
                        {formatDate(item.updatedAt, i18n.language)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openFunction(item.id)}
                        >
                          <Eye className="size-4" />
                          {t('functions.open')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>

          <Dialog
            open={createOpen}
            onOpenChange={(open) => !isCreating && setCreateOpen(open)}
            dismissible={!isCreating}
            title={t('functions.createTitle')}
            description={t('functions.createDescription')}
            icon={
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
                <Braces className="size-5" />
              </span>
            }
          >
            <form
              className="grid w-full gap-4"
              onSubmit={(event) => void createFunction(event)}
            >
              <Input
                error={
                  createName && !isSnakeCaseName(createName)
                    ? t('functions.nameError')
                    : undefined
                }
                hint={t('functions.nameHint')}
                label={t('functions.name')}
                value={createName}
                onChange={(event) =>
                  setCreateName(toSnakeCaseName(event.target.value))
                }
                required
                maxLength={512}
                autoFocus
                disabled={isCreating}
              />
              <Textarea
                label={t('functions.functionDescription')}
                value={createDescription}
                onChange={(event) => setCreateDescription(event.target.value)}
                maxLength={2000}
                disabled={isCreating}
              />
              {createError && (
                <p className="text-sm text-destructive" role="alert">
                  {createError}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCreateOpen(false)}
                  disabled={isCreating}
                >
                  {t('functions.cancel')}
                </Button>
                <Button
                  disabled={!isSnakeCaseName(createName)}
                  type="submit"
                  isLoading={isCreating}
                >
                  {t('functions.createFunction')}
                </Button>
              </div>
            </form>
          </Dialog>
        </>
      ) : (
        <>
          <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <Button
                size="icon"
                variant="ghost"
                aria-label={t('functions.backToFunctions')}
                disabled={isBusy}
                onClick={closeFunction}
              >
                <ChevronLeft className="size-5" />
              </Button>
              <div>
                <p className="text-xs font-bold tracking-[0.12em] text-primary uppercase">
                  {t('functions.functionEditor')}
                </p>
                <h1 className="mt-2 text-3xl font-extrabold tracking-tight">
                  {details?.function.name ?? t('functions.loadingDetails')}
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  {t('functions.editorDescription')}
                </p>
              </div>
            </div>
          </header>
          <div className="grid w-full gap-4">
            {detailError && (
              <p
                className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                role="alert"
              >
                {detailError}
              </p>
            )}
            {isLoadingDetails || !details ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                {t('functions.loadingDetails')}
              </p>
            ) : (
              <>
                <section className="overflow-hidden rounded-xl border bg-card">
                  <div className="grid min-h-120 lg:grid-cols-[14rem_minmax(0,1fr)]">
                    <aside className="border-b bg-muted/30 p-4 lg:border-r lg:border-b-0">
                      <p className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                        {t('functions.revisions')}
                      </p>
                      <div className="mt-3 grid max-h-96 gap-2 overflow-y-auto">
                        {details.revisions.map((revision) => (
                          <button
                            key={revision.id}
                            className={`rounded-lg border px-3 py-2 text-left text-sm transition ${selectedRevision === revision.revision ? 'border-primary bg-primary/10 text-primary' : 'bg-card hover:bg-muted'}`}
                            onClick={() => applyRevision(revision)}
                          >
                            <span className="font-bold">
                              v{revision.revision}
                            </span>
                            {revision.revision === currentRevision && (
                              <span className="ml-2 text-xs">
                                {t('functions.current')}
                              </span>
                            )}
                            <span className="mt-1 block text-xs text-muted-foreground">
                              {formatDate(revision.createdAt, i18n.language)}
                            </span>
                          </button>
                        ))}
                      </div>
                      {canManage && selectedRevision !== currentRevision && (
                        <Button
                          className="mt-4 w-full"
                          size="sm"
                          variant="outline"
                          isLoading={isReverting}
                          disabled={isBusy}
                          onClick={() => void restoreRevision()}
                        >
                          <RotateCcw className="size-4" />
                          {t('functions.revert')}
                        </Button>
                      )}
                    </aside>

                    <div className="min-w-0 p-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Input
                          error={
                            name && !isSnakeCaseName(name)
                              ? t('functions.nameError')
                              : undefined
                          }
                          hint={t('functions.nameHint')}
                          label={t('functions.name')}
                          maxLength={512}
                          value={name}
                          onChange={(event) =>
                            setName(toSnakeCaseName(event.target.value))
                          }
                          disabled={!canManage || isBusy}
                        />
                        <Input
                          label={t('functions.functionDescription')}
                          value={description}
                          onChange={(event) =>
                            setDescription(event.target.value)
                          }
                          disabled={!canManage || isBusy}
                        />
                      </div>
                      <div className="mt-4 overflow-hidden rounded-lg border">
                        <Suspense
                          fallback={
                            <div className="grid h-105 place-items-center text-sm text-muted-foreground">
                              {t('functions.loadingEditor')}
                            </div>
                          }
                        >
                          <RunnerCodeEditor
                            functionId={details.function.id}
                            parameters={parameters}
                            readOnly={!canManage}
                            theme={resolvedTheme}
                            value={code}
                            onChange={setCode}
                          />
                        </Suspense>
                      </div>
                      <div className="mt-4 flex flex-wrap items-end gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setShowParameters((value) => !value)}
                        >
                          <Settings2 className="size-4" />
                          {t('functions.parameters')}
                        </Button>
                        {canManage && (
                          <Button
                            variant="outline"
                            isLoading={isSaving}
                            disabled={
                              isBusy || !code.trim() || !isSnakeCaseName(name)
                            }
                            onClick={() => void saveFunction()}
                          >
                            <Save className="size-4" />
                            {t('functions.saveRevision')}
                          </Button>
                        )}
                        {canManage && (
                          <Button
                            disabled={isBusy || hasUnsavedChanges}
                            title={
                              hasUnsavedChanges
                                ? t('functions.saveBeforeExecute')
                                : undefined
                            }
                            onClick={() => void executeFunction()}
                          >
                            <Play className="size-4" />
                            {executionPhase === 'idle'
                              ? t('functions.execute')
                              : executionPhaseLabel(executionPhase, t)}
                          </Button>
                        )}
                        {canManage && (
                          <Button
                            className="ml-auto"
                            variant="outline"
                            disabled={isBusy}
                            onClick={() => void archiveFunction()}
                          >
                            <Archive className="size-4" />
                            {t('functions.archive')}
                          </Button>
                        )}
                      </div>
                      {hasUnsavedChanges && (
                        <p className="mt-2 text-xs text-warning">
                          {t('functions.saveBeforeExecute')}
                        </p>
                      )}
                      <div className="mt-4 grid gap-4 lg:grid-cols-2">
                        <Textarea
                          label={t('functions.arguments')}
                          hint={t('functions.argumentsHint')}
                          className="min-h-32 font-mono text-xs"
                          value={argumentsJson}
                          onChange={(event) =>
                            setArgumentsJson(event.target.value)
                          }
                          disabled={!canManage || isBusy}
                        />
                        <div className="grid min-h-32 content-start rounded-lg border bg-muted/30 p-3">
                          <p className="text-sm font-semibold">
                            {t('functions.result')}
                          </p>
                          {executionResult === null ? (
                            <p className="mt-2 text-xs text-muted-foreground">
                              {t('functions.noResult')}
                            </p>
                          ) : (
                            <pre className="mt-2 overflow-auto text-xs leading-5">
                              {JSON.stringify(executionResult, null, 2)}
                            </pre>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="rounded-xl border bg-card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="font-bold">
                        {t('functions.executionHistory')}
                      </h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t('functions.executionHistoryDescription')}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      isLoading={isLoadingExecutions}
                      onClick={() =>
                        void loadExecutionHistory(details.function.id)
                      }
                    >
                      <RefreshCw className="size-4" />
                      {t('functions.refreshHistory')}
                    </Button>
                  </div>
                  {executionHistoryError && (
                    <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                      {executionHistoryError}
                    </p>
                  )}
                  <div className="mt-4 overflow-x-auto">
                    {isLoadingExecutions && executionHistory.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {t('functions.loadingExecutions')}
                      </p>
                    ) : executionHistory.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {t('functions.noExecutions')}
                      </p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t('functions.started')}</TableHead>
                            <TableHead>{t('functions.status')}</TableHead>
                            <TableHead>{t('functions.revision')}</TableHead>
                            <TableHead>{t('functions.apiKey')}</TableHead>
                            <TableHead>{t('functions.duration')}</TableHead>
                            <TableHead>{t('functions.details')}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {executionHistory.map((execution) => (
                            <TableRow key={execution.id}>
                              <TableCell>
                                {formatDate(execution.startedAt, i18n.language)}
                              </TableCell>
                              <TableCell>
                                <Pill
                                  tone={executionStatusTone(execution.status)}
                                >
                                  {t(
                                    `functions.executionStatus.${execution.status}`,
                                  )}
                                </Pill>
                              </TableCell>
                              <TableCell>v{execution.revision}</TableCell>
                              <TableCell>
                                {execution.apiKeyName ?? '—'}
                              </TableCell>
                              <TableCell>
                                {execution.durationMs === null
                                  ? '—'
                                  : t('functions.milliseconds', {
                                      count: execution.durationMs,
                                    })}
                              </TableCell>
                              <TableCell>
                                <details className="min-w-56">
                                  <summary className="cursor-pointer text-sm font-semibold text-primary">
                                    {t('functions.viewExecution')}
                                  </summary>
                                  <p className="mt-2 text-xs font-semibold">
                                    {t('functions.arguments')}
                                  </p>
                                  <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted p-2 text-xs">
                                    {JSON.stringify(
                                      execution.arguments,
                                      null,
                                      2,
                                    )}
                                  </pre>
                                  <p className="mt-2 text-xs font-semibold">
                                    {t('functions.result')}
                                  </p>
                                  <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted p-2 text-xs">
                                    {formatExecutionOutcome(execution)}
                                  </pre>
                                </details>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                </section>

                <section className="overflow-hidden rounded-2xl border border-destructive/30 bg-card shadow-xs">
                  <div className="flex items-start gap-4 p-6">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-destructive/12 text-destructive">
                      <AlertTriangle className="size-5" aria-hidden />
                    </span>
                    <div>
                      <h2 className="font-bold text-destructive">
                        {t('functions.danger.title')}
                      </h2>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {t('functions.danger.description')}
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-end border-t border-destructive/20 bg-destructive/5 p-5">
                    {canManage ? (
                      <Button
                        variant="danger"
                        disabled={isBusy}
                        onClick={() => {
                          setDeleteError(null)
                          setIsDeleteDialogOpen(true)
                        }}
                      >
                        <Trash2 className="size-4" aria-hidden />
                        {t('functions.danger.delete')}
                      </Button>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {t('agent.managersOnly')}
                      </p>
                    )}
                  </div>
                </section>

                <Dialog
                  open={showParameters}
                  onOpenChange={setShowParameters}
                  dismissible={!isBusy}
                  size="xl"
                  title={t('functions.parameters')}
                  description={t('functions.parametersDescription')}
                  icon={
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
                      <Settings2 className="size-5" />
                    </span>
                  }
                >
                  <div className="grid w-full gap-4">
                    <div className="flex justify-end">
                      {canManage && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setParameters((current) => [
                              ...current,
                              {
                                name: `parameter${current.length + 1}`,
                                type: 'string',
                                required: true,
                              },
                            ])
                          }
                        >
                          <Plus className="size-4" />
                          {t('functions.addParameter')}
                        </Button>
                      )}
                    </div>
                    <div className="grid max-h-[60vh] gap-3 overflow-y-auto pr-1">
                      {parameters.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          {t('functions.noParameters')}
                        </p>
                      ) : (
                        parameters.map((parameter, index) => (
                          <div
                            key={index}
                            className="grid gap-3 rounded-lg border p-3 md:grid-cols-[1fr_10rem_1fr_auto_auto] md:items-end"
                          >
                            <Input
                              label={t('functions.parameterName')}
                              value={parameter.name}
                              disabled={!canManage || isBusy}
                              onChange={(event) =>
                                updateParameter(setParameters, index, {
                                  name: event.target.value,
                                })
                              }
                            />
                            <Select
                              label={t('functions.parameterType')}
                              value={parameter.type}
                              disabled={!canManage || isBusy}
                              onChange={(event) =>
                                updateParameter(setParameters, index, {
                                  type: event.target
                                    .value as RunnerParameter['type'],
                                })
                              }
                            >
                              <option value="string">string</option>
                              <option value="number">number</option>
                              <option value="integer">integer</option>
                              <option value="boolean">boolean</option>
                              <option value="json">json</option>
                            </Select>
                            <Input
                              label={t('functions.parameterDescription')}
                              value={parameter.description ?? ''}
                              disabled={!canManage || isBusy}
                              onChange={(event) =>
                                updateParameter(setParameters, index, {
                                  description: event.target.value || null,
                                })
                              }
                            />
                            <Checkbox
                              className="mb-4"
                              label={t('functions.required')}
                              checked={parameter.required}
                              disabled={!canManage || isBusy}
                              onChange={(event) =>
                                updateParameter(setParameters, index, {
                                  required: event.target.checked,
                                })
                              }
                            />
                            {canManage && (
                              <Button
                                className="mb-3"
                                size="icon"
                                variant="ghost"
                                aria-label={t('functions.removeParameter', {
                                  name: parameter.name,
                                })}
                                onClick={() =>
                                  setParameters((current) =>
                                    current.filter(
                                      (_, itemIndex) => itemIndex !== index,
                                    ),
                                  )
                                }
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                    <div className="flex justify-end">
                      <Button
                        variant="outline"
                        disabled={isBusy}
                        onClick={() => setShowParameters(false)}
                      >
                        {t('functions.done')}
                      </Button>
                    </div>
                  </div>
                </Dialog>

                <Dialog
                  dismissible={!isDeleting}
                  open={isDeleteDialogOpen}
                  title={t('functions.danger.dialogTitle')}
                  description={t('functions.danger.dialogDescription', {
                    name: details.function.name,
                  })}
                  icon={
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-destructive/12 text-destructive">
                      <Trash2 className="size-5" aria-hidden />
                    </span>
                  }
                  onOpenChange={(open) => {
                    if (!isDeleting) {
                      setIsDeleteDialogOpen(open)
                      if (!open) setDeleteError(null)
                    }
                  }}
                >
                  <div className="grid w-full gap-4">
                    {deleteError && (
                      <p
                        className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                        role="alert"
                      >
                        {deleteError}
                      </p>
                    )}
                    <div className="flex justify-end gap-2">
                      <Button
                        disabled={isDeleting}
                        variant="ghost"
                        onClick={() => setIsDeleteDialogOpen(false)}
                      >
                        {t('functions.danger.cancel')}
                      </Button>
                      <Button
                        isLoading={isDeleting}
                        variant="danger"
                        onClick={() => void deleteFunction()}
                      >
                        {t('functions.danger.confirm')}
                      </Button>
                    </div>
                  </div>
                </Dialog>
              </>
            )}
            <div className="flex justify-end">
              <Button
                variant="outline"
                disabled={isBusy}
                onClick={closeFunction}
              >
                {t('functions.close')}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function updateParameter(
  setParameters: Dispatch<SetStateAction<RunnerParameter[]>>,
  index: number,
  update: Partial<RunnerParameter>,
) {
  setParameters((current) =>
    current.map((parameter, itemIndex) =>
      itemIndex === index ? { ...parameter, ...update } : parameter,
    ),
  )
}

function createExampleArguments(parameters: RunnerParameter[]) {
  return Object.fromEntries(
    parameters.map((parameter) => [
      parameter.name,
      exampleValue(parameter.type),
    ]),
  )
}

function exampleValue(type: RunnerParameter['type']): unknown {
  if (type === 'boolean') return false
  if (type === 'integer' || type === 'number') return 0
  if (type === 'json') return {}
  return ''
}

function parametersEqual(
  left: RunnerParameter[],
  right: RunnerParameter[],
): boolean {
  return (
    left.length === right.length &&
    left.every((parameter, index) => {
      const other = right[index]
      return (
        other !== undefined &&
        parameter.name === other.name &&
        parameter.type === other.type &&
        parameter.required === other.required &&
        (parameter.description ?? null) === (other.description ?? null)
      )
    })
  )
}

function executionStatusTone(
  status: ExecutionHistoryEntry['status'],
): 'neutral' | 'success' | 'warning' | 'danger' {
  if (status === 'succeeded') return 'success'
  if (status === 'timed_out') return 'warning'
  if (status === 'failed') return 'danger'
  return 'neutral'
}

function isSnakeCaseName(value: string): boolean {
  return value.length <= 512 && /^[a-z0-9]+(?:_{1,2}[a-z0-9]+)*$/.test(value)
}

function toSnakeCaseName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\uE000/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/_{2,}/g, '\uE000')
    .replace(/[^a-z0-9\uE000]+/g, '_')
    .replace(/\uE000/g, '__')
    .replace(/^_+/, '')
}

function formatExecutionOutcome(execution: ExecutionHistoryEntry): string {
  if (execution.errorMessage) return execution.errorMessage
  return JSON.stringify(execution.result, null, 2) ?? 'null'
}

function formatDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function executionPhaseLabel(
  phase: Exclude<ExecutionPhase, 'idle'>,
  t: ReturnType<typeof useTranslation>['t'],
) {
  return phase === 'running' ? t('functions.executionPhase.running') : phase
}

async function readApiError(
  response: Response,
  fallback: string,
  nameConflict?: string,
) {
  try {
    const body = (await response.clone().json()) as {
      code?: unknown
      message?: unknown
    }
    if (body.code === 'FUNCTION_NAME_CONFLICT' && nameConflict) {
      return nameConflict
    }
    return typeof body.message === 'string' ? body.message : fallback
  } catch {
    return fallback
  }
}

function getErrorMessage(reason: unknown, fallback: string): string {
  return reason instanceof Error && reason.message ? reason.message : fallback
}
