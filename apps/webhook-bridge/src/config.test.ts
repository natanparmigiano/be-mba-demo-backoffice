import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseCliConfig } from './config.js'

describe('parseCliConfig', () => {
  it('parses the required database URL and channel ID', () => {
    assert.deepEqual(
      parseCliConfig([
        '--database-url',
        'postgresql://user:secret@db.example.test/webhooks?sslmode=require',
        '--channel-id',
        '42',
        '--batch-size',
        '25',
      ]),
      {
        batchSize: 25,
        channelId: 42,
        databaseUrl:
          'postgresql://user:secret@db.example.test/webhooks?sslmode=require',
      },
    )
  })

  it('supports help without requiring other arguments', () => {
    assert.equal(parseCliConfig(['--help']), 'help')
  })

  it('rejects missing and unsafe arguments', () => {
    assert.throws(
      () => parseCliConfig(['--channel-id', '1']),
      /database-url is required/,
    )
    assert.throws(
      () =>
        parseCliConfig([
          '--database-url',
          'https://db.example.test/database',
          '--channel-id',
          '1',
        ]),
      /postgres or postgresql/,
    )
    assert.throws(
      () =>
        parseCliConfig([
          '--database-url',
          'postgres://db.example.test/database',
          '--channel-id',
          '0',
        ]),
      /positive safe integer/,
    )
  })
})
