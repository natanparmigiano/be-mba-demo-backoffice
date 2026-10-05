import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import {
  MBA_WEBHOOK_SUBSCRIPTION_FIELDS,
  WhatsAppWebhookRegistrationApiError,
} from '@mba-demo/wa-subscriptions'
import { createAgentExportArchive } from '../agent-export.js'
import { parseAgentArchive } from '../agent-import.js'
import { parseRunnerMcpPackageYaml } from '../runner-mcp-package.js'
import { stringifyYaml } from '../yaml.js'
import {
  addMetaAgentAllowlistEntry,
  createChannelManagementRoute,
  deleteMetaAgent,
  getMetaAgentBusinessInfo,
  getMetaAgentEligibility,
  getMetaAgentSettings,
  listMetaAgentAllowlist,
  MetaWebhookRegistrationError,
  onboardMetaAgent,
  registerMetaWebhook,
  removeMetaAgentAllowlistEntry,
  replaceMetaAgentBusinessInfo,
  updateMetaAgentSettings,
} from './channels.js'
import type {
  AgentConnectorsService,
  AgentEvaluationsService,
  AgentKnowledgeService,
  AgentSkillsService,
  ChannelDashboardAnalytics,
  ChannelManagementRepository,
  ChannelSummary,
} from './channels.js'

const channel: ChannelSummary = {
  id: 7,
  type: 'whatsapp',
  name: 'Brazil support',
  waPhoneNumber: '+55 11 99999-0000',
  waPhoneNumberId: 'phone-id',
  waWabaId: 'waba-id',
  waBusinessId: 'business-id',
  waAppId: 'app-id',
  webhookForwardUrls: ['https://example.com/forward'],
  hasWaAppSecret: true,
  hasWaWebhookVerifyToken: true,
  hasWaSystemUserAccessToken: true,
  createdAt: '2026-09-30T00:00:00.000Z',
  updatedAt: '2026-09-30T00:00:00.000Z',
}

