import { WhatsAppMbaApiError, WhatsAppMbaResponseError } from './errors.js'
import type * as T from './types.js'

const DEFAULT_API_BASE_URL = 'https://api.facebook.com'
const DEFAULT_API_VERSION = '2.0.0'
const DEFAULT_THREAD_CONTROL_API_VERSION = '1.0.0'
const MAX_KNOWLEDGE_FILE_BYTES = 100_000_000
const SUPPORTED_CONNECTOR_AUTH_TYPES = new Set([
  'API_KEY',
  'NONE',
  'OAUTH2_CLIENT_CREDENTIALS',
])

const KNOWLEDGE_FILE_EXTENSIONS = new Set([
  '.csv',
  '.doc',
  '.docx',
  '.jpeg',
  '.jpg',
  '.pdf',
  '.png',
  '.xlsx',
])

export type Fetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export interface WhatsAppMbaClientOptions {
  accessToken: string
  phoneNumberId: string
  businessId?: string
  apiVersion?: string
  threadControlApiVersion?: string
  apiBaseUrl?: string
  fetch?: Fetch
}

export interface WhatsAppMbaClientContract {
  getEligibility(
    options?: T.MbaRequestOptions,
  ): Promise<T.AgentEligibilityResponse>
  onboard(
    input?: T.OnboardAgentInput,
    options?: T.MbaRequestOptions,
  ): Promise<T.OnboardAgentResponse>
  getSettings(options?: T.AgentSettingsOptions): Promise<T.AgentSettings[]>
  updateSettings(
    input: T.AgentSettingsInput,
    options?: T.AgentSettingsOptions,
  ): Promise<T.AgentSettings>
  listAllowlist(options?: T.MbaRequestOptions): Promise<T.AllowlistEntry[]>
  addAllowlistEntry(
    input: T.AllowlistEntryInput,
    options?: T.MbaRequestOptions,
  ): Promise<T.AllowlistEntry>
  removeAllowlistEntry(
    entryId: string,
    options?: T.MbaRequestOptions,
  ): Promise<void>
  getBudgets(options?: T.MbaRequestOptions): Promise<T.AgentBudgetResponse>
  replaceBudgets(
    budgets: T.AgentBudgetInput[],
    options?: T.MbaRequestOptions,
  ): Promise<T.AgentBudgetResponse>
  deleteAgent(options?: T.MbaRequestOptions): Promise<T.DeleteAgentResponse>
  runTest(
    input: T.AgentTestInput,
    options?: T.MbaRequestOptions,
  ): Promise<T.AgentTestResponse>
  listConnectors(options?: T.MbaRequestOptions): Promise<T.Connector[]>
  getConnector(
    connectorId: string,
    options?: T.MbaRequestOptions,
  ): Promise<T.Connector>
  createConnector(
    input: T.ConnectorInput,
    options?: T.MbaRequestOptions,
  ): Promise<T.Connector>
  updateConnector(
    connectorId: string,
    input: T.ConnectorInput,
    options?: T.MbaRequestOptions,
  ): Promise<T.Connector>
  deleteConnector(
    connectorId: string,
    options?: T.MbaRequestOptions,
  ): Promise<void>
  getConnectorLogs(
    connectorId: string,
    options?: T.ConnectorLogOptions,
  ): Promise<T.ConnectorLogResponse>
  refreshMcpTools(
    connectorId: string,
    options?: T.MbaRequestOptions,
  ): Promise<T.Connector>
  upsertConnectorApiKey(
    connectorId: string,
    input: T.ConnectorApiKeyInput,
    options?: T.MbaRequestOptions,
  ): Promise<T.Connector>
  upsertConnectorOAuth(
    connectorId: string,
    input: T.ConnectorOAuthInput,
    options?: T.MbaRequestOptions,
  ): Promise<T.Connector>
  upsertConnectorCertificate(
    connectorId: string,
    input: T.ConnectorCertificateInput,
    options?: T.MbaRequestOptions,
  ): Promise<T.Connector>
  listConnectorTools(
    connectorId: string,
    options?: T.MbaRequestOptions,
  ): Promise<T.ConnectorTool[]>
  getConnectorTool(
    connectorId: string,
    toolId: string,
    options?: T.MbaRequestOptions,
  ): Promise<T.ConnectorTool>
  createConnectorTool(
    connectorId: string,
    input: T.ConnectorToolInput,
    options?: T.MbaRequestOptions,
  ): Promise<T.ConnectorTool>
  updateConnectorTool(
    connectorId: string,
    toolId: string,
    input: T.ConnectorToolInput,
    options?: T.MbaRequestOptions,
  ): Promise<T.ConnectorTool>
  runConnectorTool(
    connectorId: string,
    toolId: string,
    input?: T.RunConnectorToolInput,
    options?: T.MbaRequestOptions,
  ): Promise<T.RunConnectorToolResponse>
  deleteConnectorTool(
    connectorId: string,
    toolId: string,
    options?: T.MbaRequestOptions,
  ): Promise<void>
  listSkills(options?: T.AgentSkillOptions): Promise<T.AgentSkill[]>
  getSkill(
    skillId: string,
    options?: T.MbaRequestOptions,
  ): Promise<T.AgentSkill>
  createSkill(
    input: T.AgentSkillInput,
    options?: T.AgentSkillOptions,
  ): Promise<T.AgentSkill>
  updateSkill(
    skillId: string,
    input: T.AgentSkillInput,
    options?: T.MbaRequestOptions,
  ): Promise<T.AgentSkill>
  deleteSkill(skillId: string, options?: T.MbaRequestOptions): Promise<void>
  listUiSkills(options?: T.PaginationOptions): Promise<T.CursorPage<T.UiSkill>>
  getUiSkill(
    instructionId: string,
    options?: T.MbaRequestOptions,
  ): Promise<T.UiSkill>
  createUiSkill(
    input: T.UiSkillCreateInput,
    options?: T.MbaRequestOptions,
  ): Promise<T.UiSkill>
  updateUiSkill(
    instructionId: string,
    input: T.UiSkillUpdateInput,
    options?: T.MbaRequestOptions,
  ): Promise<T.UiSkill>
  deleteUiSkill(
    instructionId: string,
    options?: T.MbaRequestOptions,
  ): Promise<void>
  getBusinessInfo(options?: T.MbaRequestOptions): Promise<T.BusinessInfo>
  replaceBusinessInfo(
    input: T.BusinessInfoInput,
    options?: T.MbaRequestOptions,
  ): Promise<T.BusinessInfo>
  resetBusinessInfo(options?: T.MbaRequestOptions): Promise<void>
  listFaqs(options?: T.MbaRequestOptions): Promise<T.Faq[]>
  getFaq(faqId: string, options?: T.MbaRequestOptions): Promise<T.Faq>
  createFaq(input: T.FaqInput, options?: T.MbaRequestOptions): Promise<T.Faq>
  updateFaq(
    faqId: string,
    input: T.FaqInput,
    options?: T.MbaRequestOptions,
  ): Promise<T.Faq>
  deleteFaq(faqId: string, options?: T.MbaRequestOptions): Promise<void>
  listKnowledgeFiles(options?: T.MbaRequestOptions): Promise<T.KnowledgeFile[]>
  getKnowledgeFile(
    fileId: string,
    options?: T.MbaRequestOptions,
  ): Promise<T.KnowledgeFile>
  uploadKnowledgeFile(
    input: T.KnowledgeFileUploadInput,
    options?: T.MbaRequestOptions,
  ): Promise<T.KnowledgeFile>
  deleteKnowledgeFile(
    fileId: string,
    options?: T.MbaRequestOptions,
  ): Promise<void>
  listKnowledgeWebsites(
    options?: T.MbaRequestOptions,
  ): Promise<T.KnowledgeWebsite[]>
  getKnowledgeWebsite(
    websiteId: string,
    options?: T.MbaRequestOptions,
  ): Promise<T.KnowledgeWebsite>
  createKnowledgeWebsite(
    input: T.KnowledgeWebsiteInput,
    options?: T.MbaRequestOptions,
  ): Promise<T.KnowledgeWebsite>
  updateKnowledgeWebsite(
    websiteId: string,
    input: T.KnowledgeWebsiteInput,
    options?: T.MbaRequestOptions,
  ): Promise<T.KnowledgeWebsite>
  deleteKnowledgeWebsite(
    websiteId: string,
    options?: T.MbaRequestOptions,
  ): Promise<void>
  listEvaluationCases(
    options?: T.MbaRequestOptions,
  ): Promise<T.EvaluationCasesResponse>
  runEvaluation(
    input: T.RunEvaluationInput,
    options?: T.MbaRequestOptions,
  ): Promise<T.RunEvaluationResponse>
  getEvaluationJob(
    jobId: string,
    options?: T.MbaRequestOptions,
  ): Promise<T.EvaluationJob>
  getEvaluationDetails(
    evalIds: string[],
    options?: T.MbaRequestOptions,
  ): Promise<T.EvaluationDetailsResponse>
  getEvaluationSummaries(
    summaryIds: string[],
    options?: T.MbaRequestOptions,
  ): Promise<T.EvaluationSummariesResponse>
  sendAgentEvent(
    input: T.AgentEventInput,
    options?: T.MbaRequestOptions,
  ): Promise<T.AgentEventResponse>
  getAgentEvent(
    agentEventId: string,
    options?: T.MbaRequestOptions,
  ): Promise<T.AgentEventStatusResponse>
  getAgentEventInsights(
    options: T.AgentEventInsightsOptions,
  ): Promise<T.AgentEventInsightsResponse>
  getConversationTurns(
    options: T.ConversationTurnsOptions,
  ): Promise<T.CursorPage<T.ConversationTurn>>
  getConversationInsights(
    options: T.ConversationInsightsOptions,
  ): Promise<T.ConversationInsightsResponse>
  getToolCallInsights(
    options: T.ToolCallInsightsOptions,
  ): Promise<T.ToolCallInsightsResponse>
  transferThreadControl(
    input: T.ThreadControlInput,
    options?: T.MbaRequestOptions,
  ): Promise<T.ThreadControlResponse>
}

