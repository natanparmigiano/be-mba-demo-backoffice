# `@mba-desk/encryption`

This package standardizes authenticated application-level encryption. Callers
inject a 256-bit key explicitly and receive an AES-256-GCM service with
`encrypt`, `decrypt`, and envelope-detection methods.

Ciphertexts use a versioned `enc:v1` envelope, a fresh 96-bit nonce, a 128-bit
authentication tag, and caller-provided context as authenticated data. Context
must identify the field or purpose so ciphertext cannot be moved between
credential fields undetected.

```ts
import {
  createAes256GcmEncryption,
  decodeBase64EncryptionKey,
} from '@mba-desk/encryption'

const encryption = createAes256GcmEncryption(
  decodeBase64EncryptionKey(process.env.ENCRYPTION_KEY!),
)
const stored = encryption.encrypt(secret, 'mba.channels.wa_app_secret')
```

Key lookup and lifecycle belong to the consuming adapter. This library never
reads environment variables or stores keys globally.
