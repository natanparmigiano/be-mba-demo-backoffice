import { auth } from '@mba-demo/auth'
import { createWhatsAppAnalyticsClient } from '@mba-demo/wa-analytics'
import {
  createWhatsAppComponentsClient,
  type ConversationalComponents,
  type WriteConversationalComponentsInput,
} from '@mba-demo/wa-components'
import {
  agentBackups,
  channels,
  chatEvents,
  chats,
  contacts,
  db,
  groups,
  member,
  messages,
  messageStatusEvents,
  runnerAgentMcpConnectors,
  runnerFunctionApiKeys,
  runnerMcps,
  webhooks,
} from '@mba-demo/db'
import {
  hashApiKey,
  runner,
  type RunnerMcpDefinition,
  type RunnerMcpPackage,
} from '@mba-demo/runner'
import {
  createWhatsAppMbaClient,
  WhatsAppMbaApiError,
  WhatsAppMbaResponseError,
  type AgentEligibilityResponse,
  type AgentSettings,
  type AgentSettingsInput,
  type AgentSkill,
  type AgentSkillInput,
  type AllowlistEntry,
  type AllowlistEntryInput,
  type BusinessInfo,
  type BusinessInfoInput,
  type Connector,
  type ConnectorAuthConfig,
  type ConnectorCertificateInput,
  type ConnectorInput,
  type ConnectorLogResponse,
  type ConnectorTool,
  type ConnectorToolBodyNode,
  type ConnectorToolInput,
  type DeleteAgentResponse,
  type EvaluationCase,
  type EvaluationDetail,
  type EvaluationJob,
  type EvaluationSummary,
  type Faq,
  type FaqInput,
  type KnowledgeFile,
  type KnowledgeWebsite,
  type KnowledgeWebsiteInput,
  type OnboardAgentResponse,
} from '@mba-demo/wa-mba'
import {
  createWhatsAppWebhookRegistrationClient,
  MBA_WEBHOOK_SUBSCRIPTION_FIELDS,
  WhatsAppWebhookRegistrationApiError,
  WhatsAppWebhookRegistrationResponseError,
} from '@mba-demo/wa-subscriptions'
import {
  createWhatsAppRegistrationClient,
  WhatsAppRegistrationApiError,
  WhatsAppRegistrationResponseError,
  type PhoneNumberInfo,
  type SuccessResponse as RegistrationSuccessResponse,
} from '@mba-demo/wa-registration'
import {
  createWhatsAppQrClient,
  WhatsAppQrApiError,
  WhatsAppQrResponseError,
  type MessageQrCode,
} from '@mba-demo/wa-qr'
import { zValidator } from '@hono/zod-validator'
import { and, count, eq, inArray, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import {
  createAgentExportArchive,
  knowledgeFileArchivePath,
} from '../agent-export.js'
import {
  createAgentKnowledgeArchive,
  type AgentKnowledgeArchive,
} from '../agent-knowledge-archive.js'
import { parseAgentArchive } from '../agent-import.js'
import {
  parseRunnerMcpPackageYaml,
  stringifyRunnerMcpPackageYaml,
} from '../runner-mcp-package.js'
import { stringifyYaml } from '../yaml.js'
import {
  createAgentBackupService,
  type AgentBackupService,
} from '../agent-backups.js'

const requiredText = z.string().trim().min(1).max(500)
const secretText = z.string().trim().min(1).max(10_000)
const webhookForwardUrl = z.string().trim().url().max(2_048).refine(isHttpUrl, {
  message: 'Forward URLs must use HTTP or HTTPS',
})
const webhookForwardUrls = z
  .array(webhookForwardUrl)
  .max(20)
  .refine((urls) => new Set(urls).size === urls.length, {
    message: 'Forward URLs must be unique',
  })
const registerPhoneNumberSchema = z.object({
  pin: z.string().regex(/^\d{6}$/),
})

const createChannelSchema = z.object({
  name: requiredText,
  waPhoneNumber: requiredText,
  waPhoneNumberId: requiredText,
  waWabaId: requiredText,
  waBusinessId: requiredText,
  waAppId: requiredText,
  waAppSecret: secretText,
  waWebhookVerifyToken: secretText,
  waSystemUserAccessToken: secretText,
  webhookForwardUrls: webhookForwardUrls.default([]),
})

const updateChannelSchema = createChannelSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one channel field is required',
  })

const setWebhookSchema = z.object({
  callbackUrl: z.string().url(),
})

const deleteChannelSchema = z.object({
  confirmation: z.string().trim().min(1).max(500),
})

const updateAgentSettingsSchema = z
  .object({
    rolloutEnabled: z.boolean().optional(),
    audience: z.enum(['EVERYONE', 'ALLOWLISTED_ONLY']).optional(),
    handoff: z
      .object({
        enabled: z.boolean(),
        messageSelection: z.enum(['AGENT', 'CUSTOM', 'DEFAULT']),
        message: z.string().trim().max(10_000).optional(),
      })
      .superRefine((handoff, context) => {
        if (handoff.messageSelection === 'CUSTOM' && !handoff.message?.trim()) {
          context.addIssue({
            code: 'custom',
            message: 'A custom handoff message is required',
            path: ['message'],
          })
        }
      })
      .optional(),
    neverSayPhrases: z
      .array(z.string().trim().min(1).max(500))
      .max(100)
      .refine((phrases) => new Set(phrases).size === phrases.length, {
        message: 'Never-say phrases must be unique',
      })
      .optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: 'At least one agent setting is required',
  })

const addAgentAllowlistEntrySchema = z.object({
  phoneNumber: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{1,14}$/, 'Phone number must use E.164 format'),
})

const businessInfoText = z.string().trim().max(10_000)
const businessInfoSchema = z.object({
  businessDescription: businessInfoText,
  paymentMethod: businessInfoText,
  purchaseInfo: businessInfoText,
  deliveryAndShipping: businessInfoText,
  returnPolicy: businessInfoText,
  contactEmail: z.union([z.literal(''), z.string().trim().email().max(500)]),
  hoursOfOperation: businessInfoText,
  address: businessInfoText,
})

const faqSchema = z.object({
  question: z.string().trim().min(1).max(10_000),
  answer: z.string().trim().min(1).max(50_000),
})

const agentSkillSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Skill title must use kebab-case'),
    description: z.string().max(1_024),
    skill: z.string().trim().min(1).max(20_000),
  })
  .strict()

const connectorCredentialParamSchema = z.object({
  fieldName: z.string().trim().min(1).max(500),
  value: z.string().min(1).max(10_000),
  prefix: z.string().max(500).optional(),
})

const connectorAuthConfigSchema = z.object({
  apiKey: z
    .object({
      headers: z.array(connectorCredentialParamSchema).max(100).default([]),
      queryParams: z.array(connectorCredentialParamSchema).max(100).default([]),
      bodyParams: z.array(connectorCredentialParamSchema).max(100).default([]),
    })
    .optional(),
  oauth2ClientCredentials: z
    .object({
      tokenUrl: z.string().trim().url().max(2_048).refine(isHttpUrl, {
        message: 'Token URL must use HTTP or HTTPS',
      }),
      scopesToRequest: z.array(z.string().trim().min(1).max(500)).max(100),
      tokenRequestContentType: z
        .enum(['application/json', 'application/x-www-form-urlencoded'])
        .optional(),
      clientId: z.string().trim().min(1).max(10_000),
      clientSecret: z.string().min(1).max(10_000),
    })
    .optional(),
})

const connectorSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(
        /^[a-z0-9]+(?:_[a-z0-9]+)*$/,
        'Connector name must use snake_case',
      ),
    description: z.string().trim().min(1).max(10_000),
    baseUrl: z.string().trim().url().max(2_048).refine(isHttpUrl, {
      message: 'Base URL must use HTTP or HTTPS',
    }),
    connectorProtocol: z.enum(['HTTP', 'MCP']).default('HTTP'),
    authType: z.enum(['OAUTH2_CLIENT_CREDENTIALS', 'API_KEY', 'NONE']),
    authConfig: connectorAuthConfigSchema.optional(),
    userAuthInjectionConfig: z
      .object({
        location: z.enum(['body', 'headers', 'path', 'query']),
        fieldName: z.string().trim().min(1).max(500),
        prefix: z.string().max(500),
      })
      .optional(),
    requiresCertificate: z.boolean().default(false),
  })
  .strict()

const localMcpAssociationSchema = z.object({
  mcpId: z.number().int().positive(),
  apiKeyId: z.number().int().positive(),
})

const createConnectorSchema = connectorSchema
  .extend({ localMcpAssociation: localMcpAssociationSchema.optional() })
  .superRefine((input, context) => {
    if (input.authType === 'API_KEY' && !input.authConfig?.apiKey) {
      context.addIssue({
        code: 'custom',
        message: 'API key configuration is required',
        path: ['authConfig', 'apiKey'],
      })
    }
    if (
      input.authType === 'API_KEY' &&
      input.authConfig?.apiKey &&
      input.authConfig.apiKey.headers.length === 0 &&
      input.authConfig.apiKey.queryParams.length === 0 &&
      input.authConfig.apiKey.bodyParams.length === 0
    ) {
      context.addIssue({
        code: 'custom',
        message: 'At least one API key field is required',
        path: ['authConfig', 'apiKey'],
      })
    }
    if (
      input.authType === 'OAUTH2_CLIENT_CREDENTIALS' &&
      !input.authConfig?.oauth2ClientCredentials
    ) {
      context.addIssue({
        code: 'custom',
        message: 'OAuth client credentials are required',
        path: ['authConfig', 'oauth2ClientCredentials'],
      })
    }
  })

const prepareLocalMcpAssociationSchema = z.object({
  mcpId: z.number().int().positive(),
})

const connectorParameterBindingSchema = z.object({
  kind: z.enum(['default', 'macro']),
  value: z.string().optional(),
  macro: z
    .enum([
      'WHATSAPP_PHONE_NUMBER',
      'WHATSAPP_PHONE_NUMBER_NATIONAL',
      'WHATSAPP_IDENTITY_HASH',
      'WHATSAPP_CURRENT_STATUS_ID',
      'WHATSAPP_BSUID',
      'USER_MESSAGE',
      'WHATSAPP_CONVERSATION_ID',
      'WHATSAPP_MESSAGE_ID',
      'INSTAGRAM_IGSID',
      'INSTAGRAM_CONVERSATION_ID',
      'REQUEST_ID',
    ])
    .optional(),
})

const connectorParameterNodeSchema = z.object({
  type: z.enum(['boolean', 'integer', 'number', 'string']),
  description: z.string().max(10_000).optional(),
  required: z.boolean().optional(),
  binding: connectorParameterBindingSchema.optional(),
})

const connectorBodyNodeSchema: z.ZodType<ConnectorToolBodyNode> = z.lazy(() =>
  z.object({
    type: z.enum(['array', 'boolean', 'integer', 'number', 'object', 'string']),
    description: z.string().max(10_000).optional(),
    required: z.array(z.string().trim().min(1).max(500)).optional(),
    properties: z.record(z.string(), connectorBodyNodeSchema).optional(),
    items: connectorBodyNodeSchema.optional(),
    binding: connectorParameterBindingSchema.optional(),
  }),
)

const connectorToolSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(
        /^[a-z0-9]+(?:_[a-z0-9]+)*$/,
        'Connector tool name must use snake_case',
      ),
    description: z.string().trim().min(1).max(10_000),
    requestDefinition: z.object({
      method: z.enum(['DELETE', 'GET', 'PATCH', 'POST', 'PUT']),
      path: z.string().trim().min(1).max(2_048),
      pathParameters: z
        .record(z.string(), connectorParameterNodeSchema)
        .optional(),
      queryParameters: z
        .record(z.string(), connectorParameterNodeSchema)
        .optional(),
      headers: z.record(z.string(), connectorParameterNodeSchema).optional(),
      body: z
        .object({
          contentType: z.literal('application/json'),
          params: z.record(z.string(), connectorBodyNodeSchema),
          required: z.array(z.string().trim().min(1).max(500)).optional(),
        })
        .nullable()
        .optional(),
    }),
    userAuthRequired: z.boolean(),
    userAuthActionConfig: z
      .object({
        userActionToolType: z.enum(['auth', 'refresh']),
        userAuthTokenPath: z.string().trim().min(1).max(2_048),
        refreshTokenPath: z.string().trim().min(1).max(2_048).optional(),
        expiresAtPath: z.string().trim().min(1).max(2_048).optional(),
        expiresAtType: z.enum(['absolute', 'relative_seconds']).optional(),
      })
      .optional(),
    transformationSpec: z
      .object({
        version: z.literal(1),
        steps: z
          .array(
            z.object({
              kind: z.enum([
                'allowlist',
                'case',
                'catalog',
                'decorate_url',
                'dedupe',
                'dehydrate',
                'filter',
                'first_nonempty',
                'first_nonnull',
                'first_nonzero',
                'format',
                'html_escape',
                'lookup',
                'math',
                'proxy_image',
                'reshape',
                'shadow_allowlist',
                'string_replace',
                'truncate',
              ]),
              target: z.string().optional(),
              params: z.string().optional(),
            }),
          )
          .max(5),
      })
      .nullable()
      .optional(),
  })
  .strict()

const runEvaluationSchema = z.object({
  evalCaseIds: z
    .array(z.string().trim().min(1).max(500))
    .min(1)
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: 'Evaluation case IDs must be unique',
    }),
})

const evaluationIdsQuerySchema = z.object({
  ids: z.string().trim().min(1).max(50_000),
})

const knowledgeStringList = z
  .array(z.string().trim().min(1).max(2_048))
  .max(100)
const knowledgeWebsiteSchema = z.object({
  url: z.string().trim().url().max(2_048).refine(isHttpUrl, {
    message: 'Website URL must use HTTP or HTTPS',
  }),
  includedSubDomains: knowledgeStringList,
  includedUrlPatterns: knowledgeStringList,
  excludedSubDomains: knowledgeStringList,
  excludedUrlPatterns: knowledgeStringList,
  singleUrls: knowledgeStringList,
})

const knowledgeFileExtensions = new Set([
  '.csv',
  '.doc',
  '.docx',
  '.jpeg',
  '.jpg',
  '.pdf',
  '.png',
  '.xlsx',
])
const maximumKnowledgeFileBytes = 100_000_000
const maximumAgentImportBytes = 512 * 1024 * 1024

const agentImportConnectorToolSchema = connectorToolSchema.extend({
  id: z.string().min(1),
  userAuthActionConfig:
    connectorToolSchema.shape.userAuthActionConfig.nullable(),
})

const agentImportConnectorSchema = connectorSchema
  .omit({ authConfig: true })
  .extend({
    id: z.string().min(1),
    hasAuthConfiguration: z.boolean(),
    hasCertificate: z.boolean(),
    connectionStatus: z.string(),
    connectionError: z.string().nullable(),
    userAuthInjectionConfig:
      connectorSchema.shape.userAuthInjectionConfig.nullable(),
    mcpToolSync: z.unknown().nullable(),
    localMcp: z
      .object({
        name: z.string().trim().min(1).max(64),
        path: z
          .string()
          .min(1)
          .max(1_024)
          .refine((path) => path.startsWith('MCPs/')),
      })
      .nullable()
      .optional()
      .default(null),
    tools: z
      .array(agentImportConnectorToolSchema)
      .max(500)
      .optional()
      .default([]),
  })
  .superRefine((connector, context) => {
    if (connector.localMcp && connector.connectorProtocol !== 'MCP') {
      context.addIssue({
        code: 'custom',
        path: ['localMcp'],
        message: 'Local MCP associations require the MCP protocol',
      })
    }
  })

const agentImportManifestSchema = z.object({
  format: z.literal('agtx'),
  version: z.literal(1),
  agent: z
    .object({
      settings: z.object({
        agentId: z.string().min(1),
        rolloutEnabled: z.boolean(),
        audience: z.enum(['EVERYONE', 'ALLOWLISTED_ONLY']),
        handoff: z.object({
          enabled: z.boolean(),
          messageSelection: z.enum(['AGENT', 'CUSTOM', 'DEFAULT']),
          message: z.string().max(10_000),
        }),
        neverSayPhrases: z.array(z.string().min(1).max(500)).max(100),
      }),
      allowlist: z
        .array(
          z.object({
            id: z.string().min(1),
            phoneNumber: z.string().nullable(),
          }),
        )
        .max(10_000),
      businessInfo: businessInfoSchema,
      qrCodes: z
        .array(
          z.object({
            prefilledMessage: z.string().trim().min(1).max(1_024),
          }),
        )
        .max(100)
        .default([]),
      components: z
        .object({
          prompts: z.array(z.string().trim().min(1).max(80)).max(4),
          commands: z
            .array(
              z.object({
                commandName: z.string().trim().min(1).max(32),
                commandDescription: z.string().trim().min(1).max(256),
              }),
            )
            .max(30),
        })
        .default({ prompts: [], commands: [] }),
      skills: z
        .array(
          agentSkillSchema.extend({
            id: z.string().min(1),
            channel: z.string(),
            status: z.string().nullable(),
          }),
        )
        .max(1_000),
      knowledge: z.object({
        faqs: z
          .array(
            faqSchema.extend({ id: z.string().min(1), createdAt: z.unknown() }),
          )
          .max(10_000),
        websites: z
          .array(
            knowledgeWebsiteSchema.extend({
              id: z.string().min(1),
              crawlStatus: z.unknown(),
              crawlError: z.unknown(),
              pagesCrawled: z.unknown(),
              lastCrawledAt: z.unknown(),
            }),
          )
          .max(1_000),
        files: z
          .array(
            z.object({
              providerFileId: z.string().min(1).max(500),
              fileName: z.string().min(1).max(500),
              path: z
                .string()
                .min(1)
                .max(1_024)
                .refine((path) => path.startsWith('files/'))
                .nullable(),
              included: z.boolean(),
            }),
          )
          .max(1_000),
      }),
      connectors: z.array(agentImportConnectorSchema).max(1_000),
    })
    .strict(),
})

const agentImportComponentSchema = z.enum([
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
])
const allAgentImportComponents = agentImportComponentSchema.options

const agentImportOptionsSchema = z.object({
  createBackupBeforeImport: z.boolean().default(false),
  components: z
    .array(agentImportComponentSchema)
    .default([...allAgentImportComponents])
    .transform((components) => [...new Set(components)]),
  connectorCredentials: z.record(
    z.string(),
    z.object({
      authConfig: connectorAuthConfigSchema.optional(),
      certificate: z
        .object({
          clientCertificate: z.string().min(1).max(1_000_000),
          clientKey: z.string().min(1).max(1_000_000),
          caCertificate: z.string().max(1_000_000).optional(),
        })
        .optional(),
    }),
  ),
})

type AgentImportManifest = z.infer<typeof agentImportManifestSchema>
type AgentImportProgressStep =
  | 'backup'
  | 'settings'
  | 'businessInfo'
  | 'allowlist'
  | 'skills'
  | 'qrCodes'
  | 'components'
  | 'faqs'
  | 'websites'
  | 'files'
  | 'mcps'
  | 'connectors'
  | 'finalizing'

type AgentImportResource =
  | 'settings'
  | 'businessInfo'
  | 'allowlist'
  | 'skills'
  | 'qrCodes'
  | 'components'
  | 'faqs'
  | 'websites'
  | 'files'
  | 'mcps'
  | 'connectors'
  | 'finalizing'

type AgentImportResourceProgress = (
  resource: AgentImportResource,
  completed: number,
  total: number,
) => Promise<void>

type AgentImportLog = (
  event: string,
  details: Record<string, unknown>,
  error?: unknown,
) => void

type CreateChannelInput = z.infer<typeof createChannelSchema>
type UpdateChannelInput = z.infer<typeof updateChannelSchema>
type UpdateAgentSettingsInput = z.infer<typeof updateAgentSettingsSchema>

export interface ChannelSummary {
  id: number
  type: 'whatsapp'
  name: string
  waPhoneNumber: string
  waPhoneNumberId: string
  waWabaId: string
  waBusinessId: string
  waAppId: string
  webhookForwardUrls: string[]
  hasWaAppSecret: boolean
  hasWaWebhookVerifyToken: boolean
  hasWaSystemUserAccessToken: boolean
  createdAt: string
  updatedAt: string
}

interface OrganizationAccess {
  organizationId: string
  role: string
}

export interface ChannelWebhookConfiguration {
  waAppId: string
  waAppSecret: string
  waWebhookVerifyToken: string
}

export interface ChannelAgentConfiguration {
  waPhoneNumberId: string
  waSystemUserAccessToken: string
  waWabaId?: string
}

export interface ChannelDashboardAnalytics {
  period: { start: string; end: string; days: number }
  messaging: {
    sent: number
    delivered: number
    deliveryRate: number | null
    series: Array<{ date: string; sent: number; delivered: number }>
  } | null
  agent: {
    threads: number
    handoffs: number
    handoffRate: number | null
    toolCalls: number
    toolSuccessRate: number | null
    averageToolLatencyMs: number | null
  } | null
  unavailable: Array<'messaging' | 'agent'>
}

export interface ChannelDeletionImpact {
  contacts: number
  groups: number
  messages: number
}

export interface ChannelDeletionPreview extends ChannelDeletionImpact {
  confirmationText: string
}

export type ChannelDeletionResult =
  | {
      status: 'deleted'
      impact: ChannelDeletionImpact
      backupStoragePaths?: string[]
    }
  | { status: 'confirmation_mismatch' }
  | { status: 'in_use' }
  | { status: 'not_found' }

export interface ChannelManagementRepository {
  list: (organizationId: string) => Promise<ChannelSummary[]>
  getVerifyToken: (
    organizationId: string,
    channelId: number,
  ) => Promise<string | undefined>
  getWebhookConfiguration: (
    organizationId: string,
    channelId: number,
  ) => Promise<ChannelWebhookConfiguration | undefined>
  getAgentConfiguration: (
    organizationId: string,
    channelId: number,
  ) => Promise<ChannelAgentConfiguration | undefined>
  create: (
    organizationId: string,
    input: CreateChannelInput,
  ) => Promise<ChannelSummary>
  update: (
    organizationId: string,
    channelId: number,
    input: UpdateChannelInput,
  ) => Promise<ChannelSummary | undefined>
  getDeletionPreview: (
    organizationId: string,
    channelId: number,
  ) => Promise<ChannelDeletionPreview | undefined>
  hasLocalMcpAssociation: (
    organizationId: string,
    channelId: number,
    connectorId?: string,
  ) => Promise<boolean>
  listLocalMcpAssociations?: (
    organizationId: string,
    channelId: number,
  ) => Promise<Array<{ connectorId: string; mcpId: number; mcpName: string }>>
  removeLocalMcpAssociation: (
    organizationId: string,
    channelId: number,
    connectorId: string,
  ) => Promise<number | undefined>
  delete: (
    organizationId: string,
    channelId: number,
    confirmation: string,
  ) => Promise<ChannelDeletionResult>
}

export interface ChannelManagementRouteOptions {
  getAccess?: (headers: Headers) => Promise<OrganizationAccess | undefined>
  repository?: ChannelManagementRepository
  registerWebhook?: (
    configuration: ChannelWebhookConfiguration,
    callbackUrl: string,
  ) => Promise<void>
  getAgentSettings?: (
    configuration: ChannelAgentConfiguration,
  ) => Promise<AgentSettings[]>
  getAgentEligibility?: (
    configuration: ChannelAgentConfiguration,
  ) => Promise<AgentEligibilityResponse>
  getPhoneNumberRegistration?: (
    configuration: ChannelAgentConfiguration,
  ) => Promise<PhoneNumberInfo>
  getQrCode?: (
    configuration: ChannelAgentConfiguration,
  ) => Promise<MessageQrCode | undefined>
  downloadQrImage?: (imageUrl: string) => Promise<{
    body: ArrayBuffer
    contentType: 'image/png' | 'image/svg+xml'
  }>
  registerPhoneNumber?: (
    configuration: ChannelAgentConfiguration,
    pin: string,
  ) => Promise<RegistrationSuccessResponse>
  deregisterPhoneNumber?: (
    configuration: ChannelAgentConfiguration,
  ) => Promise<RegistrationSuccessResponse>
  updateAgentSettings?: (
    configuration: ChannelAgentConfiguration,
    input: AgentSettingsInput,
  ) => Promise<AgentSettings>
  listAgentAllowlist?: (
    configuration: ChannelAgentConfiguration,
  ) => Promise<AllowlistEntry[]>
  addAgentAllowlistEntry?: (
    configuration: ChannelAgentConfiguration,
    input: AllowlistEntryInput,
  ) => Promise<AllowlistEntry>
  removeAgentAllowlistEntry?: (
    configuration: ChannelAgentConfiguration,
    entryId: string,
  ) => Promise<void>
  getAgentBusinessInfo?: (
    configuration: ChannelAgentConfiguration,
  ) => Promise<BusinessInfo>
  replaceAgentBusinessInfo?: (
    configuration: ChannelAgentConfiguration,
    input: BusinessInfoInput,
  ) => Promise<BusinessInfo>
  agentSkills?: AgentSkillsService
  agentConnectors?: AgentConnectorsService
  agentEvaluations?: AgentEvaluationsService
  agentKnowledge?: AgentKnowledgeService
  agentQrCodes?: AgentQrCodesService
  agentComponents?: AgentComponentsService
  knowledgeArchive?: AgentKnowledgeArchive
  agentBackups?: AgentBackupService
  agentImportRequestIntervalMs?: number
  agentImportRetryBackoffMs?: readonly number[]
  reportImportLog?: AgentImportLog
  reportImportError?: (
    details: {
      organizationId: string
      channelId: number
      step: AgentImportProgressStep
      errorName: string
      message: string
    },
    error: unknown,
  ) => void
  deleteAgent?: (
    configuration: ChannelAgentConfiguration,
  ) => Promise<DeleteAgentResponse>
  onboardAgent?: (
    configuration: ChannelAgentConfiguration,
  ) => Promise<OnboardAgentResponse>
  getDashboardAnalytics?: (
    configuration: ChannelAgentConfiguration,
    days: number,
  ) => Promise<ChannelDashboardAnalytics>
}

