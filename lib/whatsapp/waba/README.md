# WhatsApp Business Accounts

`@mba-demo/wa-waba` is the typed Graph API client for discovering and reading
WhatsApp Business Accounts (WABAs).

It covers every endpoint in the checked-in `WhatsApp Business Accounts
(WABAs)` collection folder:

- retrieve one WABA by ID;
- list WABAs owned by a Meta business; and
- list client WABAs shared with a Meta business.

## Usage

```ts
import { createWhatsAppWabaClient } from '@mba-demo/wa-waba'

const wabas = createWhatsAppWabaClient({
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN!,
})

const account = await wabas.get('104996122399160')

const owned = await wabas.listOwned('business-id', { limit: 100 })
const shared = await wabas.listShared('business-id')
```

`listOwned()` calls `/{business-id}/owned_whatsapp_business_accounts`, while
`listShared()` calls `/{business-id}/client_whatsapp_business_accounts`.
Both expose `limit`, `before`, and `after` pagination options.

## Operational notes

The access token must be authorized to inspect the requested business or WABA
and normally requires `whatsapp_business_management`. Graph API IDs are exposed
as strings even when an upstream response encodes an ID as a safe JSON number.

The default endpoint is Graph API `v26.0`; set `graphApiVersion` to pin another
supported release and `graphApiBaseUrl` for a test proxy. The client performs no
I/O until a method is called, and every method accepts an `AbortSignal`.

Non-2xx responses throw `WhatsAppWabaApiError`, preserving structured Graph API
error fields. Invalid successful responses throw `WhatsAppWabaResponseError`.
Access tokens are never included in errors.

## Verification

```bash
yarn workspace @mba-demo/wa-waba typecheck
yarn workspace @mba-demo/wa-waba test
yarn workspace @mba-demo/wa-waba build
```
