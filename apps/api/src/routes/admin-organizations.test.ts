import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createAdminOrganizationsRoute,
  type AdminOrganizationDetails,
  type AdminOrganizationSummary,
} from './admin-organizations.js'

const organization: AdminOrganizationSummary = {
  id: 'org-1',
  name: 'Acme',
  slug: 'acme',
  createdAt: '2026-01-01T00:00:00.000Z',
  memberCount: 1,
  currentUserRole: null,
}

const organizationDetails: AdminOrganizationDetails = {
  ...organization,
  members: [
    {
      id: 'member-1',
      role: 'owner',
      userId: 'owner-1',
      user: { name: 'Owner', email: 'owner@example.com' },
    },
  ],
}

describe('admin organization routes', () => {
  it('requires an authenticated application administrator', async () => {
    const unauthenticated = createAdminOrganizationsRoute({
      getSession: async () => null,
      listOrganizations: async () => [],
      getOrganization: async () => undefined,
      addSelfAsAdmin: async () => 'admin',
      deleteOrganization: async () => false,
    })
    const regularUser = createAdminOrganizationsRoute({
      getSession: async () => ({ user: { id: 'user-1', role: 'user' } }),
      listOrganizations: async () => [],
      getOrganization: async () => undefined,
      addSelfAsAdmin: async () => 'admin',
      deleteOrganization: async () => false,
    })

    assert.equal((await unauthenticated.request('/')).status, 401)
    assert.equal((await regularUser.request('/')).status, 403)
  })

  it('lets an administrator search and inspect every organization', async () => {
    const searches: string[] = []
    const route = createAdminOrganizationsRoute({
      getSession: async () => ({ user: { id: 'admin-1', role: 'admin' } }),
      listOrganizations: async (_userId, search) => {
        searches.push(search)
        return [organization]
      },
      getOrganization: async () => organizationDetails,
      addSelfAsAdmin: async () => 'admin',
      deleteOrganization: async () => false,
    })

    const listResponse = await route.request('/?search=acme')
    const detailsResponse = await route.request('/org-1')

    assert.equal(listResponse.status, 200)
    assert.deepEqual(await listResponse.json(), [organization])
    assert.deepEqual(searches, ['acme'])
    assert.equal(detailsResponse.status, 200)
    assert.deepEqual(await detailsResponse.json(), organizationDetails)
  })

  it('adds the current administrator to an organization as an admin', async () => {
    const additions: Array<{ organizationId: string; userId: string }> = []
    const route = createAdminOrganizationsRoute({
      getSession: async () => ({ user: { id: 'admin-1', role: 'admin' } }),
      listOrganizations: async () => [],
      getOrganization: async () => organizationDetails,
      addSelfAsAdmin: async (organizationId, userId) => {
        additions.push({ organizationId, userId })
        return 'admin'
      },
      deleteOrganization: async () => false,
    })

    const response = await route.request('/org-1/members/self', {
      method: 'POST',
    })

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {
      organizationId: 'org-1',
      role: 'admin',
    })
    assert.deepEqual(additions, [
      { organizationId: 'org-1', userId: 'admin-1' },
    ])
  })

  it('lets an administrator delete an organization', async () => {
    const deletedIds: string[] = []
    const route = createAdminOrganizationsRoute({
      getSession: async () => ({ user: { id: 'admin-1', role: 'admin' } }),
      listOrganizations: async () => [],
      getOrganization: async () => organizationDetails,
      addSelfAsAdmin: async () => 'admin',
      deleteOrganization: async (organizationId) => {
        deletedIds.push(organizationId)
        return true
      },
    })

    const response = await route.request('/org-1', { method: 'DELETE' })

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { deleted: true })
    assert.deepEqual(deletedIds, ['org-1'])
  })
})
