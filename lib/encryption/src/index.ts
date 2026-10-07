import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const ENVELOPE_PREFIX = 'enc:v1:'
const IV_BYTES = 12
const KEY_BYTES = 32

export interface EncryptionService {
  encrypt(value: string, context: string): string
  decrypt(value: string, context: string): string
  isEncrypted(value: string): boolean
}

export function decodeBase64EncryptionKey(encoded: string): Buffer {
  const key = Buffer.from(encoded, 'base64')
  if (key.length !== KEY_BYTES || key.toString('base64') !== encoded) {
    throw new Error(
      'Encryption key must be a canonical base64-encoded 256-bit key',
    )
  }
  return key
}

export function createAes256GcmEncryption(key: Uint8Array): EncryptionService {
  if (key.byteLength !== KEY_BYTES) {
    throw new Error('AES-256-GCM requires a 256-bit key')
  }
  const keyBytes = Buffer.from(key)

  const isEncrypted = (value: string) => value.startsWith(ENVELOPE_PREFIX)

  return {
    isEncrypted,
    encrypt(value, context) {
      if (!value) return value
      const iv = randomBytes(IV_BYTES)
      const cipher = createCipheriv(ALGORITHM, keyBytes, iv)
      cipher.setAAD(Buffer.from(context, 'utf8'))
      const ciphertext = Buffer.concat([
        cipher.update(value, 'utf8'),
        cipher.final(),
      ])
      const tag = cipher.getAuthTag()
      return [
        'enc',
        'v1',
        iv.toString('base64url'),
        tag.toString('base64url'),
        ciphertext.toString('base64url'),
      ].join(':')
    },
    decrypt(value, context) {
      if (!value || !isEncrypted(value)) return value
      const parts = value.split(':')
      if (parts.length !== 5 || parts[0] !== 'enc' || parts[1] !== 'v1') {
        throw new Error('Encrypted value has an invalid envelope')
      }
      try {
        const iv = Buffer.from(parts[2]!, 'base64url')
        const tag = Buffer.from(parts[3]!, 'base64url')
        const ciphertext = Buffer.from(parts[4]!, 'base64url')
        if (
          iv.length !== IV_BYTES ||
          tag.length !== 16 ||
          ciphertext.length === 0
        ) {
          throw new Error('invalid encrypted value dimensions')
        }
        const decipher = createDecipheriv(ALGORITHM, keyBytes, iv)
        decipher.setAAD(Buffer.from(context, 'utf8'))
        decipher.setAuthTag(tag)
        return Buffer.concat([
          decipher.update(ciphertext),
          decipher.final(),
        ]).toString('utf8')
      } catch (error) {
        throw new Error(`Could not decrypt ${context}`, { cause: error })
      }
    },
  }
}