type HttpMethod = 'DELETE' | 'GET' | 'POST' | 'PUT'

interface RequestSpec {
  method: HttpMethod
  body?: BodyInit | object
  signal?: AbortSignal
  version?: string
}

function required(name: string, value: string): string {
  const normalized = value.trim()
  if (!normalized) throw new TypeError(`${name} must not be empty`)
  return normalized
}

function normalizeVersion(name: string, value: string): string {
  const version = required(name, value)
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new TypeError(`${name} must use the form 2.0.0`)
  }
  return version
}

function normalizeBaseUrl(value: string): URL {
  const url = new URL(value)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new TypeError('apiBaseUrl must use http or https')
  }
  url.pathname = `${url.pathname.replace(/\/$/, '')}/`
  return url
}

function httpUrl(name: string, value: string): string {
  const normalized = required(name, value)
  const url = new URL(normalized)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new TypeError(`${name} must use http or https`)
  }
  return normalized
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function responseError(message: string, body: unknown): never {
  throw new WhatsAppMbaResponseError(
    `Meta Business Agent API returned ${message}`,
    body,
  )
}

function record(body: unknown, label: string): Record<string, unknown> {
  if (!isRecord(body)) responseError(`unexpected ${label}`, body)
  return body
}

function stringField(
  object: Record<string, unknown>,
  key: string,
  body: unknown = object,
): string {
  const value = object[key]
  if (typeof value !== 'string') responseError(`an invalid ${key}`, body)
  return value
}

function booleanField(
  object: Record<string, unknown>,
  key: string,
  body: unknown = object,
): boolean {
  const value = object[key]
  if (typeof value !== 'boolean') responseError(`an invalid ${key}`, body)
  return value
}

function numberField(
  object: Record<string, unknown>,
  key: string,
  body: unknown = object,
): number {
  const value = object[key]
  if (typeof value !== 'number') responseError(`an invalid ${key}`, body)
  return value
}

function arrayField(
  object: Record<string, unknown>,
  key: string,
  body: unknown = object,
): unknown[] {
  const value = object[key]
  if (!Array.isArray(value)) responseError(`an invalid ${key}`, body)
  return value
}

function parseRecordArray<T>(
  body: unknown,
  label: string,
  parser: (value: unknown) => T,
): T[] {
  if (!Array.isArray(body)) responseError(`an unexpected ${label}`, body)
  return body.map(parser)
}

function parseJson(text: string): unknown {
  if (!text) return undefined
  try {
    return JSON.parse(text) as unknown
  } catch (cause) {
    throw new WhatsAppMbaResponseError(
      'Meta Business Agent API returned invalid JSON',
      text,
      { cause },
    )
  }
}

function positiveInteger(
  name: string,
  value: number,
  maximum?: number,
): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive safe integer`)
  }
  if (maximum !== undefined && value > maximum) {
    throw new RangeError(`${name} must not exceed ${maximum}`)
  }
  return value
}

function optionalTimestamp(
  name: string,
  value: number | undefined,
): number | undefined {
  if (value === undefined) return undefined
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`)
  }
  return value
}

function dateValue(name: string, value: string | Date): string {
  const date =
    value instanceof Date
      ? value
      : /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? new Date(`${value}T00:00:00Z`)
        : new Date(Number.NaN)
  if (Number.isNaN(date.getTime())) {
    throw new TypeError(`${name} must be a valid YYYY-MM-DD date`)
  }
  const normalized = date.toISOString().slice(0, 10)
  if (typeof value === 'string' && normalized !== value) {
    throw new TypeError(`${name} must be a valid YYYY-MM-DD date`)
  }
  return normalized
}

function dateRange(
  options: T.DateRangeOptions,
  maximumDays: number,
): [string, string] {
  const start = dateValue('startDate', options.startDate)
  const end = dateValue('endDate', options.endDate)
  const span =
    (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) /
      86_400_000 +
    1
  if (span < 1 || span > maximumDays) {
    throw new RangeError(
      `date range must contain between 1 and ${maximumDays} days`,
    )
  }
  return [start, end]
}

function setPagination(url: URL, options: T.PaginationOptions): void {
  if (options.before)
    url.searchParams.set('before', required('before', options.before))
  if (options.after)
    url.searchParams.set('after', required('after', options.after))
  if (options.limit !== undefined) {
    url.searchParams.set(
      'limit',
      String(positiveInteger('limit', options.limit)),
    )
  }
}

function nonEmptyStrings(name: string, values: string[]): string[] {
  if (values.length === 0) throw new RangeError(`${name} must not be empty`)
  return values.map((value) => required(name, value))
}

function parseEligibility(body: unknown): T.AgentEligibilityResponse {
  const value = record(body, 'eligibility response')
  booleanField(value, 'is_eligible', body)
  return value as T.AgentEligibilityResponse
}

