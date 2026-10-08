import { getApplicationUrls, startApiServer } from '@mba-desk/api-core'
import { registerSubscribers } from '@mba-desk/api-workspace-core'
import { isInProcessWorkerEnabled } from '@mba-desk/api-workspace-core/worker-config'
import { createWorkspaceApp } from './app.js'

const port = Number.parseInt(
  process.env.WORKSPACE_API_PORT ?? process.env.PORT ?? '3000',
  10,
)
const app = createWorkspaceApp({
  applicationUrls: getApplicationUrls(),
  corsOrigin: process.env.WORKSPACE_CORS_ORIGIN ?? process.env.CORS_ORIGIN,
  webRoot: process.env.WORKSPACE_WEB_ROOT ?? '../web-workspace/dist',
})

await startApiServer({
  app,
  name: 'Workspace',
  port,
  enableInProcessWorker: isInProcessWorkerEnabled(),
  registerInProcessSubscribers: registerSubscribers,
})
