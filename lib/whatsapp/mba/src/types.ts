export interface MbaRequestOptions {
  signal?: AbortSignal
}

export interface AgentEligibilityResponse {
  is_eligible: boolean
  [key: string]: unknown
}

export interface OnboardAgentInput {
  catalog_id?: string
}

export interface OnboardAgentResponse {
  agent_id: string
  [key: string]: unknown
}

export interface AgentRollout {
  enabled: boolean
}

export interface AgentHandoff {
  enabled: boolean
  message?: string
  message_selection?: 'AGENT' | 'CUSTOM' | 'DEFAULT'
}

export interface AgentFollowup {
  enabled: boolean
  followup_interval_in_seconds?:
    0 | 300 | 900 | 1800 | 3600 | 7200 | 28800 | 86400
  message?: string
}

export type AgentAudience = 'ALLOWLISTED_ONLY' | 'EVERYONE'

export interface AgentSettingsInput {
  rollout?: AgentRollout
  handoff?: AgentHandoff
  followup?: AgentFollowup
  ai_audience?: AgentAudience
  never_say_phrases?: string[]
}

export interface AgentSettings extends Record<string, unknown> {
  agent_id: string
  channel:
    | 'email'
    | 'instagram'
    | 'line'
    | 'messenger'
    | 'sms'
    | 'tiktok'
    | 'unknown'
    | 'webchat'
    | 'whatsapp'
  rollout: AgentRollout
  handoff?: AgentHandoff | null
  followup?: AgentFollowup | null
  ai_audience?: AgentAudience | null
  never_say_phrases?: string[] | null
}

export interface AgentSettingsOptions extends MbaRequestOptions {
  agentId?: string
}

export interface AllowlistEntryInput {
  consumer_phone_number: string
}

export interface AllowlistEntry {
  id: string
  consumer_phone_number?: string
  consumer_instagram_username?: string
  [key: string]: unknown
}

export type BudgetUnitType = 'ai_turn' | 'token'
export type BudgetTimeWindow =
  'one_day' | 'seven_days' | 'fourteen_days' | 'thirty_days'

export interface AgentBudgetInput {
  budget_id?: string
  unit_type: BudgetUnitType
  time_window: BudgetTimeWindow
  max_budget: number
}

export interface AgentBudget extends AgentBudgetInput {
  budget_id: string
}

export interface AgentBudgetResponse {
  budgets: AgentBudget[]
  [key: string]: unknown
}

export interface DeleteAgentResponse {
  deleted_agent_id?: string | null
  [key: string]: unknown
}

export interface AgentTestInput {
  user_msg: string
  conversation_id?: string
}

export interface AgentTestResponse {
  message_id: string
  agent_response: string
  conversation_id: string
  timestamp?: number
  handoff_reason?: string
  no_response_reason?: string
  quick_replies?: string[]
  product_variant_ids?: string[]
  [key: string]: unknown
}

export interface ConnectorOAuthConfig {
  token_url: string
  scopes_to_request: string[]
  token_request_content_type?:
    'application/json' | 'application/x-www-form-urlencoded'
  client_id: string
  client_secret: string
}

export interface ConnectorApiKeyParam {
  field_name: string
  value: string
  prefix?: string
}

export interface ConnectorApiKeyConfig {
  headers?: ConnectorApiKeyParam[]
  query_params?: ConnectorApiKeyParam[]
  body_params?: ConnectorApiKeyParam[]
}

export interface ConnectorAuthConfig {
  oauth2_client_credentials?: ConnectorOAuthConfig
  api_key?: ConnectorApiKeyConfig
}

export interface UserAuthInjectionConfig {
  location: 'body' | 'headers' | 'path' | 'query'
  field_name: string
  prefix: string
}

export type ConnectorProtocol = 'HTTP' | 'MCP'
export type ConnectorAuthType =
  | 'OAUTH2'
  | 'OAUTH2_CLIENT_CREDENTIALS'
  | 'API_KEY'
  | 'BASIC'
  | 'CUSTOM'
  | 'NONE'
export type SupportedConnectorAuthType =
  'OAUTH2_CLIENT_CREDENTIALS' | 'API_KEY' | 'NONE'

export interface ConnectorInput {
  name: string
  description: string
  base_url: string
  connector_protocol?: ConnectorProtocol
  auth_type: SupportedConnectorAuthType
  auth_config?: ConnectorAuthConfig
  user_auth_injection_config?: UserAuthInjectionConfig
  requires_certificate?: boolean
}

