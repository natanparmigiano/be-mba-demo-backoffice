import { auth, hasSsoProviders as defaultHasSsoProviders } from '@mba-demo/auth'
import { events, type EventBus } from '@mba-demo/events'
import { files, type FileStore } from '@mba-demo/files'
import { serveStatic } from '@hono/node-server/serve-static'
import { cors } from 'hono/cors'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import {
  createComponentsPlaygroundRoute,
  type ComponentsPlaygroundRouteOptions,
} from './routes/components-playground.js'
import {
  createFlowsPlaygroundRoute,
  type FlowsPlaygroundRouteOptions,
} from './routes/flows-playground.js'
import {
  createApiPlaygroundRoute,
  type ApiPlaygroundRouteOptions,
} from './routes/api-playground.js'
import {
  createMessagingPlaygroundRoute,
  type MessagingPlaygroundRouteOptions,
} from './routes/messaging-playground.js'
import {
  createMediaPlaygroundRoute,
  type MediaPlaygroundRouteOptions,
} from './routes/media-playground.js'
import {
  createQrPlaygroundRoute,
  type QrPlaygroundRouteOptions,
} from './routes/qr-playground.js'
import {
  createTemplatesPlaygroundRoute,
  type TemplatesPlaygroundRouteOptions,
} from './routes/templates-playground.js'
import {
  createChannelManagementRoute,
  type ChannelManagementRouteOptions,
} from './routes/channels.js'
import {
  createContactsRoute,
  type ContactsRouteOptions,
} from './routes/contacts.js'
import { createChatsRoute, type ChatsRouteOptions } from './routes/chats.js'
import { createAdminOrganizationsRoute } from './routes/admin-organizations.js'
import { createFilesRoute } from './routes/files.js'
import { createGroupsRoute, type GroupsRouteOptions } from './routes/groups.js'
import { createMcpRoute, type McpRouteOptions } from './routes/mcp.js'
import { createRunnerRoute, type RunnerRouteOptions } from './routes/runner.js'
import {
  createWaCloudWebhookRoute,
  type WaCloudWebhookRouteOptions,
} from './routes/wa-cloud.js'

interface CreateAppOptions {
  apiPlayground?: ApiPlaygroundRouteOptions
  channelManagement?: ChannelManagementRouteOptions
  componentsPlayground?: ComponentsPlaygroundRouteOptions
  flowsPlayground?: FlowsPlaygroundRouteOptions
  chats?: ChatsRouteOptions
  contacts?: ContactsRouteOptions
  corsOrigin?: string
  eventBus?: EventBus
  fileStore?: FileStore
  groups?: GroupsRouteOptions
  hasSsoProviders?: () => Promise<boolean>
  messagingPlayground?: MessagingPlaygroundRouteOptions
  mediaPlayground?: MediaPlaygroundRouteOptions
  mcp?: McpRouteOptions
  qrPlayground?: QrPlaygroundRouteOptions
  templatesPlayground?: TemplatesPlaygroundRouteOptions
  runner?: RunnerRouteOptions
  waCloudWebhook?: WaCloudWebhookRouteOptions
  webRoot?: string
}

export const createApp = ({
  apiPlayground,
  channelManagement,
  componentsPlayground,
  flowsPlayground,
  chats,
  contacts,
  corsOrigin = 'http://localhost:5173',
  eventBus = events,
  fileStore = files,
  groups,
  hasSsoProviders = defaultHasSsoProviders,
  messagingPlayground,
  mediaPlayground,
  mcp,
  qrPlayground,
  templatesPlayground,
  runner,
  waCloudWebhook,
  webRoot,
}: CreateAppOptions = {}) => {
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
      c.json({
        status: 'ok' as const,
        runtime: 'node' as const,
      }),
    )
    .route('/api/playground', createApiPlaygroundRoute(apiPlayground))
    .route(
      '/api/playground/messaging',
      createMessagingPlaygroundRoute({ fileStore, ...messagingPlayground }),
    )
    .route('/api/playground/media', createMediaPlaygroundRoute(mediaPlayground))
    .route('/api/playground/qr', createQrPlaygroundRoute(qrPlayground))
    .route(
      '/api/playground/components',
      createComponentsPlaygroundRoute(componentsPlayground),
    )
    .route('/api/playground/flows', createFlowsPlaygroundRoute(flowsPlayground))
    .route(
      '/api/playground/templates',
      createTemplatesPlaygroundRoute(templatesPlayground),
    )
    .route('/api/admin/organizations', createAdminOrganizationsRoute())
    .route('/api/channels', createChannelManagementRoute(channelManagement))
    .route('/api/chats', createChatsRoute({ fileStore, ...chats }))
    .route('/api/contacts', createContactsRoute(contacts))
    .route('/api/files', createFilesRoute(fileStore))
    .route('/api/groups', createGroupsRoute(groups))
    .route('/api/mcp', createMcpRoute(mcp))
    .route('/api/runner', createRunnerRoute(runner))
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
