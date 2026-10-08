import { createCommonApp, type CommonAppOptions } from '@mba-desk/api-core'
import type { ChannelOverviewRouteOptions } from '@mba-desk/api-core/routes/channels'
import {
  createChatsRoute,
  type ChatsRouteOptions,
} from '@mba-desk/api-workspace-core/routes/chats'
import {
  createContactsRoute,
  type ContactsRouteOptions,
} from '@mba-desk/api-workspace-core/routes/contacts'
import {
  createGroupsRoute,
  type GroupsRouteOptions,
} from '@mba-desk/api-workspace-core/routes/groups'
import {
  createStickersRoute,
  type StickersRouteOptions,
} from '@mba-desk/api-workspace-core/routes/stickers'
import { createTemplateSendsRoute } from '@mba-desk/api-workspace-core/routes/template-sends'
import {
  createWaCloudWebhookRoute,
  type WaCloudWebhookRouteOptions,
} from '@mba-desk/api-workspace-core/routes/wa-cloud'
import {
  createTemplatesRoute,
  type TemplatesRouteOptions,
} from '@mba-desk/api-workspace-core/routes/templates'
import {
  createTeamsRoute,
  type TeamsRouteOptions,
} from '@mba-desk/api-workspace-core/routes/teams'
import { files } from '@mba-desk/files'
import { events, type EventBus } from '@mba-desk/events'

export interface CreateWorkspaceAppOptions extends CommonAppOptions {
  channels?: ChannelOverviewRouteOptions
  chats?: ChatsRouteOptions
  contacts?: ContactsRouteOptions
  groups?: GroupsRouteOptions
  stickers?: StickersRouteOptions
  teams?: TeamsRouteOptions
  templates?: TemplatesRouteOptions
  eventBus?: EventBus
  waCloudWebhook?: WaCloudWebhookRouteOptions
}

export const createWorkspaceApp = ({
  channels,
  chats,
  contacts,
  fileStore = files,
  groups,
  stickers,
  teams,
  templates,
  eventBus = events,
  waCloudWebhook,
  ...common
}: CreateWorkspaceAppOptions = {}) =>
  createCommonApp({ ...common, coreChannels: channels, fileStore })
    .route('/api/chats', createChatsRoute({ fileStore, ...chats }))
    .route('/api/contacts', createContactsRoute(contacts))
    .route('/api/groups', createGroupsRoute(groups))
    .route('/api/teams', createTeamsRoute(teams))
    .route('/api/templates', createTemplatesRoute(templates))
    .route('/api/template-sends', createTemplateSendsRoute())
    .route('/api/stickers', createStickersRoute({ fileStore, ...stickers }))
    .route(
      '/api/wa-cloud/webhook',
      createWaCloudWebhookRoute(eventBus, waCloudWebhook),
    )

export const app = createWorkspaceApp()
export type AppType = typeof app
