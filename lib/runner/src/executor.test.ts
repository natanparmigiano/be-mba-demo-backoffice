import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { IsolatedVmExecutor, parseHttpsUrl } from './executor.js'

describe('runner fetch policy', () => {
  it('accepts HTTPS and rejects every other protocol', () => {
    assert.equal(parseHttpsUrl('https://example.com/path').protocol, 'https:')
    assert.throws(
      () => parseHttpsUrl('http://example.com/path'),
      /only permits HTTPS/,
    )
    assert.throws(
      () => parseHttpsUrl('file:///etc/passwd'),
      /only permits HTTPS/,
    )
  })

  it('rejects credentials embedded in HTTPS URLs', () => {
    assert.throws(
      () => parseHttpsUrl('https://user:secret@example.com'),
      /cannot contain credentials/,
    )
  })
})

describe('IsolatedVmExecutor', () => {
  it('executes a function with a JSON parameter object', async () => {
    const result = await new IsolatedVmExecutor().execute(
      `({ left, right }) => ({ total: left + right })`,
      { left: 2, right: 3 },
    )

    assert.deepEqual(result, {
      status: 'succeeded',
      result: { total: 5 },
    })
  })

  it('does not expose Node.js process globals', async () => {
    const result = await new IsolatedVmExecutor().execute(
      `() => process.env`,
      {},
    )

    assert.equal(result.status, 'failed')
    if (result.status === 'failed') {
      assert.match(result.errorMessage, /process is not defined/)
    }
  })

  it('exposes only the constrained HTTPS fetch bridge', async () => {
    let requestedUrl: string | undefined
    const executor = new IsolatedVmExecutor({
      fetch: async (input) => {
        requestedUrl =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url
        return new Response('{"answer":42}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      },
    })
    const result = await executor.execute(
      `async () => {
        const response = await fetch('https://93.184.216.34/value')
        return { body: await response.json(), processType: typeof process }
      }`,
      {},
    )

    assert.deepEqual(result, {
      status: 'succeeded',
      result: { body: { answer: 42 }, processType: 'undefined' },
    })
    assert.equal(requestedUrl, 'https://93.184.216.34/value')
  })

  it('terminates runaway synchronous code', async () => {
    const result = await new IsolatedVmExecutor().execute(
      `() => { while (true) {} }`,
      {},
      { timeoutMs: 100 },
    )

    assert.equal(result.status, 'timed_out')
  })
})
