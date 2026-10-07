import {
  createAes256GcmEncryption,
  decodeBase64EncryptionKey,
} from '@mba-desk/encryption'
import { getRuntimeEnvironment, type RuntimeEnvironment } from './env.js'

// Stable only for dependency-free local development. Production must provide its own key.
export const DEVELOPMENT_ENCRYPTION_KEY =
  'bWJhLWRlc2stZGV2ZWxvcG1lbnQta2V5LTMyYnl0ZXM='

export function getEncryptionKey(
  env: RuntimeEnvironment = getRuntimeEnvironment(),
): Uint8Array {
  const configured = env.ENCRYPTION_KEY?.trim()
  if (!configured && env.NODE_ENV === 'production') {
    throw new Error('ENCRYPTION_KEY is required when NODE_ENV=production')
  }

  try {
    return decodeBase64EncryptionKey(configured || DEVELOPMENT_ENCRYPTION_KEY)
  } catch (error) {
    throw new Error(
      'ENCRYPTION_KEY must be a canonical base64-encoded 256-bit key',
      {
        cause: error,
      },
    )
  }
}

export function isEncryptedValue(value: string): boolean {
  return createAes256GcmEncryption(getEncryptionKey()).isEncrypted(value)
}

export function encryptValue(value: string, context: string): string {
  return createAes256GcmEncryption(getEncryptionKey()).encrypt(value, context)
}

export function decryptValue(value: string, context: string): string {
  return createAes256GcmEncryption(getEncryptionKey()).decrypt(value, context)
}