function parseOnboarding(body: unknown): T.OnboardAgentResponse {
  const value = record(body, 'onboarding response')
  stringField(value, 'agent_id', body)
  return value as T.OnboardAgentResponse
}

function parseSettings(body: unknown): T.AgentSettings {
  const value = record(body, 'agent settings')
  stringField(value, 'agent_id', body)
  stringField(value, 'channel', body)
  const rollout = record(value.rollout, 'agent rollout')
  booleanField(rollout, 'enabled', body)
  return value as T.AgentSettings
}

function parseAllowlistEntry(body: unknown): T.AllowlistEntry {
  const value = record(body, 'allowlist entry')
  stringField(value, 'id', body)
  return value as T.AllowlistEntry
}

function parseBudget(body: unknown): T.AgentBudget {
  const value = record(body, 'budget')
  stringField(value, 'budget_id', body)
  stringField(value, 'unit_type', body)
  stringField(value, 'time_window', body)
  numberField(value, 'max_budget', body)
  return value as unknown as T.AgentBudget
}

function parseBudgets(body: unknown): T.AgentBudgetResponse {
  const value = record(body, 'budget response')
  return {
    ...value,
    budgets: arrayField(value, 'budgets', body).map(parseBudget),
  }
}

function parseDeleteAgent(body: unknown): T.DeleteAgentResponse {
  const value = record(body, 'delete-agent response')
  if (
    value.deleted_agent_id !== undefined &&
    value.deleted_agent_id !== null &&
    typeof value.deleted_agent_id !== 'string'
  ) {
    responseError('an invalid deleted_agent_id', body)
  }
  return value
}

function parseAgentTest(body: unknown): T.AgentTestResponse {
  const value = record(body, 'agent-test response')
  stringField(value, 'message_id', body)
  stringField(value, 'agent_response', body)
  stringField(value, 'conversation_id', body)
  return value as T.AgentTestResponse
}

function parseConnector(body: unknown): T.Connector {
  const value = record(body, 'connector')
  for (const key of ['id', 'name', 'description', 'base_url', 'auth_type']) {
    stringField(value, key, body)
  }
  const status = record(value.connection_status, 'connector status')
  stringField(status, 'status', body)
  return value as T.Connector
}

function parseConnectorLogs(body: unknown): T.ConnectorLogResponse {
  const value = record(body, 'connector log response')
  const data = arrayField(value, 'data', body).map((entry) =>
    record(entry, 'connector log entry'),
  )
  if (value.stats !== undefined) record(value.stats, 'connector log stats')
  return { ...value, data }
}

function parseConnectorTool(body: unknown): T.ConnectorTool {
  const value = record(body, 'connector tool')
  for (const key of ['id', 'name', 'description']) stringField(value, key, body)
  record(value.request_definition, 'connector tool request definition')
  booleanField(value, 'user_auth_required', body)
  return value as T.ConnectorTool
}

function parseRunConnectorTool(body: unknown): T.RunConnectorToolResponse {
  const value = record(body, 'connector tool run response')
  stringField(value, 'output', body)
  stringField(value, 'status', body)
  return value as T.RunConnectorToolResponse
}

function parseSkill(body: unknown): T.AgentSkill {
  const value = record(body, 'agent instruction')
  stringField(value, 'id', body)
  stringField(value, 'skill', body)
  stringField(value, 'channel', body)
  return value as T.AgentSkill
}

function parseUiSkill(body: unknown): T.UiSkill {
  const value = record(body, 'UI skill')
  for (const key of [
    'id',
    'title',
    'component_type',
    'status',
    'instruction',
  ]) {
    stringField(value, key, body)
  }
  numberField(value, 'created_at', body)
  numberField(value, 'updated_at', body)
  return value as T.UiSkill
}

function parseCursorPage<TValue>(
  body: unknown,
  label: string,
  parser: (value: unknown) => TValue,
): T.CursorPage<TValue> {
  const value = record(body, label)
  const data = arrayField(value, 'data', body).map(parser)
  if (value.paging !== undefined) record(value.paging, 'paging data')
  return { ...value, data }
}

function parseBusinessInfo(body: unknown): T.BusinessInfo {
  return record(body, 'business information')
}

function parseFaq(body: unknown): T.Faq {
  const value = record(body, 'FAQ')
  for (const key of ['id', 'question', 'answer']) stringField(value, key, body)
  return value as T.Faq
}

function parseKnowledgeFile(body: unknown): T.KnowledgeFile {
  const value = record(body, 'knowledge file')
  stringField(value, 'id', body)
  stringField(value, 'file_name', body)
  return value as T.KnowledgeFile
}

function parseKnowledgeWebsite(body: unknown): T.KnowledgeWebsite {
  const value = record(body, 'knowledge website')
  stringField(value, 'id', body)
  stringField(value, 'url', body)
  return value as T.KnowledgeWebsite
}

function parseEvaluationCase(body: unknown): T.EvaluationCase {
  const value = record(body, 'evaluation case')
  stringField(value, 'id', body)
  stringField(value, 'scenario', body)
  return value as T.EvaluationCase
}

function parseEvaluationCases(body: unknown): T.EvaluationCasesResponse {
  const value = record(body, 'evaluation cases response')
  return {
    ...value,
    eval_cases: arrayField(value, 'eval_cases', body).map(parseEvaluationCase),
  }
}

function parseRunEvaluation(body: unknown): T.RunEvaluationResponse {
  const value = record(body, 'evaluation run response')
  stringField(value, 'job_id', body)
  stringField(value, 'status', body)
  return value as T.RunEvaluationResponse
}

function parseEvaluationJob(body: unknown): T.EvaluationJob {
  const value = record(body, 'evaluation job')
  stringField(value, 'status', body)
  return value as T.EvaluationJob
}

function parseEvaluationDetail(body: unknown): T.EvaluationDetail {
  const value = record(body, 'evaluation detail')
  stringField(value, 'id', body)
  stringField(value, 'per_turn_labels', body)
  stringField(value, 'reasons', body)
  numberField(value, 'creation_time', body)
  numberField(value, 'update_time', body)
  return value as T.EvaluationDetail
}

function parseEvaluationDetails(body: unknown): T.EvaluationDetailsResponse {
  const value = record(body, 'evaluation details response')
  return {
    ...value,
    evaluations: arrayField(value, 'evaluations', body).map(
      parseEvaluationDetail,
    ),
  }
}

function parseEvaluationSummary(body: unknown): T.EvaluationSummary {
  const value = record(body, 'evaluation summary')
  stringField(value, 'id', body)
  stringField(value, 'summary', body)
  numberField(value, 'creation_time', body)
  numberField(value, 'update_time', body)
  return value as T.EvaluationSummary
}

function parseEvaluationSummaries(
  body: unknown,
): T.EvaluationSummariesResponse {
  const value = record(body, 'evaluation summary response')
  return {
    ...value,
    insights: arrayField(value, 'insights', body).map(parseEvaluationSummary),
  }
}

function parseAgentEvent(body: unknown): T.AgentEventResponse {
  const value = record(body, 'agent event response')
  stringField(value, 'status', body)
  return value as T.AgentEventResponse
}

function parseAgentEventStatus(body: unknown): T.AgentEventStatusResponse {
  const value = record(body, 'agent event status')
  for (const key of ['status', 'event_type', 'created_at', 'updated_at']) {
    stringField(value, key, body)
  }
  return value as T.AgentEventStatusResponse
}

