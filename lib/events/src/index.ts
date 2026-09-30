import { getKafkaConfiguration } from './env.js'
import { KafkaEventBus } from './kafka.js'
import { MemoryEventBus } from './memory.js'
import type { EventBus } from './types.js'

export function createEventBus(
  configuration = getKafkaConfiguration(),
): EventBus {
  return configuration ? new KafkaEventBus(configuration) : new MemoryEventBus()
}

export const events = createEventBus()

export { getKafkaConfiguration, type KafkaConfiguration } from './env.js'
export { KafkaEventBus } from './kafka.js'
export { MemoryEventBus } from './memory.js'
export type {
  EventBus,
  EventBusMode,
  EventHandler,
  EventHeaders,
  EventMessage,
  PublishOptions,
  Unsubscribe,
} from './types.js'
