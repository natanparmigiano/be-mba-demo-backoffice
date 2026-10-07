import { createAuthClient } from 'better-auth/react'
import { adminClient, organizationClient } from 'better-auth/client/plugins'
import { ssoClient } from '@better-auth/sso/client'

export const authClient = createAuthClient({
  baseURL: window.location.origin,
  plugins: [
    organizationClient({
      teams: { enabled: true },
      schema: {
        organization: {
          additionalFields: {
            primaryColor: {
              type: 'string',
              required: false,
              defaultValue: '#0866ff',
            },
          },
        },
        team: {
          additionalFields: {
            slug: {
              type: 'string',
              required: true,
            },
            color: {
              type: 'string',
              required: true,
              defaultValue: '#0866ff',
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
    adminClient(),
    ssoClient({ domainVerification: { enabled: true } }),
  ],
})

export type AuthSession = typeof authClient.$Infer.Session
export type AuthUser = AuthSession['user']