function parseAgentEventInsight(body: unknown): T.AgentEventInsight {
  const value = record(body, 'agent event insight')
  stringField(value, 'event_type', body)
  numberField(value, 'received', body)
  numberField(value, 'successfully_processed', body)
  return value as T.AgentEventInsight
}

function parseAgentEventInsights(body: unknown): T.AgentEventInsightsResponse {
  const value = record(body, 'agent event insights response')
  return {
    ...value,
    data: arrayField(value, 'data', body).map(parseAgentEventInsight),
  }
}

function parseConversationTurn(body: unknown): T.ConversationTurn {
  const value = record(body, 'conversation turn')
  const turnId = stringField(value, 'turn_id', body)
  const conversationId = stringField(value, 'conversation_id', body)
  const steps: T.ConversationTurnStep[] = arrayField(value, 'steps', body).map(
    (step) => {
      const item = record(step, 'conversation turn step')
      const type = stringField(item, 'type', body)
      if (type !== 'LLM_CALL' && type !== 'TOOL_CALL') {
        responseError('an invalid conversation turn step type', body)
      }
      return { ...item, type }
    },
  )
  return {
    ...value,
    turn_id: turnId,
    conversation_id: conversationId,
    steps,
  }
}

function parseConversationInsight(body: unknown): T.ConversationInsight {
  return record(body, 'conversation insight')
}

function parseConversationInsights(
  body: unknown,
): T.ConversationInsightsResponse {
  const value = record(body, 'conversation insights response')
  return {
    ...value,
    data: arrayField(value, 'data', body).map(parseConversationInsight),
  }
}

function parseToolCallInsight(body: unknown): T.ToolCallInsight {
  const value = record(body, 'tool call insight')
  stringField(value, 'tool_name', body)
  numberField(value, 'thread_count', body)
  return value as T.ToolCallInsight
}

function parseToolCallInsights(body: unknown): T.ToolCallInsightsResponse {
  const value = record(body, 'tool call insights response')
  return {
    ...value,
    data: arrayField(value, 'data', body).map(parseToolCallInsight),
  }
}

function parseThreadControl(body: unknown): T.ThreadControlResponse {
  const value = record(body, 'thread-control response')
  if (value.messaging_product !== 'whatsapp') {
    responseError('an invalid messaging_product', body)
  }
  return value as T.ThreadControlResponse
}

function validateSettings(input: T.AgentSettingsInput): void {
  if (Object.keys(input).length === 0) {
    throw new TypeError('agent settings update must include at least one field')
  }
  input.never_say_phrases?.forEach((phrase) =>
    required('never_say_phrase', phrase),
  )
}

function validateBudgets(budgets: T.AgentBudgetInput[]): void {
  const keys = new Set<string>()
  for (const budget of budgets) {
    positiveInteger('max_budget', budget.max_budget)
    const key = `${budget.unit_type}:${budget.time_window}`
    if (keys.has(key)) {
      throw new TypeError(
        'budgets must not repeat a unit_type and time_window pair',
      )
    }
    keys.add(key)
    if (budget.budget_id !== undefined) required('budget_id', budget.budget_id)
  }
}

function validateConnector(input: T.ConnectorInput): T.ConnectorInput {
  const baseUrl = httpUrl('base_url', input.base_url)
  if (!SUPPORTED_CONNECTOR_AUTH_TYPES.has(input.auth_type)) {
    throw new TypeError(
      'auth_type must be API_KEY, NONE, or OAUTH2_CLIENT_CREDENTIALS',
    )
  }
  if (
    input.auth_type === 'OAUTH2_CLIENT_CREDENTIALS' &&
    !input.auth_config?.oauth2_client_credentials
  ) {
    throw new TypeError(
      'auth_config.oauth2_client_credentials is required for OAUTH2_CLIENT_CREDENTIALS',
    )
  }
  if (input.auth_type === 'API_KEY' && !input.auth_config?.api_key) {
    throw new TypeError('auth_config.api_key is required for API_KEY')
  }
  if (input.auth_type === 'NONE' && input.auth_config !== undefined) {
    throw new TypeError('auth_config must be omitted when auth_type is NONE')
  }
  return {
    ...input,
    name: required('name', input.name),
    description: required('description', input.description),
    base_url: baseUrl,
  }
}

function validateSkill(
  input: T.AgentSkillInput,
  requireContent: boolean,
): void {
  if (requireContent && Object.keys(input).length === 0) {
    throw new TypeError('agent instruction must include at least one field')
  }
  if (input.title !== undefined) {
    const title = required('title', input.title)
    if (title.length > 64 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(title)) {
      throw new TypeError(
        'title must contain lowercase letters, numbers, and single hyphens and be at most 64 characters',
      )
    }
  }
  if (input.description !== undefined && input.description.length > 1_024) {
    throw new RangeError('description must not exceed 1024 characters')
  }
  if (input.skill !== undefined && input.skill.length > 20_000) {
    throw new RangeError('skill must not exceed 20000 characters')
  }
}

function validateUiSkill(input: T.UiSkillCreateInput): void {
  required('title', input.title)
  required('instruction', input.instruction)
  if (input.component_type === 'flow' && input.flow_id === undefined) {
    throw new TypeError('flow_id is required for a flow UI skill')
  }
  if (input.component_type !== 'flow' && input.flow_id !== undefined) {
    throw new TypeError('flow_id is only supported for a flow UI skill')
  }
  if (input.flow_id !== undefined) positiveInteger('flow_id', input.flow_id)
}

function validateFaq(input: T.FaqInput): T.FaqInput {
  return {
    ...input,
    question: required('question', input.question),
    answer: required('answer', input.answer),
  }
}

function validateWebsite(
  input: T.KnowledgeWebsiteInput,
): T.KnowledgeWebsiteInput {
  return { ...input, url: httpUrl('url', input.url) }
}

export class WhatsAppMbaClient implements WhatsAppMbaClientContract {
  readonly #accessToken: string
  readonly #apiVersion: string
  readonly #baseUrl: URL
  readonly #businessId?: string
  readonly #fetch: Fetch
  readonly #phoneNumberId: string
  readonly #threadControlApiVersion: string

