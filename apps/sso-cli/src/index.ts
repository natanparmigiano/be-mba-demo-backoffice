#!/usr/bin/env node
import { SsoAdminClient } from './client.js'
import { helpText, loadProviderConfig, parseCliConfig } from './config.js'

async function main(): Promise<void> {
  const config = parseCliConfig(process.argv.slice(2))
  if (config === 'help') {
    process.stdout.write(helpText)
    return
  }

  const client = new SsoAdminClient(config.baseUrl)
  let result: unknown

  switch (config.command) {
    case 'status':
      result = await client.status()
      break
    case 'list':
      result = await client.list()
      break
    case 'organizations':
      result = await client.organizations()
      break
    case 'register':
      result = await client.register(
        await loadProviderConfig(config.configPath),
      )
      break
    case 'request-verification':
      result = await client.requestVerification(config.providerId)
      break
    case 'verify':
      result = await client.verify(config.providerId)
      break
    case 'delete':
      result = await client.delete(config.providerId)
      break
  }

  process.stdout.write(`${JSON.stringify(redactSecrets(result), null, 2)}\n`)
}

function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets)
  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      /^(clientSecret|privateKey|privateKeyPass|encPrivateKey|encPrivateKeyPass)$/i.test(
        key,
      )
        ? '[REDACTED]'
        : redactSecrets(nestedValue),
    ]),
  )
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n\n${helpText}`,
  )
  process.exitCode = 1
})
