import {
  AlertTriangle,
  Bot,
  Box,
  Braces,
  Building2,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Command,
  Download,
  File,
  FileArchive,
  FileCode2,
  FolderOpen,
  Globe2,
  LoaderCircle,
  MessageSquareText,
  MessageCircleQuestion,
  Maximize2,
  Minimize2,
  Pencil,
  Plus,
  Plug,
  QrCode,
  Rocket,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react'
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { StudioCodeEditor } from '../components/studio/StudioCodeEditor'
import { apiClient } from '../api'
import { SkillMarkdownEditor } from '../components/studio/SkillMarkdownEditor'
import { StudioChatPanel } from '../components/studio/StudioChatPanel'
import { parseAgentYaml } from '../agent-import-preview'
import { RenameProjectDialog } from '../components/studio/RenameProjectDialog'
import {
  Button,
  Checkbox,
  cn,
  Dialog,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  Select,
  Switch,
  Tabs,
  TagInput,
  Textarea,
} from '../components/ui'
import { useTheme } from '../components/theme/ThemeProvider'
import {
  downloadAgtx,
  parseMcpxYaml,
  serializeAgtx,
  stringifyAgentYaml,
  type StudioDocument,
} from '../studio-agtx'
import {
  listStudioProjects,
  loadStudioProject,
  renameStudioProject,
  saveStudioProject,
} from '../studio-projects'

type Section =
  | 'source'
  | 'security'
  | 'settings'
  | 'businessInfo'
  | 'allowlist'
  | 'components'
  | 'skills'
  | 'faqs'
  | 'websites'
  | 'files'
  | 'connectors'
  | 'mcps'
  | 'qrCodes'
  | 'includedFiles'
  | 'manifest'
type Detail =
  | { kind: 'skill' | 'faq'; index: number }
  | { kind: 'entry'; path: string }
  | { kind: 'mcp'; path: string }
type SourceView = 'form' | 'json'

const sectionIcons: Record<Section, typeof Settings2> = {
  source: Bot,
  security: ShieldCheck,
  settings: Settings2,
  businessInfo: Building2,
  allowlist: Users,
  components: MessageSquareText,
  skills: FileCode2,
  faqs: CircleHelp,
  websites: Globe2,
  files: FolderOpen,
  connectors: Plug,
  mcps: FolderOpen,
  qrCodes: QrCode,
  manifest: Braces,
  includedFiles: FolderOpen,
}

export function StudioPage() {
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const navigate = useNavigate()
  const { projectId } = useParams<{ projectId: string }>()
  const [pkg, setPkg] = useState<StudioDocument | null>(null)
  const pkgRef = useRef<StudioDocument | null>(null)
  pkgRef.current = pkg
  const [section, setSection] = useState<Section>('source')
  const [sourceView, setSourceView] = useState<SourceView>('form')
  const [securityView, setSecurityView] = useState<SourceView>('form')
  const [settingsView, setSettingsView] = useState<SourceView>('form')
  const [businessInfoView, setBusinessInfoView] = useState<SourceView>('form')
  const [allowlistView, setAllowlistView] = useState<SourceView>('form')
  const [componentsView, setComponentsView] = useState<SourceView>('form')
  const [skillsView, setSkillsView] = useState<SourceView>('form')
  const [skillEntryView, setSkillEntryView] = useState<SourceView>('form')
  const [faqsView, setFaqsView] = useState<SourceView>('form')
  const [faqEntryView, setFaqEntryView] = useState<SourceView>('form')
  const [websitesView, setWebsitesView] = useState<SourceView>('form')
  const [knowledgeFilesView, setKnowledgeFilesView] =
    useState<SourceView>('form')
  const [connectorsView, setConnectorsView] = useState<SourceView>('form')
  const [qrCodesView, setQrCodesView] = useState<SourceView>('form')
  const [mcpEntryView, setMcpEntryView] = useState<SourceView>('form')
  const [expandedSections, setExpandedSections] = useState({
    skills: true,
    faqs: true,
    mcps: true,
  })
  const [detail, setDetail] = useState<Detail | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const dirtyRef = useRef(false)
  const savingRef = useRef(false)
  dirtyRef.current = dirty
  const [loading, setLoading] = useState(true)
  const [searchOpen, setSearchOpen] = useState(false)
  const [projectSearch, setProjectSearch] = useState('')
  const [projects, setProjects] = useState<
    Awaited<ReturnType<typeof listStudioProjects>>
  >([])
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameName, setRenameName] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [conversation, setConversation] = useState<unknown[]>([])
  const [deployOpen, setDeployOpen] = useState(false)

  const value = useMemo(
    () =>
      pkg
        ? (detailValue(pkg, detail) ?? sectionValue(pkg.manifest, section))
        : null,
    [pkg, section, detail],
  )
  useEffect(() => {
    if (pkg)
      setDraft(
        detail?.kind === 'skill' || detail?.kind === 'faq'
          ? JSON.stringify(value, null, 2)
          : detail
            ? String(value ?? '')
            : section === 'manifest'
              ? stringifyAgentYaml(pkg.manifest)
              : JSON.stringify(value, null, 2),
      )
    setError(null)
  }, [pkg, section, detail, value])

  useEffect(() => {
    document.title = t('studio.metaTitle')
  }, [t])

  useEffect(() => {
    if (!projectId) return
    let active = true
    setLoading(true)
    dirtyRef.current = false
    setDirty(false)
    setPkg(null)
    setConversation([])
    void loadStudioProject(projectId)
      .then(({ document, conversation: storedConversation }) => {
        if (!active) return
        setPkg(document)
        setConversation(storedConversation)
        setDirty(false)
        setSection('source')
        setDetail(null)
        setError(null)
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            reason instanceof Error ? reason.message : t('studio.projectError'),
          )
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [projectId, t])

  useEffect(() => {
    if (!projectId) return
    const interval = window.setInterval(() => {
      const savingDocument = pkgRef.current
      if (!savingDocument || !dirtyRef.current || savingRef.current) return
      savingRef.current = true
      void saveStudioProject(projectId, savingDocument)
        .then(() => {
          if (pkgRef.current === savingDocument) {
            dirtyRef.current = false
            setDirty(false)
          }
        })
        .catch((reason: unknown) =>
          setError(
            reason instanceof Error ? reason.message : t('studio.saveError'),
          ),
        )
        .finally(() => {
          savingRef.current = false
        })
    }, 5_000)
    return () => window.clearInterval(interval)
  }, [projectId, t])

  const showProjectSearch = async () => {
    setSearchOpen(true)
    try {
      setProjects(await listStudioProjects())
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t('studio.projectError'),
      )
    }
  }

  const renameProject = async () => {
    if (!projectId || !renameName.trim()) return
    setRenaming(true)
    try {
      const project = await renameStudioProject(projectId, renameName)
      setPkg((current) =>
        current ? { ...current, name: project.name } : current,
      )
      setRenameOpen(false)
      setError(null)
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t('studio.renameError'),
      )
    } finally {
      setRenaming(false)
    }
  }

  const updateDraft = (next: string) => {
    setDraft(next)
    if (!pkg) return
    try {
      if (detail) {
        if (detail.kind === 'skill' || detail.kind === 'faq') {
          const parsed: unknown = JSON.parse(next)
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
            throw new TypeError('Entry must be an object')
          setPkg({
            ...pkg,
            manifest:
              detail.kind === 'skill'
                ? replaceSkill(
                    pkg.manifest,
                    detail.index,
                    parsed as Record<string, unknown>,
                  )
                : replaceFaq(
                    pkg.manifest,
                    detail.index,
                    parsed as Record<string, unknown>,
                  ),
          })
          setDirty(true)
          setError(null)
          return
        }
        setPkg(updateDetail(pkg, detail, next))
        setDirty(true)
        setError(null)
        return
      }
      const parsed: unknown =
        section === 'manifest' ? parseAgentYaml(next) : JSON.parse(next)
      if (
        section === 'manifest' &&
        (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      )
        throw new TypeError('Manifest must be an object')
      if (section === 'files') {
        if (!Array.isArray(parsed))
          throw new TypeError('Knowledge files must be an array')
        setPkg(
          syncKnowledgeFiles(
            pkg,
            parsed as Array<Record<string, unknown>>,
            pkg.entries,
          ),
        )
      } else
        setPkg({
          ...pkg,
          manifest:
            section === 'manifest'
              ? (parsed as Record<string, unknown>)
              : replaceSection(pkg.manifest, section, parsed),
        })
      setDirty(true)
      setError(null)
    } catch {
      setError(t('studio.invalidJson'))
    }
  }

  const updateSettings = (settings: Record<string, unknown>) => {
    setPkg((current) =>
      current
        ? {
            ...current,
            manifest: replaceSection(current.manifest, 'settings', settings),
          }
        : current,
    )
    setDirty(true)
    setError(null)
  }

  const updateBusinessInfo = (businessInfo: Record<string, unknown>) => {
    setPkg((current) =>
      current
        ? {
            ...current,
            manifest: replaceSection(
              current.manifest,
              'businessInfo',
              businessInfo,
            ),
          }
        : current,
    )
    setDirty(true)
    setError(null)
  }

  const updateAllowlist = (allowlist: Array<Record<string, unknown>>) => {
    setPkg((current) =>
      current
        ? {
            ...current,
            manifest: replaceSection(current.manifest, 'allowlist', allowlist),
          }
        : current,
    )
    setDirty(true)
    setError(null)
  }

  const updateComponents = (components: Record<string, unknown>) => {
    setPkg((current) =>
      current
        ? {
            ...current,
            manifest: replaceSection(
              current.manifest,
              'components',
              components,
            ),
          }
        : current,
    )
    setDirty(true)
    setError(null)
  }

  const updateSkills = (skills: Array<Record<string, unknown>>) => {
    setPkg((current) =>
      current
        ? {
            ...current,
            manifest: replaceSection(current.manifest, 'skills', skills),
          }
        : current,
    )
    setDirty(true)
    setError(null)
  }

  const updateFaqs = (faqs: Array<Record<string, unknown>>) => {
    setPkg((current) =>
      current
        ? {
            ...current,
            manifest: replaceSection(current.manifest, 'faqs', faqs),
          }
        : current,
    )
    setDirty(true)
    setError(null)
  }

  const updateWebsites = (websites: Array<Record<string, unknown>>) => {
    setPkg((current) =>
      current
        ? {
            ...current,
            manifest: replaceSection(current.manifest, 'websites', websites),
          }
        : current,
    )
    setDirty(true)
    setError(null)
  }

  const updateEntries = (entries: Map<string, Uint8Array>) => {
    setPkg((current) => (current ? { ...current, entries } : current))
    setDirty(true)
    setError(null)
  }
  const updateEntry = (path: string, contents: string) => {
    setPkg((current) => {
      if (!current) return current
      const entries = new Map(current.entries)
      entries.set(path, new TextEncoder().encode(contents))
      return { ...current, entries }
    })
    setDirty(true)
    setError(null)
  }

  const updateKnowledgeFiles = (
    files: Array<Record<string, unknown>>,
    entries: Map<string, Uint8Array>,
  ) => {
    setPkg((current) =>
      current ? syncKnowledgeFiles(current, files, entries) : current,
    )
    setDirty(true)
    setError(null)
  }
  const updateConnectors = (connectors: Array<Record<string, unknown>>) => {
    setPkg((current) =>
      current
        ? {
            ...current,
            manifest: replaceSection(
              current.manifest,
              'connectors',
              connectors,
            ),
          }
        : current,
    )
    setDirty(true)
    setError(null)
  }
  const updateQrCodes = (qrCodes: Array<Record<string, unknown>>) => {
    setPkg((current) =>
      current
        ? {
            ...current,
            manifest: replaceSection(current.manifest, 'qrCodes', qrCodes),
          }
        : current,
    )
    setDirty(true)
    setError(null)
  }

  const sections: Section[] = [
    'source',
    'security',
    'settings',
    'businessInfo',
    'allowlist',
    'components',
    'skills',
    'faqs',
    'websites',
    'files',
    'connectors',
    'mcps',
    'qrCodes',
    'includedFiles',
    'manifest',
  ]

  if (!pkg || !projectId)
    return (
      <div className="flex h-full min-h-0 items-center justify-center p-6">
        <div className="text-center">
          {loading && (
            <LoaderCircle className="mx-auto size-6 animate-spin text-primary" />
          )}
          <p className="mt-3 text-sm text-muted-foreground">
            {loading ? t('studio.loadingProject') : error}
          </p>
          {!loading && (
            <Button className="mt-4" onClick={() => void navigate('/studio')}>
              {t('studio.backToProjects')}
            </Button>
          )}
        </div>
      </div>
    )

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-card px-3">
        <Button
          size="icon"
          variant="ghost"
          className="mr-1 size-8"
          aria-label={t('studio.backToProjects')}
          onClick={() => void navigate('/studio')}
        >
          <ChevronLeft className="size-4" aria-hidden />
        </Button>
        <Box className="mx-1 size-5 shrink-0 text-primary" />
        <div className="min-w-0">
          <div className="flex h-6 min-w-0 items-center gap-0.5">
            <p className="truncate text-sm leading-5 font-bold">{pkg.name}</p>
            <Button
              size="icon"
              variant="ghost"
              className="size-6 shrink-0"
              aria-label={t('studio.renameProject', { name: pkg.name })}
              onClick={() => {
                setRenameName(pkg.name)
                setRenameOpen(true)
              }}
            >
              <Pencil className="size-3" aria-hidden />
            </Button>
          </div>
          <p className="mt-0.5 text-[11px] leading-3 text-muted-foreground">
            {dirty ? t('studio.modified') : t('studio.saved')}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Menu>
            <MenuTrigger className="inline-flex h-8 items-center justify-center gap-2 rounded-lg border bg-card px-3 text-sm font-semibold shadow-xs transition-colors hover:bg-muted">
              {t('studio.projectMenu')}
              <ChevronDown className="size-3.5" aria-hidden />
            </MenuTrigger>
            <MenuContent className="w-80">
              <ProjectMenuItem
                icon={Search}
                title={t('studio.openProject')}
                description={t('studio.projectMenuDescriptions.open')}
                onClick={() => void showProjectSearch()}
              />
              <ProjectMenuItem
                icon={Rocket}
                title={t('studio.deploy.action')}
                description={t('studio.deploy.menuDescription')}
                onClick={() => setDeployOpen(true)}
              />
              <MenuSeparator />
              <ProjectMenuItem
                icon={Download}
                title={t('studio.save')}
                description={t('studio.projectMenuDescriptions.download')}
                onClick={() => downloadAgtx(pkg)}
              />
            </MenuContent>
          </Menu>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside
          className="w-56 shrink-0 overflow-y-auto border-r bg-card p-2"
          aria-label={t('studio.explorer')}
        >
          <p className="px-2 py-2 text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
            {t('studio.explorer')}
          </p>
          {sections.map((item) => {
            const Icon = sectionIcons[item]
            const hasChildren =
              item === 'skills' || item === 'faqs' || item === 'mcps'
            const expanded = hasChildren && expandedSections[item]
            return (
              <div key={item}>
                <button
                  type="button"
                  aria-expanded={hasChildren ? expanded : undefined}
                  onClick={() => {
                    setSection(item)
                    if (hasChildren)
                      setExpandedSections((current) => ({
                        ...current,
                        [item]: !current[item],
                      }))
                    if (item === 'source') setSourceView('form')
                    if (item === 'security') setSecurityView('form')
                    if (item === 'settings') setSettingsView('form')
                    if (item === 'businessInfo') setBusinessInfoView('form')
                    if (item === 'allowlist') setAllowlistView('form')
                    if (item === 'components') setComponentsView('form')
                    if (item === 'skills') setSkillsView('form')
                    if (item === 'faqs') setFaqsView('form')
                    if (item === 'websites') setWebsitesView('form')
                    if (item === 'files') setKnowledgeFilesView('form')
                    if (item === 'connectors') setConnectorsView('form')
                    if (item === 'qrCodes') setQrCodesView('form')
                    setDetail(null)
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-medium transition-colors',
                    section === item && !detail
                      ? 'bg-primary/12 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {hasChildren && (
                    <ChevronRight
                      className={cn(
                        'size-3 transition-transform',
                        expanded && 'rotate-90',
                      )}
                    />
                  )}
                  <Icon className={cn('size-4', !hasChildren && 'ml-5')} />
                  <span className="truncate">
                    {t(`studio.sections.${item}`)}
                  </span>
                  <Count
                    value={
                      item === 'includedFiles'
                        ? [...pkg.entries]
                        : item === 'mcps'
                          ? mcpEntryPaths(pkg.entries)
                          : sectionValue(pkg.manifest, item)
                    }
                  />
                </button>
                {item === 'skills' &&
                  expanded &&
                  sectionItems(pkg.manifest, 'skills').map((entry, index) => (
                    <DetailButton
                      key={index}
                      active={
                        detail?.kind === 'skill' && detail.index === index
                      }
                      label={String(entry.title ?? `${index + 1}`)}
                      onClick={() => {
                        setSection('skills')
                        setSkillEntryView('form')
                        setDetail({ kind: 'skill', index })
                      }}
                    />
                  ))}
                {item === 'faqs' &&
                  expanded &&
                  sectionItems(pkg.manifest, 'faqs').map((entry, index) => (
                    <DetailButton
                      key={index}
                      active={detail?.kind === 'faq' && detail.index === index}
                      label={String(entry.question ?? `${index + 1}`)}
                      onClick={() => {
                        setSection('faqs')
                        setFaqEntryView('form')
                        setDetail({ kind: 'faq', index })
                      }}
                    />
                  ))}
                {item === 'mcps' &&
                  expanded &&
                  mcpEntryPaths(pkg.entries).map((path) => (
                    <DetailButton
                      key={path}
                      active={detail?.kind === 'mcp' && detail.path === path}
                      label={mcpEntryName(path)}
                      onClick={() => {
                        setSection('mcps')
                        setMcpEntryView('form')
                        setDetail({ kind: 'mcp', path })
                      }}
                    />
                  ))}
              </div>
            )
          })}
        </aside>
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-10 shrink-0 items-center border-b bg-card px-4 py-2 text-xs">
            <FileCode2 className="mr-2 size-4 text-muted-foreground" />
            <span className="font-semibold">
              {detailLabel(pkg, detail) ?? t(`studio.sections.${section}`)}
            </span>
            {detail?.kind === 'mcp' ? (
              <Tabs
                className="ml-auto"
                items={[
                  { value: 'form', label: t('studio.views.form') },
                  { value: 'json', label: t('studio.views.source') },
                ]}
                value={mcpEntryView}
                variant="pills"
                size="compact"
                onValueChange={setMcpEntryView}
                ariaLabel={t('studio.views.mcpEntryLabel')}
              />
            ) : detail?.kind === 'skill' || detail?.kind === 'faq' ? (
              <Tabs
                className="ml-auto"
                items={[
                  { value: 'form', label: t('studio.views.form') },
                  { value: 'json', label: t('studio.views.json') },
                ]}
                value={detail.kind === 'skill' ? skillEntryView : faqEntryView}
                variant="pills"
                size="compact"
                onValueChange={
                  detail.kind === 'skill' ? setSkillEntryView : setFaqEntryView
                }
                ariaLabel={t(
                  detail.kind === 'skill'
                    ? 'studio.views.skillEntryLabel'
                    : 'studio.views.faqEntryLabel',
                )}
              />
            ) : (section === 'source' ||
                section === 'security' ||
                section === 'settings' ||
                section === 'businessInfo' ||
                section === 'allowlist' ||
                section === 'components' ||
                section === 'skills' ||
                section === 'faqs' ||
                section === 'websites' ||
                section === 'files' ||
                section === 'connectors' ||
                section === 'qrCodes') &&
              !detail ? (
              <Tabs
                className="ml-auto"
                items={[
                  { value: 'form', label: t('studio.views.form') },
                  { value: 'json', label: t('studio.views.json') },
                ]}
                value={
                  section === 'source'
                    ? sourceView
                    : section === 'security'
                      ? securityView
                      : section === 'settings'
                        ? settingsView
                        : section === 'businessInfo'
                          ? businessInfoView
                          : section === 'allowlist'
                            ? allowlistView
                            : section === 'components'
                              ? componentsView
                              : section === 'skills'
                                ? skillsView
                                : section === 'faqs'
                                  ? faqsView
                                  : section === 'websites'
                                    ? websitesView
                                    : section === 'files'
                                      ? knowledgeFilesView
                                      : section === 'connectors'
                                        ? connectorsView
                                        : qrCodesView
                }
                variant="pills"
                size="compact"
                onValueChange={
                  section === 'source'
                    ? setSourceView
                    : section === 'security'
                      ? setSecurityView
                      : section === 'settings'
                        ? setSettingsView
                        : section === 'businessInfo'
                          ? setBusinessInfoView
                          : section === 'allowlist'
                            ? setAllowlistView
                            : section === 'components'
                              ? setComponentsView
                              : section === 'skills'
                                ? setSkillsView
                                : section === 'faqs'
                                  ? setFaqsView
                                  : section === 'websites'
                                    ? setWebsitesView
                                    : section === 'files'
                                      ? setKnowledgeFilesView
                                      : section === 'connectors'
                                        ? setConnectorsView
                                        : setQrCodesView
                }
                ariaLabel={t(`studio.views.${section}Label`)}
              />
            ) : (
              <span className="ml-2 text-muted-foreground">
                {section === 'manifest' || detail?.kind === 'entry'
                  ? 'YAML'
                  : 'JSON'}
              </span>
            )}
          </div>
          <div className="min-h-0 flex-1">
            {section === 'includedFiles' && !detail ? (
              <IncludedFilesExplorer
                manifest={pkg.manifest}
                entries={pkg.entries}
                onChange={updateEntries}
              />
            ) : section === 'mcps' && !detail ? (
              <McpsForm
                manifest={pkg.manifest}
                entries={pkg.entries}
                onChange={updateEntries}
                onEdit={(path) => {
                  setMcpEntryView('form')
                  setDetail({ kind: 'mcp', path })
                }}
              />
            ) : detail?.kind === 'mcp' ? (
              <McpEntryEditor
                path={detail.path}
                bytes={pkg.entries.get(detail.path) ?? new Uint8Array()}
                view={mcpEntryView}
                theme={resolvedTheme}
                onChange={(contents) => updateEntry(detail.path, contents)}
              />
            ) : detail?.kind === 'skill' && skillEntryView === 'form' ? (
              <SkillEntryForm
                skill={sectionItems(pkg.manifest, 'skills')[detail.index] ?? {}}
                onChange={(skill) =>
                  updateSkills(
                    sectionItems(pkg.manifest, 'skills').map((item, index) =>
                      index === detail.index ? skill : item,
                    ),
                  )
                }
              />
            ) : detail?.kind === 'faq' && faqEntryView === 'form' ? (
              <FaqEntryForm
                faq={sectionItems(pkg.manifest, 'faqs')[detail.index] ?? {}}
                onChange={(faq) =>
                  updateFaqs(
                    sectionItems(pkg.manifest, 'faqs').map((item, index) =>
                      index === detail.index ? faq : item,
                    ),
                  )
                }
              />
            ) : section === 'source' && !detail && sourceView === 'form' ? (
              <SourceChannelForm manifest={pkg.manifest} />
            ) : section === 'security' && !detail && securityView === 'form' ? (
              <SecurityForm manifest={pkg.manifest} />
            ) : section === 'settings' && !detail && settingsView === 'form' ? (
              <SettingsForm manifest={pkg.manifest} onChange={updateSettings} />
            ) : section === 'businessInfo' &&
              !detail &&
              businessInfoView === 'form' ? (
              <BusinessInfoForm
                manifest={pkg.manifest}
                onChange={updateBusinessInfo}
              />
            ) : section === 'allowlist' &&
              !detail &&
              allowlistView === 'form' ? (
              <AllowlistForm
                manifest={pkg.manifest}
                onChange={updateAllowlist}
              />
            ) : section === 'components' &&
              !detail &&
              componentsView === 'form' ? (
              <ComponentsForm
                manifest={pkg.manifest}
                onChange={updateComponents}
              />
            ) : section === 'skills' && !detail && skillsView === 'form' ? (
              <SkillsForm
                manifest={pkg.manifest}
                onChange={updateSkills}
                onEdit={(index) => {
                  setExpandedSections((current) => ({
                    ...current,
                    skills: true,
                  }))
                  setSkillEntryView('form')
                  setDetail({ kind: 'skill', index })
                }}
              />
            ) : section === 'faqs' && !detail && faqsView === 'form' ? (
              <FaqsForm
                manifest={pkg.manifest}
                onChange={updateFaqs}
                onEdit={(index) => {
                  setExpandedSections((current) => ({ ...current, faqs: true }))
                  setFaqEntryView('form')
                  setDetail({ kind: 'faq', index })
                }}
              />
            ) : section === 'websites' && !detail && websitesView === 'form' ? (
              <WebsitesForm manifest={pkg.manifest} onChange={updateWebsites} />
            ) : section === 'files' &&
              !detail &&
              knowledgeFilesView === 'form' ? (
              <KnowledgeFilesForm
                manifest={pkg.manifest}
                entries={pkg.entries}
                onChange={updateKnowledgeFiles}
              />
            ) : section === 'connectors' &&
              !detail &&
              connectorsView === 'form' ? (
              <ConnectorsForm
                manifest={pkg.manifest}
                entries={pkg.entries}
                onChange={updateConnectors}
              />
            ) : section === 'qrCodes' && !detail && qrCodesView === 'form' ? (
              <QrCodesForm manifest={pkg.manifest} onChange={updateQrCodes} />
            ) : (
              <StudioCodeEditor
                language={
                  section === 'manifest' || detail?.kind === 'entry'
                    ? 'yaml'
                    : 'json'
                }
                path={`studio-${detailLabel(pkg, detail) ?? section}`}
                theme={resolvedTheme}
                value={draft}
                onChange={updateDraft}
                readOnly={
                  (section === 'source' || section === 'security') && !detail
                }
                ariaLabel={t(
                  (section === 'source' || section === 'security') && !detail
                    ? 'studio.readOnlyCode'
                    : 'studio.codeEditor',
                )}
              />
            )}
          </div>
          <div className="flex h-7 shrink-0 items-center border-t bg-card px-3 text-[11px] text-muted-foreground">
            <span>{error ?? t('studio.ready')}</span>
            <span className="ml-auto">
              AGTX v1 · {pkg.entries.size} {t('studio.entries')}
            </span>
          </div>
        </main>
        <StudioChatPanel
          key={projectId}
          projectId={projectId}
          document={pkg}
          initialConversation={conversation}
          onChange={(nextDocument) => {
            setPkg(nextDocument)
            setDirty(true)
            setError(null)
          }}
        />
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
            value={projectSearch}
            placeholder={t('studio.searchPlaceholder')}
            aria-label={t('studio.searchProjects')}
            onChange={(event) => setProjectSearch(event.target.value)}
          />
          <div className="mt-4 max-h-96 space-y-2 overflow-y-auto">
            {projects
              .filter((project) =>
                project.name
                  .toLocaleLowerCase()
                  .includes(projectSearch.trim().toLocaleLowerCase()),
              )
              .map((project) => (
                <button
                  key={project.id}
                  type="button"
                  className="flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => void navigate(`/studio/${project.id}`)}
                >
                  <FolderOpen
                    className="size-4 shrink-0 text-primary"
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {project.name}
                  </span>
                </button>
              ))}
          </div>
        </div>
      </Dialog>
      <RenameProjectDialog
        project={renameOpen ? { name: pkg.name } : null}
        name={renameName}
        working={renaming}
        onNameChange={setRenameName}
        onClose={() => setRenameOpen(false)}
        onRename={() => void renameProject()}
      />
      <DeployProjectDialog
        document={pkg}
        open={deployOpen}
        onClose={() => setDeployOpen(false)}
      />
    </div>
  )
}

