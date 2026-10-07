import { startApiServer } from '@mba-desk/api-core'
import { createWorkspaceApp } from './app.js'

const port = Number.parseInt(process.env.WORKSPACE_API_PORT ?? '3000', 10)
const app = createWorkspaceApp({
  corsOrigin: process.env.WORKSPACE_CORS_ORIGIN ?? process.env.CORS_ORIGIN,
  webRoot: process.env.WORKSPACE_WEB_ROOT ?? '../web-workspace/dist',
})

await startApiServer({ app, name: 'Workspace', port })
