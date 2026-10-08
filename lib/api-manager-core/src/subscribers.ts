import type { EventBus, EventHandler, Unsubscribe } from '@mba-desk/events'
import {
  RUNNER_EXECUTION_REQUESTED_TOPIC,
  runner as defaultRunner,
  runnerExecutionRequestedSchema,
} from '@mba-desk/runner'
import { getSubscribedTopics } from './worker-config.js'

export interface RunnerExecutionWorker {
  executeQueuedExecution(executionId: number): Promise<boolean>
}

export type SubscriberRegistry = Readonly<
  Record<string, readonly EventHandler[]>
>

export function createRunnerExecutionHandler(
  runner: RunnerExecutionWorker = defaultRunner,
): EventHandler {
  return async (event) => {
    let json: unknown
    try {
      json = JSON.parse(event.value)
    } catch {
      throw new Error('Runner execution event contains invalid JSON')
    }
    const execution = runnerExecutionRequestedSchema.parse(json)
    if (event.key !== null && event.key !== String(execution.executionId)) {
      throw new Error('Runner execution event key and payload disagree')
    }
    const claimed = await runner.executeQueuedExecution(execution.executionId)
    console.log(
      claimed ? 'Executed queued runner function' : 'Skipped runner execution',
      JSON.stringify({ executionId: execution.executionId }),
    )
  }
}

export const subscriberRegistry: SubscriberRegistry = {
  [RUNNER_EXECUTION_REQUESTED_TOPIC]: [createRunnerExecutionHandler()],
}

export function registerSubscribers(
  eventBus: EventBus,
  options: {
    topics?: readonly string[]
    registry?: SubscriberRegistry
  } = {},
): Unsubscribe {
  const registry = options.registry ?? subscriberRegistry
  const topics = options.topics ?? getSubscribedTopics(Object.keys(registry))
  const unsubscribers = topics.flatMap((topic) => {
    const handlers = registry[topic]
    if (!handlers) {
      throw new Error(
        `No subscriber handlers are registered for topic: ${topic}`,
      )
    }
    return handlers.map((handler) => eventBus.subscribe(topic, handler))
  })
  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe()
  }
}
