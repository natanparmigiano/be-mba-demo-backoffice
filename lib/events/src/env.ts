type RuntimeEnvironment = Readonly<Record<string, string | undefined>>

export interface KafkaConfiguration {
  brokers: string[]
  clientId: string
  groupId: string
}

export interface SqsConfiguration {
  endpoint?: string
  queueUrl: string
  region: string
}

export function getKafkaConfiguration(
  env: RuntimeEnvironment = getRuntimeEnvironment(),
): KafkaConfiguration | undefined {
  const clientId = env.KAFKA_CLIENT_ID?.trim()
  const brokersValue = env.KAFKA_BROKERS?.trim()

  if (!clientId && !brokersValue) return undefined

  if (!clientId || !brokersValue) {
    throw new Error(
      'KAFKA_CLIENT_ID and KAFKA_BROKERS must either both be configured or both be omitted',
    )
  }

  const brokers = brokersValue
    .split(',')
    .map((broker) => broker.trim())
    .filter(Boolean)

  if (brokers.length === 0) {
    throw new Error('KAFKA_BROKERS must contain at least one broker')
  }

  return {
    brokers,
    clientId,
    groupId: env.KAFKA_GROUP_ID?.trim() || `${clientId}-consumer`,
  }
}

export function getSqsConfiguration(
  env: RuntimeEnvironment = getRuntimeEnvironment(),
): SqsConfiguration | undefined {
  const queueUrl = env.SQS_QUEUE_URL?.trim()
  const region = env.SQS_REGION?.trim() || 'us-east-1'
  const endpointValue = env.SQS_ENDPOINT?.trim()

  if (!queueUrl) {
    if (endpointValue || env.SQS_REGION?.trim()) {
      throw new Error(
        'SQS_QUEUE_URL must be configured when SQS_REGION or SQS_ENDPOINT is set',
      )
    }
    return undefined
  }

  const parsedQueueUrl = parseHttpUrl(queueUrl, 'SQS_QUEUE_URL')
  const endpoint = endpointValue
    ? parseHttpUrl(endpointValue, 'SQS_ENDPOINT')
    : undefined

  if (!parsedQueueUrl.pathname.endsWith('.fifo')) {
    throw new Error('SQS_QUEUE_URL must identify a FIFO queue ending in .fifo')
  }

  return { endpoint: endpoint?.toString(), queueUrl, region }
}

function parseHttpUrl(value: string, name: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${name} must be a valid HTTP(S) URL`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${name} must be a valid HTTP(S) URL`)
  }
  return url
}

function getRuntimeEnvironment(): RuntimeEnvironment {
  const runtime = globalThis as typeof globalThis & {
    process?: { env?: RuntimeEnvironment }
  }

  return runtime.process?.env ?? {}
}
