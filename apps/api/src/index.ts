import { serve } from '@hono/node-server'
import { bootstrapInitialAdmin } from '@mba-demo/auth'
import { closeDatabase } from '@mba-demo/db'
import { events, type Unsubscribe } from '@mba-demo/events'
import { files } from '@mba-demo/files'
import { kv } from '@mba-demo/kv'
import { pubsub } from '@mba-demo/pubsub'
import { createApp } from './app.js'
import { registerSubscribers } from './subscribers.js'
import { isInProcessWorkerEnabled } from './worker-config.js'

const port = Number.parseInt(process.env.PORT ?? '3000', 10)
const app = createApp({
  corsOrigin: process.env.CORS_ORIGIN,
  webRoot: process.env.WEB_ROOT ?? '../web/dist',
})

if (Number.isNaN(port)) {
  throw new Error('PORT must be a number')
}

await bootstrapInitialAdmin()

let unregisterSubscribers: Unsubscribe = () => undefined

if (isInProcessWorkerEnabled()) {
  unregisterSubscribers = registerSubscribers(events)
  await events.start()
  console.log('In-process event worker enabled')
}

const server = serve({
  fetch: app.fetch,
  port,
})

console.log(`API listening on http://localhost:${port}`)

let isShuttingDown = false

const shutdown = (signal: NodeJS.Signals) => {
  if (isShuttingDown) return
  isShuttingDown = true

  console.log(`Received ${signal}; shutting down`)
  unregisterSubscribers()

  server.close((error) => {
    void Promise.all([
      closeDatabase(),
      kv.close(),
      pubsub.close(),
      events.close(),
      files.close(),
    ])
      .then(() => process.exit(error ? 1 : 0))
      .catch((closeError: unknown) => {
        console.error('Failed to close a runtime connection', closeError)
        process.exit(1)
      })
  })
  if (
    'closeAllConnections' in server &&
    typeof server.closeAllConnections === 'function'
  ) {
    server.closeAllConnections()
  }
}

process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)
