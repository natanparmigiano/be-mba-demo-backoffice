import { createAuthClient } from 'better-auth/react'
import { adminClient, organizationClient } from 'better-auth/client/plugins'
import { ssoClient } from '@better-auth/sso/client'

export const authClient = createAuthClient({
  baseURL: window.location.origin,
  plugins: [
    organizationClient(),
    adminClient(),
    ssoClient({ domainVerification: { enabled: true } }),
  ],
})

export type AuthSession = typeof authClient.$Infer.Session
export type AuthUser = AuthSession['user']
