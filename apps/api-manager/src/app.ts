import { createCommonApp, type CommonAppOptions } from '@mba-desk/api-core'
import {
  createAnalyticsPlaygroundRoute,
  type AnalyticsPlaygroundRouteOptions,
} from '@mba-desk/api-core/routes/analytics-playground'
import {
  createApiPlaygroundRoute,
  type ApiPlaygroundRouteOptions,
} from '@mba-desk/api-core/routes/api-playground'
import {
  createChannelManagementRoute,
  type ChannelManagementRouteOptions,
} from '@mba-desk/api-core/routes/channels'
import {
  createComponentsPlaygroundRoute,
  type ComponentsPlaygroundRouteOptions,
} from '@mba-desk/api-core/routes/components-playground'
import {
  createFlowsPlaygroundRoute,
  type FlowsPlaygroundRouteOptions,
} from '@mba-desk/api-core/routes/flows-playground'
import {
  createHashbrownRoute,
  type HashbrownRouteOptions,
} from '@mba-desk/api-core/routes/hashbrown'
import {
  createMarketingPlaygroundRoute,
  type MarketingPlaygroundRouteOptions,
} from '@mba-desk/api-core/routes/marketing-playground'
import {
  createMbaPlaygroundRoute,
  type MbaPlaygroundRouteOptions,
} from '@mba-desk/api-core/routes/mba-playground'
import {
  createMcpRoute,
  type McpRouteOptions,
} from '@mba-desk/api-core/routes/mcp'
import {
  createMediaPlaygroundRoute,
  type MediaPlaygroundRouteOptions,
} from '@mba-desk/api-core/routes/media-playground'
import {
  createMessagingPlaygroundRoute,
  type MessagingPlaygroundRouteOptions,
} from '@mba-desk/api-core/routes/messaging-playground'
import {
  createModerationPlaygroundRoute,
  type ModerationPlaygroundRouteOptions,
} from '@mba-desk/api-core/routes/moderation-playground'
import {
  createQrPlaygroundRoute,
  type QrPlaygroundRouteOptions,
} from '@mba-desk/api-core/routes/qr-playground'
import {
  createResponsesRoute,
  type ResponsesRouteOptions,
} from '@mba-desk/api-core/routes/responses'
import {
  createRunnerRoute,
  type RunnerRouteOptions,
} from '@mba-desk/api-core/routes/runner'
import {
  createStudioProjectsRoute,
  type StudioProjectsRouteOptions,
} from '@mba-desk/api-core/routes/studio-projects'
import {
  createSubscriptionsPlaygroundRoute,
  type SubscriptionsPlaygroundRouteOptions,
} from '@mba-desk/api-core/routes/subscriptions-playground'
import {
  createTemplatesPlaygroundRoute,
  type TemplatesPlaygroundRouteOptions,
} from '@mba-desk/api-core/routes/templates-playground'
import {
  createWaCloudWebhookRoute,
  type WaCloudWebhookRouteOptions,
} from '@mba-desk/api-core/routes/wa-cloud'
import {
  createWabaPlaygroundRoute,
  type WabaPlaygroundRouteOptions,
} from '@mba-desk/api-core/routes/waba-playground'
import {
  createWebhooksPlaygroundRoute,
  type WebhooksPlaygroundRouteOptions,
} from '@mba-desk/api-core/routes/webhooks-playground'
import { createWebhooksRoute } from '@mba-desk/api-core/routes/webhooks'
import { events, type EventBus } from '@mba-desk/events'
import { files } from '@mba-desk/files'

export interface CreateManagerAppOptions extends CommonAppOptions {
  analyticsPlayground?: AnalyticsPlaygroundRouteOptions
  apiPlayground?: ApiPlaygroundRouteOptions
  channels?: ChannelManagementRouteOptions
  componentsPlayground?: ComponentsPlaygroundRouteOptions
  eventBus?: EventBus
  flowsPlayground?: FlowsPlaygroundRouteOptions
  hashbrown?: HashbrownRouteOptions
  marketingPlayground?: MarketingPlaygroundRouteOptions
  mbaPlayground?: MbaPlaygroundRouteOptions
  mcp?: McpRouteOptions
  mediaPlayground?: MediaPlaygroundRouteOptions
  messagingPlayground?: MessagingPlaygroundRouteOptions
  moderationPlayground?: ModerationPlaygroundRouteOptions
  qrPlayground?: QrPlaygroundRouteOptions
  responses?: ResponsesRouteOptions
  runner?: RunnerRouteOptions
  studioProjects?: StudioProjectsRouteOptions
  subscriptionsPlayground?: SubscriptionsPlaygroundRouteOptions
  templatesPlayground?: TemplatesPlaygroundRouteOptions
  waCloudWebhook?: WaCloudWebhookRouteOptions
  wabaPlayground?: WabaPlaygroundRouteOptions
  webhooksPlayground?: WebhooksPlaygroundRouteOptions
}

export const createManagerApp = ({
  analyticsPlayground,
  apiPlayground,
  channels,
  componentsPlayground,
  eventBus = events,
  fileStore = files,
  flowsPlayground,
  hashbrown,
  marketingPlayground,
  mbaPlayground,
  mcp,
  mediaPlayground,
  messagingPlayground,
  moderationPlayground,
  qrPlayground,
  responses,
  runner,
  studioProjects,
  subscriptionsPlayground,
  templatesPlayground,
  waCloudWebhook,
  wabaPlayground,
  webhooksPlayground,
  ...common
}: CreateManagerAppOptions = {}) =>
  createCommonApp({ ...common, fileStore })
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
    .route('/api/playground/waba', createWabaPlaygroundRoute(wabaPlayground))
    .route(
      '/api/playground/webhooks',
      createWebhooksPlaygroundRoute(webhooksPlayground),
    )
    .route('/api/channels', createChannelManagementRoute(channels))
    .route('/api/webhooks', createWebhooksRoute())
    .route('/api/responses/v1', createResponsesRoute(responses))
    .route('/api/hashbrown', createHashbrownRoute(hashbrown))
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

export const app = createManagerApp()
export type AppType = typeof app
