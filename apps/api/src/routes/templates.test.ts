import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  WhatsAppTemplatesApiError,
  type WhatsAppTemplatesClientContract,
} from '@mba-desk/wa-templates'
import type { WhatsAppMediaClientContract } from '@mba-desk/wa-media'
import { createTemplatesRoute } from './templates.js'

const configuration = {
  wabaId: 'waba-id',
  phoneNumberId: 'phone-id',
  accessToken: 'secret',
}
const template = {
  id: 'template-1',
  name: 'order_ready',
  language: 'en_US',
  category: 'UTILITY' as const,
  status: 'APPROVED' as const,
  components: [{ type: 'BODY' as const, text: 'Order {{1}} is ready.' }],
}

describe('templates management route', () => {
  it('lists templates for an organization member using an owned channel', async () => {
    let options: Parameters<WhatsAppTemplatesClientContract['list']>[0]
    const route = createTemplatesRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository: { getConfiguration: async () => configuration },
      createTemplatesClient: () =>
        createClient({
          list: async (input) => {
            options = input
            return { data: [template], paging: { cursors: { after: 'next' } } }
          },
        }),
    })
    const response = await route.request(
      '/?channelId=7&category=UTILITY&status=APPROVED&limit=25',
    )
    assert.equal(response.status, 200)
    assert.equal(options!.category, 'UTILITY')
    assert.equal(options!.status, 'APPROVED')
    assert.equal(options!.limit, 25)
    assert.ok(options!.fields?.includes('quality_score'))
    assert.deepEqual(await response.json(), {
      templates: [template],
      paging: { cursors: { after: 'next' } },
    })
  })

  it('creates, reads, updates, and deletes templates for managers', async () => {
    const calls: string[] = []
    const route = createTemplatesRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'owner' }),
      repository: { getConfiguration: async () => configuration },
      createTemplatesClient: () =>
        createClient({
          create: async (input) => {
            calls.push(`create:${input.name}`)
            return { id: template.id, status: 'PENDING', category: 'UTILITY' }
          },
          get: async (id) => {
            calls.push(`get:${id}`)
            return template
          },
          update: async (id) => {
            calls.push(`update:${id}`)
            return { success: true }
          },
          deleteById: async (id, name) => {
            calls.push(`delete:${id}:${name}`)
            return { success: true }
          },
        }),
    })
    const create = await route.request('/7', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'order_ready',
        language: 'en_US',
        category: 'UTILITY',
        components: [{ type: 'BODY', text: 'Your order is ready.' }],
      }),
    })
    assert.equal(create.status, 201)
    assert.equal((await route.request('/7/template-1')).status, 200)
    assert.equal(
      (
        await route.request('/7/template-1', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            components: [{ type: 'BODY', text: 'Your order is done.' }],
          }),
        })
      ).status,
      200,
    )
    assert.equal(
      (
        await route.request('/7/template-1', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'order_ready' }),
        })
      ).status,
      200,
    )
    assert.deepEqual(calls, [
      'create:order_ready',
      'get:template-1',
      'update:template-1',
      'delete:template-1:order_ready',
    ])
  })

  it('allows reads for members but blocks every mutation', async () => {
    const route = createTemplatesRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository: { getConfiguration: async () => configuration },
    })
    const response = await route.request('/7', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'order_ready',
        language: 'en_US',
        category: 'UTILITY',
        components: [{ type: 'BODY', text: 'Ready.' }],
      }),
    })
    assert.equal(response.status, 403)
  })

  it('uploads validated template header media through wa-media', async () => {
    let uploadKind = ''
    const route = createTemplatesRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'admin' }),
      repository: { getConfiguration: async () => configuration },
      createMediaClient: () =>
        createMediaClient(async (input) => {
          uploadKind = input.kind
          return { id: 'media-123' }
        }),
    })
    const form = new FormData()
    form.set('kind', 'image')
    form.set(
      'file',
      new File([new Uint8Array([1, 2, 3])], 'header.png', {
        type: 'image/png',
      }),
    )
    const response = await route.request('/7/media', {
      method: 'POST',
      body: form,
    })
    assert.equal(response.status, 200)
    assert.equal(uploadKind, 'image')
    assert.deepEqual(await response.json(), { media: { id: 'media-123' } })
  })

  it('validates requests and maps provider failures safely', async () => {
    const route = createTemplatesRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'admin' }),
      repository: { getConfiguration: async () => configuration },
      createTemplatesClient: () =>
        createClient({
          list: async () => {
            throw new WhatsAppTemplatesApiError(400, {
              error: { message: 'Invalid template', code: 100 },
            })
          },
        }),
    })
    const invalid = await route.request('/7', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Not Valid' }),
    })
    assert.equal(invalid.status, 400)
    const failed = await route.request('/?channelId=7')
    assert.equal(failed.status, 502)
    assert.deepEqual(await failed.json(), {
      message: 'Meta rejected the template request: Invalid template',
      providerStatus: 400,
      providerCode: 100,
    })
  })
})

function createClient(
  overrides: Partial<WhatsAppTemplatesClientContract>,
): WhatsAppTemplatesClientContract {
  const unimplemented = async (): Promise<never> => {
    throw new Error('Unexpected templates client call')
  }
  return {
    create: unimplemented,
    createFromLibrary: unimplemented,
    list: unimplemented,
    get: unimplemented,
    update: unimplemented,
    deleteByName: unimplemented,
    deleteById: unimplemented,
    deleteByIds: unimplemented,
    getNamespace: unimplemented,
    upsertAuthentication: unimplemented,
    migrate: unimplemented,
    listLibrary: unimplemented,
    createGroup: unimplemented,
    getGroup: unimplemented,
    updateGroup: unimplemented,
    deleteGroup: unimplemented,
    ...overrides,
  }
}

function createMediaClient(
  upload: WhatsAppMediaClientContract['upload'],
): WhatsAppMediaClientContract {
  const unimplemented = async (): Promise<never> => {
    throw new Error('Unexpected media client call')
  }
  return {
    upload,
    uploadAudio: unimplemented,
    uploadDocument: unimplemented,
    uploadImage: unimplemented,
    uploadSticker: unimplemented,
    uploadVideo: unimplemented,
    getMediaUrl: unimplemented,
    download: unimplemented,
    delete: unimplemented,
  }
}
