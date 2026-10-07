import { createCommonApp, type CommonAppOptions } from '@mba-desk/api-core'
import {
  createChannelOverviewRoute,
  type ChannelOverviewRouteOptions,
} from '@mba-desk/api-core/routes/channels'
import {
  createChatsRoute,
  type ChatsRouteOptions,
} from '@mba-desk/api-core/routes/chats'
import {
  createContactsRoute,
  type ContactsRouteOptions,
} from '@mba-desk/api-core/routes/contacts'
import {
  createGroupsRoute,
  type GroupsRouteOptions,
} from '@mba-desk/api-core/routes/groups'
import {
  createStickersRoute,
  type StickersRouteOptions,
} from '@mba-desk/api-core/routes/stickers'
import { createTemplateSendsRoute } from '@mba-desk/api-core/routes/template-sends'
import {
  createTemplatesRoute,
  type TemplatesRouteOptions,
} from '@mba-desk/api-core/routes/templates'
import {
  createTeamsRoute,
  type TeamsRouteOptions,
} from '@mba-desk/api-core/routes/teams'
import { files } from '@mba-desk/files'

export interface CreateWorkspaceAppOptions extends CommonAppOptions {
  channels?: ChannelOverviewRouteOptions
  chats?: ChatsRouteOptions
  contacts?: ContactsRouteOptions
  groups?: GroupsRouteOptions
  stickers?: StickersRouteOptions
  teams?: TeamsRouteOptions
  templates?: TemplatesRouteOptions
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
  ...common
}: CreateWorkspaceAppOptions = {}) =>
  createCommonApp({ ...common, fileStore })
    .route('/api/channels', createChannelOverviewRoute(channels))
    .route('/api/chats', createChatsRoute({ fileStore, ...chats }))
    .route('/api/contacts', createContactsRoute(contacts))
    .route('/api/groups', createGroupsRoute(groups))
    .route('/api/teams', createTeamsRoute(teams))
    .route('/api/templates', createTemplatesRoute(templates))
    .route('/api/template-sends', createTemplateSendsRoute())
    .route('/api/stickers', createStickersRoute({ fileStore, ...stickers }))

export const app = createWorkspaceApp()
export type AppType = typeof app