export interface AgentConnectorsService {
  list: (configuration: ChannelAgentConfiguration) => Promise<Connector[]>
  get: (
    configuration: ChannelAgentConfiguration,
    connectorId: string,
  ) => Promise<Connector>
  create: (
    configuration: ChannelAgentConfiguration,
    input: ConnectorInput,
  ) => Promise<Connector>
  update: (
    configuration: ChannelAgentConfiguration,
    connectorId: string,
    input: ConnectorInput,
  ) => Promise<Connector>
  delete: (
    configuration: ChannelAgentConfiguration,
    connectorId: string,
  ) => Promise<void>
  logs: (
    configuration: ChannelAgentConfiguration,
    connectorId: string,
  ) => Promise<ConnectorLogResponse>
  listTools: (
    configuration: ChannelAgentConfiguration,
    connectorId: string,
  ) => Promise<ConnectorTool[]>
  createTool: (
    configuration: ChannelAgentConfiguration,
    connectorId: string,
    input: ConnectorToolInput,
  ) => Promise<ConnectorTool>
  updateTool: (
    configuration: ChannelAgentConfiguration,
    connectorId: string,
    toolId: string,
    input: ConnectorToolInput,
  ) => Promise<ConnectorTool>
  deleteTool: (
    configuration: ChannelAgentConfiguration,
    connectorId: string,
    toolId: string,
  ) => Promise<void>
  refreshMcpTools?: (
    configuration: ChannelAgentConfiguration,
    connectorId: string,
  ) => Promise<void>
  upsertCertificate?: (
    configuration: ChannelAgentConfiguration,
    connectorId: string,
    input: ConnectorCertificateInput,
  ) => Promise<void>
}

export interface AgentEvaluationsService {
  listCases: (
    configuration: ChannelAgentConfiguration,
  ) => Promise<EvaluationCase[]>
  run: (
    configuration: ChannelAgentConfiguration,
    evalCaseIds: string[],
  ) => Promise<{ job_id: string; status: string }>
  getJob: (
    configuration: ChannelAgentConfiguration,
    jobId: string,
  ) => Promise<EvaluationJob>
  getDetails: (
    configuration: ChannelAgentConfiguration,
    evalIds: string[],
  ) => Promise<EvaluationDetail[]>
  getSummaries: (
    configuration: ChannelAgentConfiguration,
    summaryIds: string[],
  ) => Promise<EvaluationSummary[]>
}

export interface AgentSkillsService {
  list: (configuration: ChannelAgentConfiguration) => Promise<AgentSkill[]>
  create: (
    configuration: ChannelAgentConfiguration,
    input: AgentSkillInput,
  ) => Promise<AgentSkill>
  update: (
    configuration: ChannelAgentConfiguration,
    skillId: string,
    input: AgentSkillInput,
  ) => Promise<AgentSkill>
  delete: (
    configuration: ChannelAgentConfiguration,
    skillId: string,
  ) => Promise<void>
}

export interface AgentKnowledgeService {
  listFaqs: (configuration: ChannelAgentConfiguration) => Promise<Faq[]>
  createFaq: (
    configuration: ChannelAgentConfiguration,
    input: FaqInput,
  ) => Promise<Faq>
  updateFaq: (
    configuration: ChannelAgentConfiguration,
    faqId: string,
    input: FaqInput,
  ) => Promise<Faq>
  deleteFaq: (
    configuration: ChannelAgentConfiguration,
    faqId: string,
  ) => Promise<void>
  listWebsites: (
    configuration: ChannelAgentConfiguration,
  ) => Promise<KnowledgeWebsite[]>
  createWebsite: (
    configuration: ChannelAgentConfiguration,
    input: KnowledgeWebsiteInput,
  ) => Promise<KnowledgeWebsite>
  updateWebsite: (
    configuration: ChannelAgentConfiguration,
    websiteId: string,
    input: KnowledgeWebsiteInput,
  ) => Promise<KnowledgeWebsite>
  deleteWebsite: (
    configuration: ChannelAgentConfiguration,
    websiteId: string,
  ) => Promise<void>
  listFiles: (
    configuration: ChannelAgentConfiguration,
  ) => Promise<KnowledgeFile[]>
  uploadFile: (
    configuration: ChannelAgentConfiguration,
    file: File,
  ) => Promise<KnowledgeFile>
  deleteFile: (
    configuration: ChannelAgentConfiguration,
    fileId: string,
  ) => Promise<void>
}

export interface AgentQrCodesService {
  list: (configuration: ChannelAgentConfiguration) => Promise<MessageQrCode[]>
  create: (
    configuration: ChannelAgentConfiguration,
    prefilledMessage: string,
  ) => Promise<MessageQrCode>
  delete: (
    configuration: ChannelAgentConfiguration,
    code: string,
  ) => Promise<void>
}

export interface AgentComponentsService {
  get: (
    configuration: ChannelAgentConfiguration,
  ) => Promise<ConversationalComponents>
  set: (
    configuration: ChannelAgentConfiguration,
    input: WriteConversationalComponentsInput,
  ) => Promise<void>
}

const safeChannelSelection = {
  id: channels.id,
  type: channels.type,
  name: channels.name,
  waPhoneNumber: channels.waPhoneNumber,
  waPhoneNumberId: channels.waPhoneNumberId,
  waWabaId: channels.waWabaId,
  waBusinessId: channels.waBusinessId,
  waAppId: channels.waAppId,
  webhookForwardUrls: channels.webhookForwardUrls,
  hasWaAppSecret: sql<boolean>`${channels.waAppSecret} <> ''`,
  hasWaWebhookVerifyToken: sql<boolean>`${channels.waWebhookVerifyToken} <> ''`,
  hasWaSystemUserAccessToken: sql<boolean>`${channels.waSystemUserAccessToken} <> ''`,
  createdAt: channels.createdAt,
  updatedAt: channels.updatedAt,
}

const databaseRepository: ChannelManagementRepository = {
  list: async (organizationId) => {
    const rows = await db
      .select(safeChannelSelection)
      .from(channels)
      .where(eq(channels.organizationId, organizationId))
      .orderBy(channels.createdAt)
    return rows.map(toChannelSummary)
  },
  getVerifyToken: async (organizationId, channelId) => {
    const [row] = await db
      .select({ token: channels.waWebhookVerifyToken })
      .from(channels)
      .where(
        and(
          eq(channels.id, channelId),
          eq(channels.organizationId, organizationId),
        ),
      )
      .limit(1)
    return row?.token
  },
  getWebhookConfiguration: async (organizationId, channelId) => {
    const [row] = await db
      .select({
        waAppId: channels.waAppId,
        waAppSecret: channels.waAppSecret,
        waWebhookVerifyToken: channels.waWebhookVerifyToken,
      })
      .from(channels)
      .where(
        and(
          eq(channels.id, channelId),
          eq(channels.organizationId, organizationId),
        ),
      )
      .limit(1)
    return row
  },
  getAgentConfiguration: async (organizationId, channelId) => {
    const [row] = await db
      .select({
        waPhoneNumberId: channels.waPhoneNumberId,
        waSystemUserAccessToken: channels.waSystemUserAccessToken,
        waWabaId: channels.waWabaId,
      })
      .from(channels)
      .where(
        and(
          eq(channels.id, channelId),
          eq(channels.organizationId, organizationId),
        ),
      )
      .limit(1)
    return row
  },
  create: async (organizationId, input) => {
    const [row] = await db
      .insert(channels)
      .values({
        ...input,
        organizationId,
        type: 'whatsapp',
      })
      .returning(safeChannelSelection)
    if (!row) throw new Error('Channel was not created')
    return toChannelSummary(row)
  },
  update: async (organizationId, channelId, input) => {
    const [row] = await db
      .update(channels)
      .set({ ...input, updatedAt: new Date() })
      .where(
        and(
          eq(channels.id, channelId),
          eq(channels.organizationId, organizationId),
        ),
      )
      .returning(safeChannelSelection)
    return row ? toChannelSummary(row) : undefined
  },
  getDeletionPreview: async (organizationId, channelId) => {
    const [channel] = await db
      .select({ waPhoneNumber: channels.waPhoneNumber })
      .from(channels)
      .where(
        and(
          eq(channels.id, channelId),
          eq(channels.organizationId, organizationId),
        ),
      )
      .limit(1)
    if (!channel) return undefined

    const [contactTotal] = await db
      .select({ value: count() })
      .from(contacts)
      .where(eq(contacts.channelId, channelId))
    const [groupTotal] = await db
      .select({ value: count() })
      .from(groups)
      .where(eq(groups.channelId, channelId))
    const [messageTotal] = await db
      .select({ value: count() })
      .from(messages)
      .innerJoin(chats, eq(messages.chatId, chats.id))
      .where(eq(chats.channelId, channelId))

    return {
      confirmationText: channel.waPhoneNumber,
      contacts: contactTotal?.value ?? 0,
      groups: groupTotal?.value ?? 0,
      messages: messageTotal?.value ?? 0,
    }
  },
  hasLocalMcpAssociation: async (organizationId, channelId, connectorId) => {
    const [association] = await db
      .select({ channelId: runnerAgentMcpConnectors.channelId })
      .from(runnerAgentMcpConnectors)
      .where(
        and(
          eq(runnerAgentMcpConnectors.organizationId, organizationId),
          eq(runnerAgentMcpConnectors.channelId, channelId),
          ...(connectorId
            ? [eq(runnerAgentMcpConnectors.connectorId, connectorId)]
            : []),
        ),
      )
      .limit(1)
    return Boolean(association)
  },
  removeLocalMcpAssociation: async (organizationId, channelId, connectorId) => {
    const [association] = await db
      .delete(runnerAgentMcpConnectors)
      .where(
        and(
          eq(runnerAgentMcpConnectors.organizationId, organizationId),
          eq(runnerAgentMcpConnectors.channelId, channelId),
          eq(runnerAgentMcpConnectors.connectorId, connectorId),
        ),
      )
      .returning({ apiKeyId: runnerAgentMcpConnectors.apiKeyId })
    return association?.apiKeyId
  },
  listLocalMcpAssociations: async (organizationId, channelId) =>
    db
      .select({
        connectorId: runnerAgentMcpConnectors.connectorId,
        mcpId: runnerMcps.id,
        mcpName: runnerMcps.name,
      })
      .from(runnerAgentMcpConnectors)
      .innerJoin(runnerMcps, eq(runnerMcps.id, runnerAgentMcpConnectors.mcpId))
      .where(
        and(
          eq(runnerAgentMcpConnectors.organizationId, organizationId),
          eq(runnerAgentMcpConnectors.channelId, channelId),
        ),
      ),
  delete: async (organizationId, channelId, confirmation) => {
    return db.transaction(async (transaction) => {
      const [channel] = await transaction
        .select({
          id: channels.id,
          waPhoneNumber: channels.waPhoneNumber,
        })
        .from(channels)
        .where(
          and(
            eq(channels.id, channelId),
            eq(channels.organizationId, organizationId),
          ),
        )
        .limit(1)
        .for('update')
      if (!channel) return { status: 'not_found' as const }
      const [association] = await transaction
        .select({ channelId: runnerAgentMcpConnectors.channelId })
        .from(runnerAgentMcpConnectors)
        .where(eq(runnerAgentMcpConnectors.channelId, channelId))
        .limit(1)
      if (association) return { status: 'in_use' as const }
      if (confirmation !== channel.waPhoneNumber) {
        return { status: 'confirmation_mismatch' as const }
      }

      const [contactTotal] = await transaction
        .select({ value: count() })
        .from(contacts)
        .where(eq(contacts.channelId, channelId))
      const [groupTotal] = await transaction
        .select({ value: count() })
        .from(groups)
        .where(eq(groups.channelId, channelId))
      const [messageTotal] = await transaction
        .select({ value: count() })
        .from(messages)
        .innerJoin(chats, eq(messages.chatId, chats.id))
        .where(eq(chats.channelId, channelId))
      const impact: ChannelDeletionImpact = {
        contacts: contactTotal?.value ?? 0,
        groups: groupTotal?.value ?? 0,
        messages: messageTotal?.value ?? 0,
      }

      const channelChatIds = transaction
        .select({ id: chats.id })
        .from(chats)
        .where(eq(chats.channelId, channelId))
      const channelMessageIds = transaction
        .select({ id: messages.id })
        .from(messages)
        .where(inArray(messages.chatId, channelChatIds))

      await transaction
        .delete(messageStatusEvents)
        .where(inArray(messageStatusEvents.messageId, channelMessageIds))
      await transaction
        .delete(chatEvents)
        .where(inArray(chatEvents.chatId, channelChatIds))
      await transaction
        .update(chats)
        .set({ latestMessageId: null, latestReadMessageId: null })
        .where(eq(chats.channelId, channelId))
      await transaction
        .delete(messages)
        .where(inArray(messages.chatId, channelChatIds))
      await transaction.delete(chats).where(eq(chats.channelId, channelId))
      await transaction
        .delete(contacts)
        .where(eq(contacts.channelId, channelId))
      await transaction.delete(groups).where(eq(groups.channelId, channelId))
      await transaction
        .delete(webhooks)
        .where(eq(webhooks.channelId, channelId))
      const deletedBackups = await transaction
        .delete(agentBackups)
        .where(
          and(
            eq(agentBackups.organizationId, organizationId),
            eq(agentBackups.channelId, channelId),
          ),
        )
        .returning({ storagePath: agentBackups.storagePath })
      await transaction
        .delete(channels)
        .where(
          and(
            eq(channels.id, channelId),
            eq(channels.organizationId, organizationId),
          ),
        )

      return {
        status: 'deleted' as const,
        impact,
        backupStoragePaths: deletedBackups.map(
          ({ storagePath }) => storagePath,
        ),
      }
    })
  },
}

