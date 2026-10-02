# `@mba-demo/wa-marketing`

Typed client for Meta's Marketing Messages API for WhatsApp. It sends approved
marketing templates through the phone number's `marketing_messages` edge so
eligible messages receive Marketing Messages delivery optimization.

## Usage

```ts
import { createWhatsAppMarketingClient } from '@mba-demo/wa-marketing'

const marketing = createWhatsAppMarketingClient({
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN!,
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID!,
})

await marketing.send({
  to: '15551234567',
  template: {
    name: 'seasonal_sale',
    language: { code: 'en_US' },
    components: [{ type: 'body', parameters: [{ type: 'text', text: '20%' }] }],
  },
  product_policy: 'STRICT',
  message_activity_sharing: true,
})
```

The client defaults to Graph API `v26.0`, performs no network I/O during
construction, and accepts an `AbortSignal` in the final options argument.
`product_policy` supports `CLOUD_API_FALLBACK` and `STRICT`. The optional
`bid_spec.per_message_bid_multiplier` applies a positive multiplier to a
template-level maximum price when that feature is available to the business.

The access token needs the permissions and accepted terms required by Meta for
the selected phone number. A WABA must be eligible and onboarded before it can
send through this endpoint. Status webhooks identify these messages with the
`marketing_lite` pricing category and conversation origin.
