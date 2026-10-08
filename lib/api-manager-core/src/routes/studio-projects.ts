import { randomUUID } from 'node:crypto'
import { auth } from '@mba-desk/auth'
import { db, member, studioProjects } from '@mba-desk/db'
import { files as defaultFiles, type FileStore } from '@mba-desk/files'
import { and, desc, eq, ilike } from 'drizzle-orm'
import { Hono } from 'hono'

const MAX_AGTX_BYTES = 512 * 1024 * 1024
const MAX_PROJECT_NAME_LENGTH = 200
const MAX_CONVERSATION_BYTES = 2 * 1024 * 1024

interface OrganizationAccess {
  organizationId: string
}

export interface StudioProject {
  id: string
  name: string
  filePath: string
  conversation: unknown[]
  createdAt: string
  lastEditedAt: string
  lastOpenedAt: string
}

export interface StudioProjectRepository {
  list: (input: {
    organizationId: string
    limit?: number
    search?: string
  }) => Promise<StudioProject[]>
  get: (
    organizationId: string,
    projectId: string,
  ) => Promise<StudioProject | undefined>
  create: (input: {
    organizationId: string
    name: string
    filePath: string
  }) => Promise<StudioProject>
  update: (input: {
    organizationId: string
    projectId: string
    name?: string
    conversation?: unknown[]
    opened?: boolean
  }) => Promise<StudioProject | undefined>
  delete: (
    organizationId: string,
    projectId: string,
  ) => Promise<StudioProject | undefined>
}

export interface StudioProjectsRouteOptions {
  fileStore?: FileStore
  getAccess?: (headers: Headers) => Promise<OrganizationAccess | undefined>
  repository?: StudioProjectRepository
}

const databaseRepository: StudioProjectRepository = {
  list: async ({ organizationId, limit, search }) => {
    const query = db
      .select()
      .from(studioProjects)
      .where(
        search
          ? and(
              eq(studioProjects.organizationId, organizationId),
              ilike(studioProjects.name, `%${search}%`),
            )
          : eq(studioProjects.organizationId, organizationId),
      )
      .orderBy(desc(studioProjects.lastOpenedAt), desc(studioProjects.id))
    const rows = limit ? await query.limit(limit) : await query
    return rows.map(publicProject)
  },
  get: async (organizationId, projectId) => {
    const [row] = await db
      .select()
      .from(studioProjects)
      .where(
        and(
          eq(studioProjects.id, projectId),
          eq(studioProjects.organizationId, organizationId),
        ),
      )
      .limit(1)
    return row ? publicProject(row) : undefined
  },
  create: async (input) => {
    const [row] = await db.insert(studioProjects).values(input).returning()
    if (!row) throw new Error('Could not create Studio project')
    return publicProject(row)
  },
  update: async ({ organizationId, projectId, name, conversation, opened }) => {
    const now = new Date()
    const [row] = await db
      .update(studioProjects)
      .set({
        ...(name === undefined ? {} : { name }),
        ...(conversation === undefined ? {} : { conversation }),
        ...(opened ? { lastOpenedAt: now } : { lastEditedAt: now }),
      })
      .where(
        and(
          eq(studioProjects.id, projectId),
          eq(studioProjects.organizationId, organizationId),
        ),
      )
      .returning()
    return row ? publicProject(row) : undefined
  },
  delete: async (organizationId, projectId) => {
    const [row] = await db
      .delete(studioProjects)
      .where(
        and(
          eq(studioProjects.id, projectId),
          eq(studioProjects.organizationId, organizationId),
        ),
      )
      .returning()
    return row ? publicProject(row) : undefined
  },
}

