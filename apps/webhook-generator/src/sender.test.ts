import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { signWebhook } from './sender.js'

describe('signWebhook', () => {
  it('creates a Meta-compatible SHA-256 signature', () => {
    assert.equal(
      signWebhook('{"hello":"world"}', 'secret'),
      'sha256=2677ad3e7c090b2fa2c0fb13020d66d5420879b8316eb356a2d60fb9073bc778',
    )
  })
})
