import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { WhatsAppWebhook } from '@mba-desk/wa-webhooks'
import {
  archiveWhatsAppWebhookMedia,
  createWhatsAppMediaFilePath,
  extensionForMimeType,
} from './whatsapp-media.js'

describe('WhatsApp webhook media archiving', () => {
  it('downloads media and stores it under a sharded UUID path', async () => {
    const data = new TextEncoder().encode('image bytes')
    const sha256 = 'provider-digest'
    const puts: Array<{
      body: Uint8Array
      contentType: string | undefined
      path: string
    }> = []
    const webhook = imageWebhook(sha256)
    const options = {
      findChannel: async () => ({
        waPhoneNumberId: 'phone-id',
        waSystemUserAccessToken: 'access-token',
      }),
      createMediaClient: () => ({
        getMediaUrl: async () => ({
          messaging_product: 'whatsapp' as const,
          id: 'media-id',
          url: 'https://lookaside.example.com/media',
          mime_type: 'image/jpeg',
          sha256,
          file_size: data.byteLength,
        }),
        download: async () => ({
          data,
          contentType: 'image/jpeg',
          contentLength: data.byteLength,
          contentDisposition: null,
        }),
      }),
      fileStore: {
        put: async (
          path: string,
          body: Uint8Array,
          putOptions: { contentType?: string } = {},
        ) => {
          puts.push({
            path,
            body,
            contentType: putOptions.contentType,
          })
        },
      },
    }

    const first = await archiveWhatsAppWebhookMedia(42, webhook, options)
    const second = await archiveWhatsAppWebhookMedia(42, webhook, options)
    const path = first.get('wamid.media')

    assert.match(
      path ?? '',
      /^whatsapp\/media\/[a-f\d]{8}\/[a-f\d]{4}\/[a-f\d]{4}\/[a-f\d]{4}\/[a-f\d]{12}\/[a-f\d-]{36}\.jpg$/,
    )
    assert.equal(second.get('wamid.media'), path)
    assert.deepEqual(puts[0], {
      path,
      body: data,
      contentType: 'image/jpeg',
    })
  })

  it('finds media inside the observed nested standby envelope', async () => {
    const requestedMediaIds: string[] = []
    const result = await archiveWhatsAppWebhookMedia(
      42,
      standbyImageWebhook(),
      {
        findChannel: async () => ({
          waPhoneNumberId: 'phone-id',
          waSystemUserAccessToken: 'access-token',
        }),
        createMediaClient: () => ({
          getMediaUrl: async (mediaId) => {
            requestedMediaIds.push(mediaId)
            return {
              messaging_product: 'whatsapp' as const,
              id: mediaId,
              url: 'https://lookaside.example.com/media',
              mime_type: 'image/jpeg',
              sha256: 'digest',
              file_size: 3,
            }
          },
          download: async () => ({
            data: new Uint8Array([1, 2, 3]),
            contentType: 'image/jpeg',
            contentLength: 3,
            contentDisposition: null,
          }),
        }),
        fileStore: { put: async () => undefined },
      },
    )

    assert.deepEqual(requestedMediaIds, ['standby-media-id'])
    assert.equal(result.has('wamid.standby-media'), true)
  })

  it('does no credential lookup when the webhook has no media', async () => {
    let lookedUpChannel = false
    const result = await archiveWhatsAppWebhookMedia(42, textWebhook(), {
      findChannel: async () => {
        lookedUpChannel = true
        return undefined
      },
    })

    assert.equal(result.size, 0)
    assert.equal(lookedUpChannel, false)
  })

  it('stores media when webhook, metadata, and downloaded bytes have different digests', async () => {
    const puts: Uint8Array[] = []
    const data = new Uint8Array([1, 2, 3])

    const result = await archiveWhatsAppWebhookMedia(
      42,
      imageWebhook('webhook-digest'),
      {
        findChannel: async () => ({
          waPhoneNumberId: 'phone-id',
          waSystemUserAccessToken: 'access-token',
        }),
        createMediaClient: () => ({
          getMediaUrl: async () => ({
            messaging_product: 'whatsapp' as const,
            id: 'media-id',
            url: 'https://lookaside.example.com/media',
            mime_type: 'image/jpeg',
            sha256: 'metadata-digest',
            file_size: data.byteLength,
          }),
          download: async () => ({
            data,
            contentType: 'image/jpeg',
            contentLength: data.byteLength,
            contentDisposition: null,
          }),
        }),
        fileStore: {
          put: async (_path, body) => {
            puts.push(body)
          },
        },
      },
    )

    assert.equal(result.has('wamid.media'), true)
    assert.deepEqual(puts, [data])
  })
})

describe('WhatsApp media paths', () => {
  it('maps supported MIME types and falls back safely', () => {
    assert.equal(extensionForMimeType('audio/ogg; codecs=opus'), 'ogg')
    assert.equal(extensionForMimeType('application/pdf'), 'pdf')
    assert.equal(extensionForMimeType('application/x-custom'), 'bin')
    assert.equal(extensionForMimeType(undefined), 'bin')
  })

  it('is stable for the same channel, message, and media identity', () => {
    assert.equal(
      createWhatsAppMediaFilePath(42, 'message', 'media', 'video/mp4'),
      createWhatsAppMediaFilePath(42, 'message', 'media', 'video/mp4'),
    )
  })
})

function imageWebhook(sha256: string): WhatsAppWebhook {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba-id',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '15550001111',
                phone_number_id: 'phone-id',
              },
              messages: [
                {
                  from: '15550002222',
                  id: 'wamid.media',
                  timestamp: '1700000000',
                  type: 'image',
                  image: {
                    id: 'media-id',
                    mime_type: 'image/jpeg',
                    sha256,
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  }
}

function textWebhook(): WhatsAppWebhook {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba-id',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '15550001111',
                phone_number_id: 'phone-id',
              },
              messages: [
                {
                  from: '15550002222',
                  id: 'wamid.text',
                  timestamp: '1700000000',
                  type: 'text',
                  text: { body: 'hello' },
                },
              ],
            },
          },
        ],
      },
    ],
  }
}

function standbyImageWebhook(): WhatsAppWebhook {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba-id',
        changes: [
          {
            field: 'standby',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '15550001111',
                phone_number_id: 'phone-id',
              },
              standby: {
                contacts: [{ wa_id: '15550002222' }],
                messages: [
                  {
                    from: '15550002222',
                    id: 'wamid.standby-media',
                    timestamp: '1700000000',
                    type: 'image',
                    image: {
                      id: 'standby-media-id',
                      mime_type: 'image/jpeg',
                      sha256: 'digest',
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    ],
  }
}
