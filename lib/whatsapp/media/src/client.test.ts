import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createWhatsAppMediaClient,
  MEDIA_SIZE_LIMIT_BYTES,
  WhatsAppMediaApiError,
  WhatsAppMediaResponseError,
} from './index.js'
import type { Fetch } from './index.js'

interface RecordedRequest {
  input: string | URL | Request
  init?: RequestInit
}

function recordingFetch(response: Response) {
  const requests: RecordedRequest[] = []
  const fetch: Fetch = (input, init) => {
    requests.push({ input, init })
    return Promise.resolve(response.clone())
  }
  return { fetch, requests }
}

function requestUrl(input: string | URL | Request): string {
  if (typeof input === 'string') return input
  return input instanceof URL ? input.href : input.url
}

function requestForm(request: RecordedRequest | undefined): FormData {
  const body = request?.init?.body
  if (!(body instanceof FormData)) {
    throw new TypeError('Expected a multipart form body')
  }
  return body
}

describe('WhatsAppMediaClient', () => {
  it('uploads every supported media category as multipart form data', async () => {
    const { fetch, requests } = recordingFetch(
      new Response(JSON.stringify({ id: 'media-id' }), { status: 200 }),
    )
    const client = createWhatsAppMediaClient({
      accessToken: 'test-token',
      phoneNumberId: 'phone/id',
      graphApiVersion: 'v26.0',
      fetch,
    })

    await client.uploadAudio({
      file: new Blob(['audio']),
      filename: 'audio.ogg',
      mimeType: 'audio/ogg',
    })
    await client.uploadDocument({
      file: new Blob(['document']),
      filename: 'document.pdf',
      mimeType: 'application/pdf',
    })
    await client.uploadImage({
      file: new Blob(['image']),
      filename: 'image.jpg',
      mimeType: 'image/jpeg',
    })
    await client.uploadSticker({
      file: new Blob(['sticker']),
      filename: 'sticker.webp',
      mimeType: 'image/webp',
    })
    await client.uploadVideo({
      file: new Blob(['video']),
      filename: 'video.mp4',
      mimeType: 'video/mp4',
    })

    assert.equal(requests.length, 5)
    const expected = [
      ['audio.ogg', 'audio/ogg'],
      ['document.pdf', 'application/pdf'],
      ['image.jpg', 'image/jpeg'],
      ['sticker.webp', 'image/webp'],
      ['video.mp4', 'video/mp4'],
    ]
    requests.forEach((request, index) => {
      assert.equal(
        requestUrl(request.input),
        'https://graph.facebook.com/v26.0/phone%2Fid/media',
      )
      assert.equal(request.init?.method, 'POST')
      assert.deepEqual(request.init?.headers, {
        authorization: 'Bearer test-token',
      })
      const form = requestForm(request)
      assert.equal(form.get('messaging_product'), 'whatsapp')
      const file = form.get('file')
      assert.ok(file instanceof Blob)
      assert.equal(file.type, expected[index]?.[1])
      assert.equal(file.name, expected[index]?.[0])
    })
  })

  it('retrieves a phone-number-scoped media URL', async () => {
    const metadata = {
      messaging_product: 'whatsapp',
      url: 'https://lookaside.fbsbx.com/media',
      mime_type: 'image/jpeg',
      sha256: 'hash',
      file_size: '303833',
      id: 'media-id',
    }
    const { fetch, requests } = recordingFetch(
      new Response(JSON.stringify(metadata), { status: 200 }),
    )
    const client = createWhatsAppMediaClient({
      accessToken: 'test-token',
      phoneNumberId: 'phone-id',
      graphApiBaseUrl: 'http://graph.test/custom',
      fetch,
    })

    assert.deepEqual(await client.getMediaUrl('media/id'), metadata)
    assert.equal(
      requestUrl(requests[0]!.input),
      'http://graph.test/custom/v26.0/media%2Fid?phone_number_id=phone-id',
    )
    assert.equal(requests[0]?.init?.method, 'GET')
  })

  it('downloads binary media directly from the temporary media URL', async () => {
    const bytes = Uint8Array.from([0, 1, 2, 255])
    const { fetch, requests } = recordingFetch(
      new Response(bytes, {
        status: 200,
        headers: {
          'content-type': 'image/jpeg',
          'content-length': String(bytes.byteLength),
          'content-disposition': 'attachment; filename="photo.jpg"',
        },
      }),
    )
    const client = createWhatsAppMediaClient({
      accessToken: 'test-token',
      phoneNumberId: 'phone-id',
      fetch,
    })
    const controller = new AbortController()

    const result = await client.download(
      'https://lookaside.fbsbx.com/media?token=temporary',
      { signal: controller.signal },
    )

    assert.deepEqual(result.data, bytes)
    assert.equal(result.contentType, 'image/jpeg')
    assert.equal(result.contentLength, 4)
    assert.equal(result.contentDisposition, 'attachment; filename="photo.jpg"')
    assert.equal(
      requestUrl(requests[0]!.input),
      'https://lookaside.fbsbx.com/media?token=temporary',
    )
    assert.equal(requests[0]?.init?.signal, controller.signal)
    assert.deepEqual(requests[0]?.init?.headers, {
      authorization: 'Bearer test-token',
    })
  })

  it('deletes media with the ownership guard', async () => {
    const { fetch, requests } = recordingFetch(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    )
    const client = createWhatsAppMediaClient({
      accessToken: 'test-token',
      phoneNumberId: 'phone-id',
      fetch,
    })

    assert.deepEqual(await client.delete('media-id'), { success: true })
    assert.equal(
      requestUrl(requests[0]!.input),
      'https://graph.facebook.com/v26.0/media-id?phone_number_id=phone-id',
    )
    assert.equal(requests[0]?.init?.method, 'DELETE')
  })

  it('enforces the media limits documented by the collection', async () => {
    const { fetch, requests } = recordingFetch(
      new Response(JSON.stringify({ id: 'media-id' }), { status: 200 }),
    )
    const client = createWhatsAppMediaClient({
      accessToken: 'test-token',
      phoneNumberId: 'phone-id',
      fetch,
    })
    const oversizedSticker = new Blob([
      new Uint8Array(MEDIA_SIZE_LIMIT_BYTES.sticker + 1),
    ])

    await assert.rejects(
      client.uploadSticker({
        file: oversizedSticker,
        filename: 'sticker.webp',
        mimeType: 'image/webp',
      }),
      RangeError,
    )
    assert.equal(requests.length, 0)
  })

  it('surfaces structured Graph API errors for JSON and binary operations', async () => {
    const response = new Response(
      JSON.stringify({
        error: {
          message: 'Media not found',
          type: 'OAuthException',
          code: 100,
          error_subcode: 33,
          fbtrace_id: 'trace-id',
        },
      }),
      { status: 404, headers: { 'content-type': 'application/json' } },
    )
    const { fetch } = recordingFetch(response)
    const client = createWhatsAppMediaClient({
      accessToken: 'test-token',
      phoneNumberId: 'phone-id',
      fetch,
    })

    for (const operation of [
      client.getMediaUrl('missing'),
      client.download('https://lookaside.fbsbx.com/missing'),
    ]) {
      await assert.rejects(operation, (error: unknown) => {
        assert.ok(error instanceof WhatsAppMediaApiError)
        assert.equal(error.message, 'Media not found')
        assert.equal(error.status, 404)
        assert.equal(error.code, 100)
        assert.equal(error.subcode, 33)
        assert.equal(error.errorType, 'OAuthException')
        assert.equal(error.traceId, 'trace-id')
        return true
      })
    }
  })

  it('rejects malformed successful responses and invalid configuration', async () => {
    const { fetch } = recordingFetch(
      new Response(JSON.stringify({ id: 123 }), { status: 200 }),
    )
    const client = createWhatsAppMediaClient({
      accessToken: 'test-token',
      phoneNumberId: 'phone-id',
      fetch,
    })

    await assert.rejects(
      client.uploadImage({
        file: new Blob(['image']),
        filename: 'image.jpg',
        mimeType: 'image/jpeg',
      }),
      WhatsAppMediaResponseError,
    )
    await assert.rejects(
      client.download('file:///tmp/media'),
      /mediaUrl must use http or https/,
    )
    assert.throws(
      () =>
        createWhatsAppMediaClient({
          accessToken: '',
          phoneNumberId: 'phone-id',
        }),
      /accessToken must not be empty/,
    )
    assert.throws(
      () =>
        createWhatsAppMediaClient({
          accessToken: 'token',
          phoneNumberId: 'phone-id',
          graphApiVersion: '26',
        }),
      /graphApiVersion must use the form v26\.0/,
    )
  })
})
