import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { WhatsAppAnalyticsClientContract } from '@mba-desk/wa-analytics'
import {
  createAnalyticsPlaygroundRoute,
  type AnalyticsPlaygroundRepository,
} from './analytics-playground.js'

const configuration = { wabaId: 'waba-id', accessToken: 'secret-token' }
const repository: AnalyticsPlaygroundRepository = {
  getConfiguration: async () => configuration,
}

describe('analytics playground route', () => {
  it('queries analytics for a member using the selected channel WABA', async () => {
    let options:
      | Parameters<WhatsAppAnalyticsClientContract['getMessagingAnalytics']>[0]
      | undefined
    const route = createAnalyticsPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository,
      createAnalyticsClient: (received) => {
        assert.deepEqual(received, configuration)
        return {
          getMessagingAnalytics: async (
            value: Parameters<
              WhatsAppAnalyticsClientContract['getMessagingAnalytics']
            >[0],
          ) => {
            options = value
            return {
              analytics: {
                phone_numbers: [],
                country_codes: [],
                granularity: 'DAY',
                data_points: [],
              },
            }
          },
        } as unknown as WhatsAppAnalyticsClientContract
      },
    })

    const response = await route.request('/7', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'messaging',
        input: { start: 10, end: 20, granularity: 'DAY' },
      }),
    })

    assert.equal(response.status, 200)
    assert.deepEqual(
      { ...options, signal: options?.signal instanceof AbortSignal },
      { start: 10, end: 20, granularity: 'DAY', signal: true },
    )
  })

  it('blocks members from irreversible analytics enablement', async () => {
    let repositoryCalled = false
    const route = createAnalyticsPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository: {
        getConfiguration: async () => {
          repositoryCalled = true
          return configuration
        },
      },
    })
    const response = await route.request('/7', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'enableTemplate', input: {} }),
    })
    assert.equal(response.status, 403)
    assert.equal(repositoryCalled, false)
  })

  it('rejects an unknown analytics operation at the boundary', async () => {
    const route = createAnalyticsPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'owner' }),
      repository,
    })
    const response = await route.request('/7', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'unknown', input: {} }),
    })
    assert.equal(response.status, 400)
  })
})
