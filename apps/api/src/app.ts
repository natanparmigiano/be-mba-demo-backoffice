import { auth, hasSsoProviders as defaultHasSsoProviders } from '@mba-desk/auth'
import { events, type EventBus } from '@mba-desk/events'
import { files, type FileStore } from '@mba-desk/files'
import { serveStatic } from '@hono/node-server/serve-static'
import { cors } from 'hono/cors'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import {
  createAnalyticsPlaygroundRoute,
  type AnalyticsPlaygroundRouteOptions,
} from './routes/analytics-playground.js'
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
  createMarketingPlaygroundRoute,
  type MarketingPlaygroundRouteOptions,
} from './routes/marketing-playground.js'
import {
  createMbaPlaygroundRoute,
  type MbaPlaygroundRouteOptions,
} from './routes/mba-playground.js'
import {
  createMediaPlaygroundRoute,
  type MediaPlaygroundRouteOptions,
} from './routes/media-playground.js'
import {
  createQrPlaygroundRoute,
  type QrPlaygroundRouteOptions,
} from './routes/qr-playground.js'
import {
  createModerationPlaygroundRoute,
  type ModerationPlaygroundRouteOptions,
} from './routes/moderation-playground.js'
import {
  createSubscriptionsPlaygroundRoute,
  type SubscriptionsPlaygroundRouteOptions,
} from './routes/subscriptions-playground.js'
import {
  createTemplatesPlaygroundRoute,
  type TemplatesPlaygroundRouteOptions,
} from './routes/templates-playground.js'
import {
  createTemplatesRoute,
  type TemplatesRouteOptions,
} from './routes/templates.js'
import { createTemplateSendsRoute } from './routes/template-sends.js'
import {
  createChannelManagementRoute,
  type ChannelManagementRouteOptions,
} from './routes/channels.js'
import {
  createContactsRoute,
  type ContactsRouteOptions,
} from './routes/contacts.js'
import { createChatsRoute, type ChatsRouteOptions } from './routes/chats.js'
import {
  createResponsesRoute,
  type ResponsesRouteOptions,
} from './routes/responses.js'
import {
  createHashbrownRoute,
  type HashbrownRouteOptions,
} from './routes/hashbrown.js'
import { createAdminOrganizationsRoute } from './routes/admin-organizations.js'
import { createFilesRoute } from './routes/files.js'
import { createGroupsRoute, type GroupsRouteOptions } from './routes/groups.js'
import { createTeamsRoute, type TeamsRouteOptions } from './routes/teams.js'
import { createOrganizationLogosRoute } from './routes/organization-logos.js'
import { createMcpRoute, type McpRouteOptions } from './routes/mcp.js'
import { createRunnerRoute, type RunnerRouteOptions } from './routes/runner.js'
import {
  createStickersRoute,
  type StickersRouteOptions,
} from './routes/stickers.js'
import {
  createStudioProjectsRoute,
  type StudioProjectsRouteOptions,
} from './routes/studio-projects.js'
import {
  createWaCloudWebhookRoute,
  type WaCloudWebhookRouteOptions,
} from './routes/wa-cloud.js'
import {
  createWabaPlaygroundRoute,
  type WabaPlaygroundRouteOptions,
} from './routes/waba-playground.js'
import {
  createWebhooksPlaygroundRoute,
  type WebhooksPlaygroundRouteOptions,
} from './routes/webhooks-playground.js'
import { createWebhooksRoute } from './routes/webhooks.js'

