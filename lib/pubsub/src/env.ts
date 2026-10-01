type RuntimeEnvironment = Readonly<Record<string, string | undefined>>

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
