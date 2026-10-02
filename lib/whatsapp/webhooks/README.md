# `@mba-demo/wa-webhooks`

This package is the shared validation and type boundary for WhatsApp Cloud API
webhooks. It preserves additive provider fields while using discriminated
unions wherever Meta publishes stable tags, allowing ingestion to remain both
typed and lossless.

Import all webhook schemas and inferred types from `@mba-demo/wa-webhooks`.
Outbound request and response contracts belong to
[`@mba-demo/wa-messaging`](../messaging/README.md).

The root export is `whatsappWebhookSchema`. Its `entry[].changes` value is
discriminated by `field`, and incoming messages are discriminated by message
`type`. Observed Meta Business AI traffic uses `field: standby` with contacts,
messages, message echoes, or statuses nested under `value.standby`.

The observed `messaging_handovers` value is a single `control_passed` callback
with `recipient`, `sender`, and ownership roles under `control_passed`; it is
not an array and does not use the standard `metadata` shape. These objects stay
loose around their stable routing fields so additive Business Agent properties
remain lossless.

The `account_settings_update` subscription is accepted as a typed webhook
envelope with a lossless value object because Meta does not publish a stable,
closed payload schema for every account setting change.

In the captured Business AI flow, nested `standby.statuses` entries reuse the
outbound `standby.message_echoes` message ID. Its `read` status therefore means
the customer read the agent response; no captured status acknowledged that the
agent read the customer's inbound message.

All component schemas and inferred TypeScript types are exported from the
package root.

## Verification

```bash
yarn workspace @mba-demo/wa-webhooks typecheck
yarn workspace @mba-demo/wa-webhooks build
```
