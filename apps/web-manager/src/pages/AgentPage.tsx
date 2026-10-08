import type { InferResponseType } from 'hono/client'
import {
  AlertTriangle,
  Archive,
  Bot,
  BookOpen,
  Building2,
  Check,
  ChevronDown,
  ChevronLeft,
  Download,
  FileText,
  FlaskConical,
  Globe2,
  LoaderCircle,
  Minus,
  Phone,
  Plug,
  Plus,
  RadioTower,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Users,
  Zap,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { apiClient } from '../api'
import {
  readAgentImportPreview,
  type AgentImportPreview,
} from '../agent-import-preview'
import { authClient } from '../auth/auth-client'
import {
  ChannelQrCode,
  ConversationalComponentsSettingsCard,
  emptyChannelQrState,
  fetchChannelQrState,
  QrCodesSettingsCard,
  type ChannelQrState,
} from '@mba-desk/web-shared'
import {
  Button,
  Checkbox,
  cn,
  Dialog,
  Input,
  Pill,
  Progress,
  Select,
  Switch,
  TagInput,
  Tabs,
  Textarea,
} from '@mba-desk/ui'

type ChannelsResponse = InferResponseType<
  typeof apiClient.api.channels.$get,
  200
>
type ChannelSummary = ChannelsResponse['channels'][number]
type AgentStatus = 'not_configured' | 'enabled' | 'disabled' | 'error'
type RegistrationStatus = 'registered' | 'unregistered' | 'error'
type AgentAudience = 'EVERYONE' | 'ALLOWLISTED_ONLY'
type AgentSettingsResponse = InferResponseType<
  (typeof apiClient.api.channels)[':id']['agent-settings']['$get'],
  200
>
type AgentSettingsSummary = NonNullable<AgentSettingsResponse['settings']>
type HandoffMessageSelection =
  AgentSettingsSummary['handoff']['messageSelection']
type AllowlistResponse = InferResponseType<
  (typeof apiClient.api.channels)[':id']['agent-allowlist']['$get'],
  200
>
type AllowlistEntry = AllowlistResponse['entries'][number]
type BusinessInfoResponse = InferResponseType<
  (typeof apiClient.api.channels)[':id']['agent-business-info']['$get'],
  200
>
type BusinessInfoForm = BusinessInfoResponse['businessInfo']
type FaqListResponse = InferResponseType<
  (typeof apiClient.api.channels)[':id']['agent-knowledge']['faqs']['$get'],
  200
>
type KnowledgeFaq = FaqListResponse['faqs'][number]
type WebsiteListResponse = InferResponseType<
  (typeof apiClient.api.channels)[':id']['agent-knowledge']['websites']['$get'],
  200
>
type KnowledgeWebsite = WebsiteListResponse['websites'][number]
type FileListResponse = InferResponseType<
  (typeof apiClient.api.channels)[':id']['agent-knowledge']['files']['$get'],
  200
>
type KnowledgeFile = FileListResponse['files'][number]
type SkillListResponse = InferResponseType<
  (typeof apiClient.api.channels)[':id']['agent-skills']['$get'],
  200
>
type AgentSkill = SkillListResponse['skills'][number]
type ConnectorListResponse = InferResponseType<
  (typeof apiClient.api.channels)[':id']['agent-connectors']['$get'],
  200
>
type AgentConnector = ConnectorListResponse['connectors'][number]
type AgentBackupsResponse = InferResponseType<
  (typeof apiClient.api.channels)[':id']['agent-backups']['$get'],
  200
>
type AgentBackup = AgentBackupsResponse['backups'][number]
type EvaluationListResponse = InferResponseType<
  (typeof apiClient.api.channels)[':id']['agent-evals']['$get'],
  200
>
type AgentEvaluationCase = EvaluationListResponse['cases'][number]
const agentTabValues = [
  'overview',
  'businessInfo',
  'skills',
  'knowledgeBase',
  'connectors',
  'evals',
  'qrCodes',
  'components',
  'backups',
  'export',
  'import',
] as const
type AgentTab = (typeof agentTabValues)[number]
type KnowledgeTab = 'faq' | 'websites' | 'files'
const agentExportSteps = [
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
type AgentExportStep = (typeof agentExportSteps)[number]
const agentImportSteps = [
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
type AgentImportStep = (typeof agentImportSteps)[number]
const agentImportResources = [
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
type AgentImportResource = (typeof agentImportResources)[number]
type AgentImportComponent = Exclude<AgentImportResource, 'finalizing' | 'mcps'>
const defaultAgentImportComponents = (): Record<
  AgentImportComponent,
  boolean
> =>
  Object.fromEntries(
    agentImportResources
      .filter(
        (resource): resource is AgentImportComponent =>
          resource !== 'finalizing' && resource !== 'mcps',
      )
      .map((resource) => [resource, true]),
  ) as Record<AgentImportComponent, boolean>

interface AgentImportItemProgress {
  resource: AgentImportResource
  completed: number
  total: number
}

interface AgentImportInspection {
  summary: {
    skills: number
    qrCodes: number
    icebreakers: number
    commands: number
    faqs: number
    websites: number
    files: number
    mcps: number
    connectors: number
  }
  requirements: {
    files: Array<{ providerFileId: string; fileName: string }>
    connectors: Array<{
      name: string
      authType: 'API_KEY' | 'OAUTH2_CLIENT_CREDENTIALS' | 'NONE'
      requiresCertificate: boolean
    }>
  }
}

interface AgentImportConnectorInput {
  authConfig: string
  clientCertificate: string
  clientKey: string
  caCertificate: string
}

interface WebsiteForm {
  url: string
  includedSubDomains: string[]
  includedUrlPatterns: string[]
  excludedSubDomains: string[]
  excludedUrlPatterns: string[]
  singleUrls: string[]
}

const emptyWebsiteForm = (): WebsiteForm => ({
  url: '',
  includedSubDomains: [],
  includedUrlPatterns: [],
  excludedSubDomains: [],
  excludedUrlPatterns: [],
  singleUrls: [],
})

const emptyBusinessInfo = (): BusinessInfoForm => ({
  businessDescription: '',
  paymentMethod: '',
  purchaseInfo: '',
  deliveryAndShipping: '',
  returnPolicy: '',
  contactEmail: '',
  hoursOfOperation: '',
  address: '',
})

export function AgentPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const channelId = parseChannelId(id)
  const activeOrganizationQuery = authClient.useActiveOrganization()
  const activeMemberRoleQuery = authClient.useActiveMemberRole()
  const activeOrganizationId = activeOrganizationQuery.data?.id
  const canManage = (activeMemberRoleQuery.data?.role ?? '')
    .split(',')
    .map((role) => role.trim())
    .some((role) => role === 'owner' || role === 'admin')

  const [channel, setChannel] = useState<ChannelSummary | null>(null)
  const [status, setStatus] = useState<AgentStatus | null>(null)
  const [registrationStatus, setRegistrationStatus] =
    useState<RegistrationStatus | null>(null)
  const [registrationProviderStatus, setRegistrationProviderStatus] = useState<
    string | null
  >(null)
  const [qrState, setQrState] = useState<ChannelQrState>(() =>
    emptyChannelQrState('loading'),
  )
  const [settings, setSettings] = useState<AgentSettingsSummary | null>(null)
  const [activeTab, setActiveTab] = useState<AgentTab>('overview')
  const [selectedAudience, setSelectedAudience] =
    useState<AgentAudience>('EVERYONE')
  const [handoffEnabled, setHandoffEnabled] = useState(false)
  const [handoffMessageSelection, setHandoffMessageSelection] =
    useState<HandoffMessageSelection>('DEFAULT')
  const [handoffMessage, setHandoffMessage] = useState('')
  const [neverSayPhrases, setNeverSayPhrases] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCheckingEligibility, setIsCheckingEligibility] = useState(false)
  const [isEligible, setIsEligible] = useState<boolean | null>(null)
  const [isEnabling, setIsEnabling] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportStep, setExportStep] = useState<AgentExportStep | null>(null)
  const [exportComplete, setExportComplete] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [backups, setBackups] = useState<AgentBackup[]>([])
  const [isLoadingBackups, setIsLoadingBackups] = useState(false)
  const [backupsError, setBackupsError] = useState<string | null>(null)
  const [isBackupDialogOpen, setIsBackupDialogOpen] = useState(false)
  const [isCreatingBackup, setIsCreatingBackup] = useState(false)
  const [backupStep, setBackupStep] = useState<AgentExportStep | null>(null)
  const [backupComplete, setBackupComplete] = useState(false)
  const [backupError, setBackupError] = useState<string | null>(null)
  const [restoringBackupId, setRestoringBackupId] = useState<number | null>(
    null,
  )
  const [importPackage, setImportPackage] = useState<File | null>(null)
  const [importPreview, setImportPreview] = useState<AgentImportPreview | null>(
    null,
  )
  const [isLoadingImportPreview, setIsLoadingImportPreview] = useState(false)
  const [importInspection, setImportInspection] =
    useState<AgentImportInspection | null>(null)
  const [importFiles, setImportFiles] = useState<Record<string, File>>({})
  const [importConnectorInputs, setImportConnectorInputs] = useState<
    Record<string, AgentImportConnectorInput>
  >({})
  const [isInspectingImport, setIsInspectingImport] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importStep, setImportStep] = useState<AgentImportStep | null>(null)
  const [importItemProgress, setImportItemProgress] =
    useState<AgentImportItemProgress | null>(null)
  const [importComplete, setImportComplete] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importFailureMayBePartial, setImportFailureMayBePartial] =
    useState(false)
  const [createBackupBeforeImport, setCreateBackupBeforeImport] = useState(true)
  const [importComponents, setImportComponents] = useState(
    defaultAgentImportComponents,
  )
  const [isSavingRollout, setIsSavingRollout] = useState(false)
  const [isSavingAudience, setIsSavingAudience] = useState(false)
  const [isSavingBehavior, setIsSavingBehavior] = useState(false)
  const [allowlist, setAllowlist] = useState<AllowlistEntry[]>([])
  const [allowlistPhoneNumber, setAllowlistPhoneNumber] = useState('')
  const [isLoadingAllowlist, setIsLoadingAllowlist] = useState(false)
  const [isAddingAllowlistEntry, setIsAddingAllowlistEntry] = useState(false)
  const [removingAllowlistEntryId, setRemovingAllowlistEntryId] = useState<
    string | null
  >(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [businessInfo, setBusinessInfo] =
    useState<BusinessInfoForm>(emptyBusinessInfo)
  const [savedBusinessInfo, setSavedBusinessInfo] =
    useState<BusinessInfoForm>(emptyBusinessInfo)
  const [isLoadingBusinessInfo, setIsLoadingBusinessInfo] = useState(false)
  const [isSavingBusinessInfo, setIsSavingBusinessInfo] = useState(false)
  const [businessInfoError, setBusinessInfoError] = useState<string | null>(
    null,
  )
  const [skills, setSkills] = useState<AgentSkill[]>([])
  const [skillError, setSkillError] = useState<string | null>(null)
  const [isLoadingSkills, setIsLoadingSkills] = useState(false)
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null)
  const [isSkillDialogOpen, setIsSkillDialogOpen] = useState(false)
  const [skillTitle, setSkillTitle] = useState('')
  const [skillDescription, setSkillDescription] = useState('')
  const [skillInstructions, setSkillInstructions] = useState('')
  const [isSavingSkill, setIsSavingSkill] = useState(false)
  const [deletingSkillId, setDeletingSkillId] = useState<string | null>(null)
  const [connectors, setConnectors] = useState<AgentConnector[]>([])
  const [connectorError, setConnectorError] = useState<string | null>(null)
  const [isLoadingConnectors, setIsLoadingConnectors] = useState(false)
  const [evaluationCases, setEvaluationCases] = useState<AgentEvaluationCase[]>(
    [],
  )
  const [evaluationError, setEvaluationError] = useState<string | null>(null)
  const [isLoadingEvaluations, setIsLoadingEvaluations] = useState(false)
  const [knowledgeTab, setKnowledgeTab] = useState<KnowledgeTab>('faq')
  const [knowledgeError, setKnowledgeError] = useState<string | null>(null)
  const [isLoadingKnowledge, setIsLoadingKnowledge] = useState(false)
  const [faqs, setFaqs] = useState<KnowledgeFaq[]>([])
  const [editingFaqId, setEditingFaqId] = useState<string | null>(null)
  const [isFaqDialogOpen, setIsFaqDialogOpen] = useState(false)
  const [faqQuestion, setFaqQuestion] = useState('')
  const [faqAnswer, setFaqAnswer] = useState('')
  const [isSavingFaq, setIsSavingFaq] = useState(false)
  const [deletingFaqId, setDeletingFaqId] = useState<string | null>(null)
  const [websites, setWebsites] = useState<KnowledgeWebsite[]>([])
  const [editingWebsiteId, setEditingWebsiteId] = useState<string | null>(null)
  const [isWebsiteDialogOpen, setIsWebsiteDialogOpen] = useState(false)
  const [websiteForm, setWebsiteForm] = useState<WebsiteForm>(emptyWebsiteForm)
  const [isSavingWebsite, setIsSavingWebsite] = useState(false)
  const [deletingWebsiteId, setDeletingWebsiteId] = useState<string | null>(
    null,
  )
  const [knowledgeFiles, setKnowledgeFiles] = useState<KnowledgeFile[]>([])
  const [selectedKnowledgeFile, setSelectedKnowledgeFile] =
    useState<File | null>(null)
  const [isFileDialogOpen, setIsFileDialogOpen] = useState(false)
  const [isUploadingKnowledgeFile, setIsUploadingKnowledgeFile] =
    useState(false)
  const [deletingKnowledgeFileId, setDeletingKnowledgeFileId] = useState<
    string | null
  >(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const exportSourceRef = useRef<EventSource | null>(null)
  const exportChunksRef = useRef<Array<Uint8Array | undefined>>([])
  const importPreviewVersionRef = useRef(0)

  useEffect(
    () => () => {
      exportSourceRef.current?.close()
    },
    [channelId],
  )

  useEffect(() => {
    document.title = `${t('agent.title')} · ${t('design.brand')}`
    document
      .querySelector<HTMLMetaElement>('meta[name="description"]')
      ?.setAttribute('content', t('agent.metaDescription'))
  }, [t])

  const loadAgent = useCallback(async () => {
    if (!activeOrganizationId || !channelId) {
      setChannel(null)
      setStatus(null)
      setRegistrationStatus(null)
      setRegistrationProviderStatus(null)
      setQrState(emptyChannelQrState('loading'))
      setSettings(null)
      setAllowlist([])
      setHandoffEnabled(false)
      setHandoffMessageSelection('DEFAULT')
      setHandoffMessage('')
      setNeverSayPhrases([])
      setIsLoading(false)
      if (id && !channelId) setError(t('agent.invalidChannel'))
      return
    }

    setIsLoading(true)
    setStatus(null)
    setRegistrationStatus(null)
    setRegistrationProviderStatus(null)
    setSettings(null)
    setBusinessInfo(emptyBusinessInfo())
    setSavedBusinessInfo(emptyBusinessInfo())
    setIsEligible(null)
    setError(null)
    try {
      const channelsResponse = await apiClient.api.channels.$get()
      if (!channelsResponse.ok) {
        throw new Error(
          await readApiError(channelsResponse, t('agent.loadFailed')),
        )
      }
      const selectedChannel = (await channelsResponse.json()).channels.find(
        (item) => item.id === channelId,
      )
      if (!selectedChannel) throw new Error(t('agent.channelNotFound'))
      setChannel(selectedChannel)
      setQrState(emptyChannelQrState('loading'))
      void fetchChannelQrState(channelId).then(setQrState)

      let isNumberRegistered = false
      try {
        const registrationResponse = await apiClient.api.channels[
          ':id'
        ].registration.$get({ param: { id: String(channelId) } })
        if (registrationResponse.ok) {
          const registration = (await registrationResponse.json()) as {
            status: RegistrationStatus
            providerStatus: string | null
          }
          setRegistrationStatus(registration.status)
          setRegistrationProviderStatus(registration.providerStatus)
          isNumberRegistered = registration.status === 'registered'
        } else {
          setRegistrationStatus('error')
          setRegistrationProviderStatus(null)
        }
      } catch {
        setRegistrationStatus('error')
        setRegistrationProviderStatus(null)
      }

      if (!isNumberRegistered) {
        setActiveTab('overview')
        return
      }

      const settingsResponse = await apiClient.api.channels[':id'][
        'agent-settings'
      ].$get({ param: { id: String(channelId) } })
      if (!settingsResponse.ok) {
        setStatus('error')
        throw new Error(
          await readApiError(settingsResponse, t('agent.loadFailed')),
        )
      }
      const agentResponse = await settingsResponse.json()
      setStatus(agentResponse.status)
      setSettings(agentResponse.settings)
      if (agentResponse.settings) {
        setSelectedAudience(agentResponse.settings.audience)
        setHandoffEnabled(agentResponse.settings.handoff.enabled)
        setHandoffMessageSelection(
          agentResponse.settings.handoff.messageSelection,
        )
        setHandoffMessage(agentResponse.settings.handoff.message)
        setNeverSayPhrases(agentResponse.settings.neverSayPhrases)
      }
    } catch (reason) {
      setError(getErrorMessage(reason, t('agent.loadFailed')))
    } finally {
      setIsLoading(false)
    }
  }, [activeOrganizationId, channelId, id, t])

  useEffect(() => {
    void loadAgent()
  }, [loadAgent])

  const loadAllowlist = useCallback(async () => {
    if (!channelId) return
    setIsLoadingAllowlist(true)
    setError(null)
    try {
      const response = await apiClient.api.channels[':id'][
        'agent-allowlist'
      ].$get({ param: { id: String(channelId) } })
      if (!response.ok) {
        throw new Error(
          await readApiError(response, t('agent.allowlist.loadFailed')),
        )
      }
      setAllowlist((await response.json()).entries)
    } catch (reason) {
      setError(getErrorMessage(reason, t('agent.allowlist.loadFailed')))
    } finally {
      setIsLoadingAllowlist(false)
    }
  }, [channelId, t])

  useEffect(() => {
    if (settings?.audience !== 'ALLOWLISTED_ONLY') {
      setAllowlist([])
      return
    }
    void loadAllowlist()
  }, [loadAllowlist, settings?.audience])

  const loadBusinessInfo = useCallback(async () => {
    if (!channelId) return
    setIsLoadingBusinessInfo(true)
    setBusinessInfoError(null)
    try {
      const response = await apiClient.api.channels[':id'][
        'agent-business-info'
      ].$get({ param: { id: String(channelId) } })
      if (!response.ok) {
        throw new Error(
          await readApiError(response, t('agent.businessInfo.loadFailed')),
        )
      }
      const value = (await response.json()).businessInfo
      setBusinessInfo(value)
      setSavedBusinessInfo(value)
    } catch (reason) {
      setBusinessInfoError(
        getErrorMessage(reason, t('agent.businessInfo.loadFailed')),
      )
    } finally {
      setIsLoadingBusinessInfo(false)
    }
  }, [channelId, t])

  useEffect(() => {
    if (activeTab === 'businessInfo' && settings) void loadBusinessInfo()
  }, [activeTab, loadBusinessInfo, settings])

  const loadSkills = useCallback(async () => {
    if (!channelId) return
    setIsLoadingSkills(true)
    setSkillError(null)
    try {
      const response = await apiClient.api.channels[':id']['agent-skills'].$get(
        { param: { id: String(channelId) } },
      )
      if (!response.ok) {
        throw new Error(
          await readApiError(response, t('agent.skills.loadFailed')),
        )
      }
      setSkills((await response.json()).skills)
    } catch (reason) {
      setSkillError(getErrorMessage(reason, t('agent.skills.loadFailed')))
    } finally {
      setIsLoadingSkills(false)
    }
  }, [channelId, t])

  useEffect(() => {
    if (activeTab === 'skills' && settings) void loadSkills()
  }, [activeTab, loadSkills, settings])

  const loadConnectors = useCallback(async () => {
    if (!channelId) return
    setIsLoadingConnectors(true)
    setConnectorError(null)
    try {
      const response = await apiClient.api.channels[':id'][
        'agent-connectors'
      ].$get({ param: { id: String(channelId) } })
      if (!response.ok) {
        throw new Error(
          await readApiError(response, t('agent.connectors.loadFailed')),
        )
      }
      setConnectors((await response.json()).connectors)
    } catch (reason) {
      setConnectorError(
        getErrorMessage(reason, t('agent.connectors.loadFailed')),
      )
    } finally {
      setIsLoadingConnectors(false)
    }
  }, [channelId, t])

  useEffect(() => {
    if (activeTab === 'connectors' && settings) void loadConnectors()
  }, [activeTab, loadConnectors, settings])

  const loadEvaluationCases = useCallback(async () => {
    if (!channelId) return
    setIsLoadingEvaluations(true)
    setEvaluationError(null)
    try {
      const response = await apiClient.api.channels[':id']['agent-evals'].$get({
        param: { id: String(channelId) },
      })
      if (!response.ok) {
        throw new Error(
          await readApiError(response, t('agent.evals.loadFailed')),
        )
      }
      setEvaluationCases((await response.json()).cases)
    } catch (reason) {
      setEvaluationError(getErrorMessage(reason, t('agent.evals.loadFailed')))
    } finally {
      setIsLoadingEvaluations(false)
    }
  }, [channelId, t])

  useEffect(() => {
    if (activeTab === 'evals' && settings) void loadEvaluationCases()
  }, [activeTab, loadEvaluationCases, settings])

  const loadKnowledge = useCallback(
    async (tab: KnowledgeTab) => {
      if (!channelId) return
      setIsLoadingKnowledge(true)
      setKnowledgeError(null)
      try {
        if (tab === 'faq') {
          const response = await apiClient.api.channels[':id'][
            'agent-knowledge'
          ].faqs.$get({ param: { id: String(channelId) } })
          if (!response.ok) {
            throw new Error(
              await readApiError(response, t('agent.knowledge.loadFailed')),
            )
          }
          setFaqs((await response.json()).faqs)
        } else if (tab === 'websites') {
          const response = await apiClient.api.channels[':id'][
            'agent-knowledge'
          ].websites.$get({ param: { id: String(channelId) } })
          if (!response.ok) {
            throw new Error(
              await readApiError(response, t('agent.knowledge.loadFailed')),
            )
          }
          setWebsites((await response.json()).websites)
        } else {
          const response = await apiClient.api.channels[':id'][
            'agent-knowledge'
          ].files.$get({ param: { id: String(channelId) } })
          if (!response.ok) {
            throw new Error(
              await readApiError(response, t('agent.knowledge.loadFailed')),
            )
          }
          setKnowledgeFiles((await response.json()).files)
        }
      } catch (reason) {
        setKnowledgeError(
          getErrorMessage(reason, t('agent.knowledge.loadFailed')),
        )
      } finally {
        setIsLoadingKnowledge(false)
      }
    },
    [channelId, t],
  )

  useEffect(() => {
    if (activeTab === 'knowledgeBase' && settings) {
      void loadKnowledge(knowledgeTab)
    }
  }, [activeTab, knowledgeTab, loadKnowledge, settings])

  const checkEligibility = async () => {
    if (!channelId) return
    setIsCheckingEligibility(true)
    setIsEligible(null)
    setError(null)
    setNotice(null)
    try {
      const response = await apiClient.api.channels[':id'][
        'agent-eligibility'
      ].$get({ param: { id: String(channelId) } })
      if (!response.ok) {
        throw new Error(
          await readApiError(response, t('agent.eligibilityFailed')),
        )
      }
      setIsEligible((await response.json()).eligible)
    } catch (reason) {
      setError(getErrorMessage(reason, t('agent.eligibilityFailed')))
    } finally {
      setIsCheckingEligibility(false)
    }
  }

  const enableAgent = async () => {
    if (!channelId || !isEligible) return
    setIsEnabling(true)
    setError(null)
    setNotice(null)
    try {
      const response = await apiClient.api.channels[':id'].agent.$post({
        param: { id: String(channelId) },
      })
      if (!response.ok) {
        throw new Error(await readApiError(response, t('agent.enableFailed')))
      }
      setNotice(t('agent.enabled'))
      await loadAgent()
    } catch (reason) {
      setError(getErrorMessage(reason, t('agent.enableFailed')))
    } finally {
      setIsEnabling(false)
    }
  }

  const loadBackups = useCallback(async () => {
    if (!channelId) return
    setIsLoadingBackups(true)
    setBackupsError(null)
    try {
      const response = await apiClient.api.channels[':id'][
        'agent-backups'
      ].$get({ param: { id: String(channelId) } })
      if (!response.ok) {
        throw new Error(
          await readApiError(response, t('agent.backups.loadFailed')),
        )
      }
      setBackups((await response.json()).backups)
    } catch (reason) {
      setBackupsError(getErrorMessage(reason, t('agent.backups.loadFailed')))
    } finally {
      setIsLoadingBackups(false)
    }
  }, [channelId, t])

  useEffect(() => {
    if (activeTab === 'backups' && settings) void loadBackups()
  }, [activeTab, loadBackups, settings])

  const openBackupDialog = () => {
    setBackupStep(null)
    setBackupComplete(false)
    setBackupError(null)
    setIsBackupDialogOpen(true)
  }

  const createBackup = async () => {
    if (!channelId || isCreatingBackup) return
    setIsCreatingBackup(true)
    setBackupStep(null)
    setBackupComplete(false)
    setBackupError(null)
    try {
      const response = await fetch(`/api/channels/${channelId}/agent-backups`, {
        method: 'POST',
      })
      if (!response.ok) {
        throw new Error(
          await readApiError(response, t('agent.backups.createFailed')),
        )
      }
      let completed = false
      await readSseResponse(response, (event, data) => {
        const payload = parseAgentExportEvent(data)
        if (
          event === 'progress' &&
          typeof payload?.step === 'string' &&
          isAgentExportStep(payload.step)
        ) {
          setBackupStep(payload.step)
        } else if (event === 'complete') {
          completed = true
        } else if (event === 'backup-error') {
          throw new Error(
            typeof payload?.message === 'string'
              ? payload.message
              : t('agent.backups.createFailed'),
          )
        }
      })
      if (!completed) throw new Error(t('agent.backups.createFailed'))
      setBackupComplete(true)
      await loadBackups()
    } catch (reason) {
      setBackupError(getErrorMessage(reason, t('agent.backups.createFailed')))
    } finally {
      setIsCreatingBackup(false)
    }
  }

  const restoreBackup = async (backup: AgentBackup) => {
    if (!channelId || restoringBackupId !== null) return
    setRestoringBackupId(backup.id)
    setBackupsError(null)
    setNotice(null)
    try {
      const response = await fetch(
        `/api/channels/${channelId}/agent-backups/${backup.id}/archive`,
      )
      if (!response.ok) {
        throw new Error(
          await readApiError(response, t('agent.backups.restoreFailed')),
        )
      }
      const packageFile = new File([await response.blob()], backup.fileName, {
        type: 'application/vnd.mba.agent+zip',
      })
      setCreateBackupBeforeImport(true)
      const previewLoaded = await selectImportPackage(packageFile)
      setActiveTab('import')
      if (previewLoaded) setNotice(t('agent.backups.restoreReady'))
    } catch (reason) {
      setBackupsError(getErrorMessage(reason, t('agent.backups.restoreFailed')))
    } finally {
      setRestoringBackupId(null)
    }
  }

  const exportAgent = () => {
    if (!channelId || !channel || !settings || isExporting) return
    exportSourceRef.current?.close()
    setIsExporting(true)
    setExportStep(null)
    setExportComplete(false)
    setExportError(null)
    setError(null)
    setNotice(null)
    exportChunksRef.current = []
    const source = new EventSource(`/api/channels/${channelId}/agent-export`)
    exportSourceRef.current = source
    let settled = false

    const finish = () => {
      settled = true
      source.close()
      if (exportSourceRef.current === source) exportSourceRef.current = null
      setIsExporting(false)
    }
    source.addEventListener('progress', (event: MessageEvent<string>) => {
      const payload = parseAgentExportEvent(event.data)
      if (
        payload &&
        typeof payload.step === 'string' &&
        isAgentExportStep(payload.step)
      ) {
        setExportStep(payload.step)
      }
    })
    source.addEventListener('archive-chunk', (event: MessageEvent<string>) => {
      const payload = parseAgentExportEvent(event.data)
      if (
        payload &&
        Number.isSafeInteger(payload.index) &&
        typeof payload.index === 'number' &&
        payload.index >= 0 &&
        typeof payload.data === 'string'
      ) {
        try {
          exportChunksRef.current[payload.index] = decodeBase64(payload.data)
        } catch {
          setExportError(t('agent.exportPanel.failed'))
          finish()
        }
      }
    })
    source.addEventListener('complete', (event: MessageEvent<string>) => {
      const payload = parseAgentExportEvent(event.data)
      if (
        !payload ||
        typeof payload.fileName !== 'string' ||
        typeof payload.chunkCount !== 'number' ||
        !Number.isSafeInteger(payload.chunkCount) ||
        payload.chunkCount < 1 ||
        typeof payload.byteSize !== 'number' ||
        !Number.isSafeInteger(payload.byteSize) ||
        payload.byteSize < 1
      ) {
        setExportError(t('agent.exportPanel.failed'))
        finish()
        return
      }
      const chunks = exportChunksRef.current.slice(0, payload.chunkCount)
      if (
        chunks.length !== payload.chunkCount ||
        chunks.some((chunk) => chunk === undefined) ||
        chunks.reduce((size, chunk) => size + (chunk?.byteLength ?? 0), 0) !==
          payload.byteSize
      ) {
        setExportError(t('agent.exportPanel.failed'))
        finish()
        return
      }
      const url = URL.createObjectURL(
        new Blob([concatenateBytes(chunks as Uint8Array[])], {
          type: 'application/vnd.mba.agent+zip',
        }),
      )
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = payload.fileName
      anchor.hidden = true
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
      setExportComplete(true)
      setExportStep(null)
      exportChunksRef.current = []
      finish()
    })
    source.addEventListener('export-error', () => {
      setExportError(t('agent.exportPanel.failed'))
      finish()
    })
    source.onerror = () => {
      if (settled) return
      setExportError(t('agent.exportPanel.failed'))
      finish()
    }
  }

  const inspectAgentImport = async () => {
    if (!channelId || !importPackage || !importPreview || isInspectingImport)
      return
    setIsInspectingImport(true)
    setImportError(null)
    setImportInspection(null)
    setImportFiles({})
    setImportComplete(false)
    setImportItemProgress(null)
    setImportFailureMayBePartial(false)
    try {
      const form = new FormData()
      form.set('package', importPackage)
      const response = await fetch(
        `/api/channels/${channelId}/agent-import/inspect`,
        { method: 'POST', body: form },
      )
      if (!response.ok) {
        throw new Error(
          await readApiError(response, t('agent.importPanel.inspectFailed')),
        )
      }
      const inspection = (await response.json()) as AgentImportInspection
      setImportInspection(inspection)
      setImportConnectorInputs(
        Object.fromEntries(
          inspection.requirements.connectors.map((connector) => [
            connector.name,
            {
              authConfig: connectorAuthTemplate(connector.authType),
              clientCertificate: '',
              clientKey: '',
              caCertificate: '',
            },
          ]),
        ),
      )
    } catch (reason) {
      setImportError(
        getErrorMessage(reason, t('agent.importPanel.inspectFailed')),
      )
    } finally {
      setIsInspectingImport(false)
    }
  }

  const selectImportPackage = async (file: File | null) => {
    const version = importPreviewVersionRef.current + 1
    importPreviewVersionRef.current = version
    setImportPackage(file)
    setImportPreview(null)
    setImportInspection(null)
    setImportFiles({})
    setImportConnectorInputs({})
    setImportComplete(false)
    setImportStep(null)
    setImportItemProgress(null)
    setImportError(null)
    setImportFailureMayBePartial(false)
    if (!file) {
      setIsLoadingImportPreview(false)
      return false
    }

    setIsLoadingImportPreview(true)
    try {
      const preview = await readAgentImportPreview(file)
      if (importPreviewVersionRef.current === version) {
        setImportPreview(preview)
        return true
      }
      return false
    } catch (reason) {
      if (importPreviewVersionRef.current === version) {
        setImportError(
          getErrorMessage(reason, t('agent.importPanel.previewFailed')),
        )
      }
      return false
    } finally {
      if (importPreviewVersionRef.current === version) {
        setIsLoadingImportPreview(false)
      }
    }
  }

  const importAgent = async () => {
    if (!channelId || !importPackage || !importInspection || isImporting) return
    let activeStep: AgentImportStep | null = null
    let mayHaveAppliedChanges = false
    setIsImporting(true)
    setImportStep(null)
    setImportItemProgress(null)
    setImportComplete(false)
    setImportError(null)
    setImportFailureMayBePartial(false)
    try {
      const connectorCredentials: Record<string, unknown> = {}
      for (const connector of importComponents.connectors
        ? importInspection.requirements.connectors
        : []) {
        const input = importConnectorInputs[connector.name]
        const credential: Record<string, unknown> = {}
        if (connector.authType !== 'NONE') {
          if (!input?.authConfig.trim()) {
            throw new Error(t('agent.importPanel.credentialsRequired'))
          }
          try {
            credential.authConfig = JSON.parse(input.authConfig)
          } catch {
            throw new Error(
              t('agent.importPanel.credentialsJsonInvalid', {
                name: connector.name,
              }),
            )
          }
        }
        if (connector.requiresCertificate) {
          if (!input?.clientCertificate.trim() || !input.clientKey.trim()) {
            throw new Error(t('agent.importPanel.certificateRequired'))
          }
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
      form.set('package', importPackage)
      form.set(
        'options',
        JSON.stringify({
          connectorCredentials,
          createBackupBeforeImport,
          components: Object.entries(importComponents).flatMap(
            ([component, selected]) => (selected ? [component] : []),
          ),
        }),
      )
      for (const required of importComponents.files
        ? importInspection.requirements.files
        : []) {
        const file = importFiles[required.providerFileId]
        if (!file) throw new Error(t('agent.importPanel.filesRequired'))
        form.set(`file:${required.providerFileId}`, file)
      }
      const response = await fetch(`/api/channels/${channelId}/agent-import`, {
        method: 'POST',
        body: form,
      })
      if (!response.ok) {
        throw new Error(
          await readApiError(response, t('agent.importPanel.failed')),
        )
      }
      let completed = false
      await readSseResponse(response, (event, data) => {
        const payload = parseAgentExportEvent(data)
        if (event === 'progress' && typeof payload?.step === 'string') {
          if (isAgentImportStep(payload.step)) {
            activeStep = payload.step
            if (payload.step !== 'backup' && payload.skipped !== true) {
              mayHaveAppliedChanges = true
            }
            setImportStep(payload.step)
            const completed = payload.completed
            const total = payload.resourceTotal
            if (
              typeof payload.resource === 'string' &&
              isAgentImportResource(payload.resource) &&
              typeof completed === 'number' &&
              Number.isSafeInteger(completed) &&
              completed >= 0 &&
              typeof total === 'number' &&
              Number.isSafeInteger(total) &&
              total >= completed
            ) {
              setImportItemProgress({
                resource: payload.resource,
                completed,
                total,
              })
            } else {
              setImportItemProgress(null)
            }
          }
        } else if (event === 'complete') {
          completed = true
        } else if (event === 'import-error') {
          if (
            typeof payload?.step === 'string' &&
            isAgentImportStep(payload.step)
          ) {
            activeStep = payload.step
          }
          mayHaveAppliedChanges = payload?.partial === true
          const reason =
            typeof payload?.message === 'string'
              ? payload.message
              : t('agent.importPanel.failed')
          throw new Error(
            t('agent.importPanel.failedAtStep', {
              step: activeStep
                ? t(`agent.importPanel.steps.${activeStep}` as const)
                : t('agent.importPanel.unknownStep'),
              reason,
            }),
          )
        }
      })
      if (!completed) {
        throw new Error(
          t('agent.importPanel.streamEnded', {
            step: activeStep
              ? t(`agent.importPanel.steps.${activeStep}` as const)
              : t('agent.importPanel.unknownStep'),
          }),
        )
      }
      setImportComplete(true)
      setImportStep(null)
      setImportItemProgress(null)
      setImportConnectorInputs({})
      setImportFiles({})
      await loadAgent()
    } catch (reason) {
      const message = getErrorMessage(reason, t('agent.importPanel.failed'))
      console.error('Agent import failed', {
        channelId,
        step: activeStep,
        mayHaveAppliedChanges,
        error: reason,
      })
      setImportFailureMayBePartial(mayHaveAppliedChanges)
      setImportError(message)
    } finally {
      setIsImporting(false)
    }
  }

  const toggleRollout = async () => {
    if (!channelId || !settings) return
    const rolloutEnabled = !settings.rolloutEnabled
    setIsSavingRollout(true)
    setError(null)
    setNotice(null)
    try {
      const response = await apiClient.api.channels[':id'][
        'agent-settings'
      ].$patch({
        param: { id: String(channelId) },
        json: { rolloutEnabled },
      })
      if (!response.ok) {
        throw new Error(
          await readApiError(response, t('agent.rollout.updateFailed')),
        )
      }
      const updatedSettings = (await response.json()).settings
      setSettings(updatedSettings)
      setStatus(updatedSettings.rolloutEnabled ? 'enabled' : 'disabled')
      setNotice(
        t(
          updatedSettings.rolloutEnabled
            ? 'agent.rollout.enabled'
            : 'agent.rollout.disabled',
        ),
      )
    } catch (reason) {
      setError(getErrorMessage(reason, t('agent.rollout.updateFailed')))
    } finally {
      setIsSavingRollout(false)
    }
  }

  const saveAudience = async () => {
    if (!channelId || !settings || selectedAudience === settings.audience)
      return
    setIsSavingAudience(true)
    setError(null)
    setNotice(null)
    try {
      const response = await apiClient.api.channels[':id'][
        'agent-settings'
      ].$patch({
        param: { id: String(channelId) },
        json: { audience: selectedAudience },
      })
      if (!response.ok) {
        throw new Error(
          await readApiError(response, t('agent.audience.updateFailed')),
        )
      }
      const updatedSettings = (await response.json()).settings
      setSettings(updatedSettings)
      setSelectedAudience(updatedSettings.audience)
      setNotice(t('agent.audience.updated'))
    } catch (reason) {
      setError(getErrorMessage(reason, t('agent.audience.updateFailed')))
    } finally {
      setIsSavingAudience(false)
    }
  }

  const saveBehavior = async () => {
    if (
      !channelId ||
      !settings ||
      (handoffMessageSelection === 'CUSTOM' && !handoffMessage.trim())
    ) {
      return
    }
    setIsSavingBehavior(true)
    setError(null)
    setNotice(null)
    try {
      const response = await apiClient.api.channels[':id'][
        'agent-settings'
      ].$patch({
        param: { id: String(channelId) },
        json: {
          handoff: {
            enabled: handoffEnabled,
            messageSelection: handoffMessageSelection,
            ...(handoffMessageSelection === 'CUSTOM'
              ? { message: handoffMessage.trim() }
              : {}),
          },
          neverSayPhrases,
        },
      })
      if (!response.ok) {
        throw new Error(
          await readApiError(response, t('agent.behavior.updateFailed')),
        )
      }
      const updatedSettings = (await response.json()).settings
      setSettings(updatedSettings)
      setHandoffEnabled(updatedSettings.handoff.enabled)
      setHandoffMessageSelection(updatedSettings.handoff.messageSelection)
      setHandoffMessage(updatedSettings.handoff.message)
      setNeverSayPhrases(updatedSettings.neverSayPhrases)
      setNotice(t('agent.behavior.updated'))
    } catch (reason) {
      setError(getErrorMessage(reason, t('agent.behavior.updateFailed')))
    } finally {
      setIsSavingBehavior(false)
    }
  }

  const addAllowlistEntry = async () => {
    if (!channelId || !allowlistPhoneNumber.trim()) return
    setIsAddingAllowlistEntry(true)
    setError(null)
    setNotice(null)
    try {
      const response = await apiClient.api.channels[':id'][
        'agent-allowlist'
      ].$post({
        param: { id: String(channelId) },
        json: { phoneNumber: allowlistPhoneNumber.trim() },
      })
      if (!response.ok) {
        throw new Error(
          await readApiError(response, t('agent.allowlist.addFailed')),
        )
      }
      const { entry } = await response.json()
      setAllowlist((current) => [
        ...current.filter((item) => item.id !== entry.id),
        entry,
      ])
      setAllowlistPhoneNumber('')
      setNotice(t('agent.allowlist.added'))
    } catch (reason) {
      setError(getErrorMessage(reason, t('agent.allowlist.addFailed')))
    } finally {
      setIsAddingAllowlistEntry(false)
    }
  }

  const removeAllowlistEntry = async (entryId: string) => {
    if (!channelId) return
    setRemovingAllowlistEntryId(entryId)
    setError(null)
    setNotice(null)
    try {
      const response = await apiClient.api.channels[':id']['agent-allowlist'][
        ':entryId'
      ].$delete({
        param: { id: String(channelId), entryId },
      })
      if (!response.ok) {
        throw new Error(
          await readApiError(response, t('agent.allowlist.removeFailed')),
        )
      }
      setAllowlist((current) => current.filter((entry) => entry.id !== entryId))
      setNotice(t('agent.allowlist.removed'))
    } catch (reason) {
      setError(getErrorMessage(reason, t('agent.allowlist.removeFailed')))
    } finally {
      setRemovingAllowlistEntryId(null)
    }
  }

  const deleteAgent = async () => {
    if (!channelId) return
    setIsDeleting(true)
    setDeleteError(null)
    try {
      const response = await apiClient.api.channels[':id'].agent.$delete({
        param: { id: String(channelId) },
      })
      if (!response.ok) {
        throw new Error(await readApiError(response, t('agent.danger.failed')))
      }
      setIsDeleteDialogOpen(false)
      setNotice(t('agent.danger.deleted'))
      await loadAgent()
    } catch (reason) {
      setDeleteError(getErrorMessage(reason, t('agent.danger.failed')))
    } finally {
      setIsDeleting(false)
    }
  }

  const saveBusinessInfo = async () => {
    if (!channelId) return
    setIsSavingBusinessInfo(true)
    setBusinessInfoError(null)
    setNotice(null)
    try {
      const response = await apiClient.api.channels[':id'][
        'agent-business-info'
      ].$put({
        param: { id: String(channelId) },
        json: businessInfo,
      })
      if (!response.ok) {
        throw new Error(
          await readApiError(response, t('agent.businessInfo.saveFailed')),
        )
      }
      const value = (await response.json()).businessInfo
      setBusinessInfo(value)
      setSavedBusinessInfo(value)
      setNotice(t('agent.businessInfo.saved'))
    } catch (reason) {
      setBusinessInfoError(
        getErrorMessage(reason, t('agent.businessInfo.saveFailed')),
      )
    } finally {
      setIsSavingBusinessInfo(false)
    }
  }

  const updateBusinessInfoField = (
    field: keyof BusinessInfoForm,
    value: string,
  ) => {
    setBusinessInfo((current) => ({ ...current, [field]: value }))
  }

  const saveSkill = async () => {
    const title = skillTitle.trim()
    if (!channelId || !isKebabCase(title) || !skillInstructions.trim()) return
    setIsSavingSkill(true)
    setSkillError(null)
    try {
      const payload = {
        title,
        description: skillDescription.trim(),
        skill: skillInstructions.trim(),
      }
      const response = editingSkillId
        ? await apiClient.api.channels[':id']['agent-skills'][':skillId'].$put({
            param: { id: String(channelId), skillId: editingSkillId },
            json: payload,
          })
        : await apiClient.api.channels[':id']['agent-skills'].$post({
            param: { id: String(channelId) },
            json: payload,
          })
      if (!response.ok) {
        throw new Error(
          await readApiError(response, t('agent.skills.saveFailed')),
        )
      }
      const { skill } = await response.json()
      setSkills((current) => [
        ...current.filter((item) => item.id !== skill.id),
        skill,
      ])
      closeSkillDialog()
    } catch (reason) {
      setSkillError(getErrorMessage(reason, t('agent.skills.saveFailed')))
    } finally {
      setIsSavingSkill(false)
    }
  }

  const deleteSkill = async (skillId: string) => {
    if (!channelId) return
    setDeletingSkillId(skillId)
    setSkillError(null)
    try {
      const response = await apiClient.api.channels[':id']['agent-skills'][
        ':skillId'
      ].$delete({ param: { id: String(channelId), skillId } })
      if (!response.ok) {
        throw new Error(
          await readApiError(response, t('agent.skills.deleteFailed')),
        )
      }
      setSkills((current) => current.filter((skill) => skill.id !== skillId))
      if (editingSkillId === skillId) closeSkillDialog()
    } catch (reason) {
      setSkillError(getErrorMessage(reason, t('agent.skills.deleteFailed')))
    } finally {
      setDeletingSkillId(null)
    }
  }

  const closeSkillDialog = () => {
    setIsSkillDialogOpen(false)
    setEditingSkillId(null)
    setSkillTitle('')
    setSkillDescription('')
    setSkillInstructions('')
    setSkillError(null)
  }

  const saveFaq = async () => {
    if (!channelId || !faqQuestion.trim() || !faqAnswer.trim()) return
    setIsSavingFaq(true)
    setKnowledgeError(null)
    try {
      const payload = { question: faqQuestion.trim(), answer: faqAnswer.trim() }
      const response = editingFaqId
        ? await apiClient.api.channels[':id']['agent-knowledge'].faqs[
            ':faqId'
          ].$put({
            param: { id: String(channelId), faqId: editingFaqId },
            json: payload,
          })
        : await apiClient.api.channels[':id']['agent-knowledge'].faqs.$post({
            param: { id: String(channelId) },
            json: payload,
          })
      if (!response.ok) {
        throw new Error(
          await readApiError(response, t('agent.knowledge.faq.saveFailed')),
        )
      }
      const { faq } = await response.json()
      setFaqs((current) => [
        ...current.filter((item) => item.id !== faq.id),
        faq,
      ])
      setEditingFaqId(null)
      setFaqQuestion('')
      setFaqAnswer('')
      setIsFaqDialogOpen(false)
    } catch (reason) {
      setKnowledgeError(
        getErrorMessage(reason, t('agent.knowledge.faq.saveFailed')),
      )
    } finally {
      setIsSavingFaq(false)
    }
  }

  const deleteFaq = async (faqId: string) => {
    if (!channelId) return
    setDeletingFaqId(faqId)
    setKnowledgeError(null)
    try {
      const response = await apiClient.api.channels[':id'][
        'agent-knowledge'
      ].faqs[':faqId'].$delete({
        param: { id: String(channelId), faqId },
      })
      if (!response.ok) {
        throw new Error(
          await readApiError(response, t('agent.knowledge.faq.deleteFailed')),
        )
      }
      setFaqs((current) => current.filter((faq) => faq.id !== faqId))
      if (editingFaqId === faqId) {
        setEditingFaqId(null)
        setFaqQuestion('')
        setFaqAnswer('')
        setIsFaqDialogOpen(false)
      }
    } catch (reason) {
      setKnowledgeError(
        getErrorMessage(reason, t('agent.knowledge.faq.deleteFailed')),
      )
    } finally {
      setDeletingFaqId(null)
    }
  }

  const saveWebsite = async () => {
    if (!channelId || !websiteForm.url.trim()) return
    setIsSavingWebsite(true)
    setKnowledgeError(null)
    try {
      const payload = toWebsitePayload(websiteForm)
      const response = editingWebsiteId
        ? await apiClient.api.channels[':id']['agent-knowledge'].websites[
            ':websiteId'
          ].$put({
            param: { id: String(channelId), websiteId: editingWebsiteId },
            json: payload,
          })
        : await apiClient.api.channels[':id']['agent-knowledge'].websites.$post(
            {
              param: { id: String(channelId) },
              json: payload,
            },
          )
      if (!response.ok) {
        throw new Error(
          await readApiError(
            response,
            t('agent.knowledge.websites.saveFailed'),
          ),
        )
      }
      const { website } = await response.json()
      setWebsites((current) => [
        ...current.filter((item) => item.id !== website.id),
        website,
      ])
      setEditingWebsiteId(null)
      setWebsiteForm(emptyWebsiteForm())
      setIsWebsiteDialogOpen(false)
    } catch (reason) {
      setKnowledgeError(
        getErrorMessage(reason, t('agent.knowledge.websites.saveFailed')),
      )
    } finally {
      setIsSavingWebsite(false)
    }
  }

  const deleteWebsite = async (websiteId: string) => {
    if (!channelId) return
    setDeletingWebsiteId(websiteId)
    setKnowledgeError(null)
    try {
      const response = await apiClient.api.channels[':id'][
        'agent-knowledge'
      ].websites[':websiteId'].$delete({
        param: { id: String(channelId), websiteId },
      })
      if (!response.ok) {
        throw new Error(
          await readApiError(
            response,
            t('agent.knowledge.websites.deleteFailed'),
          ),
        )
      }
      setWebsites((current) =>
        current.filter((website) => website.id !== websiteId),
      )
      if (editingWebsiteId === websiteId) {
        setEditingWebsiteId(null)
        setWebsiteForm(emptyWebsiteForm())
        setIsWebsiteDialogOpen(false)
      }
    } catch (reason) {
      setKnowledgeError(
        getErrorMessage(reason, t('agent.knowledge.websites.deleteFailed')),
      )
    } finally {
      setDeletingWebsiteId(null)
    }
  }

  const uploadKnowledgeFile = async () => {
    if (!channelId || !selectedKnowledgeFile) return
    setIsUploadingKnowledgeFile(true)
    setKnowledgeError(null)
    try {
      const form = new FormData()
      form.set('file', selectedKnowledgeFile)
      const response = await apiClient.api.channels[':id'][
        'agent-knowledge'
      ].files.$post(
        { param: { id: String(channelId) } },
        { init: { body: form } },
      )
      if (!response.ok) {
        throw new Error(
          await readApiError(response, t('agent.knowledge.files.uploadFailed')),
        )
      }
      const { file } = await response.json()
      setKnowledgeFiles((current) => [
        ...current.filter((item) => item.id !== file.id),
        file,
      ])
      setSelectedKnowledgeFile(null)
      setIsFileDialogOpen(false)
    } catch (reason) {
      setKnowledgeError(
        getErrorMessage(reason, t('agent.knowledge.files.uploadFailed')),
      )
    } finally {
      setIsUploadingKnowledgeFile(false)
    }
  }

  const deleteKnowledgeFile = async (fileId: string) => {
    if (!channelId) return
    setDeletingKnowledgeFileId(fileId)
    setKnowledgeError(null)
    try {
      const response = await apiClient.api.channels[':id'][
        'agent-knowledge'
      ].files[':fileId'].$delete({
        param: { id: String(channelId), fileId },
      })
      if (!response.ok) {
        throw new Error(
          await readApiError(response, t('agent.knowledge.files.deleteFailed')),
        )
      }
      setKnowledgeFiles((current) =>
        current.filter((file) => file.id !== fileId),
      )
    } catch (reason) {
      setKnowledgeError(
        getErrorMessage(reason, t('agent.knowledge.files.deleteFailed')),
      )
    } finally {
      setDeletingKnowledgeFileId(null)
    }
  }

  const hasBusinessInfoChanges =
    JSON.stringify(businessInfo) !== JSON.stringify(savedBusinessInfo)
  const customHandoffMessageMissing =
    handoffMessageSelection === 'CUSTOM' && !handoffMessage.trim()
  const hasBehaviorChanges = Boolean(
    settings &&
    (handoffEnabled !== settings.handoff.enabled ||
      handoffMessageSelection !== settings.handoff.messageSelection ||
      (handoffMessageSelection === 'CUSTOM' &&
        handoffMessage.trim() !== settings.handoff.message) ||
      JSON.stringify(neverSayPhrases) !==
        JSON.stringify(settings.neverSayPhrases)),
  )

  if (isLoading && !channel) {
    return (
      <div className="grid min-h-80 place-items-center text-sm text-muted-foreground">
        {t('agent.loading')}
      </div>
    )
  }

  if (!channel) {
    return (
      <div className="grid gap-4">
        <Link
          className="inline-flex h-10 w-fit items-center justify-center gap-2 rounded-lg border border-transparent px-4 text-sm font-semibold transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/25"
          to="/agents"
        >
          <ChevronLeft className="size-4" />
          {t('agent.back')}
        </Link>
        <p
          className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
          role="alert"
        >
          {error ?? t('agent.channelNotFound')}
        </p>
      </div>
    )
  }

  const registrationPill = registrationStatus ? (
    <Pill
      className="h-10 shrink-0 gap-2 px-4 text-sm"
      tone={registrationStatusTone(registrationStatus)}
    >
      <RadioTower className="size-4" aria-hidden />
      {t(`channels.registration.status.${registrationStatus}`)}
      {registrationProviderStatus ? ` · ${registrationProviderStatus}` : ''}
    </Pill>
  ) : null

  return (
    <div className="grid gap-6">
      <header className="overflow-hidden rounded-2xl border bg-card shadow-xs">
        <div className="flex flex-wrap items-start gap-4 p-5 sm:p-6">
          <Link
            className="grid size-10 shrink-0 place-items-center rounded-full transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/25"
            to="/agents"
            aria-label={t('agent.back')}
          >
            <ChevronLeft className="size-5" />
          </Link>
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
            <Phone className="size-6" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold tracking-[0.12em] text-primary uppercase">
              {t('agent.eyebrow')}
            </p>
            <h1 className="mt-1 text-3xl font-black tracking-tight">
              {channel.name}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {channel.waPhoneNumber}
            </p>
          </div>
          <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
            {status && (
              <Pill
                className="h-10 shrink-0 gap-2 px-4 text-sm"
                tone={statusTone(status)}
              >
                <Bot className="size-4" aria-hidden />
                {t(`agents.status.${status}`)}
              </Pill>
            )}
            {registrationStatus === 'unregistered' ? (
              <Link
                className="rounded-full transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/25"
                to={`/channels/${channel.id}`}
                aria-label={t('channels.registration.manage')}
                title={t('channels.registration.manage')}
              >
                {registrationPill}
              </Link>
            ) : (
              registrationPill
            )}
            <ChannelQrCode
              className="shrink-0"
              phoneNumber={channel.waPhoneNumber}
              size="avatar"
              state={qrState}
            />
          </div>
        </div>
        <dl className="grid gap-4 border-t bg-muted/20 p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-4">
          <ChannelDatum
            label={t('agents.phoneNumberId')}
            value={channel.waPhoneNumberId}
          />
          <ChannelDatum label={t('agents.wabaId')} value={channel.waWabaId} />
          <ChannelDatum
            label={t('agent.businessId')}
            value={channel.waBusinessId}
          />
          <ChannelDatum label={t('agents.appId')} value={channel.waAppId} />
        </dl>
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

      <NumberRegistrationCard
        canManage={canManage}
        channelId={channel.id}
        providerStatus={registrationProviderStatus}
        status={registrationStatus ?? 'error'}
        onRetry={() => void loadAgent()}
      />

      {registrationStatus === 'registered' && status === 'not_configured' && (
        <section className="rounded-2xl border bg-card p-6 shadow-xs">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
                <Sparkles className="size-5" aria-hidden />
              </span>
              <div>
                <h2 className="font-bold">{t('agent.enableTitle')}</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                  {t('agent.enableDescription')}
                </p>
              </div>
            </div>
            {canManage ? (
              <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
                <div className="flex flex-wrap gap-2">
                  <Button
                    className="shrink-0"
                    disabled={isEnabling}
                    isLoading={isCheckingEligibility}
                    variant="outline"
                    onClick={() => void checkEligibility()}
                  >
                    <ShieldCheck className="size-4" aria-hidden />
                    {t('agent.checkEligibility')}
                  </Button>
                  <Button
                    className="shrink-0"
                    disabled={!isEligible || isCheckingEligibility}
                    isLoading={isEnabling}
                    onClick={() => void enableAgent()}
                  >
                    <Bot className="size-4" aria-hidden />
                    {t('agent.enable')}
                  </Button>
                </div>
                {isEligible !== null && (
                  <p
                    className={
                      isEligible
                        ? 'text-xs font-semibold text-success'
                        : 'text-xs font-semibold text-warning'
                    }
                    role="status"
                  >
                    {t(
                      isEligible
                        ? 'agent.eligibilityPassed'
                        : 'agent.eligibilityFailedResult',
                    )}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t('agent.managersOnly')}
              </p>
            )}
          </div>
        </section>
      )}

      {registrationStatus === 'registered' &&
        settings &&
        status !== 'not_configured' && (
          <div className="grid gap-6">
            <Tabs
              ariaLabel={t('agent.tabs.label')}
              items={agentTabValues
                .filter((tab) => tab !== 'import' || canManage)
                .map((tab) => ({
                  value: tab,
                  label: t(`agent.tabs.${tab}`),
                  ...(tab === 'backups' || tab === 'export' || tab === 'import'
                    ? {
                        align: 'end' as const,
                        icon:
                          tab === 'backups' ? (
                            <Archive className="size-4" aria-hidden />
                          ) : tab === 'export' ? (
                            <Download className="size-4" aria-hidden />
                          ) : (
                            <Upload className="size-4" aria-hidden />
                          ),
                      }
                    : {}),
                }))}
              variant="pills"
              value={activeTab}
              onValueChange={setActiveTab}
            />

            {activeTab === 'backups' ? (
              <AgentBackupsPanel
                backups={backups}
                canManage={canManage}
                error={backupsError}
                loading={isLoadingBackups}
                onBackup={openBackupDialog}
                onRestore={(backup) => void restoreBackup(backup)}
                restoringBackupId={restoringBackupId}
              />
            ) : activeTab === 'export' ? (
              <AgentExportPanel
                complete={exportComplete}
                currentStep={exportStep}
                error={exportError}
                exporting={isExporting}
                onExport={exportAgent}
              />
            ) : activeTab === 'import' ? (
              <AgentImportPanel
                complete={importComplete}
                connectorInputs={importConnectorInputs}
                createBackupBeforeImport={createBackupBeforeImport}
                selectedComponents={importComponents}
                currentStep={importStep}
                itemProgress={importItemProgress}
                error={importError}
                failureMayBePartial={importFailureMayBePartial}
                files={importFiles}
                importing={isImporting}
                inspecting={isInspectingImport}
                inspection={importInspection}
                loadingPreview={isLoadingImportPreview}
                packageFile={importPackage}
                preview={importPreview}
                onConnectorInputChange={(name, value) =>
                  setImportConnectorInputs((current) => ({
                    ...current,
                    [name]: value,
                  }))
                }
                onCreateBackupBeforeImportChange={setCreateBackupBeforeImport}
                onComponentChange={(component, selected) =>
                  setImportComponents((current) => ({
                    ...current,
                    [component]: selected,
                  }))
                }
                onFileChange={(providerFileId, file) =>
                  setImportFiles((current) => {
                    const next = { ...current }
                    if (file) next[providerFileId] = file
                    else delete next[providerFileId]
                    return next
                  })
                }
                onImport={() => void importAgent()}
                onInspect={() => void inspectAgentImport()}
                onPackageChange={(file) => void selectImportPackage(file)}
              />
            ) : activeTab === 'overview' ? (
              <div className="grid items-start gap-6" role="tabpanel">
                <section className="overflow-hidden rounded-2xl border bg-card shadow-xs">
                  <div className="flex items-start gap-4 p-6">
                    <span
                      className={
                        settings.rolloutEnabled
                          ? 'grid size-11 shrink-0 place-items-center rounded-xl bg-success/12 text-success'
                          : 'grid size-11 shrink-0 place-items-center rounded-xl bg-destructive/12 text-destructive'
                      }
                    >
                      <Zap className="size-5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-bold">
                          {t('agent.rollout.title')}
                        </h2>
                        <Pill
                          tone={settings.rolloutEnabled ? 'success' : 'danger'}
                        >
                          {t(
                            settings.rolloutEnabled
                              ? 'agents.status.enabled'
                              : 'agents.status.disabled',
                          )}
                        </Pill>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {t('agent.rollout.description')}
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-end border-t bg-muted/10 p-5">
                    {canManage ? (
                      <Button
                        isLoading={isSavingRollout}
                        variant={settings.rolloutEnabled ? 'danger' : 'success'}
                        onClick={() => void toggleRollout()}
                      >
                        <Zap className="size-4" aria-hidden />
                        {t(
                          settings.rolloutEnabled
                            ? 'agent.rollout.disable'
                            : 'agent.rollout.enable',
                        )}
                      </Button>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {t('agent.managersOnly')}
                      </p>
                    )}
                  </div>
                </section>

                <section className="overflow-hidden rounded-2xl border bg-card shadow-xs">
                  <div className="flex items-start gap-4 p-6">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
                      <Users className="size-5" aria-hidden />
                    </span>
                    <div>
                      <h2 className="font-bold">{t('agent.audience.title')}</h2>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {t('agent.audience.description')}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 border-t bg-muted/10 p-5 sm:flex-row sm:items-end">
                    <div className="min-w-0 flex-1">
                      <Select
                        disabled={!canManage || isSavingAudience}
                        label={t('agent.audience.label')}
                        value={selectedAudience}
                        onChange={(event) =>
                          setSelectedAudience(
                            event.target.value as AgentAudience,
                          )
                        }
                      >
                        <option value="EVERYONE">
                          {t('agent.audience.everyone')}
                        </option>
                        <option value="ALLOWLISTED_ONLY">
                          {t('agent.audience.allowlistedOnly')}
                        </option>
                      </Select>
                    </div>
                    {canManage && (
                      <Button
                        className="mb-5 shrink-0"
                        disabled={selectedAudience === settings.audience}
                        isLoading={isSavingAudience}
                        onClick={() => void saveAudience()}
                      >
                        {t('agent.audience.save')}
                      </Button>
                    )}
                  </div>

                  {settings.audience === 'ALLOWLISTED_ONLY' && (
                    <div className="border-t p-6">
                      <h3 className="text-sm font-bold">
                        {t('agent.allowlist.title')}
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t('agent.allowlist.description')}
                      </p>

                      {canManage && (
                        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
                          <div className="min-w-0 flex-1">
                            <Input
                              label={t('agent.allowlist.phoneNumber')}
                              placeholder="+5511999999999"
                              type="tel"
                              value={allowlistPhoneNumber}
                              onChange={(event) =>
                                setAllowlistPhoneNumber(event.target.value)
                              }
                            />
                          </div>
                          <Button
                            className="mb-5 shrink-0"
                            disabled={
                              !/^\+[1-9]\d{1,14}$/.test(
                                allowlistPhoneNumber.trim(),
                              )
                            }
                            isLoading={isAddingAllowlistEntry}
                            onClick={() => void addAllowlistEntry()}
                          >
                            {t('agent.allowlist.add')}
                          </Button>
                        </div>
                      )}

                      <div className="mt-4 overflow-hidden rounded-xl border">
                        {isLoadingAllowlist ? (
                          <p className="p-4 text-sm text-muted-foreground">
                            {t('agent.allowlist.loading')}
                          </p>
                        ) : allowlist.length === 0 ? (
                          <p className="p-4 text-sm text-muted-foreground">
                            {t('agent.allowlist.empty')}
                          </p>
                        ) : (
                          <ul className="divide-y">
                            {allowlist.map((entry) => (
                              <li
                                className="flex min-w-0 items-center gap-3 px-4 py-3"
                                key={entry.id}
                              >
                                <Phone
                                  className="size-4 shrink-0 text-muted-foreground"
                                  aria-hidden
                                />
                                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                                  {entry.phoneNumber ??
                                    t('agent.allowlist.unknown')}
                                </span>
                                {canManage && (
                                  <Button
                                    aria-label={t('agent.allowlist.remove', {
                                      phoneNumber:
                                        entry.phoneNumber ?? entry.id,
                                    })}
                                    disabled={removingAllowlistEntryId !== null}
                                    isLoading={
                                      removingAllowlistEntryId === entry.id
                                    }
                                    size="icon"
                                    variant="ghost"
                                    onClick={() =>
                                      void removeAllowlistEntry(entry.id)
                                    }
                                  >
                                    <Trash2 className="size-4" aria-hidden />
                                  </Button>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  )}
                </section>

                <section className="overflow-hidden rounded-2xl border bg-card shadow-xs">
                  <form
                    aria-busy={isSavingBehavior}
                    onSubmit={(event) => {
                      event.preventDefault()
                      void saveBehavior()
                    }}
                  >
                    <div className="flex items-start gap-4 p-6">
                      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
                        <ShieldCheck className="size-5" aria-hidden />
                      </span>
                      <div>
                        <h2 className="font-bold">
                          {t('agent.behavior.title')}
                        </h2>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                          {t('agent.behavior.description')}
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-6 border-t p-6">
                      <div className="grid gap-4 rounded-xl border bg-muted/10 p-4">
                        <Switch
                          checked={handoffEnabled}
                          description={t('agent.behavior.handoffDescription')}
                          disabled={!canManage || isSavingBehavior}
                          label={t('agent.behavior.handoffEnabled')}
                          onChange={(event) =>
                            setHandoffEnabled(event.target.checked)
                          }
                        />

                        <Select
                          disabled={!canManage || isSavingBehavior}
                          hint={t('agent.behavior.messageTypeHint')}
                          label={t('agent.behavior.messageType')}
                          value={handoffMessageSelection}
                          onChange={(event) =>
                            setHandoffMessageSelection(
                              event.target.value as HandoffMessageSelection,
                            )
                          }
                        >
                          <option value="DEFAULT">
                            {t('agent.behavior.messageTypes.default')}
                          </option>
                          <option value="AGENT">
                            {t('agent.behavior.messageTypes.agent')}
                          </option>
                          <option value="CUSTOM">
                            {t('agent.behavior.messageTypes.custom')}
                          </option>
                        </Select>

                        {handoffMessageSelection === 'CUSTOM' && (
                          <Textarea
                            disabled={!canManage || isSavingBehavior}
                            error={
                              customHandoffMessageMissing
                                ? t('agent.behavior.customMessageRequired')
                                : undefined
                            }
                            label={t('agent.behavior.customMessage')}
                            maxLength={10_000}
                            required
                            rows={3}
                            value={handoffMessage}
                            onChange={(event) =>
                              setHandoffMessage(event.target.value)
                            }
                          />
                        )}
                      </div>

                      <TagInput
                        disabled={!canManage || isSavingBehavior}
                        getRemoveLabel={(phrase) =>
                          t('agent.behavior.removeNeverSayPhrase', { phrase })
                        }
                        hint={t('agent.behavior.neverSayHint')}
                        label={t('agent.behavior.neverSayPhrases')}
                        maxLength={500}
                        placeholder={t('agent.behavior.neverSayPlaceholder')}
                        value={neverSayPhrases}
                        onValueChange={setNeverSayPhrases}
                      />
                    </div>

                    <div className="flex justify-end border-t bg-muted/10 p-5">
                      {canManage ? (
                        <Button
                          disabled={
                            !hasBehaviorChanges || customHandoffMessageMissing
                          }
                          isLoading={isSavingBehavior}
                          type="submit"
                        >
                          {t('agent.behavior.save')}
                        </Button>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          {t('agent.managersOnly')}
                        </p>
                      )}
                    </div>
                  </form>
                </section>

                <section className="overflow-hidden rounded-2xl border border-destructive/30 bg-card shadow-xs">
                  <div className="flex items-start gap-4 p-6">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-destructive/12 text-destructive">
                      <AlertTriangle className="size-5" aria-hidden />
                    </span>
                    <div>
                      <h2 className="font-bold text-destructive">
                        {t('agent.danger.title')}
                      </h2>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {t('agent.danger.description')}
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-end border-t border-destructive/20 bg-destructive/5 p-5">
                    {canManage ? (
                      <Button
                        variant="danger"
                        onClick={() => {
                          setDeleteError(null)
                          setIsDeleteDialogOpen(true)
                        }}
                      >
                        <Trash2 className="size-4" aria-hidden />
                        {t('agent.danger.delete')}
                      </Button>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {t('agent.managersOnly')}
                      </p>
                    )}
                  </div>
                </section>
              </div>
            ) : activeTab === 'businessInfo' ? (
              <section
                className="overflow-hidden rounded-2xl border bg-card shadow-xs"
                role="tabpanel"
                aria-busy={isLoadingBusinessInfo}
              >
                <form
                  onSubmit={(event) => {
                    event.preventDefault()
                    void saveBusinessInfo()
                  }}
                >
                  <div className="flex items-start gap-4 p-6">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
                      <Building2 className="size-5" aria-hidden />
                    </span>
                    <div>
                      <h2 className="font-bold">
                        {t('agent.businessInfo.title')}
                      </h2>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {t('agent.businessInfo.description')}
                      </p>
                    </div>
                  </div>

                  {businessInfoError && (
                    <p
                      className="mx-6 mb-6 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                      role="alert"
                    >
                      {businessInfoError}
                    </p>
                  )}

                  {isLoadingBusinessInfo ? (
                    <p className="border-t p-6 text-sm text-muted-foreground">
                      {t('agent.businessInfo.loading')}
                    </p>
                  ) : (
                    <div className="grid gap-x-5 gap-y-2 border-t p-6 md:grid-cols-2">
                      <fieldset
                        className="contents"
                        disabled={!canManage || isSavingBusinessInfo}
                      >
                        <Textarea
                          className="md:min-h-28"
                          label={t('agent.businessInfo.businessDescription')}
                          value={businessInfo.businessDescription}
                          onChange={(event) =>
                            updateBusinessInfoField(
                              'businessDescription',
                              event.target.value,
                            )
                          }
                        />
                        <Textarea
                          className="md:min-h-28"
                          label={t('agent.businessInfo.purchaseInfo')}
                          value={businessInfo.purchaseInfo}
                          onChange={(event) =>
                            updateBusinessInfoField(
                              'purchaseInfo',
                              event.target.value,
                            )
                          }
                        />
                        <Textarea
                          label={t('agent.businessInfo.deliveryAndShipping')}
                          value={businessInfo.deliveryAndShipping}
                          onChange={(event) =>
                            updateBusinessInfoField(
                              'deliveryAndShipping',
                              event.target.value,
                            )
                          }
                        />
                        <Textarea
                          label={t('agent.businessInfo.returnPolicy')}
                          value={businessInfo.returnPolicy}
                          onChange={(event) =>
                            updateBusinessInfoField(
                              'returnPolicy',
                              event.target.value,
                            )
                          }
                        />
                        <Input
                          label={t('agent.businessInfo.paymentMethod')}
                          value={businessInfo.paymentMethod}
                          onChange={(event) =>
                            updateBusinessInfoField(
                              'paymentMethod',
                              event.target.value,
                            )
                          }
                        />
                        <Input
                          label={t('agent.businessInfo.contactEmail')}
                          type="email"
                          value={businessInfo.contactEmail}
                          onChange={(event) =>
                            updateBusinessInfoField(
                              'contactEmail',
                              event.target.value,
                            )
                          }
                        />
                        <Input
                          label={t('agent.businessInfo.hoursOfOperation')}
                          value={businessInfo.hoursOfOperation}
                          onChange={(event) =>
                            updateBusinessInfoField(
                              'hoursOfOperation',
                              event.target.value,
                            )
                          }
                        />
                        <Input
                          label={t('agent.businessInfo.address')}
                          value={businessInfo.address}
                          onChange={(event) =>
                            updateBusinessInfoField(
                              'address',
                              event.target.value,
                            )
                          }
                        />
                      </fieldset>
                    </div>
                  )}

                  <div className="flex justify-end border-t bg-muted/10 p-5">
                    {canManage ? (
                      <Button
                        disabled={
                          isLoadingBusinessInfo || !hasBusinessInfoChanges
                        }
                        isLoading={isSavingBusinessInfo}
                        type="submit"
                      >
                        {t('agent.businessInfo.save')}
                      </Button>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {t('agent.managersOnly')}
                      </p>
                    )}
                  </div>
                </form>
              </section>
            ) : activeTab === 'skills' ? (
              <div className="grid gap-6" role="tabpanel">
                {skillError && !isSkillDialogOpen && (
                  <p
                    className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                    role="alert"
                  >
                    {skillError}
                  </p>
                )}
                <KnowledgeListCard
                  action={
                    canManage ? (
                      <Button
                        onClick={() => {
                          setEditingSkillId(null)
                          setSkillTitle('')
                          setSkillDescription('')
                          setSkillInstructions('')
                          setSkillError(null)
                          setIsSkillDialogOpen(true)
                        }}
                      >
                        <Plus className="size-4" aria-hidden />
                        {t('agent.skills.add')}
                      </Button>
                    ) : undefined
                  }
                  icon={<Sparkles className="size-5" aria-hidden />}
                  title={t('agent.skills.listTitle')}
                  isLoading={isLoadingSkills}
                  loadingLabel={t('agent.skills.loading')}
                  emptyLabel={t('agent.skills.empty')}
                  isEmpty={skills.length === 0}
                >
                  <ul className="divide-y">
                    {skills.map((skill) => (
                      <li className="flex items-start gap-4 p-5" key={skill.id}>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold">{skill.title}</p>
                            {skill.status && (
                              <Pill
                                tone={
                                  skill.status === 'active'
                                    ? 'success'
                                    : 'neutral'
                                }
                              >
                                {t(`agent.skills.status.${skill.status}`)}
                              </Pill>
                            )}
                          </div>
                          {skill.description && (
                            <p className="mt-1 text-sm leading-6 text-muted-foreground">
                              {skill.description}
                            </p>
                          )}
                        </div>
                        {canManage && (
                          <div className="flex shrink-0 gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditingSkillId(skill.id)
                                setSkillTitle(skill.title)
                                setSkillDescription(skill.description)
                                setSkillInstructions(skill.skill)
                                setSkillError(null)
                                setIsSkillDialogOpen(true)
                              }}
                            >
                              {t('agent.skills.edit')}
                            </Button>
                            <Button
                              aria-label={t('agent.skills.delete', {
                                title: skill.title,
                              })}
                              disabled={deletingSkillId !== null}
                              isLoading={deletingSkillId === skill.id}
                              size="icon"
                              variant="ghost"
                              onClick={() => void deleteSkill(skill.id)}
                            >
                              <Trash2 className="size-4" aria-hidden />
                            </Button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </KnowledgeListCard>
              </div>
            ) : activeTab === 'knowledgeBase' ? (
              <div className="grid gap-6" role="tabpanel">
                <Tabs
                  ariaLabel={t('agent.knowledge.tabsLabel')}
                  items={(['faq', 'websites', 'files'] as const).map((tab) => ({
                    value: tab,
                    label: t(`agent.knowledge.tabs.${tab}`),
                  }))}
                  value={knowledgeTab}
                  variant="pills"
                  onValueChange={setKnowledgeTab}
                />

                {knowledgeError && (
                  <p
                    className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                    role="alert"
                  >
                    {knowledgeError}
                  </p>
                )}

                {knowledgeTab === 'faq' && (
                  <KnowledgeListCard
                    action={
                      canManage ? (
                        <Button
                          onClick={() => {
                            setEditingFaqId(null)
                            setFaqQuestion('')
                            setFaqAnswer('')
                            setKnowledgeError(null)
                            setIsFaqDialogOpen(true)
                          }}
                        >
                          <Plus className="size-4" aria-hidden />
                          {t('agent.knowledge.faq.add')}
                        </Button>
                      ) : undefined
                    }
                    icon={<BookOpen className="size-5" aria-hidden />}
                    title={t('agent.knowledge.faq.listTitle')}
                    isLoading={isLoadingKnowledge}
                    loadingLabel={t('agent.knowledge.loading')}
                    emptyLabel={t('agent.knowledge.faq.empty')}
                    isEmpty={faqs.length === 0}
                  >
                    <ul className="divide-y">
                      {faqs.map((faq) => (
                        <li className="flex items-start gap-4 p-5" key={faq.id}>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold">{faq.question}</p>
                            <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                              {faq.answer}
                            </p>
                          </div>
                          {canManage && (
                            <div className="flex shrink-0 gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setEditingFaqId(faq.id)
                                  setFaqQuestion(faq.question)
                                  setFaqAnswer(faq.answer)
                                  setKnowledgeError(null)
                                  setIsFaqDialogOpen(true)
                                }}
                              >
                                {t('agent.knowledge.edit')}
                              </Button>
                              <Button
                                aria-label={t('agent.knowledge.faq.delete', {
                                  question: faq.question,
                                })}
                                disabled={deletingFaqId !== null}
                                isLoading={deletingFaqId === faq.id}
                                size="icon"
                                variant="ghost"
                                onClick={() => void deleteFaq(faq.id)}
                              >
                                <Trash2 className="size-4" aria-hidden />
                              </Button>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </KnowledgeListCard>
                )}

                {knowledgeTab === 'websites' && (
                  <KnowledgeListCard
                    action={
                      canManage ? (
                        <Button
                          onClick={() => {
                            setEditingWebsiteId(null)
                            setWebsiteForm(emptyWebsiteForm())
                            setKnowledgeError(null)
                            setIsWebsiteDialogOpen(true)
                          }}
                        >
                          <Plus className="size-4" aria-hidden />
                          {t('agent.knowledge.websites.add')}
                        </Button>
                      ) : undefined
                    }
                    icon={<Globe2 className="size-5" aria-hidden />}
                    title={t('agent.knowledge.websites.listTitle')}
                    isLoading={isLoadingKnowledge}
                    loadingLabel={t('agent.knowledge.loading')}
                    emptyLabel={t('agent.knowledge.websites.empty')}
                    isEmpty={websites.length === 0}
                  >
                    <ul className="divide-y">
                      {websites.map((website) => (
                        <li
                          className="flex items-start gap-4 p-5"
                          key={website.id}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="break-all font-semibold">
                              {website.url}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {website.crawlStatus ??
                                t('agent.knowledge.websites.statusUnknown')}
                              {website.pagesCrawled === null
                                ? ''
                                : ` · ${t('agent.knowledge.websites.pages', { count: website.pagesCrawled })}`}
                            </p>
                          </div>
                          {canManage && (
                            <div className="flex shrink-0 gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setEditingWebsiteId(website.id)
                                  setWebsiteForm(toWebsiteForm(website))
                                  setKnowledgeError(null)
                                  setIsWebsiteDialogOpen(true)
                                }}
                              >
                                {t('agent.knowledge.edit')}
                              </Button>
                              <Button
                                aria-label={t(
                                  'agent.knowledge.websites.delete',
                                  {
                                    url: website.url,
                                  },
                                )}
                                disabled={deletingWebsiteId !== null}
                                isLoading={deletingWebsiteId === website.id}
                                size="icon"
                                variant="ghost"
                                onClick={() => void deleteWebsite(website.id)}
                              >
                                <Trash2 className="size-4" aria-hidden />
                              </Button>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </KnowledgeListCard>
                )}

                {knowledgeTab === 'files' && (
                  <KnowledgeListCard
                    action={
                      canManage ? (
                        <Button
                          onClick={() => {
                            setSelectedKnowledgeFile(null)
                            setKnowledgeError(null)
                            setIsFileDialogOpen(true)
                          }}
                        >
                          <Plus className="size-4" aria-hidden />
                          {t('agent.knowledge.files.upload')}
                        </Button>
                      ) : undefined
                    }
                    icon={<FileText className="size-5" aria-hidden />}
                    title={t('agent.knowledge.files.listTitle')}
                    isLoading={isLoadingKnowledge}
                    loadingLabel={t('agent.knowledge.loading')}
                    emptyLabel={t('agent.knowledge.files.empty')}
                    isEmpty={knowledgeFiles.length === 0}
                  >
                    <ul className="divide-y">
                      {knowledgeFiles.map((file) => (
                        <li
                          className="flex items-center gap-4 p-5"
                          key={file.id}
                        >
                          <FileText
                            className="size-5 shrink-0 text-muted-foreground"
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1 truncate font-semibold">
                            {file.fileName}
                          </span>
                          {canManage && (
                            <Button
                              aria-label={t('agent.knowledge.files.delete', {
                                fileName: file.fileName,
                              })}
                              disabled={deletingKnowledgeFileId !== null}
                              isLoading={deletingKnowledgeFileId === file.id}
                              size="icon"
                              variant="ghost"
                              onClick={() => void deleteKnowledgeFile(file.id)}
                            >
                              <Trash2 className="size-4" aria-hidden />
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </KnowledgeListCard>
                )}
              </div>
            ) : activeTab === 'qrCodes' ? (
              <div role="tabpanel">
                <QrCodesSettingsCard
                  channelId={channel.id}
                  phoneNumber={channel.waPhoneNumber}
                  canManage={canManage}
                  state={qrState}
                  onChanged={() => {
                    setQrState(emptyChannelQrState('loading'))
                    void fetchChannelQrState(channel.id).then(setQrState)
                  }}
                />
              </div>
            ) : activeTab === 'components' ? (
              <div role="tabpanel">
                <ConversationalComponentsSettingsCard
                  channelId={channel.id}
                  canManage={canManage}
                />
              </div>
            ) : activeTab === 'connectors' ? (
              <div className="grid gap-6" role="tabpanel">
                {connectorError && (
                  <p
                    className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                    role="alert"
                  >
                    {connectorError}
                  </p>
                )}
                <KnowledgeListCard
                  action={
                    canManage ? (
                      <Link
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-xs transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/25"
                        to={`/agents/${channel.id}/connectors/new`}
                      >
                        <Plus className="size-4" aria-hidden />
                        {t('agent.connectors.add')}
                      </Link>
                    ) : undefined
                  }
                  icon={<Plug className="size-5" aria-hidden />}
                  title={t('agent.connectors.title')}
                  isLoading={isLoadingConnectors}
                  loadingLabel={t('agent.connectors.loading')}
                  emptyLabel={t('agent.connectors.empty')}
                  isEmpty={connectors.length === 0}
                >
                  <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
                    {connectors.map((connector) => (
                      <Link
                        className="group flex min-h-44 flex-col overflow-hidden rounded-xl border bg-background transition hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/25"
                        key={connector.id}
                        to={`/agents/${channel.id}/connectors/${encodeURIComponent(connector.id)}`}
                      >
                        <div className="flex items-start gap-3 p-5">
                          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
                            <Plug className="size-5" aria-hidden />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-bold group-hover:text-primary">
                              {connector.name}
                            </p>
                            <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground">
                              {connector.description}
                            </p>
                          </div>
                        </div>
                        <div className="mt-auto flex items-center justify-between gap-3 border-t bg-muted/20 px-5 py-3">
                          <span className="truncate text-xs text-muted-foreground">
                            {connector.connectorProtocol} ·{' '}
                            {t(connectorAuthKey(connector.authType))}
                          </span>
                          <Pill
                            tone={connectorStatusTone(
                              connector.connectionStatus,
                            )}
                          >
                            {t(connectorStatusKey(connector.connectionStatus))}
                          </Pill>
                        </div>
                      </Link>
                    ))}
                  </div>
                </KnowledgeListCard>
              </div>
            ) : activeTab === 'evals' ? (
              <div className="grid gap-6" role="tabpanel">
                {evaluationError && (
                  <p
                    className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                    role="alert"
                  >
                    {evaluationError}
                  </p>
                )}
                <KnowledgeListCard
                  icon={<FlaskConical className="size-5" aria-hidden />}
                  title={t('agent.evals.title')}
                  isLoading={isLoadingEvaluations}
                  loadingLabel={t('agent.evals.loading')}
                  emptyLabel={t('agent.evals.empty')}
                  isEmpty={evaluationCases.length === 0}
                >
                  <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
                    {evaluationCases.map((evaluation) => (
                      <Link
                        className="group flex min-h-44 flex-col overflow-hidden rounded-xl border bg-background transition hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/25"
                        key={evaluation.id}
                        to={`/agents/${channel.id}/evals/${encodeURIComponent(evaluation.id)}`}
                      >
                        <div className="flex items-start gap-3 p-5">
                          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
                            <FlaskConical className="size-5" aria-hidden />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 font-bold group-hover:text-primary">
                              {evaluation.scenario}
                            </p>
                            <p className="mt-1 truncate text-xs text-muted-foreground">
                              {evaluation.id}
                            </p>
                          </div>
                        </div>
                        <div className="mt-auto flex flex-wrap items-center gap-2 border-t bg-muted/20 px-5 py-3">
                          {evaluation.categories.slice(0, 2).map((category) => (
                            <Pill key={category}>{category}</Pill>
                          ))}
                          <span className="ml-auto text-xs text-muted-foreground">
                            {evaluation.maxTurns === null
                              ? t('agent.evals.turnsUnavailable')
                              : t('agent.evals.maxTurns', {
                                  count: evaluation.maxTurns,
                                })}
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </KnowledgeListCard>
              </div>
            ) : (
              <section
                className="grid min-h-40 place-items-center rounded-2xl border bg-card p-6 text-center shadow-xs"
                role="tabpanel"
              >
                <div>
                  <h2 className="font-bold">{t('agent.title')}</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t('agent.tabs.pending')}
                  </p>
                </div>
              </section>
            )}
          </div>
        )}

      <Dialog
        dismissible={!isCreatingBackup}
        open={isBackupDialogOpen}
        size="lg"
        title={
          isCreatingBackup || backupStep || backupComplete || backupError
            ? t('agent.backups.progressTitle')
            : t('agent.backups.confirmTitle')
        }
        description={
          isCreatingBackup || backupStep || backupComplete || backupError
            ? t('agent.backups.progressDescription')
            : t('agent.backups.confirmDescription')
        }
        icon={
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
            <Archive className="size-5" aria-hidden />
          </span>
        }
        onOpenChange={(open) => {
          if (!isCreatingBackup) setIsBackupDialogOpen(open)
        }}
      >
        <div className="grid w-full gap-4">
          {isCreatingBackup || backupStep || backupComplete || backupError ? (
            <>
              <AgentBackupProgress
                complete={backupComplete}
                currentStep={backupStep}
                error={backupError}
                running={isCreatingBackup}
              />
              {!isCreatingBackup && (
                <div className="flex justify-end">
                  <Button onClick={() => setIsBackupDialogOpen(false)}>
                    {t('agent.backups.close')}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setIsBackupDialogOpen(false)}
              >
                {t('agent.backups.cancel')}
              </Button>
              <Button onClick={() => void createBackup()}>
                <Archive className="size-4" aria-hidden />
                {t('agent.backups.confirm')}
              </Button>
            </div>
          )}
        </div>
      </Dialog>

      <Dialog
        dismissible={!isSavingSkill}
        open={isSkillDialogOpen}
        title={
          editingSkillId ? t('agent.skills.update') : t('agent.skills.add')
        }
        description={t('agent.skills.description')}
        icon={
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
            <Sparkles className="size-5" aria-hidden />
          </span>
        }
        onOpenChange={(open) => {
          if (!isSavingSkill && !open) closeSkillDialog()
        }}
      >
        <div className="grid w-full gap-4">
          <Input
            disabled={isSavingSkill}
            error={
              skillTitle.trim() && !isKebabCase(skillTitle.trim())
                ? t('agent.skills.titleError')
                : undefined
            }
            hint={t('agent.skills.titleHint')}
            label={t('agent.skills.title')}
            maxLength={64}
            placeholder="order-status"
            value={skillTitle}
            onChange={(event) =>
              setSkillTitle(toDelimitedName(event.target.value, '-'))
            }
          />
          <Textarea
            disabled={isSavingSkill}
            label={t('agent.skills.skillDescription')}
            maxLength={1024}
            value={skillDescription}
            onChange={(event) => setSkillDescription(event.target.value)}
          />
          <Textarea
            className="min-h-40"
            disabled={isSavingSkill}
            label={t('agent.skills.instructions')}
            maxLength={20000}
            value={skillInstructions}
            onChange={(event) => setSkillInstructions(event.target.value)}
          />
          <KnowledgeDialogError message={skillError} />
          <div className="flex justify-end gap-2">
            <Button
              disabled={isSavingSkill}
              variant="ghost"
              onClick={closeSkillDialog}
            >
              {t('agent.skills.cancel')}
            </Button>
            <Button
              disabled={
                !isKebabCase(skillTitle.trim()) || !skillInstructions.trim()
              }
              isLoading={isSavingSkill}
              onClick={() => void saveSkill()}
            >
              {editingSkillId
                ? t('agent.skills.update')
                : t('agent.skills.add')}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        dismissible={!isSavingFaq}
        open={isFaqDialogOpen}
        title={
          editingFaqId
            ? t('agent.knowledge.faq.update')
            : t('agent.knowledge.faq.add')
        }
        description={t('agent.knowledge.faq.description')}
        icon={
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
            <BookOpen className="size-5" aria-hidden />
          </span>
        }
        onOpenChange={(open) => {
          if (!isSavingFaq) {
            setIsFaqDialogOpen(open)
            if (!open) {
              setEditingFaqId(null)
              setFaqQuestion('')
              setFaqAnswer('')
              setKnowledgeError(null)
            }
          }
        }}
      >
        <div className="grid w-full gap-4">
          <Input
            disabled={isSavingFaq}
            label={t('agent.knowledge.faq.question')}
            value={faqQuestion}
            onChange={(event) => setFaqQuestion(event.target.value)}
          />
          <Textarea
            disabled={isSavingFaq}
            label={t('agent.knowledge.faq.answer')}
            value={faqAnswer}
            onChange={(event) => setFaqAnswer(event.target.value)}
          />
          <KnowledgeDialogError message={knowledgeError} />
          <div className="flex justify-end gap-2">
            <Button
              disabled={isSavingFaq}
              variant="ghost"
              onClick={() => setIsFaqDialogOpen(false)}
            >
              {t('agent.knowledge.cancel')}
            </Button>
            <Button
              disabled={!faqQuestion.trim() || !faqAnswer.trim()}
              isLoading={isSavingFaq}
              onClick={() => void saveFaq()}
            >
              {editingFaqId
                ? t('agent.knowledge.faq.update')
                : t('agent.knowledge.faq.add')}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        dismissible={!isSavingWebsite}
        open={isWebsiteDialogOpen}
        size="lg"
        title={
          editingWebsiteId
            ? t('agent.knowledge.websites.update')
            : t('agent.knowledge.websites.add')
        }
        description={t('agent.knowledge.websites.description')}
        icon={
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
            <Globe2 className="size-5" aria-hidden />
          </span>
        }
        onOpenChange={(open) => {
          if (!isSavingWebsite) {
            setIsWebsiteDialogOpen(open)
            if (!open) {
              setEditingWebsiteId(null)
              setWebsiteForm(emptyWebsiteForm())
              setKnowledgeError(null)
            }
          }
        }}
      >
        <div className="grid w-full gap-4">
          <Input
            disabled={isSavingWebsite}
            label={t('agent.knowledge.websites.url')}
            placeholder="https://example.com"
            type="url"
            value={websiteForm.url}
            onChange={(event) =>
              setWebsiteForm((current) => ({
                ...current,
                url: event.target.value,
              }))
            }
          />
          <div className="grid gap-x-4 md:grid-cols-2">
            {websiteListFields.map((field) => (
              <TagInput
                disabled={isSavingWebsite}
                getRemoveLabel={(tag) =>
                  t('agent.knowledge.websites.removeTag', { tag })
                }
                key={field}
                label={t(`agent.knowledge.websites.${field}`)}
                hint={t('agent.knowledge.websites.tagHint')}
                placeholder={t('agent.knowledge.websites.tagPlaceholder')}
                value={websiteForm[field]}
                onValueChange={(value) =>
                  setWebsiteForm((current) => ({
                    ...current,
                    [field]: value,
                  }))
                }
              />
            ))}
          </div>
          <KnowledgeDialogError message={knowledgeError} />
          <div className="flex justify-end gap-2">
            <Button
              disabled={isSavingWebsite}
              variant="ghost"
              onClick={() => setIsWebsiteDialogOpen(false)}
            >
              {t('agent.knowledge.cancel')}
            </Button>
            <Button
              disabled={!websiteForm.url.trim()}
              isLoading={isSavingWebsite}
              onClick={() => void saveWebsite()}
            >
              {editingWebsiteId
                ? t('agent.knowledge.websites.update')
                : t('agent.knowledge.websites.add')}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        dismissible={!isUploadingKnowledgeFile}
        open={isFileDialogOpen}
        title={t('agent.knowledge.files.uploadTitle')}
        description={t('agent.knowledge.files.description')}
        icon={
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
            <Upload className="size-5" aria-hidden />
          </span>
        }
        onOpenChange={(open) => {
          if (!isUploadingKnowledgeFile) {
            setIsFileDialogOpen(open)
            if (!open) {
              setSelectedKnowledgeFile(null)
              setKnowledgeError(null)
            }
          }
        }}
      >
        <div className="grid w-full gap-4">
          <label className="grid gap-1.5 text-sm">
            <span className="font-semibold">
              {t('agent.knowledge.files.file')}
            </span>
            <span className="flex h-11 min-w-0 cursor-pointer items-center overflow-hidden rounded-lg border border-input bg-card shadow-xs transition hover:bg-muted/40 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/15">
              <span className="flex h-full shrink-0 items-center border-r bg-muted/60 px-3.5 font-semibold">
                {t('agent.knowledge.files.chooseFile')}
              </span>
              <span className="min-w-0 flex-1 truncate px-3.5 text-muted-foreground">
                {selectedKnowledgeFile?.name ??
                  t('agent.knowledge.files.noFileSelected')}
              </span>
              <input
                key={selectedKnowledgeFile?.name ?? 'empty-file'}
                className="sr-only"
                accept=".csv,.doc,.docx,.jpeg,.jpg,.pdf,.png,.xlsx"
                disabled={isUploadingKnowledgeFile}
                type="file"
                onChange={(event) =>
                  setSelectedKnowledgeFile(event.target.files?.[0] ?? null)
                }
              />
            </span>
          </label>
          <KnowledgeDialogError message={knowledgeError} />
          <div className="flex justify-end gap-2">
            <Button
              disabled={isUploadingKnowledgeFile}
              variant="ghost"
              onClick={() => setIsFileDialogOpen(false)}
            >
              {t('agent.knowledge.cancel')}
            </Button>
            <Button
              disabled={!selectedKnowledgeFile}
              isLoading={isUploadingKnowledgeFile}
              onClick={() => void uploadKnowledgeFile()}
            >
              <Upload className="size-4" aria-hidden />
              {t('agent.knowledge.files.upload')}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        dismissible={!isDeleting}
        open={isDeleteDialogOpen}
        title={t('agent.danger.dialogTitle')}
        description={t('agent.danger.dialogDescription', {
          phoneNumber: channel.waPhoneNumber,
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
              {t('agent.danger.cancel')}
            </Button>
            <Button
              isLoading={isDeleting}
              variant="danger"
              onClick={() => void deleteAgent()}
            >
              {t('agent.danger.confirm')}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}

const websiteListFields = [
  'includedSubDomains',
  'includedUrlPatterns',
  'excludedSubDomains',
  'excludedUrlPatterns',
  'singleUrls',
] as const

function toWebsitePayload(form: WebsiteForm) {
  return {
    url: form.url.trim(),
    includedSubDomains: form.includedSubDomains,
    includedUrlPatterns: form.includedUrlPatterns,
    excludedSubDomains: form.excludedSubDomains,
    excludedUrlPatterns: form.excludedUrlPatterns,
    singleUrls: form.singleUrls,
  }
}

function toWebsiteForm(website: KnowledgeWebsite): WebsiteForm {
  return {
    url: website.url,
    includedSubDomains: website.includedSubDomains,
    includedUrlPatterns: website.includedUrlPatterns,
    excludedSubDomains: website.excludedSubDomains,
    excludedUrlPatterns: website.excludedUrlPatterns,
    singleUrls: website.singleUrls,
  }
}

function AgentImportPanel({
  complete,
  connectorInputs,
  createBackupBeforeImport,
  selectedComponents,
  currentStep,
  itemProgress,
  error,
  failureMayBePartial,
  files,
  importing,
  inspecting,
  inspection,
  loadingPreview,
  packageFile,
  preview,
  onConnectorInputChange,
  onCreateBackupBeforeImportChange,
  onComponentChange,
  onFileChange,
  onImport,
  onInspect,
  onPackageChange,
}: {
  complete: boolean
  connectorInputs: Record<string, AgentImportConnectorInput>
  createBackupBeforeImport: boolean
  selectedComponents: Record<AgentImportComponent, boolean>
  currentStep: AgentImportStep | null
  itemProgress: AgentImportItemProgress | null
  error: string | null
  failureMayBePartial: boolean
  files: Record<string, File>
  importing: boolean
  inspecting: boolean
  inspection: AgentImportInspection | null
  loadingPreview: boolean
  packageFile: File | null
  preview: AgentImportPreview | null
  onConnectorInputChange: (
    name: string,
    value: AgentImportConnectorInput,
  ) => void
  onCreateBackupBeforeImportChange: (value: boolean) => void
  onComponentChange: (
    component: AgentImportComponent,
    selected: boolean,
  ) => void
  onFileChange: (providerFileId: string, file: File | null) => void
  onImport: () => void
  onInspect: () => void
  onPackageChange: (file: File | null) => void
}) {
  const { t } = useTranslation()
  const visibleSteps: readonly AgentImportStep[] = createBackupBeforeImport
    ? agentImportSteps
    : agentImportSteps.filter((step) => step !== 'backup')
  const currentIndex = complete
    ? visibleSteps.length
    : currentStep
      ? visibleSteps.indexOf(currentStep)
      : -1
  const progress = complete
    ? 100
    : currentIndex < 0
      ? 0
      : Math.round(((currentIndex + 1) / visibleSteps.length) * 100)
  const requirementsComplete = Boolean(
    inspection &&
    (!selectedComponents.files ||
      inspection.requirements.files.every(
        (file) => files[file.providerFileId],
      )) &&
    (!selectedComponents.connectors ||
      inspection.requirements.connectors.every((connector) => {
        const input = connectorInputs[connector.name]
        return (
          isConnectorAuthConfigComplete(
            connector.authType,
            input?.authConfig ?? '',
          ) &&
          (!connector.requiresCertificate ||
            Boolean(input?.clientCertificate.trim() && input.clientKey.trim()))
        )
      })),
  )

  return (
    <section
      className="overflow-hidden rounded-2xl border bg-card shadow-xs"
      role="tabpanel"
    >
      <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
            <Upload className="size-5" aria-hidden />
          </span>
          <div>
            <h2 className="text-lg font-bold">
              {t('agent.importPanel.title')}
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              {t('agent.importPanel.description')}
            </p>
          </div>
        </div>
        <Button
          className="shrink-0"
          disabled={
            importing ||
            inspecting ||
            loadingPreview ||
            !packageFile ||
            !preview ||
            (Boolean(inspection) && !requirementsComplete)
          }
          isLoading={importing || inspecting || loadingPreview}
          onClick={inspection ? onImport : onInspect}
        >
          <Upload className="size-4" aria-hidden />
          {t(
            inspection
              ? 'agent.importPanel.import'
              : 'agent.importPanel.inspect',
          )}
        </Button>
      </div>

      <div className="grid gap-5 border-t p-6 lg:grid-cols-2">
        <div className="grid content-start gap-5">
          {inspection ? (
            <div className="grid gap-4">
              <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
                  <FileText className="size-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold">
                    {t('agent.importPanel.inspectionTitle')}
                  </h3>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">
                    {packageFile?.name}
                  </p>
                </div>
                <Button
                  disabled={importing}
                  size="sm"
                  variant="outline"
                  onClick={() => onPackageChange(null)}
                >
                  {t('agent.importPanel.chooseAnother')}
                </Button>
              </div>

              <div
                className={cn(
                  'flex items-start gap-3 rounded-xl border p-4',
                  requirementsComplete
                    ? 'border-success/30 bg-success/10'
                    : 'border-warning/30 bg-warning/10',
                )}
                role="status"
                aria-live="polite"
              >
                {requirementsComplete ? (
                  <ShieldCheck
                    className="mt-0.5 size-5 shrink-0 text-success"
                    aria-hidden
                  />
                ) : (
                  <AlertTriangle
                    className="mt-0.5 size-5 shrink-0 text-warning-foreground"
                    aria-hidden
                  />
                )}
                <div>
                  <h3 className="text-sm font-bold">
                    {t(
                      requirementsComplete
                        ? 'agent.importPanel.requirementsCompleteTitle'
                        : 'agent.importPanel.actionRequiredTitle',
                    )}
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {t(
                      requirementsComplete
                        ? 'agent.importPanel.requirementsCompleteDescription'
                        : 'agent.importPanel.actionRequiredDescription',
                    )}
                  </p>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold">
                  {t('agent.importPanel.inspectionSummaryTitle')}
                </h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {t('agent.importPanel.inspectionSummaryDescription')}
                </p>
              </div>
            </div>
          ) : loadingPreview ? (
            <div
              className="grid min-h-40 place-items-center rounded-2xl border-2 border-dashed bg-muted/10 p-6 text-center"
              role="status"
            >
              <span className="grid justify-items-center gap-3">
                <LoaderCircle
                  className="size-7 animate-spin text-primary"
                  aria-hidden
                />
                <span className="font-semibold">
                  {t('agent.importPanel.previewLoading')}
                </span>
              </span>
            </div>
          ) : preview && packageFile ? (
            <AgentImportResourcePreview
              file={packageFile}
              preview={preview}
              onReplace={() => onPackageChange(null)}
            />
          ) : (
            <AgentImportDropzone
              disabled={importing || inspecting}
              file={packageFile}
              onChange={onPackageChange}
            />
          )}

          {!inspection && (
            <p className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm leading-6 text-foreground">
              {t('agent.importPanel.replaceWarning')}
            </p>
          )}

          {inspection && (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {Object.entries(inspection.summary).map(([key, value]) => (
                  <div key={key} className="rounded-xl border bg-muted/20 p-3">
                    <p className="text-xl font-black">{value}</p>
                    <p className="text-xs text-muted-foreground">
                      {t(`agent.importPanel.summary.${key}`)}
                    </p>
                  </div>
                ))}
              </div>

              {((selectedComponents.files &&
                inspection.requirements.files.length > 0) ||
                (selectedComponents.connectors &&
                  inspection.requirements.connectors.length > 0)) && (
                <div className="border-t pt-5">
                  <h3 className="text-sm font-bold">
                    {t('agent.importPanel.requirementsTitle')}
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {t('agent.importPanel.requirementsDescription')}
                  </p>
                </div>
              )}

              {selectedComponents.files &&
                inspection.requirements.files.length > 0 && (
                  <div className="grid gap-3">
                    <div>
                      <h3 className="text-sm font-bold">
                        {t('agent.importPanel.missingFilesTitle')}
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t('agent.importPanel.missingFilesDescription')}
                      </p>
                    </div>
                    {inspection.requirements.files.map((file) => (
                      <label
                        key={file.providerFileId}
                        className="grid gap-2 text-sm font-semibold"
                      >
                        {file.fileName}
                        <Input
                          type="file"
                          disabled={importing}
                          onChange={(event) =>
                            onFileChange(
                              file.providerFileId,
                              event.target.files?.[0] ?? null,
                            )
                          }
                        />
                      </label>
                    ))}
                  </div>
                )}

              {selectedComponents.connectors &&
                inspection.requirements.connectors.map((connector) => {
                  const input = connectorInputs[connector.name]
                  if (!input) return null
                  return (
                    <div
                      key={connector.name}
                      className="grid gap-3 rounded-xl border p-4"
                    >
                      <h3 className="font-bold">{connector.name}</h3>
                      {connector.authType !== 'NONE' && (
                        <label className="grid gap-2 text-sm font-semibold">
                          {t('agent.importPanel.authConfig', {
                            type: connector.authType,
                          })}
                          <Textarea
                            className="min-h-36 font-mono text-xs"
                            value={input.authConfig}
                            onChange={(event) =>
                              onConnectorInputChange(connector.name, {
                                ...input,
                                authConfig: event.target.value,
                              })
                            }
                          />
                        </label>
                      )}
                      {connector.requiresCertificate && (
                        <>
                          <ImportSecretField
                            label={t('agent.importPanel.clientCertificate')}
                            value={input.clientCertificate}
                            onChange={(value) =>
                              onConnectorInputChange(connector.name, {
                                ...input,
                                clientCertificate: value,
                              })
                            }
                          />
                          <ImportSecretField
                            label={t('agent.importPanel.clientKey')}
                            value={input.clientKey}
                            onChange={(value) =>
                              onConnectorInputChange(connector.name, {
                                ...input,
                                clientKey: value,
                              })
                            }
                          />
                          <ImportSecretField
                            label={t('agent.importPanel.caCertificate')}
                            value={input.caCertificate}
                            onChange={(value) =>
                              onConnectorInputChange(connector.name, {
                                ...input,
                                caCertificate: value,
                              })
                            }
                          />
                        </>
                      )}
                    </div>
                  )
                })}

              <Checkbox
                checked={createBackupBeforeImport}
                disabled={importing}
                label={t('agent.importPanel.createBackup')}
                description={t('agent.importPanel.createBackupDescription')}
                onChange={(event) =>
                  onCreateBackupBeforeImportChange(event.target.checked)
                }
              />

              <details className="rounded-xl border bg-muted/10 p-4">
                <summary className="cursor-pointer text-sm font-bold">
                  {t('agent.importPanel.customizeImport')}
                </summary>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t('agent.importPanel.customizeImportDescription')}
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {(
                    agentImportResources.filter(
                      (resource) =>
                        resource !== 'finalizing' && resource !== 'mcps',
                    ) as AgentImportComponent[]
                  ).map((component) => (
                    <Checkbox
                      key={component}
                      checked={selectedComponents[component]}
                      disabled={importing}
                      label={t(`agent.importPanel.resources.${component}`)}
                      onChange={(event) =>
                        onComponentChange(component, event.target.checked)
                      }
                    />
                  ))}
                </div>
              </details>

              <p className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm leading-6 text-foreground">
                {t('agent.importPanel.replaceWarning')}
              </p>
            </>
          )}
        </div>

        <div className="grid content-start gap-4 rounded-xl bg-muted/10 p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold">
              {t('agent.importPanel.progressTitle')}
            </h3>
            <span className="text-xs font-semibold text-muted-foreground">
              {progress}%
            </span>
          </div>
          <Progress
            label={t('agent.importPanel.progressTitle')}
            value={progress}
          />
          {error && (
            <div
              className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive"
              role="alert"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <div className="min-w-0">
                <h3 className="text-sm font-bold">
                  {t('agent.importPanel.errorTitle')}
                </h3>
                <p className="mt-1 text-sm leading-6 break-words">{error}</p>
                {failureMayBePartial && (
                  <p className="mt-2 border-t border-destructive/20 pt-2 text-xs leading-5 font-medium">
                    {t('agent.importPanel.failedPartial')}
                  </p>
                )}
              </div>
            </div>
          )}
          <ol className="grid gap-2" aria-live="polite">
            {visibleSteps.map((step, index) => {
              const component =
                step === 'backup'
                  ? null
                  : step === 'finalizing'
                    ? 'settings'
                    : step === 'mcps'
                      ? 'connectors'
                      : step
              const isSkipped =
                (step === 'backup' && !createBackupBeforeImport) ||
                (component !== null && !selectedComponents[component])
              const isComplete =
                !isSkipped && (complete || index < currentIndex)
              const isCurrent =
                !isSkipped && importing && index === currentIndex
              return (
                <li
                  key={step}
                  className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-sm"
                >
                  <span
                    className={
                      isComplete
                        ? 'text-success'
                        : isCurrent
                          ? 'text-primary'
                          : 'text-muted-foreground'
                    }
                  >
                    {isSkipped ? (
                      <Minus className="size-4" aria-hidden />
                    ) : isComplete ? (
                      <Check className="size-4" aria-hidden />
                    ) : isCurrent ? (
                      <LoaderCircle
                        className="size-4 animate-spin"
                        aria-hidden
                      />
                    ) : (
                      <span className="block size-3 rounded-full border-2" />
                    )}
                  </span>
                  <span
                    className={`min-w-0 flex-1 ${
                      isCurrent || isComplete ? 'font-semibold' : ''
                    }`}
                  >
                    {t(`agent.importPanel.steps.${step}`)}
                  </span>
                  {isSkipped && (
                    <span className="text-xs font-semibold text-muted-foreground">
                      {t('agent.importPanel.skipped')}
                    </span>
                  )}
                  {isCurrent && itemProgress && (
                    <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                      {t('agent.importPanel.itemProgress', {
                        resource: t(
                          `agent.importPanel.resources.${itemProgress.resource}`,
                        ),
                        completed: itemProgress.completed,
                        total: itemProgress.total,
                      })}
                    </span>
                  )}
                </li>
              )
            })}
          </ol>
          {complete && (
            <div className="grid gap-3" role="status">
              <p className="rounded-lg bg-success/10 p-3 text-sm font-semibold text-success">
                {t('agent.importPanel.complete')}
              </p>
              {selectedComponents.settings && (
                <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3">
                  <AlertTriangle
                    className="mt-0.5 size-4 shrink-0 text-warning-foreground"
                    aria-hidden
                  />
                  <p className="text-sm leading-6 font-medium">
                    {t('agent.importPanel.completeDisabled')}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function ImportSecretField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold">
      {label}
      <Textarea
        className="min-h-28 font-mono text-xs"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function AgentImportResourcePreview({
  file,
  preview,
  onReplace,
}: {
  file: File
  preview: AgentImportPreview
  onReplace: () => void
}) {
  const { t } = useTranslation()
  const settings = preview.settings
  const handoff = previewRecord(settings.handoff)

  return (
    <div className="overflow-hidden rounded-2xl border bg-muted/10">
      <div className="flex flex-wrap items-start gap-3 border-b bg-card p-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
          <FileText className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold break-all">{file.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatFileSize(file.size)} · AGTX v{preview.version}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={onReplace}>
          {t('agent.importPanel.preview.chooseAnother')}
        </Button>
      </div>

      <div className="flex items-start gap-3 border-b border-warning/30 bg-warning/10 p-4">
        <AlertTriangle
          className="mt-0.5 size-5 shrink-0 text-warning-foreground"
          aria-hidden
        />
        <div>
          <p className="text-sm font-bold">
            {t('agent.importPanel.preview.rolloutIgnoredTitle')}
          </p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {t('agent.importPanel.preview.rolloutIgnoredDescription')}
          </p>
        </div>
      </div>

      <div className="grid gap-2 p-3">
        <ImportPreviewSection
          count={1}
          defaultOpen
          title={t('agent.importPanel.preview.settings')}
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <ImportPreviewField
              label={t('agent.importPanel.preview.rollout')}
              value={previewValue(settings.rolloutEnabled)}
            />
            <ImportPreviewField
              label={t('agent.importPanel.preview.audience')}
              value={previewValue(settings.audience)}
            />
            <ImportPreviewField
              label={t('agent.importPanel.preview.handoff')}
              value={`${previewValue(handoff?.enabled)} · ${previewValue(handoff?.messageSelection)}`}
            />
            <ImportPreviewField
              label={t('agent.importPanel.preview.neverSay')}
              value={previewArray(settings.neverSayPhrases)
                .map(previewValue)
                .join('\n')}
              multiline
            />
          </div>
          {previewValue(handoff?.message) && (
            <div className="mt-3 border-t pt-3">
              <ImportPreviewField
                label={t('agent.importPanel.preview.handoffMessage')}
                value={previewValue(handoff?.message)}
                multiline
              />
            </div>
          )}
        </ImportPreviewSection>

        <ImportPreviewSection
          count={1}
          title={t('agent.importPanel.preview.businessInfo')}
        >
          <div className="grid gap-3">
            {Object.entries(preview.businessInfo).map(([key, value]) => (
              <ImportPreviewField
                key={key}
                label={t(`agent.businessInfo.${key}`, { defaultValue: key })}
                value={previewValue(value)}
                multiline
              />
            ))}
          </div>
        </ImportPreviewSection>

        <ImportPreviewSection
          count={preview.allowlist.length}
          title={t('agent.importPanel.preview.allowlist')}
        >
          <ImportPreviewList
            empty={t('agent.importPanel.preview.empty')}
            items={preview.allowlist.map((entry) => ({
              key: previewValue(entry.id),
              title: previewValue(entry.phoneNumber),
            }))}
          />
        </ImportPreviewSection>

        <ImportPreviewSection
          count={preview.skills.length}
          title={t('agent.importPanel.preview.skills')}
        >
          <ImportPreviewList
            empty={t('agent.importPanel.preview.empty')}
            items={preview.skills.map((skill) => ({
              key: previewValue(skill.id),
              title: previewValue(skill.title),
              subtitle: previewValue(skill.description),
              body: previewValue(skill.skill),
            }))}
          />
        </ImportPreviewSection>

        <ImportPreviewSection
          count={preview.qrCodes.length}
          title={t('agent.importPanel.preview.qrCodes')}
        >
          <ImportPreviewList
            empty={t('agent.importPanel.preview.empty')}
            items={preview.qrCodes.map((qrCode, index) => ({
              key: String(index),
              title: previewValue(qrCode.prefilledMessage),
            }))}
          />
        </ImportPreviewSection>

        <ImportPreviewSection
          count={
            preview.components.prompts.length +
            preview.components.commands.length
          }
          title={t('agent.importPanel.preview.components')}
        >
          <ImportPreviewList
            empty={t('agent.importPanel.preview.empty')}
            items={[
              ...preview.components.prompts.map((prompt, index) => ({
                key: `prompt-${index}`,
                title: prompt,
                subtitle: t('channels.components.icebreaker'),
              })),
              ...preview.components.commands.map((command, index) => ({
                key: `command-${index}`,
                title: `/${previewValue(command.commandName)}`,
                subtitle: previewValue(command.commandDescription),
              })),
            ]}
          />
        </ImportPreviewSection>

        <ImportPreviewSection
          count={preview.faqs.length}
          title={t('agent.importPanel.preview.faqs')}
        >
          <ImportPreviewList
            empty={t('agent.importPanel.preview.empty')}
            items={preview.faqs.map((faq) => ({
              key: previewValue(faq.id),
              title: previewValue(faq.question),
              body: previewValue(faq.answer),
            }))}
          />
        </ImportPreviewSection>

        <ImportPreviewSection
          count={preview.websites.length}
          title={t('agent.importPanel.preview.websites')}
        >
          <ImportPreviewList
            empty={t('agent.importPanel.preview.empty')}
            items={preview.websites.map((website) => ({
              key: previewValue(website.id),
              title: previewValue(website.url),
              subtitle: t('agent.importPanel.preview.websitePatterns', {
                count:
                  previewArray(website.includedUrlPatterns).length +
                  previewArray(website.singleUrls).length,
              }),
            }))}
          />
        </ImportPreviewSection>

        <ImportPreviewSection
          count={preview.files.length}
          title={t('agent.importPanel.preview.files')}
        >
          <ImportPreviewList
            empty={t('agent.importPanel.preview.emptyFiles')}
            items={preview.files.map((resource) => ({
              key: previewValue(resource.providerFileId),
              title: previewValue(resource.fileName),
              subtitle: resource.path
                ? t('agent.importPanel.preview.fileIncluded')
                : t('agent.importPanel.preview.fileRequired'),
            }))}
          />
        </ImportPreviewSection>

        <ImportPreviewSection
          count={preview.connectors.length}
          title={t('agent.importPanel.preview.connectors')}
        >
          <div className="grid gap-2">
            {preview.connectors.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('agent.importPanel.preview.empty')}
              </p>
            ) : (
              preview.connectors.map((connector) => {
                const tools = previewRecordArray(connector.tools)
                return (
                  <div
                    key={previewValue(connector.id)}
                    className="rounded-lg border bg-card p-3"
                  >
                    <p className="font-semibold">
                      {previewValue(connector.name)}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {previewValue(connector.description)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <Pill>{previewValue(connector.authType)}</Pill>
                      <Pill>{previewValue(connector.connectorProtocol)}</Pill>
                      <Pill>
                        {t('agent.importPanel.preview.toolCount', {
                          count: tools.length,
                        })}
                      </Pill>
                    </div>
                    {tools.length > 0 && (
                      <ul className="mt-3 grid gap-1 border-t pt-3 text-xs">
                        {tools.map((tool) => (
                          <li key={previewValue(tool.id)}>
                            <span className="font-semibold">
                              {previewValue(tool.name)}
                            </span>{' '}
                            <span className="text-muted-foreground">
                              — {previewValue(tool.description)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </ImportPreviewSection>
      </div>
    </div>
  )
}

function ImportPreviewSection({
  children,
  count,
  defaultOpen = false,
  title,
}: {
  children: ReactNode
  count: number
  defaultOpen?: boolean
  title: string
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  return (
    <details
      className="group rounded-xl border bg-card"
      open={isOpen}
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 font-semibold focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/25 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">{title}</span>
        <Pill>{count}</Pill>
        <span className="text-muted-foreground transition-transform group-open:rotate-180">
          <ChevronDown className="size-4" aria-hidden />
        </span>
      </summary>
      <div className="border-t p-4">{children}</div>
    </details>
  )
}

function ImportPreviewField({
  label,
  multiline = false,
  value,
}: {
  label: string
  multiline?: boolean
  value: string
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 text-sm',
          multiline && 'whitespace-pre-wrap leading-6',
        )}
      >
        {value || '—'}
      </p>
    </div>
  )
}

function ImportPreviewList({
  empty,
  items,
}: {
  empty: string
  items: Array<{
    body?: string
    key: string
    subtitle?: string
    title: string
  }>
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>
  }
  return (
    <div className="grid gap-2">
      {items.map((item, index) => (
        <div
          key={`${item.key}-${index}`}
          className="rounded-lg border bg-card p-3"
        >
          <p className="font-semibold break-words">{item.title || '—'}</p>
          {item.subtitle && (
            <p className="mt-1 text-xs text-muted-foreground">
              {item.subtitle}
            </p>
          )}
          {item.body && (
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
              {item.body}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

function AgentBackupsPanel({
  backups,
  canManage,
  error,
  loading,
  onBackup,
  onRestore,
  restoringBackupId,
}: {
  backups: AgentBackup[]
  canManage: boolean
  error: string | null
  loading: boolean
  onBackup: () => void
  onRestore: (backup: AgentBackup) => void
  restoringBackupId: number | null
}) {
  const { t, i18n } = useTranslation()

  return (
    <section
      className="overflow-hidden rounded-2xl border bg-card shadow-xs"
      role="tabpanel"
    >
      <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
            <Archive className="size-5" aria-hidden />
          </span>
          <div>
            <h2 className="text-lg font-bold">{t('agent.backups.title')}</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              {t('agent.backups.description')}
            </p>
          </div>
        </div>
        {canManage ? (
          <Button className="shrink-0" onClick={onBackup}>
            <Archive className="size-4" aria-hidden />
            {t('agent.backups.action')}
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t('agent.managersOnly')}
          </p>
        )}
      </div>

      <div className="border-t">
        {error ? (
          <p
            className="m-5 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            role="alert"
          >
            {error}
          </p>
        ) : loading ? (
          <p className="p-6 text-sm text-muted-foreground">
            {t('agent.backups.loading')}
          </p>
        ) : backups.length === 0 ? (
          <div className="grid min-h-52 place-items-center p-6 text-center">
            <div className="grid max-w-md justify-items-center gap-3">
              <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
                <Archive className="size-6" aria-hidden />
              </span>
              <div>
                <h3 className="font-bold">{t('agent.backups.emptyTitle')}</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {t('agent.backups.emptyDescription')}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-160 text-left text-sm">
              <thead className="border-b bg-muted/30 text-xs tracking-wide text-muted-foreground uppercase">
                <tr>
                  <th className="px-5 py-3 font-bold" scope="col">
                    {t('agent.backups.columns.createdAt')}
                  </th>
                  <th className="px-5 py-3 font-bold" scope="col">
                    {t('agent.backups.columns.fileName')}
                  </th>
                  <th className="px-5 py-3 text-right font-bold" scope="col">
                    {t('agent.backups.columns.size')}
                  </th>
                  {canManage && (
                    <th className="px-5 py-3 text-right font-bold" scope="col">
                      {t('agent.backups.columns.actions')}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y">
                {backups.map((backup) => (
                  <tr key={backup.id}>
                    <td className="px-5 py-4 font-medium whitespace-nowrap">
                      {new Intl.DateTimeFormat(i18n.language, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }).format(new Date(backup.createdAt))}
                    </td>
                    <td className="px-5 py-4 font-mono text-xs break-all text-muted-foreground">
                      {backup.fileName}
                    </td>
                    <td className="px-5 py-4 text-right whitespace-nowrap text-muted-foreground">
                      {formatFileSize(backup.byteSize)}
                    </td>
                    {canManage && (
                      <td className="px-5 py-4 text-right whitespace-nowrap">
                        <Button
                          aria-label={t('agent.backups.restoreLabel', {
                            fileName: backup.fileName,
                          })}
                          disabled={restoringBackupId !== null}
                          isLoading={restoringBackupId === backup.id}
                          size="sm"
                          variant="ghost"
                          onClick={() => onRestore(backup)}
                        >
                          <RotateCcw className="size-4" aria-hidden />
                          {t('agent.backups.restore')}
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}

function AgentBackupProgress({
  complete,
  currentStep,
  error,
  running,
}: {
  complete: boolean
  currentStep: AgentExportStep | null
  error: string | null
  running: boolean
}) {
  const { t } = useTranslation()
  const currentIndex = complete
    ? agentExportSteps.length
    : currentStep
      ? agentExportSteps.indexOf(currentStep)
      : -1
  const progress = complete
    ? 100
    : currentIndex < 0
      ? 0
      : Math.round(((currentIndex + 1) / agentExportSteps.length) * 100)

  return (
    <div className="grid gap-4 rounded-xl border bg-muted/10 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold">
          {t('agent.backups.progressTitle')}
        </h3>
        <span className="text-xs font-semibold text-muted-foreground">
          {progress}%
        </span>
      </div>
      <Progress label={t('agent.backups.progressTitle')} value={progress} />
      <ol className="grid gap-2" aria-live="polite">
        {agentExportSteps.map((step, index) => {
          const isComplete = complete || index < currentIndex
          const isCurrent = running && index === currentIndex
          const hasError = Boolean(error) && index === currentIndex
          return (
            <li
              key={step}
              className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-sm"
            >
              <span
                className={
                  hasError
                    ? 'text-destructive'
                    : isComplete
                      ? 'text-success'
                      : isCurrent
                        ? 'text-primary'
                        : 'text-muted-foreground'
                }
              >
                {hasError ? (
                  <AlertTriangle className="size-4" aria-hidden />
                ) : isComplete ? (
                  <Check className="size-4" aria-hidden />
                ) : isCurrent ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden />
                ) : (
                  <span className="block size-3 rounded-full border-2" />
                )}
              </span>
              <span className={isCurrent || isComplete ? 'font-semibold' : ''}>
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
          {t('agent.backups.complete')}
        </p>
      )}
    </div>
  )
}

function AgentImportDropzone({
  disabled,
  file,
  onChange,
}: {
  disabled: boolean
  file: File | null
  onChange: (file: File | null) => void
}) {
  const { t } = useTranslation()
  const [isDragging, setIsDragging] = useState(false)

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    setIsDragging(false)
    if (disabled) return
    onChange(event.dataTransfer.files[0] ?? null)
  }

  return (
    <div className="grid gap-2">
      <span className="text-sm font-semibold">
        {t('agent.importPanel.packageLabel')}
      </span>
      <label
        className={cn(
          'group grid min-h-40 cursor-pointer place-items-center rounded-2xl border-2 border-dashed bg-muted/10 p-6 text-center transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/25',
          isDragging
            ? 'border-primary bg-primary/10'
            : 'border-border hover:border-primary/60 hover:bg-muted/30',
          disabled && 'cursor-not-allowed opacity-60',
        )}
        onDragEnter={(event) => {
          event.preventDefault()
          if (!disabled) setIsDragging(true)
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (
            !event.currentTarget.contains(event.relatedTarget as Node | null)
          ) {
            setIsDragging(false)
          }
        }}
        onDrop={handleDrop}
      >
        <input
          className="sr-only"
          accept=".agtx,application/zip,application/vnd.mba.agent+zip"
          disabled={disabled}
          type="file"
          onChange={(event) => onChange(event.target.files?.[0] ?? null)}
        />
        <span className="grid justify-items-center gap-3">
          <span className="grid size-12 place-items-center rounded-full bg-primary/12 text-primary transition-transform group-hover:scale-105">
            {file ? (
              <FileText className="size-6" aria-hidden />
            ) : (
              <Upload className="size-6" aria-hidden />
            )}
          </span>
          {file ? (
            <span className="grid gap-1">
              <span className="font-bold break-all">{file.name}</span>
              <span className="text-xs font-medium text-muted-foreground">
                {formatFileSize(file.size)} ·{' '}
                {t('agent.importPanel.dropReplace')}
              </span>
            </span>
          ) : (
            <span className="grid gap-1">
              <span className="font-bold">
                {t('agent.importPanel.dropTitle')}
              </span>
              <span className="text-xs font-medium text-muted-foreground">
                {t('agent.importPanel.dropDescription')}
              </span>
            </span>
          )}
        </span>
      </label>
    </div>
  )
}

function AgentExportPanel({
  complete,
  currentStep,
  error,
  exporting,
  onExport,
}: {
  complete: boolean
  currentStep: AgentExportStep | null
  error: string | null
  exporting: boolean
  onExport: () => void
}) {
  const { t } = useTranslation()
  const currentIndex = complete
    ? agentExportSteps.length
    : currentStep
      ? agentExportSteps.indexOf(currentStep)
      : -1
  const progress = complete
    ? 100
    : currentIndex < 0
      ? 0
      : Math.round(((currentIndex + 1) / agentExportSteps.length) * 100)

  return (
    <section
      className="overflow-hidden rounded-2xl border bg-card shadow-xs"
      role="tabpanel"
    >
      <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
            <Download className="size-5" aria-hidden />
          </span>
          <div>
            <h2 className="text-lg font-bold">
              {t('agent.exportPanel.title')}
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              {t('agent.exportPanel.description')}
            </p>
          </div>
        </div>
        <Button
          className="shrink-0"
          disabled={exporting}
          isLoading={exporting}
          onClick={onExport}
        >
          <Download className="size-4" aria-hidden />
          {t(
            complete
              ? 'agent.exportPanel.createAnother'
              : 'agent.exportPanel.create',
          )}
        </Button>
      </div>

      <div className="grid border-t lg:grid-cols-[minmax(0,0.9fr)_minmax(20rem,1.1fr)]">
        <div className="grid content-start gap-4 p-6 lg:border-r">
          <div>
            <h3 className="text-sm font-bold">
              {t('agent.exportPanel.includedTitle')}
            </h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {t('agent.exportPanel.includedDescription')}
            </p>
          </div>
          <div className="rounded-xl border bg-muted/20 p-4">
            <h3 className="text-sm font-bold">
              {t('agent.exportPanel.excludedTitle')}
            </h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {t('agent.exportPanel.excludedDescription')}
            </p>
          </div>
        </div>

        <div className="grid content-start gap-4 bg-muted/10 p-6">
          <div>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold">
                {t('agent.exportPanel.progressTitle')}
              </h3>
              <span className="text-xs font-semibold text-muted-foreground">
                {progress}%
              </span>
            </div>
            <Progress
              className="mt-3"
              label={t('agent.exportPanel.progressTitle')}
              value={progress}
            />
          </div>

          <ol className="grid gap-2" aria-live="polite">
            {agentExportSteps.map((step, index) => {
              const isComplete = complete || index < currentIndex
              const isCurrent = exporting && index === currentIndex
              const hasError = Boolean(error) && index === currentIndex
              return (
                <li
                  key={step}
                  className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-sm"
                >
                  <span
                    className={
                      hasError
                        ? 'text-destructive'
                        : isComplete
                          ? 'text-success'
                          : isCurrent
                            ? 'text-primary'
                            : 'text-muted-foreground'
                    }
                  >
                    {hasError ? (
                      <AlertTriangle className="size-4" aria-hidden />
                    ) : isComplete ? (
                      <Check className="size-4" aria-hidden />
                    ) : isCurrent ? (
                      <LoaderCircle
                        className="size-4 animate-spin"
                        aria-hidden
                      />
                    ) : (
                      <span className="block size-3 rounded-full border-2" />
                    )}
                  </span>
                  <span
                    className={
                      isCurrent || isComplete ? 'font-semibold' : undefined
                    }
                  >
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
              {t('agent.exportPanel.complete')}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}

function KnowledgeListCard({
  action,
  icon,
  title,
  isLoading,
  loadingLabel,
  isEmpty,
  emptyLabel,
  children,
}: {
  action?: ReactNode
  icon: ReactNode
  title: string
  isLoading: boolean
  loadingLabel: string
  isEmpty: boolean
  emptyLabel: string
  children: ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-xs">
      <div className="flex items-center gap-3 p-5">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
          {icon}
        </span>
        <h2 className="min-w-0 flex-1 font-bold">{title}</h2>
        {action}
      </div>
      <div className="border-t">
        {isLoading ? (
          <p className="p-5 text-sm text-muted-foreground">{loadingLabel}</p>
        ) : isEmpty ? (
          <p className="p-5 text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          children
        )}
      </div>
    </section>
  )
}

function KnowledgeDialogError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p
      className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
      role="alert"
    >
      {message}
    </p>
  )
}

function NumberRegistrationCard({
  canManage,
  channelId,
  providerStatus,
  status,
  onRetry,
}: {
  canManage: boolean
  channelId: number
  providerStatus: string | null
  status: RegistrationStatus
  onRetry: () => void
}) {
  const { t } = useTranslation()
  const registered = status === 'registered'
  const failed = status === 'error'
  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-xs">
      <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
        <span
          className={cn(
            'grid size-11 shrink-0 place-items-center rounded-xl',
            registered
              ? 'bg-success/12 text-success'
              : failed
                ? 'bg-destructive/10 text-destructive'
                : 'bg-warning/15 text-warning-foreground',
          )}
        >
          <RadioTower className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-bold">{t('agent.registration.title')}</h2>
            <Pill tone={registrationStatusTone(status)}>
              {t(`channels.registration.status.${status}`)}
              {providerStatus ? ` · ${providerStatus}` : ''}
            </Pill>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            {t(
              registered
                ? 'agent.registration.registeredDescription'
                : failed
                  ? 'agent.registration.errorDescription'
                  : 'agent.registration.unregisteredDescription',
            )}
          </p>
        </div>
        {failed ? (
          <Button className="shrink-0" variant="outline" onClick={onRetry}>
            <RotateCcw className="size-4" aria-hidden />
            {t('agent.registration.retry')}
          </Button>
        ) : canManage ? (
          <Link
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border bg-background px-4 text-sm font-semibold transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/25"
            to={`/channels/${channelId}`}
          >
            <RadioTower className="size-4" aria-hidden />
            {t(
              registered
                ? 'agent.registration.manage'
                : 'agent.registration.register',
            )}
          </Link>
        ) : !registered ? (
          <p className="text-sm text-muted-foreground">
            {t('agent.registration.managersOnly')}
          </p>
        ) : null}
      </div>
    </section>
  )
}

function ChannelDatum({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-all text-sm font-medium">{value}</dd>
    </div>
  )
}

function parseChannelId(value: string | undefined): number | undefined {
  if (!value || !/^[1-9]\d*$/.test(value)) return undefined
  const channelId = Number(value)
  return Number.isSafeInteger(channelId) ? channelId : undefined
}

function parseAgentExportEvent(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value)
    return typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function isAgentExportStep(value: string): value is AgentExportStep {
  return (agentExportSteps as readonly string[]).includes(value)
}

function isAgentImportStep(value: string): value is AgentImportStep {
  return (agentImportSteps as readonly string[]).includes(value)
}

function isAgentImportResource(value: string): value is AgentImportResource {
  return (agentImportResources as readonly string[]).includes(value)
}

function connectorAuthTemplate(
  authType: AgentImportInspection['requirements']['connectors'][number]['authType'],
): string {
  if (authType === 'API_KEY') {
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
  }
  if (authType === 'OAUTH2_CLIENT_CREDENTIALS') {
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
  }
  return ''
}

function isConnectorAuthConfigComplete(
  authType: AgentImportInspection['requirements']['connectors'][number]['authType'],
  value: string,
): boolean {
  if (authType === 'NONE') return true

  try {
    const parsed = JSON.parse(value) as unknown
    if (!isRecord(parsed)) return false
    if (authType === 'API_KEY') {
      const apiKey = parsed.apiKey
      if (!isRecord(apiKey)) return false
      const parameterGroups = ['headers', 'queryParams', 'bodyParams'].map(
        (key) => apiKey[key],
      )
      if (!parameterGroups.every(Array.isArray)) return false
      const parameters = parameterGroups.flat()
      return (
        parameters.length > 0 &&
        parameters.every(
          (parameter) =>
            isRecord(parameter) &&
            typeof parameter.fieldName === 'string' &&
            parameter.fieldName.trim().length > 0 &&
            typeof parameter.value === 'string' &&
            parameter.value.length > 0,
        )
      )
    }

    const oauth = parsed.oauth2ClientCredentials
    if (
      !isRecord(oauth) ||
      typeof oauth.tokenUrl !== 'string' ||
      typeof oauth.clientId !== 'string' ||
      typeof oauth.clientSecret !== 'string' ||
      !Array.isArray(oauth.scopesToRequest) ||
      !oauth.scopesToRequest.every(
        (scope) => typeof scope === 'string' && scope.trim().length > 0,
      ) ||
      oauth.clientId.trim().length === 0 ||
      oauth.clientSecret.length === 0
    ) {
      return false
    }
    const tokenUrl = new URL(oauth.tokenUrl)
    return tokenUrl.protocol === 'http:' || tokenUrl.protocol === 'https:'
  } catch {
    return false
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function readSseResponse(
  response: Response,
  onEvent: (event: string, data: string) => void,
): Promise<void> {
  if (!response.body) throw new Error('Import response has no body')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const result = await reader.read()
    buffer += decoder.decode(result.value, { stream: !result.done })
    buffer = buffer.replaceAll('\r\n', '\n')
    let boundary = buffer.indexOf('\n\n')
    while (boundary >= 0) {
      const block = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)
      const lines = block.split('\n')
      const event = lines.find((line) => line.startsWith('event: '))?.slice(7)
      const data = lines.find((line) => line.startsWith('data: '))?.slice(6)
      if (event && data) onEvent(event, data)
      boundary = buffer.indexOf('\n\n')
    }
    if (result.done) break
  }
}

function decodeBase64(value: string): Uint8Array {
  const binary = window.atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
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

function formatFileSize(bytes: number): string {
  if (bytes < 1_000) return `${bytes} B`
  if (bytes < 1_000_000) return `${(bytes / 1_000).toFixed(1)} KB`
  return `${(bytes / 1_000_000).toFixed(1)} MB`
}

function previewValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return ''
}

function previewArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function previewRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function previewRecordArray(value: unknown): Array<Record<string, unknown>> {
  return previewArray(value).flatMap((item) => {
    const record = previewRecord(item)
    return record ? [record] : []
  })
}

function isKebabCase(value: string): boolean {
  return value.length <= 64 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
}

function toDelimitedName(value: string, separator: '-' | '_'): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, `$1${separator}$2`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, separator)
    .replace(new RegExp(`^\\${separator}+`), '')
}

function connectorStatusTone(status: AgentConnector['connectionStatus']) {
  if (status === 'ACTIVE') return 'success' as const
  if (status === 'ERROR' || status === 'EXPIRED') return 'danger' as const
  return 'warning' as const
}

function connectorStatusKey(status: AgentConnector['connectionStatus']) {
  if (status === 'ACTIVE') return 'agent.connectors.status.ACTIVE' as const
  if (status === 'ERROR') return 'agent.connectors.status.ERROR' as const
  if (status === 'EXPIRED') return 'agent.connectors.status.EXPIRED' as const
  return 'agent.connectors.status.PENDING_OAUTH' as const
}

function connectorAuthKey(authType: AgentConnector['authType']) {
  if (authType === 'API_KEY') return 'agent.connectors.auth.apiKey' as const
  if (authType === 'OAUTH2_CLIENT_CREDENTIALS') {
    return 'agent.connectors.auth.oauthClientCredentials' as const
  }
  if (authType === 'OAUTH2') return 'agent.connectors.auth.oauth' as const
  if (authType === 'BASIC') return 'agent.connectors.auth.basic' as const
  if (authType === 'CUSTOM') return 'agent.connectors.auth.custom' as const
  return 'agent.connectors.auth.none' as const
}

function statusTone(
  status: AgentStatus,
): 'neutral' | 'success' | 'warning' | 'danger' {
  if (status === 'enabled') return 'success'
  if (status === 'disabled') return 'danger'
  if (status === 'error') return 'danger'
  return 'neutral'
}

function registrationStatusTone(
  status: RegistrationStatus,
): 'success' | 'warning' | 'danger' {
  if (status === 'registered') return 'success'
  if (status === 'unregistered') return 'warning'
  return 'danger'
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