function ProjectMenuItem({
  icon: Icon,
  title,
  description,
  onClick,
}: {
  icon: typeof Search
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <MenuItem className="items-start py-2.5" onClick={onClick}>
      <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0">
        <span className="block">{title}</span>
        <span className="mt-0.5 block text-xs leading-4 font-normal text-muted-foreground">
          {description}
        </span>
      </span>
    </MenuItem>
  )
}

const deploySteps = [
  'backup',
  'settings',
  'businessInfo',
  'allowlist',
  'skills',
  'qrCodes',
  'components',
  'faqs',
  'websites',
  'files',
  'mcps',
  'connectors',
  'finalizing',
] as const
const deployComponents = [
  'settings',
  'businessInfo',
  'allowlist',
  'skills',
  'qrCodes',
  'components',
  'faqs',
  'websites',
  'files',
  'connectors',
] as const
type DeployStep = (typeof deploySteps)[number]
type DeployAgent = { id: number; name: string; waPhoneNumber: string }
interface DeployInspection {
  requirements: {
    files: Array<{ providerFileId: string; fileName: string }>
    connectors: Array<{
      name: string
      authType: 'API_KEY' | 'OAUTH2_CLIENT_CREDENTIALS' | 'NONE'
      requiresCertificate: boolean
    }>
  }
}
interface DeployConnectorInput {
  authConfig: string
  clientCertificate: string
  clientKey: string
  caCertificate: string
}

