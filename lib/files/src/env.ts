type RuntimeEnvironment = Readonly<Record<string, string | undefined>>

export interface FileSystemConfiguration {
  adapter: 'fs'
  directory: string
  publicUrl: string
  signingSecret: string
}

export interface S3Configuration {
  accessKeyId?: string
  adapter: 's3'
  bucket: string
  createBucket: boolean
  endpoint?: string
  forcePathStyle: boolean
  publicEndpoint?: string
  region: string
  secretAccessKey?: string
}

export type FileStoreConfiguration = FileSystemConfiguration | S3Configuration

export function getFileStoreConfiguration(
  env: RuntimeEnvironment = getRuntimeEnvironment(),
): FileStoreConfiguration {
  const adapter = env.FILES_ADAPTER?.trim() || 'fs'

  if (adapter === 'fs') return getFileSystemConfiguration(env)
  if (adapter === 's3') return getS3Configuration(env)

  throw new Error('FILES_ADAPTER must be either fs or s3')
}

function getFileSystemConfiguration(
  env: RuntimeEnvironment,
): FileSystemConfiguration {
  const isProduction = env.NODE_ENV === 'production'
  const directory = env.FILES_DIRECTORY?.trim() || '.data/files'
  const publicUrl =
    env.FILES_PUBLIC_URL?.trim() ||
    (isProduction
      ? undefined
      : `http://localhost:${env.PORT?.trim() || '3000'}`)
  const signingSecret =
    env.FILES_SIGNING_SECRET?.trim() ||
    (isProduction ? undefined : 'development-only-files-signing-secret')

  if (!publicUrl) {
    throw new Error('FILES_PUBLIC_URL is required for filesystem storage')
  }

  if (!signingSecret) {
    throw new Error('FILES_SIGNING_SECRET is required for filesystem storage')
  }

  if (isProduction && Buffer.byteLength(signingSecret) < 32) {
    throw new Error(
      'FILES_SIGNING_SECRET must contain at least 32 bytes in production',
    )
  }

  const parsedPublicUrl = parseHttpUrl(publicUrl, 'FILES_PUBLIC_URL')

  if (
    parsedPublicUrl.search ||
    parsedPublicUrl.hash ||
    parsedPublicUrl.username ||
    parsedPublicUrl.password
  ) {
    throw new Error(
      'FILES_PUBLIC_URL must not include credentials, a query, or a fragment',
    )
  }

  return {
    adapter: 'fs',
    directory,
    publicUrl: parsedPublicUrl.toString().replace(/\/$/, ''),
    signingSecret,
  }
}

function getS3Configuration(env: RuntimeEnvironment): S3Configuration {
  const bucket = requireValue(env.FILES_S3_BUCKET, 'FILES_S3_BUCKET')
  const accessKeyId = env.FILES_S3_ACCESS_KEY_ID?.trim() || undefined
  const secretAccessKey = env.FILES_S3_SECRET_ACCESS_KEY?.trim() || undefined
  const endpoint = optionalHttpUrl(env.FILES_S3_ENDPOINT, 'FILES_S3_ENDPOINT')
  const publicEndpoint = optionalHttpUrl(
    env.FILES_S3_PUBLIC_ENDPOINT,
    'FILES_S3_PUBLIC_ENDPOINT',
  )

  if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) {
    throw new Error(
      'FILES_S3_ACCESS_KEY_ID and FILES_S3_SECRET_ACCESS_KEY must either both be configured or both be omitted',
    )
  }

  return {
    accessKeyId,
    adapter: 's3',
    bucket,
    createBucket: parseBoolean(
      env.FILES_S3_CREATE_BUCKET,
      false,
      'FILES_S3_CREATE_BUCKET',
    ),
    endpoint,
    forcePathStyle: parseBoolean(
      env.FILES_S3_FORCE_PATH_STYLE,
      endpoint !== undefined,
      'FILES_S3_FORCE_PATH_STYLE',
    ),
    publicEndpoint: publicEndpoint ?? endpoint,
    region: env.FILES_S3_REGION?.trim() || 'us-east-1',
    secretAccessKey,
  }
}

function optionalHttpUrl(
  value: string | undefined,
  name: string,
): string | undefined {
  const configuredValue = value?.trim()
  if (!configuredValue) return undefined
  return parseHttpUrl(configuredValue, name).toString().replace(/\/$/, '')
}

function parseHttpUrl(value: string, name: string): URL {
  let parsed: URL

  try {
    parsed = new URL(value)
  } catch {
    throw new Error(`${name} must be a valid HTTP URL`)
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${name} must use the http:// or https:// protocol`)
  }

  return parsed
}

function parseBoolean(
  value: string | undefined,
  defaultValue: boolean,
  name: string,
): boolean {
  const configuredValue = value?.trim().toLowerCase()

  if (!configuredValue) return defaultValue
  if (configuredValue === 'true') return true
  if (configuredValue === 'false') return false

  throw new Error(`${name} must be either true or false`)
}

function requireValue(value: string | undefined, name: string): string {
  const configuredValue = value?.trim()

  if (!configuredValue) throw new Error(`${name} is required for S3 storage`)
  return configuredValue
}

function getRuntimeEnvironment(): RuntimeEnvironment {
  const runtime = globalThis as typeof globalThis & {
    process?: { env?: RuntimeEnvironment }
  }

  return runtime.process?.env ?? {}
}
