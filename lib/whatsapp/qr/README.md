# WhatsApp QR codes

`@mba-demo/wa-qr` is the typed WhatsApp Business Management API client for
message QR codes attached to a business phone number.

It covers every endpoint in the checked-in `QR codes` collection folder:

- create a message QR code, optionally generating an SVG or PNG image;
- retrieve one QR code or its generated image URL;
- list QR codes with field selection, image format, and cursor pagination;
- update the prefilled message; and
- delete a QR code.

## Usage

```ts
import { createWhatsAppQrClient } from '@mba-demo/wa-qr'

const qr = createWhatsAppQrClient({
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN!,
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID!,
})

const created = await qr.create({
  prefilled_message: 'Show me your new offers!',
  generate_qr_image: 'SVG',
})

const image = await qr.getImageUrl(created.code, 'PNG')
const all = await qr.list({ imageFormat: 'SVG', limit: 100 })

await qr.update(created.code, {
  prefilled_message: 'Tell me about your current offers!',
})
await qr.delete(created.code)
```

`get()` uses the QR-code node endpoint. `getImageUrl()` uses the collection's
`code` filter and requests `qr_image_url.format(PNG|SVG)`. `list()` always
includes `code` when selecting fields so every returned item remains
addressable. The client accepts uppercase image-format values consistently and
serializes the create endpoint's `generate_qr_image` value as lowercase, as
required by the live Graph API.

## Operational notes

The access token must be authorized for the configured phone number and
normally requires `whatsapp_business_management`. Generated image URLs point to
Meta's CDN and should be treated as provider-managed URLs rather than durable
application storage.

The default endpoint is Graph API `v26.0`; set `graphApiVersion` to pin another
supported release and `graphApiBaseUrl` for a test proxy. Construction performs
no network I/O, and every method accepts an `AbortSignal`.

Non-2xx responses throw `WhatsAppQrApiError`, preserving structured Graph API
error fields. Invalid successful responses throw `WhatsAppQrResponseError`.
Access tokens are never included in errors.

## Verification

```bash
yarn workspace @mba-demo/wa-qr typecheck
yarn workspace @mba-demo/wa-qr test
yarn workspace @mba-demo/wa-qr build
```