describe('channel management route', () => {
  it('lists only safe channel fields for the active organization', async () => {
    let listedOrganizationId: string | undefined
    const route = createChannelManagementRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository: createRepository({
        list: async (organizationId) => {
          listedOrganizationId = organizationId
          return [channel]
        },
      }),
    })

    const response = await route.request('/')
    const body: unknown = await response.json()

    assert.equal(response.status, 200)
    assert.equal(listedOrganizationId, 'org-one')
    assert.deepEqual(body, { channels: [channel] })
    assert.equal(JSON.stringify(body).includes('app-secret'), false)
    assert.equal(JSON.stringify(body).includes('access-token'), false)
  })

  it('returns tenant-scoped dashboard analytics without exposing credentials', async () => {
    let receivedDays: number | undefined
    const route = createChannelManagementRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository: createRepository(),
      getDashboardAnalytics: async (_configuration, days) => {
        receivedDays = days
        return {
          period: {
            start: '2026-09-24T00:00:00.000Z',
            end: '2026-10-01T00:00:00.000Z',
            days,
          },
          messaging: {
            sent: 120,
            delivered: 114,
            deliveryRate: 0.95,
            series: [],
          },
          agent: {
            threads: 32,
            handoffs: 4,
            handoffRate: 0.125,
            toolCalls: 18,
            toolSuccessRate: 0.9,
            averageToolLatencyMs: 240,
          },
          unavailable: [],
        }
      },
    })

    const response = await route.request('/7/dashboard?days=7')
    const body = (await response.json()) as ChannelDashboardAnalytics

    assert.equal(response.status, 200)
    assert.equal(receivedDays, 7)
    assert.ok(body.messaging)
    assert.equal(body.messaging.sent, 120)
    assert.equal(JSON.stringify(body).includes('access-secret'), false)
  })

  it('validates dashboard ranges before calling the provider', async () => {
    let called = false
    const route = createChannelManagementRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository: createRepository(),
      getDashboardAnalytics: async () => {
        called = true
        throw new Error('not reached')
      },
    })

    const response = await route.request('/7/dashboard?days=31')

    assert.equal(response.status, 400)
    assert.equal(called, false)
  })

  it('allows organization admins to create a scoped channel', async () => {
    let createdOrganizationId: string | undefined
    const repository = createRepository({
      create: async (organizationId) => {
        createdOrganizationId = organizationId
        return channel
      },
    })
    const route = createChannelManagementRoute({
      getAccess: async () => ({ organizationId: 'org-two', role: 'admin' }),
      repository,
    })

    const response = await route.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(createChannelInput()),
    })

    assert.equal(response.status, 201)
    assert.equal(createdOrganizationId, 'org-two')
  })

  it('requires a channel name when creating a channel', async () => {
    let createCalled = false
    const route = createChannelManagementRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'admin' }),
      repository: createRepository({
        create: async () => {
          createCalled = true
          return channel
        },
      }),
    })
    const inputWithoutName: Partial<ReturnType<typeof createChannelInput>> =
      createChannelInput()
    delete inputWithoutName.name

    const response = await route.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(inputWithoutName),
    })

    assert.equal(response.status, 400)
    assert.equal(createCalled, false)
  })

  it('prevents regular members from mutating channels', async () => {
    const route = createChannelManagementRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository: createRepository(),
    })

    const response = await route.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(createChannelInput()),
    })

    assert.equal(response.status, 403)
    assert.deepEqual(await response.json(), {
      message: 'Organization owner or admin required',
    })
  })

  it('only accepts HTTP and HTTPS forwarding URLs', async () => {
    let createCalled = false
    const route = createChannelManagementRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'admin' }),
      repository: createRepository({
        create: async () => {
          createCalled = true
          return channel
        },
      }),
    })

    const response = await route.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...createChannelInput(),
        webhookForwardUrls: ['ftp://example.com/webhook'],
      }),
    })

    assert.equal(response.status, 400)
    assert.equal(createCalled, false)
  })

  it('previews and manually deletes local channel data without calling Meta', async () => {
    let deletion:
      | { organizationId: string; channelId: number; confirmation: string }
      | undefined
    let metaDeleteCalled = false
    let deletedBackupPaths: readonly string[] = []
    const impact = { contacts: 12, groups: 3, messages: 480 }
    const route = createChannelManagementRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'owner' }),
      repository: createRepository({
        getDeletionPreview: async () => ({
          confirmationText: channel.waPhoneNumber,
          ...impact,
        }),
        delete: async (organizationId, channelId, confirmation) => {
          deletion = { organizationId, channelId, confirmation }
          return {
            status: 'deleted',
            impact,
            backupStoragePaths: ['agent-backups/org/7/backup.agtx'],
          }
        },
      }),
      agentBackups: {
        list: async () => [],
        create: async () => {
          throw new Error('not used')
        },
        getArchive: async () => null,
        deleteStoredFiles: async (paths) => {
          deletedBackupPaths = paths
        },
      },
      deleteAgent: async () => {
        metaDeleteCalled = true
        return {}
      },
    })

    const previewResponse = await route.request('/7/deletion-impact')
    const deleteResponse = await route.request('/7', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirmation: channel.waPhoneNumber }),
    })

    assert.equal(previewResponse.status, 200)
    assert.deepEqual(await previewResponse.json(), {
      impact: { confirmationText: channel.waPhoneNumber, ...impact },
    })
    assert.equal(deleteResponse.status, 200)
    assert.deepEqual(await deleteResponse.json(), {
      deleted: true,
      channelId: 7,
      impact,
    })
    assert.deepEqual(deletion, {
      organizationId: 'org-one',
      channelId: 7,
      confirmation: channel.waPhoneNumber,
    })
    assert.equal(metaDeleteCalled, false)
    assert.deepEqual(deletedBackupPaths, ['agent-backups/org/7/backup.agtx'])
  })

  it('blocks channel deletion previews while a local MCP is associated', async () => {
    const route = createChannelManagementRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'owner' }),
      repository: createRepository({
        hasLocalMcpAssociation: async () => true,
      }),
    })

    const response = await route.request('/7/deletion-impact')

    assert.equal(response.status, 409)
    assert.deepEqual(await response.json(), {
      code: 'CHANNEL_USED_BY_AGENT_MCP',
      message:
        'This channel cannot be deleted because an agent connector uses a local MCP.',
    })
  })

  it('requires manager access and matching confirmation to delete a channel', async () => {
    let deleteCalled = false
    const repository = createRepository({
      delete: async () => {
        deleteCalled = true
        return { status: 'confirmation_mismatch' }
      },
    })
    const memberRoute = createChannelManagementRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository,
    })
    const managerRoute = createChannelManagementRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'admin' }),
      repository,
    })

    const memberPreview = await memberRoute.request('/7/deletion-impact')
    const memberDelete = await memberRoute.request('/7', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirmation: channel.waPhoneNumber }),
    })
    assert.equal(memberPreview.status, 403)
    assert.equal(memberDelete.status, 403)
    assert.equal(deleteCalled, false)

    const mismatch = await managerRoute.request('/7', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirmation: 'wrong channel' }),
    })
    assert.equal(mismatch.status, 400)
    assert.deepEqual(await mismatch.json(), {
      message: 'Channel confirmation did not match',
    })
  })

  it('reveals a verify token only to organization managers', async () => {
    let requestedOrganizationId: string | undefined
    const repository = createRepository({
      getVerifyToken: async (organizationId) => {
        requestedOrganizationId = organizationId
        return 'verify-secret'
      },
    })
    const managerRoute = createChannelManagementRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'owner' }),
      repository,
    })
    const memberRoute = createChannelManagementRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository,
    })

    const managerResponse = await managerRoute.request('/7/verify-token')
    const memberResponse = await memberRoute.request('/7/verify-token')

    assert.equal(managerResponse.status, 200)
    assert.deepEqual(await managerResponse.json(), { token: 'verify-secret' })
    assert.equal(requestedOrganizationId, 'org-one')
    assert.equal(memberResponse.status, 403)
  })

  it('reports when a channel has no configured agent', async () => {
    let receivedPhoneNumberId: string | undefined
    const route = createChannelManagementRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository: createRepository(),
      getAgentSettings: async (configuration) => {
        receivedPhoneNumberId = configuration.waPhoneNumberId
        return []
      },
    })

    const response = await route.request('/7/agent-settings')

    assert.equal(response.status, 200)
    assert.equal(receivedPhoneNumberId, 'phone-id')
    assert.deepEqual(await response.json(), {
      status: 'not_configured',
      settings: null,
    })
  })

  it('reports when Meta returns a disabled agent configuration', async () => {
    const route = createChannelManagementRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository: createRepository(),
      getAgentSettings: async () => [
        {
          agent_id: 'agent-one',
          channel: 'whatsapp',
          rollout: { enabled: false },
        },
      ],
    })

    const response = await route.request('/7/agent-settings')

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {
      status: 'disabled',
      settings: {
        agentId: 'agent-one',
        rolloutEnabled: false,
        audience: 'EVERYONE',
        handoff: {
          enabled: false,
          messageSelection: 'DEFAULT',
          message: '',
        },
        neverSayPhrases: [],
      },
    })
  })

  it('reports when Meta returns an enabled agent configuration', async () => {
    const route = createChannelManagementRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository: createRepository(),
      getAgentSettings: async () => [
        {
          agent_id: 'agent-one',
          channel: 'whatsapp',
          rollout: { enabled: true },
          ai_audience: 'ALLOWLISTED_ONLY',
          handoff: {
            enabled: true,
            message_selection: 'CUSTOM',
            message: 'A teammate will join shortly.',
          },
          never_say_phrases: ['guaranteed delivery'],
        },
      ],
    })

    const response = await route.request('/7/agent-settings')

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {
      status: 'enabled',
      settings: {
        agentId: 'agent-one',
        rolloutEnabled: true,
        audience: 'ALLOWLISTED_ONLY',
        handoff: {
          enabled: true,
          messageSelection: 'CUSTOM',
          message: 'A teammate will join shortly.',
        },
        neverSayPhrases: ['guaranteed delivery'],
      },
    })
  })

  it('reads and manages phone-number registration for the owned channel', async () => {
    const calls: string[] = []
    let providerStatus = 'UNREGISTERED'
    const route = createChannelManagementRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'admin' }),
      repository: createRepository(),
      getPhoneNumberRegistration: async () => ({
        id: 'phone-id',
        status: providerStatus,
        display_phone_number: '+55 11 99999-0000',
        verified_name: 'Example Business',
      }),
      registerPhoneNumber: async (_configuration, pin) => {
        calls.push(`register:${pin}`)
        providerStatus = 'CONNECTED'
        return { success: true }
      },
      deregisterPhoneNumber: async () => {
        calls.push('deregister')
        providerStatus = 'UNREGISTERED'
        return { success: true }
      },
    })

    const before = await route.request('/7/registration')
    const invalid = await route.request(
      '/7/registration/register',
      jsonRequest('POST', { pin: '123' }),
    )
    const registered = await route.request(
      '/7/registration/register',
      jsonRequest('POST', { pin: '123456' }),
    )
    const afterRegistration = await route.request('/7/registration')
    const deregistered = await route.request('/7/registration/deregister', {
      method: 'POST',
    })

    assert.deepEqual(await before.json(), {
      status: 'unregistered',
      providerStatus: 'UNREGISTERED',
      displayPhoneNumber: '+55 11 99999-0000',
      verifiedName: 'Example Business',
    })
    assert.equal(invalid.status, 400)
    assert.equal(registered.status, 200)
    assert.deepEqual(await afterRegistration.json(), {
      status: 'registered',
      providerStatus: 'CONNECTED',
      displayPhoneNumber: '+55 11 99999-0000',
      verifiedName: 'Example Business',
    })
    assert.equal(deregistered.status, 200)
    assert.deepEqual(calls, ['register:123456', 'deregister'])
  })

  it('prevents regular members from changing phone-number registration', async () => {
    const route = createChannelManagementRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository: createRepository(),
    })

    const register = await route.request(
      '/7/registration/register',
      jsonRequest('POST', { pin: '123456' }),
    )
    const deregister = await route.request('/7/registration/deregister', {
      method: 'POST',
    })

    assert.equal(register.status, 403)
    assert.equal(deregister.status, 403)
  })

  it('returns the first Meta message QR code for an owned channel', async () => {
    let downloadedImageUrl: string | undefined
    const route = createChannelManagementRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository: createRepository(),
      getQrCode: async () => ({
        code: 'QR123',
        qr_image_url: 'https://cdn.example.com/qr.svg',
        deep_link_url: 'https://wa.me/message/QR123',
        prefilled_message: 'Tell me more',
      }),
      downloadQrImage: async (imageUrl) => {
        downloadedImageUrl = imageUrl
        return {
          body: new TextEncoder().encode('<svg />').buffer,
          contentType: 'image/svg+xml',
        }
      },
    })

    const response = await route.request('/7/qr-code')
    const imageResponse = await route.request('/7/qr-code/image')

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {
      qrCode: {
        code: 'QR123',
        imageUrl: '/api/channels/7/qr-code/image',
        deepLinkUrl: 'https://wa.me/message/QR123',
        prefilledMessage: 'Tell me more',
      },
    })
    assert.equal(imageResponse.status, 200)
    assert.equal(imageResponse.headers.get('content-type'), 'image/svg+xml')
    assert.equal(await imageResponse.text(), '<svg />')
    assert.equal(downloadedImageUrl, 'https://cdn.example.com/qr.svg')
  })

  it('streams an AGTX ZIP with YAML, available files, and missing-file metadata', async () => {
    const connector = {
      id: 'connector-one',
      name: 'orders_connector',
      description: 'Order service',
      base_url: 'https://orders.example.com',
      connector_protocol: 'HTTP' as const,
      auth_type: 'API_KEY' as const,
      auth_config: {
        api_key: {
          headers: [{ field_name: 'Authorization', value: 'secret-token' }],
        },
      },
      connection_status: { status: 'ACTIVE' as const },
    }
    const mcpConnector = {
      id: 'connector-mcp',
      name: 'dunder_mifflin_mcp',
      description: 'Dunder Mifflin MCP',
      base_url: 'https://mcp.example.com/api/mcp/1',
      connector_protocol: 'MCP' as const,
      auth_type: 'API_KEY' as const,
      auth_config: {
        api_key: {
          headers: [{ field_name: 'Authorization', value: 'mcp-secret' }],
        },
      },
      connection_status: { status: 'ACTIVE' as const },
      mcp_tool_sync: { status: 'READY' as const, tool_count: 6 },
    }
    const listedToolConnectorIds: string[] = []
    let storedBackup: Uint8Array | undefined
    const backup = {
      id: 19,
      channelId: 7,
      fileName: 'agent-5511999990000.agtx',
      byteSize: 123,
      createdAt: new Date('2026-10-01T18:00:00.000Z'),
    }
    const route = createChannelManagementRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'admin' }),
      repository: createRepository({ list: async () => [channel] }),
      agentBackups: {
        list: async (organizationId, channelId) => {
          assert.equal(organizationId, 'org-one')
          assert.equal(channelId, 7)
          return [backup]
        },
        create: async (organizationId, channelId, fileName, archive) => {
          assert.equal(organizationId, 'org-one')
          assert.equal(channelId, 7)
          assert.equal(fileName, 'agent-5511999990000.agtx')
          storedBackup = archive
          return { ...backup, byteSize: archive.byteLength }
        },
        getArchive: async (organizationId, channelId, backupId) => {
          assert.equal(organizationId, 'org-one')
          assert.equal(channelId, 7)
          assert.equal(backupId, backup.id)
          return storedBackup
            ? {
                backup: { ...backup, byteSize: storedBackup.byteLength },
                archive: storedBackup,
              }
            : null
        },
        deleteStoredFiles: async () => undefined,
      },
      getAgentSettings: async () => [
        {
          agent_id: 'agent-one',
          channel: 'whatsapp',
          rollout: { enabled: true },
          ai_audience: 'ALLOWLISTED_ONLY',
          never_say_phrases: ['promise delivery'],
        },
      ],
      listAgentAllowlist: async () => [
        { id: 'allow-one', consumer_phone_number: '+5511999990000' },
      ],
      getAgentBusinessInfo: async () => ({
        business_description: 'A portable business',
      }),
      agentSkills: {
        list: async () => [
          {
            id: 'skill-one',
            title: 'order-status',
            description: 'Checks orders',
            skill: 'Look up the current order state.',
            channel: 'whatsapp',
          },
        ],
        create: async () => {
          throw new Error('not used')
        },
        update: async () => {
          throw new Error('not used')
        },
        delete: async () => undefined,
      },
      agentConnectors: {
        list: async () => [connector, mcpConnector],
        get: async () => connector,
        create: async () => connector,
        update: async () => connector,
        delete: async () => undefined,
        logs: async () => ({ data: [] }),
        listTools: async (_configuration, connectorId) => {
          listedToolConnectorIds.push(connectorId)
          return [
            {
              id: 'tool-one',
              name: 'get_order',
              description: 'Gets an order',
              request_definition: { method: 'GET', path: '/orders/{id}' },
              user_auth_required: false,
            },
          ]
        },
        createTool: async () => {
          throw new Error('not used')
        },
        updateTool: async () => {
          throw new Error('not used')
        },
        deleteTool: async () => undefined,
      },
      agentEvaluations: {
        listCases: async () => {
          throw new Error('Evaluation cases must not be exported')
        },
        run: async () => ({ job_id: 'unused', status: 'QUEUED' }),
        getJob: async () => ({ status: 'RUNNING' }),
        getDetails: async () => [],
        getSummaries: async () => [],
      },
      agentKnowledge: {
        listFaqs: async () => [
          { id: 'faq-one', question: 'Where?', answer: 'Here.' },
        ],
        createFaq: async () => {
          throw new Error('not used')
        },
        updateFaq: async () => {
          throw new Error('not used')
        },
        deleteFaq: async () => undefined,
        listWebsites: async () => [
          { id: 'site-one', url: 'https://example.com' },
        ],
        createWebsite: async () => {
          throw new Error('not used')
        },
        updateWebsite: async () => {
          throw new Error('not used')
        },
        deleteWebsite: async () => undefined,
        listFiles: async () => [
          { id: 'file-one', file_name: 'guide.pdf' },
          { id: 'file-two', file_name: 'external.txt' },
        ],
        uploadFile: async () => {
          throw new Error('not used')
        },
        deleteFile: async () => undefined,
      },
      agentQrCodes: {
        list: async () => [
          { code: 'sample-qr', prefilled_message: 'Help me choose paper' },
        ],
        create: async () => {
          throw new Error('not used')
        },
        delete: async () => undefined,
      },
      agentComponents: {
        get: async () => ({
          prompts: ['Help me choose paper'],
          commands: [
            {
              command_name: 'human',
              command_description: 'Talk to a paper specialist',
            },
          ],
        }),
        set: async () => undefined,
      },
      knowledgeArchive: {
        put: async () => undefined,
        getMany: async (organizationId, providerFileIds) => {
          assert.equal(organizationId, 'org-one')
          assert.deepEqual(providerFileIds, ['file-one', 'file-two'])
          return [
            {
              providerFileId: 'file-one',
              body: new TextEncoder().encode('PDF bytes'),
              contentType: 'application/pdf',
              storagePath: 'agent-knowledge/file-one.pdf',
            },
            { providerFileId: 'file-two', body: null },
          ]
        },
        delete: async () => undefined,
      },
    })

    const response = await route.request('/7/agent-export')
    const stream = await response.text()
    const complete = JSON.parse(readSseData(stream, 'complete')) as {
      fileName: string
      byteSize: number
      chunkCount: number
    }
    const archive = decodeSseArchive(stream)
    const entries = readStoredZipEntries(archive)
    const document = new TextDecoder().decode(entries.get('agent.yaml'))
    const exportedManifest = parseAgentArchive(archive).manifest as {
      agent: {
        connectors: Array<{
          name: string
          tools?: unknown[]
        }>
      }
    }
    const exportedMcp = exportedManifest.agent.connectors.find(
      ({ name }) => name === 'dunder_mifflin_mcp',
    )

    assert.equal(response.status, 200)
    assert.match(
      response.headers.get('content-type') ?? '',
      /^text\/event-stream/,
    )
    assert.equal(complete.fileName, 'agent-5511999990000.agtx')
    assert.equal(complete.byteSize, archive.byteLength)
    assert.equal(
      complete.chunkCount,
      readSseDataAll(stream, 'archive-chunk').length,
    )
    assert.match(document, /^format: "agtx"\nversion: 1\n/)
    assert.match(document, /included: 1/)
    assert.match(document, /missing: 1/)
    assert.match(document, /requestMissingKnowledgeFiles: true/)
    assert.match(document, /providerFileId: "file-one"/)
    assert.match(document, /path: "files\/001-guide.pdf"/)
    assert.match(document, /providerFileId: "file-two"[\s\S]*?path: null/)
    assert.match(document, /name: "get_order"/)
    assert.deepEqual(listedToolConnectorIds, ['connector-one'])
    assert.equal(Object.hasOwn(exportedMcp ?? {}, 'tools'), false)
    assert.equal(document.includes('secret-token'), false)
    assert.equal(document.includes('mcp-secret'), false)
    assert.equal(
      new TextDecoder().decode(entries.get('files/001-guide.pdf')),
      'PDF bytes',
    )
    assert.equal(entries.has('files/002-external.txt'), false)
    assert.deepEqual(
      Array.from(stream.matchAll(/"step":"([^"]+)"/g), (match) => match[1]),
      [
        'settings',
        'businessData',
        'skills',
        'channelComponents',
        'knowledge',
        'files',
        'connectors',
        'mcps',
        'packaging',
      ],
    )

    const listResponse = await route.request('/7/agent-backups')
    assert.equal(listResponse.status, 200)
    assert.deepEqual(await listResponse.json(), {
      backups: [{ ...backup, createdAt: backup.createdAt.toISOString() }],
    })

    const backupResponse = await route.request('/7/agent-backups', {
      method: 'POST',
    })
    const backupStream = await backupResponse.text()
    assert.equal(backupResponse.status, 200)
    const savedBackup = storedBackup
    assert.ok(savedBackup)
    assert.doesNotThrow(() => parseAgentArchive(savedBackup))
    assert.deepEqual(
      Array.from(
        backupStream.matchAll(/"step":"([^"]+)"/g),
        (match) => match[1],
      ),
      [
        'settings',
        'businessData',
        'skills',
        'channelComponents',
        'knowledge',
        'files',
        'connectors',
        'mcps',
        'packaging',
      ],
    )
    assert.equal(
      (
        JSON.parse(readSseData(backupStream, 'complete')) as {
          backup: { id: number }
        }
      ).backup.id,
      backup.id,
    )

    const restoreResponse = await route.request(
      `/7/agent-backups/${backup.id}/archive`,
    )
    assert.equal(restoreResponse.status, 200)
    assert.equal(
      restoreResponse.headers.get('content-type'),
      'application/vnd.mba.agent+zip',
    )
    assert.match(
      restoreResponse.headers.get('content-disposition') ?? '',
      /agent-5511999990000\.agtx/,
    )
    assert.deepEqual(
      new Uint8Array(await restoreResponse.arrayBuffer()),
      savedBackup,
    )
  })

  it('inspects and imports an AGTX package through progress SSE', async () => {
    const calls: string[] = []
    const importLogs: Array<{
      event: string
      details: Record<string, unknown>
      hasError: boolean
    }> = []
    const importedAllowlist: Array<{
      id: string
      consumer_phone_number: string
    }> = []
    let allowlistAddAttempts = 0
    let businessAttempts = 0
    let destinationRolloutEnabled = false
    const importedQrCodes: Array<{
      code: string
      prefilled_message: string
    }> = []
    let importedComponents = {
      prompts: [] as string[],
      commands: [] as Array<{
        command_name: string
        command_description: string
      }>,
    }
    const packageFile = createImportPackage()
    const route = createChannelManagementRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'admin' }),
      repository: createRepository({ list: async () => [channel] }),
      agentImportRequestIntervalMs: 0,
      agentImportRetryBackoffMs: [0, 0, 0, 0, 0],
      reportImportLog: (event, details, error) => {
        importLogs.push({ event, details, hasError: error !== undefined })
      },
      getAgentSettings: async () => [
        {
          agent_id: 'agent-target',
          channel: 'whatsapp',
          rollout: { enabled: destinationRolloutEnabled },
        },
      ],
      agentBackups: {
        list: async () => [],
        create: async (_organizationId, _channelId, fileName, archive) => {
          calls.push('backup')
          return {
            id: 1,
            channelId: 7,
            fileName,
            byteSize: archive.byteLength,
            createdAt: new Date('2026-10-01T18:00:00.000Z'),
          }
        },
        getArchive: async () => null,
        deleteStoredFiles: async () => undefined,
      },
      updateAgentSettings: async (_configuration, input) => {
        calls.push(`settings:${input.rollout?.enabled}`)
        destinationRolloutEnabled =
          input.rollout?.enabled ?? destinationRolloutEnabled
        return {
          agent_id: 'agent-target',
          channel: 'whatsapp',
          rollout: input.rollout ?? { enabled: false },
        }
      },
      listAgentAllowlist: async () => importedAllowlist,
      addAgentAllowlistEntry: async (_configuration, input) => {
        allowlistAddAttempts += 1
        calls.push(`allowlist:${input.consumer_phone_number}`)
        importedAllowlist.push({ id: 'allow-new', ...input })
        throw new Error('Meta response was lost after persisting allowlist')
      },
      removeAgentAllowlistEntry: async () => undefined,
      getAgentBusinessInfo: async () => ({
        business_description: 'Previous business profile',
      }),
      replaceAgentBusinessInfo: async (_configuration, input) => {
        businessAttempts += 1
        if (businessAttempts === 1) {
          throw new Error('Temporary Meta business information failure')
        }
        calls.push(`business:${input.business_description}`)
        return { ...input, imported: true }
      },
      agentSkills: {
        list: async () => [],
        create: async (_configuration, input) => {
          calls.push(`skill:${input.title}`)
          return {
            id: 'skill-new',
            skill: input.skill ?? '',
            title: input.title,
            description: input.description,
            channel: 'whatsapp',
          }
        },
        update: async () => {
          throw new Error('not used')
        },
        delete: async () => undefined,
      },
      agentKnowledge: {
        listFaqs: async () => [],
        createFaq: async (_configuration, input) => {
          calls.push(`faq:${input.question}`)
          return { id: 'faq-new', ...input }
        },
        updateFaq: async () => {
          throw new Error('not used')
        },
        deleteFaq: async () => undefined,
        listWebsites: async () => [],
        createWebsite: async (_configuration, input) => {
          calls.push(`website:${input.url}`)
          return { id: 'site-new', ...input }
        },
        updateWebsite: async () => {
          throw new Error('not used')
        },
        deleteWebsite: async () => undefined,
        listFiles: async () => [],
        uploadFile: async (_configuration, file) => {
          calls.push(`file:${file.name}:${file.size}`)
          return { id: 'file-new', file_name: file.name }
        },
        deleteFile: async () => undefined,
      },
      agentQrCodes: {
        list: async () => importedQrCodes,
        create: async (_configuration, prefilledMessage) => {
          const created = {
            code: `qr-${importedQrCodes.length + 1}`,
            prefilled_message: prefilledMessage,
          }
          importedQrCodes.push(created)
          calls.push(`qr:${prefilledMessage}`)
          return created
        },
        delete: async (_configuration, code) => {
          const index = importedQrCodes.findIndex((item) => item.code === code)
          if (index >= 0) importedQrCodes.splice(index, 1)
        },
      },
      agentComponents: {
        get: async () => importedComponents,
        set: async (_configuration, input) => {
          importedComponents = {
            prompts: input.prompts ?? [],
            commands: input.commands ?? [],
          }
          calls.push('components')
        },
      },
      knowledgeArchive: {
        put: async (_organizationId, _channelId, providerFile) => {
          calls.push(`archive:${providerFile.id}`)
        },
        getMany: async () => [],
        delete: async () => undefined,
      },
      agentConnectors: {
        list: async () => [],
        get: async () => {
          throw new Error('not used')
        },
        create: async (_configuration, input) => {
          calls.push(`connector:${input.name}`)
          return {
            id: 'connector-new',
            ...input,
            connection_status: { status: 'ACTIVE' },
          }
        },
        update: async () => {
          throw new Error('not used')
        },
        delete: async () => undefined,
        logs: async () => ({ data: [] }),
        listTools: async () => [],
        createTool: async (_configuration, _connectorId, input) => {
          calls.push(`tool:${input.name}`)
          return { id: 'tool-new', ...input }
        },
        updateTool: async () => {
          throw new Error('not used')
        },
        deleteTool: async () => undefined,
        refreshMcpTools: async (_configuration, connectorId) => {
          calls.push(`refresh:${connectorId}`)
        },
      },
      agentEvaluations: {
        listCases: async () => {
          throw new Error('Evaluation cases must not be imported')
        },
        run: async () => ({ job_id: 'unused', status: 'QUEUED' }),
        getJob: async () => ({ status: 'RUNNING' }),
        getDetails: async () => [],
        getSummaries: async () => [],
      },
    })

    const inspectForm = new FormData()
    inspectForm.set('package', packageFile)
    const inspectResponse = await route.request('/7/agent-import/inspect', {
      method: 'POST',
      body: inspectForm,
    })
    const inspectText = await inspectResponse.text()
    assert.equal(inspectResponse.status, 200, inspectText)
    assert.deepEqual(
      (JSON.parse(inspectText) as { requirements: unknown }).requirements,
      { files: [], connectors: [] },
    )

    const importForm = new FormData()
    importForm.set('package', packageFile)
    importForm.set(
      'options',
      JSON.stringify({
        connectorCredentials: {},
        createBackupBeforeImport: true,
      }),
    )
    const importResponse = await route.request('/7/agent-import', {
      method: 'POST',
      body: importForm,
    })
    const stream = await importResponse.text()
    assert.equal(importResponse.status, 200)
    assert.deepEqual(
      readSseDataAll(stream, 'progress')
        .map((data) => JSON.parse(data) as { step: string; resource?: string })
        .filter(({ resource }) => resource === undefined)
        .map(({ step }) => step),
      [
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
      ],
    )
    assert.deepEqual(
      readSseDataAll(stream, 'backup-progress').map(
        (data) => (JSON.parse(data) as { step: string }).step,
      ),
      [
        'settings',
        'businessData',
        'skills',
        'channelComponents',
        'knowledge',
        'files',
        'connectors',
        'mcps',
        'packaging',
      ],
    )
    assert.deepEqual(
      readSseDataAll(stream, 'progress')
        .map(
          (data) =>
            JSON.parse(data) as {
              resource?: string
              completed?: number
              resourceTotal?: number
            },
        )
        .filter(({ resource }) => resource === 'faqs')
        .map(({ completed, resourceTotal }) => ({
          completed,
          total: resourceTotal,
        })),
      [
        { completed: 0, total: 1 },
        { completed: 1, total: 1 },
      ],
    )
    assert.deepEqual(JSON.parse(readSseData(stream, 'complete')), {
      importedFiles: 1,
    })
    assert.deepEqual(calls, [
      'backup',
      'settings:false',
      'business:Portable business',
      'allowlist:+5511999990000',
      'skill:order-status',
      'qr:Help me choose paper',
      'components',
      'faq:Where?',
      'website:https://example.com',
      'file:guide.pdf:9',
      'archive:file-new',
      'connector:orders_connector',
      'tool:get_order',
      'connector:legacy_mcp_connector',
      'refresh:connector-new',
      'settings:false',
    ])
    assert.equal(allowlistAddAttempts, 1)
    assert.equal(businessAttempts, 2)
    const importEvents = importLogs.map(({ event }) => event)
    for (const event of [
      'started',
      'stage_started',
      'resource_progress',
      'mutation_failed',
      'read_succeeded',
      'mutation_retry_scheduled',
      'mutation_succeeded',
      'mutation_verified',
      'local_archive_saved',
      'completed',
    ]) {
      assert.ok(importEvents.includes(event), `missing import log: ${event}`)
    }
    const startedLog = importLogs.find(({ event }) => event === 'started')
    assert.deepEqual(startedLog?.details.resources, {
      allowlist: 1,
      skills: 1,
      qrCodes: 1,
      icebreakers: 1,
      commands: 1,
      faqs: 1,
      websites: 1,
      files: 1,
      mcps: 0,
      connectors: 2,
      tools: 1,
    })
    assert.equal(
      importLogs.some(
        ({ event, details, hasError }) =>
          event === 'mutation_verified' &&
          details.label === 'Allowlist addition (+5511999990000)' &&
          hasError === false,
      ),
      true,
    )

    const selectiveCallsStart = calls.length
    const selectiveForm = new FormData()
    selectiveForm.set('package', packageFile)
    selectiveForm.set(
      'options',
      JSON.stringify({
        connectorCredentials: {},
        createBackupBeforeImport: false,
        components: ['skills'],
      }),
    )
    const selectiveResponse = await route.request('/7/agent-import', {
      method: 'POST',
      body: selectiveForm,
    })
    const selectiveStream = await selectiveResponse.text()
    assert.equal(selectiveResponse.status, 200)
    assert.deepEqual(calls.slice(selectiveCallsStart), ['skill:order-status'])
    assert.deepEqual(
      readSseDataAll(selectiveStream, 'progress')
        .map(
          (data) =>
            JSON.parse(data) as {
              step: string
              skipped?: boolean
              resource?: string
            },
        )
        .filter(({ resource }) => resource === undefined)
        .filter(({ skipped }) => skipped)
        .map(({ step }) => step),
      [
        'settings',
        'businessInfo',
        'allowlist',
        'qrCodes',
        'components',
        'faqs',
        'websites',
        'files',
        'mcps',
        'connectors',
        'finalizing',
      ],
    )

    destinationRolloutEnabled = true
    const enabledCallsStart = calls.length
    const enabledForm = new FormData()
    enabledForm.set('package', packageFile)
    enabledForm.set(
      'options',
      JSON.stringify({
        connectorCredentials: {},
        createBackupBeforeImport: false,
        components: ['settings'],
      }),
    )
    const enabledResponse = await route.request('/7/agent-import', {
      method: 'POST',
      body: enabledForm,
    })
    assert.equal(enabledResponse.status, 200)
    assert.ok(readSseData(await enabledResponse.text(), 'complete'))
    assert.deepEqual(calls.slice(enabledCallsStart), [
      'settings:true',
      'settings:true',
    ])
    assert.equal(destinationRolloutEnabled, true)
  })

  it('keeps the documented AGTX and MCPX Dunder Mifflin samples paired', async () => {
    const [agentBytes, mcpText] = await Promise.all([
      readFile(
        new URL(
          '../../../../docs/agtx/sample_dunder_mifflin.agtx',
          import.meta.url,
        ),
      ),
      readFile(
        new URL(
          '../../../../docs/mcpx/sample_dunder_mifflin.mcpx',
          import.meta.url,
        ),
        'utf8',
      ),
    ])
    const archive = parseAgentArchive(new Uint8Array(agentBytes))
    const manifest = archive.manifest as {
      agent: {
        skills: Array<{ skill: string }>
        connectors: Array<{
          name: string
          connectorProtocol: string
          localMcp?: { name: string; path: string }
          mcpToolSync?: { toolCount?: number }
          tools?: Array<{ name: string }>
        }>
      }
    }
    const mcpPackage = parseRunnerMcpPackageYaml(mcpText)
    const [connector] = manifest.agent.connectors

    assert.equal(manifest.agent.connectors.length, 1)
    assert.equal(connector?.name, mcpPackage.mcp.name)
    assert.equal(connector?.connectorProtocol, 'MCP')
    assert.equal(connector?.localMcp?.name, mcpPackage.mcp.name)
    assert.equal(connector?.localMcp?.path, 'MCPs/dunder_mifflin_mcp.mcpx')
    const embeddedMcp = archive.entries.get('MCPs/dunder_mifflin_mcp.mcpx')
    assert.ok(embeddedMcp)
    assert.equal(new TextDecoder().decode(embeddedMcp), mcpText)
    assert.equal(
      connector?.mcpToolSync?.toolCount,
      mcpPackage.mcp.functions.length,
    )
    assert.equal(Object.hasOwn(connector ?? {}, 'tools'), false)

    const skillInstructions = manifest.agent.skills
      .map(({ skill }) => skill)
      .join('\n')
    for (const fn of mcpPackage.mcp.functions) {
      assert.match(
        skillInstructions,
        new RegExp(`\\b${fn.name}\\b`),
        `no skill explains when to use ${fn.name}`,
      )
      const relevantSkills = manifest.agent.skills
        .filter(({ skill }) => skill.includes(fn.name))
        .map(({ skill }) => skill)
        .join('\n')
      for (const parameter of fn.revisions.at(-1)!.parameters) {
        if (parameter.required) {
          assert.match(
            relevantSkills,
            new RegExp(`\\b${parameter.name}\\b`),
            `${fn.name} skill omits required parameter ${parameter.name}`,
          )
        }
      }
    }

    const route = createChannelManagementRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'admin' }),
      repository: createRepository(),
    })
    const form = new FormData()
    form.set(
      'package',
      new File(
        [Uint8Array.from(agentBytes).buffer],
        'sample_dunder_mifflin.agtx',
        { type: 'application/vnd.mba.agent+zip' },
      ),
    )
    const response = await route.request('/7/agent-import/inspect', {
      method: 'POST',
      body: form,
    })

    assert.equal(response.status, 200, await response.clone().text())
    const inspected = (await response.json()) as { requirements: unknown }
    assert.deepEqual(inspected.requirements, {
      files: [],
      connectors: [],
    })
  })

  it('reports the exact failed import step and reason', async () => {
    const logged: Array<Record<string, unknown>> = []
    const providerRequestTimes: number[] = []
    let loggedError: unknown
    const route = createChannelManagementRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'admin' }),
      repository: createRepository(),
      agentImportRequestIntervalMs: 25,
      agentImportRetryBackoffMs: [0, 0, 0, 0, 0],
      reportImportLog: () => undefined,
      getAgentSettings: async () => {
        providerRequestTimes.push(Date.now())
        return [
          {
            agent_id: 'agent-target',
            channel: 'whatsapp',
            rollout: { enabled: false },
          },
        ]
      },
      updateAgentSettings: async (_configuration, input) => {
        providerRequestTimes.push(Date.now())
        return {
          agent_id: 'agent-target',
          channel: 'whatsapp',
          rollout: input.rollout ?? { enabled: false },
        }
      },
      replaceAgentBusinessInfo: async () => {
        providerRequestTimes.push(Date.now())
        throw new Error('Meta rejected the business profile: field too long')
      },
      getAgentBusinessInfo: async () => {
        providerRequestTimes.push(Date.now())
        return { business_description: 'Previous business profile' }
      },
      reportImportError: (details, error) => {
        logged.push(details)
        loggedError = error
      },
    })
    const form = new FormData()
    form.set('package', createImportPackage())
    form.set('options', JSON.stringify({ connectorCredentials: {} }))

    const response = await route.request('/7/agent-import', {
      method: 'POST',
      body: form,
    })
    const stream = await response.text()
    const failure = JSON.parse(readSseData(stream, 'import-error')) as {
      message: string
      partial: boolean
      step: string
    }

    assert.equal(response.status, 200)
    assert.deepEqual(failure, {
      step: 'businessInfo',
      message:
        'Business information update did not reach the requested state after 6 attempts: Meta rejected the business profile: field too long',
      partial: true,
    })
    assert.deepEqual(logged, [
      {
        organizationId: 'org-one',
        channelId: 7,
        step: 'businessInfo',
        errorName: 'Error',
        message:
          'Business information update did not reach the requested state after 6 attempts: Meta rejected the business profile: field too long',
      },
    ])
    assert.equal(
      loggedError instanceof Error ? loggedError.message : undefined,
      'Business information update did not reach the requested state after 6 attempts: Meta rejected the business profile: field too long',
    )
    assert.equal(providerRequestTimes.length, 14)
    for (let index = 1; index < providerRequestTimes.length; index += 1) {
      assert.ok(
        providerRequestTimes[index]! - providerRequestTimes[index - 1]! >= 20,
      )
    }
  })

  it('rejects AGTX packages that contain evaluation cases', async () => {
    const route = createChannelManagementRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'admin' }),
      repository: createRepository(),
    })
    const form = new FormData()
    form.set('package', createImportPackage(true))

    const response = await route.request('/7/agent-import/inspect', {
      method: 'POST',
      body: form,
    })

    assert.equal(response.status, 400)
    const body = (await response.json()) as { message: string }
    assert.match(body.message, /Agent import data is invalid at agent/i)
  })

  it('updates agent settings for an organization manager', async () => {
    let receivedInput: unknown
    const route = createChannelManagementRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'owner' }),
      repository: createRepository(),
      updateAgentSettings: async (_configuration, input) => {
        receivedInput = input
        return {
          agent_id: 'agent-one',
          channel: 'whatsapp',
          rollout: { enabled: false },
          ai_audience: 'ALLOWLISTED_ONLY',
          handoff: {
            enabled: true,
            message_selection: 'CUSTOM',
            message: 'A teammate will join shortly.',
          },
          never_say_phrases: ['guaranteed delivery', 'always available'],
        }
      },
    })

    const response = await route.request('/7/agent-settings', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        rolloutEnabled: false,
        audience: 'ALLOWLISTED_ONLY',
        handoff: {
          enabled: true,
          messageSelection: 'CUSTOM',
          message: 'A teammate will join shortly.',
        },
        neverSayPhrases: ['guaranteed delivery', 'always available'],
      }),
    })

    assert.equal(response.status, 200)
    assert.deepEqual(receivedInput, {
      rollout: { enabled: false },
      ai_audience: 'ALLOWLISTED_ONLY',
      handoff: {
        enabled: true,
        message_selection: 'CUSTOM',
        message: 'A teammate will join shortly.',
      },
      never_say_phrases: ['guaranteed delivery', 'always available'],
    })
  })

  it('requires message text for a custom handoff message', async () => {
    let updateCalled = false
    const route = createChannelManagementRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'owner' }),
      repository: createRepository(),
      updateAgentSettings: async () => {
        updateCalled = true
        throw new Error('Unexpected update')
      },
    })

    const response = await route.request('/7/agent-settings', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        handoff: {
          enabled: true,
          messageSelection: 'CUSTOM',
          message: '   ',
        },
      }),
    })

    assert.equal(response.status, 400)
    assert.equal(updateCalled, false)
  })

  it('lists and updates the organization channel allowlist', async () => {
    let addedPhoneNumber: string | undefined
    let removedEntryId: string | undefined
    const route = createChannelManagementRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'admin' }),
      repository: createRepository(),
      listAgentAllowlist: async () => [
        { id: 'entry-one', consumer_phone_number: '+5511999990000' },
      ],
      addAgentAllowlistEntry: async (_configuration, input) => {
        addedPhoneNumber = input.consumer_phone_number
        return { id: 'entry-two', ...input }
      },
      removeAgentAllowlistEntry: async (_configuration, entryId) => {
        removedEntryId = entryId
      },
    })

    const listResponse = await route.request('/7/agent-allowlist')
    const addResponse = await route.request('/7/agent-allowlist', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phoneNumber: '+5511888880000' }),
    })
    const removeResponse = await route.request('/7/agent-allowlist/entry-two', {
      method: 'DELETE',
    })

    assert.deepEqual(await listResponse.json(), {
      entries: [{ id: 'entry-one', phoneNumber: '+5511999990000' }],
    })
    assert.equal(addResponse.status, 201)
    assert.equal(addedPhoneNumber, '+5511888880000')
    assert.equal(removeResponse.status, 200)
    assert.equal(removedEntryId, 'entry-two')
  })

  it('reads and replaces business information for an owned channel', async () => {
    let receivedInput: unknown
    const route = createChannelManagementRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'admin' }),
      repository: createRepository(),
      getAgentBusinessInfo: async () => ({
        business_description: 'Coffee shop',
        contact_info: { email: 'hello@example.com' },
      }),
      replaceAgentBusinessInfo: async (_configuration, input) => {
        receivedInput = input
        return {
          business_description: input.business_description,
          payment_method: input.payment_method,
          purchase_info: input.purchase_info,
          delivery_and_shipping: input.delivery_and_shipping,
          return_policy: input.return_policy,
          contact_info: input.contact_info,
        }
      },
    })

    const getResponse = await route.request('/7/agent-business-info')
    const putResponse = await route.request('/7/agent-business-info', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        businessDescription: 'Updated coffee shop',
        paymentMethod: 'Credit card',
        purchaseInfo: 'Order online',
        deliveryAndShipping: 'Ships in two days',
        returnPolicy: 'Returns within 30 days',
        contactEmail: 'support@example.com',
        hoursOfOperation: '09:00–18:00',
        address: '1 Main Street',
      }),
    })

    assert.deepEqual(await getResponse.json(), {
      businessInfo: {
        businessDescription: 'Coffee shop',
        paymentMethod: '',
        purchaseInfo: '',
        deliveryAndShipping: '',
        returnPolicy: '',
        contactEmail: 'hello@example.com',
        hoursOfOperation: '',
        address: '',
      },
    })
    assert.equal(putResponse.status, 200)
    assert.deepEqual(receivedInput, {
      business_description: 'Updated coffee shop',
      payment_method: 'Credit card',
      purchase_info: 'Order online',
      delivery_and_shipping: 'Ships in two days',
      return_policy: 'Returns within 30 days',
      contact_info: {
        email: 'support@example.com',
        hours_of_operation: '09:00–18:00',
        address: '1 Main Street',
      },
    })
  })

  it('manages agent skills and rejects titles that are not kebab-case', async () => {
    const calls: string[] = []
    const agentSkills: AgentSkillsService = {
      list: async () => {
        calls.push('list')
        return [
          {
            id: 'skill-one',
            title: 'order-status',
            description: 'Checks an order',
            skill: 'Look up the order status.',
            channel: 'whatsapp',
          },
        ]
      },
      create: async (_configuration, input) => {
        calls.push(`create:${input.title}`)
        return {
          id: 'skill-two',
          ...input,
          skill: input.skill ?? '',
          channel: 'whatsapp',
        }
      },
      update: async (_configuration, skillId, input) => {
        calls.push(`update:${skillId}:${input.title}`)
        return {
          id: skillId,
          ...input,
          skill: input.skill ?? '',
          channel: 'whatsapp',
        }
      },
      delete: async (_configuration, skillId) => {
        calls.push(`delete:${skillId}`)
      },
    }
    const route = createChannelManagementRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'admin' }),
      repository: createRepository(),
      agentSkills,
    })
    const input = {
      title: 'order-status',
      description: 'Checks an order',
      skill: 'Look up the order status.',
    }

    const listResponse = await route.request('/7/agent-skills')
    const createResponse = await route.request(
      '/7/agent-skills',
      jsonRequest('POST', input),
    )
    const updateResponse = await route.request(
      '/7/agent-skills/skill-one',
      jsonRequest('PUT', input),
    )
    const deleteResponse = await route.request('/7/agent-skills/skill-one', {
      method: 'DELETE',
    })
    const invalidResponse = await route.request(
      '/7/agent-skills',
      jsonRequest('POST', { ...input, title: 'Order Status' }),
    )

    assert.equal(listResponse.status, 200)
    assert.equal(createResponse.status, 201)
    assert.equal(updateResponse.status, 200)
    assert.equal(deleteResponse.status, 200)
    assert.equal(invalidResponse.status, 400)
    assert.deepEqual(calls, [
      'list',
      'create:order-status',
      'update:skill-one:order-status',
      'delete:skill-one',
    ])
  })

  it('manages connectors, tools, and logs without exposing credentials', async () => {
    const calls: string[] = []
    const connector = {
      id: 'connector-one',
      name: 'Orders',
      description: 'Order service',
      base_url: 'https://orders.example.com',
      connector_protocol: 'HTTP' as const,
      auth_type: 'API_KEY' as const,
      auth_config: {
        api_key: {
          headers: [{ field_name: 'Authorization', value: 'secret-token' }],
        },
      },
      connection_status: { status: 'ACTIVE' as const },
    }
    const mcpConnector = {
      ...connector,
      id: 'connector-mcp',
      name: 'dunder_mifflin_mcp',
      connector_protocol: 'MCP' as const,
      mcp_tool_sync: { status: 'READY' as const, tool_count: 6 },
    }
    const tool = {
      id: 'tool-one',
      name: 'get_order',
      description: 'Gets an order',
      request_definition: { method: 'GET' as const, path: '/orders/{id}' },
      user_auth_required: false,
    }
    const agentConnectors: AgentConnectorsService = {
      list: async () => {
        calls.push('list')
        return [connector]
      },
      get: async (_configuration, connectorId) => {
        calls.push(`get:${connectorId}`)
        return connectorId === mcpConnector.id ? mcpConnector : connector
      },
      create: async (_configuration, input) => {
        calls.push(`create:${input.name}`)
        return { ...connector, ...input, id: 'connector-two' }
      },
      update: async (_configuration, connectorId, input) => {
        calls.push(`update:${connectorId}:${input.name}`)
        return { ...connector, ...input, id: connectorId }
      },
      delete: async (_configuration, connectorId) => {
        calls.push(`delete:${connectorId}`)
      },
      logs: async (_configuration, connectorId) => {
        calls.push(`logs:${connectorId}`)
        return {
          data: [
            { tool_name: 'get_order', event_time: '2026-09-30T12:00:00Z' },
          ],
          stats: {
            start_count: 1,
            success_count: 1,
            exception_count: 0,
            success_rate: 1,
            avg_latency_s: 0.1,
            p95_latency_s: 0.1,
            p99_latency_s: 0.1,
            time_window_seconds: 60,
          },
        }
      },
      listTools: async (_configuration, connectorId) => {
        calls.push(`listTools:${connectorId}`)
        return [tool]
      },
      createTool: async (_configuration, connectorId, input) => {
        calls.push(`createTool:${connectorId}:${input.name}`)
        return { id: 'tool-two', ...input }
      },
      updateTool: async (_configuration, connectorId, toolId, input) => {
        calls.push(`updateTool:${connectorId}:${toolId}`)
        return { id: toolId, ...input }
      },
      deleteTool: async (_configuration, connectorId, toolId) => {
        calls.push(`deleteTool:${connectorId}:${toolId}`)
      },
      refreshMcpTools: async (_configuration, connectorId) => {
        calls.push(`refreshMcpTools:${connectorId}`)
      },
    }
    const route = createChannelManagementRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'admin' }),
      repository: createRepository(),
      agentConnectors,
    })
    const connectorInput = {
      name: 'orders_connector',
      description: 'Order service',
      baseUrl: 'https://orders.example.com',
      connectorProtocol: 'HTTP',
      authType: 'NONE',
      requiresCertificate: false,
    }
    const toolInput = {
      name: 'get_order',
      description: 'Gets an order',
      requestDefinition: {
        method: 'GET',
        path: '/orders/{id}',
        pathParameters: {},
        queryParameters: {},
        headers: {},
        body: null,
      },
      userAuthRequired: false,
      transformationSpec: null,
    }

    const listResponse = await route.request('/7/agent-connectors')
    const detailResponse = await route.request(
      '/7/agent-connectors/connector-one',
    )
    const createResponse = await route.request(
      '/7/agent-connectors',
      jsonRequest('POST', connectorInput),
    )
    const updateResponse = await route.request(
      '/7/agent-connectors/connector-one',
      jsonRequest('PUT', connectorInput),
    )
    const logsResponse = await route.request(
      '/7/agent-connectors/connector-one/logs',
    )
    const toolsResponse = await route.request(
      '/7/agent-connectors/connector-one/tools',
    )
    const refreshMcpToolsResponse = await route.request(
      '/7/agent-connectors/connector-mcp/refresh-mcp-tools',
      { method: 'POST' },
    )
    const refreshHttpToolsResponse = await route.request(
      '/7/agent-connectors/connector-one/refresh-mcp-tools',
      { method: 'POST' },
    )
    const createToolResponse = await route.request(
      '/7/agent-connectors/connector-one/tools',
      jsonRequest('POST', toolInput),
    )
    const updateToolResponse = await route.request(
      '/7/agent-connectors/connector-one/tools/tool-one',
      jsonRequest('PUT', toolInput),
    )
    const deleteToolResponse = await route.request(
      '/7/agent-connectors/connector-one/tools/tool-one',
      { method: 'DELETE' },
    )
    const deleteResponse = await route.request(
      '/7/agent-connectors/connector-one',
      { method: 'DELETE' },
    )
    const invalidToolNameResponse = await route.request(
      '/7/agent-connectors/connector-one/tools',
      jsonRequest('POST', { ...toolInput, name: 'Get Order' }),
    )
    const invalidNameResponse = await route.request(
      '/7/agent-connectors',
      jsonRequest('POST', { ...connectorInput, name: 'Orders Connector' }),
    )

    assert.equal(listResponse.status, 200)
    assert.equal(detailResponse.status, 200)
    assert.equal(createResponse.status, 201)
    assert.equal(updateResponse.status, 200)
    assert.equal(logsResponse.status, 200)
    assert.equal(toolsResponse.status, 200)
    assert.equal(refreshMcpToolsResponse.status, 200)
    assert.equal(refreshHttpToolsResponse.status, 400)
    assert.equal(createToolResponse.status, 201)
    assert.equal(updateToolResponse.status, 200)
    assert.equal(deleteToolResponse.status, 200)
    assert.equal(deleteResponse.status, 200)
    assert.equal(invalidNameResponse.status, 400)
    assert.equal(invalidToolNameResponse.status, 400)
    assert.equal((await listResponse.text()).includes('secret-token'), false)
    assert.deepEqual(calls, [
      'list',
      'get:connector-one',
      'create:orders_connector',
      'get:connector-one',
      'update:connector-one:orders_connector',
      'logs:connector-one',
      'listTools:connector-one',
      'get:connector-mcp',
      'refreshMcpTools:connector-mcp',
      'get:connector-mcp',
      'get:connector-one',
      'createTool:connector-one:get_order',
      'updateTool:connector-one:tool-one',
      'deleteTool:connector-one:tool-one',
      'delete:connector-one',
    ])
  })

  it('lists and runs agent evaluations for an organization-owned channel', async () => {
    const calls: string[] = []
    const agentEvaluations: AgentEvaluationsService = {
      listCases: async () => {
        calls.push('listCases')
        return [
          {
            id: 'case-one',
            scenario: 'Resolve an order issue',
            categories: ['support'],
            max_turns: 8,
            success_criteria: ['The order status is explained'],
          },
        ]
      },
      run: async (_configuration, evalCaseIds) => {
        calls.push(`run:${evalCaseIds.join(',')}`)
        return { job_id: 'job-one', status: 'QUEUED' }
      },
      getJob: async (_configuration, jobId) => {
        calls.push(`getJob:${jobId}`)
        return {
          status: 'COMPLETED',
          result: {
            summary_id: 'summary-one',
            avg_conversation_score: 0.9,
            summary: 'The agent completed the scenario.',
            creation_time: 1,
            update_time: 2,
          },
        }
      },
      getDetails: async (_configuration, evalIds) => {
        calls.push(`getDetails:${evalIds.join(',')}`)
        return [
          {
            id: 'eval-one',
            score: 0.9,
            per_turn_labels: '[]',
            reasons: '[]',
            creation_time: 1,
            update_time: 2,
          },
        ]
      },
      getSummaries: async (_configuration, summaryIds) => {
        calls.push(`getSummaries:${summaryIds.join(',')}`)
        return [
          {
            id: 'summary-one',
            avg_conversation_score: 0.9,
            summary: 'The agent completed the scenario.',
            creation_time: 1,
            update_time: 2,
          },
        ]
      },
    }
    const route = createChannelManagementRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'admin' }),
      repository: createRepository(),
      agentEvaluations,
    })

    const listResponse = await route.request('/7/agent-evals')
    const runResponse = await route.request(
      '/7/agent-evals/runs',
      jsonRequest('POST', { evalCaseIds: ['case-one'] }),
    )
    const jobResponse = await route.request('/7/agent-evals/runs/job-one')
    const detailsResponse = await route.request(
      '/7/agent-evals/details?ids=eval-one',
    )
    const summariesResponse = await route.request(
      '/7/agent-evals/summaries?ids=summary-one',
    )

    assert.equal(listResponse.status, 200)
    assert.equal(runResponse.status, 202)
    assert.equal(jobResponse.status, 200)
    assert.equal(detailsResponse.status, 200)
    assert.equal(summariesResponse.status, 200)
    assert.deepEqual(await runResponse.json(), {
      jobId: 'job-one',
      status: 'QUEUED',
    })
    assert.deepEqual(calls, [
      'listCases',
      'run:case-one',
      'getJob:job-one',
      'getDetails:eval-one',
      'getSummaries:summary-one',
    ])
  })

  it('prevents regular members from starting agent evaluations', async () => {
    let runCalled = false
    const route = createChannelManagementRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository: createRepository(),
      agentEvaluations: {
        listCases: async () => [],
        run: async () => {
          runCalled = true
          return { job_id: 'job-one', status: 'QUEUED' }
        },
        getJob: async () => ({ status: 'RUNNING' }),
        getDetails: async () => [],
        getSummaries: async () => [],
      },
    })

    const response = await route.request(
      '/7/agent-evals/runs',
      jsonRequest('POST', { evalCaseIds: ['case-one'] }),
    )

    assert.equal(response.status, 403)
    assert.equal(runCalled, false)
  })

  it('manages FAQs, websites, and direct knowledge-file uploads', async () => {
    const calls: string[] = []
    const agentKnowledge: AgentKnowledgeService = {
      listFaqs: async () => {
        calls.push('listFaqs')
        return [{ id: 'faq-one', question: 'Q?', answer: 'A.' }]
      },
      createFaq: async (_configuration, input) => {
        calls.push(`createFaq:${input.question}`)
        return { id: 'faq-two', ...input }
      },
      updateFaq: async (_configuration, faqId, input) => {
        calls.push(`updateFaq:${faqId}`)
        return { id: faqId, ...input }
      },
      deleteFaq: async (_configuration, faqId) => {
        calls.push(`deleteFaq:${faqId}`)
      },
      listWebsites: async () => {
        calls.push('listWebsites')
        return [{ id: 'site-one', url: 'https://example.com' }]
      },
      createWebsite: async (_configuration, input) => {
        calls.push(`createWebsite:${input.url}`)
        return { id: 'site-two', ...input }
      },
      updateWebsite: async (_configuration, websiteId, input) => {
        calls.push(`updateWebsite:${websiteId}`)
        return { id: websiteId, ...input }
      },
      deleteWebsite: async (_configuration, websiteId) => {
        calls.push(`deleteWebsite:${websiteId}`)
      },
      listFiles: async () => {
        calls.push('listFiles')
        return [{ id: 'file-one', file_name: 'guide.pdf' }]
      },
      uploadFile: async (_configuration, file) => {
        calls.push(`uploadFile:${file.name}:${file.size}`)
        return { id: 'file-two', file_name: file.name }
      },
      deleteFile: async (_configuration, fileId) => {
        calls.push(`deleteFile:${fileId}`)
      },
    }
    const route = createChannelManagementRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'admin' }),
      repository: createRepository(),
      agentKnowledge,
      knowledgeArchive: {
        put: async (organizationId, channelId, providerFile, file) => {
          calls.push(
            `archivePut:${organizationId}:${channelId}:${providerFile.id}:${file.name}`,
          )
        },
        getMany: async () => [],
        delete: async (organizationId, providerFileId) => {
          calls.push(`archiveDelete:${organizationId}:${providerFileId}`)
        },
      },
    })
    const faqInput = { question: 'Question?', answer: 'Answer.' }
    const websiteInput = {
      url: 'https://example.com',
      includedSubDomains: [],
      includedUrlPatterns: [],
      excludedSubDomains: [],
      excludedUrlPatterns: [],
      singleUrls: [],
    }
    const upload = new FormData()
    upload.set(
      'file',
      new File(['knowledge'], 'guide.pdf', { type: 'application/pdf' }),
    )

    await route.request('/7/agent-knowledge/faqs')
    await route.request(
      '/7/agent-knowledge/faqs',
      jsonRequest('POST', faqInput),
    )
    await route.request(
      '/7/agent-knowledge/faqs/faq-one',
      jsonRequest('PUT', faqInput),
    )
    await route.request('/7/agent-knowledge/faqs/faq-one', { method: 'DELETE' })
    await route.request('/7/agent-knowledge/websites')
    await route.request(
      '/7/agent-knowledge/websites',
      jsonRequest('POST', websiteInput),
    )
    await route.request(
      '/7/agent-knowledge/websites/site-one',
      jsonRequest('PUT', websiteInput),
    )
    await route.request('/7/agent-knowledge/websites/site-one', {
      method: 'DELETE',
    })
    await route.request('/7/agent-knowledge/files')
    const uploadResponse = await route.request('/7/agent-knowledge/files', {
      method: 'POST',
      body: upload,
    })
    await route.request('/7/agent-knowledge/files/file-one', {
      method: 'DELETE',
    })

    assert.equal(uploadResponse.status, 201)
    assert.deepEqual(calls, [
      'listFaqs',
      'createFaq:Question?',
      'updateFaq:faq-one',
      'deleteFaq:faq-one',
      'listWebsites',
      'createWebsite:https://example.com',
      'updateWebsite:site-one',
      'deleteWebsite:site-one',
      'listFiles',
      'uploadFile:guide.pdf:9',
      'archivePut:org-one:7:file-two:guide.pdf',
      'deleteFile:file-one',
      'archiveDelete:org-one:file-one',
    ])
  })

  it('checks agent eligibility for an organization manager', async () => {
    let receivedPhoneNumberId: string | undefined
    const route = createChannelManagementRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'admin' }),
      repository: createRepository(),
      getAgentEligibility: async (configuration) => {
        receivedPhoneNumberId = configuration.waPhoneNumberId
        return { is_eligible: true }
      },
    })

    const response = await route.request('/7/agent-eligibility')

    assert.equal(response.status, 200)
    assert.equal(receivedPhoneNumberId, 'phone-id')
    assert.deepEqual(await response.json(), { eligible: true })
  })

  it('prevents regular members from checking agent eligibility', async () => {
    let eligibilityCalled = false
    const route = createChannelManagementRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository: createRepository(),
      getAgentEligibility: async () => {
        eligibilityCalled = true
        return { is_eligible: true }
      },
    })

    const response = await route.request('/7/agent-eligibility')

    assert.equal(response.status, 403)
    assert.equal(eligibilityCalled, false)
  })

  it('onboards an agent for an organization-owned channel', async () => {
    let receivedPhoneNumberId: string | undefined
    const route = createChannelManagementRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'admin' }),
      repository: createRepository(),
      onboardAgent: async (configuration) => {
        receivedPhoneNumberId = configuration.waPhoneNumberId
        return { agent_id: 'agent-one' }
      },
    })

    const response = await route.request('/7/agent', { method: 'POST' })

    assert.equal(response.status, 201)
    assert.equal(receivedPhoneNumberId, 'phone-id')
    assert.deepEqual(await response.json(), { agentId: 'agent-one' })
  })

  it('prevents regular members from onboarding an agent', async () => {
    let onboardCalled = false
    const route = createChannelManagementRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository: createRepository(),
      onboardAgent: async () => {
        onboardCalled = true
        return { agent_id: 'agent-one' }
      },
    })

    const response = await route.request('/7/agent', { method: 'POST' })

    assert.equal(response.status, 403)
    assert.equal(onboardCalled, false)
  })

  it('deletes an agent for an organization-owned channel', async () => {
    let receivedPhoneNumberId: string | undefined
    const route = createChannelManagementRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'owner' }),
      repository: createRepository(),
      deleteAgent: async (configuration) => {
        receivedPhoneNumberId = configuration.waPhoneNumberId
        return { deleted_agent_id: 'agent-one' }
      },
    })

    const response = await route.request('/7/agent', { method: 'DELETE' })

    assert.equal(response.status, 200)
    assert.equal(receivedPhoneNumberId, 'phone-id')
    assert.deepEqual(await response.json(), { deletedAgentId: 'agent-one' })
  })

  it('registers the app webhook subscription for an organization manager', async () => {
    let requestedCallbackUrl: string | undefined
    const route = createChannelManagementRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'admin' }),
      repository: createRepository(),
      registerWebhook: async (_configuration, callbackUrl) => {
        requestedCallbackUrl = callbackUrl
      },
    })

    const callbackUrl = 'https://example.com/api/wa-cloud/webhook/7'
    const response = await route.request('/7/set-webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ callbackUrl }),
    })

    assert.equal(response.status, 200)
    assert.equal(requestedCallbackUrl, callbackUrl)
    assert.deepEqual(await response.json(), {
      success: true,
      message: 'Meta app webhook subscription registered successfully',
      callbackUrl,
    })
  })

  it('returns and logs safe Meta details when app registration fails', async () => {
    const logged: unknown[][] = []
    const originalConsoleError = console.error
    console.error = (...values: unknown[]) => logged.push(values)
    try {
      const route = createChannelManagementRoute({
        getAccess: async () => ({ organizationId: 'org-one', role: 'admin' }),
        repository: createRepository(),
        registerWebhook: async () => {
          throw new MetaWebhookRegistrationError(
            'Meta rejected the app webhook subscription: Callback is unreachable',
            'app_registration',
            new WhatsAppWebhookRegistrationApiError(433, {
              error: {
                message: 'Callback is unreachable',
                code: 2200,
                error_subcode: 2201,
                type: 'OAuthException',
                fbtrace_id: 'safe-trace-id',
              },
            }),
          )
        },
      })

      const response = await route.request('/7/set-webhook', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          callbackUrl: 'https://example.com/api/wa-cloud/webhook/7',
        }),
      })

      assert.equal(response.status, 502)
      assert.deepEqual(await response.json(), {
        message:
          'Meta rejected the app webhook subscription: Callback is unreachable',
        stage: 'app_registration',
        providerStatus: 433,
        providerCode: 2200,
        providerSubcode: 2201,
        providerTraceId: 'safe-trace-id',
      })
      assert.equal(JSON.stringify(logged).includes('safe-trace-id'), true)
      assert.equal(JSON.stringify(logged).includes('app-secret'), false)
      assert.equal(JSON.stringify(logged).includes('app-id'), true)
      assert.equal(
        JSON.stringify(logged).includes('account_settings_update'),
        true,
      )
    } finally {
      console.error = originalConsoleError
    }
  })

  it('allows overriding the webhook callback URL', async () => {
    let requestedCallbackUrl: string | undefined
    const route = createChannelManagementRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'owner' }),
      repository: createRepository(),
      registerWebhook: async (_configuration, callbackUrl) => {
        requestedCallbackUrl = callbackUrl
      },
    })

    const callbackUrl = 'https://testing.example.com/meta/callback?channel=7'
    const response = await route.request('/7/set-webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ callbackUrl }),
    })

    assert.equal(response.status, 200)
    assert.equal(requestedCallbackUrl, callbackUrl)
  })

  it('rejects callback URLs with embedded credentials', async () => {
    const route = createChannelManagementRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'owner' }),
      repository: createRepository(),
    })

    const response = await route.request('/7/set-webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        callbackUrl: 'https://user:secret@example.com/webhook',
      }),
    })

    assert.equal(response.status, 400)
  })

  it('returns not found instead of touching another organization channel', async () => {
    const route = createChannelManagementRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'owner' }),
      repository: createRepository({ update: async () => undefined }),
    })

    const response = await route.request('/99', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ waPhoneNumber: '+1 555 000 9999' }),
    })

    assert.equal(response.status, 404)
  })
})

