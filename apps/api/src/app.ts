import { auth } from '@mba-demo/auth'
import { events, type EventBus } from '@mba-demo/events'
import { serveStatic } from '@hono/node-server/serve-static'
import { cors } from 'hono/cors'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import {
  createChannelManagementRoute,
  type ChannelManagementRouteOptions,
} from './routes/channels.js'
import { createAdminOrganizationsRoute } from './routes/admin-organizations.js'
import { createEventsRoute } from './routes/events.js'
import {
  createWaCloudWebhookRoute,
  type WaCloudWebhookRouteOptions,
} from './routes/wa-cloud.js'

interface CreateAppOptions {
  channelManagement?: ChannelManagementRouteOptions
  corsOrigin?: string
  eventBus?: EventBus
  waCloudWebhook?: WaCloudWebhookRouteOptions
  webRoot?: string
}

export const createApp = ({
  channelManagement,
  corsOrigin = 'http://localhost:5173',
  eventBus = events,
  waCloudWebhook,
  webRoot,
}: CreateAppOptions = {}) => {
  const app = new Hono()
    .use(logger())
    .use(
      '/api/*',
      cors({
        origin: corsOrigin,
        allowHeaders: ['Content-Type', 'Authorization'],
        allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
        credentials: true,
        maxAge: 600,
      }),
    )
    .on(['GET', 'POST'], '/api/auth/**', (c) => auth.handler(c.req.raw))
    .get('/api/health', (c) =>
      c.json({
        status: 'ok' as const,
        runtime: 'node' as const,
      }),
    )
    .route('/api/admin/organizations', createAdminOrganizationsRoute())
    .route('/api/channels', createChannelManagementRoute(channelManagement))
    .route('/api/events', createEventsRoute(eventBus))
    .route(
      '/api/wa-cloud/webhook',
      createWaCloudWebhookRoute(eventBus, waCloudWebhook),
    )

  if (webRoot) {
    app.use('/assets/*', serveStatic({ root: webRoot }))

    const serveIndex = serveStatic({
      root: webRoot,
      path: 'index.html',
    })

    app.get('*', (c, next) => {
      if (c.req.path === '/api' || c.req.path.startsWith('/api/')) {
        return next()
      }

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

export const app = createApp()

export type AppType = typeof app