export const createChannelManagementRoute = ({
  getAccess = getOrganizationAccess,
  repository = databaseRepository,
  registerWebhook = registerMetaWebhook,
  getAgentSettings = getMetaAgentSettings,
  getAgentEligibility = getMetaAgentEligibility,
  getPhoneNumberRegistration = getMetaPhoneNumberRegistration,
  getQrCode = getMetaChannelQrCode,
  downloadQrImage = downloadMetaChannelQrImage,
  registerPhoneNumber = registerMetaPhoneNumber,
  deregisterPhoneNumber = deregisterMetaPhoneNumber,
  updateAgentSettings = updateMetaAgentSettings,
  listAgentAllowlist = listMetaAgentAllowlist,
  addAgentAllowlistEntry = addMetaAgentAllowlistEntry,
  removeAgentAllowlistEntry = removeMetaAgentAllowlistEntry,
  getAgentBusinessInfo = getMetaAgentBusinessInfo,
  replaceAgentBusinessInfo = replaceMetaAgentBusinessInfo,
  agentSkills = metaAgentSkillsService,
  agentConnectors = metaAgentConnectorsService,
  agentEvaluations = metaAgentEvaluationsService,
  agentKnowledge = metaAgentKnowledgeService,
  agentQrCodes = metaAgentQrCodesService,
  agentComponents = metaAgentComponentsService,
  knowledgeArchive = createAgentKnowledgeArchive(),
  agentBackups = createAgentBackupService(),
  agentImportRequestIntervalMs = 500,
  agentImportRetryBackoffMs = defaultAgentImportRetryBackoffMs,
  reportImportLog = (event, details, error) => {
    if (error !== undefined) {
      console.warn(`[agent-import] ${event}`, details, error)
    } else {
      console.info(`[agent-import] ${event}`, details)
    }
  },
  reportImportError = (details, error) =>
    console.error('Agent import failed', details, error),
  deleteAgent = deleteMetaAgent,
  onboardAgent = onboardMetaAgent,
  getDashboardAnalytics = getMetaDashboardAnalytics,
}: ChannelManagementRouteOptions = {}) =>
  new Hono()
    .get('/', async (c) => {
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)

      return c.json({ channels: await repository.list(access.organizationId) })
    })
    .get(
      '/:id/dashboard',
      zValidator(
        'query',
        z.object({ days: z.coerce.number().int().min(1).max(30).default(7) }),
        (result, c) => {
          if (!result.success) {
            return c.json({ message: 'Invalid dashboard query' }, 400)
          }
        },
      ),
      async (c) => {
        const channelId = parseChannelId(c.req.param('id'))
        if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)

        const access = await getAccess(c.req.raw.headers)
        if (!access) return c.json({ message: 'Unauthorized' }, 401)
        const configuration = await repository.getAgentConfiguration(
          access.organizationId,
          channelId,
        )
        if (!configuration) return c.json({ message: 'Channel not found' }, 404)

        return c.json(
          await getDashboardAnalytics(configuration, c.req.valid('query').days),
        )
      },
    )
    .post('/', zValidator('json', createChannelSchema), async (c) => {
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      if (!canManageChannels(access.role)) {
        return c.json({ message: 'Organization owner or admin required' }, 403)
      }

      try {
        const channel = await repository.create(
          access.organizationId,
          c.req.valid('json'),
        )
        return c.json({ channel }, 201)
      } catch (error) {
        if (getDatabaseErrorCode(error) === '23505') {
          return c.json(
            { message: 'A channel already uses this phone number ID' },
            409,
          )
        }
        throw error
      }
    })
    .get('/:id/agent-settings', async (c) => {
      const channelId = parseChannelId(c.req.param('id'))
      if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)

      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      const configuration = await repository.getAgentConfiguration(
        access.organizationId,
        channelId,
      )
      if (!configuration) return c.json({ message: 'Channel not found' }, 404)

      try {
        const settings = await getAgentSettings(configuration)
        const agentSettings = settings[0]
        return c.json({
          status: getAgentConfigurationStatus(settings),
          settings: agentSettings
            ? toAgentSettingsSummary(agentSettings)
            : null,
        })
      } catch (error) {
        if (error instanceof MetaAgentSettingsError) {
          return c.json({ message: error.message }, error.status)
        }
        throw error
      }
    })
    .get('/:id/registration', async (c) => {
      const channelId = parseChannelId(c.req.param('id'))
      if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      const configuration = await repository.getAgentConfiguration(
        access.organizationId,
        channelId,
      )
      if (!configuration) return c.json({ message: 'Channel not found' }, 404)
      try {
        const phoneNumber = await getPhoneNumberRegistration(configuration)
        return c.json({
          status: getPhoneNumberRegistrationStatus(phoneNumber),
          providerStatus: phoneNumber.status ?? null,
          displayPhoneNumber: phoneNumber.display_phone_number ?? null,
          verifiedName: phoneNumber.verified_name ?? null,
        })
      } catch (error) {
        if (error instanceof MetaPhoneNumberRegistrationError) {
          return c.json({ message: error.message }, error.status)
        }
        throw error
      }
    })
    .get('/:id/qr-code', async (c) => {
      const channelId = parseChannelId(c.req.param('id'))
      if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      const configuration = await repository.getAgentConfiguration(
        access.organizationId,
        channelId,
      )
      if (!configuration) return c.json({ message: 'Channel not found' }, 404)
      try {
        const qrCode = await getQrCode(configuration)
        return c.json({
          qrCode: qrCode
            ? {
                code: qrCode.code,
                imageUrl: qrCode.qr_image_url
                  ? `/api/channels/${channelId}/qr-code/image`
                  : null,
                deepLinkUrl: qrCode.deep_link_url ?? null,
                prefilledMessage: qrCode.prefilled_message ?? null,
              }
            : null,
        })
      } catch (error) {
        if (error instanceof MetaChannelQrCodeError) {
          return c.json({ message: error.message }, error.status)
        }
        throw error
      }
    })
    .get('/:id/qr-code/image', async (c) => {
      const channelId = parseChannelId(c.req.param('id'))
      if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      const configuration = await repository.getAgentConfiguration(
        access.organizationId,
        channelId,
      )
      if (!configuration) return c.json({ message: 'Channel not found' }, 404)
      try {
        const qrCode = await getQrCode(configuration)
        if (!qrCode?.qr_image_url) {
          return c.json({ message: 'QR code image not found' }, 404)
        }
        const image = await downloadQrImage(qrCode.qr_image_url)
        return c.body(image.body, 200, {
          'cache-control': 'private, max-age=300',
          'content-type': image.contentType,
          'x-content-type-options': 'nosniff',
        })
      } catch (error) {
        if (error instanceof MetaChannelQrCodeError) {
          return c.json({ message: error.message }, error.status)
        }
        throw error
      }
    })
    .post(
      '/:id/registration/register',
      zValidator('json', registerPhoneNumberSchema),
      async (c) => {
        const channelId = parseChannelId(c.req.param('id'))
        if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)
        const access = await getAccess(c.req.raw.headers)
        if (!access) return c.json({ message: 'Unauthorized' }, 401)
        if (!canManageChannels(access.role)) {
          return c.json(
            { message: 'Organization owner or admin required' },
            403,
          )
        }
        const configuration = await repository.getAgentConfiguration(
          access.organizationId,
          channelId,
        )
        if (!configuration) return c.json({ message: 'Channel not found' }, 404)
        try {
          const result = await registerPhoneNumber(
            configuration,
            c.req.valid('json').pin,
          )
          return c.json({ result })
        } catch (error) {
          if (error instanceof MetaPhoneNumberRegistrationError) {
            return c.json({ message: error.message }, error.status)
          }
          throw error
        }
      },
    )
    .post('/:id/registration/deregister', async (c) => {
      const channelId = parseChannelId(c.req.param('id'))
      if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      if (!canManageChannels(access.role)) {
        return c.json({ message: 'Organization owner or admin required' }, 403)
      }
      const configuration = await repository.getAgentConfiguration(
        access.organizationId,
        channelId,
      )
      if (!configuration) return c.json({ message: 'Channel not found' }, 404)
      try {
        const result = await deregisterPhoneNumber(configuration)
        return c.json({ result })
      } catch (error) {
        if (error instanceof MetaPhoneNumberRegistrationError) {
          return c.json({ message: error.message }, error.status)
        }
        throw error
      }
    })
    .get('/:id/agent-backups', async (c) => {
      const channelId = parseChannelId(c.req.param('id'))
      if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      const configuration = await repository.getAgentConfiguration(
        access.organizationId,
        channelId,
      )
      if (!configuration) return c.json({ message: 'Channel not found' }, 404)

      return c.json({
        backups: await agentBackups.list(access.organizationId, channelId),
      })
    })
    .post('/:id/agent-backups', async (c) => {
      const channelId = parseChannelId(c.req.param('id'))
      if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      if (!canManageChannels(access.role)) {
        return c.json({ message: 'Organization owner or admin required' }, 403)
      }
      const configuration = await repository.getAgentConfiguration(
        access.organizationId,
        channelId,
      )
      if (!configuration) return c.json({ message: 'Channel not found' }, 404)

      c.header('Cache-Control', 'no-cache, no-store, no-transform')
      c.header('X-Accel-Buffering', 'no')
      return streamSSE(c, async (stream) => {
        const progress = async (
          step: AgentExportProgressStep,
          position: number,
        ) =>
          stream.writeSSE({
            event: 'progress',
            data: JSON.stringify({
              step,
              position,
              total: agentExportProgressSteps.length,
            }),
          })

        try {
          const { archive, fileName } = await buildAgentExport({
            organizationId: access.organizationId,
            channelId,
            configuration,
            repository,
            getAgentSettings,
            listAgentAllowlist,
            getAgentBusinessInfo,
            agentSkills,
            agentConnectors,
            agentKnowledge,
            agentQrCodes,
            agentComponents,
            knowledgeArchive,
            progress,
          })
          const backup = await agentBackups.create(
            access.organizationId,
            channelId,
            fileName,
            archive,
          )
          await stream.writeSSE({
            event: 'complete',
            data: JSON.stringify({ backup }),
          })
        } catch (error) {
          console.error('Agent backup failed', {
            organizationId: access.organizationId,
            channelId,
            error,
          })
          await stream.writeSSE({
            event: 'backup-error',
            data: JSON.stringify({ message: 'Could not create agent backup' }),
          })
        }
      })
    })
    .get('/:id/agent-backups/:backupId/archive', async (c) => {
      const channelId = parseChannelId(c.req.param('id'))
      const backupId = parseChannelId(c.req.param('backupId'))
      if (!channelId || !backupId) {
        return c.json({ message: 'Invalid channel or backup ID' }, 400)
      }
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      if (!canManageChannels(access.role)) {
        return c.json({ message: 'Organization owner or admin required' }, 403)
      }
      const configuration = await repository.getAgentConfiguration(
        access.organizationId,
        channelId,
      )
      if (!configuration) return c.json({ message: 'Channel not found' }, 404)

      const stored = await agentBackups.getArchive(
        access.organizationId,
        channelId,
        backupId,
      )
      if (!stored) return c.json({ message: 'Agent backup not found' }, 404)

      const archive = new Uint8Array(stored.archive).buffer
      return c.body(archive, 200, {
        'Cache-Control': 'no-store',
        'Content-Disposition': `attachment; filename="agent-backup.agtx"; filename*=UTF-8''${encodeURIComponent(stored.backup.fileName)}`,
        'Content-Length': String(stored.archive.byteLength),
        'Content-Type': 'application/vnd.mba.agent+zip',
      })
    })
    .get('/:id/agent-export', async (c) => {
      const channelId = parseChannelId(c.req.param('id'))
      if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)

      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      const configuration = await repository.getAgentConfiguration(
        access.organizationId,
        channelId,
      )
      if (!configuration) return c.json({ message: 'Channel not found' }, 404)

      c.header('Cache-Control', 'no-cache, no-store, no-transform')
      c.header('X-Accel-Buffering', 'no')
      return streamSSE(c, async (stream) => {
        const total = 7
        const progress = async (step: string, position: number) =>
          stream.writeSSE({
            event: 'progress',
            data: JSON.stringify({ step, position, total }),
          })

        try {
          const { archive, fileName } = await buildAgentExport({
            organizationId: access.organizationId,
            channelId,
            configuration,
            repository,
            getAgentSettings,
            listAgentAllowlist,
            getAgentBusinessInfo,
            agentSkills,
            agentConnectors,
            agentKnowledge,
            agentQrCodes,
            agentComponents,
            knowledgeArchive,
            progress,
          })
          const chunkSize = 384 * 1024
          const chunkCount = Math.ceil(archive.byteLength / chunkSize)
          for (let index = 0; index < chunkCount; index += 1) {
            const start = index * chunkSize
            await stream.writeSSE({
              event: 'archive-chunk',
              data: JSON.stringify({
                index,
                data: Buffer.from(
                  archive.subarray(
                    start,
                    Math.min(start + chunkSize, archive.byteLength),
                  ),
                ).toString('base64'),
              }),
            })
          }
          await stream.writeSSE({
            event: 'complete',
            data: JSON.stringify({
              fileName,
              chunkCount,
              byteSize: archive.byteLength,
            }),
          })
        } catch {
          await stream.writeSSE({
            event: 'export-error',
            data: JSON.stringify({ message: 'Could not export the agent' }),
          })
        }
      })
    })
    .post('/:id/agent-import/inspect', async (c) => {
      const channelId = parseChannelId(c.req.param('id'))
      if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      if (!canManageChannels(access.role)) {
        return c.json({ message: 'Organization owner or admin required' }, 403)
      }
      const configuration = await repository.getAgentConfiguration(
        access.organizationId,
        channelId,
      )
      if (!configuration) return c.json({ message: 'Channel not found' }, 404)

      try {
        const imported = await readAgentImportPackage(c.req.raw)
        const requirements = getAgentImportRequirements(imported)
        return c.json({
          summary: {
            skills: imported.manifest.agent.skills.length,
            qrCodes: imported.manifest.agent.qrCodes.length,
            icebreakers: imported.manifest.agent.components.prompts.length,
            commands: imported.manifest.agent.components.commands.length,
            faqs: imported.manifest.agent.knowledge.faqs.length,
            websites: imported.manifest.agent.knowledge.websites.length,
            files: imported.manifest.agent.knowledge.files.length,
            mcps: imported.mcps.size,
            connectors: imported.manifest.agent.connectors.length,
          },
          requirements,
        })
      } catch (error) {
        return c.json({ message: getAgentImportError(error) }, 400)
      }
    })
    .post('/:id/agent-import', async (c) => {
      const channelId = parseChannelId(c.req.param('id'))
      if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      if (!canManageChannels(access.role)) {
        return c.json({ message: 'Organization owner or admin required' }, 403)
      }
      const configuration = await repository.getAgentConfiguration(
        access.organizationId,
        channelId,
      )
      if (!configuration) return c.json({ message: 'Channel not found' }, 404)

      let prepared: PreparedAgentImport
      try {
        prepared = await prepareAgentImport(c.req.raw)
      } catch (error) {
        reportImportLog(
          'request_rejected',
          {
            organizationId: access.organizationId,
            channelId,
            message: getAgentImportError(error),
          },
          error,
        )
        return c.json({ message: getAgentImportError(error) }, 400)
      }

      c.header('Cache-Control', 'no-cache, no-store, no-transform')
      c.header('X-Accel-Buffering', 'no')
      return streamSSE(c, async (stream) => {
        const includeBackup = prepared.options.createBackupBeforeImport
        const positionOffset = includeBackup ? 1 : 0
        const total = 12 + positionOffset
        const startedAt = Date.now()
        let currentStep: AgentImportProgressStep = includeBackup
          ? 'backup'
          : 'settings'
        let currentPosition = 1
        const progress = async (
          step: AgentImportProgressStep,
          position: number,
          skipped = false,
        ) => {
          currentStep = step
          currentPosition = position
          reportImportLog('stage_started', {
            organizationId: access.organizationId,
            channelId,
            step,
            position,
            total,
          })
          await stream.writeSSE({
            event: 'progress',
            data: JSON.stringify({ step, position, total, skipped }),
          })
        }

        try {
          const { manifest, files, mcps, options, origin } = prepared
          const selected = new Set(options.components)
          const importLog: AgentImportLog = (event, details, error) =>
            reportImportLog(
              event,
              {
                organizationId: access.organizationId,
                channelId,
                step: currentStep,
                ...details,
              },
              error,
            )
          const resourceProgress: AgentImportResourceProgress = async (
            resource,
            completed,
            resourceTotal,
          ) => {
            importLog('resource_progress', {
              resource,
              completed,
              total: resourceTotal,
            })
            await stream.writeSSE({
              event: 'progress',
              data: JSON.stringify({
                step: currentStep,
                position: currentPosition,
                total,
                resource,
                completed,
                resourceTotal,
              }),
            })
          }
          importLog('started', {
            createBackupBeforeImport: includeBackup,
            resources: {
              allowlist: manifest.agent.allowlist.length,
              skills: manifest.agent.skills.length,
              qrCodes: manifest.agent.qrCodes.length,
              icebreakers: manifest.agent.components.prompts.length,
              commands: manifest.agent.components.commands.length,
              faqs: manifest.agent.knowledge.faqs.length,
              websites: manifest.agent.knowledge.websites.length,
              files: files.length,
              mcps: mcps.size,
              connectors: manifest.agent.connectors.length,
              tools: manifest.agent.connectors.reduce(
                (total, connector) =>
                  total +
                  (connector.connectorProtocol === 'MCP'
                    ? 0
                    : connector.tools.length),
                0,
              ),
            },
            requestIntervalMs: agentImportRequestIntervalMs,
            retryBackoffMs: agentImportRetryBackoffMs,
          })
          if (includeBackup) {
            await progress('backup', 1)
            const { archive, fileName } = await buildAgentExport({
              organizationId: access.organizationId,
              channelId,
              configuration,
              repository,
              getAgentSettings,
              listAgentAllowlist,
              getAgentBusinessInfo,
              agentSkills,
              agentConnectors,
              agentKnowledge,
              agentQrCodes,
              agentComponents,
              knowledgeArchive,
              progress: async (backupStep, position) => {
                await stream.writeSSE({
                  event: 'backup-progress',
                  data: JSON.stringify({
                    step: backupStep,
                    position,
                    total: agentExportProgressSteps.length,
                  }),
                })
              },
            })
            const backup = await agentBackups.create(
              access.organizationId,
              channelId,
              fileName,
              archive,
            )
            importLog('pre_import_backup_created', {
              backupId: backup.id,
              byteSize: backup.byteSize,
            })
          }
          const runProviderRequest = createAgentImportProviderRequest(
            agentImportRequestIntervalMs,
            agentImportRetryBackoffMs,
            importLog,
          )
          let rolloutEnabledBeforeImport = false
          if (selected.has('settings')) {
            const settingsBeforeImport = await runAgentImportRead(
              'Initial agent settings read',
              runProviderRequest,
              () => getAgentSettings(configuration),
            )
            rolloutEnabledBeforeImport =
              settingsBeforeImport[0]?.rollout.enabled === true
          }
          await progress(
            'settings',
            1 + positionOffset,
            !selected.has('settings'),
          )
          if (selected.has('settings')) {
            await resourceProgress('settings', 0, 1)
            const importedSettings = manifest.agent.settings
            const importedSettingsInput: AgentSettingsInput = {
              rollout: { enabled: rolloutEnabledBeforeImport },
              ai_audience: importedSettings.audience,
              handoff: {
                enabled: importedSettings.handoff.enabled,
                message_selection: importedSettings.handoff.messageSelection,
                ...(importedSettings.handoff.messageSelection === 'CUSTOM'
                  ? { message: importedSettings.handoff.message }
                  : {}),
              },
              never_say_phrases: importedSettings.neverSayPhrases,
            }
            await runAgentImportMutation(
              'Agent settings update',
              runProviderRequest,
              () => updateAgentSettings(configuration, importedSettingsInput),
              async () => {
                const settings = await getAgentSettings(configuration)
                const current = settings[0]
                return current &&
                  agentSettingsMatch(current, importedSettingsInput)
                  ? agentImportMatches(current)
                  : agentImportDoesNotMatch<AgentSettings>()
              },
            )
            await resourceProgress('settings', 1, 1)
          }

          await progress(
            'businessInfo',
            2 + positionOffset,
            !selected.has('businessInfo'),
          )
          if (selected.has('businessInfo')) {
            await resourceProgress('businessInfo', 0, 1)
            const desiredBusinessInfo = toMetaBusinessInfo(
              manifest.agent.businessInfo,
            )
            await runAgentImportMutation(
              'Business information update',
              runProviderRequest,
              () =>
                replaceAgentBusinessInfo(configuration, desiredBusinessInfo),
              async () => {
                const current = await getAgentBusinessInfo(configuration)
                return businessInfoMatches(current, desiredBusinessInfo)
                  ? agentImportMatches(current)
                  : agentImportDoesNotMatch<BusinessInfo>()
              },
            )
            await resourceProgress('businessInfo', 1, 1)
          }

          await progress(
            'allowlist',
            3 + positionOffset,
            !selected.has('allowlist'),
          )
          if (selected.has('allowlist')) {
            await reconcileAllowlist(
              configuration,
              manifest.agent.allowlist,
              listAgentAllowlist,
              addAgentAllowlistEntry,
              removeAgentAllowlistEntry,
              runProviderRequest,
              resourceProgress,
            )
          }

          await progress('skills', 4 + positionOffset, !selected.has('skills'))
          if (selected.has('skills')) {
            await reconcileSkills(
              configuration,
              manifest.agent.skills,
              agentSkills,
              runProviderRequest,
              resourceProgress,
            )
          }

          await progress(
            'qrCodes',
            5 + positionOffset,
            !selected.has('qrCodes'),
          )
          if (selected.has('qrCodes')) {
            await reconcileChannelComponents(
              configuration,
              manifest.agent.qrCodes,
              manifest.agent.components,
              agentQrCodes,
              agentComponents,
              runProviderRequest,
              resourceProgress,
              true,
              false,
            )
          }

          await progress(
            'components',
            6 + positionOffset,
            !selected.has('components'),
          )
          if (selected.has('components')) {
            await reconcileChannelComponents(
              configuration,
              manifest.agent.qrCodes,
              manifest.agent.components,
              agentQrCodes,
              agentComponents,
              runProviderRequest,
              resourceProgress,
              false,
              true,
            )
          }

          await progress('faqs', 7 + positionOffset, !selected.has('faqs'))
          if (selected.has('faqs')) {
            await reconcileKnowledge(
              configuration,
              manifest.agent.knowledge,
              agentKnowledge,
              runProviderRequest,
              resourceProgress,
              true,
              false,
            )
          }

          await progress(
            'websites',
            8 + positionOffset,
            !selected.has('websites'),
          )
          if (selected.has('websites')) {
            await reconcileKnowledge(
              configuration,
              manifest.agent.knowledge,
              agentKnowledge,
              runProviderRequest,
              resourceProgress,
              false,
              true,
            )
          }

          await progress('files', 9 + positionOffset, !selected.has('files'))
          if (selected.has('files')) {
            const currentFiles = await runAgentImportRead(
              'Knowledge file listing',
              runProviderRequest,
              () => agentKnowledge.listFiles(configuration),
            )
            const fileOperationTotal = currentFiles.length + files.length
            let completedFileOperations = 0
            await resourceProgress('files', 0, fileOperationTotal)
            for (const current of currentFiles) {
              await runAgentImportMutation(
                `Knowledge file deletion (${current.file_name})`,
                runProviderRequest,
                async () => {
                  await agentKnowledge.deleteFile(configuration, current.id)
                },
                async () => {
                  const filesAfterDelete =
                    await agentKnowledge.listFiles(configuration)
                  return filesAfterDelete.some((file) => file.id === current.id)
                    ? agentImportDoesNotMatch<void>()
                    : agentImportMatches(undefined)
                },
              )
              await knowledgeArchive.delete(access.organizationId, current.id)
              importLog('local_archive_deleted', {
                providerFileId: current.id,
                fileName: current.file_name,
              })
              completedFileOperations += 1
              await resourceProgress(
                'files',
                completedFileOperations,
                fileOperationTotal,
              )
            }
            for (const importedFile of files) {
              const uploaded = await runAgentImportMutation(
                `Knowledge file upload (${importedFile.name})`,
                runProviderRequest,
                () => agentKnowledge.uploadFile(configuration, importedFile),
                async () => {
                  const current = await agentKnowledge.listFiles(configuration)
                  const matching = current.find(
                    (file) => file.file_name === importedFile.name,
                  )
                  return matching
                    ? agentImportMatches(matching)
                    : agentImportDoesNotMatch<KnowledgeFile>()
                },
              )
              try {
                await knowledgeArchive.put(
                  access.organizationId,
                  channelId,
                  uploaded,
                  importedFile,
                )
                importLog('local_archive_saved', {
                  providerFileId: uploaded.id,
                  fileName: importedFile.name,
                  byteSize: importedFile.size,
                })
                completedFileOperations += 1
                await resourceProgress(
                  'files',
                  completedFileOperations,
                  fileOperationTotal,
                )
              } catch (error) {
                importLog(
                  'local_archive_save_failed',
                  {
                    providerFileId: uploaded.id,
                    fileName: importedFile.name,
                  },
                  error,
                )
                await runAgentImportMutation(
                  `Knowledge file rollback (${importedFile.name})`,
                  runProviderRequest,
                  async () => {
                    await agentKnowledge.deleteFile(configuration, uploaded.id)
                  },
                  async () => {
                    const current =
                      await agentKnowledge.listFiles(configuration)
                    return current.some((file) => file.id === uploaded.id)
                      ? agentImportDoesNotMatch<void>()
                      : agentImportMatches(undefined)
                  },
                ).catch(() => undefined)
                throw error
              }
            }
          }

          await progress(
            'mcps',
            10 + positionOffset,
            !selected.has('connectors'),
          )
          const importedMcps = selected.has('connectors')
            ? await importAgentMcps(
                access.organizationId,
                mcps,
                resourceProgress,
              )
            : new Map<string, RunnerMcpDefinition>()

          await progress(
            'connectors',
            11 + positionOffset,
            !selected.has('connectors'),
          )
          if (selected.has('connectors')) {
            await reconcileConnectors(
              access.organizationId,
              channelId,
              origin,
              configuration,
              manifest.agent.connectors,
              importedMcps,
              options.connectorCredentials,
              repository,
              agentConnectors,
              runProviderRequest,
              resourceProgress,
            )
          }

          await progress(
            'finalizing',
            12 + positionOffset,
            !selected.has('settings'),
          )
          if (selected.has('settings')) {
            await resourceProgress('finalizing', 0, 1)
            const finalSettingsInput: AgentSettingsInput = {
              rollout: { enabled: rolloutEnabledBeforeImport },
            }
            await runAgentImportMutation(
              'Final agent rollout update',
              runProviderRequest,
              () => updateAgentSettings(configuration, finalSettingsInput),
              async () => {
                const settings = await getAgentSettings(configuration)
                const current = settings[0]
                return current &&
                  agentSettingsMatch(current, finalSettingsInput)
                  ? agentImportMatches(current)
                  : agentImportDoesNotMatch<AgentSettings>()
              },
            )
            await resourceProgress('finalizing', 1, 1)
          }
          await stream.writeSSE({
            event: 'complete',
            data: JSON.stringify({
              importedFiles: files.length,
            }),
          })
          importLog('completed', {
            elapsedMs: Date.now() - startedAt,
            importedFiles: files.length,
          })
        } catch (error) {
          const message = getAgentImportError(error)
          reportImportError(
            {
              organizationId: access.organizationId,
              channelId,
              step: currentStep,
              errorName: error instanceof Error ? error.name : typeof error,
              message,
            },
            error,
          )
          await stream.writeSSE({
            event: 'import-error',
            data: JSON.stringify({
              step: currentStep,
              message,
              partial: currentStep !== 'backup',
            }),
          })
        }
      })
    })
    .patch(
      '/:id/agent-settings',
      zValidator('json', updateAgentSettingsSchema),
      async (c) => {
        const channelId = parseChannelId(c.req.param('id'))
        if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)

        const access = await getAccess(c.req.raw.headers)
        if (!access) return c.json({ message: 'Unauthorized' }, 401)
        if (!canManageChannels(access.role)) {
          return c.json(
            { message: 'Organization owner or admin required' },
            403,
          )
        }
        const configuration = await repository.getAgentConfiguration(
          access.organizationId,
          channelId,
        )
        if (!configuration) return c.json({ message: 'Channel not found' }, 404)

        try {
          const settings = await updateAgentSettings(
            configuration,
            toAgentSettingsInput(c.req.valid('json')),
          )
          return c.json({ settings: toAgentSettingsSummary(settings) })
        } catch (error) {
          if (error instanceof MetaAgentSettingsError) {
            return c.json({ message: error.message }, error.status)
          }
          throw error
        }
      },
    )
    .get('/:id/agent-eligibility', async (c) => {
      const channelId = parseChannelId(c.req.param('id'))
      if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)

      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      if (!canManageChannels(access.role)) {
        return c.json({ message: 'Organization owner or admin required' }, 403)
      }
      const configuration = await repository.getAgentConfiguration(
        access.organizationId,
        channelId,
      )
      if (!configuration) return c.json({ message: 'Channel not found' }, 404)

      try {
        const eligibility = await getAgentEligibility(configuration)
        return c.json({ eligible: eligibility.is_eligible })
      } catch (error) {
        if (error instanceof MetaAgentEligibilityError) {
          return c.json({ message: error.message }, error.status)
        }
        throw error
      }
    })
    .get('/:id/agent-allowlist', async (c) => {
      const channelId = parseChannelId(c.req.param('id'))
      if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)

      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      const configuration = await repository.getAgentConfiguration(
        access.organizationId,
        channelId,
      )
      if (!configuration) return c.json({ message: 'Channel not found' }, 404)

      try {
        const entries = await listAgentAllowlist(configuration)
        return c.json({ entries: entries.map(toAgentAllowlistEntry) })
      } catch (error) {
        if (error instanceof MetaAgentAllowlistError) {
          return c.json({ message: error.message }, error.status)
        }
        throw error
      }
    })
    .post(
      '/:id/agent-allowlist',
      zValidator('json', addAgentAllowlistEntrySchema),
      async (c) => {
        const channelId = parseChannelId(c.req.param('id'))
        if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)

        const access = await getAccess(c.req.raw.headers)
        if (!access) return c.json({ message: 'Unauthorized' }, 401)
        if (!canManageChannels(access.role)) {
          return c.json(
            { message: 'Organization owner or admin required' },
            403,
          )
        }
        const configuration = await repository.getAgentConfiguration(
          access.organizationId,
          channelId,
        )
        if (!configuration) return c.json({ message: 'Channel not found' }, 404)

        try {
          const entry = await addAgentAllowlistEntry(configuration, {
            consumer_phone_number: c.req.valid('json').phoneNumber,
          })
          return c.json({ entry: toAgentAllowlistEntry(entry) }, 201)
        } catch (error) {
          if (error instanceof MetaAgentAllowlistError) {
            return c.json({ message: error.message }, error.status)
          }
          throw error
        }
      },
    )
    .delete('/:id/agent-allowlist/:entryId', async (c) => {
      const channelId = parseChannelId(c.req.param('id'))
      if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)

      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      if (!canManageChannels(access.role)) {
        return c.json({ message: 'Organization owner or admin required' }, 403)
      }
      const entryId = c.req.param('entryId').trim()
      if (!entryId)
        return c.json({ message: 'Invalid allowlist entry ID' }, 400)
      const configuration = await repository.getAgentConfiguration(
        access.organizationId,
        channelId,
      )
      if (!configuration) return c.json({ message: 'Channel not found' }, 404)

      try {
        await removeAgentAllowlistEntry(configuration, entryId)
        return c.json({ success: true })
      } catch (error) {
        if (error instanceof MetaAgentAllowlistError) {
          return c.json({ message: error.message }, error.status)
        }
        throw error
      }
    })
    .get('/:id/agent-business-info', async (c) => {
      const channelId = parseChannelId(c.req.param('id'))
      if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)

      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      const configuration = await repository.getAgentConfiguration(
        access.organizationId,
        channelId,
      )
      if (!configuration) return c.json({ message: 'Channel not found' }, 404)

      try {
        const businessInfo = await getAgentBusinessInfo(configuration)
        return c.json({ businessInfo: toAgentBusinessInfo(businessInfo) })
      } catch (error) {
        if (error instanceof MetaAgentBusinessInfoError) {
          return c.json({ message: error.message }, error.status)
        }
        throw error
      }
    })
    .put(
      '/:id/agent-business-info',
      zValidator('json', businessInfoSchema),
      async (c) => {
        const channelId = parseChannelId(c.req.param('id'))
        if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)

        const access = await getAccess(c.req.raw.headers)
        if (!access) return c.json({ message: 'Unauthorized' }, 401)
        if (!canManageChannels(access.role)) {
          return c.json(
            { message: 'Organization owner or admin required' },
            403,
          )
        }
        const configuration = await repository.getAgentConfiguration(
          access.organizationId,
          channelId,
        )
        if (!configuration) return c.json({ message: 'Channel not found' }, 404)

        try {
          const businessInfo = await replaceAgentBusinessInfo(
            configuration,
            toMetaBusinessInfo(c.req.valid('json')),
          )
          return c.json({ businessInfo: toAgentBusinessInfo(businessInfo) })
        } catch (error) {
          if (error instanceof MetaAgentBusinessInfoError) {
            return c.json({ message: error.message }, error.status)
          }
          throw error
        }
      },
    )
    .get('/:id/agent-skills', async (c) => {
      const channelId = parseChannelId(c.req.param('id'))
      if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      const configuration = await repository.getAgentConfiguration(
        access.organizationId,
        channelId,
      )
      if (!configuration) return c.json({ message: 'Channel not found' }, 404)
      try {
        return c.json({
          skills: (await agentSkills.list(configuration)).map(toAgentSkill),
        })
      } catch (error) {
        if (error instanceof MetaAgentSkillsError) {
          return c.json({ message: error.message }, error.status)
        }
        throw error
      }
    })
    .post(
      '/:id/agent-skills',
      zValidator('json', agentSkillSchema),
      async (c) => {
        const channelId = parseChannelId(c.req.param('id'))
        if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)
        const access = await getAccess(c.req.raw.headers)
        if (!access) return c.json({ message: 'Unauthorized' }, 401)
        if (!canManageChannels(access.role)) {
          return c.json(
            { message: 'Organization owner or admin required' },
            403,
          )
        }
        const configuration = await repository.getAgentConfiguration(
          access.organizationId,
          channelId,
        )
        if (!configuration) return c.json({ message: 'Channel not found' }, 404)
        try {
          const skill = await agentSkills.create(
            configuration,
            c.req.valid('json'),
          )
          return c.json({ skill: toAgentSkill(skill) }, 201)
        } catch (error) {
          if (error instanceof MetaAgentSkillsError) {
            return c.json({ message: error.message }, error.status)
          }
          throw error
        }
      },
    )
    .put(
      '/:id/agent-skills/:skillId',
      zValidator('json', agentSkillSchema),
      async (c) => {
        const channelId = parseChannelId(c.req.param('id'))
        const skillId = c.req.param('skillId').trim()
        if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)
        if (!skillId) return c.json({ message: 'Invalid skill ID' }, 400)
        const access = await getAccess(c.req.raw.headers)
        if (!access) return c.json({ message: 'Unauthorized' }, 401)
        if (!canManageChannels(access.role)) {
          return c.json(
            { message: 'Organization owner or admin required' },
            403,
          )
        }
        const configuration = await repository.getAgentConfiguration(
          access.organizationId,
          channelId,
        )
        if (!configuration) return c.json({ message: 'Channel not found' }, 404)
        try {
          const skill = await agentSkills.update(
            configuration,
            skillId,
            c.req.valid('json'),
          )
          return c.json({ skill: toAgentSkill(skill) })
        } catch (error) {
          if (error instanceof MetaAgentSkillsError) {
            return c.json({ message: error.message }, error.status)
          }
          throw error
        }
      },
    )
    .delete('/:id/agent-skills/:skillId', async (c) => {
      const channelId = parseChannelId(c.req.param('id'))
      const skillId = c.req.param('skillId').trim()
      if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)
      if (!skillId) return c.json({ message: 'Invalid skill ID' }, 400)
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      if (!canManageChannels(access.role)) {
        return c.json({ message: 'Organization owner or admin required' }, 403)
      }
      const configuration = await repository.getAgentConfiguration(
        access.organizationId,
        channelId,
      )
      if (!configuration) return c.json({ message: 'Channel not found' }, 404)
      try {
        await agentSkills.delete(configuration, skillId)
        return c.json({ success: true })
      } catch (error) {
        if (error instanceof MetaAgentSkillsError) {
          return c.json({ message: error.message }, error.status)
        }
        throw error
      }
    })
    .get('/:id/local-mcps', async (c) => {
      const channelId = parseChannelId(c.req.param('id'))
      if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      const configuration = await repository.getAgentConfiguration(
        access.organizationId,
        channelId,
      )
      if (!configuration) return c.json({ message: 'Channel not found' }, 404)
      const mcps = await runner.listMcps(access.organizationId)
      return c.json({
        mcps: mcps.map((mcp) => ({
          id: mcp.id,
          name: mcp.name,
          description: mcp.description,
        })),
      })
    })
    .post(
      '/:id/local-mcps/prepare',
      zValidator('json', prepareLocalMcpAssociationSchema),
      async (c) => {
        const channelId = parseChannelId(c.req.param('id'))
        if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)
        const access = await getAccess(c.req.raw.headers)
        if (!access) return c.json({ message: 'Unauthorized' }, 401)
        if (!canManageChannels(access.role)) {
          return c.json(
            { message: 'Organization owner or admin required' },
            403,
          )
        }
        const configuration = await repository.getAgentConfiguration(
          access.organizationId,
          channelId,
        )
        if (!configuration) return c.json({ message: 'Channel not found' }, 404)
        const { mcpId } = c.req.valid('json')
        const mcp = await runner.getMcp(access.organizationId, mcpId)
        const expiresAt = addUtcYears(new Date(), 1)
        const apiKey = await runner.createApiKey(access.organizationId, {
          name: `Agent connector: ${mcp.name} (${channelId})`,
          expiresAt,
          allowedFunctionIds: [],
          allowedMcpIds: [mcp.id],
        })
        const origin = new URL(c.req.url).origin
        return c.json(
          {
            association: {
              mcpId: mcp.id,
              mcpName: mcp.name,
              apiKeyId: apiKey.id,
              apiKey: apiKey.apiKey,
              expiresAt: apiKey.expiresAt.toISOString(),
              name: toConnectorName(mcp.name),
              description:
                mcp.description || `Local MCP connector for ${mcp.name}`,
              baseUrl: `${origin}/api/mcp/${mcp.id}`,
            },
          },
          201,
        )
      },
    )
    .get('/:id/agent-connectors', async (c) => {
      const channelId = parseChannelId(c.req.param('id'))
      if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      const configuration = await repository.getAgentConfiguration(
        access.organizationId,
        channelId,
      )
      if (!configuration) return c.json({ message: 'Channel not found' }, 404)
      try {
        return c.json({
          connectors: (await agentConnectors.list(configuration)).map(
            toAgentConnector,
          ),
        })
      } catch (error) {
        if (error instanceof MetaAgentConnectorsError) {
          return c.json({ message: error.message }, error.status)
        }
        throw error
      }
    })
    .post(
      '/:id/agent-connectors',
      zValidator('json', createConnectorSchema),
      async (c) => {
        const channelId = parseChannelId(c.req.param('id'))
        if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)
        const access = await getAccess(c.req.raw.headers)
        if (!access) return c.json({ message: 'Unauthorized' }, 401)
        if (!canManageChannels(access.role)) {
          return c.json(
            { message: 'Organization owner or admin required' },
            403,
          )
        }
        const configuration = await repository.getAgentConfiguration(
          access.organizationId,
          channelId,
        )
        if (!configuration) return c.json({ message: 'Channel not found' }, 404)
        try {
          const input = c.req.valid('json')
          if (input.localMcpAssociation) {
            await assertPreparedLocalMcpAssociation(
              access.organizationId,
              input.localMcpAssociation,
              input,
            )
          }
          const connector = await agentConnectors.create(
            configuration,
            toMetaConnectorInput(input),
          )
          if (input.localMcpAssociation) {
            await db.insert(runnerAgentMcpConnectors).values({
              channelId,
              mcpId: input.localMcpAssociation.mcpId,
              connectorId: connector.id,
              apiKeyId: input.localMcpAssociation.apiKeyId,
              organizationId: access.organizationId,
            })
          }
          return c.json({ connector: toAgentConnector(connector) }, 201)
        } catch (error) {
          if (error instanceof MetaAgentConnectorsError) {
            return c.json({ message: error.message }, error.status)
          }
          throw error
        }
      },
    )
    .get('/:id/agent-connectors/:connectorId', async (c) => {
      const channelId = parseChannelId(c.req.param('id'))
      const connectorId = c.req.param('connectorId').trim()
      if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)
      if (!connectorId) return c.json({ message: 'Invalid connector ID' }, 400)
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      const configuration = await repository.getAgentConfiguration(
        access.organizationId,
        channelId,
      )
      if (!configuration) return c.json({ message: 'Channel not found' }, 404)
      try {
        return c.json({
          connector: toAgentConnector(
            await agentConnectors.get(configuration, connectorId),
          ),
        })
      } catch (error) {
        if (error instanceof MetaAgentConnectorsError) {
          return c.json({ message: error.message }, error.status)
        }
        throw error
      }
    })
    .get(
      '/:id/agent-connectors/:connectorId/local-mcp-association',
      async (c) => {
        const channelId = parseChannelId(c.req.param('id'))
        const connectorId = c.req.param('connectorId').trim()
        if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)
        if (!connectorId)
          return c.json({ message: 'Invalid connector ID' }, 400)
        const access = await getAccess(c.req.raw.headers)
        if (!access) return c.json({ message: 'Unauthorized' }, 401)
        const association = await getLocalMcpAssociation(
          access.organizationId,
          channelId,
          connectorId,
        )
        return c.json({ association: association ?? null })
      },
    )
    .put(
      '/:id/agent-connectors/:connectorId',
      zValidator('json', connectorSchema),
      async (c) => {
        const channelId = parseChannelId(c.req.param('id'))
        const connectorId = c.req.param('connectorId').trim()
        if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)
        if (!connectorId)
          return c.json({ message: 'Invalid connector ID' }, 400)
        const access = await getAccess(c.req.raw.headers)
        if (!access) return c.json({ message: 'Unauthorized' }, 401)
        if (!canManageChannels(access.role)) {
          return c.json(
            { message: 'Organization owner or admin required' },
            403,
          )
        }
        const configuration = await repository.getAgentConfiguration(
          access.organizationId,
          channelId,
        )
        if (!configuration) return c.json({ message: 'Channel not found' }, 404)
        if (
          await repository.hasLocalMcpAssociation(
            access.organizationId,
            channelId,
            connectorId,
          )
        ) {
          return c.json(
            {
              code: 'LOCAL_MCP_CONNECTOR_READ_ONLY' as const,
              message:
                'This connector is managed by a local MCP. Refresh its API key instead of editing it.',
            },
            409,
          )
        }
        try {
          const input = c.req.valid('json')
          const existing = await agentConnectors.get(configuration, connectorId)
          const connector = await agentConnectors.update(
            configuration,
            connectorId,
            toMetaConnectorInput(input, existing.auth_config ?? undefined),
          )
          return c.json({ connector: toAgentConnector(connector) })
        } catch (error) {
          if (error instanceof MetaAgentConnectorsError) {
            return c.json({ message: error.message }, error.status)
          }
          throw error
        }
      },
    )
    .delete('/:id/agent-connectors/:connectorId', async (c) => {
      const channelId = parseChannelId(c.req.param('id'))
      const connectorId = c.req.param('connectorId').trim()
      if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)
      if (!connectorId) return c.json({ message: 'Invalid connector ID' }, 400)
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      if (!canManageChannels(access.role)) {
        return c.json({ message: 'Organization owner or admin required' }, 403)
      }
      const configuration = await repository.getAgentConfiguration(
        access.organizationId,
        channelId,
      )
      if (!configuration) return c.json({ message: 'Channel not found' }, 404)
      try {
        await agentConnectors.delete(configuration, connectorId)
        const apiKeyId = await repository.removeLocalMcpAssociation(
          access.organizationId,
          channelId,
          connectorId,
        )
        if (apiKeyId) {
          await runner.revokeApiKey(access.organizationId, apiKeyId)
        }
        return c.json({ success: true })
      } catch (error) {
        if (error instanceof MetaAgentConnectorsError) {
          return c.json({ message: error.message }, error.status)
        }
        throw error
      }
    })
    .post(
      '/:id/agent-connectors/:connectorId/local-mcp-association/refresh-key',
      async (c) => {
        const channelId = parseChannelId(c.req.param('id'))
        const connectorId = c.req.param('connectorId').trim()
        if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)
        if (!connectorId)
          return c.json({ message: 'Invalid connector ID' }, 400)
        const access = await getAccess(c.req.raw.headers)
        if (!access) return c.json({ message: 'Unauthorized' }, 401)
        if (!canManageChannels(access.role)) {
          return c.json(
            { message: 'Organization owner or admin required' },
            403,
          )
        }
        const configuration = await repository.getAgentConfiguration(
          access.organizationId,
          channelId,
        )
        if (!configuration) return c.json({ message: 'Channel not found' }, 404)
        const association = await getLocalMcpAssociation(
          access.organizationId,
          channelId,
          connectorId,
        )
        if (!association) {
          return c.json({ message: 'Local MCP association not found' }, 404)
        }
        const expiresAt = addUtcYears(new Date(), 1)
        const apiKey = await runner.createApiKey(access.organizationId, {
          name: `Agent connector: ${association.mcpName} (${channelId})`,
          expiresAt,
          allowedFunctionIds: [],
          allowedMcpIds: [association.mcpId],
        })
        try {
          const existing = await agentConnectors.get(configuration, connectorId)
          const connector = await agentConnectors.update(
            configuration,
            connectorId,
            {
              name: existing.name,
              description: existing.description,
              base_url: existing.base_url,
              connector_protocol: 'MCP',
              auth_type: 'API_KEY',
              auth_config: localMcpAuthConfig(apiKey.apiKey),
              ...(existing.user_auth_injection_config
                ? {
                    user_auth_injection_config:
                      existing.user_auth_injection_config,
                  }
                : {}),
              requires_certificate: Boolean(existing.mtls_config),
            },
          )
          await db
            .update(runnerAgentMcpConnectors)
            .set({ apiKeyId: apiKey.id, updatedAt: new Date() })
            .where(
              and(
                eq(
                  runnerAgentMcpConnectors.organizationId,
                  access.organizationId,
                ),
                eq(runnerAgentMcpConnectors.channelId, channelId),
                eq(runnerAgentMcpConnectors.connectorId, connectorId),
              ),
            )
          await runner
            .revokeApiKey(access.organizationId, association.apiKeyId)
            .catch((error: unknown) => {
              console.error('Could not revoke the previous local MCP API key', {
                organizationId: access.organizationId,
                channelId,
                connectorId,
                apiKeyId: association.apiKeyId,
                error,
              })
            })
          return c.json({
            connector: toAgentConnector(connector),
            association: {
              ...association,
              apiKeyId: apiKey.id,
              expiresAt: apiKey.expiresAt.toISOString(),
              revokedAt: null,
            },
          })
        } catch (error) {
          await runner.revokeApiKey(access.organizationId, apiKey.id)
          if (error instanceof MetaAgentConnectorsError) {
            return c.json({ message: error.message }, error.status)
          }
          throw error
        }
      },
    )
    .post('/:id/agent-connectors/:connectorId/refresh-mcp-tools', async (c) => {
      const channelId = parseChannelId(c.req.param('id'))
      const connectorId = c.req.param('connectorId').trim()
      if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)
      if (!connectorId) return c.json({ message: 'Invalid connector ID' }, 400)
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      if (!canManageChannels(access.role)) {
        return c.json({ message: 'Organization owner or admin required' }, 403)
      }
      const configuration = await repository.getAgentConfiguration(
        access.organizationId,
        channelId,
      )
      if (!configuration) return c.json({ message: 'Channel not found' }, 404)
      try {
        const connector = await agentConnectors.get(configuration, connectorId)
        if ((connector.connector_protocol ?? 'HTTP') !== 'MCP') {
          return c.json(
            { message: 'Tool refresh is available only for MCP connectors' },
            400,
          )
        }
        if (!agentConnectors.refreshMcpTools) {
          return c.json({ message: 'MCP tool refresh is unavailable' }, 501)
        }
        await agentConnectors.refreshMcpTools(configuration, connectorId)
        return c.json({
          success: true as const,
          connector: toAgentConnector(
            await agentConnectors.get(configuration, connectorId),
          ),
        })
      } catch (error) {
        if (error instanceof MetaAgentConnectorsError) {
          return c.json({ message: error.message }, error.status)
        }
        throw error
      }
    })
    .get('/:id/agent-connectors/:connectorId/logs', async (c) => {
      const channelId = parseChannelId(c.req.param('id'))
      const connectorId = c.req.param('connectorId').trim()
      if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)
      if (!connectorId) return c.json({ message: 'Invalid connector ID' }, 400)
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      const configuration = await repository.getAgentConfiguration(
        access.organizationId,
        channelId,
      )
      if (!configuration) return c.json({ message: 'Channel not found' }, 404)
      try {
        const logs = await agentConnectors.logs(configuration, connectorId)
        return c.json({
          logs: logs.data.map(toAgentConnectorLog),
          stats: logs.stats ?? null,
        })
      } catch (error) {
        if (error instanceof MetaAgentConnectorsError) {
          return c.json({ message: error.message }, error.status)
        }
        throw error
      }
    })
    .get('/:id/agent-connectors/:connectorId/tools', async (c) => {
      const channelId = parseChannelId(c.req.param('id'))
      const connectorId = c.req.param('connectorId').trim()
      if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)
      if (!connectorId) return c.json({ message: 'Invalid connector ID' }, 400)
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      const configuration = await repository.getAgentConfiguration(
        access.organizationId,
        channelId,
      )
      if (!configuration) return c.json({ message: 'Channel not found' }, 404)
      try {
        return c.json({
          tools: (
            await agentConnectors.listTools(configuration, connectorId)
          ).map(toAgentConnectorTool),
        })
      } catch (error) {
        if (error instanceof MetaAgentConnectorsError) {
          return c.json({ message: error.message }, error.status)
        }
        throw error
      }
    })
    .post(
      '/:id/agent-connectors/:connectorId/tools',
      zValidator('json', connectorToolSchema),
      async (c) => {
        const channelId = parseChannelId(c.req.param('id'))
        const connectorId = c.req.param('connectorId').trim()
        if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)
        if (!connectorId)
          return c.json({ message: 'Invalid connector ID' }, 400)
        const access = await getAccess(c.req.raw.headers)
        if (!access) return c.json({ message: 'Unauthorized' }, 401)
        if (!canManageChannels(access.role)) {
          return c.json(
            { message: 'Organization owner or admin required' },
            403,
          )
        }
        const configuration = await repository.getAgentConfiguration(
          access.organizationId,
          channelId,
        )
        if (!configuration) return c.json({ message: 'Channel not found' }, 404)
        try {
          const tool = await agentConnectors.createTool(
            configuration,
            connectorId,
            toMetaConnectorToolInput(c.req.valid('json')),
          )
          return c.json({ tool: toAgentConnectorTool(tool) }, 201)
        } catch (error) {
          if (error instanceof MetaAgentConnectorsError) {
            return c.json({ message: error.message }, error.status)
          }
          throw error
        }
      },
    )
    .put(
      '/:id/agent-connectors/:connectorId/tools/:toolId',
      zValidator('json', connectorToolSchema),
      async (c) => {
        const channelId = parseChannelId(c.req.param('id'))
        const connectorId = c.req.param('connectorId').trim()
        const toolId = c.req.param('toolId').trim()
        if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)
        if (!connectorId)
          return c.json({ message: 'Invalid connector ID' }, 400)
        if (!toolId) return c.json({ message: 'Invalid tool ID' }, 400)
        const access = await getAccess(c.req.raw.headers)
        if (!access) return c.json({ message: 'Unauthorized' }, 401)
        if (!canManageChannels(access.role)) {
          return c.json(
            { message: 'Organization owner or admin required' },
            403,
          )
        }
        const configuration = await repository.getAgentConfiguration(
          access.organizationId,
          channelId,
        )
        if (!configuration) return c.json({ message: 'Channel not found' }, 404)
        try {
          const tool = await agentConnectors.updateTool(
            configuration,
            connectorId,
            toolId,
            toMetaConnectorToolInput(c.req.valid('json')),
          )
          return c.json({ tool: toAgentConnectorTool(tool) })
        } catch (error) {
          if (error instanceof MetaAgentConnectorsError) {
            return c.json({ message: error.message }, error.status)
          }
          throw error
        }
      },
    )
    .delete('/:id/agent-connectors/:connectorId/tools/:toolId', async (c) => {
      const channelId = parseChannelId(c.req.param('id'))
      const connectorId = c.req.param('connectorId').trim()
      const toolId = c.req.param('toolId').trim()
      if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)
      if (!connectorId) return c.json({ message: 'Invalid connector ID' }, 400)
      if (!toolId) return c.json({ message: 'Invalid tool ID' }, 400)
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      if (!canManageChannels(access.role)) {
        return c.json({ message: 'Organization owner or admin required' }, 403)
      }
      const configuration = await repository.getAgentConfiguration(
        access.organizationId,
        channelId,
      )
      if (!configuration) return c.json({ message: 'Channel not found' }, 404)
      try {
        await agentConnectors.deleteTool(configuration, connectorId, toolId)
        return c.json({ success: true })
      } catch (error) {
        if (error instanceof MetaAgentConnectorsError) {
          return c.json({ message: error.message }, error.status)
        }
        throw error
      }
    })
    .get('/:id/agent-evals', async (c) => {
      const channelId = parseChannelId(c.req.param('id'))
      if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      const configuration = await repository.getAgentConfiguration(
        access.organizationId,
        channelId,
      )
      if (!configuration) return c.json({ message: 'Channel not found' }, 404)
      try {
        return c.json({
          cases: (await agentEvaluations.listCases(configuration)).map(
            toAgentEvaluationCase,
          ),
        })
      } catch (error) {
        if (error instanceof MetaAgentEvaluationsError) {
          return c.json({ message: error.message }, error.status)
        }
        throw error
      }
    })
    .post(
      '/:id/agent-evals/runs',
      zValidator('json', runEvaluationSchema),
      async (c) => {
        const channelId = parseChannelId(c.req.param('id'))
        if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)
        const access = await getAccess(c.req.raw.headers)
        if (!access) return c.json({ message: 'Unauthorized' }, 401)
        if (!canManageChannels(access.role)) {
          return c.json(
            { message: 'Organization owner or admin required' },
            403,
          )
        }
        const configuration = await repository.getAgentConfiguration(
          access.organizationId,
          channelId,
        )
        if (!configuration) return c.json({ message: 'Channel not found' }, 404)
        try {
          const run = await agentEvaluations.run(
            configuration,
            c.req.valid('json').evalCaseIds,
          )
          return c.json({ jobId: run.job_id, status: run.status }, 202)
        } catch (error) {
          if (error instanceof MetaAgentEvaluationsError) {
            return c.json({ message: error.message }, error.status)
          }
          throw error
        }
      },
    )
    .get('/:id/agent-evals/runs/:jobId', async (c) => {
      const channelId = parseChannelId(c.req.param('id'))
      const jobId = c.req.param('jobId').trim()
      if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)
      if (!jobId) return c.json({ message: 'Invalid evaluation job ID' }, 400)
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      const configuration = await repository.getAgentConfiguration(
        access.organizationId,
        channelId,
      )
      if (!configuration) return c.json({ message: 'Channel not found' }, 404)
      try {
        return c.json({
          job: toAgentEvaluationJob(
            await agentEvaluations.getJob(configuration, jobId),
          ),
        })
      } catch (error) {
        if (error instanceof MetaAgentEvaluationsError) {
          return c.json({ message: error.message }, error.status)
        }
        throw error
      }
    })
    .get(
      '/:id/agent-evals/details',
      zValidator('query', evaluationIdsQuerySchema),
      async (c) => {
        const channelId = parseChannelId(c.req.param('id'))
        if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)
        const access = await getAccess(c.req.raw.headers)
        if (!access) return c.json({ message: 'Unauthorized' }, 401)
        const configuration = await repository.getAgentConfiguration(
          access.organizationId,
          channelId,
        )
        if (!configuration) return c.json({ message: 'Channel not found' }, 404)
        try {
          return c.json({
            evaluations: (
              await agentEvaluations.getDetails(
                configuration,
                parseEvaluationIds(c.req.valid('query').ids),
              )
            ).map(toAgentEvaluationDetail),
          })
        } catch (error) {
          if (error instanceof MetaAgentEvaluationsError) {
            return c.json({ message: error.message }, error.status)
          }
          throw error
        }
      },
    )
    .get(
      '/:id/agent-evals/summaries',
      zValidator('query', evaluationIdsQuerySchema),
      async (c) => {
        const channelId = parseChannelId(c.req.param('id'))
        if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)
        const access = await getAccess(c.req.raw.headers)
        if (!access) return c.json({ message: 'Unauthorized' }, 401)
        const configuration = await repository.getAgentConfiguration(
          access.organizationId,
          channelId,
        )
        if (!configuration) return c.json({ message: 'Channel not found' }, 404)
        try {
          return c.json({
            summaries: (
              await agentEvaluations.getSummaries(
                configuration,
                parseEvaluationIds(c.req.valid('query').ids),
              )
            ).map(toAgentEvaluationSummary),
          })
        } catch (error) {
          if (error instanceof MetaAgentEvaluationsError) {
            return c.json({ message: error.message }, error.status)
          }
          throw error
        }
      },
    )
    .get('/:id/agent-knowledge/faqs', async (c) => {
      const channelId = parseChannelId(c.req.param('id'))
      if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      const configuration = await repository.getAgentConfiguration(
        access.organizationId,
        channelId,
      )
      if (!configuration) return c.json({ message: 'Channel not found' }, 404)
      try {
        return c.json({
          faqs: (await agentKnowledge.listFaqs(configuration)).map(toFaq),
        })
      } catch (error) {
        if (error instanceof MetaAgentKnowledgeError) {
          return c.json({ message: error.message }, error.status)
        }
        throw error
      }
    })
    .post(
      '/:id/agent-knowledge/faqs',
      zValidator('json', faqSchema),
      async (c) => {
        const channelId = parseChannelId(c.req.param('id'))
        if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)
        const access = await getAccess(c.req.raw.headers)
        if (!access) return c.json({ message: 'Unauthorized' }, 401)
        if (!canManageChannels(access.role)) {
          return c.json(
            { message: 'Organization owner or admin required' },
            403,
          )
        }
        const configuration = await repository.getAgentConfiguration(
          access.organizationId,
          channelId,
        )
        if (!configuration) return c.json({ message: 'Channel not found' }, 404)
        try {
          const faq = await agentKnowledge.createFaq(
            configuration,
            c.req.valid('json'),
          )
          return c.json({ faq: toFaq(faq) }, 201)
        } catch (error) {
          if (error instanceof MetaAgentKnowledgeError) {
            return c.json({ message: error.message }, error.status)
          }
          throw error
        }
      },
    )
    .put(
      '/:id/agent-knowledge/faqs/:faqId',
      zValidator('json', faqSchema),
      async (c) => {
        const channelId = parseChannelId(c.req.param('id'))
        const faqId = c.req.param('faqId').trim()
        if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)
        if (!faqId) return c.json({ message: 'Invalid FAQ ID' }, 400)
        const access = await getAccess(c.req.raw.headers)
        if (!access) return c.json({ message: 'Unauthorized' }, 401)
        if (!canManageChannels(access.role)) {
          return c.json(
            { message: 'Organization owner or admin required' },
            403,
          )
        }
        const configuration = await repository.getAgentConfiguration(
          access.organizationId,
          channelId,
        )
        if (!configuration) return c.json({ message: 'Channel not found' }, 404)
        try {
          const faq = await agentKnowledge.updateFaq(
            configuration,
            faqId,
            c.req.valid('json'),
          )
          return c.json({ faq: toFaq(faq) })
        } catch (error) {
          if (error instanceof MetaAgentKnowledgeError) {
            return c.json({ message: error.message }, error.status)
          }
          throw error
        }
      },
    )
    .delete('/:id/agent-knowledge/faqs/:faqId', async (c) => {
      const channelId = parseChannelId(c.req.param('id'))
      const faqId = c.req.param('faqId').trim()
      if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)
      if (!faqId) return c.json({ message: 'Invalid FAQ ID' }, 400)
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      if (!canManageChannels(access.role)) {
        return c.json({ message: 'Organization owner or admin required' }, 403)
      }
      const configuration = await repository.getAgentConfiguration(
        access.organizationId,
        channelId,
      )
      if (!configuration) return c.json({ message: 'Channel not found' }, 404)
      try {
        await agentKnowledge.deleteFaq(configuration, faqId)
        return c.json({ success: true })
      } catch (error) {
        if (error instanceof MetaAgentKnowledgeError) {
          return c.json({ message: error.message }, error.status)
        }
        throw error
      }
    })
    .get('/:id/agent-knowledge/websites', async (c) => {
      const channelId = parseChannelId(c.req.param('id'))
      if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      const configuration = await repository.getAgentConfiguration(
        access.organizationId,
        channelId,
      )
      if (!configuration) return c.json({ message: 'Channel not found' }, 404)
      try {
        return c.json({
          websites: (await agentKnowledge.listWebsites(configuration)).map(
            toKnowledgeWebsite,
          ),
        })
      } catch (error) {
        if (error instanceof MetaAgentKnowledgeError) {
          return c.json({ message: error.message }, error.status)
        }
        throw error
      }
    })
    .post(
      '/:id/agent-knowledge/websites',
      zValidator('json', knowledgeWebsiteSchema),
      async (c) => {
        const channelId = parseChannelId(c.req.param('id'))
        if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)
        const access = await getAccess(c.req.raw.headers)
        if (!access) return c.json({ message: 'Unauthorized' }, 401)
        if (!canManageChannels(access.role)) {
          return c.json(
            { message: 'Organization owner or admin required' },
            403,
          )
        }
        const configuration = await repository.getAgentConfiguration(
          access.organizationId,
          channelId,
        )
        if (!configuration) return c.json({ message: 'Channel not found' }, 404)
        try {
          const website = await agentKnowledge.createWebsite(
            configuration,
            toKnowledgeWebsiteInput(c.req.valid('json')),
          )
          return c.json({ website: toKnowledgeWebsite(website) }, 201)
        } catch (error) {
          if (error instanceof MetaAgentKnowledgeError) {
            return c.json({ message: error.message }, error.status)
          }
          throw error
        }
      },
    )
    .put(
      '/:id/agent-knowledge/websites/:websiteId',
      zValidator('json', knowledgeWebsiteSchema),
      async (c) => {
        const channelId = parseChannelId(c.req.param('id'))
        const websiteId = c.req.param('websiteId').trim()
        if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)
        if (!websiteId) return c.json({ message: 'Invalid website ID' }, 400)
        const access = await getAccess(c.req.raw.headers)
        if (!access) return c.json({ message: 'Unauthorized' }, 401)
        if (!canManageChannels(access.role)) {
          return c.json(
            { message: 'Organization owner or admin required' },
            403,
          )
        }
        const configuration = await repository.getAgentConfiguration(
          access.organizationId,
          channelId,
        )
        if (!configuration) return c.json({ message: 'Channel not found' }, 404)
        try {
          const website = await agentKnowledge.updateWebsite(
            configuration,
            websiteId,
            toKnowledgeWebsiteInput(c.req.valid('json')),
          )
          return c.json({ website: toKnowledgeWebsite(website) })
        } catch (error) {
          if (error instanceof MetaAgentKnowledgeError) {
            return c.json({ message: error.message }, error.status)
          }
          throw error
        }
      },
    )
    .delete('/:id/agent-knowledge/websites/:websiteId', async (c) => {
      const channelId = parseChannelId(c.req.param('id'))
      const websiteId = c.req.param('websiteId').trim()
      if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)
      if (!websiteId) return c.json({ message: 'Invalid website ID' }, 400)
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      if (!canManageChannels(access.role)) {
        return c.json({ message: 'Organization owner or admin required' }, 403)
      }
      const configuration = await repository.getAgentConfiguration(
        access.organizationId,
        channelId,
      )
      if (!configuration) return c.json({ message: 'Channel not found' }, 404)
      try {
        await agentKnowledge.deleteWebsite(configuration, websiteId)
        return c.json({ success: true })
      } catch (error) {
        if (error instanceof MetaAgentKnowledgeError) {
          return c.json({ message: error.message }, error.status)
        }
        throw error
      }
    })
    .get('/:id/agent-knowledge/files', async (c) => {
      const channelId = parseChannelId(c.req.param('id'))
      if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      const configuration = await repository.getAgentConfiguration(
        access.organizationId,
        channelId,
      )
      if (!configuration) return c.json({ message: 'Channel not found' }, 404)
      try {
        return c.json({
          files: (await agentKnowledge.listFiles(configuration)).map(
            toKnowledgeFile,
          ),
        })
      } catch (error) {
        if (error instanceof MetaAgentKnowledgeError) {
          return c.json({ message: error.message }, error.status)
        }
        throw error
      }
    })
    .post('/:id/agent-knowledge/files', async (c) => {
      const channelId = parseChannelId(c.req.param('id'))
      if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      if (!canManageChannels(access.role)) {
        return c.json({ message: 'Organization owner or admin required' }, 403)
      }
      const declaredLength = Number(c.req.header('content-length'))
      if (
        Number.isFinite(declaredLength) &&
        declaredLength > maximumKnowledgeFileBytes + 1_000_000
      ) {
        return c.json({ message: 'Knowledge file is too large' }, 413)
      }
      const configuration = await repository.getAgentConfiguration(
        access.organizationId,
        channelId,
      )
      if (!configuration) return c.json({ message: 'Channel not found' }, 404)
      const form = await c.req.raw.formData()
      const file = form.get('file')
      if (!(file instanceof File)) {
        return c.json({ message: 'A knowledge file is required' }, 400)
      }
      if (file.size > maximumKnowledgeFileBytes) {
        return c.json({ message: 'Knowledge file is too large' }, 413)
      }
      if (!knowledgeFileExtensions.has(fileExtension(file.name))) {
        return c.json({ message: 'Unsupported knowledge file type' }, 400)
      }
      try {
        const uploaded = await agentKnowledge.uploadFile(configuration, file)
        try {
          await knowledgeArchive.put(
            access.organizationId,
            channelId,
            uploaded,
            file,
          )
        } catch {
          await agentKnowledge
            .deleteFile(configuration, uploaded.id)
            .catch(() => undefined)
          return c.json(
            { message: 'Could not archive the knowledge file' },
            502,
          )
        }
        return c.json({ file: toKnowledgeFile(uploaded) }, 201)
      } catch (error) {
        if (error instanceof MetaAgentKnowledgeError) {
          return c.json({ message: error.message }, error.status)
        }
        throw error
      }
    })
    .delete('/:id/agent-knowledge/files/:fileId', async (c) => {
      const channelId = parseChannelId(c.req.param('id'))
      const fileId = c.req.param('fileId').trim()
      if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)
      if (!fileId) return c.json({ message: 'Invalid file ID' }, 400)
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      if (!canManageChannels(access.role)) {
        return c.json({ message: 'Organization owner or admin required' }, 403)
      }
      const configuration = await repository.getAgentConfiguration(
        access.organizationId,
        channelId,
      )
      if (!configuration) return c.json({ message: 'Channel not found' }, 404)
      try {
        await agentKnowledge.deleteFile(configuration, fileId)
        await knowledgeArchive.delete(access.organizationId, fileId)
        return c.json({ success: true })
      } catch (error) {
        if (error instanceof MetaAgentKnowledgeError) {
          return c.json({ message: error.message }, error.status)
        }
        throw error
      }
    })
    .post('/:id/agent', async (c) => {
      const channelId = parseChannelId(c.req.param('id'))
      if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)

      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      if (!canManageChannels(access.role)) {
        return c.json({ message: 'Organization owner or admin required' }, 403)
      }
      const configuration = await repository.getAgentConfiguration(
        access.organizationId,
        channelId,
      )
      if (!configuration) return c.json({ message: 'Channel not found' }, 404)

      try {
        const result = await onboardAgent(configuration)
        return c.json({ agentId: result.agent_id }, 201)
      } catch (error) {
        if (error instanceof MetaAgentOnboardingError) {
          return c.json({ message: error.message }, error.status)
        }
        throw error
      }
    })
    .delete('/:id/agent', async (c) => {
      const channelId = parseChannelId(c.req.param('id'))
      if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)

      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      if (!canManageChannels(access.role)) {
        return c.json({ message: 'Organization owner or admin required' }, 403)
      }
      const configuration = await repository.getAgentConfiguration(
        access.organizationId,
        channelId,
      )
      if (!configuration) return c.json({ message: 'Channel not found' }, 404)

      try {
        const result = await deleteAgent(configuration)
        return c.json({ deletedAgentId: result.deleted_agent_id ?? null })
      } catch (error) {
        if (error instanceof MetaAgentDeletionError) {
          return c.json({ message: error.message }, error.status)
        }
        throw error
      }
    })
    .get('/:id/verify-token', async (c) => {
      const channelId = parseChannelId(c.req.param('id'))
      if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)

      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      if (!canManageChannels(access.role)) {
        return c.json({ message: 'Organization owner or admin required' }, 403)
      }

      const token = await repository.getVerifyToken(
        access.organizationId,
        channelId,
      )
      if (!token) return c.json({ message: 'Channel not found' }, 404)
      return c.json({ token })
    })
    .post(
      '/:id/set-webhook',
      zValidator('json', setWebhookSchema),
      async (c) => {
        const channelId = parseChannelId(c.req.param('id'))
        if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)

        const access = await getAccess(c.req.raw.headers)
        if (!access) return c.json({ message: 'Unauthorized' }, 401)
        if (!canManageChannels(access.role)) {
          return c.json(
            { message: 'Organization owner or admin required' },
            403,
          )
        }

        const { callbackUrl } = c.req.valid('json')
        const callback = new URL(callbackUrl)
        if (
          callback.username ||
          callback.password ||
          callback.search ||
          callback.hash ||
          callback.pathname !== `/api/wa-cloud/webhook/${channelId}`
        ) {
          return c.json({ message: 'Invalid channel webhook URL' }, 400)
        }

        const configuration = await repository.getWebhookConfiguration(
          access.organizationId,
          channelId,
        )
        if (!configuration) {
          return c.json({ message: 'Channel not found' }, 404)
        }

        try {
          await registerWebhook(configuration, callbackUrl)
          return c.json({
            success: true as const,
            message: 'Meta app webhook subscription registered successfully',
            callbackUrl,
          })
        } catch (error) {
          if (error instanceof MetaWebhookRegistrationError) {
            console.error('Meta webhook setup failed', {
              channelId,
              organizationId: access.organizationId,
              stage: error.stage,
              providerStatus: error.providerStatus,
              providerCode: error.providerCode,
              providerSubcode: error.providerSubcode,
              providerType: error.providerType,
              providerTraceId: error.providerTraceId,
              message: error.message,
            })
            return c.json(
              {
                message: error.message,
                stage: error.stage,
                ...(error.providerStatus === undefined
                  ? {}
                  : { providerStatus: error.providerStatus }),
                ...(error.providerCode === undefined
                  ? {}
                  : { providerCode: error.providerCode }),
                ...(error.providerSubcode === undefined
                  ? {}
                  : { providerSubcode: error.providerSubcode }),
                ...(error.providerTraceId === undefined
                  ? {}
                  : { providerTraceId: error.providerTraceId }),
              },
              502,
            )
          }
          throw error
        }
      },
    )
    .get('/:id/deletion-impact', async (c) => {
      const channelId = parseChannelId(c.req.param('id'))
      if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)

      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      if (!canManageChannels(access.role)) {
        return c.json({ message: 'Organization owner or admin required' }, 403)
      }

      const impact = await repository.getDeletionPreview(
        access.organizationId,
        channelId,
      )
      if (
        await repository.hasLocalMcpAssociation(
          access.organizationId,
          channelId,
        )
      ) {
        return c.json(
          {
            code: 'CHANNEL_USED_BY_AGENT_MCP' as const,
            message:
              'This channel cannot be deleted because an agent connector uses a local MCP.',
          },
          409,
        )
      }
      if (!impact) return c.json({ message: 'Channel not found' }, 404)
      return c.json({ impact })
    })
    .patch('/:id', zValidator('json', updateChannelSchema), async (c) => {
      const channelId = parseChannelId(c.req.param('id'))
      if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)

      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      if (!canManageChannels(access.role)) {
        return c.json({ message: 'Organization owner or admin required' }, 403)
      }

      try {
        const channel = await repository.update(
          access.organizationId,
          channelId,
          c.req.valid('json'),
        )
        if (!channel) return c.json({ message: 'Channel not found' }, 404)
        return c.json({ channel })
      } catch (error) {
        if (getDatabaseErrorCode(error) === '23505') {
          return c.json(
            { message: 'A channel already uses this phone number ID' },
            409,
          )
        }
        throw error
      }
    })
    .delete(
      '/:id',
      zValidator('json', deleteChannelSchema, (result, c) => {
        if (!result.success) {
          return c.json({ message: 'Invalid channel deletion request' }, 400)
        }
      }),
      async (c) => {
        const channelId = parseChannelId(c.req.param('id'))
        if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)

        const access = await getAccess(c.req.raw.headers)
        if (!access) return c.json({ message: 'Unauthorized' }, 401)
        if (!canManageChannels(access.role)) {
          return c.json(
            { message: 'Organization owner or admin required' },
            403,
          )
        }

        try {
          const result = await repository.delete(
            access.organizationId,
            channelId,
            c.req.valid('json').confirmation,
          )
          if (result.status === 'not_found') {
            return c.json({ message: 'Channel not found' }, 404)
          }
          if (result.status === 'confirmation_mismatch') {
            return c.json(
              { message: 'Channel confirmation did not match' },
              400,
            )
          }
          if (result.status === 'in_use') {
            return c.json(
              {
                code: 'CHANNEL_USED_BY_AGENT_MCP' as const,
                message:
                  'This channel cannot be deleted because an agent connector uses a local MCP.',
              },
              409,
            )
          }
          await agentBackups
            .deleteStoredFiles(result.backupStoragePaths ?? [])
            .catch((error: unknown) => {
              console.error('Could not delete agent backup files', {
                organizationId: access.organizationId,
                channelId,
                error,
              })
            })
          return c.json({
            deleted: true as const,
            channelId,
            impact: result.impact,
          })
        } catch (error) {
          if (getDatabaseErrorCode(error) === '23503') {
            return c.json(
              { message: 'Local channel data could not be fully deleted' },
              409,
            )
          }
          throw error
        }
      },
    )

