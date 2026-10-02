import type { InferRequestType, InferResponseType } from 'hono/client'
import {
  ChevronLeft,
  KeyRound,
  Link2,
  Pencil,
  Plus,
  Plug,
  RefreshCw,
  Trash2,
  Wrench,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiClient } from '../api'
import { authClient } from '../auth/auth-client'
import {
  Button,
  Checkbox,
  Dialog,
  Input,
  Pill,
  SectionCard,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TagInput,
  Textarea,
} from '../components/ui'

type ChannelsResponse = InferResponseType<
  typeof apiClient.api.channels.$get,
  200
>
type ChannelSummary = ChannelsResponse['channels'][number]
type ConnectorEndpoint =
  (typeof apiClient.api.channels)[':id']['agent-connectors'][':connectorId']
type ConnectorResponse = InferResponseType<ConnectorEndpoint['$get'], 200>
type AgentConnector = ConnectorResponse['connector']
type ConnectorPayload = InferRequestType<ConnectorEndpoint['$put']>['json']
type ConnectorToolEndpoint = ConnectorEndpoint['tools'][':toolId']
type ToolsResponse = InferResponseType<ConnectorEndpoint['tools']['$get'], 200>
type ConnectorTool = ToolsResponse['tools'][number]
type ConnectorToolPayload = InferRequestType<
  ConnectorToolEndpoint['$put']
>['json']
type LogsResponse = InferResponseType<ConnectorEndpoint['logs']['$get'], 200>
type ConnectorLog = LogsResponse['logs'][number]
type LocalMcpsResponse = InferResponseType<
  (typeof apiClient.api.channels)[':id']['local-mcps']['$get'],
  200
>
type LocalMcp = LocalMcpsResponse['mcps'][number]
type LocalMcpAssociationResponse = InferResponseType<
  ConnectorEndpoint['local-mcp-association']['$get'],
  200
>
type LocalMcpAssociation = NonNullable<
  LocalMcpAssociationResponse['association']
>
type PreparedLocalMcpAssociation = {
  mcpId: number
  mcpName: string
  apiKeyId: number
  expiresAt: string
}
type CredentialLocation = 'headers' | 'queryParams' | 'bodyParams'
type CredentialRow = {
  id: number
  location: CredentialLocation
  fieldName: string
  value: string
  prefix: string
}

interface ConnectorForm {
  name: string
  description: string
  baseUrl: string
  connectorProtocol: 'HTTP' | 'MCP'
  authType: 'OAUTH2_CLIENT_CREDENTIALS' | 'API_KEY' | 'NONE'
  requiresCertificate: boolean
  hasUserAuthInjection: boolean
  userAuthLocation: 'body' | 'headers' | 'path' | 'query'
  userAuthFieldName: string
  userAuthPrefix: string
  oauthTokenUrl: string
  oauthScopes: string[]
  oauthContentType: 'application/json' | 'application/x-www-form-urlencoded'
  oauthClientId: string
  oauthClientSecret: string
}

const emptyConnectorForm = (): ConnectorForm => ({
  name: '',
  description: '',
  baseUrl: '',
  connectorProtocol: 'HTTP',
  authType: 'NONE',
  requiresCertificate: false,
  hasUserAuthInjection: false,
  userAuthLocation: 'headers',
  userAuthFieldName: '',
  userAuthPrefix: '',
  oauthTokenUrl: '',
  oauthScopes: [],
  oauthContentType: 'application/x-www-form-urlencoded',
  oauthClientId: '',
  oauthClientSecret: '',
})

const emptyToolAdvanced = `{
  "pathParameters": {},
  "queryParameters": {},
  "headers": {},
  "body": null,
  "userAuthActionConfig": null,
  "transformationSpec": null
}`

