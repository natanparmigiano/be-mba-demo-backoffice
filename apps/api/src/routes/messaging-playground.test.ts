import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { FileStore, SignUrlOptions } from '@mba-demo/files'
import {
  WhatsAppMessagingApiError,
  type SendMessageInput,
  type WhatsAppMessagingClientContract,
} from '@mba-demo/wa-messaging'
import {
  createMessagingPlaygroundRoute,
  type MessagingPlaygroundRepository,
} from './messaging-playground.js'

const configuration = {
  phoneNumberId: 'phone-id',
  accessToken: 'secret-access-token',
}

describe('messaging playground route', () => {
  it('sends a validated message through the selected organization channel', async () => {
    let sentMessage: SendMessageInput | undefined
    let requestedOrganizationId: string | undefined
    const route = createMessagingPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'admin' }),
      repository: createRepository({
        getConfiguration: async (organizationId) => {
          requestedOrganizationId = organizationId
          return configuration
        },
      }),
      createMessagingClient: () =>
        createClient({
          send: async (message) => {
            sentMessage = message
            return messageResponse
          },
        }),
    })

    const response = await route.request('/7/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: '5511999999999',
        type: 'text',
        text: { body: 'Hello', preview_url: true },
      }),
    })

    assert.equal(response.status, 200)
    assert.equal(requestedOrganizationId, 'org-one')
    assert.deepEqual(sentMessage, {
      to: '5511999999999',
      type: 'text',
      text: { body: 'Hello', preview_url: true },
    })
    assert.deepEqual(await response.json(), { result: messageResponse })
  })

  it('dispatches message read and typing actions', async () => {
    const calls: string[] = []
    const route = createMessagingPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'owner' }),
      repository: createRepository(),
      createMessagingClient: () =>
        createClient({
          markAsRead: async (messageId) => {
            calls.push(`read:${messageId}`)
            return { success: true }
          },
          showTypingIndicator: async (messageId) => {
            calls.push(`typing:${messageId}`)
            return { success: true }
          },
        }),
    })

    for (const path of ['mark-read', 'typing-indicator']) {
      const response = await route.request(`/7/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messageId: 'wamid.123' }),
      })
      assert.equal(response.status, 200)
    }

    assert.deepEqual(calls, ['read:wamid.123', 'typing:wamid.123'])
  })

  it('creates scoped upload and download URLs through the file store', async () => {
    const signed: Array<{ key: string; options: SignUrlOptions }> = []
    const route = createMessagingPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'admin' }),
      repository: createRepository(),
      fileStore: createFileStore(async (key, options) => {
        signed.push({ key, options })
        return `https://files.example/${options.operation}/${key}`
      }),
    })

    const response = await route.request('/7/media-upload', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        fileName: '../../Customer photo (1).jpg',
        contentType: 'image/jpeg',
        size: 1234,
      }),
    })
    const body = (await response.json()) as {
      result: { uploadUrl: string; mediaUrl: string }
    }

    assert.equal(response.status, 200)
    assert.equal(signed.length, 2)
    assert.equal(signed[0]?.key, signed[1]?.key)
    assert.match(
      signed[0]?.key ?? '',
      /^api-playground\/[a-f0-9]{16}\/7\/[a-f0-9-]+\/Customer-photo-1\.jpg$/,
    )
    assert.deepEqual(
      signed.map(({ options }) => options),
      [
        {
          operation: 'upload',
          contentType: 'image/jpeg',
          expiresInSeconds: 300,
        },
        { operation: 'download', expiresInSeconds: 900 },
      ],
    )
    assert.match(body.result.uploadUrl, /^https:\/\/files\.example\/upload\//)
    assert.match(body.result.mediaUrl, /^https:\/\/files\.example\/download\//)
    assert.equal(
      JSON.stringify(body).includes(configuration.accessToken),
      false,
    )
  })

  it('requires an organization owner or admin for messaging operations', async () => {
    const route = createMessagingPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository: createRepository(),
    })

    const response = await route.request('/7/mark-read', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messageId: 'wamid.123' }),
    })

    assert.equal(response.status, 403)
  })

  it('maps provider errors without exposing channel credentials', async () => {
    const route = createMessagingPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'admin' }),
      repository: createRepository(),
      createMessagingClient: () =>
        createClient({
          send: async () => {
            throw new WhatsAppMessagingApiError(400, {
              error: { message: 'Invalid recipient', code: 100 },
            })
          },
        }),
    })

    const response = await route.request('/7/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: '5511999999999',
        type: 'text',
        text: { body: 'Hello' },
      }),
    })
    const body = await response.text()

    assert.equal(response.status, 502)
    assert.match(body, /Invalid recipient/)
    assert.equal(body.includes(configuration.accessToken), false)
  })
})

const messageResponse = {
  messaging_product: 'whatsapp' as const,
  contacts: [{ input: '5511999999999', wa_id: '5511999999999' }],
  messages: [{ id: 'wamid.sent' }],
}

function createRepository(
  overrides: Partial<MessagingPlaygroundRepository> = {},
): MessagingPlaygroundRepository {
  return {
    getConfiguration: async () => configuration,
    ...overrides,
  }
}

function createClient(
  overrides: Partial<WhatsAppMessagingClientContract> = {},
): WhatsAppMessagingClientContract {
  return {
    send: async () => messageResponse,
    sendTemplate: async () => messageResponse,
    sendAudio: async () => messageResponse,
    sendContacts: async () => messageResponse,
    sendDocument: async () => messageResponse,
    sendImage: async () => messageResponse,
    sendInteractive: async () => messageResponse,
    sendLocation: async () => messageResponse,
    sendReaction: async () => messageResponse,
    sendSticker: async () => messageResponse,
    sendText: async () => messageResponse,
    sendVideo: async () => messageResponse,
    markAsRead: async () => ({ success: true }),
    showTypingIndicator: async () => ({ success: true }),
    ...overrides,
  }
}

function createFileStore(signUrl: FileStore['signUrl']): FileStore {
  return {
    mode: 'fs',
    get: async () => null,
    put: async () => undefined,
    delete: async () => undefined,
    signUrl,
    close: async () => undefined,
  }
}