export const createStudioProjectsRoute = ({
  fileStore = defaultFiles,
  getAccess = getOrganizationAccess,
  repository = databaseRepository,
}: StudioProjectsRouteOptions = {}) =>
  new Hono()
    .get('/', async (c) => {
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      const limit = parseLimit(c.req.query('limit'))
      if (limit === null) return c.json({ message: 'Invalid limit' }, 400)
      const search = c.req.query('search')?.trim().slice(0, 200)
      const projects = await repository.list({
        organizationId: access.organizationId,
        ...(limit === undefined ? {} : { limit }),
        ...(search ? { search } : {}),
      })
      return c.json({
        projects: projects.map((project) => toResponse(project)),
      })
    })
    .post('/', async (c) => {
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      const name = parseName(c.req.query('name'))
      if (!name) return c.json({ message: 'Project name is required' }, 400)
      const upload = readAgtx(
        c.req.header('content-type'),
        c.req.header('content-length'),
        await c.req.arrayBuffer(),
      )
      if ('message' in upload)
        return c.json({ message: upload.message }, upload.status)
      const id = randomUUID()
      const filePath = `studio/${access.organizationId}/${id}.agtx`
      await fileStore.put(filePath, upload.body, {
        contentType: 'application/vnd.mba.agent+zip',
      })
      try {
        const project = await repository.create({
          organizationId: access.organizationId,
          name,
          filePath,
        })
        return c.json({ project: toResponse(project) }, 201)
      } catch (error) {
        await fileStore.delete(filePath).catch(() => undefined)
        throw error
      }
    })
    .get('/:id', async (c) => {
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      const project = await repository.get(
        access.organizationId,
        c.req.param('id'),
      )
      if (!project) return c.json({ message: 'Project not found' }, 404)
      return c.json({ project: toResponse(project, true) })
    })
    .post('/:id/open', async (c) => {
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      const project = await repository.update({
        organizationId: access.organizationId,
        projectId: c.req.param('id'),
        opened: true,
      })
      if (!project) return c.json({ message: 'Project not found' }, 404)
      return c.json({ project: toResponse(project) })
    })
    .patch('/:id', async (c) => {
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      const input: unknown = await c.req.json().catch(() => undefined)
      const name =
        input &&
        typeof input === 'object' &&
        'name' in input &&
        typeof input.name === 'string'
          ? parseName(input.name)
          : undefined
      if (!name) return c.json({ message: 'Project name is required' }, 400)
      const project = await repository.update({
        organizationId: access.organizationId,
        projectId: c.req.param('id'),
        name,
      })
      if (!project) return c.json({ message: 'Project not found' }, 404)
      return c.json({ project: toResponse(project) })
    })
    .delete('/:id', async (c) => {
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      const project = await repository.delete(
        access.organizationId,
        c.req.param('id'),
      )
      if (!project) return c.json({ message: 'Project not found' }, 404)
      await fileStore.delete(project.filePath)
      return c.body(null, 204)
    })
    .put('/:id/conversation', async (c) => {
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      const contentLength = Number(c.req.header('content-length'))
      if (
        Number.isFinite(contentLength) &&
        contentLength > MAX_CONVERSATION_BYTES
      )
        return c.json({ message: 'Conversation is too large' }, 413)
      const rawBody = await c.req.text()
      if (new TextEncoder().encode(rawBody).byteLength > MAX_CONVERSATION_BYTES)
        return c.json({ message: 'Conversation is too large' }, 413)
      const input: unknown = await Promise.resolve()
        .then(() => JSON.parse(rawBody || 'null') as unknown)
        .catch(() => undefined)
      const conversation =
        input &&
        typeof input === 'object' &&
        'messages' in input &&
        Array.isArray(input.messages)
          ? input.messages
          : undefined
      if (!conversation)
        return c.json({ message: 'Messages must be an array' }, 400)
      const project = await repository.update({
        organizationId: access.organizationId,
        projectId: c.req.param('id'),
        conversation,
      })
      if (!project) return c.json({ message: 'Project not found' }, 404)
      return c.json({ project: toResponse(project) })
    })
    .get('/:id/file', async (c) => {
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      const project = await repository.get(
        access.organizationId,
        c.req.param('id'),
      )
      if (!project) return c.json({ message: 'Project not found' }, 404)
      const file = await fileStore.get(project.filePath)
      if (!file) return c.json({ message: 'Project file not found' }, 404)
      c.header('Cache-Control', 'private, no-store')
      c.header('Content-Type', 'application/vnd.mba.agent+zip')
      c.header('Content-Length', String(file.size))
      return c.body(new Uint8Array(file.body).buffer)
    })
    .put('/:id/file', async (c) => {
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      const project = await repository.get(
        access.organizationId,
        c.req.param('id'),
      )
      if (!project) return c.json({ message: 'Project not found' }, 404)
      const upload = readAgtx(
        c.req.header('content-type'),
        c.req.header('content-length'),
        await c.req.arrayBuffer(),
      )
      if ('message' in upload)
        return c.json({ message: upload.message }, upload.status)
      await fileStore.put(project.filePath, upload.body, {
        contentType: 'application/vnd.mba.agent+zip',
      })
      const updated = await repository.update({
        organizationId: access.organizationId,
        projectId: project.id,
      })
      if (!updated) return c.json({ message: 'Project not found' }, 404)
      return c.json({ project: toResponse(updated) })
    })

