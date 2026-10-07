import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { FileStore, StoredFile } from '@mba-desk/files'
import {
  createOrganizationLogosRoute,
  type OrganizationLogoRepository,
} from './organization-logos.js'

describe('organization logo route', () => {
  it('stores, serves, replaces, and removes a 512px organization logo', async () => {
    const values = new Map<string, StoredFile>()
    let logo: string | null = 'organization-logos/org-one/old.png'
    values.set(logo, stored(png(512)))
    const repository = logoRepository(
      () => logo,
      (value) => {
        logo = value
      },
    )
    const route = createOrganizationLogosRoute({
      fileStore: fileStore(values),
      repository,
      getAccess: async (_headers, organizationId) => ({
        organizationId,
        canManage: true,
      }),
    })

    const upload = await route.request('/org-one', {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: png(512),
    })
    assert.equal(upload.status, 200)
    assert.match(logo ?? '', /^organization-logos\/org-one\/.+\.png$/)
    assert.equal(values.has('organization-logos/org-one/old.png'), false)

    const download = await route.request('/org-one')
    assert.equal(download.status, 200)
    assert.equal(download.headers.get('content-type'), 'image/png')

    const removal = await route.request('/org-one', { method: 'DELETE' })
    assert.equal(removal.status, 204)
    assert.equal(logo, null)
    assert.equal(values.size, 0)
  })

  it('requires manager access and an exact 512px PNG', async () => {
    const route = createOrganizationLogosRoute({
      fileStore: fileStore(new Map()),
      repository: logoRepository(
        () => null,
        () => undefined,
      ),
      getAccess: async (_headers, organizationId) => ({
        organizationId,
        canManage: false,
      }),
    })

    assert.equal(
      (await route.request('/org-one', { method: 'PUT', body: png(512) }))
        .status,
      403,
    )

    const managerRoute = createOrganizationLogosRoute({
      fileStore: fileStore(new Map()),
      repository: logoRepository(
        () => null,
        () => undefined,
      ),
      getAccess: async (_headers, organizationId) => ({
        organizationId,
        canManage: true,
      }),
    })
    const wrongSize = await managerRoute.request('/org-one', {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: png(256),
    })
    assert.equal(wrongSize.status, 400)
  })
})

function png(size: number) {
  const body = new Uint8Array(24)
  body.set([137, 80, 78, 71, 13, 10, 26, 10])
  body.set([73, 72, 68, 82], 12)
  const view = new DataView(body.buffer)
  view.setUint32(16, size)
  view.setUint32(20, size)
  return body
}

function stored(body: Uint8Array): StoredFile {
  return { body, contentType: 'image/png', size: body.length }
}

function fileStore(values: Map<string, StoredFile>): FileStore {
  return {
    mode: 'fs',
    get: async (key) => values.get(key) ?? null,
    put: async (key, body, options) => {
      values.set(key, {
        body,
        contentType: options?.contentType,
        size: body.length,
      })
    },
    delete: async (key) => {
      values.delete(key)
    },
    signUrl: async () => '',
    close: async () => undefined,
  }
}

function logoRepository(
  getLogo: () => string | null,
  setLogo: (logo: string | null) => void,
): OrganizationLogoRepository {
  return {
    get: async () => ({ logo: getLogo() }),
    set: async (_organizationId, logo) => setLogo(logo),
  }
}
