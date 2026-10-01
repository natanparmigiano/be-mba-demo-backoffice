import { parseArgs } from 'node:util'

export interface CliConfig {
  batchSize: number
  channelId: number
  databaseUrl: string
}

export const helpText = `PostgreSQL WhatsApp webhook bridge

Reads public.whatsapp_webhook_deliveries once per second, publishes valid raw
payloads to the application's WhatsApp webhook topic, then deletes processed
rows.

Usage:
  yarn workspace @mba-demo/webhook-bridge dev -- \\
    --database-url <postgres-url> \\
    --channel-id <positive-integer>

Required:
  --database-url <url>  PostgreSQL connection URL for the delivery table
  --channel-id <id>     Local application channel receiving the webhooks

Optional:
  --batch-size <count>  Rows locked per poll (default: 100)
  --help, -h            Show this help

Kafka:
  KAFKA_CLIENT_ID and KAFKA_BROKERS must be configured. KAFKA_GROUP_ID is not
  used by this producer-only process but is accepted by the shared event config.

Failures:
  Invalid deliveries append to fails.jsonl, then are published unchanged.
`

export function parseCliConfig(args: readonly string[]): CliConfig | 'help' {
  const { values } = parseArgs({
    args,
    allowPositionals: false,
    strict: true,
    options: {
      'batch-size': { type: 'string', default: '100' },
      'channel-id': { type: 'string' },
      'database-url': { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  })

  if (values.help) return 'help'

  return {
    batchSize: positiveInteger('batch-size', values['batch-size']),
    channelId: positiveInteger('channel-id', values['channel-id']),
    databaseUrl: postgresUrl(values['database-url']),
  }
}

function positiveInteger(name: string, value: string | undefined): number {
  if (!value || !/^\d+$/.test(value)) {
    throw new Error(`--${name} must be a positive integer`)
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`--${name} must be a positive safe integer`)
  }
  return parsed
}

function postgresUrl(value: string | undefined): string {
  const normalized = value?.trim()
  if (!normalized) throw new Error('--database-url is required')

  let url: URL
  try {
    url = new URL(normalized)
  } catch {
    throw new Error('--database-url must be a valid PostgreSQL URL')
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error('--database-url must use postgres or postgresql')
  }
  return normalized
}
