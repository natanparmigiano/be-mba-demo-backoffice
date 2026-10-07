import { createHash, randomUUID } from 'node:crypto'
import { auth } from '@mba-desk/auth'
import { db, member, organization, team, teamMember, user } from '@mba-desk/db'
import { zValidator } from '@hono/zod-validator'
import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm'
import { Hono, type Context } from 'hono'
import { z } from 'zod'

const teamNameSchema = z.string().trim().min(1).max(100)
const teamSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const teamColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .transform((value) => value.toLowerCase())
const teamUserIdsSchema = z
  .array(z.string().trim().min(1).max(128))
  .max(1_000)
  .transform((values) => [...new Set(values)])

const createTeamSchema = z.object({
  name: teamNameSchema,
  slug: teamSlugSchema,
  color: teamColorSchema,
  userIds: teamUserIdsSchema,
})

const updateTeamSchema = createTeamSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one team field is required',
  })

interface OrganizationAccess {
  organizationId: string
  role: string
}

export interface TeamMemberSummary {
  id: string
  name: string
  email: string
}

export interface TeamSummary {
  id: string
  name: string
  slug: string
  color: string
  isDefault: boolean
  members: TeamMemberSummary[]
  createdAt: string
  updatedAt: string
}

export interface OrganizationMemberSummary extends TeamMemberSummary {
  role: string
}

export interface TeamDirectory {
  teams: TeamSummary[]
  organizationMembers: OrganizationMemberSummary[]
}

type CreateTeamInput = z.infer<typeof createTeamSchema>
type UpdateTeamInput = z.infer<typeof updateTeamSchema>

type TeamWriteResult =
  | { status: 'ok'; team: TeamSummary }
  | { status: 'invalid_members' }
  | { status: 'slug_conflict' }
  | { status: 'not_found' }

export interface TeamsRepository {
  list: (organizationId: string) => Promise<TeamDirectory>
  get: (
    organizationId: string,
    teamId: string,
  ) => Promise<TeamSummary | undefined>
  create: (
    organizationId: string,
    input: CreateTeamInput,
  ) => Promise<TeamWriteResult>
  update: (
    organizationId: string,
    teamId: string,
    input: UpdateTeamInput,
  ) => Promise<TeamWriteResult>
  makeDefault: (
    organizationId: string,
    teamId: string,
  ) => Promise<TeamSummary | undefined>
  delete: (organizationId: string, teamId: string) => Promise<boolean>
}

export interface TeamsRouteOptions {
  getAccess?: (headers: Headers) => Promise<OrganizationAccess | undefined>
  repository?: TeamsRepository
}

const databaseRepository: TeamsRepository = {
  list: listTeams,
  get: getTeam,
  create: createTeam,
  update: updateTeam,
  makeDefault: makeTeamDefault,
  delete: deleteTeam,
}

