import { closeDatabase } from '@mba-demo/db'
import { events } from '@mba-demo/events'
import { registerSubscribers, subscriberRegistry } from './subscribers.js'
import { getSubscribedTopics } from './worker-config.js'

const topics = getSubscribedTopics(Object.keys(subscriberRegistry))
const unsubscribe = registerSubscribers(events, { topics })

await events.start()
console.log(`Worker listening to: ${topics.join(', ') || '(no topics)'}`)

const signal = await new Promise<NodeJS.Signals>((resolve) => {
  process.once('SIGINT', () => resolve('SIGINT'))
  process.once('SIGTERM', () => resolve('SIGTERM'))
})

console.log(`Received ${signal}; shutting down worker`)
unsubscribe()
await Promise.all([closeDatabase(), events.close()])
