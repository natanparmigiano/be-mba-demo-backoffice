import { getApplicationUrls, startApiServer } from '@mba-desk/api-core'
import { registerSubscribers } from '@mba-desk/api-manager-core'
import { isInProcessWorkerEnabled } from '@mba-desk/api-manager-core/worker-config'
import { createManagerApp } from './app.js'

const port = Number.parseInt(
  process.env.MANAGER_API_PORT ?? process.env.PORT ?? '3001',
  10,
)
const app = createManagerApp({
  applicationUrls: getApplicationUrls(),
  corsOrigin: process.env.MANAGER_CORS_ORIGIN ?? 'http://localhost:44101',
  webRoot: process.env.MANAGER_WEB_ROOT ?? '../web-manager/dist',
})

await startApiServer({
  app,
  name: 'Manager',
  port,
  enableInProcessWorker: isInProcessWorkerEnabled(),
  registerInProcessSubscribers: registerSubscribers,
})
