import assert from 'node:assert/strict'
import test from 'node:test'
import type { FileStore, StoredFile } from '@mba-demo/files'
import {
  createStudioProjectsRoute,
  type StudioProject,
  type StudioProjectRepository,
} from './studio-projects.js'

const agtx = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3])

test('Studio projects require organization access', async () => {
  const app = createStudioProjectsRoute({
    getAccess: async () => undefined,
    repository: createRepository(),
    fileStore: new MemoryFiles(),
  })

  const response = await app.request('/')

  assert.equal(response.status, 401)
  assert.deepEqual(await response.json(), { message: 'Unauthorized' })
})

test('Studio projects create, list, read, and update AGTX files', async () => {
  const repository = createRepository()
  const fileStore = new MemoryFiles()
  const app = createStudioProjectsRoute({
    getAccess: async () => ({ organizationId: 'org-1' }),
    repository,
    fileStore,
  })

  const createdResponse = await app.request('/?name=Demo%20agent.agtx', {
    method: 'POST',
    headers: { 'Content-Type': 'application/vnd.mba.agent+zip' },
    body: agtx,
  })
  const created = (await createdResponse.json()) as {
    project: { id: string; fileUrl: string }
  }
  const listResponse = await app.request('/?limit=5')
  const fileResponse = await app.request(`/${created.project.id}/file`)
  const updatedBytes = new Uint8Array([...agtx, 4])
  const updateResponse = await app.request(`/${created.project.id}/file`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/vnd.mba.agent+zip' },
    body: updatedBytes,
  })
  const renameResponse = await app.request(`/${created.project.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Renamed agent.agtx' }),
  })
  const conversation = [
    { role: 'user', content: 'Create an agent for customer support.' },
  ]
  const conversationResponse = await app.request(
    `/${created.project.id}/conversation`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: conversation }),
    },
  )
  const detailResponse = await app.request(`/${created.project.id}`)

  assert.equal(createdResponse.status, 201)
  assert.equal(
    created.project.fileUrl,
    `/api/studio/projects/${created.project.id}/file`,
  )
  assert.deepEqual(
    (
      (await listResponse.json()) as { projects: Array<{ id: string }> }
    ).projects.map(({ id }) => id),
    [created.project.id],
  )
  assert.deepEqual(new Uint8Array(await fileResponse.arrayBuffer()), agtx)
  assert.equal(updateResponse.status, 200)
  assert.equal(renameResponse.status, 200)
  assert.equal(conversationResponse.status, 200)
  assert.deepEqual(
    ((await detailResponse.json()) as { project: { conversation: unknown[] } })
      .project.conversation,
    conversation,
  )
  assert.equal(repository.projects[0]?.name, 'Renamed agent.agtx')
  assert.deepEqual(
    fileStore.values.get(repository.projects[0]?.filePath ?? ''),
    updatedBytes,
  )
  assert.equal(repository.lastUpdate?.organizationId, 'org-1')
})

test('Studio project queries remain scoped to the active organization', async () => {
  const repository = createRepository()
  const app = createStudioProjectsRoute({
    getAccess: async () => ({ organizationId: 'org-2' }),
    repository,
    fileStore: new MemoryFiles(),
  })

  await app.request('/?search=agent')
  await app.request('/missing')

  assert.equal(repository.lastListOrganizationId, 'org-2')
  assert.equal(repository.lastGetOrganizationId, 'org-2')
})

function createRepository(): StudioProjectRepository & {
  projects: StudioProject[]
  lastGetOrganizationId?: string
  lastListOrganizationId?: string
  lastUpdate?: { organizationId: string }
} {
  return new MemoryRepository()
}

class MemoryRepository implements StudioProjectRepository {
  readonly projects: StudioProject[] = []
  lastGetOrganizationId?: string
  lastListOrganizationId?: string
  lastUpdate?: { organizationId: string }

  async list({
    organizationId,
    limit,
    search,
  }: Parameters<StudioProjectRepository['list']>[0]) {
    this.lastListOrganizationId = organizationId
    const matches = this.projects.filter(
      (project) =>
        !search || project.name.toLowerCase().includes(search.toLowerCase()),
    )
    return limit ? matches.slice(0, limit) : matches
  }

  async get(organizationId: string, projectId: string) {
    this.lastGetOrganizationId = organizationId
    return this.projects.find((project) => project.id === projectId)
  }

  async create({
    name,
    filePath,
  }: Parameters<StudioProjectRepository['create']>[0]) {
    const timestamp = new Date().toISOString()
    const project: StudioProject = {
      id: 'project-1',
      name,
      filePath,
      conversation: [],
      createdAt: timestamp,
      lastEditedAt: timestamp,
      lastOpenedAt: timestamp,
    }
    this.projects.push(project)
    return project
  }

  async update({
    organizationId,
    projectId,
    opened,
    name,
    conversation,
  }: Parameters<StudioProjectRepository['update']>[0]) {
    this.lastUpdate = { organizationId }
    const project = this.projects.find((value) => value.id === projectId)
    if (!project) return undefined
    const timestamp = new Date().toISOString()
    if (name !== undefined) project.name = name
    if (conversation !== undefined) project.conversation = conversation
    if (opened) project.lastOpenedAt = timestamp
    else project.lastEditedAt = timestamp
    return project
  }
}

class MemoryFiles implements FileStore {
  readonly mode = 'fs' as const
  readonly values = new Map<string, Uint8Array>()

  async get(key: string): Promise<StoredFile | null> {
    const body = this.values.get(key)
    return body ? { body, size: body.byteLength } : null
  }

  async put(key: string, body: Uint8Array) {
    this.values.set(key, body)
  }

  async delete(key: string) {
    this.values.delete(key)
  }

  async signUrl() {
    return 'https://files.example/signed'
  }

  async close() {}
}