export const createTeamsRoute = ({
  getAccess = getOrganizationAccess,
  repository = databaseRepository,
}: TeamsRouteOptions = {}) =>
  new Hono()
    .get('/', async (c) => {
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      return c.json(await repository.list(access.organizationId))
    })
    .post(
      '/',
      zValidator('json', createTeamSchema, (result, c) => {
        if (!result.success) return c.json({ message: 'Invalid team' }, 400)
      }),
      async (c) => {
        const access = await getAccess(c.req.raw.headers)
        if (!access) return c.json({ message: 'Unauthorized' }, 401)
        if (!canManageTeams(access.role)) return managerRequired(c)

        try {
          const result = await repository.create(
            access.organizationId,
            c.req.valid('json'),
          )
          if (result.status !== 'ok') return teamWriteError(c, result.status)
          return c.json({ team: result.team }, 201)
        } catch (error) {
          if (getDatabaseErrorCode(error) === '23505') {
            return c.json({ message: 'A team already uses this slug' }, 409)
          }
          throw error
        }
      },
    )
    .get('/:id', async (c) => {
      const teamId = parseTeamId(c.req.param('id'))
      if (!teamId) return c.json({ message: 'Invalid team ID' }, 400)
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      const result = await repository.get(access.organizationId, teamId)
      if (!result) return c.json({ message: 'Team not found' }, 404)
      return c.json({ team: result })
    })
    .patch(
      '/:id',
      zValidator('json', updateTeamSchema, (result, c) => {
        if (!result.success) return c.json({ message: 'Invalid team' }, 400)
      }),
      async (c) => {
        const teamId = parseTeamId(c.req.param('id'))
        if (!teamId) return c.json({ message: 'Invalid team ID' }, 400)
        const access = await getAccess(c.req.raw.headers)
        if (!access) return c.json({ message: 'Unauthorized' }, 401)
        if (!canManageTeams(access.role)) return managerRequired(c)

        try {
          const result = await repository.update(
            access.organizationId,
            teamId,
            c.req.valid('json'),
          )
          if (result.status !== 'ok') return teamWriteError(c, result.status)
          return c.json({ team: result.team })
        } catch (error) {
          if (getDatabaseErrorCode(error) === '23505') {
            return c.json({ message: 'A team already uses this slug' }, 409)
          }
          throw error
        }
      },
    )
    .post('/:id/default', async (c) => {
      const teamId = parseTeamId(c.req.param('id'))
      if (!teamId) return c.json({ message: 'Invalid team ID' }, 400)
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      if (!canManageTeams(access.role)) return managerRequired(c)
      const result = await repository.makeDefault(access.organizationId, teamId)
      if (!result) return c.json({ message: 'Team not found' }, 404)
      return c.json({ team: result })
    })
    .delete('/:id', async (c) => {
      const teamId = parseTeamId(c.req.param('id'))
      if (!teamId) return c.json({ message: 'Invalid team ID' }, 400)
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      if (!canManageTeams(access.role)) return managerRequired(c)
      if (!(await repository.delete(access.organizationId, teamId))) {
        return c.json({ message: 'Team not found' }, 404)
      }
      return c.json({ deleted: true as const })
    })

async function listTeams(organizationId: string): Promise<TeamDirectory> {
  const [teamRows, membershipRows, organizationMemberRows] = await Promise.all([
    db
      .select({
        id: team.id,
        name: team.name,
        slug: team.slug,
        color: team.color,
        isDefault: team.default,
        createdAt: team.createdAt,
        updatedAt: team.updatedAt,
      })
      .from(team)
      .where(eq(team.organizationId, organizationId))
      .orderBy(desc(team.default), asc(team.name), asc(team.id)),
    db
      .select({
        teamId: teamMember.teamId,
        id: user.id,
        name: user.name,
        email: user.email,
      })
      .from(teamMember)
      .innerJoin(team, eq(teamMember.teamId, team.id))
      .innerJoin(user, eq(teamMember.userId, user.id))
      .where(eq(team.organizationId, organizationId))
      .orderBy(asc(user.name), asc(user.email)),
    db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        role: member.role,
      })
      .from(member)
      .innerJoin(user, eq(member.userId, user.id))
      .where(eq(member.organizationId, organizationId))
      .orderBy(asc(user.name), asc(user.email)),
  ])

  const membersByTeam = new Map<string, TeamMemberSummary[]>()
  for (const row of membershipRows) {
    const members = membersByTeam.get(row.teamId) ?? []
    members.push({ id: row.id, name: row.name, email: row.email })
    membersByTeam.set(row.teamId, members)
  }

  return {
    teams: teamRows.map((row) => toTeamSummary(row, membersByTeam.get(row.id))),
    organizationMembers: organizationMemberRows,
  }
}

async function getTeam(
  organizationId: string,
  teamId: string,
): Promise<TeamSummary | undefined> {
  const [row] = await db
    .select({
      id: team.id,
      name: team.name,
      slug: team.slug,
      color: team.color,
      isDefault: team.default,
      createdAt: team.createdAt,
      updatedAt: team.updatedAt,
    })
    .from(team)
    .where(and(eq(team.id, teamId), eq(team.organizationId, organizationId)))
    .limit(1)
  if (!row) return undefined

  const members = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(teamMember)
    .innerJoin(user, eq(teamMember.userId, user.id))
    .where(eq(teamMember.teamId, teamId))
    .orderBy(asc(user.name), asc(user.email))

  return toTeamSummary(row, members)
}

