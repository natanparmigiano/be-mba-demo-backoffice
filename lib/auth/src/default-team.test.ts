import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getDefaultTeamFields } from './index.js'

test('creates stable fields for the automatic Default Team', () => {
  const team = getDefaultTeamFields({}, 'organization-one')

  assert.equal(team?.name, 'Default Team')
  assert.equal(team?.color, '#0866ff')
  assert.equal(team?.isDefault, true)
  assert.match(team?.slug ?? '', /^default-team-[a-f0-9]{16}$/)
  assert.deepEqual(team, getDefaultTeamFields({}, 'organization-one'))
  assert.notEqual(
    team?.slug,
    getDefaultTeamFields({}, 'organization-two')?.slug,
  )
})

test('does not replace fields for an explicitly configured team', () => {
  assert.equal(
    getDefaultTeamFields({ slug: 'customer-success' }, 'organization-one'),
    undefined,
  )
})
