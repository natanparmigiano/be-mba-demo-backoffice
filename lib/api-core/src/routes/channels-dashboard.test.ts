import assert from 'node:assert/strict'
import test from 'node:test'
import { MemoryKeyValueStore } from '@mba-desk/kv'
import {
  createChannelOverviewRoute,
  type ChannelOverviewRepository,
  type ChannelProviderAnalytics,
} from './channels.js'

const provider: ChannelProviderAnalytics = {
  period: { start: '2026-10-01', end: '2026-10-08', days: 7 },
  messaging: null,
  agent: null,
  unavailable: ['messaging', 'agent'],
}

const local = {
  contacts: 12,
  groups: 2,
  conversations: 8,
  humanQueue: 3,
  unreadMessages: 5,
  handoffs: 4,
  messages: 20,
  inboundMessages: 11,
  outboundMessages: 9,
  aiMessages: 6,
  deliveredMessages: 8,
  failedMessages: 1,
  deliveryRate: 8 / 9,
  agentMessages: 4,
  humanMessages: 5,
  agentMessageRate: 4 / 9,
  humanMessageRate: 5 / 9,
  averageHandoffResponseMs: 30_000,
  series: [{ date: '2026-10-08', inbound: 11, outbound: 9 }],
  messageTypes: [{ type: 'text', count: 20 }],
  teamActivity: [{ id: 'team-1', name: 'Support', conversations: 3 }],
  userActivity: [{ id: 'user-1', name: 'Ada', conversations: 2 }],
}

test('dashboard combines local data and caches it in KV for five minutes', async () => {
  const cache = new MemoryKeyValueStore()
  let providerCalls = 0
  let localCalls = 0
  const repository = {
    getAgentConfiguration: async () => ({
      waPhoneNumberId: 'phone-1',
      waSystemUserAccessToken: 'token',
      waWabaId: 'waba-1',
    }),
  } as unknown as ChannelOverviewRepository
  const route = createChannelOverviewRoute({
    dashboardCache: cache,
    getAccess: async () => ({ organizationId: 'org-1', role: 'member' }),
    repository,
    getDashboardAnalytics: async () => {
      providerCalls += 1
      return provider
    },
    getLocalDashboardAnalytics: async () => {
      localCalls += 1
      return local
    },
  })

  const first = await route.request('/1/dashboard?days=7')
  const second = await route.request('/1/dashboard?days=7')
  const refreshed = await route.request('/1/dashboard?days=7&refresh=true')
  assert.equal(first.status, 200)
  assert.equal(second.status, 200)
  assert.equal(refreshed.status, 200)
  const body = (await second.json()) as {
    local: typeof local
    cacheTtlSeconds: number
  }
  assert.deepEqual(body.local, local)
  assert.equal(body.cacheTtlSeconds, 300)
  assert.equal(providerCalls, 2)
  assert.equal(localCalls, 2)
  assert.ok((await cache.ttl('dashboard:v3:org-1:1:7')) > 0)
})
