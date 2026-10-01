import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hasSsoProviders } from './sso-availability.js'

test('reports that SSO is unavailable when no providers exist', async () => {
  assert.equal(await hasSsoProviders(async () => undefined), false)
})

test('reports that SSO is available when a verified provider exists', async () => {
  assert.equal(
    await hasSsoProviders(async () => ({ id: 'verified-provider' })),
    true,
  )
})