function DeployProjectDialog({
  document,
  open,
  onClose,
}: {
  document: StudioDocument
  open: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [view, setView] = useState<'agents' | 'confirm' | 'progress'>('agents')
  const [agents, setAgents] = useState<DeployAgent[]>([])
  const [target, setTarget] = useState<DeployAgent | null>(null)
  const [inspection, setInspection] = useState<DeployInspection | null>(null)
  const [packageFile, setPackageFile] = useState<File | null>(null)
  const [connectorInputs, setConnectorInputs] = useState<
    Record<string, DeployConnectorInput>
  >({})
  const [requiredFiles, setRequiredFiles] = useState<Record<string, File>>({})
  const [createBackup, setCreateBackup] = useState(true)
  const [loading, setLoading] = useState(false)
  const [deploying, setDeploying] = useState(false)
  const [step, setStep] = useState<DeployStep | null>(null)
  const [complete, setComplete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let active = true
    setView('agents')
    setAgents([])
    setTarget(null)
    setInspection(null)
    setPackageFile(null)
    setConnectorInputs({})
    setRequiredFiles({})
    setCreateBackup(true)
    setLoading(true)
    setDeploying(false)
    setStep(null)
    setComplete(false)
    setError(null)
    void apiClient.api.channels
      .$get()
      .then(async (response) => {
        if (!response.ok) throw new Error(t('studio.deploy.loadFailed'))
        const channels = (await response.json()).channels
        const enabled = await Promise.all(
          channels.map(async (channel) => {
            try {
              const status = await apiClient.api.channels[':id'][
                'agent-settings'
              ].$get({ param: { id: String(channel.id) } })
              return status.ok && (await status.json()).status === 'enabled'
            } catch {
              return false
            }
          }),
        )
        if (active)
          setAgents(
            channels.filter((_, index) => enabled[index]) as DeployAgent[],
          )
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : t('studio.deploy.loadFailed'),
          )
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [open, t])

  const selectAgent = async (agent: DeployAgent) => {
    setLoading(true)
    setError(null)
    try {
      const archive = serializeAgtx(document)
      const file = new globalThis.File(
        [archive.buffer as ArrayBuffer],
        document.name.toLowerCase().endsWith('.agtx')
          ? document.name
          : `${document.name}.agtx`,
        { type: 'application/vnd.mba.agent+zip' },
      )
      const form = new FormData()
      form.set('package', file)
      const response = await fetch(
        `/api/channels/${agent.id}/agent-import/inspect`,
        { method: 'POST', body: form },
      )
      if (!response.ok)
        throw new Error(
          await deployResponseError(response, t('studio.deploy.inspectFailed')),
        )
      const nextInspection = (await response.json()) as DeployInspection
      setTarget(agent)
      setPackageFile(file)
      setInspection(nextInspection)
      setConnectorInputs(
        Object.fromEntries(
          nextInspection.requirements.connectors.map((connector) => [
            connector.name,
            {
              authConfig: deployConnectorAuthTemplate(connector.authType),
              clientCertificate: '',
              clientKey: '',
              caCertificate: '',
            },
          ]),
        ),
      )
      setView('confirm')
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t('studio.deploy.inspectFailed'),
      )
    } finally {
      setLoading(false)
    }
  }

  const deploy = async () => {
    if (!target || !packageFile || !inspection || deploying) return
    setDeploying(true)
    setView('progress')
    setStep(null)
    setComplete(false)
    setError(null)
    let activeStep: DeployStep | null = null
    try {
      const connectorCredentials: Record<string, unknown> = {}
      for (const connector of inspection.requirements.connectors) {
        const input = connectorInputs[connector.name]
        const credential: Record<string, unknown> = {}
        if (connector.authType !== 'NONE') {
          try {
            credential.authConfig = JSON.parse(input?.authConfig ?? '')
          } catch {
            throw new Error(
              t('studio.deploy.invalidCredentials', { name: connector.name }),
            )
          }
        }
        if (connector.requiresCertificate) {
          if (!input?.clientCertificate.trim() || !input.clientKey.trim())
            throw new Error(
              t('studio.deploy.certificateRequired', { name: connector.name }),
            )
          credential.certificate = {
            clientCertificate: input.clientCertificate,
            clientKey: input.clientKey,
            ...(input.caCertificate.trim()
              ? { caCertificate: input.caCertificate }
              : {}),
          }
        }
        connectorCredentials[connector.name] = credential
      }

      const form = new FormData()
      form.set('package', packageFile)
      form.set(
        'options',
        JSON.stringify({
          connectorCredentials,
          createBackupBeforeImport: createBackup,
          components: [...deployComponents],
        }),
      )
      for (const required of inspection.requirements.files) {
        const file = requiredFiles[required.providerFileId]
        if (!file)
          throw new Error(
            t('studio.deploy.fileRequired', { name: required.fileName }),
          )
        form.set(`file:${required.providerFileId}`, file)
      }
      const response = await fetch(`/api/channels/${target.id}/agent-import`, {
        method: 'POST',
        body: form,
      })
      if (!response.ok)
        throw new Error(
          await deployResponseError(response, t('studio.deploy.failed')),
        )
      let completed = false
      await readDeploySse(response, (event, data) => {
        const payload = parseDeployEvent(data)
        if (
          event === 'progress' &&
          typeof payload?.step === 'string' &&
          isDeployStep(payload.step)
        ) {
          activeStep = payload.step
          setStep(payload.step)
        } else if (event === 'complete') {
          completed = true
        } else if (event === 'import-error') {
          const reason =
            typeof payload?.message === 'string'
              ? payload.message
              : t('studio.deploy.failed')
          throw new Error(
            t('studio.deploy.failedAtStep', {
              step: activeStep
                ? t(`agent.importPanel.steps.${activeStep}`)
                : t('agent.importPanel.unknownStep'),
              reason,
            }),
          )
        }
      })
      if (!completed) throw new Error(t('studio.deploy.failed'))
      setComplete(true)
      setStep(null)
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t('studio.deploy.failed'),
      )
    } finally {
      setDeploying(false)
    }
  }

  const visibleSteps: readonly DeployStep[] = createBackup
    ? deploySteps
    : deploySteps.filter((candidate) => candidate !== 'backup')
  const currentIndex = complete
    ? visibleSteps.length
    : step
      ? visibleSteps.indexOf(step)
      : -1
  const progress = complete
    ? 100
    : currentIndex < 0
      ? 0
      : Math.round(((currentIndex + 1) / visibleSteps.length) * 100)

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !deploying) onClose()
      }}
      dismissible={!deploying}
      title={t('studio.deploy.title')}
      description={t('studio.deploy.description')}
      icon={<Rocket className="mt-1 size-5 text-primary" aria-hidden />}
      size="lg"
    >
      <div className="w-full">
        {view === 'agents' && (
          <div className="grid gap-3">
            <div className="grid max-h-96 gap-2 overflow-y-auto">
              {loading ? (
                <p className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
                  <LoaderCircle className="size-4 animate-spin" aria-hidden />
                  {t('studio.deploy.loadingAgents')}
                </p>
              ) : agents.length ? (
                agents.map((agent) => (
                  <button
                    key={agent.id}
                    type="button"
                    className="flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-muted"
                    onClick={() => void selectAgent(agent)}
                  >
                    <Bot className="size-4 shrink-0 text-primary" aria-hidden />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">
                        {agent.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {agent.waPhoneNumber}
                      </span>
                    </span>
                  </button>
                ))
              ) : (
                <p className="p-10 text-center text-sm text-muted-foreground">
                  {t('studio.deploy.noAgents')}
                </p>
              )}
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
        )}

        {view === 'confirm' && inspection && target && (
          <div className="grid max-h-[60vh] gap-4 overflow-y-auto pr-1">
            <p className="rounded-xl border bg-muted/20 p-3 text-sm">
              {t('studio.deploy.target', { name: target.name })}
            </p>
            {inspection.requirements.files.map((file) => (
              <label
                key={file.providerFileId}
                className="grid gap-2 text-sm font-semibold"
              >
                {t('studio.deploy.missingFile', { name: file.fileName })}
                <Input
                  type="file"
                  onChange={(event) => {
                    const selected = event.target.files?.[0]
                    setRequiredFiles((current) => ({
                      ...current,
                      ...(selected ? { [file.providerFileId]: selected } : {}),
                    }))
                  }}
                />
              </label>
            ))}
            {inspection.requirements.connectors.map((connector) => {
              const input = connectorInputs[connector.name]
              if (!input) return null
              return (
                <div
                  key={connector.name}
                  className="grid gap-3 rounded-xl border p-4"
                >
                  <p className="font-semibold">{connector.name}</p>
                  {connector.authType !== 'NONE' && (
                    <label className="grid gap-2 text-sm font-semibold">
                      {t('studio.deploy.authConfig', {
                        type: connector.authType,
                      })}
                      <Textarea
                        className="min-h-36 font-mono text-xs"
                        value={input.authConfig}
                        onChange={(event) =>
                          setConnectorInputs((current) => ({
                            ...current,
                            [connector.name]: {
                              ...input,
                              authConfig: event.target.value,
                            },
                          }))
                        }
                      />
                    </label>
                  )}
                  {connector.requiresCertificate &&
                    (
                      [
                        'clientCertificate',
                        'clientKey',
                        'caCertificate',
                      ] as const
                    ).map((field) => (
                      <label
                        key={field}
                        className="grid gap-2 text-sm font-semibold"
                      >
                        {t(`studio.deploy.${field}`)}
                        <Textarea
                          className="min-h-24 font-mono text-xs"
                          value={input[field]}
                          onChange={(event) =>
                            setConnectorInputs((current) => ({
                              ...current,
                              [connector.name]: {
                                ...input,
                                [field]: event.target.value,
                              },
                            }))
                          }
                        />
                      </label>
                    ))}
                </div>
              )
            })}
            <Checkbox
              checked={createBackup}
              label={t('studio.deploy.createBackup')}
              description={t('studio.deploy.createBackupDescription')}
              onChange={(event) => setCreateBackup(event.target.checked)}
            />
            <p className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm leading-6">
              {t('studio.deploy.replaceWarning')}
            </p>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
        )}

        {view === 'progress' && (
          <div className="grid gap-4">
            <div>
              <div className="flex justify-between text-xs font-semibold text-muted-foreground">
                <span>{t('studio.deploy.progress')}</span>
                <span>{progress}%</span>
              </div>
              <div
                className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
            <ol
              className="grid max-h-80 gap-2 overflow-y-auto sm:grid-cols-2"
              aria-live="polite"
            >
              {visibleSteps.map((candidate, index) => (
                <li
                  key={candidate}
                  className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs"
                >
                  {complete || index < currentIndex ? (
                    <Check className="size-3.5 text-success" aria-hidden />
                  ) : deploying && index === currentIndex ? (
                    <LoaderCircle
                      className="size-3.5 animate-spin text-primary"
                      aria-hidden
                    />
                  ) : (
                    <span className="size-3 rounded-full border-2" />
                  )}
                  <span
                    className={
                      index === currentIndex ? 'font-semibold' : undefined
                    }
                  >
                    {t(`agent.importPanel.steps.${candidate}`)}
                  </span>
                </li>
              ))}
            </ol>
            {error && (
              <p
                role="alert"
                className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
              >
                {error}
              </p>
            )}
            {complete && (
              <p
                role="status"
                className="rounded-lg bg-success/10 p-3 text-sm font-semibold text-success"
              >
                {t('studio.deploy.complete')}
              </p>
            )}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          {!deploying && (
            <Button variant="outline" onClick={onClose}>
              {t('common.close')}
            </Button>
          )}
          {view === 'confirm' && (
            <Button onClick={() => void deploy()}>
              <Rocket className="size-4" aria-hidden />
              {t('studio.deploy.confirm')}
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  )
}

function deployConnectorAuthTemplate(
  authType: DeployInspection['requirements']['connectors'][number]['authType'],
) {
  if (authType === 'API_KEY')
    return JSON.stringify(
      {
        apiKey: {
          headers: [{ fieldName: 'Authorization', value: '' }],
          queryParams: [],
          bodyParams: [],
        },
      },
      null,
      2,
    )
  if (authType === 'OAUTH2_CLIENT_CREDENTIALS')
    return JSON.stringify(
      {
        oauth2ClientCredentials: {
          tokenUrl: '',
          scopesToRequest: [],
          tokenRequestContentType: 'application/x-www-form-urlencoded',
          clientId: '',
          clientSecret: '',
        },
      },
      null,
      2,
    )
  return ''
}

function parseDeployEvent(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function isDeployStep(value: string): value is DeployStep {
  return (deploySteps as readonly string[]).includes(value)
}

async function readDeploySse(
  response: Response,
  onEvent: (event: string, data: string) => void,
) {
  if (!response.body) throw new Error('Import stream is unavailable')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const result = await reader.read()
    buffer += decoder.decode(result.value, { stream: !result.done })
    let boundary = buffer.indexOf('\n\n')
    while (boundary >= 0) {
      const lines = buffer.slice(0, boundary).split('\n')
      buffer = buffer.slice(boundary + 2)
      const event = lines.find((line) => line.startsWith('event: '))?.slice(7)
      const data = lines.find((line) => line.startsWith('data: '))?.slice(6)
      if (event && data) onEvent(event, data)
      boundary = buffer.indexOf('\n\n')
    }
    if (result.done) break
  }
}

async function deployResponseError(response: Response, fallback: string) {
  const body: unknown = await response.json().catch(() => undefined)
  return body &&
    typeof body === 'object' &&
    'message' in body &&
    typeof body.message === 'string'
    ? body.message
    : fallback
}

function SourceChannelForm({
  manifest,
}: {
  manifest: Record<string, unknown>
}) {
  const { t } = useTranslation()
  const source = manifest.source as Record<string, unknown> | undefined
  const channel = source?.channel as Record<string, unknown> | undefined
  const fields = [
    'type',
    'phoneNumber',
    'phoneNumberId',
    'wabaId',
    'businessId',
    'appId',
  ] as const
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto grid max-w-3xl gap-5 sm:grid-cols-2">
        {fields.map((field) => (
          <label key={field} className="grid gap-2 text-sm font-semibold">
            <span>{t(`studio.sourceFields.${field}`)}</span>
            <Input
              value={String(channel?.[field] ?? '')}
              readOnly
              aria-readonly="true"
              className="bg-muted/40 text-muted-foreground"
            />
          </label>
        ))}
      </div>
    </div>
  )
}

function SecurityForm({ manifest }: { manifest: Record<string, unknown> }) {
  const { t } = useTranslation()
  const security = manifest.security as Record<string, unknown> | undefined
  const knowledgeFiles = security?.knowledgeFiles as
    Record<string, unknown> | undefined
  const fields = [
    ['connectorCredentialsIncluded', security?.connectorCredentialsIncluded],
    ['connectorCertificatesIncluded', security?.connectorCertificatesIncluded],
    ['knowledgeFilesTotal', knowledgeFiles?.total],
    ['knowledgeFilesIncluded', knowledgeFiles?.included],
    ['knowledgeFilesMissing', knowledgeFiles?.missing],
  ] as const
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto grid max-w-3xl gap-5 sm:grid-cols-2">
        {fields.map(([field, value]) => (
          <label key={field} className="grid gap-2 text-sm font-semibold">
            <span>{t(`studio.securityFields.${field}`)}</span>
            <Input
              value={
                typeof value === 'boolean'
                  ? t(`studio.boolean.${String(value)}`)
                  : String(value ?? '')
              }
              readOnly
              aria-readonly="true"
              className="bg-muted/40 text-muted-foreground"
            />
          </label>
        ))}
      </div>
    </div>
  )
}

function SettingsForm({
  manifest,
  onChange,
}: {
  manifest: Record<string, unknown>
  onChange: (settings: Record<string, unknown>) => void
}) {
  const { t } = useTranslation()
  const settings = (sectionValue(manifest, 'settings') ?? {}) as Record<
    string,
    unknown
  >
  const handoff = (settings.handoff ?? {}) as Record<string, unknown>
  const update = (field: string, value: unknown) =>
    onChange({ ...settings, [field]: value })
  const updateHandoff = (field: string, value: unknown) =>
    update('handoff', { ...handoff, [field]: value })
  const neverSayPhrases = Array.isArray(settings.neverSayPhrases)
    ? settings.neverSayPhrases.map(String)
    : []
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto grid max-w-3xl gap-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <Input
            label={t('studio.settingsFields.agentId')}
            value={String(settings.agentId ?? '')}
            onChange={(event) => update('agentId', event.target.value)}
          />
          <Select
            label={t('studio.settingsFields.audience')}
            value={String(settings.audience ?? 'EVERYONE')}
            onChange={(event) => update('audience', event.target.value)}
          >
            <option value="EVERYONE">
              {t('studio.settingsOptions.audience.everyone')}
            </option>
            <option value="ALLOWLISTED_ONLY">
              {t('studio.settingsOptions.audience.allowlistedOnly')}
            </option>
          </Select>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <Switch
            checked={Boolean(settings.rolloutEnabled)}
            label={t('studio.settingsFields.rolloutEnabled')}
            description={t('studio.settingsFields.rolloutDescription')}
            onChange={(event) => update('rolloutEnabled', event.target.checked)}
          />
        </div>
        <div className="grid gap-5 rounded-xl border bg-card p-4">
          <Switch
            checked={Boolean(handoff.enabled)}
            label={t('studio.settingsFields.handoffEnabled')}
            description={t('studio.settingsFields.handoffDescription')}
            onChange={(event) => updateHandoff('enabled', event.target.checked)}
          />
          <Select
            label={t('studio.settingsFields.messageSelection')}
            value={String(handoff.messageSelection ?? 'DEFAULT')}
            onChange={(event) =>
              updateHandoff('messageSelection', event.target.value)
            }
          >
            <option value="DEFAULT">
              {t('studio.settingsOptions.messageSelection.default')}
            </option>
            <option value="AGENT">
              {t('studio.settingsOptions.messageSelection.agent')}
            </option>
            <option value="CUSTOM">
              {t('studio.settingsOptions.messageSelection.custom')}
            </option>
          </Select>
          {handoff.messageSelection === 'CUSTOM' && (
            <Textarea
              label={t('studio.settingsFields.handoffMessage')}
              rows={4}
              maxLength={10_000}
              value={String(handoff.message ?? '')}
              onChange={(event) => updateHandoff('message', event.target.value)}
            />
          )}
        </div>
        <TagInput
          label={t('studio.settingsFields.neverSayPhrases')}
          hint={t('studio.settingsFields.neverSayHint')}
          placeholder={t('studio.settingsFields.neverSayPlaceholder')}
          value={neverSayPhrases}
          maxLength={500}
          getRemoveLabel={(phrase) =>
            t('studio.settingsFields.removePhrase', { phrase })
          }
          onValueChange={(value) => update('neverSayPhrases', value)}
        />
      </div>
    </div>
  )
}

