export const DEVELOPMENT_DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5432/mba_desk'

export type RuntimeEnvironment = Readonly<Record<string, string | undefined>>

export function getRuntimeEnvironment(): RuntimeEnvironment {
  const runtime = globalThis as typeof globalThis & {
    process?: { env?: RuntimeEnvironment }
  }

  return runtime.process?.env ?? {}
}

export function getDatabaseUrl(
  env: RuntimeEnvironment = getRuntimeEnvironment(),
): string {
  const configuredUrl = env.DATABASE_URL?.trim()

  if (!configuredUrl && env.NODE_ENV === 'production') {
    throw new Error('DATABASE_URL is required when NODE_ENV=production')
  }

  const databaseUrl = configuredUrl || DEVELOPMENT_DATABASE_URL
  let parsedUrl: URL

  try {
    parsedUrl = new URL(databaseUrl)
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL')
  }

  if (
    parsedUrl.protocol !== 'postgres:' &&
    parsedUrl.protocol !== 'postgresql:'
  ) {
    throw new Error(
      'DATABASE_URL must use the postgres:// or postgresql:// protocol',
    )
  }

  for (const parameter of [...parsedUrl.searchParams.keys()]) {
    if (parameter.toLowerCase() === 'verifyssl') {
      parsedUrl.searchParams.delete(parameter)
    }
  }

  return parsedUrl.href
}
