import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { loadProviderConfig, parseCliConfig } from './config.js'

test('parses the public status command without credentials', () => {
  assert.deepEqual(parseCliConfig(['status']), {
    command: 'status',
    baseUrl: 'http://localhost:3000',
  })
})

test('loads an OIDC client secret from the configured environment variable', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mba-sso-cli-'))
  const path = join(directory, 'oidc.json')
  await writeFile(
    path,
    JSON.stringify({
      protocol: 'oidc',
      providerId: 'acme-oidc',
      issuer: 'https://login.example.com',
      domain: 'example.com',
      organizationId: 'organization-1',
      oidcConfig: {
        clientId: 'client-id',
        clientSecretEnv: 'ACME_CLIENT_SECRET',
      },
    }),
  )

  assert.deepEqual(
    await loadProviderConfig(path, { ACME_CLIENT_SECRET: 'client-secret' }),
    {
      providerId: 'acme-oidc',
      issuer: 'https://login.example.com',
      domain: 'example.com',
      organizationId: 'organization-1',
      oidcConfig: { clientId: 'client-id', clientSecret: 'client-secret' },
    },
  )
})

test('loads SAML IdP metadata relative to the config file', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mba-sso-cli-'))
  const metadataPath = join(directory, 'idp-metadata.xml')
  const configPath = join(directory, 'saml.json')
  await writeFile(metadataPath, '<EntityDescriptor />')
  await writeFile(
    configPath,
    JSON.stringify({
      protocol: 'saml',
      providerId: 'acme-saml',
      issuer: 'https://idp.example.com/saml',
      domain: 'example.com',
      organizationId: 'organization-1',
      samlConfig: {
        entryPoint: 'https://idp.example.com/saml/sso',
        idpMetadataFile: './idp-metadata.xml',
      },
    }),
  )

  assert.deepEqual(await loadProviderConfig(configPath), {
    providerId: 'acme-saml',
    issuer: 'https://idp.example.com/saml',
    domain: 'example.com',
    organizationId: 'organization-1',
    samlConfig: {
      entryPoint: 'https://idp.example.com/saml/sso',
      idpMetadata: { metadata: '<EntityDescriptor />' },
    },
  })
})
