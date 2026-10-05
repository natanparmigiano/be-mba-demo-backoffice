# WhatsApp webhook subscriptions

`@mba-demo/wa-subscriptions` is the typed WhatsApp Business Management API
client for managing an application's webhook subscription to a WhatsApp
Business Account (WABA).

It covers every operation in the checked-in `Webhook Subscriptions` collection:

- register an app-level WhatsApp Business Account callback and event fields;
- subscribe the app to a WABA;
- list apps subscribed to the WABA;
- override the callback URL and verification token for that WABA; and
- unsubscribe the app from the WABA.

One subscription covers webhook events for every phone number under the WABA.
The access token requires the `whatsapp_business_management` permission.
Register the app-level webhook first, then subscribe the app to each WABA, in
that order.

## Usage

```ts
import {
  createWhatsAppSubscriptionsClient,
  createWhatsAppWebhookRegistrationClient,
  WHATSAPP_WEBHOOK_SUBSCRIPTION_FIELDS,
} from '@mba-demo/wa-subscriptions'

const registration = createWhatsAppWebhookRegistrationClient({
  appId: process.env.WHATSAPP_APP_ID!,
  appSecret: process.env.WHATSAPP_APP_SECRET!,
})

await registration.register({
  callbackUrl: 'https://app.example.com/api/wa-cloud/webhook/42',
  verifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN!,
  fields: WHATSAPP_WEBHOOK_SUBSCRIPTION_FIELDS,
})

const appSubscriptions = await registration.list()
const registeredFields = appSubscriptions.data.flatMap((subscription) =>
  subscription.fields.map((field) => field.name),
)

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

The registration client submits URL-encoded form data to
`/<APP_ID>/subscriptions` using the app access token
`<APP_ID>|<APP_SECRET>`; it does not use the system-user access token. Meta's
app access token is sent only in the form body, preventing the app secret from
appearing in URLs and intermediary request logs. The request body uses the
platform `URLSearchParams` serializer for standard form encoding.
`WHATSAPP_WEBHOOK_SUBSCRIPTION_FIELDS` covers every field currently parsed by
`@mba-demo/wa-webhooks`, including `messages` (which also carries message
status updates), business/account updates, `standby`, `message_echoes`, and
`smb_message_echoes`.

`register()` accepts any non-empty subset of those fields. `list()` reads the
app-level subscriptions and returns each registered callback plus its field
names and Graph API versions. `MBA_WEBHOOK_SUBSCRIPTION_FIELDS` is the exact
field set used when the backoffice registers its app-level callback. It covers
messages, calls, handovers, account and business status, Flows, template
components/quality/status/category events, phone-number quality/name events,
standby traffic, and template correct-category detection.

## Verification

```bash
yarn workspace @mba-demo/wa-subscriptions typecheck
yarn workspace @mba-demo/wa-subscriptions test
yarn workspace @mba-demo/wa-subscriptions build
```
