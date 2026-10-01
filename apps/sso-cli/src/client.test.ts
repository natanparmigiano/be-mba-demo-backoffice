import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SsoAdminClient } from './client.js'

test('checks public SSO status without authenticating', async () => {
  const requests: string[] = []
  const request = (async (input: string | URL | Request) => {
    requests.push(requestUrl(input))
    return Response.json({ enabled: false })
  }) as typeof fetch

  const client = new SsoAdminClient('https://app.example.com', {}, request)

  assert.deepEqual(await client.status(), { enabled: false })
  assert.deepEqual(requests, [
    'https://app.example.com/api/auth/sso-availability',
  ])
})

test('signs in once and forwards the returned session cookie', async () => {
  const requests: Array<{ init?: RequestInit; url: string }> = []
  const request = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = requestUrl(input)
    requests.push({ init, url })
    if (url.endsWith('/api/auth/sign-in/email')) {
      return new Response('{}', {
        headers: {
          'content-type': 'application/json',
          'set-cookie': 'better-auth.session_token=session-value; Path=/',
        },
      })
    }
    return Response.json({ providers: [] })
  }) as typeof fetch

  const client = new SsoAdminClient(
    'https://app.example.com',
    {
      SSO_ADMIN_EMAIL: 'admin@example.com',
      SSO_ADMIN_PASSWORD: 'secret',
    },
    request,
  )

  assert.deepEqual(await client.list(), { providers: [] })
  assert.equal(requests.length, 2)
  assert.equal(
    new Headers(requests[1]?.init?.headers).get('cookie'),
    'better-auth.session_token=session-value',
  )
})

test('uses an existing session cookie without signing in', async () => {
  const requests: Array<{ init?: RequestInit; url: string }> = []
  const request = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    requests.push({ init, url: requestUrl(input) })
    return Response.json([])
  }) as typeof fetch

  const client = new SsoAdminClient(
    'https://app.example.com',
    { SSO_SESSION_COOKIE: 'better-auth.session_token=existing' },
    request,
  )

  await client.organizations()
  assert.equal(requests.length, 1)
  assert.equal(
    new Headers(requests[0]?.init?.headers).get('cookie'),
    'better-auth.session_token=existing',
  )
})

function requestUrl(input: string | URL | Request): string {
  if (typeof input === 'string') return input
  return input instanceof URL ? input.href : input.url
}
