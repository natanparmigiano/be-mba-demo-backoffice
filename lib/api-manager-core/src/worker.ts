import { closeDatabase } from '@mba-desk/db'
import { events } from '@mba-desk/events'
import { files } from '@mba-desk/files'
import { pubsub } from '@mba-desk/pubsub'
import { registerSubscribers, subscriberRegistry } from './subscribers.js'
import { getSubscribedTopics } from './worker-config.js'

const topics = getSubscribedTopics(Object.keys(subscriberRegistry))
const unsubscribe = registerSubscribers(events, { topics })
await events.start()
console.log(
  `Manager worker listening to: ${topics.join(', ') || '(no topics)'}`,
)

const signal = await new Promise<NodeJS.Signals>((resolve) => {
  process.once('SIGINT', () => resolve('SIGINT'))
  process.once('SIGTERM', () => resolve('SIGTERM'))
})
console.log(`Received ${signal}; shutting down Manager worker`)
unsubscribe()
await Promise.all([
  closeDatabase(),
  events.close(),
  files.close(),
  pubsub.close(),
])
