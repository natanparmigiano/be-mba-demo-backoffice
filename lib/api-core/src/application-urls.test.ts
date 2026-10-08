import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getApplicationUrls } from './application-urls.js'

describe('application URLs', () => {
  it('normalizes configured application origins', () => {
    assert.deepEqual(
      getApplicationUrls({
        MANAGER_URL: 'https://manager.example.com/',
        WORKSPACE_URL: 'https://workspace.example.com',
      }),
      {
        manager: 'https://manager.example.com',
        workspace: 'https://workspace.example.com',
      },
    )
  })

  it('requires both URLs in production', () => {
    assert.throws(
      () =>
        getApplicationUrls({
          NODE_ENV: 'production',
          WORKSPACE_URL: 'https://workspace.example.com',
        }),
      /MANAGER_URL is required in production/,
    )
  })

  it('rejects paths and non-HTTP protocols', () => {
    assert.throws(
      () =>
        getApplicationUrls({ MANAGER_URL: 'https://manager.example.com/app' }),
      /without a path/,
    )
    assert.throws(
      () => getApplicationUrls({ MANAGER_URL: 'file:///tmp/manager' }),
      /HTTP\(S\) origin/,
    )
  })
})
