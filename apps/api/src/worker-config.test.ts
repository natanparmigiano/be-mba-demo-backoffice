import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_WA_WEBHOOK_MAX_RETRIES,
  getSubscribedTopics,
  getWhatsAppWebhookMaxRetries,
  isWebhookArchiveEnabled,
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

  it('defaults webhook failures to five retries', () => {
    assert.equal(
      getWhatsAppWebhookMaxRetries({}),
      DEFAULT_WA_WEBHOOK_MAX_RETRIES,
    )
    assert.equal(
      getWhatsAppWebhookMaxRetries({ WA_WEBHOOK_MAX_RETRIES: '0' }),
      0,
    )
    assert.equal(
      getWhatsAppWebhookMaxRetries({ WA_WEBHOOK_MAX_RETRIES: '12' }),
      12,
    )
  })

  it('rejects invalid webhook retry limits', () => {
    for (const value of ['-1', '1.5', '101', 'many']) {
      assert.throws(
        () => getWhatsAppWebhookMaxRetries({ WA_WEBHOOK_MAX_RETRIES: value }),
        /integer from 0 to 100/,
      )
    }
  })

  it('enables webhook archival by default and accepts an explicit override', () => {
    assert.equal(isWebhookArchiveEnabled({}), true)
    assert.equal(
      isWebhookArchiveEnabled({ WEBHOOK_ARCHIVE_ENABLED: 'true' }),
      true,
    )
    assert.equal(
      isWebhookArchiveEnabled({ WEBHOOK_ARCHIVE_ENABLED: 'false' }),
      false,
    )
    assert.throws(
      () => isWebhookArchiveEnabled({ WEBHOOK_ARCHIVE_ENABLED: 'sometimes' }),
      /must be true or false/,
    )
  })
})
