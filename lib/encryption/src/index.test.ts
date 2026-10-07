import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createAes256GcmEncryption,
  decodeBase64EncryptionKey,
} from './index.js'

const key = decodeBase64EncryptionKey(
  'bWJhLWRlc2stZGV2ZWxvcG1lbnQta2V5LTMyYnl0ZXM=',
)

describe('AES-256-GCM encryption', () => {
  it('round-trips with unique authenticated envelopes', () => {
    const encryption = createAes256GcmEncryption(key)
    const first = encryption.encrypt('secret-token', 'field')
    const second = encryption.encrypt('secret-token', 'field')
    assert.equal(encryption.isEncrypted(first), true)
    assert.notEqual(first, second)
    assert.equal(encryption.decrypt(first, 'field'), 'secret-token')
  })

  it('rejects moved or tampered ciphertext', () => {
    const encryption = createAes256GcmEncryption(key)
    const value = encryption.encrypt('secret-token', 'field')
    assert.throws(() => encryption.decrypt(value, 'other'), /Could not decrypt/)
    assert.throws(() => encryption.decrypt(`${value.slice(0, -1)}A`, 'field'))
  })

  it('passes plaintext reads and empty values through for staged backfills', () => {
    const encryption = createAes256GcmEncryption(key)
    assert.equal(encryption.decrypt('legacy-secret', 'field'), 'legacy-secret')
    assert.equal(encryption.encrypt('', 'field'), '')
  })

  it('validates injected keys', () => {
    assert.throws(() => decodeBase64EncryptionKey('short'), /256-bit/)
    assert.throws(() => createAes256GcmEncryption(Buffer.alloc(16)), /256-bit/)
  })
})
