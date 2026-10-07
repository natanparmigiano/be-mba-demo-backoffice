import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createOrganizationInvitationsRoute } from './organization-invitations.js'

const invitation = {
  id: 'invitation-1',
  organizationId: 'organization-1',
  organizationName: 'Acme',
  role: 'member',
  status: 'pending',
  expiresAt: '2099-12-01T00:00:00.000Z',
}
const { status: _status, ...invitationSummary } = invitation

describe('organization invitation routes', () => {
  it('requires an authenticated session', async () => {
    const route = createOrganizationInvitationsRoute({
      getSession: async () => null,
      isEmailVerified: async () => true,
      listInvitations: async () => [invitation],
    })

    assert.equal((await route.request('/')).status, 401)
  })

  it('checks the current database verification state', async () => {
    const route = createOrganizationInvitationsRoute({
      getSession: async () => ({
        user: { id: 'user-1', email: 'user@example.com' },
      }),
      isEmailVerified: async () => false,
      listInvitations: async () => [invitation],
    })

    assert.equal((await route.request('/')).status, 403)
  })

  it('lists invitations for the authenticated verified email', async () => {
    const emails: string[] = []
    const route = createOrganizationInvitationsRoute({
      getSession: async () => ({
        user: { id: 'user-1', email: 'user@example.com' },
      }),
      isEmailVerified: async () => true,
      listInvitations: async (email) => {
        emails.push(email)
        return [invitation]
      },
    })

    const response = await route.request('/')
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), [invitationSummary])
    assert.deepEqual(emails, ['user@example.com'])
  })

  it('keeps only the newest invitation for each organization', async () => {
    const replacement = {
      ...invitation,
      id: 'invitation-2',
      role: 'admin',
      expiresAt: '2099-12-02T00:00:00.000Z',
    }
    const route = createOrganizationInvitationsRoute({
      getSession: async () => ({
        user: { id: 'user-1', email: 'user@example.com' },
      }),
      isEmailVerified: async () => true,
      listInvitations: async () => [invitation, replacement],
    })

    const response = await route.request('/')
    assert.equal(response.status, 200)
    const { status: _status, ...replacementSummary } = replacement
    assert.deepEqual(await response.json(), [replacementSummary])
  })

  it('hides rejected and expired invitations', async () => {
    const route = createOrganizationInvitationsRoute({
      getSession: async () => ({
        user: { id: 'user-1', email: 'user@example.com' },
      }),
      isEmailVerified: async () => true,
      listInvitations: async () => [
        invitation,
        {
          ...invitation,
          id: 'rejected-invitation',
          organizationId: 'organization-2',
          status: 'rejected',
        },
        {
          ...invitation,
          id: 'expired-invitation',
          organizationId: 'organization-3',
          expiresAt: '2020-01-01T00:00:00.000Z',
        },
      ],
    })

    const response = await route.request('/')
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), [invitationSummary])
  })
})