async function getOrganizationAccess(
  headers: Headers,
): Promise<OrganizationAccess | undefined> {
  const session = await auth.api.getSession({ headers })
  const organizationId = session?.session.activeOrganizationId
  if (!session || !organizationId) return undefined

  const [membership] = await db
    .select({ role: member.role })
    .from(member)
    .where(
      and(
        eq(member.organizationId, organizationId),
        eq(member.userId, session.user.id),
      ),
    )
    .limit(1)

  return membership ? { organizationId, role: membership.role } : undefined
}

function canManageChannels(role: string): boolean {
  return role
    .split(',')
    .map((value) => value.trim())
    .some((value) => value === 'owner' || value === 'admin')
}

function parseChannelId(value: string): number | undefined {
  if (!/^[1-9]\d*$/.test(value)) return undefined
  const channelId = Number(value)
  return Number.isSafeInteger(channelId) ? channelId : undefined
}

function addUtcYears(value: Date, years: number): Date {
  const result = new Date(value)
  result.setUTCFullYear(result.getUTCFullYear() + years)
  return result
}

function toConnectorName(mcpName: string): string {
  return mcpName.slice(0, 64).replace(/_+$/, '')
}

function localMcpAuthConfig(apiKey: string): ConnectorAuthConfig {
  return {
    api_key: {
      headers: [
        { field_name: 'Authorization', value: apiKey, prefix: 'Bearer ' },
      ],
      query_params: [],
      body_params: [],
    },
  }
}

