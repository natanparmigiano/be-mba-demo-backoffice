import { auth } from '@mba-demo/auth'
import { db } from '@mba-demo/db'
import * as schema from '@mba-demo/db/schema'
import { and, asc, eq } from 'drizzle-orm'
import { Hono } from 'hono'

export interface AdminOrganizationSummary {
  id: string
  name: string
  slug: string
  createdAt: string
  memberCount: number
  currentUserRole: string | null
}

export interface AdminOrganizationMember {
  id: string
  role: string
  userId: string
  user: {
    email: string
    name: string
  }
}

export interface AdminOrganizationDetails extends AdminOrganizationSummary {
  members: AdminOrganizationMember[]
}

interface AdminSession {
  user: {
    id: string
    role?: string | null
  }
}

interface AdminOrganizationsDependencies {
  getSession: (headers: Headers) => Promise<AdminSession | null>
  listOrganizations: (
    userId: string,
    search: string,
  ) => Promise<AdminOrganizationSummary[]>
  getOrganization: (
    organizationId: string,
    userId: string,
  ) => Promise<AdminOrganizationDetails | undefined>
  addSelfAsAdmin: (organizationId: string, userId: string) => Promise<string>
  deleteOrganization: (organizationId: string) => Promise<boolean>
}

const defaultDependencies: AdminOrganizationsDependencies = {
  getSession: (headers) => auth.api.getSession({ headers }),
  listOrganizations: listOrganizationsForAdmin,
  getOrganization: getOrganizationForAdmin,
  addSelfAsAdmin,
  deleteOrganization: deleteOrganizationForAdmin,
}

export const createAdminOrganizationsRoute = (
  dependencies: AdminOrganizationsDependencies = defaultDependencies,
) =>
  new Hono()
    .get('/', async (c) => {
      const session = await dependencies.getSession(c.req.raw.headers)
      if (!session) return c.json({ message: 'Unauthorized' }, 401)
      if (!hasAdminRole(session.user.role)) {
        return c.json({ message: 'Forbidden' }, 403)
      }

      const organizations = await dependencies.listOrganizations(
        session.user.id,
        c.req.query('search')?.trim() ?? '',
      )
      return c.json(organizations)
    })
    .get('/:id', async (c) => {
      const session = await dependencies.getSession(c.req.raw.headers)
      if (!session) return c.json({ message: 'Unauthorized' }, 401)
      if (!hasAdminRole(session.user.role)) {
        return c.json({ message: 'Forbidden' }, 403)
      }

      const organization = await dependencies.getOrganization(
        c.req.param('id'),
        session.user.id,
      )
      if (!organization) {
        return c.json({ message: 'Organization not found' }, 404)
      }

      return c.json(organization)
    })
    .post('/:id/members/self', async (c) => {
      const session = await dependencies.getSession(c.req.raw.headers)
      if (!session) return c.json({ message: 'Unauthorized' }, 401)
      if (!hasAdminRole(session.user.role)) {
        return c.json({ message: 'Forbidden' }, 403)
      }

      const organization = await dependencies.getOrganization(
        c.req.param('id'),
        session.user.id,
      )
      if (!organization) {
        return c.json({ message: 'Organization not found' }, 404)
      }

      const role = await dependencies.addSelfAsAdmin(
        organization.id,
        session.user.id,
      )
      return c.json({ organizationId: organization.id, role })
    })
    .delete('/:id', async (c) => {
      const session = await dependencies.getSession(c.req.raw.headers)
      if (!session) return c.json({ message: 'Unauthorized' }, 401)
      if (!hasAdminRole(session.user.role)) {
        return c.json({ message: 'Forbidden' }, 403)
      }

      try {
        const deleted = await dependencies.deleteOrganization(c.req.param('id'))
        if (!deleted) {
          return c.json({ message: 'Organization not found' }, 404)
        }
        return c.json({ deleted: true as const })
      } catch (error) {
        if (getDatabaseErrorCode(error) === '23503') {
          return c.json(
            {
              message:
                'Remove the organization’s channels and related data before deleting it.',
            },
            409,
          )
        }
        throw error
      }
    })

async function listOrganizationsForAdmin(
  userId: string,
  search: string,
): Promise<AdminOrganizationSummary[]> {
  const organizations = await db.query.organization.findMany({
    where: search
      ? (organization, { or, ilike }) =>
          or(
            ilike(organization.name, `%${search}%`),
            ilike(organization.slug, `%${search}%`),
          )
      : undefined,
    orderBy: (organization) => [asc(organization.name)],
    limit: 100,
    with: { members: true },
  })

  return organizations.map((organization) => ({
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    createdAt: organization.createdAt.toISOString(),
    memberCount: organization.members.length,
    currentUserRole:
      organization.members.find((member) => member.userId === userId)?.role ??
      null,
  }))
}

async function getOrganizationForAdmin(
  organizationId: string,
  userId: string,
): Promise<AdminOrganizationDetails | undefined> {
  const organization = await db.query.organization.findFirst({
    where: (organization, { eq }) => eq(organization.id, organizationId),
    with: {
      members: {
        with: { user: true },
      },
    },
  })

  if (!organization) return undefined

  const members = organization.members
    .map((member) => ({
      id: member.id,
      role: member.role,
      userId: member.userId,
      user: {
        email: member.user.email,
        name: member.user.name,
      },
    }))
    .sort((left, right) => left.user.name.localeCompare(right.user.name))

  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    createdAt: organization.createdAt.toISOString(),
    memberCount: members.length,
    currentUserRole:
      members.find((member) => member.userId === userId)?.role ?? null,
    members,
  }
}

async function addSelfAsAdmin(
  organizationId: string,
  userId: string,
): Promise<string> {
  const membership = await db.query.member.findFirst({
    where: (member, { and, eq }) =>
      and(eq(member.organizationId, organizationId), eq(member.userId, userId)),
  })

  if (!membership) {
    const createdMembership = await auth.api.addMember({
      body: {
        organizationId,
        userId,
        role: 'admin',
      },
    })
    return createdMembership.role
  }

  const roles = membership.role.split(',').map((role) => role.trim())
  if (roles.includes('owner')) return membership.role
  if (!roles.includes('admin')) {
    await db
      .update(schema.member)
      .set({ role: 'admin' })
      .where(
        and(
          eq(schema.member.organizationId, organizationId),
          eq(schema.member.userId, userId),
        ),
      )
  }

  return 'admin'
}

async function deleteOrganizationForAdmin(
  organizationId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(schema.organization)
    .where(eq(schema.organization.id, organizationId))
    .returning({ id: schema.organization.id })
  return deleted.length > 0
}

function hasAdminRole(role: string | null | undefined) {
  return (
    role
      ?.split(',')
      .map((value) => value.trim())
      .includes('admin') ?? false
  )
}

function getDatabaseErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return undefined
  }
  return typeof error.code === 'string' ? error.code : undefined
}
