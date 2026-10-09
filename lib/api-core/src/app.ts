import { serveStatic } from '@hono/node-server/serve-static'
import { auth, hasSsoProviders as defaultHasSsoProviders } from '@mba-desk/auth'
import { files, type FileStore } from '@mba-desk/files'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { createAdminOrganizationsRoute } from './routes/admin-organizations.js'
import {
  createChannelOverviewRoute,
  type ChannelOverviewRouteOptions,
} from './routes/channels.js'
import { createFilesRoute } from './routes/files.js'
import { createOrganizationInvitationsRoute } from './routes/organization-invitations.js'
import { createOrganizationLogosRoute } from './routes/organization-logos.js'
import type { ApplicationUrls } from './application-urls.js'

const defaultApplicationUrls: ApplicationUrls = {
  manager: 'http://localhost:3001',
  workspace: 'http://localhost:3000',
}

export interface CommonAppOptions {
  applicationUrls?: ApplicationUrls
  coreChannels?: ChannelOverviewRouteOptions
  corsOrigin?: string
  fileStore?: FileStore
  hasSsoProviders?: () => Promise<boolean>
  webRoot?: string
}

export const createCommonApp = ({
  applicationUrls = defaultApplicationUrls,
  coreChannels,
  corsOrigin = 'http://localhost:44100',
  fileStore = files,
  hasSsoProviders = defaultHasSsoProviders,
  webRoot,
}: CommonAppOptions = {}) => {
  const app = new Hono()
    .use(logger())
    .use(
      '/api/*',
      cors({
        origin: corsOrigin,
        allowHeaders: [
          'Content-Type',
          'Authorization',
          'X-API-Key',
          'MCP-Protocol-Version',
          'MCP-Method',
          'MCP-Name',
          'MCP-Session-Id',
          'Last-Event-ID',
        ],
        allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        exposeHeaders: ['MCP-Protocol-Version', 'MCP-Session-Id'],
        credentials: true,
        maxAge: 600,
      }),
    )
    .get('/api/auth/sso-availability', async (c) =>
      c.json({ enabled: await hasSsoProviders() }),
    )
    .on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw))
    .get('/api/health', (c) =>
      c.json({ status: 'ok' as const, runtime: 'node' as const }),
    )
    .get('/api/application-urls', (c) => c.json(applicationUrls))
    .route(
      '/api/channels',
      createChannelOverviewRoute({
        applicationUrls,
        deleteStoredFiles: async (paths) => {
          await Promise.all(paths.map((path) => fileStore.delete(path)))
        },
        ...coreChannels,
      }),
    )
    .route('/api/admin/organizations', createAdminOrganizationsRoute())
    .route(
      '/api/organization-invitations',
      createOrganizationInvitationsRoute(),
    )
    .route(
      '/api/organization-logos',
      createOrganizationLogosRoute({ fileStore }),
    )
    .route('/api/files', createFilesRoute(fileStore))

  if (webRoot) {
    app.use('/assets/*', serveStatic({ root: webRoot }))
    const serveIndex = serveStatic({ root: webRoot, path: 'index.html' })
    app.get('*', (c, next) => {
      if (c.req.path === '/api' || c.req.path.startsWith('/api/')) return next()
      return serveIndex(c, next)
    })
  }

  app.notFound((c) => c.json({ message: 'Not found' }, 404))
  app.onError((error, c) => {
    console.error(error)
    return c.json({ message: 'Internal server error' }, 500)
  })
  return app
}

export const commonApp = createCommonApp()
export type CommonAppType = typeof commonApp