interface CreateAppOptions {
  analyticsPlayground?: AnalyticsPlaygroundRouteOptions
  apiPlayground?: ApiPlaygroundRouteOptions
  channelManagement?: ChannelManagementRouteOptions
  componentsPlayground?: ComponentsPlaygroundRouteOptions
  flowsPlayground?: FlowsPlaygroundRouteOptions
  chats?: ChatsRouteOptions
  responses?: ResponsesRouteOptions
  hashbrown?: HashbrownRouteOptions
  contacts?: ContactsRouteOptions
  corsOrigin?: string
  eventBus?: EventBus
  fileStore?: FileStore
  groups?: GroupsRouteOptions
  teams?: TeamsRouteOptions
  hasSsoProviders?: () => Promise<boolean>
  messagingPlayground?: MessagingPlaygroundRouteOptions
  marketingPlayground?: MarketingPlaygroundRouteOptions
  mbaPlayground?: MbaPlaygroundRouteOptions
  moderationPlayground?: ModerationPlaygroundRouteOptions
  mediaPlayground?: MediaPlaygroundRouteOptions
  mcp?: McpRouteOptions
  qrPlayground?: QrPlaygroundRouteOptions
  subscriptionsPlayground?: SubscriptionsPlaygroundRouteOptions
  templatesPlayground?: TemplatesPlaygroundRouteOptions
  templates?: TemplatesRouteOptions
  runner?: RunnerRouteOptions
  stickers?: StickersRouteOptions
  studioProjects?: StudioProjectsRouteOptions
  waCloudWebhook?: WaCloudWebhookRouteOptions
  wabaPlayground?: WabaPlaygroundRouteOptions
  webhooksPlayground?: WebhooksPlaygroundRouteOptions
  webRoot?: string
}

export const createApp = ({
  analyticsPlayground,
  apiPlayground,
  channelManagement,
  componentsPlayground,
  flowsPlayground,
  chats,
  responses,
  hashbrown,
  contacts,
  corsOrigin = 'http://localhost:5173',
  eventBus = events,
  fileStore = files,
  groups,
  teams,
  hasSsoProviders = defaultHasSsoProviders,
  messagingPlayground,
  marketingPlayground,
  mbaPlayground,
  moderationPlayground,
  mediaPlayground,
  mcp,
  qrPlayground,
  subscriptionsPlayground,
  templatesPlayground,
  templates,
  runner,
  stickers,
  studioProjects,
  waCloudWebhook,
  wabaPlayground,
  webhooksPlayground,
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
      '/api/playground/analytics',
      createAnalyticsPlaygroundRoute(analyticsPlayground),
    )
    .route(
      '/api/playground/messaging',
      createMessagingPlaygroundRoute({ fileStore, ...messagingPlayground }),
    )
    .route(
      '/api/playground/marketing',
      createMarketingPlaygroundRoute(marketingPlayground),
    )
    .route('/api/playground/media', createMediaPlaygroundRoute(mediaPlayground))
    .route('/api/playground/mba', createMbaPlaygroundRoute(mbaPlayground))
    .route(
      '/api/playground/moderation',
      createModerationPlaygroundRoute(moderationPlayground),
    )
    .route('/api/playground/qr', createQrPlaygroundRoute(qrPlayground))
    .route(
      '/api/playground/subscriptions',
      createSubscriptionsPlaygroundRoute(subscriptionsPlayground),
    )
    .route(
      '/api/playground/components',
      createComponentsPlaygroundRoute(componentsPlayground),
    )
    .route('/api/playground/flows', createFlowsPlaygroundRoute(flowsPlayground))
    .route(
      '/api/playground/templates',
      createTemplatesPlaygroundRoute(templatesPlayground),
    )
    .route('/api/templates', createTemplatesRoute(templates))
    .route('/api/template-sends', createTemplateSendsRoute())
    .route('/api/playground/waba', createWabaPlaygroundRoute(wabaPlayground))
    .route(
      '/api/playground/webhooks',
      createWebhooksPlaygroundRoute(webhooksPlayground),
    )
    .route('/api/admin/organizations', createAdminOrganizationsRoute())
    .route('/api/channels', createChannelManagementRoute(channelManagement))
    .route('/api/webhooks', createWebhooksRoute())
    .route('/api/chats', createChatsRoute({ fileStore, ...chats }))
    .route('/api/responses/v1', createResponsesRoute(responses))
    .route('/api/hashbrown', createHashbrownRoute(hashbrown))
    .route('/api/contacts', createContactsRoute(contacts))
    .route('/api/files', createFilesRoute(fileStore))
    .route('/api/groups', createGroupsRoute(groups))
    .route('/api/teams', createTeamsRoute(teams))
    .route(
      '/api/organization-logos',
      createOrganizationLogosRoute({ fileStore }),
    )
    .route('/api/stickers', createStickersRoute({ fileStore, ...stickers }))
    .route(
      '/api/studio/projects',
      createStudioProjectsRoute({ fileStore, ...studioProjects }),
    )
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