function BusinessInfoForm({
  manifest,
  onChange,
}: {
  manifest: Record<string, unknown>
  onChange: (businessInfo: Record<string, unknown>) => void
}) {
  const { t } = useTranslation()
  const businessInfo = (sectionValue(manifest, 'businessInfo') ?? {}) as Record<
    string,
    unknown
  >
  const update = (field: string, value: string) =>
    onChange({ ...businessInfo, [field]: value })
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto grid max-w-3xl gap-4">
        <Input
          label={t('agent.businessInfo.contactEmail')}
          type="email"
          maxLength={500}
          value={String(businessInfo.contactEmail ?? '')}
          onChange={(event) => update('contactEmail', event.target.value)}
        />
        <AutoGrowTextarea
          label={t('agent.businessInfo.address')}
          value={String(businessInfo.address ?? '')}
          onValueChange={(value) => update('address', value)}
        />
        <AutoGrowTextarea
          label={t('agent.businessInfo.businessDescription')}
          value={String(businessInfo.businessDescription ?? '')}
          onValueChange={(value) => update('businessDescription', value)}
        />
        <AutoGrowTextarea
          label={t('agent.businessInfo.purchaseInfo')}
          value={String(businessInfo.purchaseInfo ?? '')}
          onValueChange={(value) => update('purchaseInfo', value)}
        />
        <AutoGrowTextarea
          label={t('agent.businessInfo.deliveryAndShipping')}
          value={String(businessInfo.deliveryAndShipping ?? '')}
          onValueChange={(value) => update('deliveryAndShipping', value)}
        />
        <AutoGrowTextarea
          label={t('agent.businessInfo.returnPolicy')}
          value={String(businessInfo.returnPolicy ?? '')}
          onValueChange={(value) => update('returnPolicy', value)}
        />
        <AutoGrowTextarea
          label={t('agent.businessInfo.paymentMethod')}
          value={String(businessInfo.paymentMethod ?? '')}
          onValueChange={(value) => update('paymentMethod', value)}
        />
        <AutoGrowTextarea
          label={t('agent.businessInfo.hoursOfOperation')}
          value={String(businessInfo.hoursOfOperation ?? '')}
          onValueChange={(value) => update('hoursOfOperation', value)}
        />
      </div>
    </div>
  )
}