export interface McpToolSync {
  status: 'ERROR' | 'PENDING' | 'READY'
  last_attempted_at?: number
  last_successful_at?: number
  fingerprint?: string
  tool_count?: number
  [key: string]: unknown
}

export interface ConnectorMtlsConfig {
  has_certificate: boolean
  fingerprint?: string
  expires_at?: number
  subject?: string
  client_certificate?: string
  ca_certificate?: string
  [key: string]: unknown
}

export interface ConnectorStatus {
  status: 'ACTIVE' | 'ERROR' | 'EXPIRED' | 'PENDING_OAUTH'
  error_message?: string
  [key: string]: unknown
}

export interface Connector extends Record<string, unknown> {
  id: string
  name: string
  description: string
  base_url: string
  connector_protocol?: ConnectorProtocol
  mcp_tool_sync?: McpToolSync | null
  auth_type: ConnectorAuthType
  auth_config?: ConnectorAuthConfig | null
  mtls_config?: ConnectorMtlsConfig | null
  connection_status: ConnectorStatus
  user_auth_injection_config?: UserAuthInjectionConfig | null
}

export interface ConnectorApiKeyInput {
  api_key_config: ConnectorApiKeyConfig
}

export interface ConnectorOAuthInput {
  oauth_config: ConnectorOAuthConfig
}

export interface ConnectorCertificateInput {
  client_certificate: string
  client_key: string
  ca_certificate?: string
}

export interface ConnectorLogOptions extends MbaRequestOptions {
  startTime?: number
  endTime?: number
  limit?: number
  toolId?: string
  includeStats?: boolean
  summaryOnly?: boolean
  topN?: number
}

export interface ConnectorLogEntry {
  event_time?: string
  failure_code_name?: string
  error_message?: string
  tool_name?: string
  occurrences?: number
  last_seen?: string
  [key: string]: unknown
}

export interface ConnectorLogStats {
  start_count: number
  success_count: number
  exception_count: number
  success_rate: number
  avg_latency_s: number
  p95_latency_s: number
  p99_latency_s: number
  time_window_seconds: number
  [key: string]: unknown
}

export interface ConnectorLogResponse {
  data: ConnectorLogEntry[]
  stats?: ConnectorLogStats
  [key: string]: unknown
}

export interface ConnectorToolParameterBinding {
  kind: 'default' | 'macro'
  value?: string
  macro?:
    | 'WHATSAPP_PHONE_NUMBER'
    | 'WHATSAPP_PHONE_NUMBER_NATIONAL'
    | 'WHATSAPP_IDENTITY_HASH'
    | 'WHATSAPP_CURRENT_STATUS_ID'
    | 'WHATSAPP_BSUID'
    | 'USER_MESSAGE'
    | 'WHATSAPP_CONVERSATION_ID'
    | 'WHATSAPP_MESSAGE_ID'
    | 'INSTAGRAM_IGSID'
    | 'INSTAGRAM_CONVERSATION_ID'
    | 'REQUEST_ID'
}

export interface ConnectorToolParameterNode {
  type: 'boolean' | 'integer' | 'number' | 'string'
  description?: string
  required?: boolean
  binding?: ConnectorToolParameterBinding
}

export interface ConnectorToolBodyNode {
  type: 'array' | 'boolean' | 'integer' | 'number' | 'object' | 'string'
  description?: string
  required?: string[]
  properties?: Record<string, ConnectorToolBodyNode>
  items?: ConnectorToolBodyNode
  binding?: ConnectorToolParameterBinding
}

export interface ConnectorToolBodyDefinition {
  content_type: 'application/json'
  params: Record<string, ConnectorToolBodyNode>
  required?: string[]
}

export interface ConnectorToolRequestDefinition {
  method: 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT'
  path: string
  path_parameters?: Record<string, ConnectorToolParameterNode>
  query_parameters?: Record<string, ConnectorToolParameterNode>
  headers?: Record<string, ConnectorToolParameterNode>
  body?: ConnectorToolBodyDefinition | null
}

export interface ConnectorToolUserAuthActionConfig {
  user_action_tool_type: 'auth' | 'refresh'
  user_auth_token_path: string
  refresh_token_path?: string
  expires_at_path?: string
  expires_at_type?: 'absolute' | 'relative_seconds'
}

