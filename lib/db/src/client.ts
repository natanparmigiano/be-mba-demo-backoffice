import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { getDatabaseUrl, getRuntimeEnvironment } from './env.js'
import * as schema from './schema/index.js'

const isProduction = getRuntimeEnvironment().NODE_ENV === 'production'

const client = postgres(getDatabaseUrl(), {
  max: isProduction ? 10 : 1,
  idle_timeout: 20,
  connect_timeout: 10,
})

export const db = drizzle(client, { schema })

export type Database = typeof db

export async function closeDatabase(): Promise<void> {
  await client.end({ timeout: 5 })
}