async function assertPreparedLocalMcpAssociation(
  organizationId: string,
  association: z.infer<typeof localMcpAssociationSchema>,
  connector: z.infer<typeof createConnectorSchema>,
) {
  const [prepared] = await db
    .select({
      apiKeyId: runnerFunctionApiKeys.id,
      expiresAt: runnerFunctionApiKeys.expiresAt,
      revokedAt: runnerFunctionApiKeys.revokedAt,
      allowedMcpIds: runnerFunctionApiKeys.allowedMcpIds,
      keyHash: runnerFunctionApiKeys.keyHash,
    })
    .from(runnerFunctionApiKeys)
    .innerJoin(
      runnerMcps,
      and(
        eq(runnerMcps.id, association.mcpId),
        eq(runnerMcps.organizationId, runnerFunctionApiKeys.organizationId),
      ),
    )
    .where(
      and(
        eq(runnerFunctionApiKeys.id, association.apiKeyId),
        eq(runnerFunctionApiKeys.organizationId, organizationId),
      ),
    )
    .limit(1)
  if (
    !prepared ||
    prepared.revokedAt ||
    prepared.expiresAt.getTime() <= Date.now() ||
    !prepared.allowedMcpIds?.includes(association.mcpId) ||
    connector.connectorProtocol !== 'MCP' ||
    connector.authType !== 'API_KEY' ||
    !connector.baseUrl.endsWith(`/api/mcp/${association.mcpId}`) ||
    !connector.authConfig?.apiKey?.headers.some(
      (header) =>
        header.fieldName.toLocaleLowerCase() === 'authorization' &&
        header.prefix === 'Bearer ' &&
        hashApiKey(header.value) === prepared.keyHash,
    )
  ) {
    throw new MetaAgentConnectorsError(
      'The prepared local MCP API key is invalid or expired',
      400,
    )
  }
}

async function getLocalMcpAssociation(
  organizationId: string,
  channelId: number,
  connectorId: string,
) {
  const [association] = await db
    .select({
      channelId: runnerAgentMcpConnectors.channelId,
      mcpId: runnerAgentMcpConnectors.mcpId,
      mcpName: runnerMcps.name,
      connectorId: runnerAgentMcpConnectors.connectorId,
      apiKeyId: runnerAgentMcpConnectors.apiKeyId,
      expiresAt: runnerFunctionApiKeys.expiresAt,
      revokedAt: runnerFunctionApiKeys.revokedAt,
    })
    .from(runnerAgentMcpConnectors)
    .innerJoin(runnerMcps, eq(runnerMcps.id, runnerAgentMcpConnectors.mcpId))
    .innerJoin(
      runnerFunctionApiKeys,
      eq(runnerFunctionApiKeys.id, runnerAgentMcpConnectors.apiKeyId),
    )
    .where(
      and(
        eq(runnerAgentMcpConnectors.organizationId, organizationId),
        eq(runnerAgentMcpConnectors.channelId, channelId),
        eq(runnerAgentMcpConnectors.connectorId, connectorId),
      ),
    )
    .limit(1)
  return association
    ? {
        ...association,
        expiresAt: association.expiresAt.toISOString(),
        revokedAt: association.revokedAt?.toISOString() ?? null,
      }
    : undefined
}

function toChannelSummary(row: {
  id: number
  type: 'whatsapp'
  name: string
  waPhoneNumber: string
  waPhoneNumberId: string
  waWabaId: string
  waBusinessId: string
  waAppId: string
  webhookForwardUrls: string[]
  hasWaAppSecret: boolean
  hasWaWebhookVerifyToken: boolean
  hasWaSystemUserAccessToken: boolean
  createdAt: Date
  updatedAt: Date
}): ChannelSummary {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    waPhoneNumber: row.waPhoneNumber,
    waPhoneNumberId: row.waPhoneNumberId,
    waWabaId: row.waWabaId,
    waBusinessId: row.waBusinessId,
    waAppId: row.waAppId,
    webhookForwardUrls: row.webhookForwardUrls,
    hasWaAppSecret: row.hasWaAppSecret,
    hasWaWebhookVerifyToken: row.hasWaWebhookVerifyToken,
    hasWaSystemUserAccessToken: row.hasWaSystemUserAccessToken,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function getDatabaseErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  if ('code' in error && typeof error.code === 'string') return error.code
  if ('cause' in error) return getDatabaseErrorCode(error.cause)
  return undefined
}

function isHttpUrl(value: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

export async function registerMetaWebhook(
  configuration: ChannelWebhookConfiguration,
  callbackUrl: string,
  request: typeof fetch = fetch,
): Promise<void> {
  try {
    const registration = createWhatsAppWebhookRegistrationClient({
      appId: configuration.waAppId,
      appSecret: configuration.waAppSecret,
      fetch: request,
    })
    await registration.register({
      callbackUrl,
      verifyToken: configuration.waWebhookVerifyToken,
      fields: MBA_WEBHOOK_SUBSCRIPTION_FIELDS,
    })
  } catch (error) {
    if (error instanceof WhatsAppWebhookRegistrationApiError) {
      throw new MetaWebhookRegistrationError(
        `Meta rejected the app webhook subscription: ${error.message}`,
        'app_registration',
        error,
      )
    }
    if (error instanceof WhatsAppWebhookRegistrationResponseError) {
      throw new MetaWebhookRegistrationError(
        'Meta returned an unexpected app webhook subscription response',
        'app_registration',
        error,
      )
    }
    throw new MetaWebhookRegistrationError(
      'Could not register the Meta app webhook subscription',
      'unknown',
      error,
    )
  }
}

type MetaWebhookRegistrationStage = 'app_registration' | 'unknown'

export class MetaWebhookRegistrationError extends Error {
  readonly stage: MetaWebhookRegistrationStage
  readonly providerStatus?: number
  readonly providerCode?: number
  readonly providerSubcode?: number
  readonly providerType?: string
  readonly providerTraceId?: string

  constructor(
    message: string,
    stage: MetaWebhookRegistrationStage,
    cause: unknown,
  ) {
    super(message, { cause })
    this.name = 'MetaWebhookRegistrationError'
    this.stage = stage
    if (cause instanceof WhatsAppWebhookRegistrationApiError) {
      this.providerStatus = cause.status
      this.providerCode = cause.code
      this.providerSubcode = cause.subcode
      this.providerType = cause.errorType
      this.providerTraceId = cause.traceId
    }
  }
}

export async function getMetaDashboardAnalytics(
  configuration: ChannelAgentConfiguration,
  days: number,
  request: typeof fetch = fetch,
): Promise<ChannelDashboardAnalytics> {
  const end = new Date()
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - days)
  const startSeconds = Math.floor(start.getTime() / 1_000)
  const endSeconds = Math.floor(end.getTime() / 1_000)
  const dateRange = {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  }

  const analytics = configuration.waWabaId
    ? createWhatsAppAnalyticsClient({
        accessToken: configuration.waSystemUserAccessToken,
        wabaId: configuration.waWabaId,
        fetch: request,
      })
    : null
  const mba = createWhatsAppMbaClient({
    accessToken: configuration.waSystemUserAccessToken,
    phoneNumberId: configuration.waPhoneNumberId,
    fetch: request,
  })

  const [messagingResult, conversationsResult, toolsResult] =
    await Promise.allSettled([
      analytics
        ? analytics.getMessagingAnalytics({
            start: startSeconds,
            end: endSeconds,
            granularity: 'DAY',
            phoneNumbers: [configuration.waPhoneNumberId],
          })
        : Promise.reject(new Error('WABA ID is unavailable')),
      mba.getConversationInsights({
        ...dateRange,
        metrics: ['ai_threads', 'ai_handoffs'],
      }),
      mba.getToolCallInsights(dateRange),
    ])

  const messaging =
    messagingResult.status === 'fulfilled'
      ? (() => {
          const series = messagingResult.value.analytics.data_points.map(
            (point) => ({
              date: new Date(point.start * 1_000).toISOString().slice(0, 10),
              sent: point.sent,
              delivered: point.delivered,
            }),
          )
          const sent = series.reduce((total, point) => total + point.sent, 0)
          const delivered = series.reduce(
            (total, point) => total + point.delivered,
            0,
          )
          return {
            sent,
            delivered,
            deliveryRate: sent > 0 ? delivered / sent : null,
            series,
          }
        })()
      : null

  const agentAvailable =
    conversationsResult.status === 'fulfilled' ||
    toolsResult.status === 'fulfilled'
  let threads = 0
  let handoffs = 0
  if (conversationsResult.status === 'fulfilled') {
    for (const insight of conversationsResult.value.data) {
      threads += insight.ai_threads?.count ?? 0
      handoffs += insight.ai_handoffs?.count ?? 0
    }
  }
  const tools = toolsResult.status === 'fulfilled' ? toolsResult.value.data : []
  const toolCalls = tools.reduce((total, tool) => total + tool.thread_count, 0)
  const weightedMetric = (
    select: (tool: (typeof tools)[number]) => number | null | undefined,
  ) => {
    const measured = tools.filter((tool) => select(tool) != null)
    const weight = measured.reduce(
      (total, tool) => total + tool.thread_count,
      0,
    )
    if (weight === 0) return null
    return (
      measured.reduce(
        (total, tool) => total + (select(tool) ?? 0) * tool.thread_count,
        0,
      ) / weight
    )
  }

  return {
    period: {
      start: start.toISOString(),
      end: end.toISOString(),
      days,
    },
    messaging,
    agent: agentAvailable
      ? {
          threads,
          handoffs,
          handoffRate: threads > 0 ? handoffs / threads : null,
          toolCalls,
          toolSuccessRate: weightedMetric((tool) => tool.success_rate),
          averageToolLatencyMs: weightedMetric((tool) => tool.avg_latency_ms),
        }
      : null,
    unavailable: [
      ...(messagingResult.status === 'rejected'
        ? (['messaging'] as const)
        : []),
      ...(!agentAvailable ? (['agent'] as const) : []),
    ],
  }
}

export async function getMetaChannelQrCode(
  configuration: ChannelAgentConfiguration,
  request: typeof fetch = fetch,
): Promise<MessageQrCode | undefined> {
  try {
    const page = await createWhatsAppQrClient({
      accessToken: configuration.waSystemUserAccessToken,
      phoneNumberId: configuration.waPhoneNumberId,
      fetch: request,
    }).list({
      fields: ['prefilled_message', 'deep_link_url'],
      imageFormat: 'SVG',
      limit: 1,
    })
    return page.data[0]
  } catch (error) {
    if (error instanceof WhatsAppQrApiError) {
      throw new MetaChannelQrCodeError(
        `Meta rejected the QR code request: ${error.message}`,
        { cause: error },
      )
    }
    if (error instanceof WhatsAppQrResponseError) {
      throw new MetaChannelQrCodeError(
        'Meta returned an unexpected QR code response',
        { cause: error },
      )
    }
    throw new MetaChannelQrCodeError(
      'Could not reach the WhatsApp QR code API',
      { cause: error },
    )
  }
}

const MAX_QR_IMAGE_BYTES = 2 * 1_024 * 1_024

export async function downloadMetaChannelQrImage(
  imageUrl: string,
  request: typeof fetch = fetch,
): Promise<{
  body: ArrayBuffer
  contentType: 'image/png' | 'image/svg+xml'
}> {
  try {
    const url = new URL(imageUrl)
    if (url.protocol !== 'https:') {
      throw new Error('QR code image URL must use HTTPS')
    }
    const response = await request(url)
    if (!response.ok) {
      throw new Error(`QR code image returned HTTP ${response.status}`)
    }
    const contentType = response.headers
      .get('content-type')
      ?.split(';', 1)[0]
      ?.trim()
      .toLowerCase()
    if (contentType !== 'image/png' && contentType !== 'image/svg+xml') {
      throw new Error('QR code image has an unsupported content type')
    }
    const contentLength = Number(response.headers.get('content-length'))
    if (Number.isFinite(contentLength) && contentLength > MAX_QR_IMAGE_BYTES) {
      throw new Error('QR code image exceeds the size limit')
    }
    const body = await response.arrayBuffer()
    if (body.byteLength > MAX_QR_IMAGE_BYTES) {
      throw new Error('QR code image exceeds the size limit')
    }
    return { body, contentType }
  } catch (error) {
    if (error instanceof MetaChannelQrCodeError) throw error
    throw new MetaChannelQrCodeError(
      'Could not download the WhatsApp QR code image',
      { cause: error },
    )
  }
}

class MetaChannelQrCodeError extends Error {
  constructor(
    message: string,
    options?: ErrorOptions,
    readonly status = 502 as const,
  ) {
    super(message, options)
  }
}

export async function getMetaPhoneNumberRegistration(
  configuration: ChannelAgentConfiguration,
  request: typeof fetch = fetch,
): Promise<PhoneNumberInfo> {
  try {
    return await createWhatsAppRegistrationClient({
      accessToken: configuration.waSystemUserAccessToken,
      phoneNumberId: configuration.waPhoneNumberId,
      fetch: request,
    }).getPhoneNumber({
      fields: ['status', 'display_phone_number', 'verified_name'],
    })
  } catch (error) {
    throw mapMetaPhoneNumberRegistrationError(error, 'status lookup')
  }
}

export async function registerMetaPhoneNumber(
  configuration: ChannelAgentConfiguration,
  pin: string,
  request: typeof fetch = fetch,
): Promise<RegistrationSuccessResponse> {
  try {
    return await createWhatsAppRegistrationClient({
      accessToken: configuration.waSystemUserAccessToken,
      phoneNumberId: configuration.waPhoneNumberId,
      fetch: request,
    }).register({ pin })
  } catch (error) {
    throw mapMetaPhoneNumberRegistrationError(error, 'registration')
  }
}

export async function deregisterMetaPhoneNumber(
  configuration: ChannelAgentConfiguration,
  request: typeof fetch = fetch,
): Promise<RegistrationSuccessResponse> {
  try {
    return await createWhatsAppRegistrationClient({
      accessToken: configuration.waSystemUserAccessToken,
      phoneNumberId: configuration.waPhoneNumberId,
      fetch: request,
    }).deregister()
  } catch (error) {
    throw mapMetaPhoneNumberRegistrationError(error, 'deregistration')
  }
}

function getPhoneNumberRegistrationStatus(
  phoneNumber: PhoneNumberInfo,
): 'registered' | 'unregistered' {
  return phoneNumber.status?.toUpperCase() === 'CONNECTED'
    ? 'registered'
    : 'unregistered'
}

function mapMetaPhoneNumberRegistrationError(
  error: unknown,
  operation: string,
): MetaPhoneNumberRegistrationError {
  if (error instanceof WhatsAppRegistrationApiError) {
    return new MetaPhoneNumberRegistrationError(
      `Meta rejected the phone-number ${operation}: ${error.message}`,
      { cause: error },
    )
  }
  if (error instanceof WhatsAppRegistrationResponseError) {
    return new MetaPhoneNumberRegistrationError(
      `Meta returned an unexpected phone-number ${operation} response`,
      { cause: error },
    )
  }
  return new MetaPhoneNumberRegistrationError(
    'Could not reach the WhatsApp phone-number registration API',
    { cause: error },
  )
}