describe('Meta webhook registration', () => {
  it('registers the exact supported field set on the app subscription', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = []
    const request = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
      requests.push({ url, init })
      return new Response(JSON.stringify({ success: true }), { status: 200 })
    }) as typeof fetch

    await registerMetaWebhook(
      {
        waAppId: 'app-id',
        waAppSecret: 'app-secret',
        waWebhookVerifyToken: 'verify-secret',
      },
      'https://example.com/api/wa-cloud/webhook/7',
      request,
    )

    assert.equal(requests.length, 1)
    assert.equal(requests[0]?.init?.method, 'POST')
    assert.equal(
      new Headers(requests[0]?.init?.headers).get('content-type'),
      'application/x-www-form-urlencoded',
    )
    assert.equal(
      requests[0]?.url,
      'https://graph.facebook.com/v26.0/app-id/subscriptions',
    )
    assert.equal(requests[0]?.init?.body instanceof URLSearchParams, true)
    const body = requests[0].init?.body?.toString()
    assert.equal(
      body,
      'object=whatsapp_business_account&callback_url=https%3A%2F%2Fexample.com%2Fapi%2Fwa-cloud%2Fwebhook%2F7&verify_token=verify-secret&fields=messages%2Ccalls%2Cmessaging_handovers%2Caccount_settings_update%2Cstandby%2Cbusiness_status_update%2Cflows%2Cmessage_template_components_update%2Cmessage_template_quality_update%2Cmessage_template_status_update%2Cphone_number_quality_update%2Cphone_number_name_update%2Ctemplate_category_update%2Ctemplate_correct_category_detection&access_token=app-id%7Capp-secret',
    )
    assert.deepEqual(MBA_WEBHOOK_SUBSCRIPTION_FIELDS, [
      'messages',
      'calls',
      'messaging_handovers',
      'account_settings_update',
      'standby',
      'business_status_update',
      'flows',
      'message_template_components_update',
      'message_template_quality_update',
      'message_template_status_update',
      'phone_number_quality_update',
      'phone_number_name_update',
      'template_category_update',
      'template_correct_category_detection',
    ])
  })
})

