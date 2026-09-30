import { setTimeout as delay } from 'node:timers/promises'
import type { SyntheticWebhookGenerator } from './generator.js'
import type { WebhookSink } from './sender.js'
import type { GeneratedWebhookKind } from './types.js'

export interface RunOptions {
  durationSeconds?: number
  events?: number
  maxInFlight: number
  rps: number
  signal: AbortSignal
}

export interface RunStats {
  accepted: number
  attempted: number
  byKind: Readonly<Partial<Record<GeneratedWebhookKind, number>>>
  failed: number
}

export async function runGenerator(
  generator: SyntheticWebhookGenerator,
  sink: WebhookSink,
  options: RunOptions,
  onError: (error: unknown) => void = () => undefined,
): Promise<RunStats> {
  const start = performance.now()
  const end =
    options.durationSeconds === undefined
      ? Number.POSITIVE_INFINITY
      : start + options.durationSeconds * 1_000
  const eventLimit = options.events ?? Number.POSITIVE_INFINITY
  const interval = 1_000 / options.rps
  const inFlight = new Set<Promise<void>>()
  const byKind: Partial<Record<GeneratedWebhookKind, number>> = {}
  let accepted = 0
  let attempted = 0
  let failed = 0

  while (
    attempted < eventLimit &&
    performance.now() < end &&
    !options.signal.aborted
  ) {
    const deadline = start + attempted * interval
    const wait = deadline - performance.now()
    if (wait > 0) {
      try {
        await delay(wait, undefined, { signal: options.signal })
      } catch (error) {
        if (options.signal.aborted) break
        throw error
      }
    }
    if (performance.now() >= end || options.signal.aborted) break

    if (inFlight.size >= options.maxInFlight) {
      await Promise.race(inFlight)
      if (options.signal.aborted) break
    }

    const event = generator.next()
    attempted += 1
    byKind[event.kind] = (byKind[event.kind] ?? 0) + 1

    const request = sink
      .send(event, options.signal)
      .then(() => {
        accepted += 1
      })
      .catch((error: unknown) => {
        failed += 1
        onError(error)
      })
      .finally(() => {
        inFlight.delete(request)
      })
    inFlight.add(request)
  }

  await Promise.all(inFlight)
  return { accepted, attempted, byKind, failed }
}
