import { appendFile, readFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'

const path = new URL('../.env', import.meta.url)
let contents = ''
try {
  contents = await readFile(path, 'utf8')
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}

const match = contents.match(/^ENCRYPTION_KEY=(.*)$/m)
if (match?.[1]?.trim()) {
  const encoded = match[1].trim()
  const key = Buffer.from(encoded, 'base64')
  if (key.length !== 32 || key.toString('base64') !== encoded) {
    throw new Error(
      'Existing ENCRYPTION_KEY is not a canonical base64 256-bit key',
    )
  }
  console.log('ENCRYPTION_KEY already exists and is valid.')
} else {
  const separator = contents.length > 0 && !contents.endsWith('\n') ? '\n' : ''
  await appendFile(
    path,
    `${separator}ENCRYPTION_KEY=${randomBytes(32).toString('base64')}\n`,
    { mode: 0o600 },
  )
  console.log('Generated ENCRYPTION_KEY in .env.')
}
