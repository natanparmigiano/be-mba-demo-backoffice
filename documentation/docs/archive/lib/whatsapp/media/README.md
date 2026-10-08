# WhatsApp media

`@mba-desk/wa-media` is the typed WhatsApp Cloud API client for media lifecycle
operations. It covers the media endpoints represented in the checked-in Cloud
API collection:

- upload media with `POST /{phone-number-id}/media`;
- retrieve metadata and a temporary URL with `GET /{media-id}`;
- download bytes from the temporary media URL; and
- delete media with `DELETE /{media-id}`.

The client supports audio, document, image, sticker, and video uploads. MIME
types and the upload size limits are typed from the collection's supported-media
table. Audio codec and video stream restrictions cannot be checked from a
`Blob`; callers remain responsible for encoding files in a format accepted by
WhatsApp.

## Quick start

```ts
import { createWhatsAppMediaClient } from '@mba-desk/wa-media'

const media = createWhatsAppMediaClient({
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN!,
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID!,
})

const upload = await media.uploadImage({
  file: imageBlob,
  filename: 'receipt.jpg',
  mimeType: 'image/jpeg',
})

const metadata = await media.getMediaUrl(upload.id)
const downloaded = await media.download(metadata.url)
await media.delete(upload.id)
```

`getMediaUrl()` and `delete()` always send `phone_number_id`, using Meta's
ownership check to ensure the media belongs to the configured business phone
number. Retrieved URLs expire after five minutes and `download()` sends the
access token required by Meta.

The default endpoint is Graph API `v26.0`. Callers can set `graphApiVersion` to
pin another supported version and `graphApiBaseUrl` for a test proxy. The client
performs no I/O until an operation is called and supports an `AbortSignal` on
every operation.

Non-2xx responses throw `WhatsAppMediaApiError`, preserving the HTTP status and
structured Graph API error fields. Invalid successful JSON responses throw
`WhatsAppMediaResponseError`.

## Troubleshooting

Retrieved URLs expire after five minutes and still require authorization.
Fetch a new URL rather than persisting it.

## Verification

```bash
yarn workspace @mba-desk/wa-media typecheck
yarn workspace @mba-desk/wa-media test
yarn workspace @mba-desk/wa-media build
```

## Related documentation

- [WhatsApp package guide](../README.md)