class MetaPhoneNumberRegistrationError extends Error {
  constructor(
    message: string,
    options?: ErrorOptions,
    readonly status = 502 as const,
  ) {
    super(message, options)
  }
}

export async function getMetaAgentEligibility(
  configuration: ChannelAgentConfiguration,
  request: typeof fetch = fetch,
): Promise<AgentEligibilityResponse> {
  try {
    return await createWhatsAppMbaClient({
      accessToken: configuration.waSystemUserAccessToken,
      phoneNumberId: configuration.waPhoneNumberId,
      fetch: request,
    }).getEligibility()
  } catch (error) {
    if (error instanceof WhatsAppMbaApiError) {
      throw new MetaAgentEligibilityError(
        `Meta rejected the agent eligibility request: ${error.message}`,
      )
    }
    if (error instanceof WhatsAppMbaResponseError) {
      throw new MetaAgentEligibilityError(
        'Meta returned an unexpected agent eligibility response',
      )
    }
    throw new MetaAgentEligibilityError(
      'Could not reach the Meta Business Agent API',
    )
  }
}

class MetaAgentEligibilityError extends Error {
  constructor(
    message: string,
    readonly status = 502 as const,
  ) {
    super(message)
  }
}

export async function getMetaAgentSettings(
  configuration: ChannelAgentConfiguration,
  request: typeof fetch = fetch,
): Promise<AgentSettings[]> {
  try {
    return await createWhatsAppMbaClient({
      accessToken: configuration.waSystemUserAccessToken,
      phoneNumberId: configuration.waPhoneNumberId,
      fetch: request,
    }).getSettings()
  } catch (error) {
    if (error instanceof WhatsAppMbaApiError) {
      throw new MetaAgentSettingsError(
        `Meta rejected the agent settings request: ${error.message}`,
        502,
        { cause: error },
      )
    }
    if (error instanceof WhatsAppMbaResponseError) {
      throw new MetaAgentSettingsError(
        'Meta returned an unexpected agent settings response',
        502,
        { cause: error },
      )
    }
    throw new MetaAgentSettingsError(
      'Could not reach the Meta Business Agent API',
      502,
      { cause: error },
    )
  }
}

class MetaAgentSettingsError extends Error {
  constructor(
    message: string,
    readonly status = 502 as const,
    options?: ErrorOptions,
  ) {
    super(message, options)
  }
}

export async function updateMetaAgentSettings(
  configuration: ChannelAgentConfiguration,
  input: AgentSettingsInput,
  request: typeof fetch = fetch,
): Promise<AgentSettings> {
  try {
    return await createWhatsAppMbaClient({
      accessToken: configuration.waSystemUserAccessToken,
      phoneNumberId: configuration.waPhoneNumberId,
      fetch: request,
    }).updateSettings(input)
  } catch (error) {
    if (error instanceof WhatsAppMbaApiError) {
      throw new MetaAgentSettingsError(
        `Meta rejected the agent settings update: ${error.message}`,
        502,
        { cause: error },
      )
    }
    if (error instanceof WhatsAppMbaResponseError) {
      throw new MetaAgentSettingsError(
        'Meta returned an unexpected agent settings response',
        502,
        { cause: error },
      )
    }
    throw new MetaAgentSettingsError(
      'Could not reach the Meta Business Agent API',
      502,
      { cause: error },
    )
  }
}

export async function listMetaAgentAllowlist(
  configuration: ChannelAgentConfiguration,
  request: typeof fetch = fetch,
): Promise<AllowlistEntry[]> {
  try {
    return await createWhatsAppMbaClient({
      accessToken: configuration.waSystemUserAccessToken,
      phoneNumberId: configuration.waPhoneNumberId,
      fetch: request,
    }).listAllowlist()
  } catch (error) {
    throwAgentAllowlistError(error, 'load')
  }
}

export async function addMetaAgentAllowlistEntry(
  configuration: ChannelAgentConfiguration,
  input: AllowlistEntryInput,
  request: typeof fetch = fetch,
): Promise<AllowlistEntry> {
  try {
    return await createWhatsAppMbaClient({
      accessToken: configuration.waSystemUserAccessToken,
      phoneNumberId: configuration.waPhoneNumberId,
      fetch: request,
    }).addAllowlistEntry(input)
  } catch (error) {
    throwAgentAllowlistError(error, 'update')
  }
}

export async function removeMetaAgentAllowlistEntry(
  configuration: ChannelAgentConfiguration,
  entryId: string,
  request: typeof fetch = fetch,
): Promise<void> {
  try {
    await createWhatsAppMbaClient({
      accessToken: configuration.waSystemUserAccessToken,
      phoneNumberId: configuration.waPhoneNumberId,
      fetch: request,
    }).removeAllowlistEntry(entryId)
  } catch (error) {
    throwAgentAllowlistError(error, 'update')
  }
}

function throwAgentAllowlistError(
  error: unknown,
  operation: 'load' | 'update',
): never {
  if (error instanceof WhatsAppMbaApiError) {
    throw new MetaAgentAllowlistError(
      `Meta rejected the agent allowlist ${operation}: ${error.message}`,
      502,
      { cause: error },
    )
  }
  if (error instanceof WhatsAppMbaResponseError) {
    throw new MetaAgentAllowlistError(
      'Meta returned an unexpected agent allowlist response',
      502,
      { cause: error },
    )
  }
  throw new MetaAgentAllowlistError(
    'Could not reach the Meta Business Agent API',
    502,
    { cause: error },
  )
}

class MetaAgentAllowlistError extends Error {
  constructor(
    message: string,
    readonly status = 502 as const,
    options?: ErrorOptions,
  ) {
    super(message, options)
  }
}

export async function getMetaAgentBusinessInfo(
  configuration: ChannelAgentConfiguration,
  request: typeof fetch = fetch,
): Promise<BusinessInfo> {
  try {
    return await createWhatsAppMbaClient({
      accessToken: configuration.waSystemUserAccessToken,
      phoneNumberId: configuration.waPhoneNumberId,
      fetch: request,
    }).getBusinessInfo()
  } catch (error) {
    throwAgentBusinessInfoError(error, 'load')
  }
}

export async function replaceMetaAgentBusinessInfo(
  configuration: ChannelAgentConfiguration,
  input: BusinessInfoInput,
  request: typeof fetch = fetch,
): Promise<BusinessInfo> {
  try {
    return await createWhatsAppMbaClient({
      accessToken: configuration.waSystemUserAccessToken,
      phoneNumberId: configuration.waPhoneNumberId,
      fetch: request,
    }).replaceBusinessInfo(input)
  } catch (error) {
    throwAgentBusinessInfoError(error, 'update')
  }
}

function throwAgentBusinessInfoError(
  error: unknown,
  operation: 'load' | 'update',
): never {
  if (error instanceof WhatsAppMbaApiError) {
    throw new MetaAgentBusinessInfoError(
      `Meta rejected the business information ${operation}: ${error.message}`,
      502,
      { cause: error },
    )
  }
  if (error instanceof WhatsAppMbaResponseError) {
    throw new MetaAgentBusinessInfoError(
      'Meta returned an unexpected business information response',
      502,
      { cause: error },
    )
  }
  throw new MetaAgentBusinessInfoError(
    'Could not reach the Meta Business Agent API',
    502,
    { cause: error },
  )
}

class MetaAgentBusinessInfoError extends Error {
  constructor(
    message: string,
    readonly status = 502 as const,
    options?: ErrorOptions,
  ) {
    super(message, options)
  }
}

const metaAgentConnectorsService: AgentConnectorsService = {
  list: (configuration) =>
    executeMetaConnectors(configuration, (client) => client.listConnectors()),
  get: (configuration, connectorId) =>
    executeMetaConnectors(configuration, (client) =>
      client.getConnector(connectorId),
    ),
  create: (configuration, input) =>
    executeMetaConnectors(configuration, (client) =>
      client.createConnector(input),
    ),
  update: (configuration, connectorId, input) =>
    executeMetaConnectors(configuration, (client) =>
      client.updateConnector(connectorId, input),
    ),
  delete: (configuration, connectorId) =>
    executeMetaConnectors(configuration, (client) =>
      client.deleteConnector(connectorId),
    ),
  logs: (configuration, connectorId) =>
    executeMetaConnectors(configuration, (client) =>
      client.getConnectorLogs(connectorId, {
        limit: 100,
        includeStats: true,
      }),
    ),
  listTools: (configuration, connectorId) =>
    executeMetaConnectors(configuration, (client) =>
      client.listConnectorTools(connectorId),
    ),
  createTool: (configuration, connectorId, input) =>
    executeMetaConnectors(configuration, (client) =>
      client.createConnectorTool(connectorId, input),
    ),
  updateTool: (configuration, connectorId, toolId, input) =>
    executeMetaConnectors(configuration, (client) =>
      client.updateConnectorTool(connectorId, toolId, input),
    ),
  deleteTool: (configuration, connectorId, toolId) =>
    executeMetaConnectors(configuration, (client) =>
      client.deleteConnectorTool(connectorId, toolId),
    ),
  refreshMcpTools: (configuration, connectorId) =>
    executeMetaConnectors(configuration, async (client) => {
      await client.refreshMcpTools(connectorId)
    }),
  upsertCertificate: (configuration, connectorId, input) =>
    executeMetaConnectors(configuration, async (client) => {
      await client.upsertConnectorCertificate(connectorId, input)
    }),
}

async function executeMetaConnectors<T>(
  configuration: ChannelAgentConfiguration,
  operation: (client: ReturnType<typeof createWhatsAppMbaClient>) => Promise<T>,
): Promise<T> {
  try {
    return await operation(
      createWhatsAppMbaClient({
        accessToken: configuration.waSystemUserAccessToken,
        phoneNumberId: configuration.waPhoneNumberId,
      }),
    )
  } catch (error) {
    if (error instanceof WhatsAppMbaApiError) {
      throw new MetaAgentConnectorsError(
        `Meta rejected the connector request: ${error.message}`,
        502,
        { cause: error },
      )
    }
    if (error instanceof WhatsAppMbaResponseError) {
      throw new MetaAgentConnectorsError(
        'Meta returned an unexpected connector response',
        502,
        { cause: error },
      )
    }
    throw new MetaAgentConnectorsError(
      'Could not reach the Meta Business Agent API',
      502,
      { cause: error },
    )
  }
}

class MetaAgentConnectorsError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 502 = 502,
    options?: ErrorOptions,
  ) {
    super(message, options)
  }
}

const metaAgentEvaluationsService: AgentEvaluationsService = {
  listCases: async (configuration) =>
    (
      await executeMetaEvaluations(configuration, (client) =>
        client.listEvaluationCases(),
      )
    ).eval_cases,
  run: (configuration, evalCaseIds) =>
    executeMetaEvaluations(configuration, (client) =>
      client.runEvaluation({ evalCaseIds }),
    ),
  getJob: (configuration, jobId) =>
    executeMetaEvaluations(configuration, (client) =>
      client.getEvaluationJob(jobId),
    ),
  getDetails: async (configuration, evalIds) =>
    (
      await executeMetaEvaluations(configuration, (client) =>
        client.getEvaluationDetails(evalIds),
      )
    ).evaluations,
  getSummaries: async (configuration, summaryIds) =>
    (
      await executeMetaEvaluations(configuration, (client) =>
        client.getEvaluationSummaries(summaryIds),
      )
    ).insights,
}

async function executeMetaEvaluations<T>(
  configuration: ChannelAgentConfiguration,
  operation: (client: ReturnType<typeof createWhatsAppMbaClient>) => Promise<T>,
): Promise<T> {
  try {
    return await operation(
      createWhatsAppMbaClient({
        accessToken: configuration.waSystemUserAccessToken,
        phoneNumberId: configuration.waPhoneNumberId,
      }),
    )
  } catch (error) {
    if (error instanceof WhatsAppMbaApiError) {
      throw new MetaAgentEvaluationsError(
        `Meta rejected the evaluation request: ${error.message}`,
      )
    }
    if (error instanceof WhatsAppMbaResponseError) {
      throw new MetaAgentEvaluationsError(
        'Meta returned an unexpected evaluation response',
      )
    }
    throw new MetaAgentEvaluationsError(
      'Could not reach the Meta Business Agent API',
    )
  }
}

class MetaAgentEvaluationsError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 502 = 502,
  ) {
    super(message)
  }
}

const metaAgentQrCodesService: AgentQrCodesService = {
  list: async (configuration) =>
    (
      await createWhatsAppQrClient({
        accessToken: configuration.waSystemUserAccessToken,
        phoneNumberId: configuration.waPhoneNumberId,
      }).list({ fields: ['prefilled_message'], limit: 100 })
    ).data,
  create: (configuration, prefilledMessage) =>
    createWhatsAppQrClient({
      accessToken: configuration.waSystemUserAccessToken,
      phoneNumberId: configuration.waPhoneNumberId,
    }).create({ prefilled_message: prefilledMessage }),
  delete: async (configuration, code) => {
    await createWhatsAppQrClient({
      accessToken: configuration.waSystemUserAccessToken,
      phoneNumberId: configuration.waPhoneNumberId,
    }).delete(code)
  },
}

const metaAgentComponentsService: AgentComponentsService = {
  get: (configuration) =>
    createWhatsAppComponentsClient({
      accessToken: configuration.waSystemUserAccessToken,
      phoneNumberId: configuration.waPhoneNumberId,
    }).getConfiguration(),
  set: async (configuration, input) => {
    await createWhatsAppComponentsClient({
      accessToken: configuration.waSystemUserAccessToken,
      phoneNumberId: configuration.waPhoneNumberId,
    }).setConfiguration(input)
  },
}

const metaAgentSkillsService: AgentSkillsService = {
  list: (configuration) =>
    executeMetaSkills(configuration, (client) => client.listSkills()),
  create: (configuration, input) =>
    executeMetaSkills(configuration, (client) => client.createSkill(input)),
  update: (configuration, skillId, input) =>
    executeMetaSkills(configuration, (client) =>
      client.updateSkill(skillId, input),
    ),
  delete: (configuration, skillId) =>
    executeMetaSkills(configuration, (client) => client.deleteSkill(skillId)),
}

async function executeMetaSkills<T>(
  configuration: ChannelAgentConfiguration,
  operation: (client: ReturnType<typeof createWhatsAppMbaClient>) => Promise<T>,
): Promise<T> {
  try {
    return await operation(
      createWhatsAppMbaClient({
        accessToken: configuration.waSystemUserAccessToken,
        phoneNumberId: configuration.waPhoneNumberId,
      }),
    )
  } catch (error) {
    if (error instanceof WhatsAppMbaApiError) {
      throw new MetaAgentSkillsError(
        `Meta rejected the agent-skill request: ${error.message}`,
        502,
        { cause: error },
      )
    }
    if (error instanceof WhatsAppMbaResponseError) {
      throw new MetaAgentSkillsError(
        'Meta returned an unexpected agent-skill response',
        502,
        { cause: error },
      )
    }
    throw new MetaAgentSkillsError(
      'Could not reach the Meta Business Agent API',
      502,
      { cause: error },
    )
  }
}

class MetaAgentSkillsError extends Error {
  constructor(
    message: string,
    readonly status = 502 as const,
    options?: ErrorOptions,
  ) {
    super(message, options)
  }
}

const metaAgentKnowledgeService: AgentKnowledgeService = {
  listFaqs: (configuration) =>
    executeMetaKnowledge(configuration, (client) => client.listFaqs()),
  createFaq: (configuration, input) =>
    executeMetaKnowledge(configuration, (client) => client.createFaq(input)),
  updateFaq: (configuration, faqId, input) =>
    executeMetaKnowledge(configuration, (client) =>
      client.updateFaq(faqId, input),
    ),
  deleteFaq: (configuration, faqId) =>
    executeMetaKnowledge(configuration, (client) => client.deleteFaq(faqId)),
  listWebsites: (configuration) =>
    executeMetaKnowledge(configuration, (client) =>
      client.listKnowledgeWebsites(),
    ),
  createWebsite: (configuration, input) =>
    executeMetaKnowledge(configuration, (client) =>
      client.createKnowledgeWebsite(input),
    ),
  updateWebsite: (configuration, websiteId, input) =>
    executeMetaKnowledge(configuration, (client) =>
      client.updateKnowledgeWebsite(websiteId, input),
    ),
  deleteWebsite: (configuration, websiteId) =>
    executeMetaKnowledge(configuration, (client) =>
      client.deleteKnowledgeWebsite(websiteId),
    ),
  listFiles: (configuration) =>
    executeMetaKnowledge(configuration, (client) =>
      client.listKnowledgeFiles(),
    ),
  uploadFile: (configuration, file) =>
    executeMetaKnowledge(configuration, (client) =>
      client.uploadKnowledgeFile({ file, fileName: file.name }),
    ),
  deleteFile: (configuration, fileId) =>
    executeMetaKnowledge(configuration, (client) =>
      client.deleteKnowledgeFile(fileId),
    ),
}

async function executeMetaKnowledge<T>(
  configuration: ChannelAgentConfiguration,
  operation: (client: ReturnType<typeof createWhatsAppMbaClient>) => Promise<T>,
): Promise<T> {
  try {
    return await operation(
      createWhatsAppMbaClient({
        accessToken: configuration.waSystemUserAccessToken,
        phoneNumberId: configuration.waPhoneNumberId,
      }),
    )
  } catch (error) {
    if (error instanceof WhatsAppMbaApiError) {
      throw new MetaAgentKnowledgeError(
        `Meta rejected the knowledge-base request: ${error.message}`,
        502,
        { cause: error },
      )
    }
    if (error instanceof WhatsAppMbaResponseError) {
      throw new MetaAgentKnowledgeError(
        'Meta returned an unexpected knowledge-base response',
        502,
        { cause: error },
      )
    }
    throw new MetaAgentKnowledgeError(
      'Could not reach the Meta Business Agent API',
      502,
      { cause: error },
    )
  }
}

class MetaAgentKnowledgeError extends Error {
  constructor(
    message: string,
    readonly status = 502 as const,
    options?: ErrorOptions,
  ) {
    super(message, options)
  }
}

function getAgentConfigurationStatus(
  settings: AgentSettings[],
): 'not_configured' | 'enabled' | 'disabled' {
  const configuration = settings[0]
  if (!configuration) return 'not_configured'
  return configuration.rollout.enabled ? 'enabled' : 'disabled'
}

function toAgentSettingsSummary(settings: AgentSettings) {
  return {
    agentId: settings.agent_id,
    rolloutEnabled: settings.rollout.enabled,
    audience: settings.ai_audience ?? 'EVERYONE',
    handoff: {
      enabled: settings.handoff?.enabled ?? false,
      messageSelection: settings.handoff?.message_selection ?? 'DEFAULT',
      message: settings.handoff?.message ?? '',
    },
    neverSayPhrases: settings.never_say_phrases ?? [],
  }
}

function toAgentSettingsInput(input: UpdateAgentSettingsInput) {
  return {
    ...(input.rolloutEnabled === undefined
      ? {}
      : { rollout: { enabled: input.rolloutEnabled } }),
    ...(input.audience === undefined ? {} : { ai_audience: input.audience }),
    ...(input.handoff === undefined
      ? {}
      : {
          handoff: {
            enabled: input.handoff.enabled,
            message_selection: input.handoff.messageSelection,
            ...(input.handoff.messageSelection === 'CUSTOM'
              ? { message: input.handoff.message }
              : {}),
          },
        }),
    ...(input.neverSayPhrases === undefined
      ? {}
      : { never_say_phrases: input.neverSayPhrases }),
  }
}

function toAgentAllowlistEntry(entry: AllowlistEntry) {
  return {
    id: entry.id,
    phoneNumber: entry.consumer_phone_number ?? null,
  }
}

function toAgentSkill(skill: AgentSkill) {
  return {
    id: skill.id,
    title: skill.title ?? '',
    description: skill.description ?? '',
    skill: skill.skill,
    channel: skill.channel,
    status: skill.status ?? null,
  }
}

function toAgentConnector(connector: Connector) {
  return {
    id: connector.id,
    name: connector.name,
    description: connector.description,
    baseUrl: connector.base_url,
    connectorProtocol: connector.connector_protocol ?? 'HTTP',
    authType: connector.auth_type,
    hasAuthConfiguration: Boolean(connector.auth_config),
    requiresCertificate: Boolean(connector.mtls_config),
    hasCertificate: connector.mtls_config?.has_certificate ?? false,
    connectionStatus: connector.connection_status.status,
    connectionError: connector.connection_status.error_message ?? null,
    userAuthInjectionConfig: connector.user_auth_injection_config
      ? {
          location: connector.user_auth_injection_config.location,
          fieldName: connector.user_auth_injection_config.field_name,
          prefix: connector.user_auth_injection_config.prefix,
        }
      : null,
    mcpToolSync: connector.mcp_tool_sync
      ? {
          status: connector.mcp_tool_sync.status,
          toolCount: connector.mcp_tool_sync.tool_count ?? null,
          lastAttemptedAt: connector.mcp_tool_sync.last_attempted_at ?? null,
          lastSuccessfulAt: connector.mcp_tool_sync.last_successful_at ?? null,
        }
      : null,
  }
}

function toMetaConnectorInput(
  input: z.infer<typeof connectorSchema>,
  fallbackAuthConfig?: ConnectorAuthConfig,
): ConnectorInput {
  let authConfig: ConnectorAuthConfig | undefined
  if (input.authType === 'API_KEY') {
    const apiKey = input.authConfig?.apiKey
    authConfig = apiKey
      ? {
          api_key: {
            headers: apiKey.headers.map(toMetaCredentialParam),
            query_params: apiKey.queryParams.map(toMetaCredentialParam),
            body_params: apiKey.bodyParams.map(toMetaCredentialParam),
          },
        }
      : fallbackAuthConfig?.api_key
        ? { api_key: fallbackAuthConfig.api_key }
        : undefined
  } else if (input.authType === 'OAUTH2_CLIENT_CREDENTIALS') {
    const oauth = input.authConfig?.oauth2ClientCredentials
    authConfig = oauth
      ? {
          oauth2_client_credentials: {
            token_url: oauth.tokenUrl,
            scopes_to_request: oauth.scopesToRequest,
            token_request_content_type: oauth.tokenRequestContentType,
            client_id: oauth.clientId,
            client_secret: oauth.clientSecret,
          },
        }
      : fallbackAuthConfig?.oauth2_client_credentials
        ? {
            oauth2_client_credentials:
              fallbackAuthConfig.oauth2_client_credentials,
          }
        : undefined
  }
  if (input.authType !== 'NONE' && !authConfig) {
    throw new MetaAgentConnectorsError(
      'Credentials are required when changing the connector authentication type',
      400,
    )
  }
  return {
    name: input.name,
    description: input.description,
    base_url: input.baseUrl,
    connector_protocol: input.connectorProtocol,
    auth_type: input.authType,
    ...(authConfig ? { auth_config: authConfig } : {}),
    ...(input.userAuthInjectionConfig
      ? {
          user_auth_injection_config: {
            location: input.userAuthInjectionConfig.location,
            field_name: input.userAuthInjectionConfig.fieldName,
            prefix: input.userAuthInjectionConfig.prefix,
          },
        }
      : {}),
    requires_certificate: input.requiresCertificate,
  }
}

function toMetaCredentialParam(input: {
  fieldName: string
  value: string
  prefix?: string
}) {
  return {
    field_name: input.fieldName,
    value: input.value,
    ...(input.prefix === undefined ? {} : { prefix: input.prefix }),
  }
}

function toAgentConnectorLog(log: ConnectorLogResponse['data'][number]) {
  return {
    eventTime: log.event_time ?? null,
    failureCodeName: log.failure_code_name ?? null,
    errorMessage: log.error_message ?? null,
    toolName: log.tool_name ?? null,
    occurrences: log.occurrences ?? null,
    lastSeen: log.last_seen ?? null,
  }
}

function toAgentConnectorTool(tool: ConnectorTool) {
  return {
    id: tool.id,
    name: tool.name,
    description: tool.description,
    requestDefinition: {
      method: tool.request_definition.method,
      path: tool.request_definition.path,
      pathParameters: tool.request_definition.path_parameters ?? {},
      queryParameters: tool.request_definition.query_parameters ?? {},
      headers: tool.request_definition.headers ?? {},
      body: tool.request_definition.body
        ? {
            contentType: tool.request_definition.body.content_type,
            params: tool.request_definition.body.params,
            required: tool.request_definition.body.required ?? [],
          }
        : null,
    },
    userAuthRequired: tool.user_auth_required,
    userAuthActionConfig: tool.user_auth_action_config
      ? {
          userActionToolType:
            tool.user_auth_action_config.user_action_tool_type,
          userAuthTokenPath: tool.user_auth_action_config.user_auth_token_path,
          refreshTokenPath:
            tool.user_auth_action_config.refresh_token_path ?? null,
          expiresAtPath: tool.user_auth_action_config.expires_at_path ?? null,
          expiresAtType: tool.user_auth_action_config.expires_at_type ?? null,
        }
      : null,
    transformationSpec: tool.transformation_spec ?? null,
  }
}

function toAgentEvaluationCase(evaluation: EvaluationCase) {
  return {
    id: evaluation.id,
    scenario: evaluation.scenario,
    scenarioVersion: evaluation.scenario_version ?? null,
    categories: evaluation.categories ?? [],
    maxTurns: evaluation.max_turns ?? null,
    successCriteria: evaluation.success_criteria ?? [],
  }
}

function toAgentEvaluationJob(job: EvaluationJob) {
  return {
    status: job.status,
    progress: job.progress
      ? {
          completed: job.progress.completed,
          total: job.progress.total,
          currentStage: job.progress.current_stage,
        }
      : null,
    result: job.result
      ? {
          id: job.result.summary_id,
          avgConversationScore: job.result.avg_conversation_score ?? null,
          avgTurnScore: job.result.avg_turn_score ?? null,
          summary: job.result.summary,
          highlights: job.result.highlights ?? null,
          topFailureCategories: job.result.top_failure_categories ?? null,
          evalIdsByScore: job.result.eval_ids_by_score ?? null,
          creationTime: job.result.creation_time,
          updateTime: job.result.update_time,
        }
      : null,
    error: job.error
      ? {
          code: job.error.code,
          message: job.error.message,
          failedCaseIds: job.error.failed_case_ids ?? [],
        }
      : null,
  }
}

