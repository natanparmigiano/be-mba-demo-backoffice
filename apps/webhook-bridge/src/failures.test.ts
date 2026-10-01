import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { appendFailureJsonl } from './failures.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  )
})

describe('failure JSONL output', () => {
  it('appends one complete record per rejected delivery', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'webhook-bridge-'))
    temporaryDirectories.push(directory)
    const filePath = join(directory, 'fails.jsonl')
    const now = () => new Date('2026-09-30T22:00:00.000Z')

    await appendFailureJsonl(
      { id: '30', payloadValid: true, rawPayload: '{"field":"unknown"}' },
      'unsupported field',
      { channelId: 42, filePath, now },
    )
    await appendFailureJsonl(
      { id: '31', payloadValid: false, rawPayload: 'not-json\nsecond-line' },
      'source row is marked invalid',
      { channelId: 42, filePath, now },
    )

    const lines = (await readFile(filePath, 'utf8')).trimEnd().split('\n')
    assert.equal(lines.length, 2)
    assert.deepEqual(JSON.parse(lines[0] ?? ''), {
      capturedAt: '2026-09-30T22:00:00.000Z',
      channelId: 42,
      deliveryId: '30',
      payloadValid: true,
      reason: 'unsupported field',
      rawPayload: '{"field":"unknown"}',
    })
    assert.deepEqual(JSON.parse(lines[1] ?? ''), {
      capturedAt: '2026-09-30T22:00:00.000Z',
      channelId: 42,
      deliveryId: '31',
      payloadValid: false,
      reason: 'source row is marked invalid',
      rawPayload: 'not-json\nsecond-line',
    })
    assert.equal((await stat(filePath)).mode & 0o777, 0o600)
  })
})
