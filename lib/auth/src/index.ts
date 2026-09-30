import { randomBytes } from 'node:crypto'
import { db } from '@mba-demo/db'
import * as schema from '@mba-demo/db/schema'
import { kv } from '@mba-demo/kv'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { admin, organization } from 'better-auth/plugins'
import { sso } from '@better-auth/sso'
import { getAuthEnvironment } from './env.js'
import { createSecondaryStorage } from './secondary-storage.js'

const environment = getAuthEnvironment()

export const auth = betterAuth({
  appName: 'MBA Demo Backoffice',
  baseURL: environment.baseURL,
  secret: environment.secret,
  trustedOrigins: environment.trustedOrigins,
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
    schemaName: 'auth',
  }),
  secondaryStorage: createSecondaryStorage(kv),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    organization(),
    admin(),
    sso({
      organizationProvisioning: {
        defaultRole: 'member',
      },
      domainVerification: {
        enabled: true,
      },
    }),
  ],
})

export type Auth = typeof auth
export type Session = typeof auth.$Infer.Session

const INITIAL_ADMIN_EMAIL = 'admin@meta.com'
const INITIAL_ADMIN_NAME = 'Admin'

interface InitialAdminBootstrapDependencies {
  countUsers: () => Promise<number>
  createAdmin: (password: string) => Promise<void>
  generatePassword: () => string
  logger: {
    info: (message: string) => void
    warn: (message: string) => void
  }
}

export async function bootstrapInitialAdmin(
  dependencies: InitialAdminBootstrapDependencies = {
    countUsers: () => db.$count(schema.user),
    createAdmin: async (password) => {
      await auth.api.createUser({
        body: {
          email: INITIAL_ADMIN_EMAIL,
          name: INITIAL_ADMIN_NAME,
          password,
          role: 'admin',
        },
      })
    },
    generatePassword: () => randomBytes(24).toString('base64url'),
    logger: console,
  },
): Promise<boolean> {
  if ((await dependencies.countUsers()) > 0) return false

  const password = dependencies.generatePassword()

  try {
    await dependencies.createAdmin(password)
  } catch (error) {
    // Multiple application replicas can race during their first startup. If
    // another replica created a user first, the database is already seeded.
    if ((await dependencies.countUsers()) > 0) return false
    throw error
  }

  dependencies.logger.info('Initial administrator created:')
  dependencies.logger.info(`  Email: ${INITIAL_ADMIN_EMAIL}`)
  dependencies.logger.info(`  Password: ${password}`)
  dependencies.logger.warn(
    'WARNING: Change the initial administrator password immediately after signing in.',
  )

  return true
}
