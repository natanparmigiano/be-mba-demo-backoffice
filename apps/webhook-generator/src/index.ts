#!/usr/bin/env node
import { parseCliConfig, helpText } from './config.js'
import { SyntheticWebhookGenerator } from './generator.js'
import { runGenerator } from './runner.js'
import { HttpWebhookSink, NdjsonWebhookSink } from './sender.js'

async function main(): Promise<void> {
  const config = parseCliConfig(process.argv.slice(2))
  if (config === 'help') {
    process.stdout.write(helpText)
    return
  }

  const generator = new SyntheticWebhookGenerator({
    contacts: config.contacts,
    displayPhoneNumber: config.displayPhoneNumber,
    groupSize: config.groupSize,
    groups: config.groups,
    phoneNumberId: config.phoneNumberId,
    seed: config.seed,
    wabaId: config.wabaId,
  })
  const sink = config.dryRun
    ? new NdjsonWebhookSink()
    : new HttpWebhookSink({
        appSecret: config.appSecret ?? '',
        requestTimeoutMs: config.requestTimeoutMs,
        target: config.target,
      })
  const controller = new AbortController()
  const stop = () => controller.abort()
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)

  if (!config.quiet) {
    process.stderr.write(
      `Generated pool: ${generator.pool.contacts.length} contacts, ${generator.pool.groups.length} groups; target rate: ${config.rps} RPS\n`,
    )
  }

  const stats = await runGenerator(
    generator,
    sink,
    {
      durationSeconds: config.durationSeconds,
      events: config.events,
      maxInFlight: config.maxInFlight,
      rps: config.rps,
      signal: controller.signal,
    },
    (error) => {
      process.stderr.write(
        `Webhook failed: ${error instanceof Error ? error.message : String(error)}\n`,
      )
    },
  )

  if (!config.quiet) {
    process.stderr.write(`${JSON.stringify(stats)}\n`)
  }
  if (stats.failed > 0) process.exitCode = 1
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n\n${helpText}`,
  )
  process.exitCode = 1
})
