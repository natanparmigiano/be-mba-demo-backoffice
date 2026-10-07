import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

export type SsoCliCommand =
  | { command: 'status'; baseUrl: string }
  | { command: 'organizations'; baseUrl: string }
  | { command: 'list'; baseUrl: string }
  | { command: 'register'; baseUrl: string; configPath: string }
  | { command: 'request-verification'; baseUrl: string; providerId: string }
  | { command: 'verify'; baseUrl: string; providerId: string }
  | { command: 'delete'; baseUrl: string; providerId: string }
  | 'help'

type RuntimeEnvironment = Readonly<Record<string, string | undefined>>

export const helpText = `MBA Desk SSO setup CLI

Usage:
  yarn sso status [--base-url URL]
  yarn sso organizations [--base-url URL]
  yarn sso list [--base-url URL]
  yarn sso register --config FILE [--base-url URL]
  yarn sso request-verification --provider-id ID [--base-url URL]
  yarn sso verify --provider-id ID [--base-url URL]
  yarn sso delete --provider-id ID [--base-url URL]

Environment:
  SSO_BASE_URL         Application origin (default: http://localhost:3000)
  SSO_ADMIN_EMAIL      Email/password account used for authenticated commands
  SSO_ADMIN_PASSWORD   Password used only for the sign-in request
  SSO_SESSION_COOKIE   Existing Cookie header; skips email/password sign-in

Provider config files may use oidcConfig.clientSecretEnv to read a client
secret from an environment variable, or samlConfig.idpMetadataFile to read
metadata XML relative to the JSON config file.
`

export function parseCliConfig(
  args: readonly string[],
  env: RuntimeEnvironment = process.env,
): SsoCliCommand {
  const [command, ...rest] = args
  if (
    !command ||
    command === 'help' ||
    command === '--help' ||
    command === '-h'
  )
    return 'help'

  const options = parseOptions(rest)
  const baseUrl = normalizeBaseUrl(
    options.get('base-url') ?? env.SSO_BASE_URL ?? 'http://localhost:3000',
  )

  if (
    command === 'status' ||
    command === 'organizations' ||
    command === 'list'
  ) {
    assertNoUnknownOptions(options, ['base-url'])
    return { command, baseUrl }
  }

  if (command === 'register') {
    assertNoUnknownOptions(options, ['base-url', 'config'])
    return {
      command,
      baseUrl,
      configPath: requireOption(options, 'config'),
    }
  }

  if (
    command === 'request-verification' ||
    command === 'verify' ||
    command === 'delete'
  ) {
    assertNoUnknownOptions(options, ['base-url', 'provider-id'])
    return {
      command,
      baseUrl,
      providerId: requireOption(options, 'provider-id'),
    }
  }

  throw new Error(`Unknown command: ${command}`)
}

export async function loadProviderConfig(
  configPath: string,
  env: RuntimeEnvironment = process.env,
): Promise<Record<string, unknown>> {
  const absolutePath = resolve(configPath)
  const raw: unknown = JSON.parse(await readFile(absolutePath, 'utf8'))
  const config = requireRecord(raw, 'provider config')
  const protocol = requireString(config.protocol, 'protocol')
  const providerId = requireString(config.providerId, 'providerId')
  const issuer = requireHttpUrl(config.issuer, 'issuer')
  const domain = requireString(config.domain, 'domain')
  const organizationId = requireString(config.organizationId, 'organizationId')

  if (protocol === 'oidc') {
    const oidcConfig = {
      ...requireRecord(config.oidcConfig, 'oidcConfig'),
    }
    const secretEnvironmentName = optionalString(
      oidcConfig.clientSecretEnv,
      'oidcConfig.clientSecretEnv',
    )
    delete oidcConfig.clientSecretEnv

    if (secretEnvironmentName) {
      const secret = env[secretEnvironmentName]?.trim()
      if (!secret) {
        throw new Error(
          `Environment variable ${secretEnvironmentName} is required`,
        )
      }
      oidcConfig.clientSecret = secret
    }

    requireString(oidcConfig.clientId, 'oidcConfig.clientId')
    requireString(oidcConfig.clientSecret, 'oidcConfig.clientSecret')
    return { providerId, issuer, domain, organizationId, oidcConfig }
  }

  if (protocol === 'saml') {
    const samlConfig = {
      ...requireRecord(config.samlConfig, 'samlConfig'),
    }
    const metadataFile = optionalString(
      samlConfig.idpMetadataFile,
      'samlConfig.idpMetadataFile',
    )
    delete samlConfig.idpMetadataFile

    if (metadataFile) {
      const idpMetadata = {
        ...(samlConfig.idpMetadata
          ? requireRecord(samlConfig.idpMetadata, 'samlConfig.idpMetadata')
          : {}),
        metadata: await readFile(
          resolve(dirname(absolutePath), metadataFile),
          'utf8',
        ),
      }
      samlConfig.idpMetadata = idpMetadata
    }

    requireHttpUrl(samlConfig.entryPoint, 'samlConfig.entryPoint')
    const idpMetadata = requireRecord(
      samlConfig.idpMetadata,
      'samlConfig.idpMetadata',
    )
    requireString(idpMetadata.metadata, 'samlConfig.idpMetadata.metadata')
    return { providerId, issuer, domain, organizationId, samlConfig }
  }

  throw new Error('protocol must be either "oidc" or "saml"')
}

function parseOptions(args: readonly string[]): Map<string, string> {
  const options = new Map<string, string>()
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index]
    const value = args[index + 1]
    if (!flag?.startsWith('--') || !value || value.startsWith('--')) {
      throw new Error(`Expected --option value, received: ${flag ?? ''}`)
    }
    const name = flag.slice(2)
    if (options.has(name)) throw new Error(`Duplicate option: --${name}`)
    options.set(name, value)
  }
  return options
}

function assertNoUnknownOptions(
  options: ReadonlyMap<string, string>,
  allowed: readonly string[],
): void {
  for (const name of options.keys()) {
    if (!allowed.includes(name)) throw new Error(`Unknown option: --${name}`)
  }
}

function requireOption(options: ReadonlyMap<string, string>, name: string) {
  const value = options.get(name)?.trim()
  if (!value) throw new Error(`--${name} is required`)
  return value
}

function normalizeBaseUrl(value: string): string {
  const url = new URL(value)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Base URL must use http:// or https://')
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Base URL must be an origin without a path, query, or hash')
  }
  return url.origin
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be an object`)
  }
  return value as Record<string, unknown>
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${name} must be a non-empty string`)
  }
  return value.trim()
}

function optionalString(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined
  return requireString(value, name)
}

function requireHttpUrl(value: unknown, name: string): string {
  const text = requireString(value, name)
  const url = new URL(text)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${name} must use http:// or https://`)
  }
  return text
}