  constructor(options: WhatsAppMbaClientOptions) {
    this.#accessToken = required('accessToken', options.accessToken)
    this.#phoneNumberId = required('phoneNumberId', options.phoneNumberId)
    this.#businessId = options.businessId
      ? required('businessId', options.businessId)
      : undefined
    this.#apiVersion = normalizeVersion(
      'apiVersion',
      options.apiVersion ?? DEFAULT_API_VERSION,
    )
    this.#threadControlApiVersion = normalizeVersion(
      'threadControlApiVersion',
      options.threadControlApiVersion ?? DEFAULT_THREAD_CONTROL_API_VERSION,
    )
    this.#baseUrl = normalizeBaseUrl(options.apiBaseUrl ?? DEFAULT_API_BASE_URL)
    this.#fetch = options.fetch ?? globalThis.fetch
  }

  async getEligibility(options: T.MbaRequestOptions = {}) {
    return parseEligibility(
      await this.#request(this.#entityUrl('agent_eligibility'), {
        method: 'GET',
        signal: options.signal,
      }),
    )
  }

  async onboard(
    input: T.OnboardAgentInput = {},
    options: T.MbaRequestOptions = {},
  ) {
    return parseOnboarding(
      await this.#request(this.#entityUrl('agent_onboarding'), {
        method: 'POST',
        body:
          input.catalog_id === undefined
            ? {}
            : { catalog_id: required('catalog_id', input.catalog_id) },
        signal: options.signal,
      }),
    )
  }

  async getSettings(options: T.AgentSettingsOptions = {}) {
    const url = this.#entityUrl('agent_config', 'settings')
    if (options.agentId)
      url.searchParams.set('agent_id', required('agentId', options.agentId))
    return parseRecordArray(
      await this.#request(url, { method: 'GET', signal: options.signal }),
      'agent settings list',
      parseSettings,
    )
  }

  async updateSettings(
    input: T.AgentSettingsInput,
    options: T.AgentSettingsOptions = {},
  ) {
    validateSettings(input)
    const url = this.#entityUrl('agent_config', 'settings')
    if (options.agentId)
      url.searchParams.set('agent_id', required('agentId', options.agentId))
    return parseSettings(
      await this.#request(url, {
        method: 'PUT',
        body: input,
        signal: options.signal,
      }),
    )
  }

  async listAllowlist(options: T.MbaRequestOptions = {}) {
    return parseRecordArray(
      await this.#request(this.#entityUrl('agent_config', 'allowlist'), {
        method: 'GET',
        signal: options.signal,
      }),
      'allowlist',
      parseAllowlistEntry,
    )
  }

  async addAllowlistEntry(
    input: T.AllowlistEntryInput,
    options: T.MbaRequestOptions = {},
  ) {
    const phoneNumber = required(
      'consumer_phone_number',
      input.consumer_phone_number,
    )
    if (!/^\+[1-9]\d{1,14}$/.test(phoneNumber)) {
      throw new TypeError('consumer_phone_number must use E.164 format')
    }
    return parseAllowlistEntry(
      await this.#request(this.#entityUrl('agent_config', 'allowlist'), {
        method: 'POST',
        body: { consumer_phone_number: phoneNumber },
        signal: options.signal,
      }),
    )
  }

  removeAllowlistEntry(entryId: string, options: T.MbaRequestOptions = {}) {
    return this.#delete(
      this.#entityUrl(
        'agent_config',
        'allowlist',
        required('entryId', entryId),
      ),
      options,
    )
  }

  async getBudgets(options: T.MbaRequestOptions = {}) {
    return parseBudgets(
      await this.#request(this.#businessUrl('agent_budget'), {
        method: 'GET',
        signal: options.signal,
      }),
    )
  }

  async replaceBudgets(
    budgets: T.AgentBudgetInput[],
    options: T.MbaRequestOptions = {},
  ) {
    validateBudgets(budgets)
    return parseBudgets(
      await this.#request(this.#businessUrl('agent_budget'), {
        method: 'POST',
        body: { budgets },
        signal: options.signal,
      }),
    )
  }

  async deleteAgent(options: T.MbaRequestOptions = {}) {
    return parseDeleteAgent(
      await this.#request(this.#entityUrl('delete_agent'), {
        method: 'DELETE',
        signal: options.signal,
      }),
    )
  }

  async runTest(input: T.AgentTestInput, options: T.MbaRequestOptions = {}) {
    return parseAgentTest(
      await this.#request(this.#entityUrl('agent_test'), {
        method: 'POST',
        body: {
          user_msg: required('user_msg', input.user_msg),
          ...(input.conversation_id
            ? {
                conversation_id: required(
                  'conversation_id',
                  input.conversation_id,
                ),
              }
            : {}),
        },
        signal: options.signal,
      }),
    )
  }

  async listConnectors(options: T.MbaRequestOptions = {}) {
    return parseRecordArray(
      await this.#request(this.#entityUrl('agent_connectors'), {
        method: 'GET',
        signal: options.signal,
      }),
      'connector list',
      parseConnector,
    )
  }

  async getConnector(connectorId: string, options: T.MbaRequestOptions = {}) {
    return parseConnector(
      await this.#request(
        this.#entityUrl(
          'agent_connectors',
          required('connectorId', connectorId),
        ),
        { method: 'GET', signal: options.signal },
      ),
    )
  }

  async createConnector(
    input: T.ConnectorInput,
    options: T.MbaRequestOptions = {},
  ) {
    return parseConnector(
      await this.#request(this.#entityUrl('agent_connectors'), {
        method: 'POST',
        body: validateConnector(input),
        signal: options.signal,
      }),
    )
  }

  async updateConnector(
    connectorId: string,
    input: T.ConnectorInput,
    options: T.MbaRequestOptions = {},
  ) {
    return parseConnector(
      await this.#request(
        this.#entityUrl(
          'agent_connectors',
          required('connectorId', connectorId),
        ),
        {
          method: 'PUT',
          body: validateConnector(input),
          signal: options.signal,
        },
      ),
    )
  }

  deleteConnector(connectorId: string, options: T.MbaRequestOptions = {}) {
    return this.#delete(
      this.#entityUrl('agent_connectors', required('connectorId', connectorId)),
      options,
    )
  }

  async getConnectorLogs(
    connectorId: string,
    options: T.ConnectorLogOptions = {},
  ) {
    const url = this.#entityUrl(
      'agent_connectors',
      required('connectorId', connectorId),
      'logs',
    )
    const start = optionalTimestamp('startTime', options.startTime)
    const end = optionalTimestamp('endTime', options.endTime)
    if (start !== undefined) url.searchParams.set('start_time', String(start))
    if (end !== undefined) url.searchParams.set('end_time', String(end))
    if (
      start !== undefined &&
      end !== undefined &&
      (end < start || end - start > 604_800)
    ) {
      throw new RangeError(
        'connector log time range must be ordered and at most 7 days',
      )
    }
    if (options.limit !== undefined) {
      url.searchParams.set(
        'limit',
        String(positiveInteger('limit', options.limit, 1_000)),
      )
    }
    if (options.toolId)
      url.searchParams.set('tool_id', required('toolId', options.toolId))
    if (options.includeStats !== undefined) {
      url.searchParams.set('include_stats', String(options.includeStats))
    }
    if (options.summaryOnly !== undefined) {
      url.searchParams.set('summary_only', String(options.summaryOnly))
    }
    if (options.topN !== undefined) {
      url.searchParams.set(
        'top_n',
        String(positiveInteger('topN', options.topN, 50)),
      )
    }
    return parseConnectorLogs(
      await this.#request(url, { method: 'GET', signal: options.signal }),
    )
  }

  refreshMcpTools(connectorId: string, options: T.MbaRequestOptions = {}) {
    return this.#connectorAction(
      connectorId,
      'refreshMCPTools',
      undefined,
      options,
    )
  }

  upsertConnectorApiKey(
    connectorId: string,
    input: T.ConnectorApiKeyInput,
    options: T.MbaRequestOptions = {},
  ) {
    const groups = [
      input.api_key_config.headers,
      input.api_key_config.query_params,
      input.api_key_config.body_params,
    ]
    if (!groups.some((group) => group && group.length > 0)) {
      throw new TypeError(
        'api_key_config must contain at least one credential field',
      )
    }
    for (const group of groups) {
      for (const parameter of group ?? []) {
        required('api_key_config.field_name', parameter.field_name)
        required('api_key_config.value', parameter.value)
      }
    }
    return this.#connectorAction(connectorId, 'upsertApiKey', input, options)
  }

  upsertConnectorOAuth(
    connectorId: string,
    input: T.ConnectorOAuthInput,
    options: T.MbaRequestOptions = {},
  ) {
    httpUrl('token_url', input.oauth_config.token_url)
    input.oauth_config.scopes_to_request.forEach((scope) =>
      required('oauth scope', scope),
    )
    required('client_id', input.oauth_config.client_id)
    required('client_secret', input.oauth_config.client_secret)
    return this.#connectorAction(connectorId, 'upsertOAuth', input, options)
  }

  upsertConnectorCertificate(
    connectorId: string,
    input: T.ConnectorCertificateInput,
    options: T.MbaRequestOptions = {},
  ) {
    const certificate = required('client_certificate', input.client_certificate)
    const key = required('client_key', input.client_key)
    if (!certificate.startsWith('-----BEGIN CERTIFICATE-----')) {
      throw new TypeError('client_certificate must be PEM encoded')
    }
    if (
      !key.startsWith('-----BEGIN PRIVATE KEY-----') &&
      !key.startsWith('-----BEGIN RSA PRIVATE KEY-----') &&
      !key.startsWith('-----BEGIN EC PRIVATE KEY-----')
    ) {
      throw new TypeError('client_key must be PEM encoded')
    }
    return this.#connectorAction(
      connectorId,
      'upsertCertificate',
      input,
      options,
    )
  }

  async listConnectorTools(
    connectorId: string,
    options: T.MbaRequestOptions = {},
  ) {
    return parseRecordArray(
      await this.#request(this.#connectorToolsUrl(connectorId), {
        method: 'GET',
        signal: options.signal,
      }),
      'connector tool list',
      parseConnectorTool,
    )
  }

  async getConnectorTool(
    connectorId: string,
    toolId: string,
    options: T.MbaRequestOptions = {},
  ) {
    return parseConnectorTool(
      await this.#request(this.#connectorToolsUrl(connectorId, toolId), {
        method: 'GET',
        signal: options.signal,
      }),
    )
  }

  async createConnectorTool(
    connectorId: string,
    input: T.ConnectorToolInput,
    options: T.MbaRequestOptions = {},
  ) {
    return parseConnectorTool(
      await this.#request(this.#connectorToolsUrl(connectorId), {
        method: 'POST',
        body: this.#connectorToolInput(input),
        signal: options.signal,
      }),
    )
  }

  async updateConnectorTool(
    connectorId: string,
    toolId: string,
    input: T.ConnectorToolInput,
    options: T.MbaRequestOptions = {},
  ) {
    return parseConnectorTool(
      await this.#request(this.#connectorToolsUrl(connectorId, toolId), {
        method: 'PUT',
        body: this.#connectorToolInput(input),
        signal: options.signal,
      }),
    )
  }

  async runConnectorTool(
    connectorId: string,
    toolId: string,
    input: T.RunConnectorToolInput = {},
    options: T.MbaRequestOptions = {},
  ) {
    const encodedInput =
      typeof input.input === 'string'
        ? requiredJsonString('input', input.input)
        : JSON.stringify(input.input ?? {})
    return parseRunConnectorTool(
      await this.#request(this.#connectorToolsUrl(connectorId, toolId, 'run'), {
        method: 'POST',
        body: { input: encodedInput },
        signal: options.signal,
      }),
    )
  }

  deleteConnectorTool(
    connectorId: string,
    toolId: string,
    options: T.MbaRequestOptions = {},
  ) {
    return this.#delete(this.#connectorToolsUrl(connectorId, toolId), options)
  }

  async listSkills(options: T.AgentSkillOptions = {}) {
    const url = this.#entityUrl('agent_config', 'skills')
    if (options.agentId)
      url.searchParams.set('agent_id', required('agentId', options.agentId))
    return parseRecordArray(
      await this.#request(url, { method: 'GET', signal: options.signal }),
      'agent instruction list',
      parseSkill,
    )
  }

  async getSkill(skillId: string, options: T.MbaRequestOptions = {}) {
    return parseSkill(
      await this.#request(
        this.#entityUrl('agent_config', 'skills', required('skillId', skillId)),
        { method: 'GET', signal: options.signal },
      ),
    )
  }

  async createSkill(
    input: T.AgentSkillInput,
    options: T.AgentSkillOptions = {},
  ) {
    validateSkill(input, true)
    const url = this.#entityUrl('agent_config', 'skills')
    if (options.agentId)
      url.searchParams.set('agent_id', required('agentId', options.agentId))
    return parseSkill(
      await this.#request(url, {
        method: 'POST',
        body: input,
        signal: options.signal,
      }),
    )
  }

  async updateSkill(
    skillId: string,
    input: T.AgentSkillInput,
    options: T.MbaRequestOptions = {},
  ) {
    validateSkill(input, true)
    return parseSkill(
      await this.#request(
        this.#entityUrl('agent_config', 'skills', required('skillId', skillId)),
        { method: 'PUT', body: input, signal: options.signal },
      ),
    )
  }

  deleteSkill(skillId: string, options: T.MbaRequestOptions = {}) {
    return this.#delete(
      this.#entityUrl('agent_config', 'skills', required('skillId', skillId)),
      options,
    )
  }

  async listUiSkills(options: T.PaginationOptions = {}) {
    const url = this.#entityUrl('agent-ui-skills')
    setPagination(url, options)
    return parseCursorPage(
      await this.#request(url, { method: 'GET', signal: options.signal }),
      'UI skill page',
      parseUiSkill,
    )
  }

  async getUiSkill(instructionId: string, options: T.MbaRequestOptions = {}) {
    return parseUiSkill(
      await this.#request(
        this.#entityUrl(
          'agent-ui-skills',
          required('instructionId', instructionId),
        ),
        { method: 'GET', signal: options.signal },
      ),
    )
  }

  async createUiSkill(
    input: T.UiSkillCreateInput,
    options: T.MbaRequestOptions = {},
  ) {
    validateUiSkill(input)
    return parseUiSkill(
      await this.#request(this.#entityUrl('agent-ui-skills'), {
        method: 'POST',
        body: input,
        signal: options.signal,
      }),
    )
  }

  async updateUiSkill(
    instructionId: string,
    input: T.UiSkillUpdateInput,
    options: T.MbaRequestOptions = {},
  ) {
    if (Object.keys(input).length === 0) {
      throw new TypeError('UI skill update must include at least one field')
    }
    if (input.title !== undefined) required('title', input.title)
    if (input.instruction !== undefined)
      required('instruction', input.instruction)
    return parseUiSkill(
      await this.#request(
        this.#entityUrl(
          'agent-ui-skills',
          required('instructionId', instructionId),
        ),
        { method: 'PUT', body: input, signal: options.signal },
      ),
    )
  }

  deleteUiSkill(instructionId: string, options: T.MbaRequestOptions = {}) {
    return this.#delete(
      this.#entityUrl(
        'agent-ui-skills',
        required('instructionId', instructionId),
      ),
      options,
    )
  }

  async getBusinessInfo(options: T.MbaRequestOptions = {}) {
    return parseBusinessInfo(
      await this.#request(this.#entityUrl('agent_config', 'business_info'), {
        method: 'GET',
        signal: options.signal,
      }),
    )
  }

  async replaceBusinessInfo(
    input: T.BusinessInfoInput,
    options: T.MbaRequestOptions = {},
  ) {
    return parseBusinessInfo(
      await this.#request(this.#entityUrl('agent_config', 'business_info'), {
        method: 'PUT',
        body: input,
        signal: options.signal,
      }),
    )
  }

  resetBusinessInfo(options: T.MbaRequestOptions = {}) {
    return this.#delete(
      this.#entityUrl('agent_config', 'business_info'),
      options,
    )
  }

  async listFaqs(options: T.MbaRequestOptions = {}) {
    return parseRecordArray(
      await this.#request(this.#entityUrl('agent_config', 'faq'), {
        method: 'GET',
        signal: options.signal,
      }),
      'FAQ list',
      parseFaq,
    )
  }

  async getFaq(faqId: string, options: T.MbaRequestOptions = {}) {
    return parseFaq(
      await this.#request(
        this.#entityUrl('agent_config', 'faq', required('faqId', faqId)),
        { method: 'GET', signal: options.signal },
      ),
    )
  }

  async createFaq(input: T.FaqInput, options: T.MbaRequestOptions = {}) {
    return parseFaq(
      await this.#request(this.#entityUrl('agent_config', 'faq'), {
        method: 'POST',
        body: validateFaq(input),
        signal: options.signal,
      }),
    )
  }

  async updateFaq(
    faqId: string,
    input: T.FaqInput,
    options: T.MbaRequestOptions = {},
  ) {
    return parseFaq(
      await this.#request(
        this.#entityUrl('agent_config', 'faq', required('faqId', faqId)),
        { method: 'PUT', body: validateFaq(input), signal: options.signal },
      ),
    )
  }

  deleteFaq(faqId: string, options: T.MbaRequestOptions = {}) {
    return this.#delete(
      this.#entityUrl('agent_config', 'faq', required('faqId', faqId)),
      options,
    )
  }

  async listKnowledgeFiles(options: T.MbaRequestOptions = {}) {
    return parseRecordArray(
      await this.#request(this.#entityUrl('agent_config', 'files'), {
        method: 'GET',
        signal: options.signal,
      }),
      'knowledge file list',
      parseKnowledgeFile,
    )
  }

  async getKnowledgeFile(fileId: string, options: T.MbaRequestOptions = {}) {
    return parseKnowledgeFile(
      await this.#request(
        this.#entityUrl('agent_config', 'files', required('fileId', fileId)),
        { method: 'GET', signal: options.signal },
      ),
    )
  }

  async uploadKnowledgeFile(
    input: T.KnowledgeFileUploadInput,
    options: T.MbaRequestOptions = {},
  ) {
    const fileName = required('fileName', input.fileName)
    const dot = fileName.lastIndexOf('.')
    const extension = dot < 0 ? '' : fileName.slice(dot).toLowerCase()
    if (!KNOWLEDGE_FILE_EXTENSIONS.has(extension)) {
      throw new TypeError(
        'fileName must use a supported knowledge file extension',
      )
    }
    if (input.file.size > MAX_KNOWLEDGE_FILE_BYTES) {
      throw new RangeError(
        `file exceeds the ${MAX_KNOWLEDGE_FILE_BYTES}-byte knowledge-file limit`,
      )
    }
    const form = new FormData()
    form.append('file_name', fileName)
    form.append('file', input.file, fileName)
    return parseKnowledgeFile(
      await this.#request(this.#entityUrl('agent_config', 'files'), {
        method: 'POST',
        body: form,
        signal: options.signal,
      }),
    )
  }

  deleteKnowledgeFile(fileId: string, options: T.MbaRequestOptions = {}) {
    return this.#delete(
      this.#entityUrl('agent_config', 'files', required('fileId', fileId)),
      options,
    )
  }

  async listKnowledgeWebsites(options: T.MbaRequestOptions = {}) {
    return parseRecordArray(
      await this.#request(this.#entityUrl('agent_config', 'websites'), {
        method: 'GET',
        signal: options.signal,
      }),
      'knowledge website list',
      parseKnowledgeWebsite,
    )
  }

  async getKnowledgeWebsite(
    websiteId: string,
    options: T.MbaRequestOptions = {},
  ) {
    return parseKnowledgeWebsite(
      await this.#request(
        this.#entityUrl(
          'agent_config',
          'websites',
          required('websiteId', websiteId),
        ),
        { method: 'GET', signal: options.signal },
      ),
    )
  }

  async createKnowledgeWebsite(
    input: T.KnowledgeWebsiteInput,
    options: T.MbaRequestOptions = {},
  ) {
    return parseKnowledgeWebsite(
      await this.#request(this.#entityUrl('agent_config', 'websites'), {
        method: 'POST',
        body: validateWebsite(input),
        signal: options.signal,
      }),
    )
  }

  async updateKnowledgeWebsite(
    websiteId: string,
    input: T.KnowledgeWebsiteInput,
    options: T.MbaRequestOptions = {},
  ) {
    return parseKnowledgeWebsite(
      await this.#request(
        this.#entityUrl(
          'agent_config',
          'websites',
          required('websiteId', websiteId),
        ),
        { method: 'PUT', body: validateWebsite(input), signal: options.signal },
      ),
    )
  }

  deleteKnowledgeWebsite(websiteId: string, options: T.MbaRequestOptions = {}) {
    return this.#delete(
      this.#entityUrl(
        'agent_config',
        'websites',
        required('websiteId', websiteId),
      ),
      options,
    )
  }

  async listEvaluationCases(options: T.MbaRequestOptions = {}) {
    return parseEvaluationCases(
      await this.#request(this.#entityUrl('agent-eval', 'cases'), {
        method: 'GET',
        signal: options.signal,
      }),
    )
  }

  async runEvaluation(
    input: T.RunEvaluationInput,
    options: T.MbaRequestOptions = {},
  ) {
    const url = this.#entityUrl('agent-eval', 'run')
    url.searchParams.set(
      'eval_case_ids',
      nonEmptyStrings('evalCaseId', input.evalCaseIds).join(','),
    )
    return parseRunEvaluation(
      await this.#request(url, {
        method: 'POST',
        body: {},
        signal: options.signal,
      }),
    )
  }

  async getEvaluationJob(jobId: string, options: T.MbaRequestOptions = {}) {
    const url = this.#entityUrl('agent-eval', 'run')
    url.searchParams.set('job_id', required('jobId', jobId))
    return parseEvaluationJob(
      await this.#request(url, { method: 'GET', signal: options.signal }),
    )
  }

  async getEvaluationDetails(
    evalIds: string[],
    options: T.MbaRequestOptions = {},
  ) {
    const url = this.#entityUrl('agent-eval', 'details')
    url.searchParams.set(
      'eval_ids',
      nonEmptyStrings('evalId', evalIds).join(','),
    )
    return parseEvaluationDetails(
      await this.#request(url, { method: 'GET', signal: options.signal }),
    )
  }

  async getEvaluationSummaries(
    summaryIds: string[],
    options: T.MbaRequestOptions = {},
  ) {
    const url = this.#entityUrl('agent-eval', 'summary')
    url.searchParams.set(
      'summary_ids',
      nonEmptyStrings('summaryId', summaryIds).join(','),
    )
    return parseEvaluationSummaries(
      await this.#request(url, { method: 'GET', signal: options.signal }),
    )
  }

  async sendAgentEvent(
    input: T.AgentEventInput,
    options: T.MbaRequestOptions = {},
  ) {
    const eventType = required('event.type', input.event.type)
    const description = required('event.description', input.event.description)
    if (eventType.length > 256)
      throw new RangeError('event.type must not exceed 256 characters')
    if (description.length > 1_024) {
      throw new RangeError('event.description must not exceed 1024 characters')
    }
    const payload =
      typeof input.event.payload === 'string'
        ? requiredJsonString('event.payload', input.event.payload)
        : JSON.stringify(input.event.payload)
    if (payload.length > 4_096) {
      throw new RangeError('event.payload must not exceed 4096 characters')
    }
    return parseAgentEvent(
      await this.#request(this.#entityUrl('agent_event'), {
        method: 'POST',
        body: {
          to: required('to', input.to),
          event: { type: eventType, description, payload },
        },
        signal: options.signal,
      }),
    )
  }

  async getAgentEvent(agentEventId: string, options: T.MbaRequestOptions = {}) {
    return parseAgentEventStatus(
      await this.#request(
        this.#entityUrl('agent_event', required('agentEventId', agentEventId)),
        { method: 'GET', signal: options.signal },
      ),
    )
  }

  async getAgentEventInsights(options: T.AgentEventInsightsOptions) {
    const [startDate, endDate] = dateRange(options, 30)
    const url = this.#entityUrl('insights', 'agent_events')
    url.searchParams.set('start_date', startDate)
    url.searchParams.set('end_date', endDate)
    if (options.eventType) {
      url.searchParams.set(
        'event_type',
        required('eventType', options.eventType),
      )
    }
    return parseAgentEventInsights(
      await this.#request(url, { method: 'GET', signal: options.signal }),
    )
  }

  async getConversationTurns(options: T.ConversationTurnsOptions) {
    const url = this.#entityUrl('insights', 'conversations', 'turns')
    url.searchParams.set(
      'user_phone_number',
      required('userPhoneNumber', options.userPhoneNumber),
    )
    const start = optionalTimestamp(
      'startTimestampMs',
      options.startTimestampMs,
    )
    const end = optionalTimestamp('endTimestampMs', options.endTimestampMs)
    if (start !== undefined)
      url.searchParams.set('start_timestamp_ms', String(start))
    if (end !== undefined) url.searchParams.set('end_timestamp_ms', String(end))
    if (start !== undefined && end !== undefined && end < start) {
      throw new RangeError('endTimestampMs must not be before startTimestampMs')
    }
    setPagination(url, options)
    return parseCursorPage(
      await this.#request(url, { method: 'GET', signal: options.signal }),
      'conversation turn page',
      parseConversationTurn,
    )
  }

  async getConversationInsights(options: T.ConversationInsightsOptions) {
    const [startDate, endDate] = dateRange(options, 90)
    const url = this.#entityUrl('insights', 'conversations')
    url.searchParams.set('start_date', startDate)
    url.searchParams.set('end_date', endDate)
    for (const metric of options.metrics ?? [])
      url.searchParams.append('metrics', metric)
    return parseConversationInsights(
      await this.#request(url, { method: 'GET', signal: options.signal }),
    )
  }

  async getToolCallInsights(options: T.ToolCallInsightsOptions) {
    const [startDate, endDate] = dateRange(options, 30)
    const url = this.#entityUrl('insights', 'tool_calls')
    url.searchParams.set('start_date', startDate)
    url.searchParams.set('end_date', endDate)
    if (options.toolName) {
      url.searchParams.set('tool_name', required('toolName', options.toolName))
    }
    return parseToolCallInsights(
      await this.#request(url, { method: 'GET', signal: options.signal }),
    )
  }

  async transferThreadControl(
    input: T.ThreadControlInput,
    options: T.MbaRequestOptions = {},
  ) {
    if (!['release', 'take'].includes(input.action)) {
      throw new TypeError('thread control action must be release or take')
    }
    if (!input.to && !input.recipient) {
      throw new TypeError('thread control requires to or recipient')
    }
    return parseThreadControl(
      await this.#request(
        this.#url(
          'business',
          'whatsapp',
          'phone_numbers',
          this.#phoneNumberId,
          'thread_control',
        ),
        {
          method: 'POST',
          body: { messaging_product: 'whatsapp', ...input },
          signal: options.signal,
          version: this.#threadControlApiVersion,
        },
      ),
    )
  }

  async #connectorAction(
    connectorId: string,
    action:
      'refreshMCPTools' | 'upsertApiKey' | 'upsertCertificate' | 'upsertOAuth',
    body: object | undefined,
    options: T.MbaRequestOptions,
  ): Promise<T.Connector> {
    return parseConnector(
      await this.#request(
        this.#entityUrl(
          'agent_connectors',
          required('connectorId', connectorId),
          action,
        ),
        { method: 'POST', body, signal: options.signal },
      ),
    )
  }

  #connectorToolInput(input: T.ConnectorToolInput): T.ConnectorToolInput {
    required('name', input.name)
    required('description', input.description)
    required('request_definition.path', input.request_definition.path)
    if (
      input.transformation_spec &&
      input.transformation_spec.steps.length > 5
    ) {
      throw new RangeError(
        'transformation_spec must not contain more than 5 steps',
      )
    }
    return input
  }

  #connectorToolsUrl(
    connectorId: string,
    toolId?: string,
    action?: string,
  ): URL {
    const segments = [
      'agent_connectors',
      required('connectorId', connectorId),
      'tools',
    ]
    if (toolId !== undefined) segments.push(required('toolId', toolId))
    if (action !== undefined) segments.push(action)
    return this.#entityUrl(...segments)
  }

  async #delete(url: URL, options: T.MbaRequestOptions): Promise<void> {
    await this.#request(url, { method: 'DELETE', signal: options.signal })
  }

  async #request(url: URL, request: RequestSpec): Promise<unknown> {
    const isBodyInit =
      request.body instanceof FormData ||
      typeof request.body === 'string' ||
      request.body instanceof Blob ||
      request.body instanceof URLSearchParams ||
      request.body instanceof ArrayBuffer ||
      ArrayBuffer.isView(request.body)
    const hasJsonBody = request.body !== undefined && !isBodyInit
    const response = await this.#fetch(url, {
      method: request.method,
      headers: {
        authorization: `Bearer ${this.#accessToken}`,
        'x-api-version': request.version ?? this.#apiVersion,
        ...(hasJsonBody ? { 'content-type': 'application/json' } : {}),
      },
      body: hasJsonBody
        ? JSON.stringify(request.body)
        : (request.body as BodyInit | undefined),
      signal: request.signal,
    })
    const responseText = await response.text()
    if (!response.ok) {
      let errorBody: unknown = responseText
      try {
        errorBody = parseJson(responseText)
      } catch {
        // Error responses from Meta gateways are not guaranteed to be JSON.
      }
      throw new WhatsAppMbaApiError(response.status, errorBody)
    }
    return parseJson(responseText)
  }

  #entityUrl(...segments: string[]): URL {
    return this.#url(this.#phoneNumberId, ...segments)
  }

  #businessUrl(...segments: string[]): URL {
    if (!this.#businessId) {
      throw new TypeError('businessId is required for agent budget operations')
    }
    return this.#url(this.#businessId, ...segments)
  }

  #url(...segments: string[]): URL {
    return new URL(
      segments.map((segment) => encodeURIComponent(segment)).join('/'),
      this.#baseUrl,
    )
  }
}

function requiredJsonString(name: string, value: string): string {
  const normalized = required(name, value)
  try {
    JSON.parse(normalized)
  } catch (cause) {
    throw new TypeError(`${name} must contain valid JSON`, { cause })
  }
  return normalized
}

export function createWhatsAppMbaClient(
  options: WhatsAppMbaClientOptions,
): WhatsAppMbaClient {
  return new WhatsAppMbaClient(options)
}
