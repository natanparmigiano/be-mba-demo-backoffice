# WhatsApp Flows

`@mba-desk/wa-flows` is the typed WhatsApp Flows management client. It covers
the complete Flow-owned lifecycle represented by Meta's checked-in Cloud API
collection:

- create or clone a Flow;
- list and retrieve Flows with field selection and cursor pagination;
- update Flow metadata and upload or inspect the `flow.json` asset;
- generate or invalidate preview links;
- publish, deprecate, or delete eligible Flows;
- migrate selected or all Flows between WABAs;
- retrieve all documented endpoint metric types; and
- get or set the phone-number-scoped endpoint encryption public key.

Sending a Flow message is intentionally owned by `@mba-desk/wa-messaging`; this
package manages the Flow resource itself.

## Usage

```ts
import { createWhatsAppFlowsClient } from '@mba-desk/wa-flows'

const flows = createWhatsAppFlowsClient({
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN!,
  wabaId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID!,
})

const created = await flows.create({
  name: 'Book an appointment',
  categories: ['APPOINTMENT_BOOKING'],
  endpoint_uri: 'https://example.com/whatsapp/flows',
})

const uploaded = await flows.uploadJson(created.id, {
  file: new Blob([JSON.stringify(flowDocument)], {
    type: 'application/json',
  }),
})

if (uploaded.validation_errors.length === 0) {
  await flows.publish(created.id)
}
```

## Lifecycle constraints

Publishing is irreversible and makes the Flow and its assets immutable. Clone
the published Flow to create an editable successor. Only published Flows can be
deprecated, and only draft Flows can be deleted. Deprecation is irreversible.

`uploadJson()` always sends the asset name `flow.json` and asset type
`FLOW_JSON`; callers should inspect every returned validation error before
publishing. Preview links expire, and `getPreview({ invalidate: true })`
invalidates the previous link.

Endpoint encryption is scoped to a business phone number, so encryption methods
accept a `phoneNumberId` separately from the client's WABA ID.

The default endpoint is Graph API `v26.0`; callers can pin another supported
version or inject a test proxy/fetch implementation. All network activity is
lazy and every method accepts an `AbortSignal`.

Non-2xx responses throw `WhatsAppFlowsApiError`, preserving structured Graph
error details. Invalid successful responses throw `WhatsAppFlowsResponseError`.
