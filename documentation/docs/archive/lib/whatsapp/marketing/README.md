# `@mba-desk/wa-marketing`

Typed client for Meta's Marketing Messages API for WhatsApp. It sends approved
marketing templates through the phone number's `marketing_messages` edge so
eligible messages receive Marketing Messages delivery optimization.

## Quick start

```ts
import { createWhatsAppMarketingClient } from '@mba-desk/wa-marketing'

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

## Troubleshooting

Confirm WABA eligibility, accepted terms, token permissions, and an approved
template before treating a send failure as a transport problem.

## Verification

```bash
yarn workspace @mba-desk/wa-marketing typecheck
yarn workspace @mba-desk/wa-marketing test
yarn workspace @mba-desk/wa-marketing build
```

## Related documentation

- [WhatsApp package guide](../README.md)
