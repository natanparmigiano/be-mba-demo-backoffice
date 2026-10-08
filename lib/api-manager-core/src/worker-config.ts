type RuntimeEnvironment = Readonly<Record<string, string | undefined>>

export function isInProcessWorkerEnabled(
  env: RuntimeEnvironment = process.env,
): boolean {
  const value = env.ENABLE_WORKER_IN_PROCESS?.trim().toLowerCase()
  if (!value) return false
  if (value === 'true') return true
  if (value === 'false') return false
  throw new Error('ENABLE_WORKER_IN_PROCESS must be true or false')
}

export function getSubscribedTopics(
  availableTopics: readonly string[],
  env: RuntimeEnvironment = process.env,
): string[] {
  const configured = env.SUBSCRIBE_TO_TOPICS?.trim() || 'all'
  const requested = [
    ...new Set(
      configured
        .split(',')
        .map((topic) => topic.trim())
        .filter(Boolean),
    ),
  ]
  if (requested.includes('all')) return [...availableTopics]
  const available = new Set(availableTopics)
  const unknown = requested.filter((topic) => !available.has(topic))
  if (unknown.length) {
    throw new Error(
      `No subscriber handlers are registered for: ${unknown.join(', ')}`,
    )
  }
  return requested
}
