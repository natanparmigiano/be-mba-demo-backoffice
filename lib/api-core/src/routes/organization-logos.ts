import { randomUUID } from 'node:crypto'
import { auth } from '@mba-desk/auth'
import { db, organization } from '@mba-desk/db'
import { files as defaultFiles, type FileStore } from '@mba-desk/files'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'

const LOGO_SIZE = 512
const MAX_LOGO_BYTES = 2 * 1024 * 1024

interface OrganizationLogoAccess {
  organizationId: string
  canManage: boolean
}

interface OrganizationLogoRecord {
  logo: string | null
}

export interface OrganizationLogoRepository {
  get: (organizationId: string) => Promise<OrganizationLogoRecord | undefined>
  set: (organizationId: string, logo: string | null) => Promise<void>
}

export interface OrganizationLogosRouteOptions {
  fileStore?: FileStore
  getAccess?: (
    headers: Headers,
    organizationId: string,
  ) => Promise<OrganizationLogoAccess | undefined>
  repository?: OrganizationLogoRepository
}

const databaseRepository: OrganizationLogoRepository = {
  get: async (organizationId) =>
    db.query.organization.findFirst({
      columns: { logo: true },
      where: (record, { eq }) => eq(record.id, organizationId),
    }),
  set: async (organizationId, logo) => {
    await db
      .update(organization)
      .set({ logo })
      .where(eq(organization.id, organizationId))
  },
}

export const createOrganizationLogosRoute = ({
  fileStore = defaultFiles,
  getAccess = getOrganizationLogoAccess,
  repository = databaseRepository,
}: OrganizationLogosRouteOptions = {}) =>
  new Hono()
    .get('/:organizationId', async (c) => {
      const organizationId = c.req.param('organizationId')
      const access = await getAccess(c.req.raw.headers, organizationId)
      if (!access) return c.json({ message: 'Logo not found' }, 404)

      const record = await repository.get(organizationId)
      if (!record?.logo) return c.json({ message: 'Logo not found' }, 404)
      const file = await fileStore.get(record.logo)
      if (!file) return c.json({ message: 'Logo not found' }, 404)

      c.header('Cache-Control', 'private, max-age=3600')
      c.header('Content-Length', String(file.size))
      c.header('Content-Type', 'image/png')
      return c.body(new Uint8Array(file.body).buffer)
    })
    .put('/:organizationId', async (c) => {
      const organizationId = c.req.param('organizationId')
      const access = await getAccess(c.req.raw.headers, organizationId)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      if (!access.canManage) return c.json({ message: 'Forbidden' }, 403)
      if (c.req.header('content-type')?.split(';')[0] !== 'image/png') {
        return c.json({ message: 'Organization logos must be PNG images' }, 415)
      }

      const contentLength = Number(c.req.header('content-length'))
      if (Number.isFinite(contentLength) && contentLength > MAX_LOGO_BYTES) {
        return c.json({ message: 'Organization logo is too large' }, 413)
      }
      const body = new Uint8Array(await c.req.arrayBuffer())
      if (body.length === 0 || body.length > MAX_LOGO_BYTES) {
        return c.json(
          { message: 'Organization logo is empty or too large' },
          413,
        )
      }
      if (!isSquarePng(body, LOGO_SIZE)) {
        return c.json(
          { message: 'Organization logo must be a 512×512 PNG' },
          400,
        )
      }

      const previous = await repository.get(organizationId)
      const storagePath = `organization-logos/${organizationId}/${randomUUID()}.png`
      await fileStore.put(storagePath, body, { contentType: 'image/png' })
      try {
        await repository.set(organizationId, storagePath)
      } catch (error) {
        await fileStore.delete(storagePath).catch(() => undefined)
        throw error
      }
      if (previous?.logo && previous.logo !== storagePath) {
        await fileStore.delete(previous.logo).catch(() => undefined)
      }
      return c.json({ logo: storagePath })
    })
    .delete('/:organizationId', async (c) => {
      const organizationId = c.req.param('organizationId')
      const access = await getAccess(c.req.raw.headers, organizationId)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      if (!access.canManage) return c.json({ message: 'Forbidden' }, 403)

      const previous = await repository.get(organizationId)
      await repository.set(organizationId, null)
      if (previous?.logo) {
        await fileStore.delete(previous.logo).catch(() => undefined)
      }
      return c.body(null, 204)
    })

function isSquarePng(body: Uint8Array, size: number) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10]
  if (
    body.length < 24 ||
    signature.some((byte, index) => body[index] !== byte) ||
    String.fromCharCode(...body.slice(12, 16)) !== 'IHDR'
  ) {
    return false
  }
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength)
  return view.getUint32(16) === size && view.getUint32(20) === size
}

async function getOrganizationLogoAccess(
  headers: Headers,
  organizationId: string,
): Promise<OrganizationLogoAccess | undefined> {
  const session = await auth.api.getSession({ headers })
  if (!session) return undefined
  const membership = await db.query.member.findFirst({
    columns: { role: true },
    where: (record, { and, eq }) =>
      and(
        eq(record.organizationId, organizationId),
        eq(record.userId, session.user.id),
      ),
  })
  if (!membership) return undefined
  const roles = membership.role.split(',').map((role) => role.trim())
  return {
    organizationId,
    canManage: roles.some((role) => role === 'owner' || role === 'admin'),
  }
}
