# WhatsApp conversational components

`@mba-demo/wa-components` is the typed WhatsApp Business Management API client
for conversational automation attached to a business phone number. It manages
icebreakers (called `prompts` by Meta) and commands.

It covers Meta's two configuration operations:

- get the current commands and icebreaker prompts; and
- set either or both component types. An empty array clears that type.

## Usage

```ts
import { createWhatsAppComponentsClient } from '@mba-demo/wa-components'

const components = createWhatsAppComponentsClient({
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN!,
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID!,
})

await components.setConfiguration({
  prompts: ['Track my order', 'Show me current offers'],
  commands: [
    {
      command_name: 'shipping_options',
      command_description: 'Show available shipping options',
    },
  ],
})

const current = await components.getConfiguration()
await components.setConfiguration({ prompts: ['Talk to sales'] })
await components.setConfiguration({ commands: [] })
```

When Meta returns an empty collection because no components have been
configured yet, `get()` returns an empty object. This lets callers present the
initial creation experience without treating the valid empty state as an API
failure.

`getConfiguration()` reads the `conversational_automation` field on the phone
number. `setConfiguration()` uses Meta's `conversational_automation` POST edge.
Include only the component fields that should be written; empty arrays are
preserved to clear that component type. The client validates Meta's documented
limits: up to 4 prompts of 80 characters and up to 30 commands with
32-character names and 256-character descriptions.

## Operational notes

The access token must be authorized for the configured phone number and
normally requires `whatsapp_business_management`. The default endpoint is
Graph API `v26.0`; set `graphApiVersion` to pin another supported release and
`graphApiBaseUrl` for a test proxy. Construction performs no network I/O, and
every method accepts an `AbortSignal`.

Non-2xx responses throw `WhatsAppComponentsApiError`, preserving structured
Graph API error fields. Invalid successful responses throw
`WhatsAppComponentsResponseError`. Access tokens are never included in errors.

## Verification

```bash
yarn workspace @mba-demo/wa-components typecheck
yarn workspace @mba-demo/wa-components test
yarn workspace @mba-demo/wa-components build
```
