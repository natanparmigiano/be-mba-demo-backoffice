import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  WhatsAppRegistrationApiError,
  type WhatsAppRegistrationClientContract,
} from '@mba-demo/wa-registration'
import {
  createApiPlaygroundRoute,
  type ApiPlaygroundRepository,
} from './api-playground.js'

const configuration = {
  phoneNumberId: 'phone-id',
  accessToken: 'secret-access-token',
}

describe('API playground route', () => {
  it('gets selected fields using the active organization channel', async () => {
    let requestedOrganizationId: string | undefined
    let requestedChannelId: number | undefined
    let requestedFields: string[] | undefined
    let receivedConfiguration: typeof configuration | undefined
    const route = createApiPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository: createRepository({
        getRegistrationConfiguration: async (organizationId, channelId) => {
          requestedOrganizationId = organizationId
          requestedChannelId = channelId
          return configuration
        },
      }),
      createRegistrationClient: (value) => {
        receivedConfiguration = value
        return createClient({
          getPhoneNumber: async (options) => {
            requestedFields = options?.fields
            return { id: 'phone-id', status: 'CONNECTED' }
          },
        })
      },
    })

    const response = await route.request(
      '/registration/7/phone-number?fields=status,status,quality_rating',
    )

    assert.equal(response.status, 200)
    assert.equal(requestedOrganizationId, 'org-one')
    assert.equal(requestedChannelId, 7)
    assert.deepEqual(requestedFields, ['status', 'quality_rating'])
    assert.deepEqual(receivedConfiguration, configuration)
    assert.deepEqual(await response.json(), {
      result: { id: 'phone-id', status: 'CONNECTED' },
    })
  })

  it('does not let a regular member mutate registration state', async () => {
    let repositoryCalled = false
    const route = createApiPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository: createRepository({
        getRegistrationConfiguration: async () => {
          repositoryCalled = true
          return configuration
        },
      }),
    })

    const response = await route.request('/registration/7/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pin: '123456' }),
    })

    assert.equal(response.status, 403)
    assert.equal(repositoryCalled, false)
    assert.deepEqual(await response.json(), {
      message: 'Organization owner or admin required',
    })
  })

  it('dispatches every registration mutation to the selected channel client', async () => {
    const calls: Array<{ operation: string; input?: unknown }> = []
    const route = createApiPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'admin' }),
      repository: createRepository(),
      createRegistrationClient: () =>
        createClient({
          requestVerificationCode: async (input) => {
            calls.push({ operation: 'requestCode', input })
            return { success: true }
          },
          verifyCode: async (input) => {
            calls.push({ operation: 'verifyCode', input })
            return { success: true, id: 'phone-id' }
          },
          register: async (input) => {
            calls.push({ operation: 'register', input })
            return { success: true }
          },
          setTwoStepVerificationPin: async (input) => {
            calls.push({ operation: 'twoStepPin', input })
            return { success: true }
          },
          deregister: async () => {
            calls.push({ operation: 'deregister' })
            return { success: true }
          },
        }),
    })

    const requests: Array<[string, object | undefined]> = [
      [
        '/registration/7/request-code',
        { codeMethod: 'VOICE', language: 'pt_BR' },
      ],
      ['/registration/7/verify-code', { code: '012345' }],
      [
        '/registration/7/register',
        { pin: '123456', dataLocalizationRegion: 'BR' },
      ],
      ['/registration/7/two-step-pin', { pin: '654321' }],
      ['/registration/7/deregister', undefined],
    ]

    for (const [path, body] of requests) {
      const response = await route.request(path, {
        method: 'POST',
        ...(body
          ? {
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(body),
            }
          : {}),
      })
      assert.equal(response.status, 200)
    }

    assert.deepEqual(calls, [
      {
        operation: 'requestCode',
        input: { code_method: 'VOICE', language: 'pt_BR' },
      },
      { operation: 'verifyCode', input: { code: '012345' } },
      {
        operation: 'register',
        input: { pin: '123456', data_localization_region: 'BR' },
      },
      { operation: 'twoStepPin', input: { pin: '654321' } },
      { operation: 'deregister' },
    ])
  })

  it('rejects invalid six-digit values at the API boundary', async () => {
    const route = createApiPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'owner' }),
      repository: createRepository(),
    })

    const response = await route.request('/registration/7/verify-code', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: '12345' }),
    })

    assert.equal(response.status, 400)
  })

  it('returns not found without exposing another organization channel', async () => {
    const route = createApiPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository: createRepository({
        getRegistrationConfiguration: async () => undefined,
      }),
    })

    const response = await route.request('/registration/99/phone-number')

    assert.equal(response.status, 404)
    assert.deepEqual(await response.json(), { message: 'Channel not found' })
  })

  it('maps Graph API errors without returning stored credentials', async () => {
    const route = createApiPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository: createRepository(),
      createRegistrationClient: () =>
        createClient({
          getPhoneNumber: async () => {
            throw new WhatsAppRegistrationApiError(400, {
              error: { message: 'Invalid phone number', code: 100 },
            })
          },
        }),
    })

    const response = await route.request('/registration/7/phone-number')
    const body = await response.text()

    assert.equal(response.status, 502)
    assert.match(body, /Invalid phone number/)
    assert.match(body, /"providerCode":100/)
    assert.equal(body.includes(configuration.accessToken), false)
  })
})

function createRepository(
  overrides: Partial<ApiPlaygroundRepository> = {},
): ApiPlaygroundRepository {
  return {
    getRegistrationConfiguration: async () => configuration,
    ...overrides,
  }
}

function createClient(
  overrides: Partial<WhatsAppRegistrationClientContract> = {},
): WhatsAppRegistrationClientContract {
  return {
    getPhoneNumber: async () => ({ id: configuration.phoneNumberId }),
    requestVerificationCode: async () => ({ success: true }),
    verifyCode: async () => ({ success: true }),
    register: async () => ({ success: true }),
    setTwoStepVerificationPin: async () => ({ success: true }),
    deregister: async () => ({ success: true }),
    ...overrides,
  }
}
