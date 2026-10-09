export const DEVELOPMENT_AUTH_URL = 'http://localhost:3000'
export const DEVELOPMENT_AUTH_SECRET =
  'development-only-secret-change-before-production'

export interface AuthEnvironment {
  baseURL: string
  secret: string
  trustedOrigins: string[]
}

type RuntimeEnvironment = Readonly<Record<string, string | undefined>>

export function getAuthEnvironment(
  env: RuntimeEnvironment = getRuntimeEnvironment(),
): AuthEnvironment {
  const isProduction = env.NODE_ENV === 'production'
  const secret = env.BETTER_AUTH_SECRET?.trim()
  const baseURL = env.BETTER_AUTH_URL?.trim()

  if (isProduction && !secret) {
    throw new Error('BETTER_AUTH_SECRET is required when NODE_ENV=production')
  }

  if (isProduction && !baseURL) {
    throw new Error('BETTER_AUTH_URL is required when NODE_ENV=production')
  }

  const resolvedBaseURL = baseURL || DEVELOPMENT_AUTH_URL
  const frontendOrigin = env.CORS_ORIGIN?.trim() || 'http://localhost:44100'

  return {
    baseURL: validateHttpUrl(resolvedBaseURL, 'BETTER_AUTH_URL'),
    secret: secret || DEVELOPMENT_AUTH_SECRET,
    trustedOrigins: [validateHttpUrl(frontendOrigin, 'CORS_ORIGIN')],
  }
}

function getRuntimeEnvironment(): RuntimeEnvironment {
  const runtime = globalThis as typeof globalThis & {
    process?: { env?: RuntimeEnvironment }
  }

  return runtime.process?.env ?? {}
}

function validateHttpUrl(value: string, name: string): string {
  let url: URL

  try {
    url = new URL(value)
  } catch {
    throw new Error(`${name} must be a valid HTTP URL`)
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${name} must use the http:// or https:// protocol`)
  }

  return value
}
