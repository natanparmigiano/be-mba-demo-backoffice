import { parseArgs } from 'node:util'

export interface CliConfig {
  appSecret?: string
  contacts: number
  displayPhoneNumber: string
  dryRun: boolean
  durationSeconds?: number
  events?: number
  groupSize: number
  groups: number
  maxInFlight: number
  phoneNumberId: string
  quiet: boolean
  requestTimeoutMs: number
  rps: number
  seed: number
  target: string
  wabaId: string
}

export const helpText = `Synthetic WhatsApp Cloud API webhook generator

Usage:
  yarn workspace @mba-desk/webhook-generator dev -- [options]

Traffic:
  --contacts <count>          Contact pool size (default: 100)
  --groups <count>            Group pool size (default: 10)
  --group-size <count>        Members per group (default: 5)
  --rps <count>               Webhook requests per second (default: 10)
  --events <count>            Stop after this many webhooks
  --duration <seconds>        Stop after this many seconds
  --seed <integer>            Deterministic data-selection seed (default: 1)
  --max-in-flight <count>     Concurrent HTTP request cap (default: max(32, 2*rps))

Endpoint identity:
  --target <url>              Full webhook URL (default: http://localhost:3000/api/wa-cloud/webhook/1)
  --app-secret <secret>       Secret used for X-Hub-Signature-256 (or WA_APP_SECRET)
  --waba-id <id>              WABA ID expected by the channel (default: synthetic-waba)
  --phone-number-id <id>      Phone-number ID expected by the channel (default: synthetic-phone-id)
  --display-phone-number <n>  Display phone number expected by the channel (default: 15550001111)
  --request-timeout <ms>      Per-request timeout (default: 10000)

Output:
  --dry-run                   Validate and print NDJSON instead of sending HTTP
  --quiet                     Suppress progress output
  --help                      Show this help
`

export function parseCliConfig(
  args: readonly string[],
  env: Readonly<Record<string, string | undefined>> = process.env,
): CliConfig | 'help' {
  const { values } = parseArgs({
    args,
    allowPositionals: false,
    strict: true,
    options: {
      'app-secret': { type: 'string' },
      contacts: { type: 'string', default: '100' },
      'display-phone-number': { type: 'string', default: '15550001111' },
      'dry-run': { type: 'boolean', default: false },
      duration: { type: 'string' },
      events: { type: 'string' },
      'group-size': { type: 'string', default: '5' },
      groups: { type: 'string', default: '10' },
      help: { type: 'boolean', short: 'h', default: false },
      'max-in-flight': { type: 'string' },
      'phone-number-id': { type: 'string', default: 'synthetic-phone-id' },
      quiet: { type: 'boolean', default: false },
      'request-timeout': { type: 'string', default: '10000' },
      rps: { type: 'string', default: '10' },
      seed: { type: 'string', default: '1' },
      target: {
        type: 'string',
        default: 'http://localhost:3000/api/wa-cloud/webhook/1',
      },
      'waba-id': { type: 'string', default: 'synthetic-waba' },
    },
  })

  if (values.help) return 'help'

  const rps = positiveNumber('rps', values.rps)
  const config: CliConfig = {
    appSecret: values['app-secret'] ?? env.WA_APP_SECRET,
    contacts: positiveInteger('contacts', values.contacts),
    displayPhoneNumber: requiredString(
      'display-phone-number',
      values['display-phone-number'],
    ),
    dryRun: values['dry-run'],
    durationSeconds:
      values.duration === undefined
        ? undefined
        : positiveNumber('duration', values.duration),
    events:
      values.events === undefined
        ? undefined
        : positiveInteger('events', values.events),
    groupSize: nonNegativeInteger('group-size', values['group-size']),
    groups: nonNegativeInteger('groups', values.groups),
    maxInFlight:
      values['max-in-flight'] === undefined
        ? Math.max(32, Math.ceil(rps * 2))
        : positiveInteger('max-in-flight', values['max-in-flight']),
    phoneNumberId: requiredString('phone-number-id', values['phone-number-id']),
    quiet: values.quiet,
    requestTimeoutMs: positiveInteger(
      'request-timeout',
      values['request-timeout'],
    ),
    rps,
    seed: nonNegativeInteger('seed', values.seed),
    target: parseTarget(values.target),
    wabaId: requiredString('waba-id', values['waba-id']),
  }

  if (config.groups > 0 && config.groupSize < 1) {
    throw new Error('--group-size must be at least 1 when groups are enabled')
  }
  if (config.groupSize > config.contacts) {
    throw new Error('--group-size cannot exceed --contacts')
  }
  if (!config.dryRun && !config.appSecret) {
    throw new Error(
      '--app-secret or WA_APP_SECRET is required unless --dry-run is used',
    )
  }
  return config
}

function positiveInteger(name: string, value: string | undefined): number {
  const parsed = nonNegativeInteger(name, value)
  if (parsed < 1) throw new Error(`--${name} must be at least 1`)
  return parsed
}

function nonNegativeInteger(name: string, value: string | undefined): number {
  if (value === undefined || !/^\d+$/.test(value)) {
    throw new Error(`--${name} must be a non-negative integer`)
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`--${name} exceeds the safe integer range`)
  }
  return parsed
}

function positiveNumber(name: string, value: string | undefined): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`--${name} must be a positive number`)
  }
  return parsed
}

function requiredString(name: string, value: string | undefined): string {
  const normalized = value?.trim()
  if (!normalized) throw new Error(`--${name} cannot be empty`)
  return normalized
}

function parseTarget(value: string | undefined): string {
  const target = requiredString('target', value)
  let url: URL
  try {
    url = new URL(target)
  } catch {
    throw new Error('--target must be an absolute HTTP(S) URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('--target must use HTTP or HTTPS')
  }
  return url.toString()
}
