import { createHash, randomUUID } from 'node:crypto'
import { auth } from '@mba-demo/auth'
import { db, member, stickerLibrary } from '@mba-demo/db'
import { files as defaultFiles, type FileStore } from '@mba-demo/files'
import { and, desc, eq } from 'drizzle-orm'
import { Hono } from 'hono'

const MAX_STICKER_BYTES = 500_000

interface OrganizationAccess {
  organizationId: string
}

export interface StickerLibraryItem {
  id: number
  byteSize: number
  createdAt: string
}

interface StoredSticker extends StickerLibraryItem {
  storagePath: string
}

export interface StickerLibraryRepository {
  list: (organizationId: string) => Promise<StickerLibraryItem[]>
  get: (
    organizationId: string,
    stickerId: number,
  ) => Promise<StoredSticker | undefined>
  findByHash: (
    organizationId: string,
    sha256: string,
  ) => Promise<StoredSticker | undefined>
  create: (input: {
    organizationId: string
    storagePath: string
    sha256: string
    byteSize: number
  }) => Promise<StoredSticker>
}

export interface StickersRouteOptions {
  fileStore?: FileStore
  getAccess?: (headers: Headers) => Promise<OrganizationAccess | undefined>
  repository?: StickerLibraryRepository
}

const databaseRepository: StickerLibraryRepository = {
  list: async (organizationId) =>
    db
      .select({
        id: stickerLibrary.id,
        byteSize: stickerLibrary.byteSize,
        createdAt: stickerLibrary.createdAt,
      })
      .from(stickerLibrary)
      .where(eq(stickerLibrary.organizationId, organizationId))
      .orderBy(desc(stickerLibrary.createdAt), desc(stickerLibrary.id))
      .then((rows) =>
        rows.map((row) => ({
          ...row,
          createdAt: row.createdAt.toISOString(),
        })),
      ),
  get: async (organizationId, stickerId) => {
    const [row] = await db
      .select()
      .from(stickerLibrary)
      .where(
        and(
          eq(stickerLibrary.organizationId, organizationId),
          eq(stickerLibrary.id, stickerId),
        ),
      )
      .limit(1)
    return row ? { ...row, createdAt: row.createdAt.toISOString() } : undefined
  },
  findByHash: async (organizationId, sha256) => {
    const [row] = await db
      .select()
      .from(stickerLibrary)
      .where(
        and(
          eq(stickerLibrary.organizationId, organizationId),
          eq(stickerLibrary.sha256, sha256),
        ),
      )
      .limit(1)
    return row ? { ...row, createdAt: row.createdAt.toISOString() } : undefined
  },
  create: async (input) => {
    const [row] = await db.insert(stickerLibrary).values(input).returning()
    if (!row) throw new Error('Could not create sticker library item')
    return { ...row, createdAt: row.createdAt.toISOString() }
  },
}

export const createStickersRoute = ({
  fileStore = defaultFiles,
  getAccess = getOrganizationAccess,
  repository = databaseRepository,
}: StickersRouteOptions = {}) =>
  new Hono()
    .get('/', async (c) => {
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      const stickers = await repository.list(access.organizationId)
      return c.json({
        stickers: stickers.map((sticker) => ({
          ...sticker,
          url: `/api/stickers/${sticker.id}/content`,
        })),
      })
    })
    .post('/', async (c) => {
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      if (c.req.header('content-type')?.split(';')[0] !== 'image/webp') {
        return c.json({ message: 'Stickers must be WebP images' }, 415)
      }
      const contentLength = Number(c.req.header('content-length'))
      if (Number.isFinite(contentLength) && contentLength > MAX_STICKER_BYTES) {
        return c.json({ message: 'Sticker is too large' }, 413)
      }
      const body = new Uint8Array(await c.req.arrayBuffer())
      if (body.length === 0 || body.length > MAX_STICKER_BYTES) {
        return c.json({ message: 'Sticker is empty or too large' }, 413)
      }
      if (!isWebp(body)) {
        return c.json({ message: 'Sticker body is not a WebP image' }, 400)
      }

      const sha256 = createHash('sha256').update(body).digest('hex')
      const existing = await repository.findByHash(
        access.organizationId,
        sha256,
      )
      if (existing) {
        return c.json({
          sticker: publicSticker(existing),
          duplicate: true as const,
        })
      }

      const storagePath = `stickers/${access.organizationId}/${randomUUID()}.webp`
      await fileStore.put(storagePath, body, { contentType: 'image/webp' })
      try {
        const sticker = await repository.create({
          organizationId: access.organizationId,
          storagePath,
          sha256,
          byteSize: body.length,
        })
        return c.json({ sticker: publicSticker(sticker) }, 201)
      } catch (error) {
        await fileStore.delete(storagePath).catch(() => undefined)
        throw error
      }
    })
    .get('/:id/content', async (c) => {
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      const stickerId = parsePositiveSafeInteger(c.req.param('id'))
      if (!stickerId) return c.json({ message: 'Invalid sticker ID' }, 400)
      const sticker = await repository.get(access.organizationId, stickerId)
      if (!sticker) return c.json({ message: 'Sticker not found' }, 404)
      const file = await fileStore.get(sticker.storagePath)
      if (!file) return c.json({ message: 'Sticker file not found' }, 404)
      c.header('Cache-Control', 'private, max-age=3600')
      c.header('Content-Type', 'image/webp')
      c.header('Content-Length', String(file.size))
      return c.body(new Uint8Array(file.body).buffer)
    })

function publicSticker(sticker: StickerLibraryItem) {
  return {
    id: sticker.id,
    byteSize: sticker.byteSize,
    createdAt: sticker.createdAt,
    url: `/api/stickers/${sticker.id}/content`,
  }
}

function isWebp(body: Uint8Array): boolean {
  return (
    body.length >= 12 &&
    String.fromCharCode(...body.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...body.slice(8, 12)) === 'WEBP'
  )
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

function parsePositiveSafeInteger(value: string): number | undefined {
  if (!/^[1-9]\d*$/.test(value)) return undefined
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : undefined
}
