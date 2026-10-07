import { startApiServer } from '@mba-desk/api-core'
import { isInProcessWorkerEnabled } from '@mba-desk/api-core/worker-config'
import { createManagerApp } from './app.js'

const port = Number.parseInt(process.env.MANAGER_API_PORT ?? '3001', 10)
const app = createManagerApp({
  corsOrigin: process.env.MANAGER_CORS_ORIGIN ?? 'http://localhost:5174',
  webRoot: process.env.MANAGER_WEB_ROOT ?? '../web-manager/dist',
})

await startApiServer({
  app,
  name: 'Manager',
  port,
  enableInProcessWorker: isInProcessWorkerEnabled(),
})