export interface ConnectorToolTransformationStep {
  kind:
    | 'allowlist'
    | 'case'
    | 'catalog'
    | 'decorate_url'
    | 'dedupe'
    | 'dehydrate'
    | 'filter'
    | 'first_nonempty'
    | 'first_nonnull'
    | 'first_nonzero'
    | 'format'
    | 'html_escape'
    | 'lookup'
    | 'math'
    | 'proxy_image'
    | 'reshape'
    | 'shadow_allowlist'
    | 'string_replace'
    | 'truncate'
  target?: string
  params?: string
}

export interface ConnectorToolTransformationSpec {
  version: 1
  steps: ConnectorToolTransformationStep[]
}

export interface ConnectorToolInput {
  name: string
  description: string
  request_definition: ConnectorToolRequestDefinition
  user_auth_required: boolean
  user_auth_action_config?: ConnectorToolUserAuthActionConfig
  transformation_spec?: ConnectorToolTransformationSpec | null
}

export interface ConnectorTool extends ConnectorToolInput {
  id: string
  [key: string]: unknown
}

export interface RunConnectorToolInput {
  input?: string | Record<string, unknown>
}

export interface RunConnectorToolResponse {
  output: string
  status: string
  [key: string]: unknown
}

export interface AgentSkillInput {
  title?: string
  description?: string
  skill?: string
}

export interface AgentSkill extends Record<string, unknown> {
  id: string
  title?: string
  description?: string
  skill: string
  channel:
    | 'email'
    | 'instagram'
    | 'line'
    | 'messenger'
    | 'sms'
    | 'tiktok'
    | 'unknown'
    | 'webchat'
    | 'whatsapp'
  created_at?: number
  metadata?: Record<string, string>
  status?: 'active' | 'blocked' | 'pending_review'
}

export interface AgentSkillOptions extends MbaRequestOptions {
  agentId?: string
}

export type UiSkillComponentType =
  | 'carousel_quick_reply'
  | 'carousel_url'
  | 'cta_url'
  | 'flow'
  | 'image'
  | 'interactive_list'
  | 'interactive_reply_buttons'
  | 'location'
  | 'location_request'

export interface UiSkillCreateInput {
  title: string
  component_type: UiSkillComponentType
  status: 'disabled' | 'enabled'
  instruction: string
  flow_id?: number
}

export interface UiSkillUpdateInput {
  title?: string
  status?: 'disabled' | 'enabled'
  instruction?: string
}

export interface UiSkill extends UiSkillCreateInput {
  id: string
  created_at: number
  updated_at: number
  [key: string]: unknown
}

export interface CursorPaging {
  cursors: {
    before?: string
    after?: string
    [key: string]: unknown
  }
  previous?: string
  next?: string
  [key: string]: unknown
}

export interface CursorPage<T> {
  data: T[]
  paging?: CursorPaging
  [key: string]: unknown
}

export interface PaginationOptions extends MbaRequestOptions {
  before?: string
  after?: string
  limit?: number
}

export interface BusinessContactInfo {
  email?: string
  hours_of_operation?: string
  address?: string
}

export interface BusinessInfoInput {
  payment_method?: string
  return_policy?: string
  purchase_info?: string
  delivery_and_shipping?: string
  business_description?: string
  contact_info?: BusinessContactInfo
}

export type BusinessInfo = BusinessInfoInput & Record<string, unknown>

export interface FaqInput {
  question: string
  answer: string
  metadata?: Record<string, string>
}

export interface Faq extends FaqInput {
  id: string
  created_at?: number
  [key: string]: unknown
}

export interface KnowledgeFileUploadInput {
  file: Blob
  fileName: string
}

export interface KnowledgeFile {
  id: string
  file_name: string
  [key: string]: unknown
}

export interface KnowledgeWebsiteInput {
  url: string
  included_sub_domains?: string[]
  included_url_patterns?: string[]
  excluded_sub_domains?: string[]
  excluded_url_patterns?: string[]
  single_urls?: string[]
}

export interface KnowledgeWebsite extends KnowledgeWebsiteInput {
  id: string
  crawl_status?: string
  crawl_error?: string
  pages_crawled?: number
  last_crawled_at?: number
  created_at?: number
  [key: string]: unknown
}

export interface EvaluationCase {
  id: string
  scenario: string
  scenario_version?: string
  categories?: string[]
  max_turns?: number
  success_criteria?: string[]
  [key: string]: unknown
}

export interface EvaluationCasesResponse {
  eval_cases: EvaluationCase[]
  [key: string]: unknown
}

export interface RunEvaluationInput {
  evalCaseIds: string[]
}

export interface RunEvaluationResponse {
  job_id: string
  status: string
  [key: string]: unknown
}

