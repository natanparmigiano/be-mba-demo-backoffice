type RuntimeEnvironment = Readonly<Record<string, string | undefined>>

export type KeyValueAdapter = 'memory' | 'postgres' | 'redis'

export interface KeyValueConfiguration {
  adapter: KeyValueAdapter
  redisUrl?: string
}

export function getKeyValueConfiguration(
  env: RuntimeEnvironment = getRuntimeEnvironment(),
): KeyValueConfiguration {
  const redisUrl = getRedisUrl(env)
  const configuredAdapter = env.KV_ADAPTER?.trim().toLowerCase()

  if (
    configuredAdapter &&
    configuredAdapter !== 'memory' &&
    configuredAdapter !== 'postgres' &&
    configuredAdapter !== 'redis'
  ) {
    throw new Error('KV_ADAPTER must be memory, postgres, or redis')
  }

  const adapter: KeyValueAdapter =
    configuredAdapter === 'memory' ||
    configuredAdapter === 'postgres' ||
    configuredAdapter === 'redis'
      ? configuredAdapter
      : redisUrl
        ? 'redis'
        : 'postgres'

  if (adapter === 'redis' && !redisUrl) {
    throw new Error('REDIS_URL is required when KV_ADAPTER is redis')
  }

  return redisUrl ? { adapter, redisUrl } : { adapter }
}

export function getRedisUrl(
  env: RuntimeEnvironment = getRuntimeEnvironment(),
): string | undefined {
  const configuredUrl = env.REDIS_URL?.trim()

  if (!configuredUrl) return undefined

  let protocol: string

  try {
    protocol = new URL(configuredUrl).protocol
  } catch {
    throw new Error('REDIS_URL must be a valid Redis URL')
  }

  if (protocol !== 'redis:' && protocol !== 'rediss:') {
    throw new Error('REDIS_URL must use the redis:// or rediss:// protocol')
  }

  return configuredUrl
}

function getRuntimeEnvironment(): RuntimeEnvironment {
  const runtime = globalThis as typeof globalThis & {
    process?: { env?: RuntimeEnvironment }
  }

  return runtime.process?.env ?? {}
}
