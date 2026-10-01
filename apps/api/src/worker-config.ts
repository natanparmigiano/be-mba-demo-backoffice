type RuntimeEnvironment = Readonly<Record<string, string | undefined>>

export const DEFAULT_WA_WEBHOOK_MAX_RETRIES = 5
const MAX_WA_WEBHOOK_MAX_RETRIES = 100

export function isInProcessWorkerEnabled(
  env: RuntimeEnvironment = getRuntimeEnvironment(),
): boolean {
  const value = env.ENABLE_WORKER_IN_PROCESS?.trim().toLowerCase()

  if (!value) return false
  if (value === 'true') return true
  if (value === 'false') return false

  throw new Error('ENABLE_WORKER_IN_PROCESS must be true or false')
}

export function getSubscribedTopics(
  availableTopics: readonly string[],
  env: RuntimeEnvironment = getRuntimeEnvironment(),
): string[] {
  const configuredValue = env.SUBSCRIBE_TO_TOPICS?.trim() || 'all'
  const requestedTopics = [
    ...new Set(
      configuredValue
        .split(',')
        .map((topic) => topic.trim())
        .filter(Boolean),
    ),
  ]

  if (requestedTopics.includes('all')) return [...availableTopics]

  const available = new Set(availableTopics)
  const unknownTopics = requestedTopics.filter((topic) => !available.has(topic))

  if (unknownTopics.length > 0) {
    throw new Error(
      `No subscriber handlers are registered for: ${unknownTopics.join(', ')}`,
    )
  }

  return requestedTopics
}

export function getWhatsAppWebhookMaxRetries(
  env: RuntimeEnvironment = getRuntimeEnvironment(),
): number {
  const value = env.WA_WEBHOOK_MAX_RETRIES?.trim()
  if (!value) return DEFAULT_WA_WEBHOOK_MAX_RETRIES
  if (!/^\d+$/.test(value)) {
    throw new Error('WA_WEBHOOK_MAX_RETRIES must be an integer from 0 to 100')
  }

  const parsed = Number(value)
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 0 ||
    parsed > MAX_WA_WEBHOOK_MAX_RETRIES
  ) {
    throw new Error('WA_WEBHOOK_MAX_RETRIES must be an integer from 0 to 100')
  }
  return parsed
}

function getRuntimeEnvironment(): RuntimeEnvironment {
  const runtime = globalThis as typeof globalThis & {
    process?: { env?: RuntimeEnvironment }
  }

  return runtime.process?.env ?? {}
}
