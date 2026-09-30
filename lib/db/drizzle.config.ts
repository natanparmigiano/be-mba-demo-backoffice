import { defineConfig } from 'drizzle-kit'
import { loadEnvFile } from 'node:process'
import { fileURLToPath } from 'node:url'
import { getDatabaseUrl } from './src/env.js'

try {
  loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)))
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
}

export default defineConfig({
  schema: './src/schema/*.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: getDatabaseUrl(),
  },
  strict: true,
  verbose: true,
})