function AutoGrowTextarea({
  label,
  value,
  maxLength = 10_000,
  onValueChange,
}: {
  label: string
  value: string
  maxLength?: number
  onValueChange: (value: string) => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${element.scrollHeight}px`
  }, [value])
  return (
    <Textarea
      ref={ref}
      className="min-h-20 resize-none overflow-hidden"
      label={label}
      maxLength={maxLength}
      rows={2}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    />
  )
}

function AllowlistForm({
  manifest,
  onChange,
}: {
  manifest: Record<string, unknown>
  onChange: (allowlist: Array<Record<string, unknown>>) => void
}) {
  const { t } = useTranslation()
  const [phoneNumber, setPhoneNumber] = useState('')
  const value = sectionValue(manifest, 'allowlist')
  const allowlist = Array.isArray(value)
    ? (value as Array<Record<string, unknown>>)
    : []
  const normalizedPhone = phoneNumber.trim()
  const canAdd =
    Boolean(normalizedPhone) &&
    allowlist.length < 10_000 &&
    !allowlist.some((entry) => entry.phoneNumber === normalizedPhone)
  const add = () => {
    if (!canAdd) return
    onChange([
      ...allowlist,
      { id: crypto.randomUUID(), phoneNumber: normalizedPhone },
    ])
    setPhoneNumber('')
  }
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto grid max-w-3xl gap-5">
        <form
          className="flex items-end gap-3 rounded-xl border bg-card p-4"
          onSubmit={(event) => {
            event.preventDefault()
            add()
          }}
        >
          <div className="min-w-0 flex-1">
            <Input
              label={t('studio.allowlist.phoneNumber')}
              type="tel"
              placeholder={t('studio.allowlist.placeholder')}
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
            />
          </div>
          <Button className="mb-4" disabled={!canAdd} type="submit">
            <Plus className="size-4" aria-hidden />
            {t('studio.allowlist.add')}
          </Button>
        </form>
        {allowlist.length === 0 ? (
          <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            {t('studio.allowlist.empty')}
          </p>
        ) : (
          <div className="grid gap-3">
            {allowlist.map((entry, index) => (
              <div
                className="flex items-end gap-3 rounded-xl border bg-card p-4"
                key={`${String(entry.id)}-${index}`}
              >
                <div className="min-w-0 flex-1">
                  <Input
                    label={t('studio.allowlist.entry', { number: index + 1 })}
                    type="tel"
                    value={String(entry.phoneNumber ?? '')}
                    onChange={(event) =>
                      onChange(
                        allowlist.map((item, itemIndex) =>
                          itemIndex === index
                            ? {
                                ...item,
                                phoneNumber: event.target.value || null,
                              }
                            : item,
                        ),
                      )
                    }
                  />
                </div>
                <Button
                  className="mb-4"
                  size="icon"
                  variant="ghost"
                  aria-label={t('studio.allowlist.remove', {
                    phoneNumber: String(entry.phoneNumber ?? ''),
                  })}
                  onClick={() =>
                    onChange(
                      allowlist.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

type ComponentEditor = { type: 'prompt' | 'command'; index: number | null }

function ComponentsForm({
  manifest,
  onChange,
}: {
  manifest: Record<string, unknown>
  onChange: (components: Record<string, unknown>) => void
}) {
  const { t } = useTranslation()
  const components = (sectionValue(manifest, 'components') ?? {}) as Record<
    string,
    unknown
  >
  const prompts = Array.isArray(components.prompts)
    ? components.prompts.map(String)
    : []
  const commands = Array.isArray(components.commands)
    ? (components.commands as Array<Record<string, unknown>>)
    : []
  const [editor, setEditor] = useState<ComponentEditor | null>(null)
  const [removal, setRemoval] = useState<ComponentEditor | null>(null)
  const [prompt, setPrompt] = useState('')
  const [commandName, setCommandName] = useState('')
  const [commandDescription, setCommandDescription] = useState('')

  const openEditor = (type: 'prompt' | 'command', index: number | null) => {
    setEditor({ type, index })
    if (type === 'prompt')
      setPrompt(index === null ? '' : (prompts[index] ?? ''))
    else {
      const command = index === null ? undefined : commands[index]
      setCommandName(String(command?.commandName ?? ''))
      setCommandDescription(String(command?.commandDescription ?? ''))
    }
  }
  const save = () => {
    if (!editor) return
    if (editor.type === 'prompt') {
      const next = prompt.trim()
      if (!next) return
      onChange({
        ...components,
        prompts:
          editor.index === null
            ? [...prompts, next]
            : prompts.map((item, index) =>
                index === editor.index ? next : item,
              ),
      })
    } else {
      const next = {
        commandName: commandName.trim(),
        commandDescription: commandDescription.trim(),
      }
      if (!next.commandName || !next.commandDescription) return
      onChange({
        ...components,
        commands:
          editor.index === null
            ? [...commands, next]
            : commands.map((item, index) =>
                index === editor.index ? next : item,
              ),
      })
    }
    setEditor(null)
  }
  const remove = () => {
    if (!removal || removal.index === null) return
    onChange(
      removal.type === 'prompt'
        ? {
            ...components,
            prompts: prompts.filter((_, index) => index !== removal.index),
          }
        : {
            ...components,
            commands: commands.filter((_, index) => index !== removal.index),
          },
    )
    setRemoval(null)
  }

  return (
    <>
      <div className="h-full overflow-y-auto p-6">
        <div className="mx-auto grid max-w-3xl gap-5">
          <StudioComponentList
            title={t('channels.components.icebreakers')}
            description={t('channels.components.icebreakersDescription')}
            icon={<MessageCircleQuestion className="size-4" aria-hidden />}
            empty={t('channels.components.noIcebreakers')}
            canAdd={prompts.length < 4}
            items={prompts.map((value) => ({ title: value }))}
            onAdd={() => openEditor('prompt', null)}
            onEdit={(index) => openEditor('prompt', index)}
            onRemove={(index) => setRemoval({ type: 'prompt', index })}
          />
          <StudioComponentList
            title={t('channels.components.commands')}
            description={t('channels.components.commandsDescription')}
            icon={<Command className="size-4" aria-hidden />}
            empty={t('channels.components.noCommands')}
            canAdd={commands.length < 30}
            items={commands.map((command) => ({
              title: `/${String(command.commandName ?? '')}`,
              description: String(command.commandDescription ?? ''),
            }))}
            onAdd={() => openEditor('command', null)}
            onEdit={(index) => openEditor('command', index)}
            onRemove={(index) => setRemoval({ type: 'command', index })}
          />
        </div>
      </div>
      <Dialog
        open={editor !== null}
        onOpenChange={(open) => !open && setEditor(null)}
        title={t(
          editor?.index === null
            ? editor.type === 'prompt'
              ? 'channels.components.createIcebreaker'
              : 'channels.components.createCommand'
            : editor?.type === 'prompt'
              ? 'channels.components.editIcebreaker'
              : 'channels.components.editCommand',
        )}
        description={t('channels.components.editorDescription')}
      >
        <div className="grid w-full gap-4">
          {editor?.type === 'prompt' ? (
            <Textarea
              autoFocus
              maxLength={80}
              label={t('channels.components.icebreaker')}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
            />
          ) : (
            <>
              <Input
                autoFocus
                maxLength={32}
                label={t('channels.components.commandName')}
                value={commandName}
                onChange={(event) => setCommandName(event.target.value)}
              />
              <Textarea
                maxLength={256}
                label={t('channels.components.commandDescription')}
                value={commandDescription}
                onChange={(event) => setCommandDescription(event.target.value)}
              />
            </>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditor(null)}>
              {t('channels.cancel')}
            </Button>
            <Button
              disabled={
                editor?.type === 'prompt'
                  ? !prompt.trim()
                  : !commandName.trim() || !commandDescription.trim()
              }
              onClick={save}
            >
              {t('channels.components.save')}
            </Button>
          </div>
        </div>
      </Dialog>
      <Dialog
        open={removal !== null}
        onOpenChange={(open) => !open && setRemoval(null)}
        title={t('channels.components.removeTitle')}
        description={t('channels.components.removeConfirmation')}
      >
        <div className="flex w-full justify-end gap-2">
          <Button variant="ghost" onClick={() => setRemoval(null)}>
            {t('channels.cancel')}
          </Button>
          <Button variant="danger" onClick={remove}>
            {t('channels.components.remove')}
          </Button>
        </div>
      </Dialog>
    </>
  )
}

function StudioComponentList({
  title,
  description,
  icon,
  empty,
  items,
  canAdd,
  onAdd,
  onEdit,
  onRemove,
}: {
  title: string
  description: string
  icon: ReactNode
  empty: string
  items: Array<{ title: string; description?: string }>
  canAdd: boolean
  onAdd: () => void
  onEdit: (index: number) => void
  onRemove: (index: number) => void
}) {
  const { t } = useTranslation()
  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-xs">
      <div className="flex items-start justify-between gap-3 p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
            {icon}
          </span>
          <div>
            <h3 className="text-sm font-bold">{title}</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {description}
            </p>
          </div>
        </div>
        {canAdd && (
          <Button variant="outline" onClick={onAdd}>
            <Plus className="size-4" aria-hidden />
            {t('channels.components.add')}
          </Button>
        )}
      </div>
      <div className="border-t bg-muted/10 p-4">
        {items.length === 0 ? (
          <p className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
            {empty}
          </p>
        ) : (
          <ul className="grid gap-2">
            {items.map((item, index) => (
              <li
                key={`${item.title}-${index}`}
                className="flex items-start justify-between gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <p className="wrap-break-word text-sm font-semibold">
                    {item.title}
                  </p>
                  {item.description && (
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {item.description}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    aria-label={t('channels.components.edit')}
                    size="icon"
                    variant="ghost"
                    onClick={() => onEdit(index)}
                  >
                    <Pencil className="size-4" aria-hidden />
                  </Button>
                  <Button
                    aria-label={t('channels.components.remove')}
                    size="icon"
                    variant="ghost"
                    onClick={() => onRemove(index)}
                  >
                    <Trash2 className="size-4 text-destructive" aria-hidden />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function SkillsForm({
  manifest,
  onChange,
  onEdit,
}: {
  manifest: Record<string, unknown>
  onChange: (skills: Array<Record<string, unknown>>) => void
  onEdit: (index: number) => void
}) {
  const { t } = useTranslation()
  const skills = sectionItems(manifest, 'skills')
  const add = () => {
    let suffix = skills.length + 1
    let title = `new-skill-${suffix}`
    while (skills.some((skill) => skill.title === title)) {
      suffix += 1
      title = `new-skill-${suffix}`
    }
    const next = [
      ...skills,
      {
        id: crypto.randomUUID(),
        title,
        description: '',
        skill: '',
        channel: 'whatsapp',
        status: 'active',
      },
    ]
    onChange(next)
    onEdit(next.length - 1)
  }
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto grid max-w-3xl gap-4">
        {skills.length === 0 ? (
          <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            {t('studio.skills.empty')}
          </p>
        ) : (
          <ul className="grid gap-3">
            {skills.map((skill, index) => (
              <li
                key={`${String(skill.id)}-${index}`}
                className="flex items-start justify-between gap-4 rounded-xl border bg-card p-4"
              >
                <div className="min-w-0">
                  <p className="wrap-break-word text-sm font-bold">
                    {String(skill.title ?? '')}
                  </p>
                  <p className="mt-1 wrap-break-word text-xs leading-5 text-muted-foreground">
                    {String(skill.description ?? '') ||
                      t('studio.skills.noDescription')}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t('studio.skills.edit', {
                      title: String(skill.title ?? ''),
                    })}
                    onClick={() => onEdit(index)}
                  >
                    <Pencil className="size-4" aria-hidden />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t('studio.skills.remove', {
                      title: String(skill.title ?? ''),
                    })}
                    onClick={() =>
                      onChange(
                        skills.filter((_, skillIndex) => skillIndex !== index),
                      )
                    }
                  >
                    <Trash2 className="size-4 text-destructive" aria-hidden />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <Button
          className="w-full"
          variant="outline"
          disabled={skills.length >= 1000}
          onClick={add}
        >
          <Plus className="size-4" aria-hidden />
          {t('studio.skills.add')}
        </Button>
      </div>
    </div>
  )
}

function SkillEntryForm({
  skill,
  onChange,
}: {
  skill: Record<string, unknown>
  onChange: (skill: Record<string, unknown>) => void
}) {
  const { t } = useTranslation()
  const update = (field: string, value: unknown) =>
    onChange({ ...skill, [field]: value })
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto grid max-w-3xl gap-4">
        <Input
          label={t('studio.skillFields.id')}
          value={String(skill.id ?? '')}
          onChange={(event) => update('id', event.target.value)}
        />
        <Input
          label={t('studio.skillFields.title')}
          maxLength={64}
          value={String(skill.title ?? '')}
          onChange={(event) => update('title', event.target.value)}
        />
        <AutoGrowTextarea
          label={t('studio.skillFields.description')}
          maxLength={1024}
          value={String(skill.description ?? '')}
          onValueChange={(value) => update('description', value)}
        />
        <Input
          label={t('studio.skillFields.channel')}
          value={String(skill.channel ?? '')}
          onChange={(event) => update('channel', event.target.value)}
        />
        <Input
          label={t('studio.skillFields.status')}
          value={String(skill.status ?? '')}
          onChange={(event) => update('status', event.target.value || null)}
        />
        <SkillMarkdownEditor
          label={t('studio.skillFields.instructions')}
          value={String(skill.skill ?? '')}
          onChange={(value) => update('skill', value)}
          labels={{
            modes: t('studio.markdown.modes'),
            visual: t('studio.markdown.visual'),
            source: t('studio.markdown.source'),
            editor: t('studio.markdown.editor'),
            bold: t('studio.markdown.bold'),
            italic: t('studio.markdown.italic'),
            heading: t('studio.markdown.heading'),
            bullets: t('studio.markdown.bullets'),
            numbered: t('studio.markdown.numbered'),
          }}
        />
      </div>
    </div>
  )
}

function FaqsForm({
  manifest,
  onChange,
  onEdit,
}: {
  manifest: Record<string, unknown>
  onChange: (faqs: Array<Record<string, unknown>>) => void
  onEdit: (index: number) => void
}) {
  const { t } = useTranslation()
  const faqs = sectionItems(manifest, 'faqs')
  const add = () => {
    const next = [
      ...faqs,
      {
        id: crypto.randomUUID(),
        question: t('studio.faqs.newQuestion'),
        answer: '',
        createdAt: Date.now(),
      },
    ]
    onChange(next)
    onEdit(next.length - 1)
  }
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto grid max-w-3xl gap-4">
        {faqs.length === 0 ? (
          <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            {t('studio.faqs.empty')}
          </p>
        ) : (
          <ul className="grid gap-3">
            {faqs.map((faq, index) => (
              <li
                key={`${String(faq.id)}-${index}`}
                className="flex items-start justify-between gap-4 rounded-xl border bg-card p-4"
              >
                <div className="min-w-0">
                  <p className="wrap-break-word text-sm font-bold">
                    {String(faq.question ?? '')}
                  </p>
                  <p className="mt-1 line-clamp-2 wrap-break-word text-xs leading-5 text-muted-foreground">
                    {String(faq.answer ?? '') || t('studio.faqs.noAnswer')}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t('studio.faqs.edit', {
                      question: String(faq.question ?? ''),
                    })}
                    onClick={() => onEdit(index)}
                  >
                    <Pencil className="size-4" aria-hidden />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t('studio.faqs.remove', {
                      question: String(faq.question ?? ''),
                    })}
                    onClick={() =>
                      onChange(faqs.filter((_, faqIndex) => faqIndex !== index))
                    }
                  >
                    <Trash2 className="size-4 text-destructive" aria-hidden />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <Button
          className="w-full"
          variant="outline"
          disabled={faqs.length >= 10_000}
          onClick={add}
        >
          <Plus className="size-4" aria-hidden />
          {t('studio.faqs.add')}
        </Button>
      </div>
    </div>
  )
}

function FaqEntryForm({
  faq,
  onChange,
}: {
  faq: Record<string, unknown>
  onChange: (faq: Record<string, unknown>) => void
}) {
  const { t } = useTranslation()
  useEffect(() => {
    if (typeof faq.createdAt !== 'number')
      onChange({ ...faq, createdAt: Date.now() })
  }, [faq, onChange])
  const update = (field: string, value: unknown) =>
    onChange({ ...faq, [field]: value })
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto grid max-w-3xl gap-4">
        <Input
          label={t('studio.faqFields.id')}
          value={String(faq.id ?? '')}
          onChange={(event) => update('id', event.target.value)}
        />
        <AutoGrowTextarea
          label={t('studio.faqFields.question')}
          maxLength={10_000}
          value={String(faq.question ?? '')}
          onValueChange={(value) => update('question', value)}
        />
        <SkillMarkdownEditor
          label={t('studio.faqFields.answer')}
          value={String(faq.answer ?? '')}
          maxLength={50_000}
          onChange={(value) => update('answer', value)}
          labels={{
            modes: t('studio.markdown.modes'),
            visual: t('studio.markdown.visual'),
            source: t('studio.markdown.source'),
            editor: t('studio.markdown.editor'),
            bold: t('studio.markdown.bold'),
            italic: t('studio.markdown.italic'),
            heading: t('studio.markdown.heading'),
            bullets: t('studio.markdown.bullets'),
            numbered: t('studio.markdown.numbered'),
          }}
        />
      </div>
    </div>
  )
}

function WebsitesForm({
  manifest,
  onChange,
}: {
  manifest: Record<string, unknown>
  onChange: (websites: Array<Record<string, unknown>>) => void
}) {
  const { t } = useTranslation()
  const value = sectionValue(manifest, 'websites')
  const websites = Array.isArray(value)
    ? (value as Array<Record<string, unknown>>)
    : []
  const [editorIndex, setEditorIndex] = useState<number | null | undefined>(
    undefined,
  )
  const [draft, setDraft] = useState<Record<string, unknown> | null>(null)
  const open = (index: number | null) => {
    setEditorIndex(index)
    setDraft(
      index === null
        ? {
            id: crypto.randomUUID(),
            url: '',
            includedSubDomains: [],
            includedUrlPatterns: [],
            excludedSubDomains: [],
            excludedUrlPatterns: [],
            singleUrls: [],
            crawlStatus: null,
            crawlError: null,
            pagesCrawled: null,
            lastCrawledAt: null,
          }
        : { ...websites[index] },
    )
  }
  const update = (field: string, fieldValue: unknown) =>
    setDraft((current) =>
      current ? { ...current, [field]: fieldValue } : current,
    )
  const strings = (field: string) =>
    Array.isArray(draft?.[field])
      ? (draft?.[field] as unknown[]).map(String)
      : []
  const save = () => {
    if (!draft || !String(draft.url ?? '').trim()) return
    onChange(
      editorIndex === null
        ? [...websites, draft]
        : websites.map((website, index) =>
            index === editorIndex ? draft : website,
          ),
    )
    setEditorIndex(undefined)
    setDraft(null)
  }
  return (
    <>
      <div className="h-full overflow-y-auto p-6">
        <div className="mx-auto grid max-w-3xl gap-4">
          {websites.length === 0 ? (
            <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              {t('studio.websites.empty')}
            </p>
          ) : (
            <ul className="grid gap-3">
              {websites.map((website, index) => (
                <li
                  key={`${String(website.id)}-${index}`}
                  className="flex items-start justify-between gap-4 rounded-xl border bg-card p-4"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">
                      {String(website.url ?? '')}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {website.crawlStatus
                        ? String(website.crawlStatus)
                        : t('studio.websites.noStatus')}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={t('studio.websites.edit', {
                        url: String(website.url ?? ''),
                      })}
                      onClick={() => open(index)}
                    >
                      <Pencil className="size-4" aria-hidden />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={t('studio.websites.remove', {
                        url: String(website.url ?? ''),
                      })}
                      onClick={() =>
                        onChange(
                          websites.filter(
                            (_, websiteIndex) => websiteIndex !== index,
                          ),
                        )
                      }
                    >
                      <Trash2 className="size-4 text-destructive" aria-hidden />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Button
            className="w-full"
            variant="outline"
            disabled={websites.length >= 1000}
            onClick={() => open(null)}
          >
            <Plus className="size-4" aria-hidden />
            {t('studio.websites.add')}
          </Button>
        </div>
      </div>
      <Dialog
        open={editorIndex !== undefined}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setEditorIndex(undefined)
            setDraft(null)
          }
        }}
        title={t(
          editorIndex === null
            ? 'studio.websites.create'
            : 'studio.websites.editTitle',
        )}
        description={t('studio.websites.description')}
        size="lg"
      >
        {draft && (
          <div className="grid w-full gap-4">
            <Input
              label={t('studio.websiteFields.id')}
              value={String(draft.id ?? '')}
              onChange={(event) => update('id', event.target.value)}
            />
            <Input
              label={t('studio.websiteFields.url')}
              type="url"
              value={String(draft.url ?? '')}
              onChange={(event) => update('url', event.target.value)}
            />
            {(
              [
                'includedSubDomains',
                'includedUrlPatterns',
                'excludedSubDomains',
                'excludedUrlPatterns',
                'singleUrls',
              ] as const
            ).map((field) => (
              <TagInput
                key={field}
                label={t(`studio.websiteFields.${field}`)}
                value={strings(field)}
                maxLength={2048}
                getRemoveLabel={(tag) =>
                  t('studio.websiteFields.removeTag', { tag })
                }
                onValueChange={(tags) => update(field, tags)}
              />
            ))}
            <Input
              label={t('studio.websiteFields.crawlStatus')}
              value={String(draft.crawlStatus ?? '')}
              onChange={(event) =>
                update('crawlStatus', event.target.value || null)
              }
            />
            <AutoGrowTextarea
              label={t('studio.websiteFields.crawlError')}
              value={String(draft.crawlError ?? '')}
              onValueChange={(value) => update('crawlError', value || null)}
            />
            <Input
              label={t('studio.websiteFields.pagesCrawled')}
              type="number"
              min={0}
              value={
                draft.pagesCrawled === null
                  ? ''
                  : String(draft.pagesCrawled ?? '')
              }
              onChange={(event) =>
                update(
                  'pagesCrawled',
                  event.target.value ? Number(event.target.value) : null,
                )
              }
            />
            <Input
              label={t('studio.websiteFields.lastCrawledAt')}
              type="number"
              value={
                draft.lastCrawledAt === null
                  ? ''
                  : String(draft.lastCrawledAt ?? '')
              }
              onChange={(event) =>
                update(
                  'lastCrawledAt',
                  event.target.value ? Number(event.target.value) : null,
                )
              }
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setEditorIndex(undefined)
                  setDraft(null)
                }}
              >
                {t('channels.cancel')}
              </Button>
              <Button disabled={!String(draft.url ?? '').trim()} onClick={save}>
                {t('channels.components.save')}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  )
}

function IncludedFilesExplorer({
  manifest,
  entries,
  onChange,
}: {
  manifest: Record<string, unknown>
  entries: Map<string, Uint8Array>
  onChange: (entries: Map<string, Uint8Array>) => void
}) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [path, setPath] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const prefix = path ? `${path}/` : ''
  const childNames = [...entries.keys()]
    .filter((entry) => entry.startsWith(prefix))
    .map((entry) => entry.slice(prefix.length))
    .filter(Boolean)
  const folders = path
    ? [
        ...new Set(
          childNames
            .filter((name) => name.includes('/'))
            .map((name) => name.split('/')[0] ?? ''),
        ),
      ]
        .filter(Boolean)
        .sort()
    : ['files', 'MCPs']
  const files = path
    ? childNames.filter((name) => !name.includes('/')).sort()
    : []
  const segments = path.split('/').filter(Boolean)

  const addFiles = async (selected: FileList) => {
    const target = path || 'files'
    const next = new Map(entries)
    const collisions: string[] = []
    for (const file of selected) {
      const safeName = file.name.replaceAll('\\', '_').replaceAll('/', '_')
      const entryPath = `${target}/${safeName}`
      if (next.has(entryPath)) {
        collisions.push(safeName)
        continue
      }
      next.set(entryPath, new Uint8Array(await file.arrayBuffer()))
    }
    if (next.size !== entries.size) onChange(next)
    setMessage(
      collisions.length
        ? t('studio.includedFiles.duplicates', { files: collisions.join(', ') })
        : null,
    )
  }
  const download = (entryPath: string) => {
    const bytes = entries.get(entryPath)
    if (!bytes) return
    const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer]))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = entryPath.split('/').at(-1) ?? 'download'
    anchor.click()
    URL.revokeObjectURL(url)
  }
  const remove = (entryPath: string) => {
    if (manifestReferencesPath(manifest, entryPath)) {
      setMessage(t('studio.includedFiles.referenced', { path: entryPath }))
      return
    }
    const next = new Map(entries)
    next.delete(entryPath)
    onChange(next)
    setMessage(null)
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        multiple
        onChange={(event) => {
          if (event.target.files) void addFiles(event.target.files)
          event.currentTarget.value = ''
        }}
      />
      <div className="mx-auto grid max-w-5xl gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <nav
            className="flex min-h-10 min-w-0 flex-1 items-center gap-1 overflow-x-auto rounded-lg border bg-card px-3 text-sm shadow-xs"
            aria-label={t('studio.includedFiles.address')}
          >
            <button
              className="shrink-0 font-semibold text-primary"
              type="button"
              onClick={() => setPath('')}
            >
              {t('studio.includedFiles.root')}
            </button>
            {segments.map((segment, index) => (
              <span className="contents" key={`${segment}-${index}`}>
                <ChevronRight
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <button
                  className="shrink-0 hover:text-primary"
                  type="button"
                  onClick={() =>
                    setPath(segments.slice(0, index + 1).join('/'))
                  }
                >
                  {segment}
                </button>
              </span>
            ))}
          </nav>
          <Button variant="outline" onClick={() => inputRef.current?.click()}>
            <Plus className="size-4" aria-hidden />
            {t('studio.includedFiles.add')}
          </Button>
        </div>
        {message && (
          <p
            className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-foreground"
            role="alert"
          >
            {message}
          </p>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {folders.map((folder) => (
            <button
              key={folder}
              type="button"
              className="flex items-center gap-3 rounded-xl border bg-card p-4 text-left shadow-xs transition hover:border-primary/40 hover:bg-muted/30"
              onDoubleClick={() => setPath(path ? `${path}/${folder}` : folder)}
              onClick={() => setPath(path ? `${path}/${folder}` : folder)}
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <FolderOpen className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 truncate text-sm font-bold">
                {folder}
              </span>
            </button>
          ))}
          {files.map((fileName) => {
            const entryPath = `${path}/${fileName}`
            return (
              <article
                key={entryPath}
                className="flex min-w-0 items-center gap-3 rounded-xl border bg-card p-4 shadow-xs"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                  <File className="size-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-sm font-semibold"
                    title={fileName}
                  >
                    {fileName}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatBytes(entries.get(entryPath)?.byteLength ?? 0)}
                  </p>
                </div>
                <div className="flex shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t('studio.includedFiles.download', {
                      file: fileName,
                    })}
                    onClick={() => download(entryPath)}
                  >
                    <Download className="size-4" aria-hidden />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t('studio.includedFiles.remove', {
                      file: fileName,
                    })}
                    onClick={() => remove(entryPath)}
                  >
                    <Trash2 className="size-4 text-destructive" aria-hidden />
                  </Button>
                </div>
              </article>
            )
          })}
        </div>
        {folders.length === 0 && files.length === 0 && (
          <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            {t('studio.includedFiles.empty')}
          </p>
        )}
      </div>
    </div>
  )
}

function McpEntryEditor({
  path,
  bytes,
  view,
  theme,
  onChange,
}: {
  path: string
  bytes: Uint8Array
  view: SourceView
  theme: 'light' | 'dark'
  onChange: (contents: string) => void
}) {
  const { t } = useTranslation()
  const source = useMemo(() => new TextDecoder().decode(bytes), [bytes])
  const [sourceDraft, setSourceDraft] = useState(source)
  const [sourceError, setSourceError] = useState<string | null>(null)
  const [editorIndex, setEditorIndex] = useState<number | null | undefined>()
  const [functionDraft, setFunctionDraft] = useState<Record<
    string,
    unknown
  > | null>(null)
  useEffect(() => {
    setSourceDraft(source)
    setSourceError(null)
  }, [path, source])

  const parsed = useMemo(() => {
    try {
      const value = parseMcpxYaml(source)
      return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null
    } catch {
      return null
    }
  }, [source])
  const mcp =
    parsed?.mcp && typeof parsed.mcp === 'object' && !Array.isArray(parsed.mcp)
      ? (parsed.mcp as Record<string, unknown>)
      : null
  const functions = Array.isArray(mcp?.functions)
    ? (mcp.functions as Array<Record<string, unknown>>)
    : []
  const commitMcp = (nextMcp: Record<string, unknown>) =>
    onChange(
      stringifyAgentYaml({ format: 'mba-mcp', version: 1, mcp: nextMcp }),
    )

  if (view === 'json')
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1">
          <StudioCodeEditor
            language="yaml"
            path={`studio-${path}`}
            theme={theme}
            value={sourceDraft}
            onChange={(next) => {
              setSourceDraft(next)
              try {
                const value = parseMcpxYaml(next)
                if (!value || typeof value !== 'object' || Array.isArray(value))
                  throw new TypeError('MCPX must be an object')
                onChange(next)
                setSourceError(null)
              } catch {
                setSourceError(t('studio.mcps.invalidSource'))
              }
            }}
            ariaLabel={t('studio.mcps.sourceEditor')}
          />
        </div>
        {sourceError && (
          <p className="border-t px-4 py-2 text-xs text-danger" role="alert">
            {sourceError}
          </p>
        )}
      </div>
    )

  if (!parsed || !mcp)
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <p className="max-w-md text-sm text-danger">
          {t('studio.mcps.invalidSource')}
        </p>
      </div>
    )

  const openFunction = (index: number | null) => {
    setEditorIndex(index)
    setFunctionDraft(
      index === null
        ? newLocalMcpFunction(functions.length)
        : structuredClone(functions[index] ?? {}),
    )
  }
  const saveFunction = (candidate = functionDraft) => {
    if (!candidate || !validLocalMcpFunction(candidate)) return
    const normalized = normalizeLocalMcpFunction(candidate)
    commitMcp({
      ...mcp,
      functions:
        editorIndex === null
          ? [...functions, normalized]
          : functions.map((item, index) =>
              index === editorIndex ? normalized : item,
            ),
    })
    setEditorIndex(undefined)
    setFunctionDraft(null)
  }

  if (functionDraft)
    return (
      <div className="h-full overflow-y-auto p-6">
        <div className="mx-auto grid max-w-6xl gap-5">
          <header className="flex items-start gap-3">
            <Button
              size="icon"
              variant="ghost"
              aria-label={t('studio.mcps.backToFunctions')}
              onClick={() => {
                setEditorIndex(undefined)
                setFunctionDraft(null)
              }}
            >
              <ChevronLeft className="size-5" aria-hidden />
            </Button>
            <div>
              <p className="text-xs font-bold tracking-wider text-primary uppercase">
                {t('studio.mcps.functionEditor')}
              </p>
              <h2 className="mt-1 text-2xl font-extrabold tracking-tight">
                {String(functionDraft.name ?? '')}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('studio.mcps.functionDescription')}
              </p>
            </div>
          </header>
          <LocalMcpFunctionForm
            draft={functionDraft}
            isNew={editorIndex === null}
            theme={theme}
            onChange={setFunctionDraft}
            onCancel={() => {
              setEditorIndex(undefined)
              setFunctionDraft(null)
            }}
            onSave={saveFunction}
          />
        </div>
      </div>
    )

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto grid max-w-4xl gap-6">
        <section className="grid gap-4 rounded-xl border bg-card p-5">
          <Input
            label={t('studio.mcpFields.name')}
            maxLength={512}
            value={String(mcp.name ?? '')}
            onChange={(event) =>
              commitMcp({ ...mcp, name: event.target.value })
            }
          />
          <AutoGrowTextarea
            label={t('studio.mcpFields.description')}
            maxLength={2000}
            value={String(mcp.description ?? '')}
            onValueChange={(value) =>
              commitMcp({ ...mcp, description: value || null })
            }
          />
        </section>
        <section className="grid gap-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-bold">{t('studio.mcpFields.functions')}</h2>
              <p className="text-sm text-muted-foreground">
                {t('studio.mcps.functionCount', { count: functions.length })}
              </p>
            </div>
            <Button
              variant="outline"
              disabled={functions.length >= 1000}
              onClick={() => openFunction(null)}
            >
              <Plus className="size-4" aria-hidden />
              {t('studio.mcps.addFunction')}
            </Button>
          </div>
          {functions.length === 0 ? (
            <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              {t('studio.mcps.noFunctions')}
            </p>
          ) : (
            <ul className="grid gap-3">
              {functions.map((item, index) => (
                <li
                  key={`${String(item.name)}-${index}`}
                  className="flex items-start justify-between gap-4 rounded-xl border bg-card p-4"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">
                      {String(item.name ?? '')}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {String(item.description ?? '') ||
                        t('studio.mcps.noDescription')}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={t('studio.mcps.editFunction', {
                        name: String(item.name ?? ''),
                      })}
                      onClick={() => openFunction(index)}
                    >
                      <Pencil className="size-4" aria-hidden />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={functions.length <= 1}
                      aria-label={t('studio.mcps.removeFunction', {
                        name: String(item.name ?? ''),
                      })}
                      onClick={() =>
                        commitMcp({
                          ...mcp,
                          functions: functions.filter(
                            (_, itemIndex) => itemIndex !== index,
                          ),
                        })
                      }
                    >
                      <Trash2 className="size-4 text-destructive" aria-hidden />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

function LocalMcpFunctionForm({
  draft,
  isNew,
  theme,
  onChange,
  onCancel,
  onSave,
}: {
  draft: Record<string, unknown>
  isNew: boolean
  theme: 'light' | 'dark'
  onChange: (draft: Record<string, unknown>) => void
  onCancel: () => void
  onSave: (draft: Record<string, unknown>) => void
}) {
  const { t } = useTranslation()
  const revisions = Array.isArray(draft.revisions)
    ? (draft.revisions as Array<Record<string, unknown>>)
    : []
  const [selectedRevision, setSelectedRevision] = useState(
    Math.max(0, revisions.length - 1),
  )
  const [showParameters, setShowParameters] = useState(false)
  const [maximized, setMaximized] = useState(false)
  const revision = revisions[selectedRevision] ?? revisions.at(-1)
  const [code, setCode] = useState(String(revision?.code ?? ''))
  const [parameters, setParameters] = useState<Array<Record<string, unknown>>>(
    Array.isArray(revision?.parameters)
      ? structuredClone(revision.parameters as Array<Record<string, unknown>>)
      : [],
  )
  const update = (field: string, value: unknown) =>
    onChange({ ...draft, [field]: value })
  const selectRevision = (index: number) => {
    const selected = revisions[index]
    if (!selected) return
    setSelectedRevision(index)
    setCode(String(selected.code ?? ''))
    setParameters(
      Array.isArray(selected.parameters)
        ? structuredClone(selected.parameters as Array<Record<string, unknown>>)
        : [],
    )
  }
  const updateParameter = (
    parameterIndex: number,
    fields: Record<string, unknown>,
  ) =>
    setParameters(
      parameters.map((parameter, index) =>
        index === parameterIndex ? { ...parameter, ...fields } : parameter,
      ),
    )

  const saveAsRevision = () => {
    const nextRevision = {
      revision: isNew ? 1 : revisions.length + 1,
      code,
      parameters,
      createdAt: new Date().toISOString(),
    }
    const nextDraft = {
      ...draft,
      currentRevision: isNew ? 1 : revisions.length + 1,
      revisions: isNew ? [nextRevision] : [...revisions, nextRevision],
    }
    if (validLocalMcpFunction(nextDraft)) onSave(nextDraft)
  }

  return (
    <>
      <section
        className={cn(
          'overflow-hidden rounded-xl border bg-card',
          maximized && 'fixed inset-0 z-50 rounded-none bg-background p-4',
        )}
      >
        <div
          className={cn(
            'grid min-h-120 lg:grid-cols-[14rem_minmax(0,1fr)]',
            maximized && 'h-full min-h-0',
          )}
        >
          <aside className="border-b bg-muted/30 p-4 lg:border-r lg:border-b-0">
            <p className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
              {t('studio.mcpFunctionFields.revisions')}
            </p>
            <div className="mt-3 grid max-h-96 gap-2 overflow-y-auto">
              {revisions.map((item, index) => (
                <button
                  key={index}
                  type="button"
                  className={cn(
                    'rounded-lg border px-3 py-2 text-left text-sm transition',
                    selectedRevision === index
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'bg-card hover:bg-muted',
                  )}
                  onClick={() => selectRevision(index)}
                >
                  <span className="font-bold">v{index + 1}</span>
                  {index === revisions.length - 1 && (
                    <span className="ml-2 text-xs">
                      {t('studio.mcpFunctionFields.current')}
                    </span>
                  )}
                  <span className="mt-1 block truncate text-xs text-muted-foreground">
                    {String(item.createdAt ?? '')}
                  </span>
                </button>
              ))}
            </div>
          </aside>
          {revision && (
            <div
              className={cn(
                'min-w-0 p-4',
                maximized && 'flex min-h-0 flex-col',
              )}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label={t('studio.mcpFunctionFields.name')}
                  maxLength={512}
                  value={String(draft.name ?? '')}
                  onChange={(event) => update('name', event.target.value)}
                />
                <Input
                  label={t('studio.mcpFunctionFields.description')}
                  maxLength={2000}
                  value={String(draft.description ?? '')}
                  onChange={(event) =>
                    update('description', event.target.value || null)
                  }
                />
              </div>
              <div
                className={cn(
                  'relative mt-4 h-105 overflow-hidden rounded-lg border',
                  maximized && 'min-h-0 flex-1',
                )}
              >
                <Button
                  className="absolute top-2 right-2 z-10 bg-card/90 shadow-sm backdrop-blur"
                  size="icon"
                  variant="outline"
                  aria-label={t(
                    maximized
                      ? 'studio.mcpFunctionFields.restoreEditor'
                      : 'studio.mcpFunctionFields.maximizeEditor',
                  )}
                  onClick={() => setMaximized((value) => !value)}
                >
                  {maximized ? (
                    <Minimize2 className="size-4" aria-hidden />
                  ) : (
                    <Maximize2 className="size-4" aria-hidden />
                  )}
                </Button>
                <StudioCodeEditor
                  language="javascript"
                  path={`local-mcp-${String(draft.name)}-${selectedRevision}.js`}
                  theme={theme}
                  value={code}
                  onChange={setCode}
                  ariaLabel={t('studio.mcpFunctionFields.code')}
                />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowParameters(true)}
                >
                  <Settings2 className="size-4" aria-hidden />
                  {t('studio.mcpFunctionFields.parameters')}
                </Button>
                <Button
                  disabled={!code.trim() || revisions.length >= 1000}
                  onClick={saveAsRevision}
                >
                  <Save className="size-4" aria-hidden />
                  {t('studio.mcpFunctionFields.saveRevision')}
                </Button>
                <Button
                  className="ml-auto"
                  variant="outline"
                  onClick={onCancel}
                >
                  {t('common.cancel')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>
      <Dialog
        open={showParameters}
        onOpenChange={setShowParameters}
        size="xl"
        title={t('studio.mcpFunctionFields.parameters')}
        description={t('studio.mcpFunctionFields.parametersDescription')}
      >
        <div className="grid w-full gap-4">
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="outline"
              disabled={parameters.length >= 100}
              onClick={() =>
                setParameters([
                  ...parameters,
                  {
                    name: `parameter${parameters.length + 1}`,
                    type: 'string',
                    required: true,
                    description: null,
                  },
                ])
              }
            >
              <Plus className="size-4" aria-hidden />
              {t('studio.mcpFunctionFields.addParameter')}
            </Button>
          </div>
          <div className="grid max-h-[60vh] gap-3 overflow-y-auto pr-1">
            {parameters.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('studio.mcpFunctionFields.noParameters')}
              </p>
            ) : (
              parameters.map((parameter, index) => (
                <div
                  key={index}
                  className="grid gap-3 rounded-lg border p-3 md:grid-cols-[1fr_10rem_1fr_auto_auto] md:items-end"
                >
                  <Input
                    label={t('studio.mcpFunctionFields.parameterName')}
                    maxLength={100}
                    value={String(parameter.name ?? '')}
                    onChange={(event) =>
                      updateParameter(index, { name: event.target.value })
                    }
                  />
                  <Select
                    label={t('studio.mcpFunctionFields.parameterType')}
                    value={String(parameter.type ?? 'string')}
                    onChange={(event) =>
                      updateParameter(index, { type: event.target.value })
                    }
                  >
                    {['string', 'number', 'integer', 'boolean', 'json'].map(
                      (type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ),
                    )}
                  </Select>
                  <Input
                    label={t('studio.mcpFunctionFields.parameterDescription')}
                    maxLength={500}
                    value={String(parameter.description ?? '')}
                    onChange={(event) =>
                      updateParameter(index, {
                        description: event.target.value || null,
                      })
                    }
                  />
                  <Checkbox
                    className="mb-4"
                    label={t('studio.mcpFunctionFields.required')}
                    checked={parameter.required !== false}
                    onChange={(event) =>
                      updateParameter(index, {
                        required: event.target.checked,
                      })
                    }
                  />
                  <Button
                    className="mb-3"
                    size="icon"
                    variant="ghost"
                    aria-label={t('studio.mcpFunctionFields.removeParameter', {
                      name: String(parameter.name ?? index + 1),
                    })}
                    onClick={() =>
                      setParameters(
                        parameters.filter(
                          (_, parameterIndex) => parameterIndex !== index,
                        ),
                      )
                    }
                  >
                    <Trash2 className="size-4 text-destructive" aria-hidden />
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      </Dialog>
    </>
  )
}

function newLocalMcpFunction(index: number): Record<string, unknown> {
  return {
    name: `new_function_${index + 1}`,
    description: null,
    currentRevision: 1,
    revisions: [newLocalMcpRevision(1)],
  }
}
function newLocalMcpRevision(revision: number): Record<string, unknown> {
  return {
    revision,
    code: '/** @param {Record<string, unknown>} parameters */\nasync (parameters) => {\n  return { ok: true }\n}',
    parameters: [],
    createdAt: new Date().toISOString(),
  }
}
function normalizeLocalMcpFunction(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const revisions = (value.revisions as Array<Record<string, unknown>>).map(
    (revision, index) => ({ ...revision, revision: index + 1 }),
  )
  return { ...value, currentRevision: revisions.length, revisions }
}
function validLocalMcpFunction(value: Record<string, unknown>): boolean {
  if (!/^[a-z0-9]+(?:_{1,2}[a-z0-9]+)*$/.test(String(value.name ?? '')))
    return false
  const revisions = Array.isArray(value.revisions)
    ? (value.revisions as Array<Record<string, unknown>>)
    : []
  if (!revisions.length) return false
  return revisions.every((revision) => {
    if (!String(revision.code ?? '').trim()) return false
    if (Number.isNaN(Date.parse(String(revision.createdAt ?? '')))) return false
    const parameters = Array.isArray(revision.parameters)
      ? (revision.parameters as Array<Record<string, unknown>>)
      : []
    const names = parameters.map((parameter) => String(parameter.name ?? ''))
    return (
      new Set(names).size === names.length &&
      parameters.every(
        (parameter) =>
          /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(String(parameter.name ?? '')) &&
          ['boolean', 'integer', 'json', 'number', 'string'].includes(
            String(parameter.type ?? ''),
          ),
      )
    )
  })
}

function McpsForm({
  manifest,
  entries,
  onChange,
  onEdit,
}: {
  manifest: Record<string, unknown>
  entries: Map<string, Uint8Array>
  onChange: (entries: Map<string, Uint8Array>) => void
  onEdit: (path: string) => void
}) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const paths = mcpEntryPaths(entries)
  const [message, setMessage] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const normalizedName = newName.trim()
  const validName = /^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(normalizedName)
  const newPath = `MCPs/${normalizedName}.mcpx`
  const duplicateName = entries.has(newPath)

  const addEmpty = () => {
    if (!validName || duplicateName) return
    const name = normalizedName
    const path = `MCPs/${name}.mcpx`
    const contents = stringifyAgentYaml({
      format: 'mba-mcp',
      version: 1,
      mcp: { name, description: null, functions: [] },
    })
    const next = new Map(entries)
    next.set(path, new TextEncoder().encode(contents))
    onChange(next)
    setMessage(null)
    setCreateOpen(false)
    setNewName('')
  }

  const remove = (path: string) => {
    if (connectorUsesMcp(manifest, path)) return
    const next = new Map(entries)
    next.delete(path)
    onChange(next)
    setMessage(null)
  }

  const addFiles = async (files: FileList) => {
    const next = new Map(entries)
    const duplicates: string[] = []
    for (const file of files) {
      const fileName = file.name.replaceAll('\\', '_').replaceAll('/', '_')
      const path = `MCPs/${fileName}`
      if (next.has(path)) {
        duplicates.push(fileName)
        continue
      }
      next.set(path, new Uint8Array(await file.arrayBuffer()))
    }
    if (next.size !== entries.size) onChange(next)
    setMessage(
      duplicates.length
        ? t('studio.mcps.duplicates', { files: duplicates.join(', ') })
        : null,
    )
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept=".mcpx,application/yaml,text/yaml,text/plain"
        multiple
        onChange={(event) => {
          if (event.target.files) void addFiles(event.target.files)
          event.currentTarget.value = ''
        }}
      />
      <div className="mx-auto grid max-w-3xl gap-4">
        {message && (
          <p
            className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm"
            role="alert"
          >
            {message}
          </p>
        )}
        {paths.length === 0 ? (
          <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            {t('studio.mcps.empty')}
          </p>
        ) : (
          <ul className="grid gap-3">
            {paths.map((path) => (
              <li
                key={path}
                className="flex items-center justify-between gap-4 rounded-xl border bg-card p-4"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <FileArchive
                    className="size-5 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  <span className="truncate text-sm font-semibold">
                    {mcpEntryName(path)}
                  </span>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t('studio.mcps.edit', {
                      name: mcpEntryName(path),
                    })}
                    onClick={() => onEdit(path)}
                  >
                    <Pencil className="size-4" aria-hidden />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={connectorUsesMcp(manifest, path)}
                    title={
                      connectorUsesMcp(manifest, path)
                        ? t('studio.mcps.inUse')
                        : undefined
                    }
                    aria-label={t('studio.mcps.remove', {
                      name: mcpEntryName(path),
                    })}
                    onClick={() => remove(path)}
                  >
                    <Trash2 className="size-4 text-destructive" aria-hidden />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Button
            className="w-full"
            variant="outline"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="size-4" aria-hidden />
            {t('studio.mcps.add')}
          </Button>
          <Button
            className="w-full"
            variant="outline"
            onClick={() => inputRef.current?.click()}
          >
            <FolderOpen className="size-4" aria-hidden />
            {t('studio.mcps.load')}
          </Button>
        </div>
      </div>
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open)
          if (!open) setNewName('')
        }}
        title={t('studio.mcps.createTitle')}
        description={t('studio.mcps.createDescription')}
        size="md"
      >
        <div className="grid gap-4">
          <Input
            label={t('studio.mcps.name')}
            value={newName}
            maxLength={512}
            autoFocus
            onChange={(event) => setNewName(event.target.value)}
          />
          {newName && !validName && (
            <p className="text-sm text-danger" role="alert">
              {t('studio.mcps.invalidName')}
            </p>
          )}
          {duplicateName && (
            <p className="text-sm text-danger" role="alert">
              {t('studio.mcps.duplicateName')}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button disabled={!validName || duplicateName} onClick={addEmpty}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}

function KnowledgeFilesForm({
  manifest,
  entries,
  onChange,
}: {
  manifest: Record<string, unknown>
  entries: Map<string, Uint8Array>
  onChange: (
    files: Array<Record<string, unknown>>,
    entries: Map<string, Uint8Array>,
  ) => void
}) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const value = sectionValue(manifest, 'files')
  const files = Array.isArray(value)
    ? (value as Array<Record<string, unknown>>)
    : []

  const add = async (selected: FileList) => {
    const nextEntries = new Map(entries)
    const additions: Array<Record<string, unknown>> = []
    for (const file of selected) {
      const safeName = file.name.replaceAll('\\', '_').replaceAll('/', '_')
      const path = `files/${crypto.randomUUID()}-${safeName}`
      nextEntries.set(path, new Uint8Array(await file.arrayBuffer()))
      additions.push({
        providerFileId: `temp-${crypto.randomUUID()}`,
        fileName: file.name,
        path,
        included: true,
      })
    }
    if (additions.length) onChange([...files, ...additions], nextEntries)
  }
  const update = (index: number, fieldValue: string) =>
    onChange(
      files.map((file, fileIndex) =>
        fileIndex === index ? { ...file, fileName: fieldValue } : file,
      ),
      entries,
    )
  const remove = (index: number) => {
    const file = files[index]
    const nextEntries = new Map(entries)
    if (typeof file?.path === 'string') nextEntries.delete(file.path)
    onChange(
      files.filter((_, fileIndex) => fileIndex !== index),
      nextEntries,
    )
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        multiple
        onChange={(event) => {
          if (event.target.files) void add(event.target.files)
          event.currentTarget.value = ''
        }}
      />
      <div className="mx-auto grid max-w-3xl gap-4">
        {files.length === 0 ? (
          <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            {t('studio.knowledgeFiles.empty')}
          </p>
        ) : (
          <div className="grid gap-3">
            {files.map((file, index) => {
              const included =
                typeof file.path === 'string' && entries.has(file.path)
              return (
                <article
                  key={`${String(file.providerFileId)}-${index}`}
                  className="grid gap-3 rounded-xl border bg-card p-4"
                >
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                      <File className="size-5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">
                        {String(file.fileName ?? '')}
                      </p>
                      <p
                        className={cn(
                          'mt-1 text-xs font-semibold',
                          included ? 'text-success' : 'text-warning',
                        )}
                      >
                        {t(
                          included
                            ? 'studio.knowledgeFiles.included'
                            : 'studio.knowledgeFiles.missing',
                        )}
                      </p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={t('studio.knowledgeFiles.remove', {
                        file: String(file.fileName ?? ''),
                      })}
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="size-4 text-destructive" aria-hidden />
                    </Button>
                  </div>
                  <Input
                    label={t('studio.knowledgeFiles.fileName')}
                    maxLength={500}
                    value={String(file.fileName ?? '')}
                    onChange={(event) => update(index, event.target.value)}
                  />
                  {typeof file.path === 'string' && (
                    <p
                      className="truncate rounded-lg bg-muted/40 px-3 py-2 font-mono text-xs text-muted-foreground"
                      title={file.path}
                    >
                      {file.path}
                    </p>
                  )}
                </article>
              )
            })}
          </div>
        )}
        <Button
          className="w-full"
          variant="outline"
          disabled={files.length >= 1000}
          onClick={() => inputRef.current?.click()}
        >
          <Plus className="size-4" aria-hidden />
          {t('studio.knowledgeFiles.add')}
        </Button>
      </div>
    </div>
  )
}

function QrCodesForm({
  manifest,
  onChange,
}: {
  manifest: Record<string, unknown>
  onChange: (qrCodes: Array<Record<string, unknown>>) => void
}) {
  const { t } = useTranslation()
  const value = sectionValue(manifest, 'qrCodes')
  const qrCodes = Array.isArray(value)
    ? (value as Array<Record<string, unknown>>)
    : []
  const [editorIndex, setEditorIndex] = useState<number | null | undefined>(
    undefined,
  )
  const [message, setMessage] = useState('')
  const open = (index: number | null) => {
    setEditorIndex(index)
    setMessage(
      index === null ? '' : String(qrCodes[index]?.prefilledMessage ?? ''),
    )
  }
  const close = () => {
    setEditorIndex(undefined)
    setMessage('')
  }
  const save = () => {
    const prefilledMessage = message.trim()
    if (!prefilledMessage) return
    const entry = { prefilledMessage }
    onChange(
      editorIndex === null
        ? [...qrCodes, entry]
        : qrCodes.map((qrCode, index) =>
            index === editorIndex ? entry : qrCode,
          ),
    )
    close()
  }

  return (
    <>
      <div className="h-full overflow-y-auto p-6">
        <div className="mx-auto grid max-w-3xl gap-4">
          {qrCodes.length === 0 ? (
            <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              {t('studio.qrCodes.empty')}
            </p>
          ) : (
            <ul className="grid gap-3">
              {qrCodes.map((qrCode, index) => {
                const prefilledMessage = String(qrCode.prefilledMessage ?? '')
                return (
                  <li
                    key={`${prefilledMessage}-${index}`}
                    className="flex items-start justify-between gap-4 rounded-xl border bg-card p-4"
                  >
                    <p className="min-w-0 whitespace-pre-wrap text-sm">
                      {prefilledMessage}
                    </p>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={t('studio.qrCodes.edit', {
                          number: index + 1,
                        })}
                        onClick={() => open(index)}
                      >
                        <Pencil className="size-4" aria-hidden />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={t('studio.qrCodes.remove', {
                          number: index + 1,
                        })}
                        onClick={() =>
                          onChange(
                            qrCodes.filter(
                              (_, qrCodeIndex) => qrCodeIndex !== index,
                            ),
                          )
                        }
                      >
                        <Trash2
                          className="size-4 text-destructive"
                          aria-hidden
                        />
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          <Button
            className="w-full"
            variant="outline"
            disabled={qrCodes.length >= 100}
            onClick={() => open(null)}
          >
            <Plus className="size-4" aria-hidden />
            {t('studio.qrCodes.add')}
          </Button>
        </div>
      </div>
      <Dialog
        open={editorIndex !== undefined}
        onOpenChange={(isOpen) => {
          if (!isOpen) close()
        }}
        title={t(
          editorIndex === null
            ? 'studio.qrCodes.create'
            : 'studio.qrCodes.editTitle',
        )}
        description={t('studio.qrCodes.description')}
        size="lg"
      >
        <div className="grid w-full gap-4">
          <AutoGrowTextarea
            label={t('studio.qrCodeFields.prefilledMessage')}
            maxLength={1024}
            value={message}
            onValueChange={setMessage}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button disabled={!message.trim()} onClick={save}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  )
}

function ConnectorsForm({
  manifest,
  entries,
  onChange,
}: {
  manifest: Record<string, unknown>
  entries: Map<string, Uint8Array>
  onChange: (connectors: Array<Record<string, unknown>>) => void
}) {
  const { t } = useTranslation()
  const value = sectionValue(manifest, 'connectors')
  const connectors = Array.isArray(value)
    ? (value as Array<Record<string, unknown>>)
    : []
  const mcpFiles = [...entries.keys()]
    .filter(
      (path) =>
        path.startsWith('MCPs/') && path.toLowerCase().endsWith('.mcpx'),
    )
    .sort()
  const [editorIndex, setEditorIndex] = useState<number | null | undefined>(
    undefined,
  )
  const [draft, setDraft] = useState<Record<string, unknown> | null>(null)
  const update = (field: string, fieldValue: unknown) =>
    setDraft((current) =>
      current ? { ...current, [field]: fieldValue } : current,
    )
  const open = (index: number | null) => {
    setEditorIndex(index)
    setDraft(
      index === null
        ? {
            id: crypto.randomUUID(),
            name: `new_connector_${connectors.length + 1}`,
            description: '',
            baseUrl: 'https://example.com',
            connectorProtocol: 'HTTP',
            authType: 'NONE',
            requiresCertificate: false,
            userAuthInjectionConfig: null,
            tools: [],
          }
        : structuredClone(connectors[index] ?? {}),
    )
  }
  const save = () => {
    if (
      !draft ||
      !String(draft.name ?? '').trim() ||
      !String(draft.description ?? '').trim() ||
      !String(draft.baseUrl ?? '').trim()
    )
      return
    onChange(
      editorIndex === null
        ? [...connectors, draft]
        : connectors.map((connector, index) =>
            index === editorIndex ? draft : connector,
          ),
    )
    setEditorIndex(undefined)
    setDraft(null)
  }
  const protocol = String(draft?.connectorProtocol ?? 'HTTP')
  const tools = Array.isArray(draft?.tools)
    ? (draft.tools as Array<Record<string, unknown>>)
    : []
  const updateTool = (index: number, tool: Record<string, unknown>) =>
    update(
      'tools',
      tools.map((item, toolIndex) => (toolIndex === index ? tool : item)),
    )
  const localMcp =
    draft?.localMcp && typeof draft.localMcp === 'object'
      ? (draft.localMcp as Record<string, unknown>)
      : null
  const injection =
    draft?.userAuthInjectionConfig &&
    typeof draft.userAuthInjectionConfig === 'object'
      ? (draft.userAuthInjectionConfig as Record<string, unknown>)
      : null
  return (
    <>
      <div className="h-full overflow-y-auto p-6">
        <div className="mx-auto grid max-w-3xl gap-4">
          {connectors.length === 0 ? (
            <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              {t('studio.connectors.empty')}
            </p>
          ) : (
            <ul className="grid gap-3">
              {connectors.map((connector, index) => (
                <li
                  key={`${String(connector.id)}-${index}`}
                  className="flex items-start justify-between gap-4 rounded-xl border bg-card p-4"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">
                      {String(connector.name ?? '')}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {String(connector.connectorProtocol ?? '')}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {String(connector.description ?? '')}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={t('studio.connectors.edit', {
                        name: String(connector.name ?? ''),
                      })}
                      onClick={() => open(index)}
                    >
                      <Pencil className="size-4" aria-hidden />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={t('studio.connectors.remove', {
                        name: String(connector.name ?? ''),
                      })}
                      onClick={() =>
                        onChange(
                          connectors.filter(
                            (_, connectorIndex) => connectorIndex !== index,
                          ),
                        )
                      }
                    >
                      <Trash2 className="size-4 text-destructive" aria-hidden />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Button
            className="w-full"
            variant="outline"
            disabled={connectors.length >= 1000}
            onClick={() => open(null)}
          >
            <Plus className="size-4" aria-hidden />
            {t('studio.connectors.add')}
          </Button>
        </div>
      </div>
      <Dialog
        open={editorIndex !== undefined}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setEditorIndex(undefined)
            setDraft(null)
          }
        }}
        title={t(
          editorIndex === null
            ? 'studio.connectors.create'
            : 'studio.connectors.editTitle',
        )}
        description={t('studio.connectors.description')}
        size="xl"
      >
        {draft && (
          <div className="grid w-full gap-5">
            <Input
              label={t('studio.connectorFields.id')}
              value={String(draft.id ?? '')}
              onChange={(event) => update('id', event.target.value)}
            />
            <Input
              label={t('studio.connectorFields.name')}
              maxLength={64}
              value={String(draft.name ?? '')}
              onChange={(event) => update('name', event.target.value)}
            />
            <AutoGrowTextarea
              label={t('studio.connectorFields.description')}
              value={String(draft.description ?? '')}
              onValueChange={(fieldValue) => update('description', fieldValue)}
            />
            <Input
              label={t('studio.connectorFields.baseUrl')}
              type="url"
              value={String(draft.baseUrl ?? '')}
              onChange={(event) => update('baseUrl', event.target.value)}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label={t('studio.connectorFields.protocol')}
                value={protocol}
                onChange={(event) =>
                  update('connectorProtocol', event.target.value)
                }
              >
                <option value="HTTP">HTTP</option>
                <option value="MCP">MCP</option>
              </Select>
              <Select
                label={t('studio.connectorFields.authType')}
                value={String(draft.authType ?? 'NONE')}
                onChange={(event) => update('authType', event.target.value)}
              >
                <option value="NONE">
                  {t('studio.connectorOptions.none')}
                </option>
                <option value="API_KEY">API key</option>
                <option value="OAUTH2_CLIENT_CREDENTIALS">
                  OAuth 2 client credentials
                </option>
              </Select>
            </div>
            <div
              className="flex gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm"
              role="note"
            >
              <AlertTriangle
                className="mt-0.5 size-4 shrink-0 text-warning"
                aria-hidden
              />
              <p>{t('studio.connectors.importWarning')}</p>
            </div>
            <div className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2">
              <Switch
                label={t('studio.connectorFields.requiresCertificate')}
                checked={Boolean(draft.requiresCertificate)}
                onChange={(event) =>
                  update('requiresCertificate', event.target.checked)
                }
              />
            </div>
            <div className="grid gap-4 rounded-xl border bg-card p-4">
              <Switch
                label={t('studio.connectorFields.userAuthInjection')}
                checked={injection !== null}
                onChange={(event) =>
                  update(
                    'userAuthInjectionConfig',
                    event.target.checked
                      ? {
                          location: 'headers',
                          fieldName: 'Authorization',
                          prefix: 'Bearer ',
                        }
                      : null,
                  )
                }
              />
              {injection && (
                <>
                  <Select
                    label={t('studio.connectorFields.location')}
                    value={String(injection.location ?? 'headers')}
                    onChange={(event) =>
                      update('userAuthInjectionConfig', {
                        ...injection,
                        location: event.target.value,
                      })
                    }
                  >
                    <option value="body">Body</option>
                    <option value="headers">Headers</option>
                    <option value="path">Path</option>
                    <option value="query">Query</option>
                  </Select>
                  <Input
                    label={t('studio.connectorFields.fieldName')}
                    value={String(injection.fieldName ?? '')}
                    onChange={(event) =>
                      update('userAuthInjectionConfig', {
                        ...injection,
                        fieldName: event.target.value,
                      })
                    }
                  />
                  <Input
                    label={t('studio.connectorFields.prefix')}
                    value={String(injection.prefix ?? '')}
                    onChange={(event) =>
                      update('userAuthInjectionConfig', {
                        ...injection,
                        prefix: event.target.value,
                      })
                    }
                  />
                </>
              )}
            </div>
            {protocol === 'MCP' && (
              <div className="grid gap-4 rounded-xl border bg-card p-4">
                <Switch
                  label={t('studio.connectorFields.localMcp')}
                  description={t('studio.connectorFields.localMcpDescription')}
                  checked={localMcp !== null}
                  onChange={(event) => {
                    const path = mcpFiles[0] ?? ''
                    update(
                      'localMcp',
                      event.target.checked
                        ? {
                            name:
                              path
                                .split('/')
                                .at(-1)
                                ?.replace(/\.mcpx$/i, '') ??
                              String(draft.name ?? ''),
                            path,
                          }
                        : null,
                    )
                  }}
                />
                {localMcp && (
                  <>
                    <Select
                      label={t('studio.connectorFields.mcpFile')}
                      value={String(localMcp.path ?? '')}
                      onChange={(event) =>
                        update('localMcp', {
                          ...localMcp,
                          path: event.target.value,
                          name:
                            event.target.value
                              .split('/')
                              .at(-1)
                              ?.replace(/\.mcpx$/i, '') ?? '',
                        })
                      }
                    >
                      <option value="">
                        {t('studio.connectorOptions.selectMcp')}
                      </option>
                      {mcpFiles.map((file) => (
                        <option key={file} value={file}>
                          {file}
                        </option>
                      ))}
                    </Select>
                    <Input
                      label={t('studio.connectorFields.localMcpName')}
                      maxLength={64}
                      value={String(localMcp.name ?? '')}
                      onChange={(event) =>
                        update('localMcp', {
                          ...localMcp,
                          name: event.target.value,
                        })
                      }
                    />
                    {mcpFiles.length === 0 && (
                      <p className="text-sm text-warning">
                        {t('studio.connectorOptions.noMcpFiles')}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
            {protocol === 'HTTP' && (
              <div className="grid gap-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold">
                    {t('studio.connectorFields.tools')}
                  </h3>
                  <Button
                    variant="outline"
                    disabled={tools.length >= 500}
                    onClick={() =>
                      update('tools', [
                        ...tools,
                        newConnectorTool(tools.length),
                      ])
                    }
                  >
                    <Plus className="size-4" />
                    {t('studio.connectorFields.addTool')}
                  </Button>
                </div>
                {tools.map((tool, index) => (
                  <ConnectorToolForm
                    key={`${String(tool.id)}-${index}`}
                    index={index}
                    tool={tool}
                    onChange={(next) => updateTool(index, next)}
                    onRemove={() =>
                      update(
                        'tools',
                        tools.filter((_, toolIndex) => toolIndex !== index),
                      )
                    }
                  />
                ))}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setEditorIndex(undefined)
                  setDraft(null)
                }}
              >
                {t('channels.cancel')}
              </Button>
              <Button
                disabled={
                  !String(draft.name ?? '').trim() ||
                  !String(draft.description ?? '').trim() ||
                  !String(draft.baseUrl ?? '').trim() ||
                  Boolean(localMcp && !localMcp.path)
                }
                onClick={save}
              >
                {t('channels.components.save')}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  )
}

function ConnectorToolForm({
  index,
  tool,
  onChange,
  onRemove,
}: {
  index: number
  tool: Record<string, unknown>
  onChange: (tool: Record<string, unknown>) => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const update = (field: string, value: unknown) =>
    onChange({ ...tool, [field]: value })
  return (
    <section className="grid gap-4 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold">
          {t('studio.connectorFields.toolNumber', { number: index + 1 })}
        </h4>
        <Button
          size="icon"
          variant="ghost"
          aria-label={t('studio.connectorFields.removeTool')}
          onClick={onRemove}
        >
          <Trash2 className="size-4 text-destructive" />
        </Button>
      </div>
      <Input
        label={t('studio.connectorFields.toolId')}
        value={String(tool.id ?? '')}
        onChange={(event) => update('id', event.target.value)}
      />
      <Input
        label={t('studio.connectorFields.toolName')}
        maxLength={64}
        value={String(tool.name ?? '')}
        onChange={(event) => update('name', event.target.value)}
      />
      <AutoGrowTextarea
        label={t('studio.connectorFields.toolDescription')}
        value={String(tool.description ?? '')}
        onValueChange={(value) => update('description', value)}
      />
      <Switch
        label={t('studio.connectorFields.userAuthRequired')}
        checked={Boolean(tool.userAuthRequired)}
        onChange={(event) => update('userAuthRequired', event.target.checked)}
      />
      <JsonValueEditor
        label={t('studio.connectorFields.requestDefinition')}
        value={tool.requestDefinition}
        onChange={(value) => update('requestDefinition', value)}
      />
      <JsonValueEditor
        label={t('studio.connectorFields.userAuthActionConfig')}
        value={tool.userAuthActionConfig ?? null}
        onChange={(value) => update('userAuthActionConfig', value)}
      />
      <JsonValueEditor
        label={t('studio.connectorFields.transformationSpec')}
        value={tool.transformationSpec}
        onChange={(value) => update('transformationSpec', value)}
      />
    </section>
  )
}

function JsonValueEditor({
  label,
  value,
  onChange,
}: {
  label: string
  value: unknown
  onChange: (value: unknown) => void
}) {
  const { t } = useTranslation()
  const [text, setText] = useState(() => JSON.stringify(value, null, 2))
  const [invalid, setInvalid] = useState(false)
  useEffect(() => setText(JSON.stringify(value, null, 2)), [value])
  return (
    <Textarea
      className="min-h-40 font-mono text-xs"
      label={label}
      error={invalid ? t('studio.invalidJson') : undefined}
      value={text}
      onChange={(event) => {
        const next = event.target.value
        setText(next)
        try {
          onChange(JSON.parse(next))
          setInvalid(false)
        } catch {
          setInvalid(true)
        }
      }}
    />
  )
}

function newConnectorTool(index: number): Record<string, unknown> {
  return {
    id: crypto.randomUUID(),
    name: `new_tool_${index + 1}`,
    description: '',
    requestDefinition: {
      method: 'GET',
      path: '/',
      pathParameters: {},
      queryParameters: {},
      headers: {},
      body: null,
    },
    userAuthRequired: false,
    userAuthActionConfig: null,
    transformationSpec: { version: 1, steps: [] },
  }
}

function manifestReferencesPath(value: unknown, path: string): boolean {
  if (value === path) return true
  if (Array.isArray(value))
    return value.some((item) => manifestReferencesPath(item, path))
  if (value && typeof value === 'object')
    return Object.values(value).some((item) =>
      manifestReferencesPath(item, path),
    )
  return false
}

function connectorUsesMcp(
  manifest: Record<string, unknown>,
  path: string,
): boolean {
  const connectors = sectionValue(manifest, 'connectors')
  if (!Array.isArray(connectors)) return false
  return connectors.some((connector) => {
    if (!connector || typeof connector !== 'object' || Array.isArray(connector))
      return false
    const localMcp = (connector as Record<string, unknown>).localMcp
    return (
      Boolean(localMcp) &&
      typeof localMcp === 'object' &&
      !Array.isArray(localMcp) &&
      (localMcp as Record<string, unknown>).path === path
    )
  })
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function syncKnowledgeFiles(
  document: StudioDocument,
  files: Array<Record<string, unknown>>,
  entries: Map<string, Uint8Array>,
): StudioDocument {
  const normalized = files.map((file) => {
    const path =
      typeof file.path === 'string' && entries.has(file.path) ? file.path : null
    return { ...file, path, included: path !== null }
  })
  const included = normalized.filter((file) => file.included).length
  const missing = normalized.length - included
  const withFiles = replaceSection(document.manifest, 'files', normalized)
  const security = (withFiles.security ?? {}) as Record<string, unknown>
  const importRequirements = (withFiles.importRequirements ?? {}) as Record<
    string,
    unknown
  >
  return {
    ...document,
    entries,
    manifest: {
      ...withFiles,
      security: {
        ...security,
        knowledgeFiles: { total: normalized.length, included, missing },
      },
      importRequirements: {
        ...importRequirements,
        requestMissingKnowledgeFiles: missing > 0,
      },
    },
  }
}

function Count({ value }: { value: unknown }) {
  if (!Array.isArray(value)) return null
  return (
    <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px]">
      {value.length}
    </span>
  )
}
function DetailButton({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-md py-1.5 pr-2 pl-8 text-left text-[11px]',
        active
          ? 'bg-primary/12 text-primary'
          : 'text-muted-foreground hover:bg-muted',
      )}
    >
      <FileCode2 className="size-3 shrink-0" />
      <span className="min-w-0 truncate">{label}</span>
    </button>
  )
}

function agent(manifest: Record<string, unknown>) {
  return manifest.agent as Record<string, unknown>
}
function knowledge(manifest: Record<string, unknown>) {
  return agent(manifest).knowledge as Record<string, unknown>
}
function sectionValue(
  manifest: Record<string, unknown>,
  section: Section,
): unknown {
  if (section === 'manifest') return manifest
  if (section === 'source' || section === 'security') return manifest[section]
  if (section === 'faqs' || section === 'websites' || section === 'files')
    return knowledge(manifest)[section]
  return agent(manifest)[section]
}
function replaceSection(
  manifest: Record<string, unknown>,
  section: Section,
  value: unknown,
): Record<string, unknown> {
  if (section === 'source' || section === 'security')
    return { ...manifest, [section]: value }
  const currentAgent = agent(manifest)
  if (section === 'faqs' || section === 'websites' || section === 'files')
    return {
      ...manifest,
      agent: {
        ...currentAgent,
        knowledge: { ...knowledge(manifest), [section]: value },
      },
    }
  return { ...manifest, agent: { ...currentAgent, [section]: value } }
}
function sectionItems(
  manifest: Record<string, unknown>,
  section: 'skills' | 'faqs',
): Array<Record<string, unknown>> {
  const value = sectionValue(manifest, section)
  return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : []
}
function mcpEntryPaths(entries: Map<string, Uint8Array>): string[] {
  return [...entries.keys()]
    .filter(
      (path) =>
        path.startsWith('MCPs/') && path.toLowerCase().endsWith('.mcpx'),
    )
    .sort((left, right) => left.localeCompare(right))
}
function mcpEntryName(path: string): string {
  return path.slice('MCPs/'.length).replace(/\.mcpx$/i, '')
}
function detailValue(pkg: StudioDocument, detail: Detail | null): unknown {
  if (!detail) return null
  if (detail.kind === 'mcp') return null
  if (detail.kind === 'entry')
    return new TextDecoder().decode(pkg.entries.get(detail.path))
  const item = sectionItems(
    pkg.manifest,
    detail.kind === 'skill' ? 'skills' : 'faqs',
  )[detail.index]
  return item ?? {}
}
function detailLabel(
  pkg: StudioDocument,
  detail: Detail | null,
): string | null {
  if (!detail) return null
  if (detail.kind === 'mcp') return mcpEntryName(detail.path)
  if (detail.kind === 'entry') return detail.path
  const item = sectionItems(
    pkg.manifest,
    detail.kind === 'skill' ? 'skills' : 'faqs',
  )[detail.index]
  return String(item?.[detail.kind === 'skill' ? 'title' : 'question'] ?? '')
}
function updateDetail(
  pkg: StudioDocument,
  detail: Detail,
  value: string,
): StudioDocument {
  if (detail.kind === 'mcp') return pkg
  if (detail.kind === 'entry') {
    const entries = new Map(pkg.entries)
    entries.set(detail.path, new TextEncoder().encode(value))
    return { ...pkg, entries }
  }
  const key = detail.kind === 'skill' ? 'skills' : 'faqs'
  const field = detail.kind === 'skill' ? 'skill' : 'answer'
  const items = sectionItems(pkg.manifest, key).map((item, index) =>
    index === detail.index ? { ...item, [field]: value } : item,
  )
  return { ...pkg, manifest: replaceSection(pkg.manifest, key, items) }
}

function replaceSkill(
  manifest: Record<string, unknown>,
  index: number,
  skill: Record<string, unknown>,
): Record<string, unknown> {
  return replaceSection(
    manifest,
    'skills',
    sectionItems(manifest, 'skills').map((item, itemIndex) =>
      itemIndex === index ? skill : item,
    ),
  )
}

function replaceFaq(
  manifest: Record<string, unknown>,
  index: number,
  faq: Record<string, unknown>,
): Record<string, unknown> {
  return replaceSection(
    manifest,
    'faqs',
    sectionItems(manifest, 'faqs').map((item, itemIndex) =>
      itemIndex === index ? faq : item,
    ),
  )
}
