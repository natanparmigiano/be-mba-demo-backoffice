type RuntimeEnvironment = Readonly<Record<string, string | undefined>>

export interface KafkaConfiguration {
  brokers: string[]
  clientId: string
  groupId: string
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

function getRuntimeEnvironment(): RuntimeEnvironment {
  const runtime = globalThis as typeof globalThis & {
    process?: { env?: RuntimeEnvironment }
  }

  return runtime.process?.env ?? {}
}