async function createTeam(
  organizationId: string,
  input: CreateTeamInput,
): Promise<TeamWriteResult> {
  const teamId = randomUUID()
  const result = await db.transaction(async (transaction) => {
    const [existingSlug] = await transaction
      .select({ id: team.id })
      .from(team)
      .where(eq(team.slug, input.slug))
      .limit(1)
    if (existingSlug) return 'slug_conflict' as const

    if (
      !(await usersBelongToOrganization(
        transaction,
        organizationId,
        input.userIds,
      ))
    ) {
      return 'invalid_members' as const
    }

    const now = new Date()
    await transaction.insert(team).values({
      id: teamId,
      organizationId,
      name: input.name,
      slug: input.slug,
      color: input.color,
      memberCount: input.userIds.length,
      createdAt: now,
      updatedAt: now,
    })
    if (input.userIds.length > 0) {
      await transaction.insert(teamMember).values(
        input.userIds.map((userId) => ({
          id: randomUUID(),
          teamId,
          userId,
          membershipKey: getMembershipKey(teamId, userId),
          createdAt: now,
        })),
      )
    }
    return 'created' as const
  })

  if (result !== 'created') return { status: result }
  const created = await getTeam(organizationId, teamId)
  if (!created) throw new Error('Failed to read the created team')
  return { status: 'ok', team: created }
}

async function updateTeam(
  organizationId: string,
  teamId: string,
  input: UpdateTeamInput,
): Promise<TeamWriteResult> {
  const result = await db.transaction(async (transaction) => {
    const [existing] = await transaction
      .select({ id: team.id })
      .from(team)
      .where(and(eq(team.id, teamId), eq(team.organizationId, organizationId)))
      .limit(1)
      .for('update')
    if (!existing) return 'not_found' as const

    if (input.slug !== undefined) {
      const [existingSlug] = await transaction
        .select({ id: team.id })
        .from(team)
        .where(and(eq(team.slug, input.slug), ne(team.id, teamId)))
        .limit(1)
      if (existingSlug) return 'slug_conflict' as const
    }

    if (
      input.userIds !== undefined &&
      !(await usersBelongToOrganization(
        transaction,
        organizationId,
        input.userIds,
      ))
    ) {
      return 'invalid_members' as const
    }

    await transaction
      .update(team)
      .set({
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.slug === undefined ? {} : { slug: input.slug }),
        ...(input.color === undefined ? {} : { color: input.color }),
        ...(input.userIds === undefined
          ? {}
          : { memberCount: input.userIds.length }),
        updatedAt: new Date(),
      })
      .where(eq(team.id, teamId))

    if (input.userIds !== undefined) {
      const existingMemberships = await transaction
        .select({ userId: teamMember.userId })
        .from(teamMember)
        .where(eq(teamMember.teamId, teamId))
      const nextUserIds = new Set(input.userIds)
      const existingUserIds = new Set(
        existingMemberships.map((membership) => membership.userId),
      )
      const removedUserIds = [...existingUserIds].filter(
        (userId) => !nextUserIds.has(userId),
      )
      const addedUserIds = input.userIds.filter(
        (userId) => !existingUserIds.has(userId),
      )

      if (removedUserIds.length > 0) {
        await transaction
          .delete(teamMember)
          .where(
            and(
              eq(teamMember.teamId, teamId),
              inArray(teamMember.userId, removedUserIds),
            ),
          )
      }
      if (addedUserIds.length > 0) {
        const now = new Date()
        await transaction.insert(teamMember).values(
          addedUserIds.map((userId) => ({
            id: randomUUID(),
            teamId,
            userId,
            membershipKey: getMembershipKey(teamId, userId),
            createdAt: now,
          })),
        )
      }
    }

    return 'updated' as const
  })

  if (result !== 'updated') return { status: result }
  const updated = await getTeam(organizationId, teamId)
  if (!updated) throw new Error('Failed to read the updated team')
  return { status: 'ok', team: updated }
}

