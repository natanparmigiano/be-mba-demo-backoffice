# `@mba-demo/schemas`

Reusable application schemas. WhatsApp Cloud API webhook schemas are exported
from `@mba-demo/schemas/wa-cloud/webhooks`.

Outbound WhatsApp message request and response schemas are exported from
`@mba-demo/schemas/wa-cloud/messages`. They cover text, media, contacts,
location, reaction, template, and interactive list, button, product, catalog,
and Flow messages represented in the checked-in Cloud API collection.

The root export is `whatsappWebhookSchema`. Its `entry[].changes` value is
discriminated by `field`, and incoming `messages` and Meta Business AI
`standby` items are discriminated by message `type`.

The `messaging_handovers` value has typed routing, identity, ownership, agent,
and correlation fields while remaining a loose object for additive Business
Agents properties. This keeps handover and agent-event ingestion lossless
without pretending Meta publishes a closed event taxonomy.

All component schemas and inferred TypeScript types are exported from the
package root. Objects preserve additional properties so additive Graph API
changes do not discard data.
