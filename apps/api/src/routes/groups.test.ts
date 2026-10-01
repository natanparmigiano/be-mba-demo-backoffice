import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createGroupsRoute,
  encodeGroupCursor,
  type GroupDetail,
  type GroupsRepository,
  type GroupSummary,
} from './groups.js'

const group: GroupSummary = {
  id: 23,
  channel: { id: 4, waPhoneNumber: '+55 11 99999-0000' },
  providerGroupId: 'group-provider-id',
  subject: 'Product team',
  description: 'Product launch planning',
  joinApprovalMode: 'admin_approval',
  lastWebhookField: 'group_settings_update',
  lastEventType: 'subject',
  lastEventAt: '2026-09-30T09:30:00.000Z',
  firstSeenAt: '2026-09-28T10:00:00.000Z',
  updatedAt: '2026-09-30T10:00:00.000Z',
}

const groupDetail: GroupDetail = {
  ...group,
  inviteLink: 'https://chat.whatsapp.com/example',
  rawGroup: {
    group_id: 'group-provider-id',
    subject: 'Product team',
    type: 'subject',
  },
}

describe('groups route', () => {
  it('lists groups for the active organization with parsed cursor filters', async () => {
    let receivedOrganizationId: string | undefined
    let receivedQuery: Parameters<GroupsRepository['list']>[1] | undefined
    const nextCursor = encodeGroupCursor({
      id: 23,
      updatedAt: group.updatedAt,
    })
    const route = createGroupsRoute({
      getAccess: async () => ({ organizationId: 'org-one' }),
      repository: createRepository({
        list: async (organizationId, query) => {
          receivedOrganizationId = organizationId
          receivedQuery = query
          return { groups: [group], nextCursor: null }
        },
      }),
    })

    const response = await route.request(
      `/?search=Product&channelId=4&limit=25&cursor=${encodeURIComponent(nextCursor)}`,
    )

    assert.equal(response.status, 200)
    assert.equal(receivedOrganizationId, 'org-one')
    assert.deepEqual(receivedQuery, {
      channelId: 4,
      cursor: { id: 23, updatedAt: group.updatedAt },
      limit: 25,
      search: 'Product',
    })
    assert.deepEqual(await response.json(), {
      groups: [group],
      nextCursor: null,
    })
  })

  it('rejects malformed cursors before querying the repository', async () => {
    let listCalled = false
    const route = createGroupsRoute({
      getAccess: async () => ({ organizationId: 'org-one' }),
      repository: createRepository({
        list: async () => {
          listCalled = true
          return { groups: [], nextCursor: null }
        },
      }),
    })

    const response = await route.request('/?cursor=not-a-cursor')

    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { message: 'Invalid cursor' })
    assert.equal(listCalled, false)
  })

  it('requires an active organization membership', async () => {
    const route = createGroupsRoute({
      getAccess: async () => undefined,
      repository: createRepository(),
    })

    const response = await route.request('/')

    assert.equal(response.status, 401)
    assert.deepEqual(await response.json(), { message: 'Unauthorized' })
  })

  it('returns organization-scoped group details', async () => {
    let requestedGroupId: number | undefined
    let requestedOrganizationId: string | undefined
    const route = createGroupsRoute({
      getAccess: async () => ({ organizationId: 'org-two' }),
      repository: createRepository({
        get: async (organizationId, groupId) => {
          requestedOrganizationId = organizationId
          requestedGroupId = groupId
          return groupDetail
        },
      }),
    })

    const response = await route.request('/23')

    assert.equal(response.status, 200)
    assert.equal(requestedOrganizationId, 'org-two')
    assert.equal(requestedGroupId, 23)
    assert.deepEqual(await response.json(), { group: groupDetail })
  })

  it('returns not found without exposing another organization group', async () => {
    const route = createGroupsRoute({
      getAccess: async () => ({ organizationId: 'org-one' }),
      repository: createRepository({ get: async () => undefined }),
    })

    const response = await route.request('/99')

    assert.equal(response.status, 404)
    assert.deepEqual(await response.json(), { message: 'Group not found' })
  })
})

function createRepository(
  overrides: Partial<GroupsRepository> = {},
): GroupsRepository {
  return {
    list: async () => ({ groups: [], nextCursor: null }),
    get: async () => groupDetail,
    ...overrides,
  }
}
