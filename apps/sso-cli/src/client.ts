export interface SsoClientEnvironment {
  SSO_ADMIN_EMAIL?: string
  SSO_ADMIN_PASSWORD?: string
  SSO_SESSION_COOKIE?: string
}

export class SsoAdminClient {
  private sessionCookie: string | undefined

  constructor(
    private readonly baseUrl: string,
    private readonly environment: SsoClientEnvironment = process.env,
    private readonly request: typeof fetch = fetch,
  ) {
    this.sessionCookie = environment.SSO_SESSION_COOKIE?.trim() || undefined
  }

  async status(): Promise<unknown> {
    return this.send('/api/auth/sso-availability', { method: 'GET' }, false)
  }

  async list(): Promise<unknown> {
    return this.send('/api/auth/sso/providers', { method: 'GET' })
  }

  async organizations(): Promise<unknown> {
    return this.send('/api/auth/list-organizations', { method: 'GET' })
  }

  async register(provider: Record<string, unknown>): Promise<unknown> {
    return this.send('/api/auth/sso/register', jsonRequest(provider))
  }

  async requestVerification(providerId: string): Promise<unknown> {
    return this.send(
      '/api/auth/sso/request-domain-verification',
      jsonRequest({ providerId }),
    )
  }

  async verify(providerId: string): Promise<unknown> {
    await this.send('/api/auth/sso/verify-domain', jsonRequest({ providerId }))
    return { providerId, verified: true }
  }

  async delete(providerId: string): Promise<unknown> {
    return this.send(
      '/api/auth/sso/delete-provider',
      jsonRequest({ providerId }),
    )
  }

  private async authenticate(): Promise<string> {
    if (this.sessionCookie) return this.sessionCookie

    const email = this.environment.SSO_ADMIN_EMAIL?.trim()
    const password = this.environment.SSO_ADMIN_PASSWORD
    if (!email || !password) {
      throw new Error(
        'Set SSO_ADMIN_EMAIL and SSO_ADMIN_PASSWORD, or SSO_SESSION_COOKIE',
      )
    }

    const response = await this.request(
      `${this.baseUrl}/api/auth/sign-in/email`,
      {
        ...jsonRequest({ email, password, rememberMe: false }),
        headers: {
          ...jsonRequest({}).headers,
          origin: this.baseUrl,
        },
      },
    )
    await assertSuccessful(response)

    const headers = response.headers as Headers & {
      getSetCookie?: () => string[]
    }
    const setCookies =
      headers.getSetCookie?.() ??
      (headers.get('set-cookie') ? [headers.get('set-cookie')!] : [])
    this.sessionCookie = setCookies
      .map((cookie) => cookie.split(';', 1)[0])
      .filter(Boolean)
      .join('; ')

    if (!this.sessionCookie) {
      throw new Error('Sign-in succeeded without returning a session cookie')
    }
    return this.sessionCookie
  }

  private async send(
    path: string,
    init: RequestInit,
    authenticated = true,
  ): Promise<unknown> {
    const headers = new Headers(init.headers)
    if (authenticated) headers.set('cookie', await this.authenticate())
    headers.set('origin', this.baseUrl)

    const response = await this.request(`${this.baseUrl}${path}`, {
      ...init,
      headers,
    })
    await assertSuccessful(response)

    if (response.status === 204) return null
    const contentType = response.headers.get('content-type') ?? ''
    return contentType.includes('application/json')
      ? response.json()
      : response.text()
  }
}

function jsonRequest(value: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(value),
  }
}

async function assertSuccessful(response: Response): Promise<void> {
  if (response.ok) return
  const body = await response.text()
  let message = body
  try {
    const parsed: unknown = JSON.parse(body)
    if (
      parsed &&
      typeof parsed === 'object' &&
      'message' in parsed &&
      typeof parsed.message === 'string'
    ) {
      message = parsed.message
    }
  } catch {
    // Keep the response text when the server did not return JSON.
  }
  throw new Error(
    `Request failed with HTTP ${response.status}${message ? `: ${message}` : ''}`,
  )
}
