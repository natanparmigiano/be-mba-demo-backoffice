import {
  AlertTriangle,
  Bot,
  Check,
  ChevronDown,
  Clock3,
  FileArchive,
  FilePlus2,
  FolderOpen,
  LoaderCircle,
  Pencil,
  Search,
  Trash2,
  Upload,
} from 'lucide-react'
import type { InferResponseType } from 'hono/client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Dialog,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
} from '../components/ui'
import { apiClient } from '../api'
import { RenameProjectDialog } from '../components/studio/RenameProjectDialog'
import { newAgtx, openAgtx } from '../studio-agtx'
import {
  createStudioProject,
  deleteStudioProject,
  listStudioProjects,
  renameStudioProject,
} from '../studio-projects'

type Project = Awaited<ReturnType<typeof listStudioProjects>>[number]
type ChannelsResponse = InferResponseType<
  typeof apiClient.api.channels.$get,
  200
>
type RunningAgent = ChannelsResponse['channels'][number]
const exportSteps = [
  'settings',
  'businessData',
  'skills',
  'channelComponents',
  'knowledge',
  'files',
  'connectors',
  'mcps',
  'packaging',
] as const
type ExportStep = (typeof exportSteps)[number]

export function StudioHomePage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const exportSourceRef = useRef<EventSource | null>(null)
  const exportChunksRef = useRef<Array<Uint8Array | undefined>>([])
  const [recent, setRecent] = useState<Project[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [renameTarget, setRenameTarget] = useState<Project | null>(null)
  const [renameName, setRenameName] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [agentPickerOpen, setAgentPickerOpen] = useState(false)
  const [agentsLoading, setAgentsLoading] = useState(false)
  const [runningAgents, setRunningAgents] = useState<RunningAgent[]>([])
  const [exportOpen, setExportOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportStep, setExportStep] = useState<ExportStep | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null)

  useEffect(
    () => () => {
      exportSourceRef.current?.close()
    },
    [],
  )

  useEffect(() => {
    document.title = t('studio.metaTitle')
    void listStudioProjects(5)
      .then(setRecent)
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error ? reason.message : t('studio.projectError'),
        ),
      )
      .finally(() => setLoading(false))
  }, [t])

  const filteredProjects = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return query
      ? projects.filter((project) =>
          project.name.toLocaleLowerCase().includes(query),
        )
      : projects
  }, [projects, search])

  const openSearch = async () => {
    setSearchOpen(true)
    setError(null)
    try {
      setProjects(await listStudioProjects())
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t('studio.projectError'),
      )
    }
  }

  const create = async (file?: File) => {
    setWorking(true)
    setError(null)
    try {
      const document = file ? await openAgtx(file) : newAgtx()
      const project = await createStudioProject(document)
      void navigate(`/studio/${project.id}`)
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t('studio.projectError'),
      )
    } finally {
      setWorking(false)
    }
  }

  const openAgentPicker = async () => {
    setAgentPickerOpen(true)
    setAgentsLoading(true)
    setError(null)
    try {
      const response = await apiClient.api.channels.$get()
      if (!response.ok) throw new Error(t('studio.runningAgent.loadFailed'))
      const channels = (await response.json()).channels
      const statuses = await Promise.all(
        channels.map(async (channel) => {
          try {
            const statusResponse = await apiClient.api.channels[':id'][
              'agent-settings'
            ].$get({ param: { id: String(channel.id) } })
            if (!statusResponse.ok) return false
            return (await statusResponse.json()).status === 'enabled'
          } catch {
            return false
          }
        }),
      )
      setRunningAgents(channels.filter((_, index) => statuses[index]))
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t('studio.runningAgent.loadFailed'),
      )
    } finally {
      setAgentsLoading(false)
    }
  }

  const createFromRunningAgent = (agent: RunningAgent) => {
    exportSourceRef.current?.close()
    setAgentPickerOpen(false)
    setExportOpen(true)
    setExporting(true)
    setExportStep(null)
    setExportError(null)
    setCreatedProjectId(null)
    exportChunksRef.current = []

    const source = new EventSource(`/api/channels/${agent.id}/agent-export`)
    exportSourceRef.current = source
    let settled = false
    const finish = () => {
      settled = true
      source.close()
      if (exportSourceRef.current === source) exportSourceRef.current = null
      setExporting(false)
    }
    const fail = () => {
      if (settled) return
      setExportError(t('studio.runningAgent.exportFailed'))
      finish()
    }

    source.addEventListener('progress', (event: MessageEvent<string>) => {
      const payload = parseExportEvent(event.data)
      if (
        payload &&
        typeof payload.step === 'string' &&
        isExportStep(payload.step)
      )
        setExportStep(payload.step)
    })
    source.addEventListener('archive-chunk', (event: MessageEvent<string>) => {
      const payload = parseExportEvent(event.data)
      if (
        !payload ||
        typeof payload.index !== 'number' ||
        !Number.isSafeInteger(payload.index) ||
        payload.index < 0 ||
        typeof payload.data !== 'string'
      )
        return fail()
      try {
        exportChunksRef.current[payload.index] = decodeBase64(payload.data)
      } catch {
        fail()
      }
    })
    source.addEventListener('complete', (event: MessageEvent<string>) => {
      const payload = parseExportEvent(event.data)
      if (
        !payload ||
        typeof payload.fileName !== 'string' ||
        typeof payload.chunkCount !== 'number' ||
        !Number.isSafeInteger(payload.chunkCount) ||
        payload.chunkCount < 1 ||
        typeof payload.byteSize !== 'number' ||
        !Number.isSafeInteger(payload.byteSize) ||
        payload.byteSize < 1
      )
        return fail()

      const chunks = exportChunksRef.current.slice(0, payload.chunkCount)
      if (
        chunks.length !== payload.chunkCount ||
        chunks.some((chunk) => chunk === undefined) ||
        chunks.reduce((size, chunk) => size + (chunk?.byteLength ?? 0), 0) !==
          payload.byteSize
      )
        return fail()

      source.close()
      void openAgtx(
        new File([concatenateBytes(chunks as Uint8Array[])], payload.fileName, {
          type: 'application/vnd.mba.agent+zip',
        }),
      )
        .then(createStudioProject)
        .then((project) => {
          setCreatedProjectId(project.id)
          setExportStep(null)
          exportChunksRef.current = []
          finish()
        })
        .catch(fail)
    })
    source.addEventListener('export-error', fail)
    source.onerror = () => {
      if (!settled) fail()
    }
  }

  const closeExport = () => {
    exportSourceRef.current?.close()
    exportSourceRef.current = null
    setExporting(false)
    setExportOpen(false)
  }

  const beginRename = (project: Project) => {
    setRenameTarget(project)
    setRenameName(project.name)
  }

  const rename = async () => {
    if (!renameTarget || !renameName.trim()) return
    setWorking(true)
    try {
      const updated = await renameStudioProject(renameTarget.id, renameName)
      const replace = (project: Project) =>
        project.id === updated.id
          ? {
              ...project,
              name: updated.name,
              lastEditedAt: updated.lastEditedAt,
            }
          : project
      setRecent((current) => current.map(replace))
      setProjects((current) => current.map(replace))
      setRenameTarget(null)
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t('studio.renameError'),
      )
    } finally {
      setWorking(false)
    }
  }

  const deleteProject = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    setError(null)
    try {
      await deleteStudioProject(deleteTarget.id)
      setRecent((current) =>
        current.filter((project) => project.id !== deleteTarget.id),
      )
      setProjects((current) =>
        current.filter((project) => project.id !== deleteTarget.id),
      )
      setDeleteTarget(null)
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t('studio.deleteError'),
      )
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto p-6 lg:p-10">
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept=".agtx,application/zip,application/vnd.mba.agent+zip"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void create(file)
          event.currentTarget.value = ''
        }}
      />
      <div className="mx-auto max-w-5xl">
        <div>
          <div>
            <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/12 text-primary">
              <FileArchive className="size-6" aria-hidden />
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight">
              {t('studio.title')}
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              {t('studio.projectsWelcome')}
            </p>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <Menu>
              <MenuTrigger className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/25">
                <FilePlus2 className="size-4" aria-hidden />
                {t('studio.createProject')}
                <ChevronDown className="size-3.5" aria-hidden />
              </MenuTrigger>
              <MenuContent align="start" className="w-80">
                <StudioCreationMenuItem
                  icon={FilePlus2}
                  title={t('studio.new')}
                  description={t('studio.projectMenuDescriptions.new')}
                  disabled={working}
                  onClick={() => void create()}
                />
                <StudioCreationMenuItem
                  icon={Bot}
                  title={t('studio.runningAgent.action')}
                  description={t('studio.runningAgent.menuDescription')}
                  onClick={() => void openAgentPicker()}
                />
              </MenuContent>
            </Menu>
            <Button variant="outline" onClick={() => void openSearch()}>
              <Search className="size-4" aria-hidden />
              {t('studio.searchProjects')}
            </Button>
            <Button
              variant="outline"
              disabled={working}
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="size-4" aria-hidden />
              {t('studio.load')}
            </Button>
          </div>
        </div>

        <section className="mt-10">
          <h2 className="text-lg font-bold">{t('studio.recentProjects')}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {loading ? (
              <div className="col-span-full flex justify-center p-10 text-muted-foreground">
                <LoaderCircle className="size-5 animate-spin" aria-hidden />
              </div>
            ) : recent.length ? (
              recent.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  locale={i18n.language}
                  onOpen={() => void navigate(`/studio/${project.id}`)}
                  onRename={() => beginRename(project)}
                  onDelete={() => setDeleteTarget(project)}
                />
              ))
            ) : (
              <p className="col-span-full rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
                {t('studio.noProjects')}
              </p>
            )}
          </div>
        </section>

        {error && (
          <p role="alert" className="mt-5 text-sm text-danger">
            {error}
          </p>
        )}
      </div>

      <Dialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        title={t('studio.searchProjects')}
        description={t('studio.searchDescription')}
        icon={<Search className="mt-1 size-5 text-primary" aria-hidden />}
        size="lg"
      >
        <div className="w-full">
          <Input
            autoFocus
            value={search}
            placeholder={t('studio.searchPlaceholder')}
            aria-label={t('studio.searchProjects')}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="mt-4 max-h-96 space-y-2 overflow-y-auto">
            {filteredProjects.map((project) => (
              <div
                key={project.id}
                className="flex w-full cursor-pointer items-center gap-1 rounded-xl border p-1 transition-colors hover:bg-muted"
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg p-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => void navigate(`/studio/${project.id}`)}
                >
                  <FolderOpen
                    className="size-4 shrink-0 text-primary"
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {project.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(project.lastOpenedAt, i18n.language)}
                  </span>
                </button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={t('studio.renameProject', { name: project.name })}
                  onClick={() => beginRename(project)}
                >
                  <Pencil className="size-4" aria-hidden />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-destructive"
                  aria-label={t('studio.deleteProject', {
                    name: project.name,
                  })}
                  onClick={() => setDeleteTarget(project)}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
            ))}
            {!filteredProjects.length && (
              <p className="p-8 text-center text-sm text-muted-foreground">
                {t('studio.noMatchingProjects')}
              </p>
            )}
          </div>
        </div>
      </Dialog>
      <RenameProjectDialog
        project={renameTarget}
        name={renameName}
        working={working}
        onNameChange={setRenameName}
        onClose={() => setRenameTarget(null)}
        onRename={() => void rename()}
      />
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null)
        }}
        dismissible={!deleting}
        title={t('studio.deleteTitle')}
        description={t('studio.deleteDescription', {
          name: deleteTarget?.name ?? '',
        })}
        icon={<Trash2 className="mt-1 size-5 text-destructive" aria-hidden />}
      >
        <Button
          variant="outline"
          disabled={deleting}
          onClick={() => setDeleteTarget(null)}
        >
          {t('common.cancel')}
        </Button>
        <Button
          variant="danger"
          isLoading={deleting}
          onClick={() => void deleteProject()}
        >
          {deleting ? t('studio.deleting') : t('studio.confirmDelete')}
        </Button>
      </Dialog>
      <Dialog
        open={agentPickerOpen}
        onOpenChange={setAgentPickerOpen}
        title={t('studio.runningAgent.title')}
        description={t('studio.runningAgent.description')}
        icon={<Bot className="mt-1 size-5 text-primary" aria-hidden />}
        size="lg"
      >
        <div className="w-full">
          {agentsLoading ? (
            <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
              {t('studio.runningAgent.loading')}
            </div>
          ) : runningAgents.length ? (
            <div className="grid max-h-96 gap-2 overflow-y-auto">
              {runningAgents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  className="flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => createFromRunningAgent(agent)}
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-success/12 text-success">
                    <Bot className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">
                      {agent.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {agent.waPhoneNumber}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="p-10 text-center text-sm text-muted-foreground">
              {t('studio.runningAgent.empty')}
            </p>
          )}
        </div>
      </Dialog>
      <Dialog
        open={exportOpen}
        onOpenChange={(open) => {
          if (!open) closeExport()
        }}
        title={t('studio.runningAgent.progressTitle')}
        description={t('studio.runningAgent.progressDescription')}
        dismissible={!exporting}
        size="lg"
      >
        <div className="w-full">
          <RunningAgentExportProgress
            complete={createdProjectId !== null}
            currentStep={exportStep}
            error={exportError}
            exporting={exporting}
          />
          <div className="mt-5 flex justify-end gap-2">
            {!exporting && (
              <Button variant="outline" onClick={closeExport}>
                {t('common.close')}
              </Button>
            )}
            {createdProjectId && (
              <Button
                onClick={() => void navigate(`/studio/${createdProjectId}`)}
              >
                {t('studio.runningAgent.openProject')}
              </Button>
            )}
          </div>
        </div>
      </Dialog>
    </div>
  )
}

