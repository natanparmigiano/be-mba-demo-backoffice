import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { fileURLToPath } from 'node:url'
import { closeDatabase, db } from './client.js'

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url))

async function runMigrations(): Promise<void> {
  try {
    console.log('Applying database migrations')
    await migrate(db, { migrationsFolder })
    console.log('Database migrations are up to date')
  } finally {
    await closeDatabase()
  }
}

runMigrations().catch((error: unknown) => {
  console.error('Database migration failed', error)
  process.exitCode = 1
})
