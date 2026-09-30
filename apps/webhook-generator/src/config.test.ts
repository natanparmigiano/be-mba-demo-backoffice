import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseCliConfig } from './config.js'

describe('parseCliConfig', () => {
  it('parses pool and rate flags for dry runs', () => {
    const config = parseCliConfig(
      [
        '--dry-run',
        '--contacts',
        '25',
        '--groups',
        '4',
        '--group-size',
        '3',
        '--rps',
        '50',
        '--events',
        '100',
      ],
      {},
    )

    assert.notEqual(config, 'help')
    if (config === 'help') return
    assert.equal(config.contacts, 25)
    assert.equal(config.groups, 4)
    assert.equal(config.groupSize, 3)
    assert.equal(config.rps, 50)
    assert.equal(config.events, 100)
    assert.equal(config.maxInFlight, 100)
  })

  it('requires a signing secret for live traffic', () => {
    assert.throws(() => parseCliConfig([], {}), /app-secret/)
  })

  it('rejects groups larger than the contact pool', () => {
    assert.throws(
      () =>
        parseCliConfig(
          [
            '--dry-run',
            '--contacts',
            '2',
            '--groups',
            '1',
            '--group-size',
            '3',
          ],
          {},
        ),
      /cannot exceed/,
    )
  })
})