function StudioCreationMenuItem({
  icon: Icon,
  title,
  description,
  disabled,
  onClick,
}: {
  icon: typeof FilePlus2
  title: string
  description: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <MenuItem
      className="items-start py-2.5"
      disabled={disabled}
      onClick={onClick}
    >
      <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0">
        <span className="block font-semibold">{title}</span>
        <span className="mt-0.5 block text-xs leading-4 font-normal text-muted-foreground">
          {description}
        </span>
      </span>
    </MenuItem>
  )
}

function RunningAgentExportProgress({
  complete,
  currentStep,
  error,
  exporting,
}: {
  complete: boolean
  currentStep: ExportStep | null
  error: string | null
  exporting: boolean
}) {
  const { t } = useTranslation()
  const currentIndex = complete
    ? exportSteps.length
    : currentStep
      ? exportSteps.indexOf(currentStep)
      : -1
  const progress = complete
    ? 100
    : currentIndex < 0
      ? 0
      : Math.round(((currentIndex + 1) / exportSteps.length) * 100)

  return (
    <div className="w-full space-y-4">
      <div>
        <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
          <span>{t('studio.runningAgent.progress')}</span>
          <span>{progress}%</span>
        </div>
        <div
          className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label={t('studio.runningAgent.progress')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
      <ol className="grid gap-2 sm:grid-cols-2" aria-live="polite">
        {exportSteps.map((step, index) => {
          const done = complete || index < currentIndex
          const current = exporting && index === currentIndex
          const failed = Boolean(error) && index === currentIndex
          return (
            <li
              key={step}
              className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs"
            >
              {failed ? (
                <AlertTriangle
                  className="size-3.5 text-destructive"
                  aria-hidden
                />
              ) : done ? (
                <Check className="size-3.5 text-success" aria-hidden />
              ) : current ? (
                <LoaderCircle
                  className="size-3.5 animate-spin text-primary"
                  aria-hidden
                />
              ) : (
                <span className="block size-3 rounded-full border-2 text-muted-foreground" />
              )}
              <span className={current || done ? 'font-semibold' : undefined}>
                {t(`agent.exportPanel.steps.${step}`)}
              </span>
            </li>
          )
        })}
      </ol>
      {error && (
        <p
          className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}
      {complete && (
        <p
          className="rounded-lg bg-success/10 p-3 text-sm font-semibold text-success"
          role="status"
        >
          {t('studio.runningAgent.complete')}
        </p>
      )}
    </div>
  )
}

function ProjectCard({
  project,
  locale,
  onOpen,
  onRename,
  onDelete,
}: {
  project: Project
  locale: string
  onOpen: () => void
  onRename: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  return (
    <article className="relative cursor-pointer rounded-2xl border bg-card shadow-sm transition hover:border-primary/40 hover:shadow-md">
      <button
        type="button"
        className="w-full cursor-pointer p-4 pr-24 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onOpen}
      >
        <div className="flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <FileArchive className="size-4" aria-hidden />
          </span>
          <span className="min-w-0 truncate text-sm font-bold">
            {project.name}
          </span>
        </div>
        <span className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock3 className="size-3.5" aria-hidden />
          {t('studio.lastOpened', {
            date: formatDate(project.lastOpenedAt, locale),
          })}
        </span>
      </button>
      <Button
        size="icon"
        variant="ghost"
        className="absolute top-3 right-3"
        aria-label={t('studio.renameProject', { name: project.name })}
        onClick={onRename}
      >
        <Pencil className="size-4" aria-hidden />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="absolute top-3 right-12 text-destructive"
        aria-label={t('studio.deleteProject', { name: project.name })}
        onClick={onDelete}
      >
        <Trash2 className="size-4" aria-hidden />
      </Button>
    </article>
  )
}

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function parseExportEvent(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function isExportStep(value: string): value is ExportStep {
  return (exportSteps as readonly string[]).includes(value)
}

function decodeBase64(value: string): Uint8Array {
  const binary = window.atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index)
  return bytes
}

function concatenateBytes(chunks: readonly Uint8Array[]): ArrayBuffer {
  const bytes = new Uint8Array(
    chunks.reduce((length, chunk) => length + chunk.byteLength, 0),
  )
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes.buffer
}