async function deleteTeam(
  organizationId: string,
  teamId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(team)
    .where(and(eq(team.id, teamId), eq(team.organizationId, organizationId)))
    .returning({ id: team.id })
  return deleted.length > 0
}

async function makeTeamDefault(
  organizationId: string,
  teamId: string,
): Promise<TeamSummary | undefined> {
  const updated = await db.transaction(async (transaction) => {
    const [lockedOrganization] = await transaction
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.id, organizationId))
      .limit(1)
      .for('update')
    if (!lockedOrganization) return false

    const [targetTeam] = await transaction
      .select({ id: team.id })
      .from(team)
      .where(and(eq(team.id, teamId), eq(team.organizationId, organizationId)))
      .limit(1)
    if (!targetTeam) return false

    const now = new Date()
    await transaction
      .update(team)
      .set({ default: false, updatedAt: now })
      .where(
        and(eq(team.organizationId, organizationId), eq(team.default, true)),
      )
    await transaction
      .update(team)
      .set({ default: true, updatedAt: now })
      .where(and(eq(team.id, teamId), eq(team.organizationId, organizationId)))
    return true
  })

  return updated ? getTeam(organizationId, teamId) : undefined
}

async function usersBelongToOrganization(
  transaction: Parameters<Parameters<typeof db.transaction>[0]>[0],
  organizationId: string,
  userIds: string[],
): Promise<boolean> {
  if (userIds.length === 0) return true
  const memberships = await transaction
    .select({ userId: member.userId })
    .from(member)
    .where(
      and(
        eq(member.organizationId, organizationId),
        inArray(member.userId, userIds),
      ),
    )
    .for('share')
  return (
    new Set(memberships.map((membership) => membership.userId)).size ===
    userIds.length
  )
}

function toTeamSummary(
  row: {
    id: string
    name: string
    slug: string
    color: string
    isDefault: boolean
    createdAt: Date
    updatedAt: Date | null
  },
  members: TeamMemberSummary[] = [],
): TeamSummary {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    color: row.color,
    isDefault: row.isDefault,
    members,
    createdAt: row.createdAt.toISOString(),
    updatedAt: (row.updatedAt ?? row.createdAt).toISOString(),
  }
}

async function getOrganizationAccess(
  headers: Headers,
): Promise<OrganizationAccess | undefined> {
  const session = await auth.api.getSession({ headers })
  const organizationId = session?.session.activeOrganizationId
  if (!session || !organizationId) return undefined

  const [membership] = await db
    .select({ role: member.role })
    .from(member)
    .where(
      and(
        eq(member.organizationId, organizationId),
        eq(member.userId, session.user.id),
      ),
    )
    .limit(1)
  return membership ? { organizationId, role: membership.role } : undefined
}

function getMembershipKey(teamId: string, userId: string): string {
  return createHash('sha256')
    .update(JSON.stringify([teamId, userId]))
    .digest('base64url')
}

function canManageTeams(role: string): boolean {
  return role
    .split(',')
    .map((value) => value.trim())
    .some((value) => value === 'owner' || value === 'admin')
}

function parseTeamId(value: string): string | undefined {
  const parsed = value.trim()
  return parsed.length > 0 && parsed.length <= 128 ? parsed : undefined
}

function getDatabaseErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined
  }
  return typeof error.code === 'string' ? error.code : undefined
}

function managerRequired(c: Context) {
  return c.json({ message: 'Organization owner or admin required' }, 403)
}

function teamWriteError(
  c: Context,
  status: Exclude<TeamWriteResult['status'], 'ok'>,
) {
  if (status === 'not_found') return c.json({ message: 'Team not found' }, 404)
  if (status === 'slug_conflict') {
    return c.json({ message: 'A team already uses this slug' }, 409)
  }
  return c.json(
    { message: 'Every selected user must belong to the active organization' },
    400,
  )
}
