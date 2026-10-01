#!/usr/bin/env node
import { resolve } from 'node:path'
import { createEventBus, getKafkaConfiguration } from '@mba-demo/events'
import { runWebhookBridge } from './bridge.js'
import { helpText, parseCliConfig } from './config.js'
import { appendFailureJsonl, FAILURE_FILE_NAME } from './failures.js'
import { PostgresWebhookDeliveryQueue } from './postgres.js'

async function main(): Promise<void> {
  const config = parseCliConfig(process.argv.slice(2))
  if (config === 'help') {
    process.stdout.write(helpText)
    return
  }

  const kafka = getKafkaConfiguration()
  if (!kafka) {
    throw new Error(
      'KAFKA_CLIENT_ID and KAFKA_BROKERS are required; the memory event bus cannot bridge separate processes',
    )
  }

  const eventBus = createEventBus(kafka)
  const queue = new PostgresWebhookDeliveryQueue(config.databaseUrl)
  const failureFilePath = resolve(process.cwd(), FAILURE_FILE_NAME)
  const controller = new AbortController()
  const stop = () => controller.abort()
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)

  try {
    await eventBus.start()
    process.stderr.write(
      `Webhook bridge started for channel ${config.channelId}; polling every second; failures append to ${failureFilePath}\n`,
    )

    const stats = await runWebhookBridge(queue, eventBus, {
      batchSize: config.batchSize,
      channelId: config.channelId,
      signal: controller.signal,
      onBatch: (batch) => {
        if (batch.selected > 0) {
          process.stderr.write(
            `Processed ${batch.selected} row(s): ${batch.published} published\n`,
          )
        }
      },
      onInvalid: async (delivery, reason) => {
        try {
          await appendFailureJsonl(delivery, reason, {
            channelId: config.channelId,
            filePath: failureFilePath,
          })
        } catch (error) {
          process.stderr.write(
            `Could not append delivery ${delivery.id} to ${failureFilePath}: ${error instanceof Error ? error.message : String(error)}\n`,
          )
        }
        process.stderr.write(
          `Forwarding invalid delivery ${delivery.id}: ${reason}\n`,
        )
      },
    })

    process.stderr.write(
      `Webhook bridge stopped: ${stats.published} published\n`,
    )
  } finally {
    process.off('SIGINT', stop)
    process.off('SIGTERM', stop)
    try {
      await eventBus.close()
    } finally {
      await queue.close()
    }
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n\n${helpText}`,
  )
  process.exitCode = 1
})