function toAgentEvaluationDetail(evaluation: EvaluationDetail) {
  return {
    id: evaluation.id,
    score: evaluation.score ?? null,
    perTurnLabels: evaluation.per_turn_labels,
    reasons: evaluation.reasons,
    customSuccessCriteria: evaluation.custom_success_criteria ?? null,
    evalCaseId: evaluation.eval_case_id ?? null,
    transcript: evaluation.transcript ?? null,
    creationTime: evaluation.creation_time,
    updateTime: evaluation.update_time,
  }
}

function toAgentEvaluationSummary(summary: EvaluationSummary) {
  return {
    id: summary.id,
    avgConversationScore: summary.avg_conversation_score ?? null,
    avgTurnScore: summary.avg_turn_score ?? null,
    summary: summary.summary,
    highlights: summary.highlights ?? null,
    topFailureCategories: summary.top_failure_categories ?? null,
    evalIdsByScore: summary.eval_ids_by_score ?? null,
    creationTime: summary.creation_time,
    updateTime: summary.update_time,
  }
}

function parseEvaluationIds(value: string): string[] {
  const ids = value
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
  if (ids.length === 0 || ids.length > 100) {
    throw new MetaAgentEvaluationsError(
      'Between 1 and 100 evaluation IDs are required',
      400,
    )
  }
  return [...new Set(ids)]
}

function toMetaConnectorToolInput(
  input: z.infer<typeof connectorToolSchema>,
): ConnectorToolInput {
  return {
    name: input.name,
    description: input.description,
    request_definition: {
      method: input.requestDefinition.method,
      path: input.requestDefinition.path,
      path_parameters: input.requestDefinition.pathParameters,
      query_parameters: input.requestDefinition.queryParameters,
      headers: input.requestDefinition.headers,
      body: input.requestDefinition.body
        ? {
            content_type: input.requestDefinition.body.contentType,
            params: input.requestDefinition.body.params,
            required: input.requestDefinition.body.required,
          }
        : input.requestDefinition.body,
    },
    user_auth_required: input.userAuthRequired,
    user_auth_action_config: input.userAuthActionConfig
      ? {
          user_action_tool_type: input.userAuthActionConfig.userActionToolType,
          user_auth_token_path: input.userAuthActionConfig.userAuthTokenPath,
          refresh_token_path: input.userAuthActionConfig.refreshTokenPath,
          expires_at_path: input.userAuthActionConfig.expiresAtPath,
          expires_at_type: input.userAuthActionConfig.expiresAtType,
        }
      : undefined,
    transformation_spec: input.transformationSpec,
  }
}

function toAgentBusinessInfo(info: BusinessInfo) {
  return {
    businessDescription: info.business_description ?? '',
    paymentMethod: info.payment_method ?? '',
    purchaseInfo: info.purchase_info ?? '',
    deliveryAndShipping: info.delivery_and_shipping ?? '',
    returnPolicy: info.return_policy ?? '',
    contactEmail: info.contact_info?.email ?? '',
    hoursOfOperation: info.contact_info?.hours_of_operation ?? '',
    address: info.contact_info?.address ?? '',
  }
}

function toMetaBusinessInfo(
  info: z.infer<typeof businessInfoSchema>,
): BusinessInfoInput {
  return {
    business_description: info.businessDescription,
    payment_method: info.paymentMethod,
    purchase_info: info.purchaseInfo,
    delivery_and_shipping: info.deliveryAndShipping,
    return_policy: info.returnPolicy,
    contact_info: {
      email: info.contactEmail,
      hours_of_operation: info.hoursOfOperation,
      address: info.address,
    },
  }
}

function toFaq(faq: Faq) {
  return {
    id: faq.id,
    question: faq.question,
    answer: faq.answer,
    createdAt: faq.created_at ?? null,
  }
}

function toKnowledgeWebsite(website: KnowledgeWebsite) {
  return {
    id: website.id,
    url: website.url,
    includedSubDomains: website.included_sub_domains ?? [],
    includedUrlPatterns: website.included_url_patterns ?? [],
    excludedSubDomains: website.excluded_sub_domains ?? [],
    excludedUrlPatterns: website.excluded_url_patterns ?? [],
    singleUrls: website.single_urls ?? [],
    crawlStatus: website.crawl_status ?? null,
    crawlError: website.crawl_error ?? null,
    pagesCrawled: website.pages_crawled ?? null,
    lastCrawledAt: website.last_crawled_at ?? null,
  }
}

function toKnowledgeWebsiteInput(
  website: z.infer<typeof knowledgeWebsiteSchema>,
): KnowledgeWebsiteInput {
  return {
    url: website.url,
    included_sub_domains: website.includedSubDomains,
    included_url_patterns: website.includedUrlPatterns,
    excluded_sub_domains: website.excludedSubDomains,
    excluded_url_patterns: website.excludedUrlPatterns,
    single_urls: website.singleUrls,
  }
}

function toKnowledgeFile(file: KnowledgeFile) {
  return { id: file.id, fileName: file.file_name }
}

function fileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot < 0 ? '' : fileName.slice(dot).toLowerCase()
}

const agentExportProgressSteps = [
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
type AgentExportProgressStep = (typeof agentExportProgressSteps)[number]

interface BuildAgentExportOptions {
  organizationId: string
  channelId: number
  configuration: ChannelAgentConfiguration
  repository: ChannelManagementRepository
  getAgentSettings: NonNullable<
    ChannelManagementRouteOptions['getAgentSettings']
  >
  listAgentAllowlist: NonNullable<
    ChannelManagementRouteOptions['listAgentAllowlist']
  >
  getAgentBusinessInfo: NonNullable<
    ChannelManagementRouteOptions['getAgentBusinessInfo']
  >
  agentSkills: AgentSkillsService
  agentConnectors: AgentConnectorsService
  agentKnowledge: AgentKnowledgeService
  agentQrCodes: AgentQrCodesService
  agentComponents: AgentComponentsService
  knowledgeArchive: AgentKnowledgeArchive
  progress: (step: AgentExportProgressStep, position: number) => Promise<void>
}

interface BuiltAgentExport {
  archive: Uint8Array
  fileName: string
}

async function buildAgentExport({
  organizationId,
  channelId,
  configuration,
  repository,
  getAgentSettings,
  listAgentAllowlist,
  getAgentBusinessInfo,
  agentSkills,
  agentConnectors,
  agentKnowledge,
  agentQrCodes,
  agentComponents,
  knowledgeArchive,
  progress,
}: BuildAgentExportOptions): Promise<BuiltAgentExport> {
  await progress('settings', 1)
  const providerSettings = (await getAgentSettings(configuration))[0]
  if (!providerSettings) throw new Error('Agent is not configured')

  await progress('businessData', 2)
  const [channel, allowlistEntries, businessInfo] = await Promise.all([
    repository
      .list(organizationId)
      .then((items) => items.find((item) => item.id === channelId)),
    listAgentAllowlist(configuration),
    getAgentBusinessInfo(configuration),
  ])
  if (!channel) throw new Error('Channel not found')

  await progress('skills', 3)
  const skills = await agentSkills.list(configuration)

  await progress('channelComponents', 4)
  const [qrCodes, components] = await Promise.all([
    agentQrCodes.list(configuration),
    agentComponents.get(configuration),
  ])

  await progress('knowledge', 5)
  const [faqs, websites] = await Promise.all([
    agentKnowledge.listFaqs(configuration),
    agentKnowledge.listWebsites(configuration),
  ])

  await progress('files', 6)
  const providerFiles = await agentKnowledge.listFiles(configuration)
  const archivedFiles = await knowledgeArchive.getMany(
    organizationId,
    providerFiles.map((file) => file.id),
  )
  const archivedByProviderId = new Map(
    archivedFiles.map((file) => [file.providerFileId, file]),
  )
  const knowledgeFiles = providerFiles.map((file, position) => {
    const archived = archivedByProviderId.get(file.id)
    const included = archived?.body !== null && archived !== undefined
    return {
      providerFileId: file.id,
      fileName: file.file_name,
      path: included
        ? knowledgeFileArchivePath(position, file.file_name)
        : null,
      included,
      body: archived?.body ?? null,
    }
  })

  await progress('connectors', 7)
  const connectors = await agentConnectors.list(configuration)
  const localMcpAssociations = repository.listLocalMcpAssociations
    ? await repository.listLocalMcpAssociations(organizationId, channelId)
    : []
  const localMcpByConnectorId = new Map(
    localMcpAssociations.map((association) => [
      association.connectorId,
      {
        name: association.mcpName,
        path: `MCPs/${association.mcpId}-${association.mcpName}.mcpx`,
      },
    ]),
  )
  const connectorsWithTools = await Promise.all(
    connectors.map(async (connector) => {
      const exportedConnector = toAgentConnector(connector)
      const localMcp = localMcpByConnectorId.get(connector.id) ?? null
      return exportedConnector.connectorProtocol === 'MCP'
        ? { ...exportedConnector, localMcp }
        : {
            ...exportedConnector,
            localMcp,
            tools: (
              await agentConnectors.listTools(configuration, connector.id)
            ).map(toAgentConnectorTool),
          }
    }),
  )

  await progress('mcps', 8)
  const uniqueLocalMcps = [
    ...new Map(
      localMcpAssociations.map((association) => [
        association.mcpId,
        association,
      ]),
    ).values(),
  ]
  const mcpEntries = await Promise.all(
    uniqueLocalMcps.map(async (association) => {
      const exported = await runner.exportMcpPackage(
        organizationId,
        association.mcpId,
      )
      if (!exported) {
        throw new Error(`Local MCP not found: ${association.mcpName}`)
      }
      return {
        path: `MCPs/${association.mcpId}-${association.mcpName}.mcpx`,
        body: new TextEncoder().encode(stringifyRunnerMcpPackageYaml(exported)),
      }
    }),
  )

  await progress('packaging', 9)
  const exportedAt = new Date()
  const includedFileCount = knowledgeFiles.filter(
    (file) => file.included,
  ).length
  const missingFileCount = knowledgeFiles.length - includedFileCount
  const document = stringifyYaml({
    format: 'agtx',
    version: 1,
    exportedAt: exportedAt.toISOString(),
    source: {
      channel: {
        type: channel.type,
        phoneNumber: channel.waPhoneNumber,
        phoneNumberId: channel.waPhoneNumberId,
        wabaId: channel.waWabaId,
        businessId: channel.waBusinessId,
        appId: channel.waAppId,
      },
    },
    security: {
      connectorCredentialsIncluded: false,
      connectorCertificatesIncluded: false,
      knowledgeFiles: {
        total: knowledgeFiles.length,
        included: includedFileCount,
        missing: missingFileCount,
      },
    },
    importRequirements: {
      requestConnectorCredentials: connectors.some(
        (connector) =>
          connector.auth_type !== 'NONE' &&
          !localMcpByConnectorId.has(connector.id),
      ),
      requestConnectorCertificates: connectors.some((connector) =>
        Boolean(connector.mtls_config),
      ),
      requestMissingKnowledgeFiles: missingFileCount > 0,
    },
    agent: {
      settings: toAgentSettingsSummary(providerSettings),
      allowlist: allowlistEntries.map(toAgentAllowlistEntry),
      businessInfo: toAgentBusinessInfo(businessInfo),
      qrCodes: qrCodes
        .map((qrCode) => ({
          prefilledMessage: qrCode.prefilled_message ?? '',
        }))
        .filter((qrCode) => qrCode.prefilledMessage),
      components: {
        prompts: components.prompts ?? [],
        commands: (components.commands ?? []).map((command) => ({
          commandName: command.command_name,
          commandDescription: command.command_description,
        })),
      },
      skills: skills.map(toAgentSkill),
      knowledge: {
        faqs: faqs.map(toFaq),
        websites: websites.map(toKnowledgeWebsite),
        files: knowledgeFiles.map((file) => ({
          providerFileId: file.providerFileId,
          fileName: file.fileName,
          path: file.path,
          included: file.included,
        })),
      },
      connectors: connectorsWithTools,
    },
  })
  const archive = createAgentExportArchive(
    [
      {
        path: 'agent.yaml',
        body: new TextEncoder().encode(document),
      },
      ...knowledgeFiles.flatMap((file) =>
        file.path && file.body ? [{ path: file.path, body: file.body }] : [],
      ),
      ...mcpEntries,
    ],
    exportedAt,
  )
  const phone = channel.waPhoneNumber.replace(/\D/g, '')
  return {
    archive,
    fileName: `agent-${phone || channelId}.agtx`,
  }
}

interface ParsedAgentImportPackage {
  entries: ReadonlyMap<string, Uint8Array>
  form: FormData
  manifest: AgentImportManifest
  mcps: ReadonlyMap<string, RunnerMcpPackage>
}

interface PreparedAgentImport {
  files: File[]
  manifest: AgentImportManifest
  mcps: ReadonlyMap<string, RunnerMcpPackage>
  options: z.infer<typeof agentImportOptionsSchema>
  origin: string
}

async function readAgentImportPackage(
  request: Request,
): Promise<ParsedAgentImportPackage> {
  const declaredLength = Number(request.headers.get('content-length'))
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > maximumAgentImportBytes
  ) {
    throw new TypeError('AGTX package is too large')
  }
  const form = await request.formData()
  const multipartBytes = Array.from(form.values()).reduce(
    (total, value) =>
      total + (value instanceof File ? value.size : value.length),
    0,
  )
  if (multipartBytes > maximumAgentImportBytes) {
    throw new TypeError('Agent import payload is too large')
  }
  const packageFile = form.get('package')
  if (!(packageFile instanceof File)) {
    throw new TypeError('An AGTX package is required')
  }
  if (packageFile.size === 0 || packageFile.size > maximumAgentImportBytes) {
    throw new TypeError('AGTX package has an invalid size')
  }
  const archive = parseAgentArchive(
    new Uint8Array(await packageFile.arrayBuffer()),
  )
  const manifest = agentImportManifestSchema.parse(archive.manifest)
  const referencedPaths = new Set([
    ...manifest.agent.knowledge.files.flatMap((file) =>
      file.path ? [file.path] : [],
    ),
    ...manifest.agent.connectors.flatMap((connector) =>
      connector.localMcp ? [connector.localMcp.path] : [],
    ),
  ])
  for (const path of archive.entries.keys()) {
    if (path !== 'agent.yaml' && !referencedPaths.has(path)) {
      throw new TypeError(`AGTX contains an unreferenced file: ${path}`)
    }
  }
  const decoder = new TextDecoder('utf-8', { fatal: true })
  const mcps = new Map<string, RunnerMcpPackage>()
  const mcpPathByName = new Map<string, string>()
  for (const connector of manifest.agent.connectors) {
    if (!connector.localMcp) continue
    const body = archive.entries.get(connector.localMcp.path)
    if (!body) {
      throw new TypeError(`MCP package is missing: ${connector.localMcp.name}`)
    }
    const imported = parseRunnerMcpPackageYaml(decoder.decode(body))
    if (imported.mcp.name !== connector.localMcp.name) {
      throw new TypeError(
        `MCP package name does not match: ${connector.localMcp.name}`,
      )
    }
    const previousPath = mcpPathByName.get(imported.mcp.name)
    if (previousPath && connector.localMcp.path !== previousPath) {
      throw new TypeError(
        `MCP has conflicting package paths: ${imported.mcp.name}`,
      )
    }
    mcpPathByName.set(imported.mcp.name, connector.localMcp.path)
    mcps.set(imported.mcp.name, imported)
  }
  return { entries: archive.entries, form, manifest, mcps }
}

function getAgentImportRequirements(imported: ParsedAgentImportPackage) {
  return {
    files: imported.manifest.agent.knowledge.files
      .filter((file) => !file.path || !imported.entries.has(file.path))
      .map((file) => ({
        providerFileId: file.providerFileId,
        fileName: file.fileName,
      })),
    connectors: imported.manifest.agent.connectors
      .filter(
        (connector) =>
          !connector.localMcp &&
          (connector.authType !== 'NONE' || connector.requiresCertificate),
      )
      .map((connector) => ({
        name: connector.name,
        authType: connector.authType,
        requiresCertificate: connector.requiresCertificate,
      })),
  }
}

async function prepareAgentImport(
  request: Request,
): Promise<PreparedAgentImport> {
  const origin = new URL(request.url).origin
  const imported = await readAgentImportPackage(request)
  const rawOptions = imported.form.get('options')
  const options = agentImportOptionsSchema.parse(
    typeof rawOptions === 'string'
      ? JSON.parse(rawOptions)
      : {
          connectorCredentials: {},
        },
  )
  const requirements = getAgentImportRequirements(imported)
  const selected = new Set(options.components)

  for (const connector of selected.has('connectors')
    ? requirements.connectors
    : []) {
    const supplied = options.connectorCredentials[connector.name]
    if (connector.authType !== 'NONE' && !supplied?.authConfig) {
      throw new TypeError(`Credentials are required for ${connector.name}`)
    }
    if (connector.requiresCertificate && !supplied?.certificate) {
      throw new TypeError(`A certificate is required for ${connector.name}`)
    }
  }

  const files = (
    selected.has('files') ? imported.manifest.agent.knowledge.files : []
  ).map((descriptor) => {
    const archivedBody = descriptor.path
      ? imported.entries.get(descriptor.path)
      : undefined
    const supplied = imported.form.get(`file:${descriptor.providerFileId}`)
    if (!archivedBody && !(supplied instanceof File)) {
      throw new TypeError(`Knowledge file is required: ${descriptor.fileName}`)
    }
    const file = archivedBody
      ? new File([archivedBody.slice().buffer], descriptor.fileName)
      : new File([supplied as File], descriptor.fileName, {
          type: (supplied as File).type,
        })
    if (file.size === 0 || file.size > maximumKnowledgeFileBytes) {
      throw new TypeError(`Knowledge file has an invalid size: ${file.name}`)
    }
    if (!knowledgeFileExtensions.has(fileExtension(file.name))) {
      throw new TypeError(`Unsupported knowledge file type: ${file.name}`)
    }
    return file
  })

  for (const connector of selected.has('connectors')
    ? imported.manifest.agent.connectors
    : []) {
    const supplied = options.connectorCredentials[connector.name]
    createConnectorSchema.parse({
      name: connector.name,
      description: connector.description,
      baseUrl: connector.localMcp ? `${origin}/api/mcp/1` : connector.baseUrl,
      connectorProtocol: connector.localMcp
        ? 'MCP'
        : connector.connectorProtocol,
      authType: connector.localMcp ? 'API_KEY' : connector.authType,
      authConfig: connector.localMcp
        ? localMcpAuthConfig('placeholder')
        : supplied?.authConfig,
      userAuthInjectionConfig: connector.userAuthInjectionConfig ?? undefined,
      requiresCertificate: connector.requiresCertificate,
    })
  }

  return {
    files,
    manifest: imported.manifest,
    mcps: imported.mcps,
    options,
    origin,
  }
}

interface RunAgentImportProviderRequest {
  <T>(operation: () => Promise<T>): Promise<T>
  readonly log: AgentImportLog
  readonly retryBackoffMs: readonly number[]
}

type AgentImportConsistency<T> =
  { matches: true; value: T } | { matches: false }

const defaultAgentImportRetryBackoffMs = [500, 1_000, 2_000, 5_000, 10_000]

function createAgentImportProviderRequest(
  intervalMs: number,
  retryBackoffMs: readonly number[],
  log: AgentImportLog,
): RunAgentImportProviderRequest {
  const cadenceMs =
    Number.isFinite(intervalMs) && intervalMs >= 0 ? intervalMs : 500
  const normalizedRetryBackoffMs = retryBackoffMs.map((delay) =>
    Number.isFinite(delay) && delay >= 0 ? delay : 0,
  )
  let nextRequestAt = 0

  const run = async <T>(operation: () => Promise<T>): Promise<T> => {
    const scheduledAt = Math.max(Date.now(), nextRequestAt)
    nextRequestAt = scheduledAt + cadenceMs
    const waitMs = scheduledAt - Date.now()
    if (waitMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, waitMs))
    }
    return operation()
  }
  return Object.assign(run, {
    log,
    retryBackoffMs: normalizedRetryBackoffMs,
  })
}

async function runAgentImportRead<T>(
  label: string,
  runProviderRequest: RunAgentImportProviderRequest,
  operation: () => Promise<T>,
): Promise<T> {
  let lastError: unknown
  const maximumAttempts = runProviderRequest.retryBackoffMs.length + 1
  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    try {
      const result = await runProviderRequest(operation)
      runProviderRequest.log('read_succeeded', {
        label,
        attempt: attempt + 1,
        maximumAttempts,
      })
      return result
    } catch (error) {
      lastError = error
      const delayMs = runProviderRequest.retryBackoffMs[attempt]
      runProviderRequest.log(
        'read_failed',
        {
          label,
          attempt: attempt + 1,
          maximumAttempts,
          retryInMs: delayMs ?? null,
        },
        error,
      )
      if (delayMs !== undefined) await waitForAgentImportRetry(delayMs)
    }
  }
  runProviderRequest.log(
    'read_exhausted',
    { label, maximumAttempts },
    lastError,
  )
  throw new Error(
    `${label} failed after ${maximumAttempts} attempts: ${getAgentImportError(lastError)}`,
    { cause: lastError },
  )
}

async function runAgentImportMutation<T>(
  label: string,
  runProviderRequest: RunAgentImportProviderRequest,
  mutate: () => Promise<T>,
  verify: () => Promise<AgentImportConsistency<T>>,
): Promise<T> {
  let lastError: unknown
  const maximumAttempts = runProviderRequest.retryBackoffMs.length + 1
  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    try {
      const result = await runProviderRequest(mutate)
      runProviderRequest.log('mutation_succeeded', {
        label,
        attempt: attempt + 1,
        maximumAttempts,
      })
      return result
    } catch (error) {
      lastError = error
      runProviderRequest.log(
        'mutation_failed',
        {
          label,
          attempt: attempt + 1,
          maximumAttempts,
        },
        error,
      )
      let consistency: AgentImportConsistency<T>
      try {
        consistency = await runAgentImportRead(
          `${label} consistency check`,
          runProviderRequest,
          verify,
        )
      } catch (verificationError) {
        runProviderRequest.log(
          'consistency_check_failed',
          { label, attempt: attempt + 1, maximumAttempts },
          verificationError,
        )
        throw new Error(
          `${label} failed and its persisted state could not be verified`,
          {
            cause: new AggregateError(
              [error, verificationError],
              `${label} mutation and consistency check failed`,
            ),
          },
        )
      }
      if (consistency.matches) {
        runProviderRequest.log('mutation_verified', {
          label,
          attempt: attempt + 1,
          maximumAttempts,
          outcome: 'already_persisted',
        })
        return consistency.value
      }
      const delayMs = runProviderRequest.retryBackoffMs[attempt]
      runProviderRequest.log('mutation_retry_scheduled', {
        label,
        attempt: attempt + 1,
        maximumAttempts,
        retryInMs: delayMs ?? null,
      })
      if (delayMs !== undefined) await waitForAgentImportRetry(delayMs)
    }
  }
  runProviderRequest.log(
    'mutation_exhausted',
    { label, maximumAttempts },
    lastError,
  )
  throw new Error(
    `${label} did not reach the requested state after ${maximumAttempts} attempts: ${getAgentImportError(lastError)}`,
    { cause: lastError },
  )
}

async function waitForAgentImportRetry(delayMs: number): Promise<void> {
  if (delayMs <= 0) return
  await new Promise<void>((resolve) => setTimeout(resolve, delayMs))
}

function agentImportMatches<T>(value: T): AgentImportConsistency<T> {
  return { matches: true, value }
}

function agentImportDoesNotMatch<T>(): AgentImportConsistency<T> {
  return { matches: false }
}

function equalJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function agentSettingsMatch(
  current: AgentSettings,
  desired: AgentSettingsInput,
): boolean {
  if (desired.rollout && current.rollout.enabled !== desired.rollout.enabled) {
    return false
  }
  if (
    desired.ai_audience !== undefined &&
    current.ai_audience !== desired.ai_audience
  ) {
    return false
  }
  if (desired.handoff) {
    if (
      current.handoff?.enabled !== desired.handoff.enabled ||
      current.handoff.message_selection !== desired.handoff.message_selection ||
      (desired.handoff.message_selection === 'CUSTOM' &&
        current.handoff.message !== desired.handoff.message)
    ) {
      return false
    }
  }
  return (
    desired.never_say_phrases === undefined ||
    equalJson(current.never_say_phrases ?? [], desired.never_say_phrases)
  )
}

function businessInfoMatches(
  current: BusinessInfo,
  desired: BusinessInfoInput,
): boolean {
  return equalJson(toAgentBusinessInfo(current), {
    businessDescription: desired.business_description ?? '',
    paymentMethod: desired.payment_method ?? '',
    purchaseInfo: desired.purchase_info ?? '',
    deliveryAndShipping: desired.delivery_and_shipping ?? '',
    returnPolicy: desired.return_policy ?? '',
    contactEmail: desired.contact_info?.email ?? '',
    hoursOfOperation: desired.contact_info?.hours_of_operation ?? '',
    address: desired.contact_info?.address ?? '',
  })
}

function agentSkillMatches(
  current: AgentSkill,
  desired: AgentSkillInput,
): boolean {
  return (
    (desired.title === undefined || current.title === desired.title) &&
    (desired.description === undefined ||
      current.description === desired.description) &&
    (desired.skill === undefined || current.skill === desired.skill)
  )
}

function knowledgeWebsiteMatches(
  current: KnowledgeWebsite,
  desired: KnowledgeWebsiteInput,
): boolean {
  return equalJson(
    {
      url: current.url,
      includedSubDomains: current.included_sub_domains ?? [],
      includedUrlPatterns: current.included_url_patterns ?? [],
      excludedSubDomains: current.excluded_sub_domains ?? [],
      excludedUrlPatterns: current.excluded_url_patterns ?? [],
      singleUrls: current.single_urls ?? [],
    },
    {
      url: desired.url,
      includedSubDomains: desired.included_sub_domains ?? [],
      includedUrlPatterns: desired.included_url_patterns ?? [],
      excludedSubDomains: desired.excluded_sub_domains ?? [],
      excludedUrlPatterns: desired.excluded_url_patterns ?? [],
      singleUrls: desired.single_urls ?? [],
    },
  )
}

