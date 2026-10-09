import { getKafkaConfiguration, getSqsConfiguration } from './env.js'
import { KafkaEventBus } from './kafka.js'
import { MemoryEventBus } from './memory.js'
import { SqsEventBus } from './sqs.js'
import type { KafkaConfiguration, SqsConfiguration } from './env.js'
import type { EventBus } from './types.js'

export function createEventBus(
  configuration?: KafkaConfiguration | SqsConfiguration,
): EventBus {
  if (configuration) {
    return 'queueUrl' in configuration
      ? new SqsEventBus(configuration)
      : new KafkaEventBus(configuration)
  }

  const kafka = getKafkaConfiguration()
  const sqs = getSqsConfiguration()

  if (kafka && sqs) {
    throw new Error('Kafka and SQS event adapters cannot both be configured')
  }
  if (kafka) return new KafkaEventBus(kafka)
  if (sqs) return new SqsEventBus(sqs)
  return new MemoryEventBus()
}

export const events = createEventBus()

export {
  getKafkaConfiguration,
  getSqsConfiguration,
  type KafkaConfiguration,
  type SqsConfiguration,
} from './env.js'
export { KafkaEventBus } from './kafka.js'
export { MemoryEventBus } from './memory.js'
export { SqsEventBus } from './sqs.js'
export type {
  EventBus,
  EventBusMode,
  EventHandler,
  EventHeaders,
  EventMessage,
  PublishOptions,
  Unsubscribe,
} from './types.js'
