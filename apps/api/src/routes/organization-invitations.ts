import { auth } from '@mba-desk/auth'
import { db } from '@mba-desk/db'
import { user } from '@mba-desk/db/schema'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'

interface InvitationSession {
  user: { id: string; email: string }
}

export interface OrganizationInvitationSummary {
  id: string
  organizationId: string
  organizationName: string
  role: string
  expiresAt: string
}

function uniqueCurrentInvitations(
  invitations: OrganizationInvitationSummary[],
) {
  const byOrganization = new Map<string, OrganizationInvitationSummary>()

  for (const invitation of invitations) {
    const current = byOrganization.get(invitation.organizationId)
    if (
      !current ||
      Date.parse(invitation.expiresAt) > Date.parse(current.expiresAt)
    ) {
      byOrganization.set(invitation.organizationId, invitation)
    }
  }

  return [...byOrganization.values()]
}

interface OrganizationInvitationDependencies {
  getSession: (headers: Headers) => Promise<InvitationSession | null>
  isEmailVerified: (userId: string) => Promise<boolean>
  listInvitations: (email: string) => Promise<OrganizationInvitationSummary[]>
}

const defaultDependencies: OrganizationInvitationDependencies = {
  getSession: (headers) => auth.api.getSession({ headers }),
  isEmailVerified: async (userId) => {
    const account = await db.query.user.findFirst({
      columns: { emailVerified: true },
      where: eq(user.id, userId),
    })
    return account?.emailVerified === true
  },
  listInvitations: async (email) => {
    const invitations = await auth.api.listUserInvitations({
      query: { email },
    })
    return invitations.map((invitation) => ({
      id: invitation.id,
      organizationId: invitation.organizationId,
      organizationName: invitation.organizationName,
      role: invitation.role,
      expiresAt: invitation.expiresAt.toISOString(),
    }))
  },
}

export function createOrganizationInvitationsRoute(
  dependencies: OrganizationInvitationDependencies = defaultDependencies,
) {
  return new Hono().get('/', async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers)
    if (!session) return c.json({ message: 'Unauthorized' }, 401)

    if (!(await dependencies.isEmailVerified(session.user.id))) {
      return c.json({ message: 'Email verification required' }, 403)
    }

    const invitations = await dependencies.listInvitations(session.user.email)
    return c.json(uniqueCurrentInvitations(invitations))
  })
}
