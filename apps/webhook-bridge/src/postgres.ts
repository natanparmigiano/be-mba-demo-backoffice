import postgres from 'postgres'
import type {
  DeliveryBatchResult,
  DeliveryOutcome,
  WebhookDelivery,
  WebhookDeliveryQueue,
} from './bridge.js'

interface DeliveryRow {
  id: string
  payload_valid: boolean
  raw_payload: string
}

export class PostgresWebhookDeliveryQueue implements WebhookDeliveryQueue {
  readonly #sql: postgres.Sql

  constructor(databaseUrl: string) {
    this.#sql = postgres(databaseUrl, {
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
    })
  }

  consumeBatch(
    limit: number,
    consume: (delivery: WebhookDelivery) => Promise<DeliveryOutcome>,
  ): Promise<DeliveryBatchResult> {
    return this.#sql.begin(async (transaction) => {
      const rows = await transaction<DeliveryRow[]>`
        SELECT id::text AS id, payload_valid, raw_payload
        FROM public.whatsapp_webhook_deliveries
        ORDER BY received_at ASC, id ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      `
      const result: DeliveryBatchResult = {
        published: 0,
        selected: rows.length,
      }

      for (const row of rows) {
        const outcome = await consume({
          id: row.id,
          payloadValid: row.payload_valid,
          rawPayload: row.raw_payload,
        })
        result[outcome] += 1
        await transaction`
          DELETE FROM public.whatsapp_webhook_deliveries
          WHERE id = ${row.id}
        `
      }

      return result
    })
  }

  async close(): Promise<void> {
    await this.#sql.end({ timeout: 5 })
  }
}