export interface EvaluationProgress {
  completed: number
  total: number
  current_stage: string
  [key: string]: unknown
}

export interface EvaluationJobResult {
  summary_id: string
  avg_conversation_score?: number
  avg_turn_score?: number
  summary: string
  highlights?: string
  top_failure_categories?: string
  eval_ids_by_score?: string
  creation_time: number
  update_time: number
  [key: string]: unknown
}

export interface EvaluationJobError {
  code: string
  message: string
  failed_case_ids?: string[]
  [key: string]: unknown
}

export interface EvaluationJob {
  status: string
  progress?: EvaluationProgress
  result?: EvaluationJobResult
  error?: EvaluationJobError
  [key: string]: unknown
}

export interface EvaluationDetail {
  id: string
  score?: number
  per_turn_labels: string
  reasons: string
  custom_success_criteria?: string
  eval_case_id?: string
  transcript?: string
  creation_time: number
  update_time: number
  [key: string]: unknown
}

export interface EvaluationDetailsResponse {
  evaluations: EvaluationDetail[]
  [key: string]: unknown
}

export interface EvaluationSummary {
  id: string
  avg_conversation_score?: number
  avg_turn_score?: number
  summary: string
  highlights?: string
  top_failure_categories?: string
  eval_ids_by_score?: string
  creation_time: number
  update_time: number
  [key: string]: unknown
}

export interface EvaluationSummariesResponse {
  insights: EvaluationSummary[]
  [key: string]: unknown
}

export interface AgentEventInput {
  to: string
  event: {
    type: string
    description: string
    payload: string | Record<string, unknown>
  }
}

export interface AgentEventResponse {
  status: string
  agent_event_id?: string
  [key: string]: unknown
}

export type AgentEventProcessingStatus =
  'request_received' | 'processing' | 'sent' | 'failed' | 'skipped' | 'success'

export interface AgentEventStatusResponse {
  status: AgentEventProcessingStatus
  event_type: string
  error_message?: string
  skipped_reason?: string
  created_at: string
  updated_at: string
  [key: string]: unknown
}

export interface AgentEventInsight {
  event_type: string
  received: number
  successfully_processed: number
  avg_e2e_latency_ms?: number | null
  [key: string]: unknown
}

export interface AgentEventInsightsResponse {
  data: AgentEventInsight[]
  avg_e2e_latency_ms?: number | null
  [key: string]: unknown
}

export interface DateRangeOptions extends MbaRequestOptions {
  startDate: string | Date
  endDate: string | Date
}

export interface AgentEventInsightsOptions extends DateRangeOptions {
  eventType?: string
}

export interface ConversationTurnStep {
  type: 'LLM_CALL' | 'TOOL_CALL'
  latency_ms?: number
  status?: 'ERROR' | 'SUCCESS' | 'TIMEOUT'
  llm_output_preview?: string
  tool_name?: string
  tool_input?: string
  tool_output?: string
  [key: string]: unknown
}

export interface ConversationTurn {
  turn_id: string
  message_id?: string
  e2e_latency_ms?: number
  timestamp?: number
  conversation_id: string
  steps: ConversationTurnStep[]
  [key: string]: unknown
}

export interface ConversationTurnsOptions extends PaginationOptions {
  userPhoneNumber: string
  startTimestampMs?: number
  endTimestampMs?: number
}

export interface ConversationInsightMetric {
  count: number
  [key: string]: unknown
}

export interface ConversationInsight {
  ai_threads?: ConversationInsightMetric
  ai_handoffs?: ConversationInsightMetric
  [key: string]: unknown
}

export interface ConversationInsightsResponse {
  data: ConversationInsight[]
  [key: string]: unknown
}

export type ConversationInsightMetricName = 'ai_handoffs' | 'ai_threads'

export interface ConversationInsightsOptions extends DateRangeOptions {
  metrics?: ConversationInsightMetricName[]
}

export interface ToolCallInsight {
  tool_name: string
  thread_count: number
  avg_latency_ms?: number | null
  success_rate?: number | null
  error_rate?: number | null
  timeout_rate?: number | null
  [key: string]: unknown
}

export interface ToolCallInsightsResponse {
  data: ToolCallInsight[]
  [key: string]: unknown
}

export interface ToolCallInsightsOptions extends DateRangeOptions {
  toolName?: string
}

export interface ThreadControlInput {
  action: 'release' | 'take'
  to?: string
  recipient?: string
  metadata?: string
}

export interface ThreadControlResponse {
  messaging_product: 'whatsapp'
  [key: string]: unknown
}