describe('Meta agent settings', () => {
  it('checks eligibility for the channel phone number with its access token', async () => {
    let requestUrl: string | undefined
    let authorization: string | null = null
    const request = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      requestUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
      authorization = new Headers(init?.headers).get('authorization')
      return new Response(JSON.stringify({ is_eligible: true }), {
        status: 200,
      })
    }) as typeof fetch

    const eligibility = await getMetaAgentEligibility(
      {
        waPhoneNumberId: 'phone/id',
        waSystemUserAccessToken: 'access-secret',
      },
      request,
    )

    assert.equal(eligibility.is_eligible, true)
    assert.equal(
      new URL(requestUrl ?? '').pathname,
      '/phone%2Fid/agent_eligibility',
    )
    assert.equal(authorization, 'Bearer access-secret')
  })

  it('queries settings for the channel phone number with its access token', async () => {
    let requestUrl: string | undefined
    let authorization: string | null = null
    const request = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      requestUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
      authorization = new Headers(init?.headers).get('authorization')
      return new Response(JSON.stringify([]), { status: 200 })
    }) as typeof fetch

    const settings = await getMetaAgentSettings(
      {
        waPhoneNumberId: 'phone/id',
        waSystemUserAccessToken: 'access-secret',
      },
      request,
    )

    assert.deepEqual(settings, [])
    assert.equal(
      new URL(requestUrl ?? '').pathname,
      '/phone%2Fid/agent_config/settings',
    )
    assert.equal(authorization, 'Bearer access-secret')
  })

  it('updates settings and manages allowlist entries without a client deadline', async () => {
    const requests: Array<{
      method: string
      pathname: string
      body?: unknown
      hasSignal: boolean
    }> = []
    const request = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const url = new URL(
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url,
      )
      const method = init?.method ?? 'GET'
      requests.push({
        method,
        pathname: url.pathname,
        body:
          typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
        hasSignal: init?.signal !== undefined,
      })
      if (method === 'DELETE' && url.pathname.endsWith('/delete_agent')) {
        return new Response(JSON.stringify({ deleted_agent_id: 'agent-one' }), {
          status: 200,
        })
      }
      if (method === 'DELETE') return new Response(null, { status: 204 })
      if (method === 'POST') {
        return new Response(
          JSON.stringify({
            id: 'entry-two',
            consumer_phone_number: '+5511888880000',
          }),
          { status: 201 },
        )
      }
      if (method === 'PUT') {
        return new Response(
          JSON.stringify({
            agent_id: 'agent-one',
            channel: 'whatsapp',
            rollout: { enabled: false },
            ai_audience: 'ALLOWLISTED_ONLY',
          }),
          { status: 200 },
        )
      }
      return new Response(
        JSON.stringify([
          { id: 'entry-one', consumer_phone_number: '+5511999990000' },
        ]),
        { status: 200 },
      )
    }) as typeof fetch
    const configuration = {
      waPhoneNumberId: 'phone/id',
      waSystemUserAccessToken: 'access-secret',
    }

    await updateMetaAgentSettings(
      configuration,
      { rollout: { enabled: false }, ai_audience: 'ALLOWLISTED_ONLY' },
      request,
    )
    await listMetaAgentAllowlist(configuration, request)
    await addMetaAgentAllowlistEntry(
      configuration,
      { consumer_phone_number: '+5511888880000' },
      request,
    )
    await removeMetaAgentAllowlistEntry(configuration, 'entry-two', request)
    await deleteMetaAgent(configuration, request)

    assert.deepEqual(requests, [
      {
        method: 'PUT',
        pathname: '/phone%2Fid/agent_config/settings',
        body: {
          rollout: { enabled: false },
          ai_audience: 'ALLOWLISTED_ONLY',
        },
        hasSignal: false,
      },
      {
        method: 'GET',
        pathname: '/phone%2Fid/agent_config/allowlist',
        body: undefined,
        hasSignal: false,
      },
      {
        method: 'POST',
        pathname: '/phone%2Fid/agent_config/allowlist',
        body: { consumer_phone_number: '+5511888880000' },
        hasSignal: false,
      },
      {
        method: 'DELETE',
        pathname: '/phone%2Fid/agent_config/allowlist/entry-two',
        body: undefined,
        hasSignal: false,
      },
      {
        method: 'DELETE',
        pathname: '/phone%2Fid/delete_agent',
        body: undefined,
        hasSignal: false,
      },
    ])
  })

  it('gets and replaces business information without a client deadline', async () => {
    const requests: Array<{
      method: string
      pathname: string
      body?: unknown
      hasSignal: boolean
    }> = []
    const request = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const url = new URL(
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url,
      )
      const method = init?.method ?? 'GET'
      requests.push({
        method,
        pathname: url.pathname,
        body:
          typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
        hasSignal: init?.signal !== undefined,
      })
      return new Response(
        JSON.stringify({ business_description: 'Coffee shop' }),
        { status: 200 },
      )
    }) as typeof fetch
    const configuration = {
      waPhoneNumberId: 'phone/id',
      waSystemUserAccessToken: 'access-secret',
    }

    await getMetaAgentBusinessInfo(configuration, request)
    await replaceMetaAgentBusinessInfo(
      configuration,
      { business_description: 'Coffee shop' },
      request,
    )

    assert.deepEqual(requests, [
      {
        method: 'GET',
        pathname: '/phone%2Fid/agent_config/business_info',
        body: undefined,
        hasSignal: false,
      },
      {
        method: 'PUT',
        pathname: '/phone%2Fid/agent_config/business_info',
        body: { business_description: 'Coffee shop' },
        hasSignal: false,
      },
    ])
  })

  it('preserves the actual Meta business response error as its cause', async () => {
    const responseBody = [{ business_description: 'unexpected array' }]
    const request = (async () =>
      new Response(JSON.stringify(responseBody), {
        status: 200,
      })) as typeof fetch

    await assert.rejects(
      getMetaAgentBusinessInfo(
        {
          waPhoneNumberId: 'phone-id',
          waSystemUserAccessToken: 'access-secret',
        },
        request,
      ),
      (error: unknown) => {
        assert.equal(error instanceof Error, true)
        const wrapped = error as Error
        assert.equal(
          wrapped.message,
          'Meta returned an unexpected business information response',
        )
        assert.equal(wrapped.cause instanceof Error, true)
        assert.equal((wrapped.cause as Error).name, 'WhatsAppMbaResponseError')
        assert.deepEqual(
          (wrapped.cause as Error & { body: unknown }).body,
          responseBody,
        )
        return true
      },
    )
  })

  it('onboards the channel phone number with its access token', async () => {
    let requestUrl: string | undefined
    let requestMethod: string | undefined
    let authorization: string | null = null
    const request = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      requestUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
      requestMethod = init?.method
      authorization = new Headers(init?.headers).get('authorization')
      return new Response(JSON.stringify({ agent_id: 'agent-one' }), {
        status: 201,
      })
    }) as typeof fetch

    const result = await onboardMetaAgent(
      {
        waPhoneNumberId: 'phone/id',
        waSystemUserAccessToken: 'access-secret',
      },
      request,
    )

    assert.equal(result.agent_id, 'agent-one')
    assert.equal(
      new URL(requestUrl ?? '').pathname,
      '/phone%2Fid/agent_onboarding',
    )
    assert.equal(requestMethod, 'POST')
    assert.equal(authorization, 'Bearer access-secret')
  })
})

