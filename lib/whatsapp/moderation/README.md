# WhatsApp user moderation

`@mba-desk/wa-moderation` is the typed WhatsApp Cloud API client for managing a
business phone number's blocked users.

Meta's current Block Users API exposes three operations, all covered here:

- list blocked users with cursor pagination;
- block up to 1,000 users in one request; and
- unblock up to 1,000 users in one request.

No additional user-moderation command is documented. The canonical reference
is Meta's [Block Users guide](https://developers.facebook.com/docs/whatsapp/cloud-api/block-users),
and the corresponding request examples are checked in under
`WhatsApp Cloud API/Block Users`.

## Usage

```ts
import { createWhatsAppModerationClient } from '@mba-desk/wa-moderation'

const moderation = createWhatsAppModerationClient({
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN!,
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID!,
})

await moderation.block(['+16505551234', '+14155559876'])

const firstPage = await moderation.list({ limit: 100 })
const nextPage = firstPage.paging?.cursors?.after
  ? await moderation.list({ after: firstPage.paging.cursors.after })
  : undefined

await moderation.unblock(['+16505551234'])
```

## API constraints

- A user can be blocked only after messaging the business within the previous
  24 hours.
- Another WhatsApp Business account cannot be blocked.
- A mutation accepts at most 1,000 users, and the blocklist holds at most
  64,000 users.
- Bulk operations are synchronous but can partially succeed. Inspect
  `failed_users` and the optional top-level `error` even when the HTTP response
  is successful.

The default endpoint is Graph API `v26.0`; set `graphApiVersion` to pin another
supported release and `graphApiBaseUrl` for a test proxy. Every operation
accepts an `AbortSignal`.

Non-2xx responses throw `WhatsAppModerationApiError`, preserving structured
Graph API error fields. Invalid successful responses throw
`WhatsAppModerationResponseError`. Access tokens are never included in errors.

## Verification

```bash
yarn workspace @mba-desk/wa-moderation typecheck
yarn workspace @mba-desk/wa-moderation test
yarn workspace @mba-desk/wa-moderation build
```
