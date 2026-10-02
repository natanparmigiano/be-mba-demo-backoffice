import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createContactsRoute,
  encodeContactCursor,
  type ContactDetail,
  type ContactSummary,
  type ContactsRepository,
} from './contacts.js'

const contact: ContactSummary = {
  id: 17,
  channel: { id: 4, waPhoneNumber: '+55 11 99999-0000' },
  waId: '5511999990000',
  userId: 'meta-user-id',
  profileName: 'Ada Lovelace',
  profileUsername: 'ada',
  firstSeenAt: '2026-09-28T10:00:00.000Z',
  lastSeenAt: '2026-09-30T10:00:00.000Z',
}

const contactDetail: ContactDetail = {
  ...contact,
  parentUserId: null,
  identityKeyHash: 'identity-hash',
  input: '+5511999990000',
  rawContact: { profile: { name: 'Ada Lovelace' }, wa_id: '5511999990000' },
}

describe('contacts route', () => {
  it('lists contacts for the active organization with parsed cursor filters', async () => {
    let receivedOrganizationId: string | undefined
    let receivedQuery: Parameters<ContactsRepository['list']>[1] | undefined
    const nextCursor = encodeContactCursor({
      id: 17,
      lastSeenAt: contact.lastSeenAt,
    })
    const route = createContactsRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository: createRepository({
        list: async (organizationId, query) => {
          receivedOrganizationId = organizationId
          receivedQuery = query
          return { contacts: [contact], nextCursor: null }
        },
      }),
    })

    const response = await route.request(
      `/?search=Ada&channelId=4&limit=25&cursor=${encodeURIComponent(nextCursor)}`,
    )

    assert.equal(response.status, 200)
    assert.equal(receivedOrganizationId, 'org-one')
    assert.deepEqual(receivedQuery, {
      channelId: 4,
      cursor: { id: 17, lastSeenAt: contact.lastSeenAt },
      limit: 25,
      search: 'Ada',
    })
    assert.deepEqual(await response.json(), {
      contacts: [contact],
      nextCursor: null,
    })
  })

  it('rejects malformed cursors before querying the repository', async () => {
    let listCalled = false
    const route = createContactsRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository: createRepository({
        list: async () => {
          listCalled = true
          return { contacts: [], nextCursor: null }
        },
      }),
    })

    const response = await route.request('/?cursor=not-a-cursor')

    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { message: 'Invalid cursor' })
    assert.equal(listCalled, false)
  })

  it('requires an active organization membership', async () => {
    const route = createContactsRoute({
      getAccess: async () => undefined,
      repository: createRepository(),
    })

    const response = await route.request('/')

    assert.equal(response.status, 401)
    assert.deepEqual(await response.json(), { message: 'Unauthorized' })
  })

  it('returns organization-scoped contact details', async () => {
    let requestedContactId: number | undefined
    let requestedOrganizationId: string | undefined
    const route = createContactsRoute({
      getAccess: async () => ({ organizationId: 'org-two', role: 'member' }),
      repository: createRepository({
        get: async (organizationId, contactId) => {
          requestedOrganizationId = organizationId
          requestedContactId = contactId
          return contactDetail
        },
      }),
    })

    const response = await route.request('/17')

    assert.equal(response.status, 200)
    assert.equal(requestedOrganizationId, 'org-two')
    assert.equal(requestedContactId, 17)
    assert.deepEqual(await response.json(), { contact: contactDetail })
  })

  it('returns not found without exposing another organization contact', async () => {
    const route = createContactsRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository: createRepository({ get: async () => undefined }),
    })

    const response = await route.request('/99')

    assert.equal(response.status, 404)
    assert.deepEqual(await response.json(), { message: 'Contact not found' })
  })

  it('lets organization managers create contacts on owned channels', async () => {
    let receivedInput: Parameters<ContactsRepository['create']>[1] | undefined
    const route = createContactsRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'admin' }),
      repository: createRepository({
        create: async (_organizationId, input) => {
          receivedInput = input
          return contactDetail
        },
      }),
    })

    const response = await route.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        channelId: 4,
        waId: '5511999990000',
        profileName: 'Ada Lovelace',
      }),
    })

    assert.equal(response.status, 201)
    assert.deepEqual(receivedInput, {
      channelId: 4,
      waId: '5511999990000',
      profileName: 'Ada Lovelace',
    })
    assert.deepEqual(await response.json(), { contact: contactDetail })
  })

  it('previews and confirms cascading contact deletion for managers', async () => {
    let confirmation: string | undefined
    const route = createContactsRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'owner' }),
      repository: createRepository({
        delete: async (_organizationId, _contactId, value) => {
          confirmation = value
          return { status: 'deleted', impact: { chats: 1, messages: 2 } }
        },
      }),
    })

    const preview = await route.request('/17/deletion-impact')
    assert.equal(preview.status, 200)
    assert.deepEqual(await preview.json(), {
      impact: {
        confirmationText: contact.waId,
        chats: 1,
        messages: 2,
      },
    })

    const response = await route.request('/17', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirmation: contact.waId }),
    })
    assert.equal(response.status, 200)
    assert.equal(confirmation, contact.waId)
    assert.deepEqual(await response.json(), {
      deleted: true,
      impact: { chats: 1, messages: 2 },
    })
  })

  it('updates managed contact fields without requiring a provider user ID', async () => {
    let receivedInput: Parameters<ContactsRepository['update']>[2] | undefined
    const route = createContactsRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'admin' }),
      repository: createRepository({
        update: async (_organizationId, _contactId, input) => {
          receivedInput = input
          return contactDetail
        },
      }),
    })

    const response = await route.request('/17', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        waId: '5511888880000',
        profileName: 'Ada Byron',
        profileUsername: '',
      }),
    })

    assert.equal(response.status, 200)
    assert.deepEqual(receivedInput, {
      waId: '5511888880000',
      profileName: 'Ada Byron',
      profileUsername: '',
    })
  })

  it('forbids contact mutations for regular organization members', async () => {
    const route = createContactsRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository: createRepository(),
    })

    const response = await route.request('/17/deletion-impact')
    assert.equal(response.status, 403)
    assert.deepEqual(await response.json(), {
      message: 'Organization owner or admin required',
    })
  })
})

function createRepository(
  overrides: Partial<ContactsRepository> = {},
): ContactsRepository {
  return {
    list: async () => ({ contacts: [], nextCursor: null }),
    get: async () => contactDetail,
    create: async () => contactDetail,
    update: async () => contactDetail,
    getDeletionPreview: async () => ({
      confirmationText: contact.waId ?? String(contact.id),
      chats: 1,
      messages: 2,
    }),
    delete: async () => ({
      status: 'deleted',
      impact: { chats: 1, messages: 2 },
    }),
    ...overrides,
  }
}
