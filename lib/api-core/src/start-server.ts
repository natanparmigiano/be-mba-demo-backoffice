import { serve } from '@hono/node-server'
import { bootstrapInitialAdmin } from '@mba-desk/auth'
import { closeDatabase } from '@mba-desk/db'
import { events, type Unsubscribe } from '@mba-desk/events'
import { files } from '@mba-desk/files'
import { kv } from '@mba-desk/kv'
import { pubsub } from '@mba-desk/pubsub'
import type { Hono } from 'hono'
import { registerSubscribers } from './subscribers.js'

export interface StartApiServerOptions {
  app: Hono
  name: string
  port: number
  enableInProcessWorker?: boolean
}

export async function startApiServer({
  app,
  name,
  port,
  enableInProcessWorker = false,
}: StartApiServerOptions) {
  if (!Number.isSafeInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`${name} API port must be a number between 1 and 65535`)
  }
  await bootstrapInitialAdmin()

  let unregisterSubscribers: Unsubscribe = () => undefined
  if (enableInProcessWorker) {
    unregisterSubscribers = registerSubscribers(events)
    await events.start()
    console.log(`${name} in-process event worker enabled`)
  }

  const server = serve(
    { fetch: app.fetch, hostname: '0.0.0.0', port },
    (address) => {
      const host = typeof address === 'string' ? address : address.address
      const boundPort = typeof address === 'string' ? port : address.port
      console.log(`${name} API listening on http://${host}:${boundPort}`)
    },
  )

  let isShuttingDown = false
  const shutdown = (signal: NodeJS.Signals) => {
    if (isShuttingDown) return
    isShuttingDown = true
    console.log(`Received ${signal}; shutting down ${name} API`)
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
  return server
}