function connectorMatches(
  current: Connector,
  desired: ConnectorInput,
): boolean {
  return (
    current.name === desired.name &&
    current.description === desired.description &&
    current.base_url === desired.base_url &&
    (current.connector_protocol ?? 'HTTP') ===
      (desired.connector_protocol ?? 'HTTP') &&
    current.auth_type === desired.auth_type &&
    (desired.auth_type === 'NONE' || Boolean(current.auth_config)) &&
    equalJson(
      current.user_auth_injection_config ?? null,
      desired.user_auth_injection_config ?? null,
    )
  )
}

function connectorToolMatches(
  current: ConnectorTool,
  desired: ConnectorToolInput,
): boolean {
  const currentSummary = toAgentConnectorTool(current)
  const desiredSummary = toAgentConnectorTool({
    id: current.id,
    ...desired,
  })
  return equalJson(currentSummary, desiredSummary)
}

async function reconcileAllowlist(
  configuration: ChannelAgentConfiguration,
  desired: AgentImportManifest['agent']['allowlist'],
  list: NonNullable<ChannelManagementRouteOptions['listAgentAllowlist']>,
  add: NonNullable<ChannelManagementRouteOptions['addAgentAllowlistEntry']>,
  remove: NonNullable<
    ChannelManagementRouteOptions['removeAgentAllowlistEntry']
  >,
  runProviderRequest: RunAgentImportProviderRequest,
  reportProgress: AgentImportResourceProgress,
): Promise<void> {
  const desiredPhones = new Set(
    desired.flatMap((entry) => (entry.phoneNumber ? [entry.phoneNumber] : [])),
  )
  const current = await runAgentImportRead(
    'Allowlist listing',
    runProviderRequest,
    () => list(configuration),
  )
  const currentPhones = new Set(
    current.flatMap((entry) =>
      entry.consumer_phone_number ? [entry.consumer_phone_number] : [],
    ),
  )
  const removals = current.filter(
    (entry) =>
      !entry.consumer_phone_number ||
      !desiredPhones.has(entry.consumer_phone_number),
  )
  const additions = [...desiredPhones].filter(
    (phone) => !currentPhones.has(phone),
  )
  const operationTotal = removals.length + additions.length
  let completed = 0
  await reportProgress('allowlist', completed, operationTotal)
  for (const entry of removals) {
    await runAgentImportMutation(
      `Allowlist removal (${entry.consumer_phone_number ?? entry.id})`,
      runProviderRequest,
      () => remove(configuration, entry.id),
      async () => {
        const afterRemoval = await list(configuration)
        return afterRemoval.some((candidate) => candidate.id === entry.id)
          ? agentImportDoesNotMatch<void>()
          : agentImportMatches(undefined)
      },
    )
    completed += 1
    await reportProgress('allowlist', completed, operationTotal)
  }
  for (const phone of additions) {
    await runAgentImportMutation(
      `Allowlist addition (${phone})`,
      runProviderRequest,
      () => add(configuration, { consumer_phone_number: phone }),
      async () => {
        const afterAddition = await list(configuration)
        const matching = afterAddition.find(
          (entry) => entry.consumer_phone_number === phone,
        )
        return matching
          ? agentImportMatches(matching)
          : agentImportDoesNotMatch<AllowlistEntry>()
      },
    )
    completed += 1
    await reportProgress('allowlist', completed, operationTotal)
  }
}

async function reconcileSkills(
  configuration: ChannelAgentConfiguration,
  desired: AgentImportManifest['agent']['skills'],
  service: AgentSkillsService,
  runProviderRequest: RunAgentImportProviderRequest,
  reportProgress: AgentImportResourceProgress,
): Promise<void> {
  const current = await runAgentImportRead(
    'Agent skill listing',
    runProviderRequest,
    () => service.list(configuration),
  )
  const currentByTitle = new Map(
    current.flatMap((skill) =>
      skill.title ? [[skill.title, skill] as const] : [],
    ),
  )
  const desiredTitles = new Set(desired.map((skill) => skill.title))
  const removals = current.filter(
    (skill) => !skill.title || !desiredTitles.has(skill.title),
  )
  const operationTotal = desired.length + removals.length
  let completed = 0
  await reportProgress('skills', completed, operationTotal)
  for (const skill of desired) {
    const input = {
      title: skill.title,
      description: skill.description,
      skill: skill.skill,
    }
    const existing = currentByTitle.get(skill.title)
    if (existing) {
      await runAgentImportMutation(
        `Agent skill update (${skill.title})`,
        runProviderRequest,
        () => service.update(configuration, existing.id, input),
        async () => {
          const matching = (await service.list(configuration)).find(
            (candidate) => candidate.title === skill.title,
          )
          return matching && agentSkillMatches(matching, input)
            ? agentImportMatches(matching)
            : agentImportDoesNotMatch<AgentSkill>()
        },
      )
    } else {
      await runAgentImportMutation(
        `Agent skill creation (${skill.title})`,
        runProviderRequest,
        () => service.create(configuration, input),
        async () => {
          const matching = (await service.list(configuration)).find(
            (candidate) => candidate.title === skill.title,
          )
          return matching && agentSkillMatches(matching, input)
            ? agentImportMatches(matching)
            : agentImportDoesNotMatch<AgentSkill>()
        },
      )
    }
    completed += 1
    await reportProgress('skills', completed, operationTotal)
  }
  for (const skill of removals) {
    await runAgentImportMutation(
      `Agent skill deletion (${skill.title ?? skill.id})`,
      runProviderRequest,
      () => service.delete(configuration, skill.id),
      async () => {
        const afterDeletion = await service.list(configuration)
        return afterDeletion.some((candidate) => candidate.id === skill.id)
          ? agentImportDoesNotMatch<void>()
          : agentImportMatches(undefined)
      },
    )
    completed += 1
    await reportProgress('skills', completed, operationTotal)
  }
}

async function reconcileChannelComponents(
  configuration: ChannelAgentConfiguration,
  desiredQrCodes: AgentImportManifest['agent']['qrCodes'],
  desiredComponents: AgentImportManifest['agent']['components'],
  qrCodes: AgentQrCodesService,
  components: AgentComponentsService,
  runProviderRequest: RunAgentImportProviderRequest,
  reportProgress: AgentImportResourceProgress,
  includeQrCodes = true,
  includeComponents = true,
): Promise<void> {
  if (includeQrCodes) {
    const currentQrCodes = await runAgentImportRead(
      'QR code listing',
      runProviderRequest,
      () => qrCodes.list(configuration),
    )
    const qrOperationTotal = currentQrCodes.length + desiredQrCodes.length
    let completedQrOperations = 0
    await reportProgress('qrCodes', 0, qrOperationTotal)
    for (const qrCode of currentQrCodes) {
      await runAgentImportMutation(
        `QR code deletion (${qrCode.code})`,
        runProviderRequest,
        () => qrCodes.delete(configuration, qrCode.code),
        async () =>
          (await qrCodes.list(configuration)).some(
            (candidate) => candidate.code === qrCode.code,
          )
            ? agentImportDoesNotMatch<void>()
            : agentImportMatches(undefined),
      )
      completedQrOperations += 1
      await reportProgress('qrCodes', completedQrOperations, qrOperationTotal)
    }
    for (const desired of desiredQrCodes) {
      await runAgentImportMutation(
        `QR code creation (${desired.prefilledMessage})`,
        runProviderRequest,
        () => qrCodes.create(configuration, desired.prefilledMessage),
        async () => {
          const matching = (await qrCodes.list(configuration)).find(
            (candidate) =>
              candidate.prefilled_message === desired.prefilledMessage,
          )
          return matching
            ? agentImportMatches(matching)
            : agentImportDoesNotMatch<MessageQrCode>()
        },
      )
      completedQrOperations += 1
      await reportProgress('qrCodes', completedQrOperations, qrOperationTotal)
    }
  }

  if (includeComponents) {
    const desiredConfiguration: WriteConversationalComponentsInput = {
      prompts: desiredComponents.prompts,
      commands: desiredComponents.commands.map((command) => ({
        command_name: command.commandName,
        command_description: command.commandDescription,
      })),
    }
    await reportProgress('components', 0, 1)
    await runAgentImportMutation(
      'Conversational components update',
      runProviderRequest,
      () => components.set(configuration, desiredConfiguration),
      async () => {
        const current = await components.get(configuration)
        return equalJson(
          {
            prompts: current.prompts ?? [],
            commands: (current.commands ?? []).map((command) => ({
              command_name: command.command_name,
              command_description: command.command_description,
            })),
          },
          desiredConfiguration,
        )
          ? agentImportMatches(undefined)
          : agentImportDoesNotMatch<void>()
      },
    )
    await reportProgress('components', 1, 1)
  }
}

async function reconcileKnowledge(
  configuration: ChannelAgentConfiguration,
  desired: AgentImportManifest['agent']['knowledge'],
  service: AgentKnowledgeService,
  runProviderRequest: RunAgentImportProviderRequest,
  reportProgress: AgentImportResourceProgress,
  includeFaqs = true,
  includeWebsites = true,
): Promise<void> {
  if (includeFaqs) {
    const currentFaqs = await runAgentImportRead(
      'FAQ listing',
      runProviderRequest,
      () => service.listFaqs(configuration),
    )
    const currentFaqByQuestion = new Map(
      currentFaqs.map((faq) => [faq.question, faq]),
    )
    const desiredQuestions = new Set(desired.faqs.map((faq) => faq.question))
    const faqRemovals = currentFaqs.filter(
      (faq) => !desiredQuestions.has(faq.question),
    )
    const faqOperationTotal = desired.faqs.length + faqRemovals.length
    let completedFaqs = 0
    await reportProgress('faqs', completedFaqs, faqOperationTotal)
    for (const faq of desired.faqs) {
      const input = { question: faq.question, answer: faq.answer }
      const existing = currentFaqByQuestion.get(faq.question)
      if (existing) {
        await runAgentImportMutation(
          `FAQ update (${faq.question})`,
          runProviderRequest,
          () => service.updateFaq(configuration, existing.id, input),
          async () => {
            const matching = (await service.listFaqs(configuration)).find(
              (candidate) => candidate.question === faq.question,
            )
            return matching && matching.answer === faq.answer
              ? agentImportMatches(matching)
              : agentImportDoesNotMatch<Faq>()
          },
        )
      } else {
        await runAgentImportMutation(
          `FAQ creation (${faq.question})`,
          runProviderRequest,
          () => service.createFaq(configuration, input),
          async () => {
            const matching = (await service.listFaqs(configuration)).find(
              (candidate) => candidate.question === faq.question,
            )
            return matching && matching.answer === faq.answer
              ? agentImportMatches(matching)
              : agentImportDoesNotMatch<Faq>()
          },
        )
      }
      completedFaqs += 1
      await reportProgress('faqs', completedFaqs, faqOperationTotal)
    }
    for (const faq of faqRemovals) {
      await runAgentImportMutation(
        `FAQ deletion (${faq.question})`,
        runProviderRequest,
        () => service.deleteFaq(configuration, faq.id),
        async () => {
          const afterDeletion = await service.listFaqs(configuration)
          return afterDeletion.some((candidate) => candidate.id === faq.id)
            ? agentImportDoesNotMatch<void>()
            : agentImportMatches(undefined)
        },
      )
      completedFaqs += 1
      await reportProgress('faqs', completedFaqs, faqOperationTotal)
    }
  }

  if (includeWebsites) {
    const currentWebsites = await runAgentImportRead(
      'Knowledge website listing',
      runProviderRequest,
      () => service.listWebsites(configuration),
    )
    const currentWebsiteByUrl = new Map(
      currentWebsites.map((website) => [website.url, website]),
    )
    const desiredUrls = new Set(desired.websites.map((website) => website.url))
    const websiteRemovals = currentWebsites.filter(
      (website) => !desiredUrls.has(website.url),
    )
    const websiteOperationTotal =
      desired.websites.length + websiteRemovals.length
    let completedWebsites = 0
    await reportProgress('websites', completedWebsites, websiteOperationTotal)
    for (const website of desired.websites) {
      const input = toKnowledgeWebsiteInput(website)
      const existing = currentWebsiteByUrl.get(website.url)
      if (existing) {
        await runAgentImportMutation(
          `Knowledge website update (${website.url})`,
          runProviderRequest,
          () => service.updateWebsite(configuration, existing.id, input),
          async () => {
            const matching = (await service.listWebsites(configuration)).find(
              (candidate) => candidate.url === website.url,
            )
            return matching && knowledgeWebsiteMatches(matching, input)
              ? agentImportMatches(matching)
              : agentImportDoesNotMatch<KnowledgeWebsite>()
          },
        )
      } else {
        await runAgentImportMutation(
          `Knowledge website creation (${website.url})`,
          runProviderRequest,
          () => service.createWebsite(configuration, input),
          async () => {
            const matching = (await service.listWebsites(configuration)).find(
              (candidate) => candidate.url === website.url,
            )
            return matching && knowledgeWebsiteMatches(matching, input)
              ? agentImportMatches(matching)
              : agentImportDoesNotMatch<KnowledgeWebsite>()
          },
        )
      }
      completedWebsites += 1
      await reportProgress('websites', completedWebsites, websiteOperationTotal)
    }
    for (const website of websiteRemovals) {
      await runAgentImportMutation(
        `Knowledge website deletion (${website.url})`,
        runProviderRequest,
        () => service.deleteWebsite(configuration, website.id),
        async () => {
          const afterDeletion = await service.listWebsites(configuration)
          return afterDeletion.some((candidate) => candidate.id === website.id)
            ? agentImportDoesNotMatch<void>()
            : agentImportMatches(undefined)
        },
      )
      completedWebsites += 1
      await reportProgress('websites', completedWebsites, websiteOperationTotal)
    }
  }
}

async function importAgentMcps(
  organizationId: string,
  packages: ReadonlyMap<string, RunnerMcpPackage>,
  reportProgress: AgentImportResourceProgress,
): Promise<Map<string, RunnerMcpDefinition>> {
  const imported = new Map<string, RunnerMcpDefinition>()
  let completed = 0
  await reportProgress('mcps', completed, packages.size)
  for (const [name, mcpPackage] of packages) {
    const result = await runner.importMcpPackage(
      organizationId,
      mcpPackage,
      true,
    )
    if (result.status !== 'imported') {
      throw new Error(`Could not import local MCP: ${name}`)
    }
    imported.set(name, result.mcp)
    completed += 1
    await reportProgress('mcps', completed, packages.size)
  }
  return imported
}

async function replaceLocalMcpAssociation(
  organizationId: string,
  channelId: number,
  connectorId: string,
  mcpId: number,
  apiKeyId: number,
): Promise<void> {
  const existing = await db
    .select({
      connectorId: runnerAgentMcpConnectors.connectorId,
      mcpId: runnerAgentMcpConnectors.mcpId,
      apiKeyId: runnerAgentMcpConnectors.apiKeyId,
    })
    .from(runnerAgentMcpConnectors)
    .where(
      and(
        eq(runnerAgentMcpConnectors.organizationId, organizationId),
        eq(runnerAgentMcpConnectors.channelId, channelId),
      ),
    )
  for (const association of existing) {
    if (
      association.connectorId !== connectorId &&
      association.mcpId !== mcpId
    ) {
      continue
    }
    await db
      .delete(runnerAgentMcpConnectors)
      .where(
        and(
          eq(runnerAgentMcpConnectors.organizationId, organizationId),
          eq(runnerAgentMcpConnectors.channelId, channelId),
          eq(runnerAgentMcpConnectors.mcpId, association.mcpId),
        ),
      )
    if (association.apiKeyId !== apiKeyId) {
      await runner.revokeApiKey(organizationId, association.apiKeyId)
    }
  }
  await db.insert(runnerAgentMcpConnectors).values({
    organizationId,
    channelId,
    connectorId,
    mcpId,
    apiKeyId,
  })
}

async function reconcileConnectors(
  organizationId: string,
  channelId: number,
  origin: string,
  configuration: ChannelAgentConfiguration,
  desired: AgentImportManifest['agent']['connectors'],
  importedMcps: ReadonlyMap<string, RunnerMcpDefinition>,
  credentials: z.infer<typeof agentImportOptionsSchema>['connectorCredentials'],
  repository: ChannelManagementRepository,
  service: AgentConnectorsService,
  runProviderRequest: RunAgentImportProviderRequest,
  reportProgress: AgentImportResourceProgress,
): Promise<void> {
  const current = await runAgentImportRead(
    'Connector listing',
    runProviderRequest,
    () => service.list(configuration),
  )
  const currentByName = new Map(
    current.map((connector) => [connector.name, connector]),
  )
  const desiredNames = new Set(desired.map((connector) => connector.name))
  const removals = current.filter(
    (connector) => !desiredNames.has(connector.name),
  )
  const operationTotal = desired.length + removals.length
  let completed = 0
  await reportProgress('connectors', completed, operationTotal)

  for (const connector of desired) {
    const supplied = credentials[connector.name]
    const localMcp = connector.localMcp
      ? importedMcps.get(connector.localMcp.name)
      : undefined
    if (connector.localMcp && !localMcp) {
      throw new Error(`Imported MCP not found: ${connector.localMcp.name}`)
    }
    const localApiKey = localMcp
      ? await runner.createApiKey(organizationId, {
          name: `Agent connector: ${localMcp.name} (${channelId})`,
          expiresAt: addUtcYears(new Date(), 1),
          allowedFunctionIds: [],
          allowedMcpIds: [localMcp.id],
        })
      : undefined
    const parsedInput = createConnectorSchema.parse({
      name: connector.name,
      description: connector.description,
      baseUrl: localMcp
        ? `${origin}/api/mcp/${localMcp.id}`
        : connector.baseUrl,
      connectorProtocol: localMcp ? 'MCP' : connector.connectorProtocol,
      authType: localMcp ? 'API_KEY' : connector.authType,
      authConfig: localApiKey
        ? localMcpAuthConfig(localApiKey.apiKey)
        : supplied?.authConfig,
      userAuthInjectionConfig: connector.userAuthInjectionConfig ?? undefined,
      requiresCertificate: connector.requiresCertificate,
    })
    const connectorInput = toMetaConnectorInput(parsedInput)
    const existing = currentByName.get(connector.name)
    const imported = existing
      ? await runAgentImportMutation(
          `Connector update (${connector.name})`,
          runProviderRequest,
          () => service.update(configuration, existing.id, connectorInput),
          async () => {
            const currentConnector = await service.get(
              configuration,
              existing.id,
            )
            return connectorMatches(currentConnector, connectorInput)
              ? agentImportMatches(currentConnector)
              : agentImportDoesNotMatch<Connector>()
          },
        )
      : await runAgentImportMutation(
          `Connector creation (${connector.name})`,
          runProviderRequest,
          () => service.create(configuration, connectorInput),
          async () => {
            const matching = (await service.list(configuration)).find(
              (candidate) => candidate.name === connector.name,
            )
            return matching && connectorMatches(matching, connectorInput)
              ? agentImportMatches(matching)
              : agentImportDoesNotMatch<Connector>()
          },
        )

    if (localMcp && localApiKey) {
      await replaceLocalMcpAssociation(
        organizationId,
        channelId,
        imported.id,
        localMcp.id,
        localApiKey.id,
      )
    } else {
      const previousApiKeyId = await repository.removeLocalMcpAssociation(
        organizationId,
        channelId,
        imported.id,
      )
      if (previousApiKeyId) {
        await runner.revokeApiKey(organizationId, previousApiKeyId)
      }
    }

    if (connector.connectorProtocol === 'HTTP') {
      const currentTools = await runAgentImportRead(
        `Connector tool listing (${connector.name})`,
        runProviderRequest,
        () => service.listTools(configuration, imported.id),
      )
      const currentToolByName = new Map(
        currentTools.map((tool) => [tool.name, tool]),
      )
      const desiredToolNames = new Set(connector.tools.map((tool) => tool.name))
      for (const tool of connector.tools) {
        const input = toMetaConnectorToolInput({
          ...tool,
          userAuthActionConfig: tool.userAuthActionConfig ?? undefined,
        })
        const currentTool = currentToolByName.get(tool.name)
        if (currentTool) {
          await runAgentImportMutation(
            `Connector tool update (${connector.name}.${tool.name})`,
            runProviderRequest,
            () =>
              service.updateTool(
                configuration,
                imported.id,
                currentTool.id,
                input,
              ),
            async () => {
              const matching = (
                await service.listTools(configuration, imported.id)
              ).find((candidate) => candidate.name === tool.name)
              return matching && connectorToolMatches(matching, input)
                ? agentImportMatches(matching)
                : agentImportDoesNotMatch<ConnectorTool>()
            },
          )
        } else {
          await runAgentImportMutation(
            `Connector tool creation (${connector.name}.${tool.name})`,
            runProviderRequest,
            () => service.createTool(configuration, imported.id, input),
            async () => {
              const matching = (
                await service.listTools(configuration, imported.id)
              ).find((candidate) => candidate.name === tool.name)
              return matching && connectorToolMatches(matching, input)
                ? agentImportMatches(matching)
                : agentImportDoesNotMatch<ConnectorTool>()
            },
          )
        }
      }
      for (const tool of currentTools) {
        if (!desiredToolNames.has(tool.name)) {
          await runAgentImportMutation(
            `Connector tool deletion (${connector.name}.${tool.name})`,
            runProviderRequest,
            () => service.deleteTool(configuration, imported.id, tool.id),
            async () => {
              const afterDeletion = await service.listTools(
                configuration,
                imported.id,
              )
              return afterDeletion.some((candidate) => candidate.id === tool.id)
                ? agentImportDoesNotMatch<void>()
                : agentImportMatches(undefined)
            },
          )
        }
      }
    }

    if (connector.requiresCertificate && supplied?.certificate) {
      if (!service.upsertCertificate) {
        throw new Error('Connector certificate import is unavailable')
      }
      const upsertCertificate = service.upsertCertificate
      const certificate = supplied.certificate
      await runAgentImportMutation(
        `Connector certificate update (${connector.name})`,
        runProviderRequest,
        () =>
          upsertCertificate(configuration, imported.id, {
            client_certificate: certificate.clientCertificate,
            client_key: certificate.clientKey,
            ca_certificate: certificate.caCertificate,
          }),
        async () => {
          const currentConnector = await service.get(configuration, imported.id)
          return currentConnector.mtls_config?.has_certificate
            ? agentImportMatches(undefined)
            : agentImportDoesNotMatch<void>()
        },
      )
    }
    if (connector.connectorProtocol === 'MCP') {
      if (!service.refreshMcpTools) {
        throw new Error('MCP connector refresh is unavailable')
      }
      const refreshMcpTools = service.refreshMcpTools
      await runAgentImportMutation(
        `MCP connector tool refresh (${connector.name})`,
        runProviderRequest,
        () => refreshMcpTools(configuration, imported.id),
        async () => {
          const currentConnector = await service.get(configuration, imported.id)
          const status = currentConnector.mcp_tool_sync?.status
          return status === 'PENDING' || status === 'READY'
            ? agentImportMatches(undefined)
            : agentImportDoesNotMatch<void>()
        },
      )
    }
    completed += 1
    await reportProgress('connectors', completed, operationTotal)
  }
  for (const connector of removals) {
    await runAgentImportMutation(
      `Connector deletion (${connector.name})`,
      runProviderRequest,
      () => service.delete(configuration, connector.id),
      async () => {
        const afterDeletion = await service.list(configuration)
        return afterDeletion.some((candidate) => candidate.id === connector.id)
          ? agentImportDoesNotMatch<void>()
          : agentImportMatches(undefined)
      },
    )
    const apiKeyId = await repository.removeLocalMcpAssociation(
      organizationId,
      channelId,
      connector.id,
    )
    if (apiKeyId) {
      await runner.revokeApiKey(organizationId, apiKeyId)
    }
    completed += 1
    await reportProgress('connectors', completed, operationTotal)
  }
}

function getAgentImportError(error: unknown): string {
  if (error instanceof z.ZodError) {
    const issue = error.issues[0]
    const path = issue?.path.join('.')
    return `Agent import data is invalid${path ? ` at ${path}` : ''}${issue?.message ? `: ${issue.message}` : ''}`
  }
  if (error instanceof SyntaxError) return 'Import options are invalid'
  if (error instanceof Error) return error.message
  return 'AGTX package is invalid'
}

export async function onboardMetaAgent(
  configuration: ChannelAgentConfiguration,
  request: typeof fetch = fetch,
): Promise<OnboardAgentResponse> {
  try {
    return await createWhatsAppMbaClient({
      accessToken: configuration.waSystemUserAccessToken,
      phoneNumberId: configuration.waPhoneNumberId,
      fetch: request,
    }).onboard()
  } catch (error) {
    if (error instanceof WhatsAppMbaApiError) {
      throw new MetaAgentOnboardingError(
        `Meta rejected agent onboarding: ${error.message}`,
      )
    }
    if (error instanceof WhatsAppMbaResponseError) {
      throw new MetaAgentOnboardingError(
        'Meta returned an unexpected agent onboarding response',
      )
    }
    throw new MetaAgentOnboardingError(
      'Could not reach the Meta Business Agent API',
    )
  }
}

class MetaAgentOnboardingError extends Error {
  constructor(
    message: string,
    readonly status = 502 as const,
  ) {
    super(message)
  }
}

export async function deleteMetaAgent(
  configuration: ChannelAgentConfiguration,
  request: typeof fetch = fetch,
): Promise<DeleteAgentResponse> {
  try {
    return await createWhatsAppMbaClient({
      accessToken: configuration.waSystemUserAccessToken,
      phoneNumberId: configuration.waPhoneNumberId,
      fetch: request,
    }).deleteAgent()
  } catch (error) {
    if (error instanceof WhatsAppMbaApiError) {
      throw new MetaAgentDeletionError(
        `Meta rejected agent deletion: ${error.message}`,
      )
    }
    if (error instanceof WhatsAppMbaResponseError) {
      throw new MetaAgentDeletionError(
        'Meta returned an unexpected agent deletion response',
      )
    }
    throw new MetaAgentDeletionError(
      'Could not reach the Meta Business Agent API',
    )
  }
}

class MetaAgentDeletionError extends Error {
  constructor(
    message: string,
    readonly status = 502 as const,
  ) {
    super(message)
  }
}