function createRepository(
  overrides: Partial<ChannelManagementRepository> = {},
): ChannelManagementRepository {
  return {
    list: async () => [],
    getVerifyToken: async () => 'verify-secret',
    getWebhookConfiguration: async () => ({
      waAppId: 'app-id',
      waAppSecret: 'app-secret',
      waWabaId: 'waba-id',
      waWebhookVerifyToken: 'verify-secret',
      waSystemUserAccessToken: 'access-secret',
    }),
    getAgentConfiguration: async () => ({
      waPhoneNumberId: 'phone-id',
      waSystemUserAccessToken: 'access-secret',
      waWabaId: 'waba-id',
    }),
    create: async () => channel,
    update: async () => channel,
    getDeletionPreview: async () => ({
      confirmationText: channel.waPhoneNumber,
      contacts: 0,
      groups: 0,
      messages: 0,
    }),
    hasLocalMcpAssociation: async () => false,
    removeLocalMcpAssociation: async () => undefined,
    delete: async () => ({
      status: 'deleted',
      impact: { contacts: 0, groups: 0, messages: 0 },
    }),
    ...overrides,
  }
}

function createImportPackage(includeEvaluations = false): File {
  const document = stringifyYaml({
    format: 'agtx',
    version: 1,
    agent: {
      settings: {
        agentId: 'agent-source',
        rolloutEnabled: true,
        audience: 'EVERYONE',
        handoff: {
          enabled: false,
          messageSelection: 'DEFAULT',
          message: '',
        },
        neverSayPhrases: [],
      },
      allowlist: [{ id: 'allow-source', phoneNumber: '+5511999990000' }],
      businessInfo: {
        businessDescription: 'Portable business',
        paymentMethod: '',
        purchaseInfo: '',
        deliveryAndShipping: '',
        returnPolicy: '',
        contactEmail: '',
        hoursOfOperation: '',
        address: '',
      },
      qrCodes: [{ prefilledMessage: 'Help me choose paper' }],
      components: {
        prompts: ['Help me choose paper'],
        commands: [
          {
            commandName: 'human',
            commandDescription: 'Talk to a paper specialist',
          },
        ],
      },
      skills: [
        {
          id: 'skill-source',
          title: 'order-status',
          description: 'Checks an order',
          skill: 'Check the order.',
          channel: 'whatsapp',
          status: 'active',
        },
      ],
      knowledge: {
        faqs: [
          {
            id: 'faq-source',
            question: 'Where?',
            answer: 'Here.',
            createdAt: null,
          },
        ],
        websites: [
          {
            id: 'site-source',
            url: 'https://example.com',
            includedSubDomains: [],
            includedUrlPatterns: [],
            excludedSubDomains: [],
            excludedUrlPatterns: [],
            singleUrls: [],
            crawlStatus: null,
            crawlError: null,
            pagesCrawled: null,
            lastCrawledAt: null,
          },
        ],
        files: [
          {
            providerFileId: 'file-source',
            fileName: 'guide.pdf',
            path: 'files/001-guide.pdf',
            included: true,
          },
        ],
      },
      connectors: [
        {
          id: 'connector-source',
          name: 'orders_connector',
          description: 'Orders',
          baseUrl: 'https://orders.example.com',
          connectorProtocol: 'HTTP',
          authType: 'NONE',
          hasAuthConfiguration: false,
          requiresCertificate: false,
          hasCertificate: false,
          connectionStatus: 'ACTIVE',
          connectionError: null,
          userAuthInjectionConfig: null,
          mcpToolSync: null,
          tools: [
            {
              id: 'tool-source',
              name: 'get_order',
              description: 'Gets an order',
              requestDefinition: {
                method: 'GET',
                path: '/orders/{id}',
                pathParameters: {},
                queryParameters: {},
                headers: {},
                body: null,
              },
              userAuthRequired: false,
              userAuthActionConfig: null,
              transformationSpec: null,
            },
          ],
        },
        {
          id: 'connector-mcp-source',
          name: 'legacy_mcp_connector',
          description: 'MCP connector with legacy packaged tools',
          baseUrl: 'https://mcp.example.com/api/mcp/1',
          connectorProtocol: 'MCP',
          authType: 'NONE',
          hasAuthConfiguration: false,
          requiresCertificate: false,
          hasCertificate: false,
          connectionStatus: 'ACTIVE',
          connectionError: null,
          userAuthInjectionConfig: null,
          mcpToolSync: null,
          tools: [
            {
              id: 'legacy-mcp-tool-source',
              name: 'ignored_legacy_tool',
              description: 'Must be ignored in favor of MCP refresh',
              requestDefinition: {
                method: 'GET',
                path: '/ignored',
                pathParameters: {},
                queryParameters: {},
                headers: {},
                body: null,
              },
              userAuthRequired: false,
              userAuthActionConfig: null,
              transformationSpec: null,
            },
          ],
        },
      ],
      ...(includeEvaluations
        ? {
            evaluations: [
              {
                id: 'case-source',
                scenario: 'This field is no longer supported.',
              },
            ],
          }
        : {}),
    },
  })
  const bytes = createAgentExportArchive([
    { path: 'agent.yaml', body: new TextEncoder().encode(document) },
    {
      path: 'files/001-guide.pdf',
      body: new TextEncoder().encode('PDF bytes'),
    },
  ])
  return new File([bytes.slice().buffer], 'portable.agtx', {
    type: 'application/vnd.mba.agent+zip',
  })
}