function toResponse(project: StudioProject, includeConversation = false) {
  return {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    lastEditedAt: project.lastEditedAt,
    lastOpenedAt: project.lastOpenedAt,
    fileUrl: `/api/studio/projects/${project.id}/file`,
    ...(includeConversation ? { conversation: project.conversation } : {}),
  }
}

function publicProject(row: typeof studioProjects.$inferSelect): StudioProject {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    lastEditedAt: row.lastEditedAt.toISOString(),
    lastOpenedAt: row.lastOpenedAt.toISOString(),
  }
}

function parseName(value: string | undefined) {
  const name = value?.trim()
  return name && name.length <= MAX_PROJECT_NAME_LENGTH ? name : undefined
}

function parseLimit(value: string | undefined): number | undefined | null {
  if (value === undefined) return undefined
  if (!/^[1-9]\d*$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed <= 100 ? parsed : null
}

function readAgtx(
  contentTypeHeader: string | undefined,
  contentLengthHeader: string | undefined,
  arrayBuffer: ArrayBuffer,
) {
  const contentType = contentTypeHeader?.split(';')[0]
  if (
    contentType !== 'application/vnd.mba.agent+zip' &&
    contentType !== 'application/zip'
  )
    return { message: 'Expected an AGTX file', status: 415 as const }
  const contentLength = Number(contentLengthHeader)
  if (Number.isFinite(contentLength) && contentLength > MAX_AGTX_BYTES)
    return { message: 'AGTX file is too large', status: 413 as const }
  const body = new Uint8Array(arrayBuffer)
  if (body.length === 0)
    return { message: 'AGTX file is empty', status: 400 as const }
  if (body.length > MAX_AGTX_BYTES)
    return { message: 'AGTX file is too large', status: 413 as const }
  if (
    body.length < 4 ||
    body[0] !== 0x50 ||
    body[1] !== 0x4b ||
    body[2] !== 0x03 ||
    body[3] !== 0x04
  )
    return { message: 'AGTX file is not a ZIP archive', status: 400 as const }
  return { body }
}

async function getOrganizationAccess(
  headers: Headers,
): Promise<OrganizationAccess | undefined> {
  const session = await auth.api.getSession({ headers })
  const organizationId = session?.session.activeOrganizationId
  if (!session || !organizationId) return undefined
  const [membership] = await db
    .select({ id: member.id })
    .from(member)
    .where(
      and(
        eq(member.organizationId, organizationId),
        eq(member.userId, session.user.id),
      ),
    )
    .limit(1)
  return membership ? { organizationId } : undefined
}