export function AgentConnectorPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id, connectorId: connectorRouteId } = useParams()
  const channelId = parsePositiveId(id)
  const isNew = connectorRouteId === 'new'
  const connectorId = isNew ? undefined : connectorRouteId
  const activeOrganizationQuery = authClient.useActiveOrganization()
  const activeMemberRoleQuery = authClient.useActiveMemberRole()
  const canManage = (activeMemberRoleQuery.data?.role ?? '')
    .split(',')
    .map((role) => role.trim())
    .some((role) => role === 'owner' || role === 'admin')

  const [channel, setChannel] = useState<ChannelSummary | null>(null)
  const [connector, setConnector] = useState<AgentConnector | null>(null)
  const [form, setForm] = useState<ConnectorForm>(emptyConnectorForm)
  const [credentialRows, setCredentialRows] = useState<CredentialRow[]>([])
  const [nextCredentialId, setNextCredentialId] = useState(1)
  const [isEditingCredentials, setIsEditingCredentials] = useState(isNew)
  const [tools, setTools] = useState<ConnectorTool[]>([])
  const [logs, setLogs] = useState<ConnectorLog[]>([])
  const [logStats, setLogStats] = useState<LogsResponse['stats']>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isLoadingLogs, setIsLoadingLogs] = useState(false)
  const [isRefreshingMcpTools, setIsRefreshingMcpTools] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [localMcps, setLocalMcps] = useState<LocalMcp[]>([])
  const [selectedLocalMcpId, setSelectedLocalMcpId] = useState('')
  const [isLocalMcpDialogOpen, setIsLocalMcpDialogOpen] = useState(false)
  const [isPreparingLocalMcp, setIsPreparingLocalMcp] = useState(false)
  const [isRefreshingLocalMcpKey, setIsRefreshingLocalMcpKey] = useState(false)
  const [preparedLocalMcp, setPreparedLocalMcp] =
    useState<PreparedLocalMcpAssociation | null>(null)
  const [localMcpAssociation, setLocalMcpAssociation] =
    useState<LocalMcpAssociation | null>(null)

  const [isToolDialogOpen, setIsToolDialogOpen] = useState(false)
  const [editingToolId, setEditingToolId] = useState<string | null>(null)
  const [toolName, setToolName] = useState('')
  const [toolDescription, setToolDescription] = useState('')
  const [toolMethod, setToolMethod] =
    useState<ConnectorToolPayload['requestDefinition']['method']>('GET')
  const [toolPath, setToolPath] = useState('')
  const [toolUserAuthRequired, setToolUserAuthRequired] = useState(false)
  const [toolAdvanced, setToolAdvanced] = useState(emptyToolAdvanced)
  const [toolError, setToolError] = useState<string | null>(null)
  const [isSavingTool, setIsSavingTool] = useState(false)
  const [deletingToolId, setDeletingToolId] = useState<string | null>(null)

  useEffect(() => {
    document.title = `${t(isNew ? 'connector.createTitle' : 'connector.editTitle')} · ${t('design.brand')}`
    document
      .querySelector<HTMLMetaElement>('meta[name="description"]')
      ?.setAttribute('content', t('connector.metaDescription'))
  }, [isNew, t])

  const loadLogs = useCallback(async () => {
    if (!channelId || !connectorId) return
    setIsLoadingLogs(true)
    try {
      const response = await apiClient.api.channels[':id']['agent-connectors'][
        ':connectorId'
      ].logs.$get({
        param: { id: String(channelId), connectorId },
      })
      if (!response.ok) {
        throw new Error(
          await readApiError(response, t('connector.logs.failed')),
        )
      }
      const result = await response.json()
      setLogs(result.logs)
      setLogStats(result.stats)
    } catch (reason) {
      setError(getErrorMessage(reason, t('connector.logs.failed')))
    } finally {
      setIsLoadingLogs(false)
    }
  }, [channelId, connectorId, t])

  const loadPage = useCallback(async () => {
    if (!channelId || (!isNew && !connectorId)) {
      setIsLoading(false)
      setError(t('connector.invalid'))
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const channelsResponse = await apiClient.api.channels.$get()
      if (!channelsResponse.ok) {
        throw new Error(
          await readApiError(channelsResponse, t('connector.loadFailed')),
        )
      }
      const selectedChannel = (await channelsResponse.json()).channels.find(
        (candidate) => candidate.id === channelId,
      )
      if (!selectedChannel) throw new Error(t('agent.channelNotFound'))
      setChannel(selectedChannel)
      if (isNew) {
        setForm(emptyConnectorForm())
        setPreparedLocalMcp(null)
        setLocalMcpAssociation(null)
        setIsEditingCredentials(true)
        return
      }
      const currentConnectorId = connectorId!

      const endpoint =
        apiClient.api.channels[':id']['agent-connectors'][':connectorId']
      const [
        connectorResponse,
        toolsResponse,
        logsResponse,
        associationResponse,
      ] = await Promise.all([
        endpoint.$get({
          param: { id: String(channelId), connectorId: currentConnectorId },
        }),
        endpoint.tools.$get({
          param: { id: String(channelId), connectorId: currentConnectorId },
        }),
        endpoint.logs.$get({
          param: { id: String(channelId), connectorId: currentConnectorId },
        }),
        endpoint['local-mcp-association'].$get({
          param: { id: String(channelId), connectorId: currentConnectorId },
        }),
      ])
      if (!connectorResponse.ok) {
        throw new Error(
          await readApiError(connectorResponse, t('connector.loadFailed')),
        )
      }
      if (!toolsResponse.ok) {
        throw new Error(
          await readApiError(toolsResponse, t('connector.tools.loadFailed')),
        )
      }
      if (!logsResponse.ok) {
        throw new Error(
          await readApiError(logsResponse, t('connector.logs.failed')),
        )
      }
      if (!associationResponse.ok) {
        throw new Error(
          await readApiError(associationResponse, t('connector.loadFailed')),
        )
      }
      const loadedConnector = (await connectorResponse.json()).connector
      const loadedLogs = await logsResponse.json()
      setConnector(loadedConnector)
      setForm(toConnectorForm(loadedConnector))
      setIsEditingCredentials(!loadedConnector.hasAuthConfiguration)
      setTools((await toolsResponse.json()).tools)
      setLogs(loadedLogs.logs)
      setLogStats(loadedLogs.stats)
      setLocalMcpAssociation(
        (await associationResponse.json()).association ?? null,
      )
    } catch (reason) {
      setError(getErrorMessage(reason, t('connector.loadFailed')))
    } finally {
      setIsLoading(false)
    }
  }, [channelId, connectorId, isNew, t])

  useEffect(() => {
    if (activeOrganizationQuery.data?.id) void loadPage()
  }, [activeOrganizationQuery.data?.id, loadPage])

  const saveConnector = async () => {
    if (
      !channelId ||
      !canManage ||
      !isConnectorFormValid(
        form,
        isNew,
        connector,
        credentialRows,
        isEditingCredentials,
      )
    )
      return
    setIsSaving(true)
    setError(null)
    setNotice(null)
    try {
      const payload = toConnectorPayload(form, credentialRows)
      const response = isNew
        ? await apiClient.api.channels[':id']['agent-connectors'].$post({
            param: { id: String(channelId) },
            json: preparedLocalMcp
              ? {
                  ...payload,
                  localMcpAssociation: {
                    mcpId: preparedLocalMcp.mcpId,
                    apiKeyId: preparedLocalMcp.apiKeyId,
                  },
                }
              : payload,
          })
        : await apiClient.api.channels[':id']['agent-connectors'][
            ':connectorId'
          ].$put({
            param: { id: String(channelId), connectorId: connectorId! },
            json: payload,
          })
      if (!response.ok) {
        throw new Error(await readApiError(response, t('connector.saveFailed')))
      }
      const saved = (await response.json()).connector
      if (isNew) {
        void navigate(
          `/agents/${channelId}/connectors/${encodeURIComponent(saved.id)}`,
          { replace: true },
        )
      } else {
        setConnector(saved)
        setForm(toConnectorForm(saved))
        setCredentialRows([])
        setIsEditingCredentials(!saved.hasAuthConfiguration)
        setNotice(t('connector.saved'))
      }
    } catch (reason) {
      setError(getErrorMessage(reason, t('connector.saveFailed')))
    } finally {
      setIsSaving(false)
    }
  }

  const openLocalMcpDialog = async () => {
    if (!channelId || !canManage || !isNew) return
    setError(null)
    try {
      const response = await apiClient.api.channels[':id']['local-mcps'].$get({
        param: { id: String(channelId) },
      })
      if (!response.ok) {
        throw new Error(
          await readApiError(response, t('connector.localMcp.loadFailed')),
        )
      }
      const mcps = (await response.json()).mcps
      setLocalMcps(mcps)
      setSelectedLocalMcpId(mcps[0] ? String(mcps[0].id) : '')
      setIsLocalMcpDialogOpen(true)
    } catch (reason) {
      setError(getErrorMessage(reason, t('connector.localMcp.loadFailed')))
    }
  }

  const prepareLocalMcp = async () => {
    const mcpId = Number(selectedLocalMcpId)
    if (!channelId || !Number.isSafeInteger(mcpId) || mcpId <= 0) return
    setIsPreparingLocalMcp(true)
    setError(null)
    try {
      const response = await apiClient.api.channels[':id'][
        'local-mcps'
      ].prepare.$post({
        param: { id: String(channelId) },
        json: { mcpId },
      })
      if (!response.ok) {
        throw new Error(
          await readApiError(response, t('connector.localMcp.prepareFailed')),
        )
      }
      const { association } = await response.json()
      setForm({
        ...emptyConnectorForm(),
        name: association.name,
        description: association.description,
        baseUrl: association.baseUrl,
        connectorProtocol: 'MCP',
        authType: 'API_KEY',
      })
      setCredentialRows([
        {
          id: nextCredentialId,
          location: 'headers',
          fieldName: 'Authorization',
          value: association.apiKey,
          prefix: 'Bearer ',
        },
      ])
      setNextCredentialId((current) => current + 1)
      setPreparedLocalMcp({
        mcpId: association.mcpId,
        mcpName: association.mcpName,
        apiKeyId: association.apiKeyId,
        expiresAt: association.expiresAt,
      })
      setIsEditingCredentials(true)
      setIsLocalMcpDialogOpen(false)
    } catch (reason) {
      setError(getErrorMessage(reason, t('connector.localMcp.prepareFailed')))
    } finally {
      setIsPreparingLocalMcp(false)
    }
  }

  const refreshLocalMcpKey = async () => {
    if (!channelId || !connectorId || !localMcpAssociation) return
    setIsRefreshingLocalMcpKey(true)
    setError(null)
    setNotice(null)
    try {
      const response = await apiClient.api.channels[':id']['agent-connectors'][
        ':connectorId'
      ]['local-mcp-association']['refresh-key'].$post({
        param: { id: String(channelId), connectorId },
      })
      if (!response.ok) {
        throw new Error(
          await readApiError(response, t('connector.localMcp.refreshFailed')),
        )
      }
      const result = await response.json()
      setConnector(result.connector)
      setForm(toConnectorForm(result.connector))
      setLocalMcpAssociation(result.association)
      setNotice(t('connector.localMcp.refreshed'))
    } catch (reason) {
      setError(getErrorMessage(reason, t('connector.localMcp.refreshFailed')))
    } finally {
      setIsRefreshingLocalMcpKey(false)
    }
  }

  const deleteConnector = async () => {
    if (!channelId || !connectorId || !canManage) return
    setIsDeleting(true)
    setError(null)
    try {
      const response = await apiClient.api.channels[':id']['agent-connectors'][
        ':connectorId'
      ].$delete({ param: { id: String(channelId), connectorId } })
      if (!response.ok) {
        throw new Error(
          await readApiError(response, t('connector.deleteFailed')),
        )
      }
      void navigate(`/agents/${channelId}`)
    } catch (reason) {
      setError(getErrorMessage(reason, t('connector.deleteFailed')))
      setIsDeleteDialogOpen(false)
    } finally {
      setIsDeleting(false)
    }
  }

  const openNewTool = () => {
    setEditingToolId(null)
    setToolName('')
    setToolDescription('')
    setToolMethod('GET')
    setToolPath('')
    setToolUserAuthRequired(false)
    setToolAdvanced(emptyToolAdvanced)
    setToolError(null)
    setIsToolDialogOpen(true)
  }

  const openTool = (tool: ConnectorTool) => {
    setEditingToolId(tool.id)
    setToolName(tool.name)
    setToolDescription(tool.description)
    setToolMethod(tool.requestDefinition.method)
    setToolPath(tool.requestDefinition.path)
    setToolUserAuthRequired(tool.userAuthRequired)
    setToolAdvanced(
      JSON.stringify(
        {
          pathParameters: tool.requestDefinition.pathParameters,
          queryParameters: tool.requestDefinition.queryParameters,
          headers: tool.requestDefinition.headers,
          body: tool.requestDefinition.body,
          userAuthActionConfig: tool.userAuthActionConfig,
          transformationSpec: tool.transformationSpec,
        },
        null,
        2,
      ),
    )
    setToolError(null)
    setIsToolDialogOpen(true)
  }

  const saveTool = async () => {
    if (
      !channelId ||
      !connectorId ||
      !isSnakeCase(toolName) ||
      !toolDescription.trim() ||
      !toolPath.trim()
    )
      return
    let advanced: ToolAdvanced
    try {
      advanced = parseToolAdvanced(toolAdvanced)
    } catch {
      setToolError(t('connector.tools.invalidJson'))
      return
    }
    setIsSavingTool(true)
    setToolError(null)
    try {
      const payload: ConnectorToolPayload = {
        name: toolName.trim(),
        description: toolDescription.trim(),
        requestDefinition: {
          method: toolMethod,
          path: toolPath.trim(),
          pathParameters: advanced.pathParameters,
          queryParameters: advanced.queryParameters,
          headers: advanced.headers,
          body: advanced.body,
        },
        userAuthRequired: toolUserAuthRequired,
        userAuthActionConfig: advanced.userAuthActionConfig ?? undefined,
        transformationSpec: advanced.transformationSpec,
      }
      const endpoint =
        apiClient.api.channels[':id']['agent-connectors'][':connectorId'].tools
      const response = editingToolId
        ? await endpoint[':toolId'].$put({
            param: {
              id: String(channelId),
              connectorId,
              toolId: editingToolId,
            },
            json: payload,
          })
        : await endpoint.$post({
            param: { id: String(channelId), connectorId },
            json: payload,
          })
      if (!response.ok) {
        throw new Error(
          await readApiError(response, t('connector.tools.saveFailed')),
        )
      }
      const { tool } = await response.json()
      setTools((current) => [
        ...current.filter((candidate) => candidate.id !== tool.id),
        tool,
      ])
      setIsToolDialogOpen(false)
    } catch (reason) {
      setToolError(getErrorMessage(reason, t('connector.tools.saveFailed')))
    } finally {
      setIsSavingTool(false)
    }
  }

  const deleteTool = async (toolId: string) => {
    if (!channelId || !connectorId) return
    setDeletingToolId(toolId)
    setError(null)
    try {
      const response = await apiClient.api.channels[':id']['agent-connectors'][
        ':connectorId'
      ].tools[':toolId'].$delete({
        param: { id: String(channelId), connectorId, toolId },
      })
      if (!response.ok) {
        throw new Error(
          await readApiError(response, t('connector.tools.deleteFailed')),
        )
      }
      setTools((current) => current.filter((tool) => tool.id !== toolId))
    } catch (reason) {
      setError(getErrorMessage(reason, t('connector.tools.deleteFailed')))
    } finally {
      setDeletingToolId(null)
    }
  }

  const refreshMcpTools = async () => {
    if (
      !channelId ||
      !connectorId ||
      !canManage ||
      connector?.connectorProtocol !== 'MCP'
    )
      return
    setIsRefreshingMcpTools(true)
    setError(null)
    setNotice(null)
    try {
      const endpoint =
        apiClient.api.channels[':id']['agent-connectors'][':connectorId']
      const response = await endpoint['refresh-mcp-tools'].$post({
        param: { id: String(channelId), connectorId },
      })
      if (!response.ok) {
        throw new Error(
          await readApiError(response, t('connector.tools.refreshFailed')),
        )
      }
      setConnector((await response.json()).connector)
      const toolsResponse = await endpoint.tools.$get({
        param: { id: String(channelId), connectorId },
      })
      if (!toolsResponse.ok) {
        throw new Error(
          await readApiError(toolsResponse, t('connector.tools.loadFailed')),
        )
      }
      setTools((await toolsResponse.json()).tools)
      setNotice(t('connector.tools.refreshed'))
    } catch (reason) {
      setError(getErrorMessage(reason, t('connector.tools.refreshFailed')))
    } finally {
      setIsRefreshingMcpTools(false)
    }
  }

  if (isLoading) {
    return (
      <div className="grid min-h-80 place-items-center text-sm text-muted-foreground">
        {t('connector.loading')}
      </div>
    )
  }

  if (!channel) {
    return (
      <p
        className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
        role="alert"
      >
        {error ?? t('agent.channelNotFound')}
      </p>
    )
  }

  const credentialsArePreserved = Boolean(
    !isNew &&
    connector?.hasAuthConfiguration &&
    connector.authType === form.authType &&
    !isEditingCredentials,
  )
  const isLocalMcpManaged = Boolean(preparedLocalMcp || localMcpAssociation)
  const localMcpExpiresAt =
    preparedLocalMcp?.expiresAt ?? localMcpAssociation?.expiresAt
  const localMcpKeyStatus = getLocalMcpKeyStatus(
    localMcpExpiresAt,
    localMcpAssociation?.revokedAt ?? null,
  )

  const editCredentials = () => {
    setIsEditingCredentials(true)
    if (form.authType === 'API_KEY' && credentialRows.length === 0) {
      setCredentialRows([
        {
          id: nextCredentialId,
          location: 'headers',
          fieldName: '',
          value: '',
          prefix: '',
        },
      ])
      setNextCredentialId((current) => current + 1)
    }
  }

  const cancelCredentialChanges = () => {
    setCredentialRows([])
    setForm((current) => ({
      ...current,
      oauthTokenUrl: '',
      oauthScopes: [],
      oauthContentType: 'application/x-www-form-urlencoded',
      oauthClientId: '',
      oauthClientSecret: '',
    }))
    setIsEditingCredentials(false)
  }

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-center gap-4 rounded-2xl border bg-card p-5 shadow-xs sm:p-6">
        <Link
          aria-label={t('connector.back')}
          className="grid size-10 shrink-0 place-items-center rounded-full transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/25"
          to={`/agents/${channel.id}`}
        >
          <ChevronLeft className="size-5" />
        </Link>
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
          <Plug className="size-6" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold tracking-[0.12em] text-primary uppercase">
            {t('connector.eyebrow', {
              phoneNumber: `${channel.name} · ${channel.waPhoneNumber}`,
            })}
          </p>
          <h1 className="mt-1 truncate text-3xl font-black tracking-tight">
            {isNew ? t('connector.createTitle') : connector?.name}
          </h1>
        </div>
        {connector && (
          <Pill tone={connectorStatusTone(connector.connectionStatus)}>
            {t(`agent.connectors.status.${connector.connectionStatus}`)}
          </Pill>
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

      <SectionCard
        title={t('connector.form.title')}
        description={t('connector.form.description')}
        action={
          isNew ? (
            <Button
              disabled={!canManage || isSaving || isPreparingLocalMcp}
              size="sm"
              type="button"
              variant="outline"
              onClick={() => void openLocalMcpDialog()}
            >
              <Link2 className="size-4" aria-hidden />
              {t('connector.localMcp.associate')}
            </Button>
          ) : localMcpAssociation && canManage ? (
            <Button
              isLoading={isRefreshingLocalMcpKey}
              size="sm"
              type="button"
              variant="outline"
              onClick={() => void refreshLocalMcpKey()}
            >
              <RefreshCw className="size-4" aria-hidden />
              {t('connector.localMcp.refreshKey')}
            </Button>
          ) : null
        }
      >
        {isLocalMcpManaged && (
          <div className="mb-5 grid gap-2">
            <p className="rounded-lg border border-primary/25 bg-primary/8 p-3 text-sm text-primary">
              {t('connector.localMcp.managed', {
                name: preparedLocalMcp?.mcpName ?? localMcpAssociation?.mcpName,
              })}
            </p>
            {localMcpKeyStatus !== 'active' && (
              <p
                className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning"
                role="alert"
              >
                {t(`connector.localMcp.${localMcpKeyStatus}`, {
                  date: localMcpExpiresAt
                    ? new Intl.DateTimeFormat(undefined, {
                        dateStyle: 'medium',
                      }).format(new Date(localMcpExpiresAt))
                    : '',
                })}
              </p>
            )}
          </div>
        )}
        <form
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault()
            void saveConnector()
          }}
        >
          <fieldset
            className="grid gap-x-5 md:grid-cols-2"
            disabled={!canManage || isSaving || isLocalMcpManaged}
          >
            <Input
              error={
                form.name && !isSnakeCase(form.name)
                  ? t('connector.form.nameError')
                  : undefined
              }
              hint={t('connector.form.nameHint')}
              label={t('connector.form.name')}
              maxLength={64}
              placeholder="order_service"
              required
              value={form.name}
              onChange={(event) =>
                updateForm(
                  setForm,
                  'name',
                  toDelimitedName(event.target.value, '_'),
                )
              }
            />
            <Input
              label={t('connector.form.baseUrl')}
              placeholder="https://api.example.com"
              required
              type="url"
              value={form.baseUrl}
              onChange={(event) =>
                updateForm(setForm, 'baseUrl', event.target.value)
              }
            />
            <div className="md:col-span-2">
              <Textarea
                label={t('connector.form.connectorDescription')}
                required
                value={form.description}
                onChange={(event) =>
                  updateForm(setForm, 'description', event.target.value)
                }
              />
            </div>
            <Select
              label={t('connector.form.protocol')}
              value={form.connectorProtocol}
              onChange={(event) =>
                updateForm(
                  setForm,
                  'connectorProtocol',
                  event.target.value as ConnectorForm['connectorProtocol'],
                )
              }
            >
              <option value="HTTP">HTTP</option>
              <option value="MCP">MCP</option>
            </Select>
            <Select
              label={t('connector.form.authType')}
              value={form.authType}
              onChange={(event) => {
                const authType = event.target.value as ConnectorForm['authType']
                updateForm(setForm, 'authType', authType)
                setCredentialRows([])
                setIsEditingCredentials(
                  !connector?.hasAuthConfiguration ||
                    authType !== connector.authType,
                )
              }}
            >
              <option value="NONE">{t('connector.form.authNone')}</option>
              <option value="API_KEY">{t('connector.form.authApiKey')}</option>
              <option value="OAUTH2_CLIENT_CREDENTIALS">
                {t('connector.form.authOauth')}
              </option>
            </Select>
          </fieldset>

          {form.authType === 'API_KEY' && (
            <div className="rounded-xl border bg-muted/10 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold">
                    {t('connector.credentials.apiKey')}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {credentialsArePreserved
                      ? t('connector.credentials.preserved')
                      : t('connector.credentials.required')}
                  </p>
                </div>
                {credentialsArePreserved ? (
                  canManage &&
                  !isLocalMcpManaged && (
                    <Button
                      size="sm"
                      type="button"
                      variant="outline"
                      onClick={editCredentials}
                    >
                      <Pencil className="size-4" aria-hidden />
                      {t('connector.credentials.edit')}
                    </Button>
                  )
                ) : (
                  <div className="flex flex-wrap justify-end gap-2">
                    {!isNew &&
                      connector?.hasAuthConfiguration &&
                      connector.authType === form.authType && (
                        <Button
                          size="sm"
                          type="button"
                          variant="ghost"
                          onClick={cancelCredentialChanges}
                        >
                          {t('connector.credentials.cancelEdit')}
                        </Button>
                      )}
                    <Button
                      disabled={!canManage || isLocalMcpManaged}
                      size="sm"
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setCredentialRows((current) => [
                          ...current,
                          {
                            id: nextCredentialId,
                            location: 'headers',
                            fieldName: '',
                            value: '',
                            prefix: '',
                          },
                        ])
                        setNextCredentialId((current) => current + 1)
                      }}
                    >
                      <Plus className="size-4" aria-hidden />
                      {t('connector.credentials.add')}
                    </Button>
                  </div>
                )}
              </div>
              {!credentialsArePreserved && (
                <div className="mt-4 grid gap-3">
                  {credentialRows.map((row) => (
                    <div
                      className="grid items-start gap-2 md:grid-cols-[10rem_1fr_1fr_1fr_auto]"
                      key={row.id}
                    >
                      <Select
                        disabled={isLocalMcpManaged}
                        aria-label={t('connector.credentials.location')}
                        value={row.location}
                        onChange={(event) =>
                          updateCredentialRow(
                            setCredentialRows,
                            row.id,
                            'location',
                            event.target.value as CredentialLocation,
                          )
                        }
                      >
                        <option value="headers">
                          {t('connector.credentials.headers')}
                        </option>
                        <option value="queryParams">
                          {t('connector.credentials.query')}
                        </option>
                        <option value="bodyParams">
                          {t('connector.credentials.body')}
                        </option>
                      </Select>
                      <Input
                        disabled={isLocalMcpManaged}
                        aria-label={t('connector.credentials.fieldName')}
                        placeholder={t('connector.credentials.fieldName')}
                        value={row.fieldName}
                        onChange={(event) =>
                          updateCredentialRow(
                            setCredentialRows,
                            row.id,
                            'fieldName',
                            event.target.value,
                          )
                        }
                      />
                      <Input
                        disabled={isLocalMcpManaged}
                        aria-label={t('connector.credentials.value')}
                        placeholder={t('connector.credentials.value')}
                        type="password"
                        value={row.value}
                        onChange={(event) =>
                          updateCredentialRow(
                            setCredentialRows,
                            row.id,
                            'value',
                            event.target.value,
                          )
                        }
                      />
                      <Input
                        disabled={isLocalMcpManaged}
                        aria-label={t('connector.credentials.prefix')}
                        placeholder={t('connector.credentials.prefix')}
                        value={row.prefix}
                        onChange={(event) =>
                          updateCredentialRow(
                            setCredentialRows,
                            row.id,
                            'prefix',
                            event.target.value,
                          )
                        }
                      />
                      <Button
                        aria-label={t('connector.credentials.remove')}
                        className="mt-0"
                        disabled={isLocalMcpManaged}
                        size="icon"
                        type="button"
                        variant="ghost"
                        onClick={() =>
                          setCredentialRows((current) =>
                            current.filter(
                              (candidate) => candidate.id !== row.id,
                            ),
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
          )}

          {form.authType === 'OAUTH2_CLIENT_CREDENTIALS' && (
            <div className="grid gap-x-5 rounded-xl border bg-muted/10 p-4 md:grid-cols-2">
              <div className="mb-3 flex items-center gap-3 md:col-span-2">
                <KeyRound
                  className="size-4 shrink-0 text-primary"
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold">
                    {t('connector.credentials.oauth')}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {credentialsArePreserved
                      ? t('connector.credentials.preserved')
                      : t('connector.credentials.required')}
                  </p>
                </div>
                {credentialsArePreserved
                  ? canManage && (
                      <Button
                        size="sm"
                        type="button"
                        variant="outline"
                        onClick={editCredentials}
                      >
                        <Pencil className="size-4" aria-hidden />
                        {t('connector.credentials.edit')}
                      </Button>
                    )
                  : !isNew &&
                    connector?.hasAuthConfiguration &&
                    connector.authType === form.authType && (
                      <Button
                        size="sm"
                        type="button"
                        variant="ghost"
                        onClick={cancelCredentialChanges}
                      >
                        {t('connector.credentials.cancelEdit')}
                      </Button>
                    )}
              </div>
              {!credentialsArePreserved && (
                <Input
                  label={t('connector.credentials.tokenUrl')}
                  type="url"
                  value={form.oauthTokenUrl}
                  onChange={(event) =>
                    updateForm(setForm, 'oauthTokenUrl', event.target.value)
                  }
                />
              )}
              {!credentialsArePreserved && (
                <Select
                  label={t('connector.credentials.contentType')}
                  value={form.oauthContentType}
                  onChange={(event) =>
                    updateForm(
                      setForm,
                      'oauthContentType',
                      event.target.value as ConnectorForm['oauthContentType'],
                    )
                  }
                >
                  <option value="application/x-www-form-urlencoded">
                    application/x-www-form-urlencoded
                  </option>
                  <option value="application/json">application/json</option>
                </Select>
              )}
              {!credentialsArePreserved && (
                <Input
                  label={t('connector.credentials.clientId')}
                  value={form.oauthClientId}
                  onChange={(event) =>
                    updateForm(setForm, 'oauthClientId', event.target.value)
                  }
                />
              )}
              {!credentialsArePreserved && (
                <Input
                  label={t('connector.credentials.clientSecret')}
                  type="password"
                  value={form.oauthClientSecret}
                  onChange={(event) =>
                    updateForm(setForm, 'oauthClientSecret', event.target.value)
                  }
                />
              )}
              {!credentialsArePreserved && (
                <div className="md:col-span-2">
                  <TagInput
                    getRemoveLabel={(tag) =>
                      t('connector.credentials.removeScope', { tag })
                    }
                    hint={t('connector.credentials.scopeHint')}
                    label={t('connector.credentials.scopes')}
                    value={form.oauthScopes}
                    onValueChange={(value) =>
                      updateForm(setForm, 'oauthScopes', value)
                    }
                  />
                </div>
              )}
            </div>
          )}

          <div className="grid gap-4 rounded-xl border bg-muted/10 p-4">
            <Checkbox
              checked={form.requiresCertificate}
              disabled={isLocalMcpManaged}
              description={t('connector.form.certificateDescription')}
              label={t('connector.form.requiresCertificate')}
              onChange={(event) =>
                updateForm(setForm, 'requiresCertificate', event.target.checked)
              }
            />
            <Checkbox
              checked={form.hasUserAuthInjection}
              disabled={isLocalMcpManaged}
              description={t('connector.form.userAuthDescription')}
              label={t('connector.form.userAuth')}
              onChange={(event) =>
                updateForm(
                  setForm,
                  'hasUserAuthInjection',
                  event.target.checked,
                )
              }
            />
            {form.hasUserAuthInjection && (
              <div className="grid gap-x-4 md:grid-cols-3">
                <Select
                  disabled={isLocalMcpManaged}
                  label={t('connector.form.userAuthLocation')}
                  value={form.userAuthLocation}
                  onChange={(event) =>
                    updateForm(
                      setForm,
                      'userAuthLocation',
                      event.target.value as ConnectorForm['userAuthLocation'],
                    )
                  }
                >
                  {(['headers', 'query', 'path', 'body'] as const).map(
                    (location) => (
                      <option key={location} value={location}>
                        {t(userAuthLocationKey(location))}
                      </option>
                    ),
                  )}
                </Select>
                <Input
                  disabled={isLocalMcpManaged}
                  label={t('connector.form.userAuthField')}
                  value={form.userAuthFieldName}
                  onChange={(event) =>
                    updateForm(setForm, 'userAuthFieldName', event.target.value)
                  }
                />
                <Input
                  disabled={isLocalMcpManaged}
                  label={t('connector.form.userAuthPrefix')}
                  value={form.userAuthPrefix}
                  onChange={(event) =>
                    updateForm(setForm, 'userAuthPrefix', event.target.value)
                  }
                />
              </div>
            )}
          </div>

          <div className="flex justify-end border-t pt-5">
            {canManage && (!isLocalMcpManaged || isNew) ? (
              <Button
                disabled={
                  !isConnectorFormValid(
                    form,
                    isNew,
                    connector,
                    credentialRows,
                    isEditingCredentials,
                  )
                }
                isLoading={isSaving}
                type="submit"
              >
                {t(isNew ? 'connector.form.create' : 'connector.form.save')}
              </Button>
            ) : !canManage ? (
              <p className="text-sm text-muted-foreground">
                {t('agent.managersOnly')}
              </p>
            ) : null}
          </div>
        </form>
      </SectionCard>

      {!isNew && connectorId && (
        <>
          <SectionCard
            action={
              canManage && connector?.connectorProtocol === 'MCP' ? (
                <Button
                  isLoading={isRefreshingMcpTools}
                  onClick={() => void refreshMcpTools()}
                >
                  <RefreshCw className="size-4" aria-hidden />
                  {t('connector.tools.refresh')}
                </Button>
              ) : canManage ? (
                <Button onClick={openNewTool}>
                  <Plus className="size-4" aria-hidden />
                  {t('connector.tools.add')}
                </Button>
              ) : undefined
            }
            description={t(
              connector?.connectorProtocol === 'MCP'
                ? 'connector.tools.mcpDescription'
                : 'connector.tools.description',
            )}
            title={t('connector.tools.title')}
          >
            {tools.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t(
                  connector?.connectorProtocol === 'MCP'
                    ? 'connector.tools.mcpEmpty'
                    : 'connector.tools.empty',
                )}
              </p>
            ) : (
              <div className="grid gap-3">
                {tools.map((tool) => (
                  <div
                    className="flex items-start gap-3 rounded-xl border p-4"
                    key={tool.id}
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
                      <Wrench className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold">{tool.name}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {tool.description}
                      </p>
                      <code className="mt-2 block truncate text-xs text-muted-foreground">
                        {tool.requestDefinition.method}{' '}
                        {tool.requestDefinition.path}
                      </code>
                    </div>
                    {canManage && connector?.connectorProtocol !== 'MCP' && (
                      <div className="flex shrink-0 gap-1">
                        <Button
                          aria-label={t('connector.tools.edit')}
                          size="icon"
                          variant="ghost"
                          onClick={() => openTool(tool)}
                        >
                          <Pencil className="size-4" aria-hidden />
                        </Button>
                        <Button
                          aria-label={t('connector.tools.delete', {
                            name: tool.name,
                          })}
                          disabled={deletingToolId !== null}
                          isLoading={deletingToolId === tool.id}
                          size="icon"
                          variant="ghost"
                          onClick={() => void deleteTool(tool.id)}
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard
            action={
              <Button
                isLoading={isLoadingLogs}
                size="sm"
                variant="outline"
                onClick={() => void loadLogs()}
              >
                <RefreshCw className="size-4" aria-hidden />
                {t('connector.logs.refresh')}
              </Button>
            }
            description={t('connector.logs.description')}
            title={t('connector.logs.title')}
          >
            {logStats && (
              <dl className="mb-5 grid gap-3 sm:grid-cols-3">
                <LogStat
                  label={t('connector.logs.successRate')}
                  value={`${Math.round(logStats.success_rate * 100)}%`}
                />
                <LogStat
                  label={t('connector.logs.successes')}
                  value={String(logStats.success_count)}
                />
                <LogStat
                  label={t('connector.logs.exceptions')}
                  value={String(logStats.exception_count)}
                />
              </dl>
            )}
            {logs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('connector.logs.empty')}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('connector.logs.time')}</TableHead>
                    <TableHead>{t('connector.logs.tool')}</TableHead>
                    <TableHead>{t('connector.logs.result')}</TableHead>
                    <TableHead>{t('connector.logs.occurrences')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log, index) => (
                    <TableRow
                      key={`${log.eventTime ?? log.lastSeen ?? 'log'}-${index}`}
                    >
                      <TableCell>{formatLogTime(log)}</TableCell>
                      <TableCell>{log.toolName ?? '—'}</TableCell>
                      <TableCell>
                        <span
                          className={
                            log.errorMessage
                              ? 'text-destructive'
                              : 'text-success'
                          }
                        >
                          {log.errorMessage ??
                            log.failureCodeName ??
                            t('connector.logs.success')}
                        </span>
                      </TableCell>
                      <TableCell>{log.occurrences ?? 1}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </SectionCard>

          {canManage && (
            <SectionCard
              className="border-destructive/30"
              description={t('connector.danger.description')}
              title={t('connector.danger.title')}
            >
              <div className="flex justify-end">
                <Button
                  variant="danger"
                  onClick={() => setIsDeleteDialogOpen(true)}
                >
                  <Trash2 className="size-4" aria-hidden />
                  {t('connector.danger.delete')}
                </Button>
              </div>
            </SectionCard>
          )}
        </>
      )}

      <Dialog
        dismissible={!isPreparingLocalMcp}
        open={isLocalMcpDialogOpen}
        title={t('connector.localMcp.dialogTitle')}
        description={t('connector.localMcp.dialogDescription')}
        icon={
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
            <Link2 className="size-5" aria-hidden />
          </span>
        }
        onOpenChange={(open) => {
          if (!isPreparingLocalMcp) setIsLocalMcpDialogOpen(open)
        }}
      >
        <div className="grid w-full gap-4">
          {localMcps.length > 0 ? (
            <Select
              disabled={isPreparingLocalMcp}
              label={t('connector.localMcp.select')}
              value={selectedLocalMcpId}
              onChange={(event) => setSelectedLocalMcpId(event.target.value)}
            >
              {localMcps.map((mcp) => (
                <option key={mcp.id} value={mcp.id}>
                  {mcp.name}
                </option>
              ))}
            </Select>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t('connector.localMcp.empty')}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              disabled={isPreparingLocalMcp}
              variant="ghost"
              onClick={() => setIsLocalMcpDialogOpen(false)}
            >
              {t('connector.cancel')}
            </Button>
            <Button
              disabled={!selectedLocalMcpId || localMcps.length === 0}
              isLoading={isPreparingLocalMcp}
              onClick={() => void prepareLocalMcp()}
            >
              {t('connector.localMcp.associate')}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        dismissible={!isSavingTool}
        open={isToolDialogOpen}
        size="lg"
        title={t(
          editingToolId ? 'connector.tools.update' : 'connector.tools.add',
        )}
        description={t('connector.tools.dialogDescription')}
        icon={
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
            <Wrench className="size-5" aria-hidden />
          </span>
        }
        onOpenChange={(open) => {
          if (!isSavingTool) setIsToolDialogOpen(open)
        }}
      >
        <div className="grid w-full gap-4">
          <div className="grid gap-x-4 md:grid-cols-2">
            <Input
              disabled={isSavingTool}
              error={
                toolName && !isSnakeCase(toolName)
                  ? t('connector.tools.nameError')
                  : undefined
              }
              hint={t('connector.tools.nameHint')}
              label={t('connector.tools.name')}
              maxLength={64}
              placeholder="get_order"
              value={toolName}
              onChange={(event) =>
                setToolName(toDelimitedName(event.target.value, '_'))
              }
            />
            <Select
              disabled={isSavingTool}
              label={t('connector.tools.method')}
              value={toolMethod}
              onChange={(event) =>
                setToolMethod(event.target.value as typeof toolMethod)
              }
            >
              {(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const).map(
                (method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ),
              )}
            </Select>
          </div>
          <Input
            disabled={isSavingTool}
            label={t('connector.tools.path')}
            placeholder="/orders/{orderId}"
            value={toolPath}
            onChange={(event) => setToolPath(event.target.value)}
          />
          <Textarea
            disabled={isSavingTool}
            label={t('connector.tools.toolDescription')}
            value={toolDescription}
            onChange={(event) => setToolDescription(event.target.value)}
          />
          <Checkbox
            checked={toolUserAuthRequired}
            disabled={isSavingTool}
            label={t('connector.tools.userAuthRequired')}
            onChange={(event) => setToolUserAuthRequired(event.target.checked)}
          />
          <Textarea
            className="min-h-56 font-mono text-xs"
            disabled={isSavingTool}
            error={toolError ?? undefined}
            hint={t('connector.tools.advancedHint')}
            label={t('connector.tools.advanced')}
            spellCheck={false}
            value={toolAdvanced}
            onChange={(event) => {
              setToolAdvanced(event.target.value)
              setToolError(null)
            }}
          />
          <div className="flex justify-end gap-2">
            <Button
              disabled={isSavingTool}
              variant="ghost"
              onClick={() => setIsToolDialogOpen(false)}
            >
              {t('connector.cancel')}
            </Button>
            <Button
              disabled={
                !isSnakeCase(toolName) ||
                !toolDescription.trim() ||
                !toolPath.trim()
              }
              isLoading={isSavingTool}
              onClick={() => void saveTool()}
            >
              {t(
                editingToolId
                  ? 'connector.tools.update'
                  : 'connector.tools.add',
              )}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        dismissible={!isDeleting}
        open={isDeleteDialogOpen}
        title={t('connector.danger.dialogTitle')}
        description={t('connector.danger.dialogDescription', {
          name: connector?.name,
        })}
        icon={
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-destructive/12 text-destructive">
            <Trash2 className="size-5" aria-hidden />
          </span>
        }
        onOpenChange={(open) => {
          if (!isDeleting) setIsDeleteDialogOpen(open)
        }}
      >
        <div className="flex w-full justify-end gap-2">
          <Button
            disabled={isDeleting}
            variant="ghost"
            onClick={() => setIsDeleteDialogOpen(false)}
          >
            {t('connector.cancel')}
          </Button>
          <Button
            isLoading={isDeleting}
            variant="danger"
            onClick={() => void deleteConnector()}
          >
            {t('connector.danger.confirm')}
          </Button>
        </div>
      </Dialog>
    </div>
  )
}

type ToolAdvanced = Pick<
  ConnectorToolPayload['requestDefinition'],
  'pathParameters' | 'queryParameters' | 'headers' | 'body'
> &
  Pick<ConnectorToolPayload, 'userAuthActionConfig' | 'transformationSpec'>

function parseToolAdvanced(value: string): ToolAdvanced {
  const parsed: unknown = JSON.parse(value)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TypeError('Advanced tool configuration must be an object')
  }
  return parsed
}

function toConnectorForm(connector: AgentConnector): ConnectorForm {
  return {
    ...emptyConnectorForm(),
    name: connector.name,
    description: connector.description,
    baseUrl: connector.baseUrl,
    connectorProtocol: connector.connectorProtocol,
    authType:
      connector.authType === 'API_KEY' ||
      connector.authType === 'OAUTH2_CLIENT_CREDENTIALS'
        ? connector.authType
        : 'NONE',
    requiresCertificate: connector.requiresCertificate,
    hasUserAuthInjection: Boolean(connector.userAuthInjectionConfig),
    userAuthLocation: connector.userAuthInjectionConfig?.location ?? 'headers',
    userAuthFieldName: connector.userAuthInjectionConfig?.fieldName ?? '',
    userAuthPrefix: connector.userAuthInjectionConfig?.prefix ?? '',
  }
}

function toConnectorPayload(
  form: ConnectorForm,
  credentialRows: CredentialRow[],
): ConnectorPayload {
  const authConfig: ConnectorPayload['authConfig'] =
    form.authType === 'API_KEY' && credentialRows.length > 0
      ? {
          apiKey: {
            headers: credentialRows
              .filter((row) => row.location === 'headers')
              .map(toCredentialPayload),
            queryParams: credentialRows
              .filter((row) => row.location === 'queryParams')
              .map(toCredentialPayload),
            bodyParams: credentialRows
              .filter((row) => row.location === 'bodyParams')
              .map(toCredentialPayload),
          },
        }
      : form.authType === 'OAUTH2_CLIENT_CREDENTIALS' && form.oauthClientSecret
        ? {
            oauth2ClientCredentials: {
              tokenUrl: form.oauthTokenUrl.trim(),
              scopesToRequest: form.oauthScopes,
              tokenRequestContentType: form.oauthContentType,
              clientId: form.oauthClientId.trim(),
              clientSecret: form.oauthClientSecret,
            },
          }
        : undefined
  return {
    name: form.name.trim(),
    description: form.description.trim(),
    baseUrl: form.baseUrl.trim(),
    connectorProtocol: form.connectorProtocol,
    authType: form.authType,
    authConfig,
    requiresCertificate: form.requiresCertificate,
    userAuthInjectionConfig: form.hasUserAuthInjection
      ? {
          location: form.userAuthLocation,
          fieldName: form.userAuthFieldName.trim(),
          prefix: form.userAuthPrefix,
        }
      : undefined,
  }
}

function toCredentialPayload(row: CredentialRow) {
  return {
    fieldName: row.fieldName.trim(),
    value: row.value,
    ...(row.prefix ? { prefix: row.prefix } : {}),
  }
}

function isConnectorFormValid(
  form: ConnectorForm,
  isNew: boolean,
  connector: AgentConnector | null,
  credentials: CredentialRow[],
  isEditingCredentials: boolean,
) {
  if (
    !isSnakeCase(form.name) ||
    !form.description.trim() ||
    !form.baseUrl.trim()
  )
    return false
  if (form.hasUserAuthInjection && !form.userAuthFieldName.trim()) return false
  if (form.authType === 'API_KEY') {
    const hasNewCredentials =
      credentials.length > 0 &&
      credentials.every((row) => row.fieldName.trim() && row.value)
    const canPreserveCredentials = Boolean(
      !isNew &&
      connector?.hasAuthConfiguration &&
      connector.authType === form.authType &&
      !isEditingCredentials,
    )
    if (!hasNewCredentials && !canPreserveCredentials) return false
  }
  if (form.authType === 'OAUTH2_CLIENT_CREDENTIALS') {
    const hasNewCredentials = Boolean(
      form.oauthTokenUrl.trim() &&
      form.oauthClientId.trim() &&
      form.oauthClientSecret,
    )
    const canPreserveCredentials = Boolean(
      !isNew &&
      connector?.hasAuthConfiguration &&
      connector.authType === form.authType &&
      !isEditingCredentials,
    )
    if (!hasNewCredentials && !canPreserveCredentials) return false
  }
  return true
}

function isSnakeCase(value: string): boolean {
  return value.length <= 64 && /^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(value)
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

function updateForm<K extends keyof ConnectorForm>(
  setter: Dispatch<SetStateAction<ConnectorForm>>,
  key: K,
  value: ConnectorForm[K],
) {
  setter((current) => ({ ...current, [key]: value }))
}

function updateCredentialRow<K extends keyof CredentialRow>(
  setter: Dispatch<SetStateAction<CredentialRow[]>>,
  id: number,
  key: K,
  value: CredentialRow[K],
) {
  setter((current) =>
    current.map((row) => (row.id === id ? { ...row, [key]: value } : row)),
  )
}

function connectorStatusTone(status: AgentConnector['connectionStatus']) {
  if (status === 'ACTIVE') return 'success' as const
  if (status === 'ERROR' || status === 'EXPIRED') return 'danger' as const
  return 'warning' as const
}

function getLocalMcpKeyStatus(
  expiresAt: string | undefined,
  revokedAt: string | null,
): 'active' | 'expiringSoon' | 'expired' | 'revoked' {
  if (revokedAt) return 'revoked'
  if (!expiresAt) return 'active'
  const expiration = new Date(expiresAt).getTime()
  if (expiration <= Date.now()) return 'expired'
  return expiration - Date.now() < 30 * 24 * 60 * 60 * 1000
    ? 'expiringSoon'
    : 'active'
}

function userAuthLocationKey(location: ConnectorForm['userAuthLocation']) {
  if (location === 'headers') return 'connector.form.locations.headers' as const
  if (location === 'query') return 'connector.form.locations.query' as const
  if (location === 'path') return 'connector.form.locations.path' as const
  return 'connector.form.locations.body' as const
}

function LogStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-muted/20 p-4">
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-xl font-black">{value}</dd>
    </div>
  )
}

function formatLogTime(log: ConnectorLog) {
  const value = log.eventTime ?? log.lastSeen
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function parsePositiveId(value: string | undefined): number | undefined {
  if (!value || !/^[1-9]\d*$/.test(value)) return undefined
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : undefined
}

async function readApiError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as {
    message?: unknown
  } | null
  return typeof body?.message === 'string' ? body.message : fallback
}

function getErrorMessage(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback
}