function createChannelInput() {
  return {
    name: 'Brazil support',
    waPhoneNumber: '+55 11 99999-0000',
    waPhoneNumberId: 'phone-id',
    waWabaId: 'waba-id',
    waBusinessId: 'business-id',
    waAppId: 'app-id',
    waAppSecret: 'app-secret',
    waWebhookVerifyToken: 'verify-token',
    waSystemUserAccessToken: 'access-token',
    webhookForwardUrls: ['https://example.com/forward'],
  }
}

function jsonRequest(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }
}

function readSseData(stream: string, event: string): string {
  const block = stream
    .split('\n\n')
    .find((candidate) => candidate.includes(`event: ${event}`))
  const data = block
    ?.split('\n')
    .find((line) => line.startsWith('data: '))
    ?.slice('data: '.length)
  if (!data) throw new Error(`Missing SSE event: ${event}`)
  return data
}

function readSseDataAll(stream: string, event: string): string[] {
  return stream
    .split('\n\n')
    .filter((candidate) => candidate.includes(`event: ${event}`))
    .flatMap((block) => {
      const data = block
        .split('\n')
        .find((line) => line.startsWith('data: '))
        ?.slice('data: '.length)
      return data ? [data] : []
    })
}

function decodeSseArchive(stream: string): Uint8Array {
  const chunks = readSseDataAll(stream, 'archive-chunk')
    .map((data) => JSON.parse(data) as { data: string; index: number })
    .sort((left, right) => left.index - right.index)
    .map((chunk) => Buffer.from(chunk.data, 'base64'))
  return new Uint8Array(Buffer.concat(chunks))
}

function readStoredZipEntries(archive: Uint8Array): Map<string, Uint8Array> {
  const entries = new Map<string, Uint8Array>()
  const view = new DataView(
    archive.buffer,
    archive.byteOffset,
    archive.byteLength,
  )
  const decoder = new TextDecoder()
  let offset = 0
  while (
    offset + 30 <= archive.byteLength &&
    view.getUint32(offset, true) === 0x04034b50
  ) {
    const size = view.getUint32(offset + 18, true)
    const pathLength = view.getUint16(offset + 26, true)
    const extraLength = view.getUint16(offset + 28, true)
    const pathStart = offset + 30
    const bodyStart = pathStart + pathLength + extraLength
    const path = decoder.decode(
      archive.subarray(pathStart, pathStart + pathLength),
    )
    entries.set(path, archive.slice(bodyStart, bodyStart + size))
    offset = bodyStart + size
  }
  return entries
}
