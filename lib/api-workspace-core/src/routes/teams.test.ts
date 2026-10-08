import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createTeamsRoute,
  type TeamDirectory,
  type TeamsRepository,
  type TeamSummary,
} from './teams.js'

const salesTeam: TeamSummary = {
  id: 'team-sales',
  name: 'Sales',
  slug: 'sales',
  color: '#0866ff',
  isDefault: true,
  members: [{ id: 'user-1', name: 'Ada Lovelace', email: 'ada@example.com' }],
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
}

const directory: TeamDirectory = {
  teams: [salesTeam],
  organizationMembers: [
    {
      id: 'user-1',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      role: 'admin',
    },
    {
      id: 'user-2',
      name: 'Grace Hopper',
      email: 'grace@example.com',
      role: 'member',
    },
  ],
}

describe('teams route', () => {
  it('lists teams and member choices for the active organization', async () => {
    let organizationId: string | undefined
    const route = createTeamsRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository: createRepository({
        list: async (value) => {
          organizationId = value
          return directory
        },
      }),
    })

    const response = await route.request('/')

    assert.equal(response.status, 200)
    assert.equal(organizationId, 'org-one')
    assert.deepEqual(await response.json(), directory)
  })

  it('requires an active organization membership', async () => {
    const route = createTeamsRoute({
      getAccess: async () => undefined,
      repository: createRepository(),
    })

    const response = await route.request('/')

    assert.equal(response.status, 401)
    assert.deepEqual(await response.json(), { message: 'Unauthorized' })
  })

  it('does not expose a team from another organization', async () => {
    const route = createTeamsRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository: createRepository({ get: async () => undefined }),
    })

    const response = await route.request('/team-other')

    assert.equal(response.status, 404)
    assert.deepEqual(await response.json(), { message: 'Team not found' })
  })

  it('lets organization managers create a team with organization users', async () => {
    let receivedOrganizationId: string | undefined
    let receivedInput: Parameters<TeamsRepository['create']>[1] | undefined
    const route = createTeamsRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'admin' }),
      repository: createRepository({
        create: async (organizationId, input) => {
          receivedOrganizationId = organizationId
          receivedInput = input
          return { status: 'ok', team: salesTeam }
        },
      }),
    })

    const response = await route.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Sales',
        slug: 'sales',
        color: '#0866FF',
        userIds: ['user-1', 'user-1'],
      }),
    })

    assert.equal(response.status, 201)
    assert.equal(receivedOrganizationId, 'org-one')
    assert.deepEqual(receivedInput, {
      name: 'Sales',
      slug: 'sales',
      color: '#0866ff',
      userIds: ['user-1'],
    })
    assert.deepEqual(await response.json(), { team: salesTeam })
  })

  it('rejects invalid slugs before writing', async () => {
    let createCalled = false
    const route = createTeamsRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'owner' }),
      repository: createRepository({
        create: async () => {
          createCalled = true
          return { status: 'ok', team: salesTeam }
        },
      }),
    })

    const response = await route.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Sales',
        slug: 'Sales Team',
        color: '#0866ff',
        userIds: [],
      }),
    })

    assert.equal(response.status, 400)
    assert.equal(createCalled, false)
  })

  it('updates fields and membership for organization managers', async () => {
    let receivedInput: Parameters<TeamsRepository['update']>[2] | undefined
    const route = createTeamsRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'owner' }),
      repository: createRepository({
        update: async (_organizationId, _teamId, input) => {
          receivedInput = input
          return { status: 'ok', team: salesTeam }
        },
      }),
    })

    const response = await route.request('/team-sales', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Revenue',
        userIds: ['user-2'],
      }),
    })

    assert.equal(response.status, 200)
    assert.deepEqual(receivedInput, {
      name: 'Revenue',
      userIds: ['user-2'],
    })
  })

  it('rejects users outside the active organization', async () => {
    const route = createTeamsRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'admin' }),
      repository: createRepository({
        update: async () => ({ status: 'invalid_members' }),
      }),
    })

    const response = await route.request('/team-sales', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userIds: ['user-from-another-org'] }),
    })

    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), {
      message: 'Every selected user must belong to the active organization',
    })
  })

  it('lets managers delete only an organization-scoped team', async () => {
    let requestedOrganizationId: string | undefined
    let requestedTeamId: string | undefined
    const route = createTeamsRoute({
      getAccess: async () => ({ organizationId: 'org-two', role: 'admin' }),
      repository: createRepository({
        delete: async (organizationId, teamId) => {
          requestedOrganizationId = organizationId
          requestedTeamId = teamId
          return true
        },
      }),
    })

    const response = await route.request('/team-sales', { method: 'DELETE' })

    assert.equal(response.status, 200)
    assert.equal(requestedOrganizationId, 'org-two')
    assert.equal(requestedTeamId, 'team-sales')
    assert.deepEqual(await response.json(), { deleted: true })
  })

  it('lets managers make an organization-scoped team the default', async () => {
    let requestedOrganizationId: string | undefined
    let requestedTeamId: string | undefined
    const route = createTeamsRoute({
      getAccess: async () => ({ organizationId: 'org-two', role: 'admin' }),
      repository: createRepository({
        makeDefault: async (organizationId, teamId) => {
          requestedOrganizationId = organizationId
          requestedTeamId = teamId
          return salesTeam
        },
      }),
    })

    const response = await route.request('/team-sales/default', {
      method: 'POST',
    })

    assert.equal(response.status, 200)
    assert.equal(requestedOrganizationId, 'org-two')
    assert.equal(requestedTeamId, 'team-sales')
    assert.deepEqual(await response.json(), { team: salesTeam })
  })

  it('does not make a team from another organization the default', async () => {
    const route = createTeamsRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'owner' }),
      repository: createRepository({
        makeDefault: async () => undefined,
      }),
    })

    const response = await route.request('/team-other/default', {
      method: 'POST',
    })

    assert.equal(response.status, 404)
    assert.deepEqual(await response.json(), { message: 'Team not found' })
  })

  it('forbids regular members from changing the default team', async () => {
    const route = createTeamsRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository: createRepository(),
    })

    const response = await route.request('/team-sales/default', {
      method: 'POST',
    })

    assert.equal(response.status, 403)
    assert.deepEqual(await response.json(), {
      message: 'Organization owner or admin required',
    })
  })

  it('forbids mutations for regular organization members', async () => {
    const route = createTeamsRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository: createRepository(),
    })

    const response = await route.request('/team-sales', { method: 'DELETE' })

    assert.equal(response.status, 403)
    assert.deepEqual(await response.json(), {
      message: 'Organization owner or admin required',
    })
  })
})

function createRepository(
  overrides: Partial<TeamsRepository> = {},
): TeamsRepository {
  return {
    list: async () => directory,
    get: async () => salesTeam,
    create: async () => ({ status: 'ok', team: salesTeam }),
    update: async () => ({ status: 'ok', team: salesTeam }),
    makeDefault: async () => salesTeam,
    delete: async () => true,
    ...overrides,
  }
}
