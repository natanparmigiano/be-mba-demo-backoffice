# WhatsApp webhook subscriptions

`@mba-demo/wa-subscriptions` is the typed WhatsApp Business Management API
client for managing an application's webhook subscription to a WhatsApp
Business Account (WABA).

It covers every operation in the checked-in `Webhook Subscriptions` collection:

- subscribe the app to a WABA;
- list apps subscribed to the WABA;
- override the callback URL and verification token for that WABA; and
- unsubscribe the app from the WABA.

One subscription covers webhook events for every phone number under the WABA.
The access token requires the `whatsapp_business_management` permission.

## Usage

```ts
import { createWhatsAppSubscriptionsClient } from '@mba-demo/wa-subscriptions'

const subscriptions = createWhatsAppSubscriptionsClient({
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN!,
  wabaId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID!,
})

await subscriptions.subscribe()

const current = await subscriptions.list()

await subscriptions.overrideCallback({
  override_callback_uri: 'https://app.example.com/api/wa-cloud/webhook/42',
  verify_token: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN!,
})

await subscriptions.unsubscribe()
```

## Operational notes

The default endpoint is Graph API `v26.0`; set `graphApiVersion` to pin another
supported release and `graphApiBaseUrl` when using a test proxy. The client
performs no I/O until a method is called, and every method accepts an
`AbortSignal`.

`overrideCallback()` accepts only HTTP or HTTPS callback URLs. Access and
verification tokens are never included in errors. Non-2xx responses throw
`WhatsAppSubscriptionsApiError`, preserving structured Graph API error fields;
invalid successful responses throw `WhatsAppSubscriptionsResponseError`.

## Verification

```bash
yarn workspace @mba-demo/wa-subscriptions typecheck
yarn workspace @mba-demo/wa-subscriptions test
yarn workspace @mba-demo/wa-subscriptions build
```
