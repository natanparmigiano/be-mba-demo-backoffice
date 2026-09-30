import type { EventBus } from '@mba-demo/events'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'

export const DEMO_EVENT_TOPIC = 'demo.events.v1'

const eventSchema = z.object({
  key: z.string().min(1).max(200).optional(),
  message: z.string().min(1).max(2_000),
})

export const createEventsRoute = (eventBus: EventBus) =>
  new Hono().post('/', zValidator('json', eventSchema), async (c) => {
    const event = c.req.valid('json')

    await eventBus.publish(DEMO_EVENT_TOPIC, event.message, {
      key: event.key,
      headers: { source: 'api' },
    })

    return c.json(
      {
        accepted: true as const,
        mode: eventBus.mode,
        topic: DEMO_EVENT_TOPIC,
      },
      202,
    )
  })
