import { createHash, randomBytes } from 'node:crypto'
import { z } from 'zod'
import { db } from '@mba-desk/db'
import * as schema from '@mba-desk/db/schema'
import { kv } from '@mba-desk/kv'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { admin, organization } from 'better-auth/plugins'
import { sso } from '@better-auth/sso'
import { getAuthEnvironment } from './env.js'
import { createSecondaryStorage } from './secondary-storage.js'

export { hasSsoProviders } from './sso-availability.js'

const environment = getAuthEnvironment()

export const auth = betterAuth({
  appName: 'MBA Desk',
  baseURL: environment.baseURL,
  secret: environment.secret,
  trustedOrigins: environment.trustedOrigins,
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
    schemaName: 'auth',
  }),
  secondaryStorage: createSecondaryStorage(kv),
  databaseHooks: {
    user: {
      create: {
        before: async (user, context) => {
          if (context?.path !== '/admin/create-user') return undefined
          return { data: { ...user, emailVerified: true } }
        },
      },
    },
  },
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    organization({
      teams: { enabled: true, defaultTeam: { enabled: true } },
      organizationHooks: {
        beforeCreateTeam: async ({ team, organization }) => {
          const defaultTeam = getDefaultTeamFields(team, organization.id)
          return { data: defaultTeam ?? { isDefault: false } }
        },
        beforeUpdateTeam: async ({ team, updates }) => {
          if (typeof updates.isDefault !== 'boolean') return undefined
          const currentIsDefault: unknown = team.isDefault
          return {
            data: { ...updates, isDefault: currentIsDefault === true },
          }
        },
      },
      schema: {
        organization: {
          additionalFields: {
            primaryColor: {
              type: 'string',
              required: false,
              defaultValue: '#0866ff',
              validator: {
                input: z.string().regex(/^#[0-9a-fA-F]{6}$/),
                output: z.string().regex(/^#[0-9a-fA-F]{6}$/),
              },
            },
          },
        },
        team: {
          additionalFields: {
            slug: {
              type: 'string',
              required: true,
              unique: true,
              validator: {
                input: z
                  .string()
                  .min(1)
                  .max(80)
                  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
                output: z.string(),
              },
            },
            color: {
              type: 'string',
              required: true,
              defaultValue: '#0866ff',
              validator: {
                input: z.string().regex(/^#[0-9a-fA-F]{6}$/),
                output: z.string().regex(/^#[0-9a-fA-F]{6}$/),
              },
            },
            isDefault: {
              type: 'boolean',
              required: true,
              defaultValue: false,
              fieldName: 'default',
            },
          },
        },
      },
    }),
    admin(),
    sso({
      organizationProvisioning: {
        defaultRole: 'member',
      },
      domainVerification: {
        enabled: true,
      },
      saml: {
        enableInResponseToValidation: true,
        allowIdpInitiated: false,
      },
    }),
  ],
})

export type Auth = typeof auth
export type Session = typeof auth.$Infer.Session

export function getDefaultTeamFields(
  team: Record<string, unknown>,
  organizationId: string,
): { name: string; slug: string; color: string; isDefault: true } | undefined {
  if (typeof team.slug === 'string' && team.slug.length > 0) return undefined
  const organizationHash = createHash('sha256')
    .update(organizationId)
    .digest('hex')
    .slice(0, 16)
  return {
    name: 'Default Team',
    slug: `default-team-${organizationHash}`,
    color: '#0866ff',
    isDefault: true,
  }
}

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
          data: { emailVerified: true },
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
