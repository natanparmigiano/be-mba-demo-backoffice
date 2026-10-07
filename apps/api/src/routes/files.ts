import { files as defaultFiles, type FileStore } from '@mba-desk/files'
import { Hono } from 'hono'

const INVALID_URL_MESSAGE = 'Invalid or expired file URL'

export const createFilesRoute = (fileStore: FileStore = defaultFiles) =>
  new Hono()
    .get('/signed', async (c) => {
      const signedFile = fileStore.verifySignedUrl?.(
        new URL(c.req.url),
        'download',
      )

      if (!fileStore.verifySignedUrl) {
        return c.json(
          { message: 'Application-served file URLs are not enabled' },
          404,
        )
      }

      if (!signedFile) return c.json({ message: INVALID_URL_MESSAGE }, 403)

      const file = await fileStore.get(signedFile.key)
      if (!file) return c.json({ message: 'File not found' }, 404)

      c.header('Cache-Control', 'private, no-store')
      c.header('Content-Length', String(file.size))
      c.header('Content-Type', file.contentType ?? 'application/octet-stream')

      if (file.lastModified) {
        c.header('Last-Modified', file.lastModified.toUTCString())
      }

      return c.body(new Uint8Array(file.body).buffer)
    })
    .put('/signed', async (c) => {
      const signedFile = fileStore.verifySignedUrl?.(
        new URL(c.req.url),
        'upload',
      )

      if (!fileStore.verifySignedUrl) {
        return c.json(
          { message: 'Application-served file URLs are not enabled' },
          404,
        )
      }

      if (!signedFile) return c.json({ message: INVALID_URL_MESSAGE }, 403)

      const requestContentType = c.req.header('content-type')

      if (
        signedFile.contentType !== undefined &&
        requestContentType !== signedFile.contentType
      ) {
        return c.json({ message: INVALID_URL_MESSAGE }, 403)
      }

      await fileStore.put(
        signedFile.key,
        new Uint8Array(await c.req.arrayBuffer()),
        { contentType: signedFile.contentType ?? requestContentType },
      )
      return c.body(null, 204)
    })
