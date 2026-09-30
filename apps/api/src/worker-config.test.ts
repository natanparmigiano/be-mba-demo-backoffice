import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  getSubscribedTopics,
  isInProcessWorkerEnabled,
} from './worker-config.js'

const availableTopics = ['orders.created', 'emails.requested']

describe('worker configuration', () => {
  it('disables in-process workers by default', () => {
    assert.equal(isInProcessWorkerEnabled({}), false)
    assert.equal(
      isInProcessWorkerEnabled({ ENABLE_WORKER_IN_PROCESS: 'true' }),
      true,
    )
  })

  it('rejects invalid in-process worker flags', () => {
    assert.throws(
      () => isInProcessWorkerEnabled({ ENABLE_WORKER_IN_PROCESS: 'sometimes' }),
      /must be true or false/,
    )
  })

  it('subscribes to every registered topic by default', () => {
    assert.deepEqual(getSubscribedTopics(availableTopics, {}), availableTopics)
    assert.deepEqual(
      getSubscribedTopics(availableTopics, { SUBSCRIBE_TO_TOPICS: 'all' }),
      availableTopics,
    )
  })

  it('parses and deduplicates configured topics', () => {
    assert.deepEqual(
      getSubscribedTopics(availableTopics, {
        SUBSCRIBE_TO_TOPICS:
          ' emails.requested,orders.created,emails.requested ',
      }),
      ['emails.requested', 'orders.created'],
    )
  })

  it('rejects topics without registered handlers', () => {
    assert.throws(
      () =>
        getSubscribedTopics(availableTopics, {
          SUBSCRIBE_TO_TOPICS: 'unknown.topic',
        }),
      /No subscriber handlers are registered/,
    )
  })
})
