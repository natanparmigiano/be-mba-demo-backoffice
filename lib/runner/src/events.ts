import type { EventBus } from '@mba-desk/events'
import { z } from 'zod'

export const RUNNER_EXECUTION_REQUESTED_TOPIC = 'runner.execution.requested.v1'

export const runnerExecutionRequestedSchema = z.object({
  schemaVersion: z.literal(1),
  executionId: z.number().int().positive(),
})

export type RunnerExecutionRequested = z.infer<
  typeof runnerExecutionRequestedSchema
>

export type RunnerExecutionPublisher = (executionId: number) => Promise<void>

export function createRunnerExecutionPublisher(
  eventBus: Pick<EventBus, 'publish'>,
): RunnerExecutionPublisher {
  return async (executionId) => {
    const event: RunnerExecutionRequested = { schemaVersion: 1, executionId }
    await eventBus.publish(
      RUNNER_EXECUTION_REQUESTED_TOPIC,
      JSON.stringify(event),
      {
        key: String(executionId),
        headers: { 'content-type': 'application/json' },
      },
    )
  }
}
